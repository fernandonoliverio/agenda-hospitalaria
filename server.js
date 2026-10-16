require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const { randomUUID, createHmac, timingSafeEqual } = require('crypto');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const {
  run,
  initDatabase,
  loginUser,
  getPatients,
  getPatientById,
  addPatient,
  updatePatient,
  deletePatient,
  clearPatients,
  getDeletedPatients,
  restorePatient
} = require('./src/db');
const { parseCsvText, normalizePatientImport, toCsvText } = require('./src/importExport');
const { buildBackupPayload, normalizeBackupPayload } = require('./src/backup');
const { upload, mapCloudinaryFileToAttachment } = require('./src/upload');

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const uploadsDir = path.resolve(process.env.HOSPI_UPLOADS_DIR || path.join(__dirname, 'uploads'));
const SESSION_COOKIE = 'hospi_session';
const SESSION_DURATION_SECONDS = 8 * 60 * 60;
const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : randomUUID());

fs.mkdirSync(uploadsDir, { recursive: true });

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || smtpUser;
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFrom = process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_FROM;
const hasSmtpConfig = Boolean(smtpHost && smtpUser && smtpPass);
const hasTwilioConfig = Boolean(twilioAccountSid && twilioAuthToken && twilioFrom);

function createSessionToken(username) {
  const payload = Buffer.from(JSON.stringify({
    username,
    expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000
  })).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function isValidSessionToken(token) {
  if (!SESSION_SECRET || !token) return false;
  const separator = token.lastIndexOf('.');
  if (separator < 1) return false;

  const payload = token.slice(0, separator);
  const suppliedSignature = Buffer.from(token.slice(separator + 1), 'base64url');
  const expectedSignature = createHmac('sha256', SESSION_SECRET).update(payload).digest();
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) {
    return false;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Boolean(session.username && session.expiresAt > Date.now());
  } catch (error) {
    return false;
  }
}

function requireSession(req, res, next) {
  const cookies = String(req.headers.cookie || '').split(';');
  const sessionCookie = cookies.find((cookie) => cookie.trim().startsWith(`${SESSION_COOKIE}=`));
  const token = sessionCookie ? sessionCookie.trim().slice(SESSION_COOKIE.length + 1) : '';

  if (!isValidSessionToken(token)) {
    return res.status(401).json({ message: 'La sesión venció o no es válida.' });
  }
  return next();
}

function sessionCookie(token, maxAge = SESSION_DURATION_SECONDS) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function formatReminderText(patient) {
  return `Estimado/a ${patient.nombre} ${patient.apellido}:

Este es un recordatorio de su turno programado para el ${patient.fechaTurno} a las ${patient.horaTurno}.
Diagnóstico: ${patient.diagnostico}
Médico: ${patient.medico}
Obra social: ${patient.obraSocial || 'No indicada'}

Muchas gracias.`;
}

async function sendEmailReminder(patient) {
  if (!hasSmtpConfig) {
    console.log(`[SIMULADO] Email para ${patient.mail}: ${formatReminderText(patient)}`);
    return { ok: true, simulated: true, channel: 'email' };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const info = await transporter.sendMail({
    from: smtpFrom,
    to: patient.mail,
    subject: 'Recordatorio de turno',
    text: formatReminderText(patient)
  });

  return { ok: true, simulated: false, channel: 'email', messageId: info.messageId };
}

async function sendWhatsAppReminder(patient) {
  if (!hasTwilioConfig) {
    console.log(`[SIMULADO] WhatsApp para ${patient.telefono}: ${formatReminderText(patient)}`);
    return { ok: true, simulated: true, channel: 'whatsapp' };
  }

  const cleanPhone = String(patient.telefono || '').replace(/\D/g, '');
  if (!cleanPhone) {
    return { ok: false, simulated: false, channel: 'whatsapp', error: 'Número de teléfono vacío' };
  }

  const normalizedPhone = cleanPhone.startsWith('54') ? cleanPhone : `54${cleanPhone.replace(/^0+/, '')}`;
  const to = `whatsapp:+${normalizedPhone}`;
  const client = twilio(twilioAccountSid, twilioAuthToken);
  const message = await client.messages.create({
    body: `Recordatorio de turno: ${patient.nombre} ${patient.apellido}. Fecha ${patient.fechaTurno} a las ${patient.horaTurno}. Diagnóstico: ${patient.diagnostico}.`,
    from: twilioFrom,
    to
  });

  return { ok: true, simulated: false, channel: 'whatsapp', sid: message.sid };
}

app.use(express.json({ limit: '20mb' }));
app.use('/uploads', requireSession, express.static(uploadsDir));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Servidor funcionando' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ message: 'Faltan credenciales.' });
  }

  const valid = await loginUser(username, password);
  if (!valid) {
    return res.status(401).json({ message: 'Usuario o contraseña incorrectos.' });
  }

  res.setHeader('Set-Cookie', sessionCookie(createSessionToken(username)));
  return res.json({ ok: true, user: { username } });
});

app.post('/api/logout', requireSession, (req, res) => {
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  return res.json({ ok: true });
});

app.use('/api', requireSession);

app.get('/api/patients', async (req, res) => {
  try {
    const patients = await getPatients();
    res.json(patients);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudieron obtener los pacientes.' });
  }
});

app.get('/api/deleted-patients', async (req, res) => {
  try {
    const patients = await getDeletedPatients();
    res.json(patients);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudieron obtener los pacientes eliminados.' });
  }
});

app.get('/api/patients/export', async (req, res) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    const patients = await getPatients();

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="agenda_pacientes.json"');
      return res.send(JSON.stringify(patients, null, 2));
    }

    const csv = toCsvText(patients);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="agenda_pacientes.csv"');
    return res.send(csv);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'No se pudo exportar la agenda.' });
  }
});

app.post('/api/patients/import', async (req, res) => {
  try {
    const csvText = String(req.body?.csv || '').trim();
    if (!csvText) {
      return res.status(400).json({ message: 'No se recibió contenido CSV para importar.' });
    }

    const rows = parseCsvText(csvText);
    if (!rows.length) {
      return res.status(400).json({ message: 'El archivo CSV no tiene registros válidos para importar.' });
    }

    const patients = rows.map((row) => normalizePatientImport(row));
    let imported = 0;

    for (const patient of patients) {
      await addPatient({
        ...patient,
        archivos: []
      });
      imported += 1;
    }

    return res.json({ ok: true, imported, total: patients.length, message: `${imported} pacientes importados correctamente.` });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: error.message || 'No se pudo importar la agenda.' });
  }
});

app.get('/api/backup', async (req, res) => {
  try {
    const patients = await getPatients();
    const deletedPatients = await getDeletedPatients();
    const payload = buildBackupPayload(patients, deletedPatients);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="hospi-backup.json"');
    return res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'No se pudo generar el backup.' });
  }
});

app.post('/api/backup/restore', async (req, res) => {
  try {
    const payload = normalizeBackupPayload(req.body || {});
    if (!payload.patients && !payload.deletedPatients) {
      return res.status(400).json({ message: 'El archivo de backup no es válido.' });
    }

    await clearPatients();

    for (const patient of payload.patients) {
      const normalizedPatient = {
        ...patient,
        id: patient.id || randomUUID(),
        archivos: Array.isArray(patient.archivos) ? patient.archivos : [],
        recordatorioWsp: Boolean(patient.recordatorioWsp),
        recordatorioMail: Boolean(patient.recordatorioMail)
      };
      await addPatient(normalizedPatient);
    }

    for (const patient of payload.deletedPatients) {
      const normalizedPatient = {
        ...patient,
        id: patient.id || randomUUID(),
        archivos: Array.isArray(patient.archivos) ? patient.archivos : [],
        recordatorioWsp: Boolean(patient.recordatorioWsp),
        recordatorioMail: Boolean(patient.recordatorioMail)
      };
      await deletePatient(normalizedPatient.id).catch(() => undefined);
      await run(
        `INSERT OR REPLACE INTO deleted_patients (id, nombre, apellido, documento, obraSocial, diagnostico, medico, telefono, mail, fechaNacimiento, fechaTurno, horaTurno, observaciones, recordatorioWsp, recordatorioMail, asistio, archivos, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalizedPatient.id,
          normalizedPatient.nombre,
          normalizedPatient.apellido,
          normalizedPatient.documento,
          normalizedPatient.obraSocial,
          normalizedPatient.diagnostico,
          normalizedPatient.medico,
          normalizedPatient.telefono,
          normalizedPatient.mail,
          normalizedPatient.fechaNacimiento || '',
          normalizedPatient.fechaTurno,
          normalizedPatient.horaTurno,
          normalizedPatient.observaciones,
          normalizedPatient.recordatorioWsp ? 1 : 0,
          normalizedPatient.recordatorioMail ? 1 : 0,
          normalizedPatient.asistio ? 1 : 0,
          JSON.stringify(normalizedPatient.archivos || []),
          normalizedPatient.deletedAt || new Date().toISOString()
        ]
      );
    }

    return res.json({ ok: true, restored: payload.patients.length, deletedRestored: payload.deletedPatients.length, message: 'Backup restaurado correctamente.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message || 'No se pudo restaurar el backup.' });
  }
});

app.post('/api/patients/:id/restore', async (req, res) => {
  try {
    const restored = await restorePatient(req.params.id);
    if (!restored) {
      return res.status(404).json({ message: 'No se encontró el paciente eliminado.' });
    }

    return res.json({ ok: true, patient: restored });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'No se pudo restaurar el paciente.' });
  }
});

app.post('/api/patients', upload.array('archivos', 10), async (req, res) => {
  try {
    const patient = {
      id: req.body.id || randomUUID(),
      nombre: (req.body.nombre || '').trim(),
      apellido: (req.body.apellido || '').trim(),
      documento: (req.body.documento || '').trim(),
      obraSocial: (req.body.obraSocial || '').trim(),
      diagnostico: (req.body.diagnostico || '').trim(),
      medico: (req.body.medico || '').trim(),
      telefono: (req.body.telefono || '').trim(),
      mail: (req.body.mail || '').trim(),
      fechaNacimiento: (req.body.fechaNacimiento || '').trim(),
      fechaTurno: (req.body.fechaTurno || '').trim(),
      horaTurno: (req.body.horaTurno || '').trim(),
      observaciones: (req.body.observaciones || '').trim(),
      recordatorioWsp: req.body.recordatorioWsp === 'on' || req.body.recordatorioWsp === 'true' || req.body.recordatorioWsp === '1',
      recordatorioMail: req.body.recordatorioMail === 'on' || req.body.recordatorioMail === 'true' || req.body.recordatorioMail === '1',
      asistio: req.body.asistio === 'true' || req.body.asistio === '1' || req.body.asistio === 'on' || req.body.asistio === true,
      archivos: (req.files || []).map((file) => mapCloudinaryFileToAttachment(file))
    };

    if (!patient.nombre || !patient.apellido || !patient.documento || !patient.diagnostico || !patient.medico || !patient.telefono || !patient.mail || !patient.fechaTurno || !patient.horaTurno) {
      return res.status(400).json({ message: 'Faltan campos obligatorios.' });
    }

    const savedPatient = await addPatient(patient);
    return res.status(201).json(savedPatient);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'No se pudo guardar el paciente.' });
  }
});

app.put('/api/patients/:id', upload.array('archivos', 10), async (req, res) => {
  try {
    const existingPatient = await getPatientById(req.params.id);
    const uploadedFiles = (req.files || []).map((file) => mapCloudinaryFileToAttachment(file));

    const patient = {
      id: req.params.id,
      nombre: (req.body.nombre || '').trim(),
      apellido: (req.body.apellido || '').trim(),
      documento: (req.body.documento || '').trim(),
      obraSocial: (req.body.obraSocial || '').trim(),
      diagnostico: (req.body.diagnostico || '').trim(),
      medico: (req.body.medico || '').trim(),
      telefono: (req.body.telefono || '').trim(),
      mail: (req.body.mail || '').trim(),
      fechaNacimiento: (req.body.fechaNacimiento || '').trim(),
      fechaTurno: (req.body.fechaTurno || '').trim(),
      horaTurno: (req.body.horaTurno || '').trim(),
      observaciones: (req.body.observaciones || '').trim(),
      recordatorioWsp: req.body.recordatorioWsp === 'on' || req.body.recordatorioWsp === 'true' || req.body.recordatorioWsp === '1',
      recordatorioMail: req.body.recordatorioMail === 'on' || req.body.recordatorioMail === 'true' || req.body.recordatorioMail === '1',
      asistio: req.body.asistio === 'true' || req.body.asistio === '1' || req.body.asistio === 'on' || req.body.asistio === true,
      archivos: [...(existingPatient?.archivos || []), ...uploadedFiles]
    };

    if (!patient.nombre || !patient.apellido || !patient.documento || !patient.diagnostico || !patient.medico || !patient.telefono || !patient.mail || !patient.fechaTurno || !patient.horaTurno) {
      return res.status(400).json({ message: 'Faltan campos obligatorios.' });
    }

    const savedPatient = await updatePatient(patient);
    return res.json(savedPatient);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'No se pudo actualizar el paciente.' });
  }
});

app.delete('/api/patients/:id', async (req, res) => {
  try {
    await deletePatient(req.params.id);
    res.json({ ok: true, message: 'Paciente eliminado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo eliminar el paciente.' });
  }
});

app.delete('/api/patients', async (req, res) => {
  try {
    await clearPatients();
    res.json({ ok: true, message: 'Agenda vaciada.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo vaciar la agenda.' });
  }
});

app.post('/api/reminders/send', async (req, res) => {
  try {
    const daysAhead = Number(req.body?.daysAhead || 7);
    const today = new Date();
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + daysAhead);

    const patients = await getPatients();
    const upcoming = patients.filter((patient) => {
      if (!patient.fechaTurno) return false;
      const patientDate = new Date(`${patient.fechaTurno}T00:00:00`);
      return patientDate >= new Date(today.toDateString()) && patientDate <= maxDate;
    });

    const results = [];
    for (const patient of upcoming) {
      if (patient.recordatorioMail) {
        const result = await sendEmailReminder(patient);
        results.push({ id: patient.id, email: patient.mail, ...result });
      }

      if (patient.recordatorioWsp) {
        const result = await sendWhatsAppReminder(patient);
        results.push({ id: patient.id, phone: patient.telefono, ...result });
      }
    }

    return res.json({
      ok: true,
      total: upcoming.length,
      sent: results.length,
      results,
      mode: hasSmtpConfig || hasTwilioConfig ? 'real' : 'simulated'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'No se pudieron enviar los recordatorios.' });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    if (SESSION_SECRET.length < 32) {
      throw new Error('En producción, SESSION_SECRET debe tener al menos 32 caracteres.');
    }
    if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
      throw new Error('En producción, configure ADMIN_USERNAME y una ADMIN_PASSWORD de al menos 12 caracteres.');
    }
  }

  await initDatabase();
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
      console.log(`Acceso desde red: http://${HOST === '0.0.0.0' ? 'TU_IP_DE_LA_MAQUINA' : HOST}:${PORT}`);
      resolve(server);
    });

    server.on('error', (error) => {
      reject(error);
    });
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  });
}

module.exports = { app, startServer };
