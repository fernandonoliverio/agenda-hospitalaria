const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@libsql/client');
const { randomBytes, scrypt, timingSafeEqual } = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(scrypt);

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.resolve(process.env.HOSPI_DB_PATH || path.join(dataDir, 'hospi.db'));
const hasRealTursoConfig = Boolean(
  process.env.TURSO_DATABASE_URL &&
  process.env.TURSO_AUTH_TOKEN &&
  !process.env.TURSO_DATABASE_URL.includes('your-db-name') &&
  !process.env.TURSO_AUTH_TOKEN.includes('your-turso')
);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = hasRealTursoConfig
  ? createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    })
  : new sqlite3.Database(dbPath);

const useTurso = hasRealTursoConfig;

function run(sql, params = []) {
  if (useTurso) {
    return db.execute({ sql, args: params }).then((result) => ({
      id: result.lastInsertRowid ?? null,
      changes: result.rowsAffected ?? 0
    }));
  }

  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  if (useTurso) {
    return db.execute({ sql, args: params }).then((result) => result.rows[0] || null);
  }

  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  if (useTurso) {
    return db.execute({ sql, args: params }).then((result) => result.rows || []);
  }

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(String(password), salt, 64);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, storedPassword, username) {
  const parts = String(storedPassword || '').split('$');
  if (parts.length === 3 && parts[0] === 'scrypt') {
    const expected = Buffer.from(parts[2], 'hex');
    if (expected.length !== 64) return false;
    const actual = await scryptAsync(String(password), parts[1], expected.length);
    return timingSafeEqual(actual, expected);
  }

  if (String(password) !== String(storedPassword)) return false;
  await run('UPDATE users SET password = ? WHERE username = ?', [await hashPassword(password), username]);
  return true;
}

async function initDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      documento TEXT NOT NULL,
      obraSocial TEXT,
      diagnostico TEXT NOT NULL,
      medico TEXT NOT NULL,
      telefono TEXT NOT NULL,
      mail TEXT NOT NULL,
      fechaNacimiento TEXT,
      fechaTurno TEXT NOT NULL,
      horaTurno TEXT NOT NULL,
      observaciones TEXT,
      recordatorioWsp INTEGER DEFAULT 0,
      recordatorioMail INTEGER DEFAULT 0,
      asistio INTEGER DEFAULT 0,
      archivos TEXT DEFAULT '[]'
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS deleted_patients (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      documento TEXT NOT NULL,
      obraSocial TEXT,
      diagnostico TEXT NOT NULL,
      medico TEXT NOT NULL,
      telefono TEXT NOT NULL,
      mail TEXT NOT NULL,
      fechaNacimiento TEXT,
      fechaTurno TEXT NOT NULL,
      horaTurno TEXT NOT NULL,
      observaciones TEXT,
      recordatorioWsp INTEGER DEFAULT 0,
      recordatorioMail INTEGER DEFAULT 0,
      asistio INTEGER DEFAULT 0,
      archivos TEXT DEFAULT '[]',
      deletedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await run('ALTER TABLE patients ADD COLUMN asistio INTEGER DEFAULT 0');
  } catch (error) {
    if (!String(error.message).includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    await run('ALTER TABLE patients ADD COLUMN fechaNacimiento TEXT');
  } catch (error) {
    if (!String(error.message).includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    await run('ALTER TABLE deleted_patients ADD COLUMN asistio INTEGER DEFAULT 0');
  } catch (error) {
    if (!String(error.message).includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    await run('ALTER TABLE deleted_patients ADD COLUMN fechaNacimiento TEXT');
  } catch (error) {
    if (!String(error.message).includes('duplicate column name')) {
      throw error;
    }
  }

  if (process.env.NODE_ENV === 'production') {
    await run('DELETE FROM users WHERE username <> ?', [process.env.ADMIN_USERNAME]);
  }

  const adminUsername = process.env.ADMIN_USERNAME || (process.env.NODE_ENV === 'production' ? '' : 'admin');
  const adminPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123');
  if (adminUsername && adminPassword) {
    const encodedPassword = await hashPassword(adminPassword);
    await run(
      `INSERT INTO users (username, password) VALUES (?, ?)
       ON CONFLICT(username) DO UPDATE SET password = excluded.password`,
      [adminUsername, encodedPassword]
    );
  }
}

async function loginUser(username, password) {
  const user = await get('SELECT id, username, password FROM users WHERE username = ?', [username]);
  return user ? verifyPassword(password, user.password, user.username) : false;
}

async function getPatients() {
  const rows = await all('SELECT * FROM patients ORDER BY fechaTurno ASC, horaTurno ASC');
  return rows.map((patient) => ({
    ...patient,
    recordatorioWsp: !!patient.recordatorioWsp,
    recordatorioMail: !!patient.recordatorioMail,
    asistio: patient.asistio === 1 || patient.asistio === true || patient.asistio === '1',
    archivos: JSON.parse(patient.archivos || '[]')
  }));
}

async function getPatientById(id) {
  const patient = await get('SELECT * FROM patients WHERE id = ?', [id]);
  if (!patient) return null;

  return {
    ...patient,
    recordatorioWsp: !!patient.recordatorioWsp,
    recordatorioMail: !!patient.recordatorioMail,
    asistio: patient.asistio === 1 || patient.asistio === true || patient.asistio === '1',
    fechaNacimiento: patient.fechaNacimiento || '',
    archivos: JSON.parse(patient.archivos || '[]')
  };
}

async function addPatient(patient) {
  const patientData = {
    ...patient,
    archivos: JSON.stringify(patient.archivos || []),
    recordatorioWsp: patient.recordatorioWsp ? 1 : 0,
    recordatorioMail: patient.recordatorioMail ? 1 : 0,
    asistio: patient.asistio ? 1 : 0
  };

  await run(
    `INSERT INTO patients (id, nombre, apellido, documento, obraSocial, diagnostico, medico, telefono, mail, fechaNacimiento, fechaTurno, horaTurno, observaciones, recordatorioWsp, recordatorioMail, asistio, archivos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      patientData.id,
      patientData.nombre,
      patientData.apellido,
      patientData.documento,
      patientData.obraSocial,
      patientData.diagnostico,
      patientData.medico,
      patientData.telefono,
      patientData.mail,
      patientData.fechaNacimiento || '',
      patientData.fechaTurno,
      patientData.horaTurno,
      patientData.observaciones,
      patientData.recordatorioWsp,
      patientData.recordatorioMail,
      patientData.asistio,
      patientData.archivos
    ]
  );

  return patientData;
}

async function updatePatient(patient) {
  const patientData = {
    ...patient,
    archivos: JSON.stringify(patient.archivos || []),
    recordatorioWsp: patient.recordatorioWsp ? 1 : 0,
    recordatorioMail: patient.recordatorioMail ? 1 : 0,
    asistio: patient.asistio ? 1 : 0
  };

  await run(
    `UPDATE patients SET
      nombre = ?, apellido = ?, documento = ?, obraSocial = ?, diagnostico = ?, medico = ?, telefono = ?, mail = ?, fechaNacimiento = ?, fechaTurno = ?, horaTurno = ?, observaciones = ?, recordatorioWsp = ?, recordatorioMail = ?, asistio = ?, archivos = ?
     WHERE id = ?`,
    [
      patientData.nombre,
      patientData.apellido,
      patientData.documento,
      patientData.obraSocial,
      patientData.diagnostico,
      patientData.medico,
      patientData.telefono,
      patientData.mail,
      patientData.fechaNacimiento || '',
      patientData.fechaTurno,
      patientData.horaTurno,
      patientData.observaciones,
      patientData.recordatorioWsp,
      patientData.recordatorioMail,
      patientData.asistio,
      patientData.archivos,
      patientData.id
    ]
  );

  return patientData;
}

async function getDeletedPatients() {
  const rows = await all('SELECT * FROM deleted_patients ORDER BY deletedAt DESC');
  return rows.map((patient) => ({
    ...patient,
    recordatorioWsp: !!patient.recordatorioWsp,
    recordatorioMail: !!patient.recordatorioMail,
    asistio: patient.asistio === 1 || patient.asistio === true || patient.asistio === '1',
    fechaNacimiento: patient.fechaNacimiento || '',
    archivos: JSON.parse(patient.archivos || '[]')
  }));
}

async function deletePatient(id) {
  const existing = await get('SELECT * FROM patients WHERE id = ?', [id]);
  if (!existing) return;

  const archived = {
    ...existing,
    archivos: JSON.stringify(existing.archivos || '[]'),
    recordatorioWsp: existing.recordatorioWsp ? 1 : 0,
    recordatorioMail: existing.recordatorioMail ? 1 : 0,
    asistio: existing.asistio ? 1 : 0,
    fechaNacimiento: existing.fechaNacimiento || ''
  };

  await run(
    `INSERT OR REPLACE INTO deleted_patients (id, nombre, apellido, documento, obraSocial, diagnostico, medico, telefono, mail, fechaNacimiento, fechaTurno, horaTurno, observaciones, recordatorioWsp, recordatorioMail, asistio, archivos, deletedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      archived.id,
      archived.nombre,
      archived.apellido,
      archived.documento,
      archived.obraSocial,
      archived.diagnostico,
      archived.medico,
      archived.telefono,
      archived.mail,
      archived.fechaNacimiento || '',
      archived.fechaTurno,
      archived.horaTurno,
      archived.observaciones,
      archived.recordatorioWsp,
      archived.recordatorioMail,
      archived.asistio,
      archived.archivos
    ]
  );

  await run('DELETE FROM patients WHERE id = ?', [id]);
}

async function restorePatient(id) {
  const archived = await get('SELECT * FROM deleted_patients WHERE id = ?', [id]);
  if (!archived) return null;

  const patient = {
    ...archived,
    archivos: JSON.parse(archived.archivos || '[]'),
    recordatorioWsp: !!archived.recordatorioWsp,
    recordatorioMail: !!archived.recordatorioMail,
    asistio: archived.asistio === 1 || archived.asistio === true || archived.asistio === '1',
    fechaNacimiento: archived.fechaNacimiento || ''
  };

  await run(
    `INSERT OR REPLACE INTO patients (id, nombre, apellido, documento, obraSocial, diagnostico, medico, telefono, mail, fechaNacimiento, fechaTurno, horaTurno, observaciones, recordatorioWsp, recordatorioMail, asistio, archivos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      patient.id,
      patient.nombre,
      patient.apellido,
      patient.documento,
      patient.obraSocial,
      patient.diagnostico,
      patient.medico,
      patient.telefono,
      patient.mail,
      patient.fechaNacimiento || '',
      patient.fechaTurno,
      patient.horaTurno,
      patient.observaciones,
      patient.recordatorioWsp ? 1 : 0,
      patient.recordatorioMail ? 1 : 0,
      patient.asistio ? 1 : 0,
      JSON.stringify(patient.archivos || [])
    ]
  );

  await run('DELETE FROM deleted_patients WHERE id = ?', [id]);
  return patient;
}

async function clearPatients() {
  const allPatients = await getPatients();

  for (const patient of allPatients) {
    await run(
      `INSERT OR REPLACE INTO deleted_patients (id, nombre, apellido, documento, obraSocial, diagnostico, medico, telefono, mail, fechaNacimiento, fechaTurno, horaTurno, observaciones, recordatorioWsp, recordatorioMail, asistio, archivos, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        patient.id,
        patient.nombre,
        patient.apellido,
        patient.documento,
        patient.obraSocial,
        patient.diagnostico,
        patient.medico,
        patient.telefono,
        patient.mail,
        patient.fechaNacimiento || '',
        patient.fechaTurno,
        patient.horaTurno,
        patient.observaciones,
        patient.recordatorioWsp ? 1 : 0,
        patient.recordatorioMail ? 1 : 0,
        patient.asistio ? 1 : 0,
        JSON.stringify(patient.archivos || [])
      ]
    );
  }

  await run('DELETE FROM patients');
}

module.exports = {
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
};
