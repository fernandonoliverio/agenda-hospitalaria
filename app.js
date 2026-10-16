const LOGIN_KEY = 'hospiClinicLoggedIn';
const LOCAL_APP_URL = 'http://localhost:3001';

function resolveApiBase() {
  if (window.location.protocol === 'file:') {
    window.location.replace(LOCAL_APP_URL);
    return LOCAL_APP_URL;
  }

  return window.location.origin;
}

const API_BASE = resolveApiBase();

const loginScreen = document.getElementById('loginScreen');
const appShell = document.getElementById('appShell');
const loginForm = document.getElementById('loginForm');
const form = document.getElementById('patientForm');
const agendaList = document.getElementById('agendaList');
const searchInput = document.getElementById('searchInput');
const doctorFilter = document.getElementById('doctorFilter');
const statusFilter = document.getElementById('statusFilter');
const patientsStatusFilter = document.getElementById('patientsStatusFilter');
const dateFilterInput = document.getElementById('dateFilterInput');
const clearAllBtn = document.getElementById('clearAllBtn');
const logoutBtn = document.getElementById('logoutBtn');
const calendarPreview = document.getElementById('calendarPreview');
const nextAppointmentLabel = document.getElementById('nextAppointmentLabel');
const totalPatientsStat = document.getElementById('totalPatientsStat');
const todayPatientsStat = document.getElementById('todayPatientsStat');
const remindersStat = document.getElementById('remindersStat');
const filesStat = document.getElementById('filesStat');
const selectedDateLabel = document.getElementById('selectedDateLabel');
const monthCalendar = document.getElementById('monthCalendar');
const monthTitle = document.getElementById('monthTitle');
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const importCsvBtn = document.getElementById('importCsvBtn');
const importCsvInput = document.getElementById('importCsvInput');
const backupBtn = document.getElementById('backupBtn');
const restoreBackupBtn = document.getElementById('restoreBackupBtn');
const backupInput = document.getElementById('backupInput');
const sendRemindersBtn = document.getElementById('sendRemindersBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const formPanel = document.getElementById('formPanel');
const newTurnBtn = document.getElementById('newTurnBtn');
const restorePatientsBtn = document.getElementById('restorePatientsBtn');
const patientHistoryModal = document.getElementById('patientHistoryModal');
const patientHistoryContent = document.getElementById('patientHistoryContent');
const historyCloseBtn = document.getElementById('historyCloseBtn');
const deletedPatientsModal = document.getElementById('deletedPatientsModal');
const deletedPatientsContent = document.getElementById('deletedPatientsContent');
const deletedPatientsCloseBtn = document.getElementById('deletedPatientsCloseBtn');

let currentMonthDate = new Date();
let selectedDate = formatISODate(new Date());
let currentEditId = null;
let currentDoctorFilter = 'all';
let currentStatusFilter = 'all';
let currentView = 'agenda';
let currentPatientsStatusFilter = 'all';
let currentDateFilter = '';

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers
    },
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (response.status === 401 && !url.endsWith('/api/login')) {
    localStorage.removeItem(LOGIN_KEY);
    loginScreen.classList.remove('hidden');
    appShell.classList.add('hidden');
  }

  if (!response.ok) {
    throw new Error(typeof payload === 'string' ? payload : payload.message || 'Error en la solicitud');
  }

  return payload;
}

async function loginUser(username, password) {
  return apiRequest(`${API_BASE}/api/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

async function fetchPatients() {
  const patients = await apiRequest(`${API_BASE}/api/patients`);
  return patients.map((patient) => ({
    ...patient,
    recordatorioWsp: Boolean(patient.recordatorioWsp),
    recordatorioMail: Boolean(patient.recordatorioMail),
    asistio: Boolean(patient.asistio),
    fechaNacimiento: patient.fechaNacimiento || '',
    archivos: Array.isArray(patient.archivos) ? patient.archivos : []
  }));
}

async function fetchDeletedPatients() {
  const response = await apiRequest(`${API_BASE}/api/deleted-patients`);
  const patients = Array.isArray(response)
    ? response
    : Array.isArray(response?.deletedPatients)
      ? response.deletedPatients
      : Array.isArray(response?.patients)
        ? response.patients
        : Array.isArray(response?.items)
          ? response.items
          : [];

  return patients.map((patient) => ({
    ...patient,
    recordatorioWsp: Boolean(patient.recordatorioWsp),
    recordatorioMail: Boolean(patient.recordatorioMail),
    asistio: Boolean(patient.asistio),
    fechaNacimiento: patient.fechaNacimiento || '',
    archivos: Array.isArray(patient.archivos) ? patient.archivos : []
  }));
}

async function createPatient(patientData) {
  const formData = new FormData();

  Object.entries(patientData).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  });

  if (patientData.archivos && patientData.archivos.length) {
    patientData.archivos.forEach((file) => formData.append('archivos', file));
  }

  return apiRequest(`${API_BASE}/api/patients`, {
    method: 'POST',
    body: formData
  });
}

async function deletePatientById(id) {
  return apiRequest(`${API_BASE}/api/patients/${id}`, { method: 'DELETE' });
}

async function updatePatientById(id, patientData) {
  const formData = new FormData();
  Object.entries(patientData).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  });

  if (patientData.archivos && patientData.archivos.length) {
    patientData.archivos.forEach((file) => formData.append('archivos', file));
  }

  return apiRequest(`${API_BASE}/api/patients/${id}`, {
    method: 'PUT',
    body: formData
  });
}

async function clearPatients() {
  return apiRequest(`${API_BASE}/api/patients`, { method: 'DELETE' });
}

async function restorePatientById(id) {
  return apiRequest(`${API_BASE}/api/patients/${id}/restore`, { method: 'POST' });
}

function sortPatients(patients) {
  return [...patients].sort((a, b) => {
    const dateA = new Date(`${a.fechaTurno}T${a.horaTurno || '00:00'}`);
    const dateB = new Date(`${b.fechaTurno}T${b.horaTurno || '00:00'}`);
    return dateA - dateB;
  });
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function formatTime(value) {
  if (!value) return 'Sin horario';
  const [hours, minutes] = value.split(':');
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatISODate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function formatLongDate(value) {
  if (!value) return '--';
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function getAgeFromBirthDate(value) {
  if (!value) return 'Edad no registrada';

  const birthDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return 'Edad no registrada';

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return `${age} años`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Error al leer archivo'));
    reader.readAsDataURL(file);
  });
}

async function downloadExport(format = 'csv') {
  const response = await fetch(`${API_BASE}/api/patients/export?format=${encodeURIComponent(format)}`);
  if (!response.ok) {
    throw new Error('No se pudo exportar la agenda.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `agenda_pacientes.${format === 'json' ? 'json' : 'csv'}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function importPatientsFromFile(file) {
  const csvText = await file.text();
  return apiRequest(`${API_BASE}/api/patients/import`, {
    method: 'POST',
    body: JSON.stringify({ csv: csvText })
  });
}

async function downloadBackup() {
  const response = await fetch(`${API_BASE}/api/backup`);
  if (!response.ok) {
    throw new Error('No se pudo generar el backup.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'hospi-backup.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function restoreBackupFromFile(file) {
  const payload = JSON.parse(await file.text());
  return apiRequest(`${API_BASE}/api/backup/restore`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

function downloadAttachment(attachment) {
  const binary = atob(attachment.data || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: attachment.mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = attachment.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeAttendance(patient) {
  return patient && patient.asistio === true ? true : false;
}

function getAttendanceState(patient) {
  if (normalizeAttendance(patient)) {
    return { label: 'Asistió', className: 'confirmed', value: true };
  }

  if (patient && patient.asistio === false) {
    return { label: 'No asistió', className: 'missed', value: false };
  }

  return { label: 'Pendiente', className: 'pending', value: null };
}

function getWhatsAppLink(patient, mode = 'reminder') {
  const cleanPhone = String(patient.telefono || '').replace(/\D/g, '');
  const phone = cleanPhone.startsWith('54') ? cleanPhone : `54${cleanPhone}`;
  const text = mode === 'confirmation'
    ? `Hola ${patient.nombre} ${patient.apellido}. Tu turno quedó confirmado para el ${formatDate(patient.fechaTurno)} a las ${formatTime(patient.horaTurno)}. Muchas gracias.`
    : `Hola ${patient.nombre} ${patient.apellido}. Le recordamos su turno programado. Fecha: ${formatDate(patient.fechaTurno)} a las ${formatTime(patient.horaTurno)}. Muchas gracias.`;

  const encodedText = encodeURIComponent(text);
  const webUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${encodedText}`;
  const mobileUrl = `https://wa.me/${phone}?text=${encodedText}`;
  return webUrl;
}

function openWhatsAppConversation(patient, mode = 'reminder') {
  const link = getWhatsAppLink(patient, mode);
  const popup = window.open(link, '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.location.href = link;
  }
}

function getMailtoLink(patient) {
  const subject = encodeURIComponent('Recordatorio de turno');
  const body = encodeURIComponent(
    `Estimado/a ${patient.nombre} ${patient.apellido}:\n\nEste es un recordatorio de su turno programado para el ${formatDate(patient.fechaTurno)} a las ${formatTime(patient.horaTurno)}.\n\nDiagnóstico: ${patient.diagnostico}\nMédico solicitante: ${patient.medico}\nObra social: ${patient.obraSocial || 'No indicada'}\n\nGracias.`
  );
  return `mailto:${patient.mail}?subject=${subject}&body=${body}`;
}

function getAppointmentsForPreview(patients) {
  const upcoming = sortPatients(patients).slice(0, 5);
  return upcoming;
}

function renderMonthCalendar(patients) {
  const firstDay = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1);
  const startDay = new Date(firstDay);
  startDay.setDate(startDay.getDate() - startDay.getDay());

  const dateFilter = selectedDate || formatISODate(new Date());

  const monthName = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(currentMonthDate);
  monthTitle.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const calendarDays = [];
  for (let i = 0; i < 42; i += 1) {
    const dayDate = new Date(startDay);
    dayDate.setDate(startDay.getDate() + i);
    const isoDate = formatISODate(dayDate);
    const dayPatients = patients.filter((patient) => patient.fechaTurno === isoDate);
    const isCurrentMonth = dayDate.getMonth() === currentMonthDate.getMonth();
    const isSelected = isoDate === dateFilter;

    calendarDays.push(`
      <button
        class="calendar-day ${isCurrentMonth ? '' : 'outside-month'} ${isSelected ? 'selected' : ''} ${dayPatients.length ? 'has-events' : ''}"
        type="button"
        data-date="${isoDate}"
      >
        <span class="calendar-day-number">${dayDate.getDate()}</span>
        ${dayPatients.length ? `<span class="calendar-day-badge">${dayPatients.length}</span>` : ''}
      </button>
    `);
  }

  monthCalendar.innerHTML = `
    ${weekdays.map((day) => `<div class="calendar-weekday">${day}</div>`).join('')}
    ${calendarDays.join('')}
  `;

  monthCalendar.querySelectorAll('[data-date]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedDate = button.dataset.date;
      selectedDateLabel.textContent = formatLongDate(selectedDate);
      const dateInput = document.querySelector('input[name="fechaTurno"]');
      if (dateInput) {
        dateInput.value = selectedDate;
      }
      renderMonthCalendar(patients);
      renderAgenda();
    });
  });
}

function updateStats(patients) {
  const total = patients.length;
  const today = new Date().toISOString().split('T')[0];
  const todayCount = patients.filter((patient) => patient.fechaTurno === today).length;
  const reminderCount = patients.filter((patient) => patient.recordatorioMail || patient.recordatorioWsp).length;
  const filesCount = patients.reduce((sum, patient) => sum + (patient.archivos?.length || 0), 0);
  const next = sortPatients(patients)[0];

  totalPatientsStat.textContent = String(total);
  todayPatientsStat.textContent = String(todayCount);
  remindersStat.textContent = String(reminderCount);
  filesStat.textContent = String(filesCount);
  nextAppointmentLabel.textContent = next ? `${next.nombre} ${next.apellido} · ${formatDate(next.fechaTurno)}` : '--';
}

function toggleFormPanel(show) {
  if (!formPanel) return;
  formPanel.classList.toggle('hidden', !show);
}

function closePatientHistory() {
  patientHistoryModal.classList.add('hidden');
  patientHistoryModal.setAttribute('aria-hidden', 'true');
  patientHistoryContent.innerHTML = '';
}

function openPatientEditor(patientId) {
  const patient = fetchPatients ? null : null;
  return patientId;
}

function closeDeletedPatientsModal() {
  deletedPatientsModal.classList.add('hidden');
  deletedPatientsModal.setAttribute('aria-hidden', 'true');
  deletedPatientsContent.innerHTML = '';
}

async function openDeletedPatientsModal() {
  try {
    const deletedPatients = await fetchDeletedPatients();
    const safeDeletedPatients = Array.isArray(deletedPatients) ? deletedPatients : [];

    if (!safeDeletedPatients.length) {
      deletedPatientsContent.innerHTML = `
        <div class="empty-state">
          <h3>No hay pacientes eliminados</h3>
          <p>Cuando borres un paciente se listará aquí para poder recuperarlo.</p>
        </div>
      `;
    } else {
      deletedPatientsContent.innerHTML = `
        <div class="restore-list">
          ${safeDeletedPatients
            .map(
              (patient) => `
                <article class="restore-item">
                  <div>
                    <strong>${patient.nombre} ${patient.apellido}</strong>
                    <p>${patient.documento} · ${patient.medico}</p>
                    <small>${formatDate(patient.fechaTurno)} · ${formatTime(patient.horaTurno)}</small>
                  </div>
                  <button class="primary-button small-button" type="button" data-restore="${patient.id}">Restaurar</button>
                </article>
              `
            )
            .join('')}
        </div>
      `;

      deletedPatientsContent.querySelectorAll('[data-restore]').forEach((button) => {
        button.addEventListener('click', async () => {
          const patientId = button.dataset.restore;
          try {
            await restorePatientById(patientId);
            await openDeletedPatientsModal();
            await renderAgenda();
          } catch (error) {
            alert(error.message);
          }
        });
      });
    }

    deletedPatientsModal.classList.remove('hidden');
    deletedPatientsModal.setAttribute('aria-hidden', 'false');
  } catch (error) {
    alert(error.message);
  }
}

function updateViewControls() {
  const isPatientsView = currentView === 'patients';
  const isReportsView = currentView === 'reports';
  const panelTitle = document.getElementById('panelTitle');

  if (panelTitle) {
    if (isPatientsView) {
      panelTitle.textContent = 'Pacientes';
    } else if (isReportsView) {
      panelTitle.textContent = 'Pedido médico';
    } else {
      panelTitle.textContent = 'Agenda';
    }
  }

  if (statusFilter) {
    statusFilter.classList.toggle('hidden', isPatientsView || isReportsView);
  }

  if (patientsStatusFilter) {
    patientsStatusFilter.classList.toggle('hidden', !isPatientsView);
  }

  if (monthCalendar) {
    monthCalendar.classList.toggle('hidden', isPatientsView || isReportsView);
  }

  if (doctorFilter) {
    doctorFilter.disabled = currentView !== 'agenda';
  }
}

async function openPatientHistory(patientId) {
  try {
    const patients = await fetchPatients();
    const patient = patients.find((item) => item.id === patientId);
    if (!patient) return;

    const history = patients
      .filter((item) => {
        const sameDocument = patient.documento && item.documento && item.documento === patient.documento;
        const samePhone = patient.telefono && item.telefono && item.telefono === patient.telefono;
        const sameMail = patient.mail && item.mail && item.mail === patient.mail;
        const samePerson = !patient.documento && item.nombre === patient.nombre && item.apellido === patient.apellido;
        return sameDocument || samePhone || sameMail || samePerson;
      })
      .sort((a, b) => new Date(`${a.fechaTurno}T${a.horaTurno || '00:00'}`) - new Date(`${b.fechaTurno}T${b.horaTurno || '00:00'}`));

    const visibleHistory = history.length ? history : [patient];
    const title = `${patient.nombre} ${patient.apellido}`;
    const historyMarkup = visibleHistory.map((item) => `
      <article class="history-item">
        <div class="history-item-header">
          <strong>${formatDate(item.fechaTurno)} · ${formatTime(item.horaTurno)}</strong>
          <span>${item.medico || 'Médico no informado'}</span>
        </div>
        <p><strong>Diagnóstico:</strong> ${item.diagnostico || 'Sin diagnóstico registrado.'}</p>
        <p><strong>Observaciones:</strong> ${item.observaciones || 'Sin observaciones registradas.'}</p>
        ${
          item.archivos && item.archivos.length
            ? `<div class="history-item-meta">
                ${item.archivos
                  .map(
                    (attachment) => `
                      <a class="history-chip" href="${API_BASE}${attachment.url || ''}" target="_blank" rel="noopener noreferrer">
                        ${attachment.name || attachment.originalname || 'Informe'}
                      </a>
                    `
                  )
                  .join('')}
              </div>`
            : ''
        }
        <div class="history-item-meta">
          <span class="history-chip">${item.obraSocial || 'Sin obra social'}</span>
          ${item.recordatorioWsp ? '<span class="history-chip">WhatsApp</span>' : ''}
          ${item.recordatorioMail ? '<span class="history-chip">Email</span>' : ''}
        </div>
      </article>
    `).join('');

    patientHistoryContent.innerHTML = `
      <div class="profile-summary">
        <div class="profile-summary-grid">
          <div class="summary-item">
            <span class="label">Paciente</span>
            <span class="value">${patient.nombre} ${patient.apellido}</span>
          </div>
          <div class="summary-item">
            <span class="label">Documento</span>
            <span class="value">${patient.documento || 'No informado'}</span>
          </div>
          <div class="summary-item">
            <span class="label">Teléfono</span>
            <span class="value">${patient.telefono || 'No informado'}</span>
          </div>
          <div class="summary-item">
            <span class="label">Mail</span>
            <span class="value">${patient.mail || 'No informado'}</span>
          </div>
          <div class="summary-item">
            <span class="label">Fecha de nacimiento</span>
            <span class="value">${patient.fechaNacimiento ? `${formatDate(patient.fechaNacimiento)} · ${getAgeFromBirthDate(patient.fechaNacimiento)}` : 'No informada'}</span>
          </div>
          <div class="summary-item">
            <span class="label">Obra Social</span>
            <span class="value">${patient.obraSocial || 'No informada'}</span>
          </div>
          <div class="summary-item">
            <span class="label">Médico</span>
            <span class="value">${patient.medico || 'No informado'}</span>
          </div>
          <div class="summary-item" style="grid-column: 1 / -1;">
            <span class="label">Observaciones</span>
            <span class="value">${patient.observaciones || 'Sin observaciones registradas.'}</span>
          </div>
          <div class="summary-item" style="grid-column: 1 / -1;">
            <span class="label">Pedido médico</span>
            <span class="value">
              ${patient.archivos && patient.archivos.length
                ? patient.archivos.map((attachment) => `<a href="${API_BASE}${attachment.url || ''}" target="_blank" rel="noopener noreferrer" class="history-chip">${attachment.name || attachment.originalname || 'Pedido médico'}</a>`).join(' ')
                : 'Sin pedido médico adjunto.'}
            </span>
          </div>
        </div>
      </div>

      <div>
        <p class="eyebrow small">Turnos registrados</p>
        <div class="history-list">${history.length ? historyMarkup : '<div class="empty-state"><h3>Sin historial previo</h3><p>Este paciente todavía no tiene turnos registrados.</p></div>'}</div>
      </div>
    `;

    patientHistoryModal.querySelector('#patientHistoryTitle').textContent = title;
    patientHistoryModal.classList.remove('hidden');
    patientHistoryModal.setAttribute('aria-hidden', 'false');
  } catch (error) {
    alert(error.message);
  }
}

async function renderAgenda() {
  try {
    const patients = sortPatients(await fetchPatients());
    const query = searchInput.value.trim().toLowerCase();
    const today = formatISODate(new Date());

    const doctorOptions = Array.from(new Set(patients.map((patient) => patient.medico).filter(Boolean))).sort();
    const doctorMarkup = doctorOptions.map((doctor) => `
      <option value="${doctor}">${doctor}</option>
    `).join('');

    const isPatientsView = currentView === 'patients';
    const isReportsView = currentView === 'reports';
    const isAgendaView = currentView === 'agenda';
    updateViewControls();

    if (doctorFilter) {
      const currentValue = doctorFilter.value || currentDoctorFilter || 'all';
      doctorFilter.innerHTML = `<option value="all">Todos los médicos</option>${doctorMarkup}`;
      doctorFilter.value = doctorOptions.includes(currentValue) ? currentValue : 'all';
      currentDoctorFilter = doctorFilter.value;
      doctorFilter.disabled = !isAgendaView;
    }

    if (statusFilter) {
      statusFilter.disabled = !isAgendaView;
    }

    const filtered = patients.filter((patient) => {
      const haystack = [
        patient.nombre,
        patient.apellido,
        patient.documento,
        patient.diagnostico,
        patient.medico,
        patient.obraSocial,
        patient.telefono,
        patient.mail
      ].join(' ').toLowerCase();

      const matchesSearch = !query || haystack.includes(query);
      const matchesDoctor = currentDoctorFilter === 'all' || patient.medico === currentDoctorFilter;
      const matchesDate = !currentDateFilter || patient.fechaTurno === currentDateFilter;

      let matchesStatus = true;
      const selectedStatus = isPatientsView ? currentPatientsStatusFilter : currentStatusFilter;
      const patientDate = patient.fechaTurno ? new Date(`${patient.fechaTurno}T00:00:00`) : null;
      const todayDate = new Date(`${today}T00:00:00`);

      if (selectedStatus === 'today') matchesStatus = patient.fechaTurno === today;
      if (selectedStatus === 'week') {
        const weekLimit = new Date(todayDate);
        weekLimit.setDate(weekLimit.getDate() + 7);
        matchesStatus = Boolean(patientDate && patientDate >= todayDate && patientDate <= weekLimit);
      }
      if (selectedStatus === 'month') {
        const monthDate = new Date();
        matchesStatus = Boolean(patientDate && patientDate.getMonth() === monthDate.getMonth() && patientDate.getFullYear() === monthDate.getFullYear());
      }
      if (selectedStatus === 'range-7') {
        const rangeLimit = new Date(todayDate);
        rangeLimit.setDate(rangeLimit.getDate() + 7);
        matchesStatus = Boolean(patientDate && patientDate >= todayDate && patientDate <= rangeLimit);
      }
      if (selectedStatus === 'range-30') {
        const rangeLimit = new Date(todayDate);
        rangeLimit.setDate(rangeLimit.getDate() + 30);
        matchesStatus = Boolean(patientDate && patientDate >= todayDate && patientDate <= rangeLimit);
      }
      if (selectedStatus === 'past') {
        matchesStatus = Boolean(patientDate && patientDate < todayDate);
      }
      if (selectedStatus === 'reminders') matchesStatus = Boolean(patient.recordatorioMail || patient.recordatorioWsp);
      if (selectedStatus === 'without-reminders') matchesStatus = !(patient.recordatorioMail || patient.recordatorioWsp);

      return matchesSearch && matchesDoctor && matchesDate && matchesStatus;
    });

    if (isPatientsView) {
      updateStats(patients);
      if (!filtered.length) {
        agendaList.innerHTML = `
          <div class="empty-state">
            <h3>No se encontraron pacientes</h3>
            <p>Probá con otro nombre, documento o diagnóstico.</p>
          </div>
        `;
        return;
      }

      const patientsSummary = [
        { label: 'Resultados', value: String(filtered.length), tone: 'blue' },
        { label: 'Hoy', value: String(filtered.filter((patient) => patient.fechaTurno === today).length), tone: 'green' },
        { label: 'Con recordatorio', value: String(filtered.filter((patient) => patient.recordatorioMail || patient.recordatorioWsp).length), tone: 'purple' },
        { label: 'Sin recordatorio', value: String(filtered.filter((patient) => !(patient.recordatorioMail || patient.recordatorioWsp)).length), tone: 'orange' }
      ];

      agendaList.innerHTML = `
        <div class="patients-summary-grid">
          ${patientsSummary.map((item) => `
            <div class="patients-summary-card accent-${item.tone}">
              <small>${item.label}</small>
              <strong>${item.value}</strong>
            </div>
          `).join('')}
        </div>

        <div class="patients-table-wrap">
          <table class="patients-table">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Documento</th>
                <th>Teléfono</th>
                <th>Médico</th>
                <th>Próximo turno</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((patient) => `
                <tr>
                  <td>
                    <div class="patient-name-cell">
                      <strong>${patient.nombre} ${patient.apellido}</strong>
                      <small>${patient.obraSocial || 'Sin obra social'}</small>
                    </div>
                  </td>
                  <td>${patient.documento}</td>
                  <td>${patient.telefono}</td>
                  <td>${patient.medico}</td>
                  <td>${patient.fechaTurno ? `${formatDate(patient.fechaTurno)} · ${formatTime(patient.horaTurno)}` : 'Sin turno'}</td>
                  <td>
                    <div class="table-actions">
                      <button class="action-button small" type="button" data-history="${patient.id}">Historial</button>
                      <button class="action-button small" type="button" data-edit="${patient.id}">Editar</button>
                      <button class="action-button small" type="button" data-attach="${patient.id}">Informe</button>
                      <button class="action-button small delete" type="button" data-delete="${patient.id}">Eliminar</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      agendaList.querySelectorAll('[data-edit]').forEach((button) => {
        button.addEventListener('click', () => {
          const patientId = button.dataset.edit;
          const patient = patients.find((item) => item.id === patientId);
          if (!patient) return;

          currentEditId = patientId;
          cancelEditBtn.classList.remove('hidden');
          const formTitle = document.querySelector('.panel-header h2');
          if (formTitle) {
            formTitle.textContent = 'Editar turno';
          }

          const fields = {
            nombre: patient.nombre,
            apellido: patient.apellido,
            documento: patient.documento,
            obraSocial: patient.obraSocial,
            diagnostico: patient.diagnostico,
            medico: patient.medico,
            telefono: patient.telefono,
            mail: patient.mail,
            fechaTurno: patient.fechaTurno,
            horaTurno: patient.horaTurno,
            observaciones: patient.observaciones,
            recordatorioWsp: patient.recordatorioWsp ? 'on' : '',
            recordatorioMail: patient.recordatorioMail ? 'on' : ''
          };

          Object.entries(fields).forEach(([key, value]) => {
            const element = form.elements.namedItem(key);
            if (!element) return;

            if (element.type === 'checkbox') {
              element.checked = Boolean(value);
              return;
            }

            element.value = value || '';
          });

          selectedDate = patient.fechaTurno;
          selectedDateLabel.textContent = formatLongDate(selectedDate);
          document.querySelector('input[name="fechaTurno"]').value = selectedDate;
          toggleFormPanel(true);
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      agendaList.querySelectorAll('[data-attach]').forEach((button) => {
        button.addEventListener('click', () => {
          const patientId = button.dataset.attach;
          const patient = patients.find((item) => item.id === patientId);
          if (!patient) return;

          currentEditId = patientId;
          cancelEditBtn.classList.remove('hidden');
          const formTitle = document.querySelector('.panel-header h2');
          if (formTitle) {
            formTitle.textContent = 'Agregar pedido médico';
          }

          const fields = {
            nombre: patient.nombre,
            apellido: patient.apellido,
            documento: patient.documento,
            obraSocial: patient.obraSocial,
            diagnostico: patient.diagnostico,
            medico: patient.medico,
            telefono: patient.telefono,
            mail: patient.mail,
            fechaTurno: patient.fechaTurno,
            horaTurno: patient.horaTurno,
            observaciones: patient.observaciones,
            recordatorioWsp: patient.recordatorioWsp ? 'on' : '',
            recordatorioMail: patient.recordatorioMail ? 'on' : ''
          };

          Object.entries(fields).forEach(([key, value]) => {
            const element = form.elements.namedItem(key);
            if (!element) return;
            if (element.type === 'checkbox') {
              element.checked = Boolean(value);
              return;
            }
            element.value = value || '';
          });

          selectedDate = patient.fechaTurno;
          selectedDateLabel.textContent = formatLongDate(selectedDate);
          const dateInput = document.querySelector('input[name="fechaTurno"]');
          if (dateInput) dateInput.value = selectedDate;
          toggleFormPanel(true);
          const attachInput = document.querySelector('input[name="archivos"]');
          if (attachInput) attachInput.focus();
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      agendaList.querySelectorAll('[data-history]').forEach((button) => {
        button.addEventListener('click', () => openPatientHistory(button.dataset.history));
      });

      agendaList.querySelectorAll('[data-delete]').forEach((button) => {
        button.addEventListener('click', async () => {
          const patientId = button.dataset.delete;
          try {
            await deletePatientById(patientId);
            await renderAgenda();
          } catch (error) {
            alert(error.message);
          }
        });
      });
      return;
    }

    if (isReportsView) {
      const reportsPatients = patients.filter((patient) => Array.isArray(patient.archivos) && patient.archivos.length > 0);
      const filteredReports = reportsPatients.filter((patient) => {
        const haystack = [
          patient.nombre,
          patient.apellido,
          patient.documento,
          patient.diagnostico,
          patient.medico,
          patient.obraSocial,
          patient.telefono,
          patient.mail,
          ...(patient.archivos || []).map((file) => file.name || file.originalname || '')
        ].join(' ').toLowerCase();

        const matchesQuery = !query || haystack.includes(query);
        const matchesDoctor = currentDoctorFilter === 'all' || patient.medico === currentDoctorFilter;
        const matchesDate = !currentDateFilter || patient.fechaTurno === currentDateFilter;

        return matchesQuery && matchesDoctor && matchesDate;
      });

      updateStats(patients);

      if (!filteredReports.length) {
        agendaList.innerHTML = `
          <div class="empty-state">
            <h3>No hay pedidos médicos adjuntos</h3>
            <p>No se encontraron pacientes con pedidos médicos cargados.</p>
          </div>
        `;
        return;
      }

      const totalFiles = filteredReports.reduce((sum, patient) => sum + (patient.archivos?.length || 0), 0);
      const reportsSummary = [
        { label: 'Pacientes con pedido', value: String(filteredReports.length), tone: 'blue' },
        { label: 'Total de pedidos', value: String(totalFiles), tone: 'purple' },
        { label: 'Hoy', value: String(filteredReports.filter((patient) => patient.fechaTurno === today).length), tone: 'green' }
      ];

      agendaList.innerHTML = `
        <div class="patients-summary-grid">
          ${reportsSummary.map((item) => `
            <div class="patients-summary-card accent-${item.tone}">
              <small>${item.label}</small>
              <strong>${item.value}</strong>
            </div>
          `).join('')}
        </div>

        <div class="patients-table-wrap">
          <table class="patients-table">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Documento</th>
                <th>Fecha</th>
                <th>Pedido médico</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${filteredReports.map((patient) => `
                <tr>
                  <td>
                    <div class="patient-name-cell">
                      <strong>${patient.nombre} ${patient.apellido}</strong>
                      <small>${patient.medico || 'Sin médico'}</small>
                    </div>
                  </td>
                  <td>${patient.documento}</td>
                  <td>${patient.fechaTurno ? `${formatDate(patient.fechaTurno)} · ${formatTime(patient.horaTurno)}` : 'Sin turno'}</td>
                  <td>
                    <div class="attachments">
                      ${(patient.archivos || []).map((attachment) => `
                        <a class="link-button" href="${API_BASE}${attachment.url || ''}" target="_blank" rel="noopener noreferrer">
                          📎 ${attachment.name || attachment.originalname || 'Archivo adjunto'}
                        </a>
                      `).join('')}
                    </div>
                  </td>
                  <td>
                    <div class="table-actions">
                      <button class="action-button small" type="button" data-history="${patient.id}">Historial</button>
                      <button class="action-button small" type="button" data-edit="${patient.id}">Editar</button>
                      <button class="action-button small" type="button" data-attach="${patient.id}">Agregar</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      agendaList.querySelectorAll('[data-edit]').forEach((button) => {
        button.addEventListener('click', () => {
          const patientId = button.dataset.edit;
          const patient = patients.find((item) => item.id === patientId);
          if (!patient) return;

          currentEditId = patientId;
          cancelEditBtn.classList.remove('hidden');
          const formTitle = document.querySelector('.panel-header h2');
          if (formTitle) {
            formTitle.textContent = 'Editar turno';
          }

          const fields = {
            nombre: patient.nombre,
            apellido: patient.apellido,
            documento: patient.documento,
            obraSocial: patient.obraSocial,
            diagnostico: patient.diagnostico,
            medico: patient.medico,
            telefono: patient.telefono,
            mail: patient.mail,
            fechaNacimiento: patient.fechaNacimiento || '',
            fechaTurno: patient.fechaTurno,
            horaTurno: patient.horaTurno,
            observaciones: patient.observaciones,
            recordatorioWsp: patient.recordatorioWsp ? 'on' : '',
            recordatorioMail: patient.recordatorioMail ? 'on' : ''
          };

          Object.entries(fields).forEach(([key, value]) => {
            const element = form.elements.namedItem(key);
            if (!element) return;

            if (element.type === 'checkbox') {
              element.checked = Boolean(value);
              return;
            }

            element.value = value || '';
          });

          selectedDate = patient.fechaTurno;
          selectedDateLabel.textContent = formatLongDate(selectedDate);
          document.querySelector('input[name="fechaTurno"]').value = selectedDate;
          toggleFormPanel(true);
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      agendaList.querySelectorAll('[data-attach]').forEach((button) => {
        button.addEventListener('click', () => {
          const patientId = button.dataset.attach;
          const patient = patients.find((item) => item.id === patientId);
          if (!patient) return;

          currentEditId = patientId;
          cancelEditBtn.classList.remove('hidden');
          const formTitle = document.querySelector('.panel-header h2');
          if (formTitle) {
            formTitle.textContent = 'Agregar pedido médico';
          }

          const fields = {
            nombre: patient.nombre,
            apellido: patient.apellido,
            documento: patient.documento,
            obraSocial: patient.obraSocial,
            diagnostico: patient.diagnostico,
            medico: patient.medico,
            telefono: patient.telefono,
            mail: patient.mail,
            fechaNacimiento: patient.fechaNacimiento || '',
            fechaTurno: patient.fechaTurno,
            horaTurno: patient.horaTurno,
            observaciones: patient.observaciones,
            recordatorioWsp: patient.recordatorioWsp ? 'on' : '',
            recordatorioMail: patient.recordatorioMail ? 'on' : ''
          };

          Object.entries(fields).forEach(([key, value]) => {
            const element = form.elements.namedItem(key);
            if (!element) return;
            if (element.type === 'checkbox') {
              element.checked = Boolean(value);
              return;
            }
            element.value = value || '';
          });

          selectedDate = patient.fechaTurno;
          selectedDateLabel.textContent = formatLongDate(selectedDate);
          const dateInput = document.querySelector('input[name="fechaTurno"]');
          if (dateInput) dateInput.value = selectedDate;
          toggleFormPanel(true);
          const attachInput = document.querySelector('input[name="archivos"]');
          if (attachInput) attachInput.focus();
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      agendaList.querySelectorAll('[data-history]').forEach((button) => {
        button.addEventListener('click', () => openPatientHistory(button.dataset.history));
      });

      return;
    }

    const dayFiltered = selectedDate
      ? filtered.filter((patient) => patient.fechaTurno === selectedDate)
      : filtered;

    updateStats(patients);
    renderMonthCalendar(patients);

    if (!filtered.length || (selectedDate && !dayFiltered.length && !searchInput.value.trim() && currentDoctorFilter === 'all' && currentStatusFilter === 'all')) {
      agendaList.innerHTML = `
        <div class="empty-state">
          <h3>No hay pacientes para el día ${formatDate(selectedDate)}</h3>
          <p>Seleccioná otro día del calendario o agregá un paciente desde este turno.</p>
        </div>
      `;
      return;
    }

    const displayPatients = selectedDate && !searchInput.value.trim() && currentDoctorFilter === 'all' && currentStatusFilter === 'all' ? dayFiltered : filtered;

    if (!displayPatients.length) {
      agendaList.innerHTML = `
        <div class="empty-state">
          <h3>No se encontraron pacientes</h3>
          <p>Probá cambiar los filtros o seleccionar otro día del calendario.</p>
        </div>
      `;
      return;
    }

    agendaList.innerHTML = displayPatients
      .map((patient) => {
        const attendanceState = getAttendanceState(patient);
        return `
          <article class="patient-card">
            <div class="patient-header">
              <div>
                <h3 class="patient-name">${patient.nombre} ${patient.apellido}</h3>
                <span class="badge">📅 ${formatDate(patient.fechaTurno)} · ${formatTime(patient.horaTurno)}</span>
              </div>
              <span class="attendance-badge ${attendanceState.className}">${attendanceState.label}</span>
            </div>

            <div class="attendance-inline">
              <strong>Estado del turno</strong>
              <div class="attendance-actions">
                <button class="action-button attendance-button confirmed ${patient.asistio ? 'selected' : ''}" type="button" data-attendance="true" data-patient-id="${patient.id}">Asistió</button>
                <button class="action-button attendance-button missed ${patient.asistio === false ? 'selected' : ''}" type="button" data-attendance="false" data-patient-id="${patient.id}">No asistió</button>
              </div>
            </div>

            <div class="patient-grid">
              <div class="patient-field">
                <span class="label">Documento</span>
                <span class="value">${patient.documento}</span>
              </div>
              <div class="patient-field">
                <span class="label">Obra social</span>
                <span class="value">${patient.obraSocial || 'No especificada'}</span>
              </div>
              <div class="patient-field">
                <span class="label">Diagnóstico</span>
                <span class="value">${patient.diagnostico}</span>
              </div>
              <div class="patient-field">
                <span class="label">Médico solicitante</span>
                <span class="value">${patient.medico}</span>
              </div>
              <div class="patient-field">
                <span class="label">Teléfono</span>
                <span class="value">${patient.telefono}</span>
              </div>
              <div class="patient-field">
                <span class="label">Mail</span>
                <span class="value">${patient.mail}</span>
              </div>
            </div>

            <div class="observations">
              <span class="label">Observaciones</span>
              <p>${patient.observaciones || 'Sin observaciones.'}</p>
            </div>

            ${
              patient.archivos && patient.archivos.length
                ? `<div class="attachments">
                    ${patient.archivos
                      .map(
                        (attachment) => `
                          <a class="link-button" href="${API_BASE}${attachment.url || ''}" target="_blank" rel="noopener noreferrer">
                            📎 ${attachment.name || attachment.originalname || 'Pedido médico'}
                          </a>
                        `
                      )
                      .join('')}
                  </div>`
                : ''
            }

            <div class="card-actions">
              ${patient.recordatorioWsp ? `<a class="action-button" href="${getWhatsAppLink(patient, patient.asistio ? 'confirmation' : 'reminder')}" target="_blank" rel="noopener noreferrer">${patient.asistio ? 'Confirmación WSP' : 'Recordatorio WSP'}</a>` : ''}
              ${patient.recordatorioMail ? `<a class="action-button" href="${getMailtoLink(patient)}" target="_blank" rel="noopener noreferrer">Mail</a>` : ''}
              <button class="action-button" type="button" data-history="${patient.id}">Historial</button>
              <button class="action-button" type="button" data-edit="${patient.id}">Editar</button>
              <button class="action-button" type="button" data-attach="${patient.id}">Pedido</button>
              <button class="action-button delete" type="button" data-delete="${patient.id}">Eliminar</button>
            </div>
          </article>
        `;
      })
      .join('');

    agendaList.querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const patientId = button.dataset.edit;
        const patient = patients.find((item) => item.id === patientId);
        if (!patient) return;

        currentEditId = patientId;
        cancelEditBtn.classList.remove('hidden');
        const formTitle = document.querySelector('.panel-header h2');
        if (formTitle) {
          formTitle.textContent = 'Editar turno';
        }

        const fields = {
          nombre: patient.nombre,
          apellido: patient.apellido,
          documento: patient.documento,
          obraSocial: patient.obraSocial,
          diagnostico: patient.diagnostico,
          medico: patient.medico,
          telefono: patient.telefono,
          mail: patient.mail,
          fechaNacimiento: patient.fechaNacimiento || '',
          fechaTurno: patient.fechaTurno,
          horaTurno: patient.horaTurno,
          observaciones: patient.observaciones,
          recordatorioWsp: patient.recordatorioWsp ? 'on' : '',
          recordatorioMail: patient.recordatorioMail ? 'on' : ''
        };

        Object.entries(fields).forEach(([key, value]) => {
          const element = form.elements.namedItem(key);
          if (!element) return;

          if (element.type === 'checkbox') {
            element.checked = Boolean(value);
            return;
          }

          element.value = value || '';
        });

        selectedDate = patient.fechaTurno;
        selectedDateLabel.textContent = formatLongDate(selectedDate);
        document.querySelector('input[name="fechaTurno"]').value = selectedDate;
        toggleFormPanel(true);
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    agendaList.querySelectorAll('[data-attach]').forEach((button) => {
      button.addEventListener('click', () => {
        const patientId = button.dataset.attach;
        const patient = patients.find((item) => item.id === patientId);
        if (!patient) return;

        currentEditId = patientId;
        cancelEditBtn.classList.remove('hidden');
        const formTitle = document.querySelector('.panel-header h2');
        if (formTitle) {
          formTitle.textContent = 'Agregar pedido médico';
        }

        const fields = {
          nombre: patient.nombre,
          apellido: patient.apellido,
          documento: patient.documento,
          obraSocial: patient.obraSocial,
          diagnostico: patient.diagnostico,
          medico: patient.medico,
          telefono: patient.telefono,
          mail: patient.mail,
          fechaNacimiento: patient.fechaNacimiento || '',
          fechaTurno: patient.fechaTurno,
          horaTurno: patient.horaTurno,
          observaciones: patient.observaciones,
          recordatorioWsp: patient.recordatorioWsp ? 'on' : '',
          recordatorioMail: patient.recordatorioMail ? 'on' : ''
        };

        Object.entries(fields).forEach(([key, value]) => {
          const element = form.elements.namedItem(key);
          if (!element) return;

          if (element.type === 'checkbox') {
            element.checked = Boolean(value);
            return;
          }

          element.value = value || '';
        });

        selectedDate = patient.fechaTurno;
        selectedDateLabel.textContent = formatLongDate(selectedDate);
        const dateInput = document.querySelector('input[name="fechaTurno"]');
        if (dateInput) dateInput.value = selectedDate;
        toggleFormPanel(true);
        const attachInput = document.querySelector('input[name="archivos"]');
        if (attachInput) attachInput.focus();
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    agendaList.querySelectorAll('[data-history]').forEach((button) => {
      button.addEventListener('click', () => openPatientHistory(button.dataset.history));
    });

    agendaList.querySelectorAll('[data-attendance]').forEach((button) => {
      button.addEventListener('click', async () => {
        const patientId = button.dataset.patientId;
        const patient = patients.find((item) => item.id === patientId);
        if (!patient) return;

        const nextState = button.dataset.attendance === 'true';
        try {
          await updatePatientById(patientId, {
            ...patient,
            asistio: nextState,
            archivos: patient.archivos || []
          });
          await renderAgenda();
          if (nextState && patient.recordatorioWsp) {
            openWhatsAppConversation({ ...patient, asistio: true }, 'confirmation');
          }
        } catch (error) {
          alert(error.message);
        }
      });
    });

    agendaList.querySelectorAll('[data-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const patientId = button.dataset.delete;
        try {
          await deletePatientById(patientId);
          await renderAgenda();
        } catch (error) {
          alert(error.message);
        }
      });
    });
  } catch (error) {
    agendaList.innerHTML = `
      <div class="empty-state">
        <h3>Error al cargar la agenda</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const files = Array.from(formData.getAll('archivos')).filter((file) => file && file.size > 0);

  const patient = {
    id: currentEditId || crypto.randomUUID(),
    nombre: String(formData.get('nombre') || '').trim(),
    apellido: String(formData.get('apellido') || '').trim(),
    documento: String(formData.get('documento') || '').trim(),
    obraSocial: String(formData.get('obraSocial') || '').trim(),
    diagnostico: String(formData.get('diagnostico') || '').trim(),
    medico: String(formData.get('medico') || '').trim(),
    telefono: String(formData.get('telefono') || '').trim(),
    mail: String(formData.get('mail') || '').trim(),
    fechaNacimiento: String(formData.get('fechaNacimiento') || '').trim(),
    fechaTurno: String(formData.get('fechaTurno') || '').trim(),
    horaTurno: String(formData.get('horaTurno') || '').trim(),
    observaciones: String(formData.get('observaciones') || '').trim(),
    recordatorioWsp: formData.get('recordatorioWsp') === 'on',
    recordatorioMail: formData.get('recordatorioMail') === 'on',
    archivos: files
  };

  try {
    if (currentEditId) {
      await updatePatientById(currentEditId, patient);
    } else {
      await createPatient(patient);
    }

    form.reset();
    currentEditId = null;
    cancelEditBtn.classList.add('hidden');
    const formHeader = document.querySelector('.panel-header h2');
    if (formHeader) {
      formHeader.textContent = 'Nuevo turno';
    }
    const dateInput = document.querySelector('input[name="fechaTurno"]');
    if (dateInput) {
      dateInput.value = selectedDate;
    }
    await renderAgenda();
  } catch (error) {
    alert(error.message);
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  try {
    await loginUser(username, password);
    localStorage.setItem(LOGIN_KEY, 'true');
    loginScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    await renderAgenda();
  } catch (error) {
    alert(error.message);
  }
});

newTurnBtn.addEventListener('click', () => {
  currentEditId = null;
  cancelEditBtn.classList.add('hidden');
  const formHeader = document.querySelector('.panel-header h2');
  if (formHeader) {
    formHeader.textContent = 'Nuevo turno';
  }
  form.reset();
  const dateInput = document.querySelector('input[name="fechaTurno"]');
  if (dateInput) {
    dateInput.value = selectedDate;
  }
  toggleFormPanel(true);
});

cancelEditBtn.addEventListener('click', () => {
  currentEditId = null;
  cancelEditBtn.classList.add('hidden');
  const formHeader = document.querySelector('.panel-header h2');
  if (formHeader) {
    formHeader.textContent = 'Nuevo turno';
  }
  form.reset();
  const dateInput = document.querySelector('input[name="fechaTurno"]');
  if (dateInput) {
    dateInput.value = selectedDate;
  }
  toggleFormPanel(false);
});

logoutBtn.addEventListener('click', async () => {
  try {
    await apiRequest(`${API_BASE}/api/logout`, { method: 'POST' });
  } catch (error) {
    console.warn('No se pudo cerrar la sesión del servidor:', error);
  }
  localStorage.removeItem(LOGIN_KEY);
  loginScreen.classList.remove('hidden');
  appShell.classList.add('hidden');
  document.getElementById('password').value = '';
});

historyCloseBtn.addEventListener('click', closePatientHistory);
patientHistoryModal.addEventListener('click', (event) => {
  if (event.target === patientHistoryModal) {
    closePatientHistory();
  }
});

deletedPatientsCloseBtn.addEventListener('click', closeDeletedPatientsModal);
deletedPatientsModal.addEventListener('click', (event) => {
  if (event.target === deletedPatientsModal) {
    closeDeletedPatientsModal();
  }
});
restorePatientsBtn.addEventListener('click', openDeletedPatientsModal);

clearAllBtn.addEventListener('click', async () => {
  const shouldClear = window.confirm('¿Seguro que quieres vaciar toda la agenda?');
  if (!shouldClear) return;

  try {
    await clearPatients();
    await renderAgenda();
  } catch (error) {
    alert(error.message);
  }
});

document.querySelectorAll('.nav-link').forEach((button) => {
  button.addEventListener('click', () => {
    const nextView = button.dataset.view || 'agenda';
    currentView = nextView;
    document.querySelectorAll('.nav-link').forEach((nav) => nav.classList.toggle('active', nav === button));

    if (nextView === 'patients') {
      selectedDate = '';
      currentStatusFilter = 'all';
      currentPatientsStatusFilter = patientsStatusFilter ? patientsStatusFilter.value : 'all';
      if (statusFilter) statusFilter.value = 'all';
      if (patientsStatusFilter) patientsStatusFilter.value = currentPatientsStatusFilter;
    }

    if (nextView === 'reports') {
      currentStatusFilter = 'all';
      currentPatientsStatusFilter = 'all';
      selectedDate = '';
      if (statusFilter) statusFilter.value = 'all';
      if (patientsStatusFilter) patientsStatusFilter.value = 'all';
    }

    renderAgenda();
  });
});

searchInput.addEventListener('input', renderAgenda);

dateFilterInput.addEventListener('change', (event) => {
  currentDateFilter = event.target.value || '';
  renderAgenda();
});

patientsStatusFilter.addEventListener('change', (event) => {
  currentPatientsStatusFilter = event.target.value;
  renderAgenda();
});

doctorFilter.addEventListener('change', (event) => {
  currentDoctorFilter = event.target.value;
  renderAgenda();
});

statusFilter.addEventListener('change', (event) => {
  currentStatusFilter = event.target.value;
  renderAgenda();
});

exportCsvBtn.addEventListener('click', async () => {
  try {
    await downloadExport('csv');
  } catch (error) {
    alert(error.message);
  }
});

exportJsonBtn.addEventListener('click', async () => {
  try {
    await downloadExport('json');
  } catch (error) {
    alert(error.message);
  }
});

importCsvBtn.addEventListener('click', () => {
  if (importCsvInput) {
    importCsvInput.click();
  }
});

importCsvInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const result = await importPatientsFromFile(file);
    alert(result.message || `Se importaron ${result.imported} pacientes.`);
    await renderAgenda();
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = '';
  }
});

backupBtn.addEventListener('click', async () => {
  try {
    await downloadBackup();
    alert('Backup exportado correctamente.');
  } catch (error) {
    alert(error.message);
  }
});

restoreBackupBtn.addEventListener('click', () => {
  if (backupInput) {
    backupInput.click();
  }
});

backupInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const result = await restoreBackupFromFile(file);
    alert(result.message || 'Backup restaurado.');
    await renderAgenda();
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = '';
  }
});

sendRemindersBtn.addEventListener('click', async () => {
  try {
    sendRemindersBtn.disabled = true;
    sendRemindersBtn.textContent = 'Enviando...';

    const result = await apiRequest(`${API_BASE}/api/reminders/send`, {
      method: 'POST',
      body: JSON.stringify({ daysAhead: 7 })
    });

    const modeText = result.mode === 'real' ? 'real' : 'simulado';
    alert(`Recordatorios ${modeText}: ${result.sent} mensajes enviados para ${result.total} pacientes en los próximos 7 días.`);
  } catch (error) {
    alert(error.message);
  } finally {
    sendRemindersBtn.disabled = false;
    sendRemindersBtn.textContent = 'Enviar recordatorios';
  }
});

prevMonthBtn.addEventListener('click', () => {
  const newDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1);
  currentMonthDate = newDate;
  renderAgenda();
});

nextMonthBtn.addEventListener('click', () => {
  const newDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1);
  currentMonthDate = newDate;
  renderAgenda();
});

const dateInput = document.querySelector('input[name="fechaTurno"]');
if (dateInput) {
  dateInput.value = selectedDate;
  selectedDateLabel.textContent = formatLongDate(selectedDate);
  dateInput.addEventListener('input', (event) => {
    selectedDate = event.target.value || selectedDate;
    selectedDateLabel.textContent = formatLongDate(selectedDate);
    renderAgenda();
  });
}

const isLoggedIn = localStorage.getItem(LOGIN_KEY) === 'true';
if (isLoggedIn) {
  loginScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
  renderAgenda();
} else {
  selectedDateLabel.textContent = formatLongDate(selectedDate);
}
