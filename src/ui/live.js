// המונה החי: מסך מלא בזמן נסיעה. מחיר גדול, מפה, תוספות מקופלות, וסיום שמוביל לסיכום.
// המונה ממשיך לרוץ גם כשעוברים למסך אחר; הנסיעה נשמרת כל שנייה לשחזור אחרי סגירה.
import { t } from '../i18n.js';
import { tariffAt, activePeriod, LiveMeter } from '../engine.js';
import { SurchargeDetector, geoDistance } from '../geo.js';
import { geoWatch, geoClear, keepAwake } from '../native.js';
import { draft, newSurcharges, applyDetected, saveRide, saveLive, loadLive, clearLive, emit } from '../store.js';
import { rideFromMeter, compactTrack, estimate } from '../ride.js';
import { $, icon, nis, fmtDuration, defineScreen, go, back, toast, tariffName, dayLabelT, autoName } from './dom.js';
import { profileBtnHtml } from './account.js';
import { renderTiles, activeCount } from './tiles.js';
import { LiveMap, bearing, mapEmptyText } from './map.js';
import { setNearFix } from './route.js';

export const liveState = { running: false };
const live = { meter: null, watchId: null, timer: null, lastFix: null, lastTickAt: null, wakeLock: null, speed: null, opts: newSurcharges(), track: [], det: null, detAirport: false, manual: new Set(), savedAt: null, gps: '', estimated: null, from: null, to: null };
const map = new LiveMap('liveMap');
let pendingReload = null;
export const setPendingReload = (fn) => { pendingReload = fn; };
export const isRunning = () => !!live.timer;

function paintNumbers() {
  if (!$('meterTotal')) return;
  const m = live.meter;
  if (!m) {
    const ti = tariffAt(new Date());
    $('meterTotal').textContent = nis(new LiveMeter(new Date(), live.opts).snapshot().total);
    $('meterSub').textContent = `${t('מוכן')} · ${tariffName(ti.tariff)} · ${dayLabelT(ti.label)}`;
    $('meterKm').textContent = '0.00'; $('meterTime').textContent = '00:00'; $('meterSpeed').textContent = '—';
    return;
  }
  const s = m.snapshot();
  $('meterTotal').textContent = nis(s.total);
  $('meterSub').textContent = `${live.timer ? t('מחיר עד עכשיו') : t('סיכום')} · ${tariffName(s.tariff)}`;
  $('meterKm').textContent = s.km.toFixed(2);
  $('meterTime').textContent = fmtDuration(Math.round(m.seconds));
  $('meterSpeed').textContent = live.speed == null ? '—' : String(Math.round(live.speed));
  if (live.estimated && $('meterEst')) $('meterEst').textContent = t('הערכה לפני הנסיעה: {amount}', { amount: nis(live.estimated) });
}
function paintGps() { if ($('meterGps')) { $('meterGps').textContent = live.gps || t('GPS כבוי'); $('meterGps').classList.toggle('on', /±/.test(live.gps)); } }
function paintTiles() {
  const box = $('liveTiles'); if (!box) return;
  renderTiles(box, live.opts, live.meter ? live.meter.period : activePeriod(new Date()), {
    onChange: () => { if (live.meter) Object.assign(live.meter.opts, live.opts); paintNumbers(); paintTileCount(); },
    onManual: (k) => { if (live.meter) live.manual.add(k); },
  });
  paintTileCount();
}
function paintTileCount() { const n = activeCount(live.opts); const c = $('liveTileCount'); if (c) c.textContent = n ? t('{n} פעילות', { n }) : t('אין'); }

function start(resumed) {
  if (!live.meter) { live.meter = new LiveMeter(new Date(), live.opts); live.track = []; live.manual = new Set(); }
  live.det = new SurchargeDetector(); live.detAirport = !resumed;   // תוספת שדה תעופה – רק לפי נקודת ההתחלה של נסיעה חדשה
  // שחזור אחרי שהאפליקציה נסגרה: המונה במונית לא עצר — מחייבים גם את הזמן שעבר מאז השמירה האחרונה
  live.lastTickAt = resumed && live.savedAt ? Math.min(Date.now(), live.savedAt) : Date.now(); live.lastFix = null; live.speed = null;
  live.timer = setInterval(onTimer, 1000);
  liveState.running = true;
  startGps(); requestWakeLock();
  if (document.documentElement.dataset.screen === 'live') paintScreenState(resumed);
  emit('live');
}
function onTimer() {
  const now = Date.now();
  live.meter.tick(new Date(now), (now - live.lastTickAt) / 1000, 0);
  live.lastTickAt = now;
  saveLive({ meter: live.meter.toJSON(), opts: live.opts, track: live.track.length > 3000 ? compactTrack(live.track) : live.track, savedAt: now, estimated: live.estimated, from: live.from, to: live.to });
  paintNumbers();
}
async function startGps() {
  live.gps = t('מחפש לוויינים…'); paintGps();
  live.watchId = await geoWatch(onFix, onGpsError, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
// זיהוי אוטומטי של תוספות בזמן הנסיעה (רק מוסיף; מה שהמשתמש שינה ידנית – לא נוגעים)
function detect(lat, lon) {
  if (!live.det || !live.meter) return;
  const r = live.det.feed(lat, lon);
  const within5 = Date.now() - live.meter.start.getTime() < 5 * 60000;
  const target = { opts: live.opts, auto: {} };
  const added = applyDetected(target, { ...r, airport: live.detAirport && within5 ? r.airport : null }, live.manual);
  live.detAirport = false;
  if (added.length) {
    Object.assign(live.meter.opts, live.opts);
    paintTiles(); paintNumbers();
    toast(t('זוהה אוטומטית: {list} — התוספת נוספה למחיר', { list: added.map(([k, v]) => autoName(k, v)).join(', ') }));
  }
}
function onFix(pos) {
  const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords; const ts = pos.timestamp;
  if (accuracy > 60) { live.gps = t("דיוק נמוך ({n} מ')", { n: Math.round(accuracy) }); paintGps(); return; }
  live.gps = t("GPS פעיל · ±{n} מ'", { n: Math.round(accuracy) }); paintGps();
  setNearFix({ lat, lon });
  if (speed != null && !Number.isNaN(speed)) live.speed = speed * 3.6;
  if (live.lastFix) {
    const d = geoDistance(live.lastFix.lat, live.lastFix.lon, lat, lon);
    const dt = (ts - live.lastFix.t) / 1000;
    const noise = Math.max(4, Math.min(accuracy, live.lastFix.acc) * 0.5);
    const implied = dt > 0 ? (d / dt) * 3.6 : 0;
    if (d > noise && implied < 160) {
      live.meter.tick(new Date(ts), 0, d);
      live.track.push([lat, lon]);
      map.addPoint(lat, lon, bearing([live.lastFix.lat, live.lastFix.lon], [lat, lon]));
      if (live.speed == null) live.speed = implied;
      detect(lat, lon);
    }
  } else { live.track.push([lat, lon]); map.addPoint(lat, lon, null); detect(lat, lon); }
  live.lastFix = { lat, lon, t: ts, acc: accuracy };
  paintNumbers();
}
function onGpsError(err) { live.gps = err.code === 1 ? t('אין הרשאת מיקום') : err.message === 'unsupported' ? t('GPS לא נתמך') : t('אין קליטת GPS'); paintGps(); }
async function requestWakeLock() { if (await keepAwake(true)) return; try { live.wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) { /* */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && live.timer) requestWakeLock(); });

function stop() {
  clearInterval(live.timer); live.timer = null; liveState.running = false;
  geoClear(live.watchId); live.watchId = null;
  live.wakeLock?.release?.(); live.wakeLock = null; keepAwake(false);
  clearLive();
  live.gps = t('GPS כבוי');
  map.finish(live.track);
  const ride = rideFromMeter(live.meter, live.track, { estimated: live.estimated, from: live.from, to: live.to });
  saveRide(ride);
  reset();
  emit('live');
  go('summary', { ride, justEnded: true }, { replace: true });
}
function reset() {
  live.meter = null; live.speed = null; live.lastFix = null; live.track = []; live.savedAt = null; live.det = null; live.manual = new Set(); live.estimated = null; live.from = null; live.to = null;
  Object.assign(live.opts, newSurcharges());
  map.destroy();
  if (pendingReload) { const f = pendingReload; pendingReload = null; setTimeout(f, 1500); }
}
// מתחיל נסיעה חדשה; אם באה מההערכה – מעבירים את התוספות שנבחרו ואת המחיר המוערך
function begin(fromEstimate) {
  if (live.timer) return;
  Object.assign(live.opts, newSurcharges());
  live.estimated = null; live.from = null; live.to = null;
  if (fromEstimate) {
    Object.assign(live.opts, draft.opts);
    Object.entries(live.opts).forEach(([k, v]) => { if (v && k !== 'fastLaneOn') live.manual.add(k); });
    const est = estimate(draft); if (est.hasInput) live.estimated = est.fare.total;
    live.from = draft.from?.label || null; live.to = draft.to?.label || null;
  }
  live.meter = null;
  start(false);
}
function paintScreenState(resumed) {
  const running = !!live.timer;
  $('liveStart').hidden = running; $('liveStop').hidden = !running;
  $('meterHero').classList.toggle('running', running);
  $('mapEmpty').textContent = resumed ? t('הנסיעה שוחזרה מהזיכרון וממשיכה') : mapEmptyText();
  if (running) { $('mapEmpty').hidden = !!map.ensure(); live.track.forEach((pt, i) => map.addPoint(pt[0], pt[1], i > 0 ? bearing(live.track[i - 1], pt) : null)); map.resize(); }
  paintNumbers(); paintGps(); paintTiles();
}

defineScreen('live', {
  render(el, params = {}) {
    map.destroy();
    el.innerHTML = `
      <header class="appbar dark"><button type="button" class="iconbtn" id="liveBack" aria-label="${t('חזרה')}">${icon('back')}</button><h1>${t('מונה חי')}</h1><span class="gps" id="meterGps">${t('GPS כבוי')}</span>${profileBtnHtml()}</header>
      <div class="live-wrap">
        <section class="meter-hero" id="meterHero" aria-live="off">
          <span class="amount" id="meterTotal">₪0.00</span>
          <span class="meta" id="meterSub"></span>
          <span class="est" id="meterEst"></span>
          <div class="stats"><span><b id="meterKm">0.00</b>${t('ק"מ')}</span><span><b id="meterTime">00:00</b>${t('זמן')}</span><span><b id="meterSpeed">—</b>${t('קמ"ש')}</span></div>
        </section>
        <div class="map" id="liveMap"><div class="map-empty" id="mapEmpty">${mapEmptyText()}</div><button class="recenter" id="recenter" type="button" aria-label="${t('חזור למיקום')}" hidden>${icon('gps')}</button></div>
        <details class="card details live-tiles"><summary>${t('תוספות')} <span class="count" id="liveTileCount"></span>${icon('chev', 'chev')}</summary><div class="tiles compact" id="liveTiles" role="group" aria-label="${t('תוספות לנסיעה')}"></div></details>
        <button class="btn meter big" id="liveStart" type="button">${icon('play')}<span>${t('התחל נסיעה')}</span></button>
        <button class="btn stop big" id="liveStop" type="button" hidden>${icon('stop')}<span>${t('סיים נסיעה')}</span></button>
      </div>`;
    $('liveBack').addEventListener('click', () => { if (!back()) go('home', {}, { root: true }); });
    $('liveStart').addEventListener('click', () => begin(false));
    $('liveStop').addEventListener('click', stop);
    map.onDrag = () => { $('recenter').hidden = false; };
    $('recenter').addEventListener('click', () => { $('recenter').hidden = true; map.recenter(live.lastFix?.lat, live.lastFix?.lon); });
    if (params.start && !live.timer) begin(!!params.fromEstimate);
    paintScreenState(false);
  },
  onShow() { map.resize(); },
});

// שחזור נסיעה פעילה אחרי שהאפליקציה נסגרה (עד 6 שעות)
export function restoreLive() {
  try {
    const saved = loadLive();
    if (!saved) return false;
    if (Date.now() - new Date(saved.meter.start).getTime() > 6 * 3600000) { clearLive(); return false; }
    live.meter = LiveMeter.fromJSON(saved.meter); Object.assign(live.opts, saved.opts); live.track = saved.track || []; live.savedAt = saved.savedAt || null;
    live.estimated = saved.estimated || null; live.from = saved.from || null; live.to = saved.to || null;
    // מה שכבר מופעל נחשב כבחירה של המשתמש – הזיהוי האוטומטי רק יוסיף
    Object.entries(live.opts).forEach(([k, v]) => { if (v) live.manual.add(k); });
    start(true);
    return true;
  } catch (e) { return false; }
}
