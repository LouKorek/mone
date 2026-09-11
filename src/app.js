import { loadTariffs, computeFare, tariffAt, activePeriod, TARIFF_NAMES, LiveMeter } from './engine.js';
import tariffs from './data/tariffs.json' with { type: 'json' };

loadTariffs(tariffs);

const $ = (id) => document.getElementById(id);
const nis = (n) => '₪ ' + n.toFixed(2);

// ---------- ניווט בין מסכים ----------
const SUBTITLES = { calc: 'מחשבון', live: 'מונה חי', info: 'תעריפים וזכויות' };
document.querySelectorAll('.tabbar [role=tab]').forEach(tab => {
  tab.addEventListener('click', () => showView(tab.dataset.view));
});
function showView(name) {
  document.querySelectorAll('.tabbar [role=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === name)));
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
  $('topSub').textContent = SUBTITLES[name];
}

// ---------- מצב המחשבון ----------
const state = { order: false, airport: null, road6: false, segment18: false, carmel: 0, eilat: false };

function toLocalInputValue(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function startDate() {
  const v = $('when').value;
  return v ? new Date(v) : new Date();
}
function setNow() { $('when').value = toLocalInputValue(new Date()); recalc(); }
$('nowBtn').addEventListener('click', setNow);

// צ'יפים: הזמנה/כביש/אילת הם מתגים; נמל תעופה ומנהרות הכרמל הם בחירה אחת מתוך כמה.
$('chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  const opt = chip.dataset.opt, val = chip.dataset.value;
  if (opt === 'airport') state.airport = state.airport === val ? null : val;
  else if (opt === 'carmel') state.carmel = state.carmel === Number(val) ? 0 : Number(val);
  else state[opt] = !state[opt];
  syncChips(); recalc();
});
function syncChips() {
  document.querySelectorAll('#chips .chip').forEach(c => {
    const opt = c.dataset.opt, val = c.dataset.value;
    const on = opt === 'airport' ? state.airport === val : opt === 'carmel' ? state.carmel === Number(val) : !!state[opt];
    c.setAttribute('aria-pressed', String(on));
  });
}

['km', 'minutes', 'when', 'fastLane', 'asked'].forEach(id => $(id).addEventListener('input', recalc));

function recalc() {
  const start = startDate();
  const info = tariffAt(start);
  $('tarifLine').innerHTML = `תעריף שחל: <b>${info.tariff === 'A' ? "א'" : info.tariff === 'B' ? "ב'" : "ג'"}</b> ${info.label}`;
  const period = activePeriod(start);
  $('periodNote').textContent = `לפי צו הפיקוח על מחירי נסיעה במוניות, ${period.name === 'קבוע' ? 'הסט הקבוע' : 'הוראת השעה'} (${fmtDate(period.valid_from)}${period.valid_to ? '–' + fmtDate(period.valid_to) : ' ואילך'}). המחירים כוללים מע"מ 18%.`;

  const km = Number($('km').value), minutes = Number($('minutes').value);
  if (!(km > 0) && !(minutes > 0)) { $('result').hidden = true; return; }

  const fare = computeFare({ start, km, minutes, fastLane: Number($('fastLane').value) || 0, ...state });
  $('result').hidden = false;
  renderResult('calc', fare);

  renderDiff($('diff'), Number($('asked').value), fare.total);
}
function renderDiff(el, asked, total) {
  if (!(asked > 0)) { el.hidden = true; return; }
  const gap = asked - total;
  el.hidden = false;
  if (gap > 0.5) {
    el.className = 'diff over';
    el.innerHTML = `<b>פער של ${nis(gap)} מעל המחיר המרבי.</b><small>הנהג חייב להפעיל מונה ולתת קבלה מודפסת לבקשתך. אפשר להתלונן במוקד משרד התחבורה *5678.</small>`;
  } else {
    el.className = 'diff ok';
    el.innerHTML = `<b>המחיר תקין</b> — ${gap < -0.5 ? 'אפילו ' + nis(-gap) + ' מתחת למחיר המרבי.' : 'בדיוק לפי הצו.'}`;
  }
}
function renderResult(prefix, fare) {
  $(prefix + 'Total').textContent = nis(fare.total);
  $(prefix + 'CashNote').textContent = `${fare.tariffLabel} · ${fare.dayLabel} · במזומן מעגלים ל-${nis(fare.cashTotal)}`;
  $(prefix + 'Breakdown').innerHTML = fare.lines.map(l => `<div class="${l.key}"><span>${l.label}</span><span>${l.amount.toFixed(2)}</span></div>`).join('');
}
function fmtDate(iso) { const [y, m, d] = iso.split('-'); return `${Number(d)}.${Number(m)}.${y}`; }

setNow();

// ======================= מונה חי =======================
const live = { meter: null, watchId: null, timer: null, lastFix: null, lastTickAt: null, wakeLock: null, speed: null, opts: { order: false, airport: null, road6: false, segment18: false, carmel: 0, eilat: false, fastLane: 0 } };
const STORE_KEY = 'mone.liveRide';
const pad2 = (n) => String(n).padStart(2, '0');
const tariffHe = (t) => ({ A: "א'", B: "ב'", C: "ג'" })[t];

$('liveChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  const opt = chip.dataset.opt, val = chip.dataset.value, o = live.opts;
  if (opt === 'airport') o.airport = o.airport === val ? null : val;
  else if (opt === 'carmel') o.carmel = o.carmel === Number(val) ? 0 : Number(val);
  else o[opt] = !o[opt];
  if (live.meter) Object.assign(live.meter.opts, o);
  syncLiveChips(); renderMeter();
});
$('liveFastLane').addEventListener('input', () => { live.opts.fastLane = Number($('liveFastLane').value) || 0; if (live.meter) live.meter.opts.fastLane = live.opts.fastLane; renderMeter(); });
function syncLiveChips() {
  document.querySelectorAll('#liveChips .chip').forEach(c => {
    const opt = c.dataset.opt, val = c.dataset.value, o = live.opts;
    const on = opt === 'airport' ? o.airport === val : opt === 'carmel' ? o.carmel === Number(val) : !!o[opt];
    c.setAttribute('aria-pressed', String(on));
  });
}

$('liveStart').addEventListener('click', startRide);
$('liveStop').addEventListener('click', stopRide);
$('liveReset').addEventListener('click', resetRide);
$('liveAsked').addEventListener('input', () => { if (live.meter) renderDiff($('liveDiff'), Number($('liveAsked').value), live.meter.snapshot().total); });

function startRide(resumed) {
  if (!live.meter) live.meter = new LiveMeter(new Date(), live.opts);
  live.lastTickAt = Date.now(); live.lastFix = null; live.speed = null;
  $('liveStart').hidden = true; $('liveStop').hidden = false; $('liveResult').hidden = true;
  $('liveHint').textContent = resumed === true ? 'הנסיעה שוחזרה מהזיכרון וממשיכה.' : 'הנסיעה התחילה. השאר את האפליקציה פתוחה עד סוף הנסיעה.';
  $('meter').classList.add('running');
  live.timer = setInterval(onTimer, 1000);
  startGps(); requestWakeLock(); renderMeter();
}
function onTimer() {
  const now = Date.now();
  const dSec = (now - live.lastTickAt) / 1000;   // גם אם הדפדפן "נרדם" לרגע, הזמן לא הולך לאיבוד
  live.lastTickAt = now;
  live.meter.tick(new Date(now), dSec, 0);
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ meter: live.meter.toJSON(), opts: live.opts })); } catch (e) { /* אין אחסון – ממשיכים */ }
  renderMeter();
}
function startGps() {
  if (!('geolocation' in navigator)) { $('meterGps').textContent = 'לא נתמך במכשיר'; return; }
  $('meterGps').textContent = 'מחפש לוויינים…';
  live.watchId = navigator.geolocation.watchPosition(onFix, onGpsError, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
function onFix(pos) {
  const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords;
  const t = pos.timestamp;
  if (accuracy > 60) { $('meterGps').textContent = `דיוק נמוך (${Math.round(accuracy)} מ')`; return; }
  $('meterGps').textContent = `פעיל · דיוק ${Math.round(accuracy)} מ'`;
  if (speed != null && !Number.isNaN(speed)) live.speed = speed * 3.6;
  if (live.lastFix) {
    const d = haversine(live.lastFix.lat, live.lastFix.lon, lat, lon);
    const dt = (t - live.lastFix.t) / 1000;
    const noise = Math.max(4, Math.min(accuracy, live.lastFix.acc) * 0.5);   // תזוזה קטנה מרמת הרעש של ה-GPS = עמידה במקום
    const implied = dt > 0 ? (d / dt) * 3.6 : 0;
    if (d > noise && implied < 160) {
      live.meter.tick(new Date(t), 0, d);
      if (live.speed == null) live.speed = implied;
    }
  }
  live.lastFix = { lat, lon, t, acc: accuracy };
  renderMeter();
}
function onGpsError(err) {
  $('meterGps').textContent = err.code === 1 ? 'אין הרשאת מיקום — אפשר לאשר בהגדרות הדפדפן' : 'אין קליטה כרגע';
}
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
async function requestWakeLock() {
  try { live.wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) { /* לא קריטי */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && live.timer) requestWakeLock(); });

function renderMeter() {
  const m = live.meter;
  if (!m) {
    const t = tariffAt(new Date());
    $('meterLbl').textContent = `מוכן לנסיעה · תעריף ${tariffHe(t.tariff)} · ${t.label}`;
    const base = new LiveMeter(new Date(), live.opts).snapshot();
    $('meterTotal').textContent = nis(base.total);
    $('meterKm').textContent = '0.00'; $('meterTime').textContent = '00:00'; $('meterSpeed').textContent = '— km/h';
    return;
  }
  const s = m.snapshot();
  $('meterLbl').textContent = `${live.timer ? 'מחיר עד עכשיו' : 'סיכום'} · תעריף ${tariffHe(s.tariff)}`;
  $('meterTotal').textContent = nis(s.total);
  $('meterKm').textContent = s.km.toFixed(2);
  const sec = Math.round(m.seconds);
  $('meterTime').textContent = sec >= 3600 ? `${Math.floor(sec / 3600)}:${pad2(Math.floor(sec % 3600 / 60))}:${pad2(sec % 60)}` : `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
  $('meterSpeed').textContent = live.speed == null ? '— km/h' : `${Math.round(live.speed)} km/h`;
}
function stopRide() {
  clearInterval(live.timer); live.timer = null;
  if (live.watchId != null) navigator.geolocation.clearWatch(live.watchId);
  live.wakeLock?.release?.(); live.wakeLock = null;
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* */ }
  $('meter').classList.remove('running'); $('liveStop').hidden = true; $('meterGps').textContent = 'כבוי';
  const fare = live.meter.snapshot();
  renderResult('live', fare);
  $('liveResult').hidden = false; $('liveAsked').value = ''; $('liveDiff').hidden = true;
  $('liveHint').textContent = 'הנסיעה הסתיימה. השווה למה שהנהג מבקש.';
  saveHistory(fare);
  renderMeter();
}
function resetRide() {
  live.meter = null; live.speed = null; live.lastFix = null;
  $('liveResult').hidden = true; $('liveStart').hidden = false;
  $('liveHint').textContent = 'לחץ "התחל נסיעה" כשהנהג מפעיל את המונה.';
  renderMeter();
}
function saveHistory(fare) {
  try {
    const h = JSON.parse(localStorage.getItem('mone.history') || '[]');
    h.unshift({ at: live.meter.start.toISOString(), km: fare.km, minutes: fare.minutes, total: fare.total, tariffs: fare.tariffs, opts: live.meter.opts });
    localStorage.setItem('mone.history', JSON.stringify(h.slice(0, 50)));
  } catch (e) { /* */ }
}
// שחזור נסיעה שנקטעה (למשל אם הדפדפן נסגר)
(function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved) return;
    if (Date.now() - new Date(saved.meter.start).getTime() > 6 * 3600000) { localStorage.removeItem(STORE_KEY); return; }
    live.meter = LiveMeter.fromJSON(saved.meter); Object.assign(live.opts, saved.opts); syncLiveChips();
    showView('live'); startRide(true);
  } catch (e) { /* */ }
})();
renderMeter();
