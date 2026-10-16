const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hospi-tests-'));
process.env.HOSPI_DB_PATH = path.join(testDataDir, 'hospi-test.db');
process.env.HOSPI_UPLOADS_DIR = path.join(testDataDir, 'uploads');

const { app } = require('../server');
const { initDatabase, clearPatients, getDeletedPatients, getPatients } = require('../src/db');

async function withServer(handler) {
  await initDatabase();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    await handler(port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('POST /api/backup/restore restaura pacientes desde un backup válido', async () => {
  await withServer(async (port) => {
    assert.deepEqual(await getPatients(), []);
    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
    const response = await fetch(`http://127.0.0.1:${port}/api/backup/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        version: 1,
        patients: [{
          id: 'backup-restore-1',
          nombre: 'Pedro',
          apellido: 'López',
          documento: '98765432',
          diagnostico: 'Control',
          medico: 'Dr. Silva',
          telefono: '5491155544433',
          mail: 'pedro@test.com',
          fechaTurno: '2026-11-01',
          horaTurno: '09:30',
          observaciones: 'Sin detalle',
          recordatorioWsp: true,
          recordatorioMail: false,
          archivos: []
        }],
        deletedPatients: [{
          id: 'backup-deleted-1',
          nombre: 'Elena',
          apellido: 'Paz',
          documento: '11223344',
          diagnostico: 'Seguimiento',
          medico: 'Dra. Ruiz',
          telefono: '5491155511122',
          mail: 'elena@test.com',
          fechaNacimiento: '1971-08-13',
          fechaTurno: '2026-11-02',
          horaTurno: '10:30',
          observaciones: '',
          recordatorioWsp: false,
          recordatorioMail: false,
          asistio: true,
          archivos: [],
          deletedAt: '2026-10-01T12:00:00.000Z'
        }]
      })
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.restored, 1);
    assert.equal(payload.deletedRestored, 1);
    const deletedPatients = await getDeletedPatients();
    assert.equal(deletedPatients[0].id, 'backup-deleted-1');
    assert.equal(deletedPatients[0].fechaNacimiento, '1971-08-13');
    assert.equal(deletedPatients[0].asistio, true);
  });
});

test('la API rechaza solicitudes sin sesión y permite acceso después del login', async () => {
  await withServer(async (port) => {
    await clearPatients();
    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/patients`);
    assert.equal(unauthorized.status, 401);

    const privateUpload = await fetch(`http://127.0.0.1:${port}/uploads/private-document.pdf`);
    assert.equal(privateUpload.status, 401);

    const sourceFile = await fetch(`http://127.0.0.1:${port}/server.js`);
    assert.match(await sourceFile.text(), /<!DOCTYPE html>/i);

    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert.equal(loginResponse.status, 200);

    const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
    const tampered = await fetch(`http://127.0.0.1:${port}/api/patients`, {
      headers: { Cookie: `${cookie}x` }
    });
    assert.equal(tampered.status, 401);

    const authorized = await fetch(`http://127.0.0.1:${port}/api/patients`, {
      headers: { Cookie: cookie }
    });
    assert.equal(authorized.status, 200);
    assert.deepEqual(await authorized.json(), []);

    const logout = await fetch(`http://127.0.0.1:${port}/api/logout`, {
      method: 'POST',
      headers: { Cookie: cookie }
    });
    assert.equal(logout.status, 200);
  });
});
