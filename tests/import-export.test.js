const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCsvText, toCsvText, normalizePatientImport } = require('../src/importExport');

test('parseCsvText convierte filas CSV a registros de pacientes', () => {
  const csv = [
    'nombre,apellido,documento,obraSocial,diagnostico,medico,telefono,mail,fechaTurno,horaTurno,observaciones,recordatorioWsp,recordatorioMail',
    'Ana,Pérez,12345,OSDE,Control,Dr. Ruiz,5491123456789,ana@test.com,2026-10-05,10:00,"Observación con coma, detalle",true,1'
  ].join('\n');

  const rows = parseCsvText(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nombre, 'Ana');
  assert.equal(rows[0].apellido, 'Pérez');
  assert.equal(rows[0].recordatorioWsp, true);
  assert.equal(rows[0].recordatorioMail, true);
});

test('normalizePatientImport valida campos mínimos y normaliza recordatorios', () => {
  const patient = normalizePatientImport({
    nombre: 'Luis',
    apellido: 'Gomez',
    documento: '87654321',
    diagnostico: 'Consulta',
    medico: 'Dr. López',
    telefono: '1122334455',
    mail: 'luis@test.com',
    fechaTurno: '2026-10-07',
    horaTurno: '15:30',
    recordatorioWsp: 'si',
    recordatorioMail: 'false'
  });

  assert.equal(patient.recordatorioWsp, true);
  assert.equal(patient.recordatorioMail, false);
  assert.equal(patient.id.length > 0, true);
});

test('toCsvText serializa pacientes con cabeceras y valores seguros', () => {
  const csv = toCsvText([
    {
      nombre: 'María',
      apellido: 'Luna',
      documento: '111',
      obraSocial: 'OSDE',
      diagnostico: 'Control',
      medico: 'Dr. Díaz',
      telefono: '112233',
      mail: 'maria@test.com',
      fechaTurno: '2026-10-11',
      horaTurno: '08:15',
      observaciones: 'Texto con "comillas"',
      recordatorioWsp: true,
      recordatorioMail: false
    }
  ]);

  assert.match(csv, /"nombre","apellido"/);
  assert.match(csv, /"Texto con ""comillas"""/);
});
