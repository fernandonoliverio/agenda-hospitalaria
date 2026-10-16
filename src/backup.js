function serializeExportedAt(date = new Date()) {
  const safeDate = new Date(date);
  const iso = Number.isNaN(safeDate.getTime()) ? new Date() : safeDate;
  const [datePart, timePart] = iso.toISOString().split('T');
  const [year, month, day] = datePart.split('-');
  const [hour, minute, second] = timePart.replace('Z', '').split(':');

  return [Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(Number(second).toFixed(0))];
}

function buildBackupPayload(patients = [], deletedPatients = []) {
  return {
    version: 1,
    exportedAt: serializeExportedAt(),
    patients: patients.map((patient) => ({
      ...patient,
      recordatorioWsp: Boolean(patient.recordatorioWsp),
      recordatorioMail: Boolean(patient.recordatorioMail),
      archivos: Array.isArray(patient.archivos) ? patient.archivos : []
    })),
    deletedPatients: deletedPatients.map((patient) => ({
      ...patient,
      recordatorioWsp: Boolean(patient.recordatorioWsp),
      recordatorioMail: Boolean(patient.recordatorioMail),
      archivos: Array.isArray(patient.archivos) ? patient.archivos : []
    }))
  };
}

function normalizeBackupPayload(payload = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};

  const patients = Array.isArray(safePayload.patients) ? safePayload.patients : [];
  const deletedPatients = Array.isArray(safePayload.deletedPatients) ? safePayload.deletedPatients : [];

  return {
    version: Number(safePayload.version || 1),
    exportedAt: Array.isArray(safePayload.exportedAt)
      ? safePayload.exportedAt
      : serializeExportedAt(safePayload.exportedAt || new Date()),
    patients: patients.map((patient) => ({
      ...patient,
      id: String(patient.id || `backup-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`),
      nombre: String(patient.nombre || '').trim(),
      apellido: String(patient.apellido || '').trim(),
      documento: String(patient.documento || '').trim(),
      diagnostico: String(patient.diagnostico || '').trim(),
      medico: String(patient.medico || '').trim(),
      telefono: String(patient.telefono || '').trim(),
      mail: String(patient.mail || '').trim(),
      fechaTurno: String(patient.fechaTurno || '').trim(),
      horaTurno: String(patient.horaTurno || '').trim(),
      observaciones: String(patient.observaciones || '').trim(),
      recordatorioWsp: Boolean(patient.recordatorioWsp),
      recordatorioMail: Boolean(patient.recordatorioMail),
      archivos: Array.isArray(patient.archivos) ? patient.archivos : []
    })),
    deletedPatients: deletedPatients.map((patient) => ({
      ...patient,
      id: String(patient.id || `backup-del-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`),
      nombre: String(patient.nombre || '').trim(),
      apellido: String(patient.apellido || '').trim(),
      documento: String(patient.documento || '').trim(),
      diagnostico: String(patient.diagnostico || '').trim(),
      medico: String(patient.medico || '').trim(),
      telefono: String(patient.telefono || '').trim(),
      mail: String(patient.mail || '').trim(),
      fechaTurno: String(patient.fechaTurno || '').trim(),
      horaTurno: String(patient.horaTurno || '').trim(),
      observaciones: String(patient.observaciones || '').trim(),
      recordatorioWsp: Boolean(patient.recordatorioWsp),
      recordatorioMail: Boolean(patient.recordatorioMail),
      archivos: Array.isArray(patient.archivos) ? patient.archivos : []
    }))
  };
}

module.exports = {
  buildBackupPayload,
  normalizeBackupPayload
};
