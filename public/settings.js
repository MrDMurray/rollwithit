const STORAGE_KEY = 'roll-with-it-state-v1';

const DEFAULT_SCHEDULE = [
  { period: 'Period 1', start: '08:45', end: '09:45' },
  { period: 'Period 2', start: '09:45', end: '10:45' },
  { period: 'Period 3', start: '11:00', end: '12:00' },
  { period: 'Period 4', start: '12:00', end: '13:00' },
  { period: 'Period 5', start: '13:35', end: '14:35' },
  { period: 'Period 6', start: '14:35', end: '15:35' }
];

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getScheduleFromState() {
  const state = loadState();
  if (Array.isArray(state.schedule) && state.schedule.length) {
    return state.schedule;
  }
  return DEFAULT_SCHEDULE;
}

function setScheduleInState(schedule) {
  const state = loadState();
  state.schedule = schedule;
  saveState(state);
}

function createPeriodRow(index, periodConfig) {
  const row = document.createElement('div');
  row.className = 'settings-period-row';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = `Period ${index + 1} name`;
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = periodConfig?.period || `Period ${index + 1}`;
  nameInput.required = true;
  nameInput.className = 'settings-input';
  nameLabel.appendChild(nameInput);

  const startLabel = document.createElement('label');
  startLabel.textContent = 'Start time';
  const startInput = document.createElement('input');
  startInput.type = 'time';
  startInput.value = periodConfig?.start || '08:45';
  startInput.required = true;
  startInput.className = 'settings-input';
  startLabel.appendChild(startInput);

  const endLabel = document.createElement('label');
  endLabel.textContent = 'End time';
  const endInput = document.createElement('input');
  endInput.type = 'time';
  endInput.value = periodConfig?.end || '09:45';
  endInput.required = true;
  endInput.className = 'settings-input';
  endLabel.appendChild(endInput);

  row.appendChild(nameLabel);
  row.appendChild(startLabel);
  row.appendChild(endLabel);

  return row;
}

function renderScheduleEditor() {
  const periodCountInput = document.getElementById('periodCount');
  const periodsContainer = document.getElementById('periodsContainer');

  let schedule = getScheduleFromState();
  periodCountInput.value = String(schedule.length);

  function rebuildRows() {
    const count = Math.max(1, Math.min(12, Number(periodCountInput.value) || schedule.length));
    periodsContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const config = schedule[i];
      const row = createPeriodRow(i, config);
      periodsContainer.appendChild(row);
    }
  }

  periodCountInput.addEventListener('change', rebuildRows);

  rebuildRows();

  const form = document.getElementById('scheduleForm');
  form.addEventListener('submit', event => {
    event.preventDefault();
    const rows = periodsContainer.querySelectorAll('.settings-period-row');
    const newSchedule = [];

    rows.forEach((row, index) => {
      const inputs = row.querySelectorAll('input');
      const name = inputs[0].value.trim();
      const start = inputs[1].value;
      const end = inputs[2].value;
      if (!name || !start || !end) {
        return;
      }
      newSchedule.push({ period: name, start, end });
    });

    if (!newSchedule.length) {
      alert('Please configure at least one period.');
      return;
    }

    setScheduleInState(newSchedule);
    alert('Schedule saved. Your calendar will now use these times.');
  });
}

document.addEventListener('DOMContentLoaded', renderScheduleEditor);

