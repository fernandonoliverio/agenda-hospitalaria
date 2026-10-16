const test = require('node:test');
const assert = require('node:assert/strict');

const { buildBackupPayload, normalizeBackupPayload } = require('../src/backup');

test('buildBackupPayload devuelve estructura completa con agenda y eliminados', () => {
  const payload = buildBackupPayload(
    [{ id: '1', nombre: 'Ana', apellido: 'Pérez', documento: '123', medico: 'Dr. Ruiz', fechaTurno: '2026-10-10', horaTurno: '10:00', recordatorioWsp: true, recordatorioMail: false, archivos: [] }],
    [{ id: '2', nombre: 'Luis', apellido: 'Gómez', documento: '456', medico: 'Dr. Díaz', fechaTurno: '2026-10-11', horaTurno: '11:00', recordatorioWsp: false, recordatorioMail: true, archivos: [] }]
  );

  assert.equal(payload.version, 1);
  assert.equal(payload.patients.length, 1);
  assert.equal(payload.deletedPatients.length, 1);
  assert.ok(Array.isArray(payload.exportedAt));
});

test('normalizeBackupPayload valida pacientes y archivados', () => {
  const normalized = normalizeBackupPayload({
    version: 1,
    patients: [{ id: 'p-1', nombre: 'Ana', apellido: 'Pérez', documento: '123', diagnostico: 'Control', medico: 'Dr. Ruiz', telefono: '123', mail: 'ana@test.com', fechaTurno: '2026-10-10', horaTurno: '10:00', observaciones: '', recordatorioWsp: true, recordatorioMail: false, archivos: [] }],
    deletedPatients: []
  });

  assert.equal(normalized.patients.length, 1);
  assert.equal(normalized.deletedPatients.length, 0);
  assert.equal(normalized.patients[0].id, 'p-1');
});
