const DEFAULT_SCHEDULE = [
  { period: 'Period 1', start: '08:45', end: '09:45' },
  { period: 'Period 2', start: '09:45', end: '10:45' },
  { period: 'Period 3', start: '11:00', end: '12:00' },
  { period: 'Period 4', start: '12:00', end: '13:00' },
  { period: 'Period 5', start: '13:35', end: '14:35' },
  { period: 'Period 6', start: '14:35', end: '15:35' }
];

let schedule = DEFAULT_SCHEDULE;

const calendarEl = document.getElementById('calendar');
const dayTemplate = document.getElementById('dayTemplate');
const periodTemplate = document.getElementById('periodTemplate');
const reminderOffsetSelect = document.getElementById('reminderOffset');
const songSelect = document.getElementById('songSelect');
const alarmAudio = document.getElementById('alarmAudio');
const alarmStatus = document.getElementById('alarmStatus');
const stopAlarmBtn = document.getElementById('stopAlarmBtn');
const previewBtn = document.getElementById('previewBtn');
const countdownEl = document.getElementById('countdown');

let weekDays = [];
let triggered = new Set();
let previewing = false;
let nextAlarmTime = null;

const STORAGE_KEY = 'roll-with-it-state-v1';

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    console.warn('Unable to parse saved state', e);
    return {};
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getSchedule() {
  const state = loadState();
  if (Array.isArray(state.schedule) && state.schedule.length) {
    return state.schedule;
  }
  return DEFAULT_SCHEDULE;
}

function getStateFor(dateKey) {
  const state = loadState();
  if (!state[dateKey]) {
    state[dateKey] = {};
    schedule.forEach(({ period }) => {
      state[dateKey][period] = { armed: true };
    });
    saveState(state);
  }
  return state[dateKey];
}

function setClassArmed(dateKey, period, armed) {
  const state = loadState();
  if (!state[dateKey]) state[dateKey] = {};
  state[dateKey][period] = { armed };
  saveState(state);
}

function saveOffset(minutes) {
  const state = loadState();
  state.offset = minutes;
  saveState(state);
}

function getOffset() {
  const state = loadState();
  return Number.isFinite(state.offset) ? state.offset : 5;
}

function setSelectedSong(song) {
  const state = loadState();
  state.song = song;
  saveState(state);
}

function getSelectedSong() {
  const state = loadState();
  return state.song || 'song1.mp3';
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatKey(date) {
  return date.toISOString().slice(0, 10);
}

function getCurrentWeek() {
  const now = new Date();
  const day = now.getDay(); // 0-6 sun-sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function renderCalendar() {
  calendarEl.innerHTML = '';
  weekDays = getCurrentWeek();
  const savedOffset = getOffset();
  reminderOffsetSelect.value = String(savedOffset);

  weekDays.forEach(day => {
    const dateKey = formatKey(day);
    const dayState = getStateFor(dateKey);
    const dayNode = dayTemplate.content.cloneNode(true);
    dayNode.querySelector('.day-name').textContent = day.toLocaleDateString(undefined, { weekday: 'long' });
    dayNode.querySelector('.date').textContent = formatDate(day);
    const periodsEl = dayNode.querySelector('.periods');

    schedule.forEach(({ period, start, end }) => {
      const periodNode = periodTemplate.content.cloneNode(true);
      const row = periodNode.querySelector('.period');
      row.dataset.dateKey = dateKey;
      row.dataset.period = period;
      periodNode.querySelector('.period-label').textContent = period;
      periodNode.querySelector('.time').textContent = `${start} - ${end}`;

      const armed = dayState[period]?.armed ?? true;
      updateRowState(row, armed);

      const toggle = periodNode.querySelector('.toggle');
      toggle.textContent = armed ? 'Armed' : 'Disarmed';
      toggle.addEventListener('click', () => {
        const newState = !(dayState[period]?.armed ?? true);
        dayState[period] = { armed: newState };
        setClassArmed(dateKey, period, newState);
        updateRowState(row, newState);
        toggle.textContent = newState ? 'Armed' : 'Disarmed';
      });

      periodsEl.appendChild(periodNode);
    });

    calendarEl.appendChild(dayNode);
  });
}

function updateRowState(row, armed) {
  row.classList.remove('armed', 'disarmed');
  row.classList.add(armed ? 'armed' : 'disarmed');
}

async function loadSongs() {
  try {
    const res = await fetch('/api/songs');
    const songs = await res.json();
    songSelect.innerHTML = '';
    songs.forEach(song => {
      const opt = document.createElement('option');
      opt.value = song;
      opt.textContent = song;
      songSelect.appendChild(opt);
    });
    const preferred = getSelectedSong();
    if (songs.includes(preferred)) {
      songSelect.value = preferred;
    } else if (songs.length) {
      songSelect.value = songs[0];
      setSelectedSong(songs[0]);
    }
    alarmAudio.src = songSelect.value ? `/songs/${songSelect.value}` : '';
  } catch (e) {
    console.error('Unable to load songs', e);
  }
}

function stopPreview() {
  if (!previewing) return;
  alarmAudio.pause();
  alarmAudio.currentTime = 0;
  previewing = false;
  previewBtn.textContent = 'Preview';
}

function startPreview() {
  if (!alarmAudio.src) return;
  alarmAudio.currentTime = 0;
  alarmAudio.play().then(() => {
    previewing = true;
    previewBtn.textContent = 'Stop preview';
  }).catch(err => console.error('Preview play error', err));
}

function parseTimeOnDate(date, timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function checkAlarms() {
  const now = new Date();
  const todayKey = formatKey(now);
  const todayState = loadState()[todayKey];
  if (!todayState) return;

  schedule.forEach(({ period, start, end }) => {
    const identifier = `${todayKey}-${period}`;
    if (triggered.has(identifier)) return;

    const armed = todayState[period]?.armed ?? true;
    if (!armed) return;

    const offsetMinutes = getOffset();
    const startTime = parseTimeOnDate(now, start);
    const alarmTime = new Date(startTime.getTime() + offsetMinutes * 60 * 1000);
    const endTime = parseTimeOnDate(now, end);

    if (now >= alarmTime && now <= endTime) {
      triggered.add(identifier);
      playAlarm(period, alarmTime);
    }
  });
}

function playAlarm(period, alarmTime) {
  stopPreview();
  if (!alarmAudio.src) return;
  alarmAudio.currentTime = 0;
  alarmAudio.play().catch(err => console.error('Audio play error', err));
  const timeString = alarmTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  alarmStatus.textContent = `Alarm playing for ${period} (${timeString})`;
}

function stopAlarm() {
  alarmAudio.pause();
  alarmAudio.currentTime = 0;
  alarmStatus.textContent = 'Alarm stopped.';
}

function tickStatus() {
  const now = new Date();
  const todayKey = formatKey(now);
  const todayState = loadState()[todayKey];
  if (!todayState) {
    alarmStatus.textContent = 'Waiting for next class.';
    nextAlarmTime = null;
    return;
  }
  const offsetMinutes = getOffset();
  let message = 'Waiting for next class.';
  nextAlarmTime = null;
  for (const { period, start } of schedule) {
    const startTime = parseTimeOnDate(now, start);
    const alarmTime = new Date(startTime.getTime() + offsetMinutes * 60000);
    if (now <= alarmTime && (todayState[period]?.armed ?? true)) {
      message = `Next alarm: ${period} at ${alarmTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      nextAlarmTime = alarmTime;
      break;
    }
  }
  alarmStatus.textContent = message;
}

function tickCountdown() {
  if (!nextAlarmTime) {
    countdownEl.textContent = '--:--:--';
    return;
  }
  const now = new Date();
  const diff = nextAlarmTime - now;
  if (diff <= 0) {
    countdownEl.textContent = '00:00:00';
    return;
  }
  const hours = String(Math.floor(diff / 3600000)).padStart(2, '0');
  const minutes = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
  const seconds = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
  countdownEl.textContent = `${hours}:${minutes}:${seconds}`;
}

function resetTriggeredIfNewDay() {
  const todayKey = formatKey(new Date());
  [...triggered].forEach(key => {
    if (!key.startsWith(todayKey)) {
      triggered.delete(key);
    }
  });
}

function bindEvents() {
  reminderOffsetSelect.addEventListener('change', () => {
    const minutes = Number(reminderOffsetSelect.value);
    saveOffset(minutes);
    triggered.clear(); // re-arm alarms for the day with new timing
    tickStatus();
    tickCountdown();
  });

  songSelect.addEventListener('change', () => {
    setSelectedSong(songSelect.value);
    alarmAudio.src = songSelect.value ? `/songs/${songSelect.value}` : '';
    stopPreview();
  });

  stopAlarmBtn.addEventListener('click', stopAlarm);
  previewBtn.addEventListener('click', () => {
    if (previewing) {
      stopPreview();
    } else {
      startPreview();
    }
  });
}

function init() {
  schedule = getSchedule();
  renderCalendar();
  bindEvents();
  loadSongs();
  tickStatus();
  tickCountdown();
  setInterval(() => {
    resetTriggeredIfNewDay();
    checkAlarms();
    tickStatus();
  }, 10000);

  // Update countdown every second for a smooth timer.
  setInterval(() => {
    tickCountdown();
  }, 1000);
}

document.addEventListener('DOMContentLoaded', init);
