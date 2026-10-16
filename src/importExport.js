function normalizeCsvCellValue(header, value) {
  const textValue = String(value ?? '').trim();
  const normalizedHeader = String(header || '').trim();

  if (normalizedHeader === 'recordatorioWsp' || normalizedHeader === 'recordatorioMail') {
    const lowerValue = textValue.toLowerCase();

    if (['true', '1', 'yes', 'si', 's', 'on'].includes(lowerValue)) {
      return true;
    }

    if (['false', '0', 'no', 'n', 'off', ''].includes(lowerValue)) {
      return false;
    }
  }

  return textValue;
}

function parseCsvText(csvText = '') {
  const rows = [];
  let currentRow = [];
  let currentValue = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      currentRow.push(currentValue);
      const trimmedRow = currentRow.map((cell) => cell.trim());
      if (trimmedRow.some((cell) => cell !== '')) {
        rows.push(trimmedRow);
      }
      currentRow = [];
      currentValue = '';
      continue;
    }

    currentValue += char;
  }

  if (currentValue !== '' || currentRow.length) {
    currentRow.push(currentValue);
    const trimmedRow = currentRow.map((cell) => cell.trim());
    if (trimmedRow.some((cell) => cell !== '')) {
      rows.push(trimmedRow);
    }
  }

  if (rows.length < 2) {
    return [];
  }

  const [headers, ...dataRows] = rows;
  return dataRows
    .filter((row) => row.some((cell) => String(cell).trim() !== ''))
    .map((row) => {
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = normalizeCsvCellValue(header, row[index] ?? '');
      });
      return entry;
    });
}

function normalizeBoolean(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['true', '1', 'yes', 'si', 's', 'on'].includes(normalized);
}

function normalizePatientImport(raw = {}) {
  const patient = {
    ...raw,
    nombre: String(raw.nombre || '').trim(),
    apellido: String(raw.apellido || '').trim(),
    documento: String(raw.documento || '').trim(),
    obraSocial: String(raw.obraSocial || '').trim(),
    diagnostico: String(raw.diagnostico || '').trim(),
    medico: String(raw.medico || '').trim(),
    telefono: String(raw.telefono || '').trim().replace(/\s+/g, ''),
    mail: String(raw.mail || '').trim(),
    fechaTurno: String(raw.fechaTurno || '').trim(),
    horaTurno: String(raw.horaTurno || '').trim(),
    observaciones: String(raw.observaciones || '').trim(),
    recordatorioWsp: normalizeBoolean(raw.recordatorioWsp),
    recordatorioMail: normalizeBoolean(raw.recordatorioMail),
    archivos: []
  };

  const requiredFields = [
    'nombre',
    'apellido',
    'documento',
    'diagnostico',
    'medico',
    'telefono',
    'mail',
    'fechaTurno',
    'horaTurno'
  ];

  const missing = requiredFields.filter((field) => !patient[field]);
  if (missing.length) {
    throw new Error(`Faltan campos obligatorios: ${missing.join(', ')}`);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patient.mail)) {
    throw new Error('El mail del paciente no tiene un formato válido.');
  }

  patient.id = String(raw.id || `import-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`);
  patient.telefono = patient.telefono.replace(/\D/g, '');

  return patient;
}

function toCsvText(patients = []) {
  const headers = [
    'nombre',
    'apellido',
    'documento',
    'obraSocial',
    'diagnostico',
    'medico',
    'telefono',
    'mail',
    'fechaTurno',
    'horaTurno',
    'observaciones',
    'recordatorioWsp',
    'recordatorioMail'
  ];

  const rows = [headers];
  patients.forEach((patient) => {
    rows.push(headers.map((header) => {
      const value = patient[header];
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      return String(value ?? '');
    }));
  });

  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

module.exports = {
  parseCsvText,
  normalizePatientImport,
  toCsvText
};
