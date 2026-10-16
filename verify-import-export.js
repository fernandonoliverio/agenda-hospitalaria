const assert = require('node:assert/strict');
const { parseCsvText, normalizePatientImport, toCsvText } = require('./src/importExport');

const csv = [
  'nombre,apellido,documento,obraSocial,diagnostico,medico,telefono,mail,fechaTurno,horaTurno,observaciones,recordatorioWsp,recordatorioMail',
  'Ana,Pérez,12345,OSDE,Control,Dr. Ruiz,5491123456789,ana@test.com,2026-10-05,10:00,"Observación con coma, detalle",true,1'
].join('\n');

const rows = parseCsvText(csv);
assert.equal(rows.length, 1);
assert.equal(rows[0].nombre, 'Ana');
assert.equal(rows[0].recordatorioMail, true);

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
assert.ok(patient.id.length > 0);

const csvOut = toCsvText([
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

assert.match(csvOut, /"nombre","apellido"/);
assert.match(csvOut, /"Texto con ""comillas"""/);
console.log('import-export ok');
