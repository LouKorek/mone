import { loadTariffs, computeFare, tariffAt, activePeriod, getTariffs, TARIFF_NAMES, LiveMeter } from './engine.js';
import tariffs from './data/tariffs.json' with { type: 'json' };
import { DOCS, docHtml } from './legal.js';
import { initCloud, onUser, getUser, signInOrRegister, resetPassword, signInGoogle, signOut, pushRides, pullRides, deleteRideCloud, deleteAccount, errorHe } from './cloud.js';

loadTariffs(tariffs);

const $ = (id) => document.getElementById(id);
const nis = (n) => '₪ ' + Number(n).toFixed(2);
const VAT = 1 + tariffs.vat;
const tariffHe = (t) => ({ A: "א'", B: "ב'", C: "ג'" })[t];
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${Number(d)}.${Number(m)}.${y}`; };
const fmtDT = (d) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ============ ניווט ============
const SUBTITLES = { calc: 'מחשבון', live: 'מונה חי', rides: 'נסיעות', more: 'עוד' };
document.querySelectorAll('.tabbar [role=tab]').forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));
function showView(name) {
  document.querySelectorAll('.tabbar [role=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === name)));
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
  $('topSub').textContent = SUBTITLES[name];
  if (name === 'rides') renderRides();
  if (name === 'live' && gmap.map) setTimeout(() => gmap.map.invalidateSize(), 50);
}

// ============ הודעה קצרה ============
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }

// ============ גיליון תחתון ============
const sheet = $('sheet'), backdrop = $('sheetBackdrop');
let onSheetClose = null;
function openSheet(title, html, after) {
  $('sheetTitle').textContent = title; $('sheetBody').innerHTML = html;
  sheet.hidden = false; backdrop.hidden = false;
  if (after) after($('sheetBody'));
  $('sheetClose').focus();
}
function closeSheet() { sheet.hidden = true; backdrop.hidden = true; if (onSheetClose) { const f = onSheetClose; onSheetClose = null; f(); } }
$('sheetClose').addEventListener('click', closeSheet);
backdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

// ============ אריחי תוספות (משותף למחשבון ולמונה החי) ============
const T = getTariffs();
const sur = (x) => nis(x * VAT);
const TILES = [
  { key: 'order', icon: 'phone', label: 'הזמנה', price: (p) => sur(p.order_surcharge), on: (o) => o.order, tap: (o) => { o.order = !o.order; } },
  { key: 'airport', icon: 'plane', label: (o) => o.airport === 'ramon' ? 'מרמון/חיפה' : 'מנתב"ג',
    price: (p, o) => o.airport === 'ramon' ? sur(T.surcharges.ramon_or_haifa_airport) : sur(T.surcharges.ben_gurion),
    on: (o) => !!o.airport, tap: (o) => { o.airport = o.airport === null ? 'ben-gurion' : o.airport === 'ben-gurion' ? 'ramon' : null; } },
  { key: 'road6', icon: 'road', label: 'כביש 6', price: () => sur(T.surcharges.road6_main), on: (o) => o.road6, tap: (o) => { o.road6 = !o.road6; } },
  { key: 'segment18', icon: 'road', label: 'קטע 18', price: () => sur(T.surcharges.road6_segment18), on: (o) => o.segment18, tap: (o) => { o.segment18 = !o.segment18; } },
  { key: 'carmel', icon: 'tunnel', label: (o) => o.carmel === 2 ? 'כרמל · 2 קטעים' : 'מנהרות הכרמל',
    price: (p, o) => sur(o.carmel === 2 ? T.surcharges.carmel_tunnels_two : T.surcharges.carmel_tunnels_one),
    on: (o) => o.carmel > 0, tap: (o) => { o.carmel = (o.carmel + 1) % 3; } },
  { key: 'fastLane', icon: 'bolt', label: 'נתיב מהיר', price: (p, o) => o.fastLane > 0 ? nis(o.fastLane) : 'לפי השלט', on: (o) => o.fastLane > 0, tap: 'fastLane' },
  { key: 'eilat', icon: 'palm', label: 'אילת', price: () => 'ללא מע"מ', on: (o) => o.eilat, tap: (o) => { o.eilat = !o.eilat; } },
  { key: 'info', icon: 'info', label: 'ידעת?', price: () => 'זכויות', on: () => false, tap: 'info', cls: 'info' },
];
const newOpts = () => ({ order: false, airport: null, road6: false, segment18: false, carmel: 0, eilat: false, fastLane: 0 });

function renderTiles(container, opts, period, onChange) {
  container.innerHTML = TILES.map(t => {
    const label = typeof t.label === 'function' ? t.label(opts) : t.label;
    const price = t.price(period, opts);
    return `<button type="button" class="tile ${t.cls || ''}" data-key="${t.key}" aria-pressed="${t.on(opts)}" aria-label="${label}, ${price}"><svg aria-hidden="true"><use href="#i-${t.icon}"/></svg>${label}<small aria-hidden="true">${price}</small></button>`;
  }).join('');
  container.onclick = (e) => {
    const btn = e.target.closest('.tile'); if (!btn) return;
    const t = TILES.find(x => x.key === btn.dataset.key);
    if (t.tap === 'info') return openRights();
    if (t.tap === 'fastLane') return askFastLane(opts, () => { renderTiles(container, opts, period, onChange); onChange(); });
    t.tap(opts); renderTiles(container, opts, period, onChange); onChange();
  };
}
function askFastLane(opts, done) {
  openSheet('נתיב מהיר', `<p class="note">האגרה בנתיב המהיר משתנה לפי העומס ומוצגת על השלט האלקטרוני בכניסה. הנוסע משלם את הסכום שהוצג (ללא מע"מ נוסף).</p>
    <label class="field"><span>סכום</span><input id="flAmount" type="number" inputmode="decimal" min="0" step="0.5" value="${opts.fastLane || ''}" placeholder="₪"></label>
    <div class="actions"><button class="btn" id="flOk" type="button">אישור</button><button class="btn ghost" id="flClear" type="button">בלי נתיב מהיר</button></div>`, (b) => {
    b.querySelector('#flAmount').focus();
    b.querySelector('#flOk').onclick = () => { opts.fastLane = Number(b.querySelector('#flAmount').value) || 0; closeSheet(); done(); };
    b.querySelector('#flClear').onclick = () => { opts.fastLane = 0; closeSheet(); done(); };
  });
}

// ============ פירוט משותף ============
function breakdownHtml(fare) {
  return `<div class="breakdown">${fare.lines.map(l => `<div><span>${esc(l.label)}</span><span>${l.amount.toFixed(2)}</span></div>`).join('')}
    <div class="total"><span>סה"כ · ${esc(fare.tariffLabel)}</span><span>${nis(fare.total)}</span></div></div>
    <p class="note">${esc(fare.dayLabel)} · במזומן מעגלים ל-${nis(fare.cashTotal)} · ${fare.period === 'קבוע' ? 'הסט הקבוע של הצו' : 'הוראת השעה בצו'} · כולל מע"מ ${Math.round(T.vat * 100)}%</p>`;
}
function diffHtml(asked, total) {
  if (!(asked > 0)) return '';
  const gap = asked - total;
  if (gap > 0.5) return `<div class="diff over"><b>הנהג ביקש ${nis(gap)} מעל המחיר המרבי.</b> אסור לגבות יותר ממה שהמונה מראה (תקנה 512). בקש קבלה מודפסת מהמונה, וצלם את מספר הרישיון על גג המונית. <button type="button" data-open="complaint">איך מתלוננים ›</button></div>`;
  return `<div class="diff ok"><b>המחיר תקין</b> — ${gap < -0.5 ? nis(-gap) + ' מתחת למחיר המרבי.' : 'בדיוק לפי הצו.'}</div>`;
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-open="complaint"]'); if (b) { closeSheet(); openComplaint(); } });

// ============ מחשבון ============
const calc = { opts: newOpts(), fare: null };
function toLocalInputValue(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
const startDate = () => $('when').value ? new Date($('when').value) : new Date();
$('nowBtn').addEventListener('click', () => { $('when').value = toLocalInputValue(new Date()); recalc(); });
['km', 'minutes', 'when', 'asked'].forEach(id => $(id).addEventListener('input', recalc));
$('calcPrice').addEventListener('click', () => { if (calc.fare) openSheet('פירוט המחיר', breakdownHtml(calc.fare) + diffHtml(Number($('asked').value), calc.fare.total)); });

function recalc() {
  const start = startDate();
  const info = tariffAt(start);
  const period = activePeriod(start);
  $('calcTariff').textContent = tariffHe(info.tariff);
  $('calcTariff').title = `${TARIFF_NAMES[info.tariff]} · ${info.label}`;
  renderTiles($('calcTiles'), calc.opts, period, recalcOnly);
  recalcOnly();
  function recalcOnly() {
    const km = Number($('km').value), minutes = Number($('minutes').value);
    const fare = computeFare({ start, km, minutes, ...calc.opts });
    calc.fare = (km > 0 || minutes > 0) ? fare : null;
    $('calcTotal').textContent = nis(fare.total);
    $('calcSub').textContent = calc.fare ? `${fare.tariffLabel} · ${fare.dayLabel} · לפירוט ↑` : `${TARIFF_NAMES[info.tariff]} · ${info.label} · הזן מרחק ודקות`;
    const d = $('calcDiff'); const html = calc.fare ? diffHtml(Number($('asked').value), fare.total) : '';
    d.hidden = !html; d.innerHTML = html;
  }
}
$('when').value = toLocalInputValue(new Date());
recalc();


// ============ מפה (Leaflet + OpenStreetMap) ============
const TAXI_SVG = `<svg viewBox="0 0 32 32"><path d="M7 14l2.2-5A3 3 0 0 1 12 7h8a3 3 0 0 1 2.8 2l2.2 5h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v2a2 2 0 0 1-4 0v-2H11v2a2 2 0 0 1-4 0v-2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zm3.2 0h11.6l-1.4-3.2a1 1 0 0 0-.9-.6h-7a1 1 0 0 0-.9.6zM8 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0zm13 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z" fill="#f2b91d"/><rect x="13" y="4" width="6" height="3" rx="1" fill="#f2b91d"/></svg>`;
const gmap = { map: null, line: null, taxi: null, start: null, follow: true, lastHeading: 0 };
function hasLeaflet() { return typeof window.L !== 'undefined'; }
function ensureMap() {
  if (gmap.map || !hasLeaflet()) return gmap.map;
  $('mapEmpty').hidden = true;
  const m = L.map('map', { zoomControl: false, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  m.setView([32.08, 34.78], 13);
  m.on('dragstart', () => { gmap.follow = false; $('recenter').hidden = false; });
  gmap.line = L.polyline([], { color: '#f2b91d', weight: 5, opacity: .95, lineJoin: 'round' }).addTo(m);
  gmap.map = m;
  return m;
}
$('recenter').addEventListener('click', () => { gmap.follow = true; $('recenter').hidden = true; if (live.lastFix) gmap.map.setView([live.lastFix.lat, live.lastFix.lon], Math.max(gmap.map.getZoom(), 16)); });
function mapReset() {
  if (!gmap.map) return;
  gmap.line.setLatLngs([]); gmap.taxi?.remove(); gmap.taxi = null; gmap.start?.remove(); gmap.start = null; gmap.follow = true; $('recenter').hidden = true;
}
function mapAddPoint(lat, lon, heading) {
  const m = ensureMap(); if (!m) return;
  if (!gmap.start) {
    gmap.start = L.marker([lat, lon], { icon: L.divIcon({ className: 'start-marker', iconSize: [14, 14] }), interactive: false }).addTo(m);
    m.setView([lat, lon], 16);
  }
  gmap.line.addLatLng([lat, lon]);
  if (!gmap.taxi) gmap.taxi = L.marker([lat, lon], { icon: L.divIcon({ className: 'taxi-marker', html: TAXI_SVG, iconSize: [34, 34], iconAnchor: [17, 17] }), interactive: false }).addTo(m);
  else gmap.taxi.setLatLng([lat, lon]);
  if (heading != null) { const svg = gmap.taxi.getElement()?.querySelector('svg'); if (svg) svg.style.transform = `rotate(${heading}deg)`; }
  if (gmap.follow) m.panTo([lat, lon], { animate: true, duration: .5 });
}
function mapFinish(track) {
  if (!gmap.map || track.length < 2) return;
  gmap.follow = false; $('recenter').hidden = true;
  gmap.map.fitBounds(L.latLngBounds(track), { padding: [24, 24], maxZoom: 16 });
}
function bearing(a, b) {
  const r = (x) => x * Math.PI / 180, y = Math.sin(r(b[1] - a[1])) * Math.cos(r(b[0]));
  const x = Math.cos(r(a[0])) * Math.sin(r(b[0])) - Math.sin(r(a[0])) * Math.cos(r(b[0])) * Math.cos(r(b[1] - a[1]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
// מפה קטנה בתוך גיליון (פרטי נסיעה)
function miniMap(el, track) {
  if (!hasLeaflet() || !track || track.length < 2) { el.remove(); return; }
  const m = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
  L.polyline(track, { color: '#f2b91d', weight: 4 }).addTo(m);
  L.marker(track[0], { icon: L.divIcon({ className: 'start-marker', iconSize: [12, 12] }), interactive: false }).addTo(m);
  L.marker(track[track.length - 1], { icon: L.divIcon({ className: 'taxi-marker', html: TAXI_SVG, iconSize: [28, 28], iconAnchor: [14, 14] }), interactive: false }).addTo(m);
  setTimeout(() => { m.invalidateSize(); m.fitBounds(L.latLngBounds(track), { padding: [16, 16], maxZoom: 16 }); }, 50);
}

// ============ מונה חי ============
const live = { meter: null, watchId: null, timer: null, lastFix: null, lastTickAt: null, wakeLock: null, speed: null, opts: newOpts(), track: [] };
const STORE_KEY = 'mone.liveRide';
renderTiles($('liveTiles'), live.opts, activePeriod(new Date()), () => { if (live.meter) Object.assign(live.meter.opts, live.opts); renderMeter(); });
$('liveStart').addEventListener('click', () => startRide(false));
$('liveStop').addEventListener('click', stopRide);

function startRide(resumed) {
  if (!live.meter) { live.meter = new LiveMeter(new Date(), live.opts); live.track = []; }
  live.lastTickAt = Date.now(); live.lastFix = null; live.speed = null;
  mapReset(); ensureMap(); if (gmap.map) setTimeout(() => gmap.map.invalidateSize(), 100);
  live.track.forEach((pt, i) => mapAddPoint(pt[0], pt[1], i > 0 ? bearing(live.track[i - 1], pt) : null));
  $('liveStart').hidden = true; $('liveStop').hidden = false;
  $('livePrice').classList.add('running');
  $('mapEmpty').textContent = resumed ? 'הנסיעה שוחזרה מהזיכרון וממשיכה' : 'המפה תופיע כאן בזמן הנסיעה';
  live.timer = setInterval(onTimer, 1000);
  startGps(); requestWakeLock(); renderMeter();
}
function onTimer() {
  const now = Date.now();
  live.meter.tick(new Date(now), (now - live.lastTickAt) / 1000, 0);
  live.lastTickAt = now;
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ meter: live.meter.toJSON(), opts: live.opts, track: live.track })); } catch (e) { /* */ }
  renderMeter();
}
function startGps() {
  if (!('geolocation' in navigator)) { $('meterGps').textContent = 'GPS לא נתמך'; return; }
  $('meterGps').textContent = 'מחפש לוויינים…';
  live.watchId = navigator.geolocation.watchPosition(onFix, onGpsError, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
function onFix(pos) {
  const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords; const t = pos.timestamp;
  if (accuracy > 60) { $('meterGps').textContent = `דיוק נמוך (${Math.round(accuracy)} מ')`; return; }
  $('meterGps').textContent = `GPS פעיל · ±${Math.round(accuracy)} מ'`;
  if (speed != null && !Number.isNaN(speed)) live.speed = speed * 3.6;
  if (live.lastFix) {
    const d = haversine(live.lastFix.lat, live.lastFix.lon, lat, lon);
    const dt = (t - live.lastFix.t) / 1000;
    const noise = Math.max(4, Math.min(accuracy, live.lastFix.acc) * 0.5);
    const implied = dt > 0 ? (d / dt) * 3.6 : 0;
    if (d > noise && implied < 160) {
      live.meter.tick(new Date(t), 0, d);
      live.track.push([lat, lon]);
      mapAddPoint(lat, lon, bearing([live.lastFix.lat, live.lastFix.lon], [lat, lon]));
      if (live.speed == null) live.speed = implied;
    }
  } else { live.track.push([lat, lon]); mapAddPoint(lat, lon, null); }
  live.lastFix = { lat, lon, t, acc: accuracy };
  renderMeter();
}
function onGpsError(err) { $('meterGps').textContent = err.code === 1 ? 'אין הרשאת מיקום' : 'אין קליטת GPS'; }
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, r = (x) => x * Math.PI / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
async function requestWakeLock() { try { live.wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) { /* */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && live.timer) requestWakeLock(); });

function renderMeter() {
  const m = live.meter;
  if (!m) {
    const t = tariffAt(new Date());
    $('meterTotal').textContent = nis(new LiveMeter(new Date(), live.opts).snapshot().total);
    $('meterSub').textContent = `מוכן · ${TARIFF_NAMES[t.tariff]} · ${t.label}`;
    $('meterKm').textContent = '0.00'; $('meterTime').textContent = '00:00'; $('meterSpeed').textContent = '—';
    return;
  }
  const s = m.snapshot();
  $('meterTotal').textContent = nis(s.total);
  $('meterSub').textContent = `${live.timer ? 'מחיר עד עכשיו' : 'סיכום'} · ${TARIFF_NAMES[s.tariff]}`;
  $('meterKm').textContent = s.km.toFixed(2);
  const sec = Math.round(m.seconds);
  $('meterTime').textContent = sec >= 3600 ? `${Math.floor(sec / 3600)}:${pad2(Math.floor(sec % 3600 / 60))}:${pad2(sec % 60)}` : `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
  $('meterSpeed').textContent = live.speed == null ? '—' : String(Math.round(live.speed));
}
function stopRide() {
  clearInterval(live.timer); live.timer = null;
  if (live.watchId != null) navigator.geolocation.clearWatch(live.watchId);
  live.wakeLock?.release?.(); live.wakeLock = null;
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* */ }
  $('livePrice').classList.remove('running'); $('liveStop').hidden = true; $('meterGps').textContent = 'GPS כבוי';
  mapFinish(live.track);
  const fare = live.meter.snapshot();
  const ride = { id: Date.now(), at: live.meter.start.toISOString(), end: new Date().toISOString(), km: fare.km, minutes: fare.minutes, total: fare.total, cashTotal: fare.cashTotal, tariffLabel: fare.tariffLabel, dayLabel: fare.dayLabel, period: fare.period, lines: fare.lines, opts: { ...live.meter.opts }, track: live.track, asked: null };
  saveRide(ride);
  renderMeter();
  openRideSheet(ride, true);
}
function resetRide() {
  live.meter = null; live.speed = null; live.lastFix = null; live.track = [];
  mapReset(); if (gmap.map) { gmap.map.remove(); gmap.map = null; $('mapEmpty').hidden = false; }
  $('liveStart').hidden = false; $('mapEmpty').textContent = 'המפה תופיע כאן בזמן הנסיעה';
  renderMeter();
}
(function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved) return;
    if (Date.now() - new Date(saved.meter.start).getTime() > 6 * 3600000) { localStorage.removeItem(STORE_KEY); return; }
    live.meter = LiveMeter.fromJSON(saved.meter); Object.assign(live.opts, saved.opts); live.track = saved.track || [];
    renderTiles($('liveTiles'), live.opts, live.meter.period, () => { Object.assign(live.meter.opts, live.opts); renderMeter(); });
    showView('live'); startRide(true);
  } catch (e) { /* */ }
})();
renderMeter();

// ============ נסיעות ============
const HIST_KEY = 'mone.history';
const loadRides = () => { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch (e) { return []; } };
const storeRides = (list) => { try { localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, 100))); } catch (e) { /* */ } };
function saveRide(ride) { const list = loadRides(); list.unshift(ride); storeRides(list); if (getUser()) pushRides([ride]).catch(() => {}); }
function updateRide(ride) { const list = loadRides(); const i = list.findIndex(r => r.id === ride.id); if (i >= 0) list[i] = ride; storeRides(list); if (getUser()) pushRides([ride]).catch(() => {}); }
function renderRides() {
  const list = loadRides();
  $('ridesEmpty').hidden = list.length > 0;
  $('ridesList').innerHTML = list.slice(0, 7).map(r => {
    const d = new Date(r.at);
    return `<button type="button" class="ride" data-id="${r.id}"><span class="meta"><b>${fmtDT(d)}</b><span>${r.km.toFixed(1)} ק"מ · ${Math.round(r.minutes)} דק' · ${esc(r.tariffLabel)}</span></span><span class="amt">${nis(r.total)}</span></button>`;
  }).join('');
  $('ridesList').onclick = (e) => { const b = e.target.closest('.ride'); if (!b) return; const r = loadRides().find(x => x.id === Number(b.dataset.id)); if (r) openRideSheet(r, false); };
}
function openRideSheet(ride, justEnded) {
  const fare = { lines: ride.lines, total: ride.total, cashTotal: ride.cashTotal, tariffLabel: ride.tariffLabel, dayLabel: ride.dayLabel, period: ride.period };
  const html = `<p class="note">${fmtDT(new Date(ride.at))} · ${ride.km.toFixed(2)} ק"מ · ${Math.round(ride.minutes)} דק'</p>
    ${!justEnded && ride.track && ride.track.length > 1 ? '<div class="mini-map" id="miniMap"></div>' : ''}
    ${breakdownHtml(fare)}
    <label class="field asked"><span>הנהג ביקש</span><input id="rideAsked" type="number" inputmode="decimal" min="0" step="1" placeholder="₪" value="${ride.asked || ''}"></label>
    <div id="rideDiff">${diffHtml(ride.asked, ride.total)}</div>
    <div class="actions"><button class="btn" id="rideReceipt" type="button">קבלה לשיתוף</button>${justEnded ? '<button class="btn ghost" id="rideNew" type="button">נסיעה חדשה</button>' : '<button class="btn ghost" id="rideDel" type="button">מחק</button>'}</div>`;
  openSheet(justEnded ? 'סיכום הנסיעה' : 'פרטי הנסיעה', html, (b) => {
    const mm = b.querySelector('#miniMap'); if (mm) miniMap(mm, ride.track);
    b.querySelector('#rideAsked').addEventListener('input', (e) => { ride.asked = Number(e.target.value) || null; updateRide(ride); b.querySelector('#rideDiff').innerHTML = diffHtml(ride.asked, ride.total); });
    b.querySelector('#rideReceipt').addEventListener('click', () => { onSheetClose = null; openReceipt(ride); });
    b.querySelector('#rideNew')?.addEventListener('click', () => { closeSheet(); resetRide(); });
    b.querySelector('#rideDel')?.addEventListener('click', () => { storeRides(loadRides().filter(r => r.id !== ride.id)); if (getUser()) deleteRideCloud(ride.id).catch(() => {}); closeSheet(); renderRides(); });
  });
  if (justEnded) onSheetClose = () => { if (!live.timer) resetRide(); };
}


// ============ קבלה בפורמט מונה ============
const APP_URL = 'mone-taxi.netlify.app';
function receiptLines(ride) {
  const start = new Date(ride.at), end = ride.end ? new Date(ride.end) : null;
  const hm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const head = [
    ['תאריך', `${pad2(start.getDate())}.${pad2(start.getMonth() + 1)}.${start.getFullYear()}`],
    ['התחלה', hm(start)], ['סיום', end ? hm(end) : '—'],
    ['מונית מס\'', ride.taxi || '—'], ['נהג', ride.driver || '—'],
    ['תעריף', `${ride.tariffLabel.replace(/תעריף /g, '')} · ${ride.dayLabel}`],
    ['מרחק', `${ride.km.toFixed(2)} ק"מ`], ['זמן', `${Math.round(ride.minutes)} דק'`],
  ];
  const items = ride.lines.map(l => [l.label, l.amount.toFixed(2)]);
  const foot = [['סה"כ לתשלום', nis(ride.total)], ['במזומן (עיגול)', nis(ride.cashTotal)]];
  if (ride.asked > 0) foot.push(['הנהג ביקש', nis(ride.asked)], [ride.asked - ride.total > 0.5 ? 'פער מעל המחיר המרבי' : 'פער', nis(ride.asked - ride.total)]);
  return { head, items, foot };
}
function renderReceipt(ride) {
  const W = 480, pad = 28, lh = 30;
  const { head, items, foot } = receiptLines(ride);
  const mono = '"IBM Plex Mono", "Courier New", monospace', heb = '"Heebo", "Arial Hebrew", Arial, sans-serif';
  const hasHeb = (v) => /[֐-׿]/.test(v);
  // מעבר ראשון מודד את הגובה, השני מצייר
  const draw = (x, H) => {
    let y = 44;
    if (x) {
      x.fillStyle = '#fbfaf5'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#efece3';
      for (let i = 0; i < W; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 8, 0); x.lineTo(i + 4, 6); x.closePath(); x.fill(); x.beginPath(); x.moveTo(i, H); x.lineTo(i + 8, H); x.lineTo(i + 4, H - 6); x.closePath(); x.fill(); }
      x.direction = 'rtl'; x.fillStyle = '#1c1f26'; x.textAlign = 'center';
      x.font = `700 26px ${heb}`; x.fillText('מ ו נ ה', W / 2, y);
    }
    y += 26;
    if (x) { x.font = `500 14px ${heb}`; x.fillText('קבלת נסיעה · הערכה לפי צו מחירי הנסיעה במוניות', W / 2, y); } y += 18;
    if (x) { x.font = `12px ${heb}`; x.fillStyle = '#666'; x.fillText('(אינה חשבונית מס — המונה במונית הוא הקובע)', W / 2, y); } y += 22;
    const dash = () => { if (x) { x.strokeStyle = '#999'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(pad, y); x.lineTo(W - pad, y); x.stroke(); x.setLineDash([]); } y += 18; };
    const row = (k, v, bold) => {
      if (x) {
        x.fillStyle = '#1c1f26'; x.textAlign = 'right'; x.direction = 'rtl'; x.font = `${bold ? 700 : 400} 15px ${heb}`; x.fillText(k, W - pad, y);
        x.textAlign = 'left';
        if (hasHeb(v)) { x.direction = 'rtl'; x.font = `${bold ? 700 : 500} 15px ${heb}`; }
        else { x.direction = 'ltr'; x.font = `${bold ? 600 : 400} 15px ${mono}`; }
        x.fillText(v, pad, y); x.direction = 'rtl';
      }
      y += lh;
    };
    dash(); head.forEach(([k, v]) => row(k, v)); y += 4; dash();
    items.forEach(([k, v]) => row(k, v)); y += 4; dash();
    foot.forEach(([k, v], i) => row(k, v, i === 0)); y += 4; dash();
    if (x) { x.textAlign = 'center'; x.fillStyle = '#666'; x.font = `12px ${heb}`; x.fillText('חושב ב"מונה" לפי הצו שבתוקף · ' + APP_URL, W / 2, y + 4); }
    y += 20;
    if (x) x.fillText('מדידת GPS עשויה לסטות בכמה אחוזים מהמונה במונית', W / 2, y + 4);
    return y + 40;
  };
  const H = draw(null, 0);
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
  const x = c.getContext('2d'); x.scale(2, 2); draw(x, H);
  return c;
}
async function shareReceipt(ride, btn) {
  const canvas = renderReceipt(ride);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], `mone-${ride.id}.png`, { type: 'image/png' });
  const text = `קבלת נסיעה מ"מונה": ${ride.km.toFixed(1)} ק"מ, ${Math.round(ride.minutes)} דק', ${ride.tariffLabel} — ${nis(ride.total)} (מחיר מרבי לפי הצו).`;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'קבלת נסיעה — מונה', text }); return; }
    if (navigator.share) { await navigator.share({ title: 'קבלת נסיעה — מונה', text: text + ' ' + APP_URL }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  if (btn) btn.textContent = 'הקבלה נשמרה כתמונה';
}
function openReceipt(ride) {
  openSheet('קבלת הנסיעה', `
    <div class="row2"><label class="field"><span>מונית מס'</span><input id="rTaxi" type="text" inputmode="numeric" value="${esc(ride.taxi || '')}" placeholder="על הגג"></label>
    <label class="field"><span>נהג</span><input id="rDriver" type="text" value="${esc(ride.driver || '')}" placeholder="מהלוחית"></label></div>
    <img id="rImg" class="receipt-img" alt="קבלת נסיעה">
    <div class="actions"><button class="btn" id="rShare" type="button">שתף קבלה</button></div>`, (b) => {
    const img = b.querySelector('#rImg');
    const refresh = () => { img.src = renderReceipt(ride).toDataURL('image/png'); };
    ['rTaxi', 'rDriver'].forEach(id => b.querySelector('#' + id).addEventListener('input', (e) => { ride[id === 'rTaxi' ? 'taxi' : 'driver'] = e.target.value.trim(); updateRide(ride); refresh(); }));
    b.querySelector('#rShare').onclick = (e) => shareReceipt(ride, e.currentTarget);
    if (document.fonts?.ready) document.fonts.ready.then(refresh); else refresh();
    refresh();
  });
}

// ============ עוד ============
document.querySelectorAll('#view-more [data-sheet]').forEach(b => b.addEventListener('click', () => ({ account: openAccount, tariffs: openTariffs, rights: openRights, complaint: openComplaint, about: openAbout, terms: () => openDoc('terms'), privacy: () => openDoc('privacy'), accessibility: () => openDoc('accessibility') })[b.dataset.sheet]()));


// ============ חשבון (Firebase) ============
let cloudReady = false;
function accountLabel(u) { return u ? (u.displayName || u.email || 'מחובר') : 'התחברות'; }
function renderAccountRow() {
  const u = getUser();
  $('accountLabel').textContent = accountLabel(u);
  $('accountSub').textContent = u ? 'הנסיעות מסונכרנות בענן' : 'שמור נסיעות בענן וגש אליהן מכל מכשיר';
}
async function syncRides() {
  try {
    const local = loadRides();
    const cloud = await pullRides();
    const byId = new Map(cloud.map(r => [r.id, r]));
    const toPush = local.filter(r => !byId.has(r.id));
    local.forEach(r => { if (!byId.has(r.id)) byId.set(r.id, r); });
    const merged = [...byId.values()].sort((a, b) => new Date(b.at) - new Date(a.at));
    storeRides(merged);
    if (toPush.length) await pushRides(toPush);
    renderRides();
  } catch (e) { console.warn('sync', e); }
}
initCloud().then(() => {
  cloudReady = true;
  onUser((u) => { renderAccountRow(); if (u) syncRides(); });
}).catch(() => { $('accountSub').textContent = 'אין חיבור לאינטרנט — הנסיעות נשמרות במכשיר'; });

function openAccount() {
  const u = getUser();
  if (!cloudReady) return openSheet('חשבון', '<p class="note">החיבור לענן עדיין נטען, או שאין אינטרנט. הנסיעות נשמרות בינתיים במכשיר.</p>');
  if (u) return openProfile(u);
  openSheet('התחברות', `
    <button class="btn" id="aGoogle" type="button"><svg class="gicon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4 5.6-4z"/></svg> המשך עם Google</button>
    <div class="or"><span>או באימייל</span></div>
    <label class="field"><span>אימייל</span><input id="aEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" dir="ltr"></label>
    <label class="field"><span>סיסמה</span><input id="aPass" type="password" autocomplete="current-password" placeholder="6 תווים לפחות" dir="ltr"></label>
    <p class="err" id="aErr" hidden></p>
    <button class="btn ghost" id="aGo" type="button">התחבר</button>
    <button type="button" class="linkbtn" id="aForgot">שכחתי סיסמה</button>
    <p class="note">בהתחברות הראשונה נפתח לך חשבון אוטומטית. בהתחברות אתה מאשר את <a href="#" data-doc="terms">תנאי השימוש</a> ו<a href="#" data-doc="privacy">מדיניות הפרטיות</a>.</p>`, (b) => {
    const err = (m) => { const e = b.querySelector('#aErr'); e.hidden = !m; e.textContent = m || ''; };
    b.querySelector('#aGo').onclick = async () => {
      const email = b.querySelector('#aEmail').value.trim(), pass = b.querySelector('#aPass').value;
      if (!email || !pass) return err('מלא אימייל וסיסמה');
      if (pass.length < 6) return err('הסיסמה חייבת להכיל לפחות 6 תווים');
      b.querySelector('#aGo').disabled = true; err('');
      try { const r = await signInOrRegister(email, pass); closeSheet(); if (r.created) toast('נפתח לך חשבון חדש — ברוך הבא'); }
      catch (e) { err(errorHe(e)); } finally { b.querySelector('#aGo').disabled = false; }
    };
    b.querySelector('#aGoogle').onclick = async () => { err(''); try { await signInGoogle(); closeSheet(); } catch (e) { err(errorHe(e)); } };
    b.querySelector('#aForgot').onclick = async () => {
      const email = b.querySelector('#aEmail').value.trim(); if (!email) return err('כתוב את האימייל שלך ואז לחץ "שכחתי סיסמה"');
      try { await resetPassword(email); err('שלחנו לך מייל לאיפוס הסיסמה'); } catch (e) { err(errorHe(e)); }
    };
  });
}
function openProfile(u) {
  const pid = u.providerData[0]?.providerId;
  openSheet('החשבון שלי', `
    <dl class="kv"><dt>שם</dt><dd>${esc(u.displayName || '—')}</dd><dt>אימייל</dt><dd>${esc(u.email || '—')}</dd><dt>התחברות</dt><dd>${pid === 'google.com' ? 'Google' : 'אימייל וסיסמה'}</dd><dt>נסיעות בענן</dt><dd>${loadRides().length}</dd></dl>
    <p class="note">הנסיעות שלך נשמרות ב-Firebase (שרתי Google בתל אביב) ומסונכרנות לכל מכשיר שבו תתחבר.</p>
    <div class="actions"><button class="btn ghost" id="pOut" type="button">התנתק</button><button class="btn ghost danger" id="pDel" type="button">מחק חשבון</button></div>`, (b) => {
    b.querySelector('#pOut').onclick = async () => { await signOut(); closeSheet(); renderAccountRow(); };
    b.querySelector('#pDel').onclick = () => openDeleteAccount(u);
  });
}
function openDeleteAccount(u) {
  const needPass = u.providerData[0]?.providerId === 'password';
  openSheet('מחיקת חשבון', `
    <p>המחיקה מוחקת לצמיתות את החשבון ואת כל הנסיעות השמורות בענן. הנסיעות שבמכשיר הזה יישארו רק אם תבחר להשאירן.</p>
    ${needPass ? '<label class="field"><span>סיסמה לאישור</span><input id="dPass" type="password" autocomplete="current-password" dir="ltr"></label>' : '<p class="note">ייתכן שתתבקש לאשר מחדש את ההתחברות עם Google.</p>'}
    <label class="check"><input id="dLocal" type="checkbox" checked> למחוק גם את הנסיעות שבמכשיר הזה</label>
    <p class="err" id="dErr" hidden></p>
    <div class="actions"><button class="btn danger" id="dGo" type="button">מחק לצמיתות</button><button class="btn ghost" id="dNo" type="button">ביטול</button></div>`, (b) => {
    b.querySelector('#dNo').onclick = () => openProfile(u);
    b.querySelector('#dGo').onclick = async () => {
      const e = b.querySelector('#dErr'); e.hidden = true; b.querySelector('#dGo').disabled = true;
      try {
        await deleteAccount(needPass ? b.querySelector('#dPass').value : null);
        if (b.querySelector('#dLocal').checked) storeRides([]);
        closeSheet(); renderAccountRow(); renderRides();
        openSheet('החשבון נמחק', '<p>החשבון וכל הנתונים בענן נמחקו. תודה שהשתמשת ב"מונה".</p>');
      } catch (err) { e.hidden = false; e.textContent = errorHe(err); b.querySelector('#dGo').disabled = false; }
    };
  });
}

function openTariffs() {
  const p = activePeriod(new Date());
  const row = (label, a, b, c) => `<tr><td>${label}</td><td class="n">${a}</td><td class="n">${b}</td><td class="n">${c}</td></tr>`;
  const v = (x) => (x * VAT).toFixed(2);
  openSheet('התעריפים הנוכחיים', `
    <p class="note">${p.name === 'קבוע' ? 'הסט הקבוע' : 'הוראת שעה'} · ${fmtDate(p.valid_from)}${p.valid_to ? '–' + fmtDate(p.valid_to) : ' ואילך'} · המחירים כאן כוללים מע"מ 18% (באילת: המחיר הנקוב בצו, ללא מע"מ)</p>
    <table class="tbl"><tr><th></th><th>א'</th><th>ב'</th><th>ג'</th></tr>
      ${row('הפעלת המונה', v(p.start), v(p.start), v(p.start))}
      ${row('לכל דקה', v(p.per_min.A), v(p.per_min.B), v(p.per_min.C))}
      ${row('לכל ק"מ, עד 10 ק"מ', v(p.per_km_upto10.A), v(p.per_km_upto10.B), v(p.per_km_upto10.C))}
      ${row('לכל ק"מ, מעל 10 ק"מ', v(p.per_km_over10.A), v(p.per_km_over10.B), v(p.per_km_over10.C))}
      ${row('שעת המתנה', v(p.wait_hour.A), v(p.wait_hour.B), v(p.wait_hour.C))}
    </table>
    <table class="tbl"><tr><th>תוספת</th><th></th></tr>
      <tr><td>הזמנת מונית</td><td class="n">${v(p.order_surcharge)}</td></tr>
      <tr><td>יציאה מנתב"ג / מרמון וחיפה</td><td class="n">${v(T.surcharges.ben_gurion)} / ${v(T.surcharges.ramon_or_haifa_airport)}</td></tr>
      <tr><td>כביש 6 / קטע 18</td><td class="n">${v(T.surcharges.road6_main)} / ${v(T.surcharges.road6_segment18)}</td></tr>
      <tr><td>מנהרות הכרמל, קטע / שניים</td><td class="n">${v(T.surcharges.carmel_tunnels_one)} / ${v(T.surcharges.carmel_tunnels_two)}</td></tr>
      <tr><td>נתיב מהיר</td><td class="n">לפי השלט</td></tr>
    </table>
    <table class="tbl"><tr><th>מתי חל כל תעריף</th><th>א'</th><th>ב'</th><th>ג'</th></tr>
      ${row('ראשון–רביעי', '06:00–21:00', '21:01–05:59', '—')}
      ${row('חמישי', '06:00–21:00', '21:01–23:00', '23:01–05:59')}
      ${row('שישי וערב חג', '06:00–16:00', '16:01–21:00', '21:01–05:59')}
      ${row('שבת וחג', '—', '06:00–19:00', '19:01–05:59')}
    </table>
    <p class="note">מקור: צו פיקוח על מחירי מצרכים ושירותים (מחירי נסיעה במוניות), התשע"ח–2018, כפי שתוקן ב-30.3.2026.</p>`);
}

const FACTS = [
  ['המונה חובה — בכל נסיעה מיוחדת', 'הנהג מפעיל את המונה כשהמונית עומדת לרשותך, ומכבה בסיום. "ספיישל" במחיר קבוע מותר רק אם הוא נמוך ממה שהמונה היה מראה.', 'תקנות התעבורה 510, 512'],
  ['אסור לגבות שום דבר מעבר למונה', 'לא "עמלת אשראי", לא טיפ חובה, לא דמי מזוודות. רק התוספות שבצו: הזמנה, יציאה משדה תעופה, כבישי אגרה שביקשת.', 'תקנה 512(3)'],
  ['מספר נוסעים לא משנה את המחיר', 'עד המותר ברישיון הרכב, ועוד שני ילדים מתחת לגיל 5. גם ואן גדול או מונית נגישה — אותו תעריף.', 'תקנה 502; התוספת בוטלה ב-2020'],
  ['מזוודות — חינם', 'התוספת על כבודה פקעה ב-31.12.2020. הנהג חייב לעזור בהטענה ובפריקה.', 'תקנה 504; הצו, חלק ד\' סעיף 3'],
  ['נוסע עם מוגבלות', 'אסור לסרב, אסור לגבות תוספת על כיסא גלגלים או כלב נחייה, והנהג חייב לסייע בעלייה ובירידה. מונית נגישה שהוזמנה מחברה — עד חצי שעה.', 'חוק שוויון זכויות לאנשים עם מוגבלות'],
  ['הדרך הקצרה, והיעד שאתה בוחר', 'הנהג חייב לנסוע בדרך הקצרה ביותר בנסיבות, ולכבד מסלול שביקשת. אפשר לשנות יעד תוך כדי נסיעה.', 'תקנה 503'],
  ['אסור לסרב', 'הנהג חייב להסיע כל נוסע ומטענו לכל יעד, אלא מסיבה סבירה. אסור להתנות בנסיעה ארוכה או במחיר.', 'תקנה 501'],
  ['המונה חייב להיות גלוי', 'צג המונה חייב להיות גלוי לנוסעים מכל המושבים, כל הנסיעה.', 'תקנה 509(ב)'],
  ['קבלה', 'בקש קבלה מודפסת מהמונה — היא הבסיס לכל תלונה. באפליקציה הזו תוכל להפיק "קבלה" משלך להשוואה (בשלב הבא).', ''],
  ['עישון ורדיו', 'אסור לנהג לעשן כשיש נוסעים; חייב להנמיך רדיו לפי בקשה.', 'משרד התחבורה — חובות הנהג'],
];
function openRights() {
  openSheet('ידעת? זכויות הנוסע', `<div class="facts">${FACTS.map(([t, d, s]) => `<div class="fact"><b>${t}</b>${d}${s ? `<small>${s}</small>` : ''}</div>`).join('')}</div>`);
}

function openComplaint() {
  const rides = loadRides(); const last = rides[0];
  const when = last ? fmtDT(new Date(last.at)) : fmtDT(new Date());
  openSheet('הגשת תלונה על נהג', `
    <p class="note">משרד התחבורה מטפל בתלונות על הפקעת מחיר, אי הפעלת מונה, סירוב להסיע ועוד — רק אם הוגשו <b>עד חודשיים</b> מהאירוע, עם הפרטים שלמטה.</p>
    <label class="field"><span>מס' רישיון המונית</span><input id="cTaxi" type="text" inputmode="numeric" placeholder="על ה'כובע' ועל הדלת האחורית"></label>
    <label class="field"><span>שם בעל המונית / הנהג</span><input id="cDriver" type="text" placeholder="מהלוחית שבתוך המונית"></label>
    <label class="field"><span>תאריך ושעה</span><input id="cWhen" type="text" value="${when}"></label>
    <label class="field"><span>מקום</span><input id="cWhere" type="text" placeholder="מאיפה לאן"></label>
    <textarea id="cText" placeholder="מה קרה? (למשל: הנהג דרש 140 ₪ בעוד שהמונה/החישוב לפי הצו הוא 117 ₪)">${last && last.asked ? `הנהג דרש ${nis(last.asked)}; המחיר המרבי לפי הצו לנסיעה של ${last.km.toFixed(1)} ק"מ ו-${Math.round(last.minutes)} דקות (${last.tariffLabel}) הוא ${nis(last.total)}.` : ''}</textarea>
    <div class="actions"><button class="btn" id="cCopy" type="button">העתק את הטקסט</button><a class="btn ghost" href="tel:*8787" style="text-decoration:none;display:flex;align-items:center;justify-content:center">חייג *8787</a></div>
    <p class="note">הגשה: <a href="https://www.gov.il/he/pages/taxi_driver_and_passenger_information?chapterIndex=2" target="_blank" rel="noopener">משרד התחבורה — הגשת תלונה על נהג מונית</a>. צרף קבלה וצילום מספר המונית.</p>`, (b) => {
    b.querySelector('#cCopy').onclick = async () => {
      const g = (id) => b.querySelector(id).value.trim();
      const txt = `תלונה על נהג מונית\nמס' רישיון המונית: ${g('#cTaxi')}\nבעל המונית/הנהג: ${g('#cDriver')}\nתאריך ושעה: ${g('#cWhen')}\nמקום: ${g('#cWhere')}\n\n${g('#cText')}\n\n(חושב באמצעות אפליקציית "מונה" לפי צו פיקוח על מחירי נסיעה במוניות)`;
      try { await navigator.clipboard.writeText(txt); b.querySelector('#cCopy').textContent = 'הועתק ✓'; } catch (e) { b.querySelector('#cCopy').textContent = 'לא ניתן להעתיק'; }
    };
  });
}

function openDoc(key) { openSheet(DOCS[key].title, `<div class="legal">${docHtml(key)}</div>`); }
document.addEventListener('click', (e) => { const a = e.target.closest('a[data-doc]'); if (a) { e.preventDefault(); openDoc(a.dataset.doc); } });

function openAbout() {
  openSheet('אודות', `<p>"מונה" מחשבת את המחיר המרבי החוקי של נסיעה במונית מיוחדת בישראל, לפי צו פיקוח על מחירי מצרכים ושירותים (מחירי נסיעה במוניות), התשע"ח–2018, כפי שתוקן ב-30.3.2026 (ק"ת 12345), ולפי תקנות התעבורה.</p>
    <p class="note">החישוב הוא הערכה: המונה המכויל במונית הוא הקובע, ומדידת GPS יכולה לסטות בכמה אחוזים. התעריפים מתעדכנים כל 1 באפריל.</p>
    <p class="note">מקורות: <a href="https://www.gov.il/he/pages/taxi-rate-2026" target="_blank" rel="noopener">משרד התחבורה — תעריפי מוניות 2026</a> · <a href="https://he.wikisource.org/wiki/צו_פיקוח_על_מחירי_מצרכים_ושירותים_(מחירי_נסיעה_במוניות)" target="_blank" rel="noopener">נוסח הצו</a> · <a href="https://www.kolzchut.org.il/he/זכותון_נסיעה_במונית_מיוחדת_(ספיישל)" target="_blank" rel="noopener">כל-זכות</a></p>
    <p class="note">גרסה 0.8 · לו קורק · lou.korek@gmail.com · <a href="#" data-doc="terms">תנאי שימוש</a> · <a href="#" data-doc="privacy">פרטיות</a> · <a href="#" data-doc="accessibility">נגישות</a></p>`);
}
