// המונה החי: מסך מלא בזמן נסיעה. מחיר גדול, מפה, תוספות מקופלות, וסיום שמוביל לסיכום.
// המונה ממשיך לרוץ גם כשעוברים למסך אחר; הנסיעה נשמרת כל שנייה לשחזור אחרי סגירה.
import { t } from '../i18n.js';
import { tariffAt, activePeriod, LiveMeter } from '../engine.js';
import { SurchargeDetector, geoDistance } from '../geo.js';
import { geoWatch, geoClear, keepAwake } from '../native.js';
import { draft, newSurcharges, applyDetected, saveRide, updateRide, saveLive, loadLive, clearLive, emit } from '../store.js';
import { rideFromMeter, compactTrack, estimate } from '../ride.js';
import { $, esc, icon, nis, nis0, fmtDuration, defineScreen, go, back, toast, autoName, openSheet, closeSheet, refreshScreen, tariffLabelT } from './dom.js';
import { liveChipsHtml, tapLiveChip } from './tiles.js';
import { roofHtml, digitsHtml, setDigits, fitDigits } from './kit.js';
import { openComplaint } from './more.js';
import { LiveMap, bearing, mapEmptyText } from './map.js';
import { setNearFix } from './route.js';

export const liveState = { running: false };
const live = { gpsDenied: false, meter: null, watchId: null, timer: null, lastFix: null, lastTickAt: null, wakeLock: null, speed: null, opts: newSurcharges(), track: [], det: null, detAirport: false, manual: new Set(), savedAt: null, gps: '', estimated: null, from: null, to: null };
const map = new LiveMap('liveMap');
let pendingReload = null;
export const setPendingReload = (fn) => { pendingReload = fn; };
export const isRunning = () => !!live.timer;

function paintNumbers() {
  if (!$('meterTotal')) return;
  const m = live.meter, running = !!live.timer;
  $('meterState').textContent = running ? t('תפוס') : t('פנוי');
  $('meterState').classList.toggle('busy', running);
  $('meterTotal').classList.toggle('off', !m);
  if ($('liveRoof')) $('liveRoof').outerHTML = roofHtml(new Date(), { id: 'liveRoof', sub: running ? 'countdown' : 'day', button: false, tariff: m ? m.snapshot().tariff : null });
  if (!m) {
    const snap = new LiveMeter(new Date(), live.opts).snapshot();
    setDigits($('meterTotal'), 0); fitDigits($('meterTotal'), 58);
    $('meterSub').hidden = false; $('meterPace').hidden = true;
    $('meterSub').innerHTML = t('המונה יתחיל ב-{amount} ויעלה לפי זמן ומרחק', { amount: `<b>${nis(snap.total)}</b>` });
    $('meterKm').textContent = '0.00'; $('meterTime').textContent = '00:00'; $('meterSpeed').textContent = '—';
    return;
  }
  const s = m.snapshot();
  setDigits($('meterTotal'), s.total); fitDigits($('meterTotal'), 76);
  $('meterKm').textContent = s.km.toFixed(2);
  $('meterTime').textContent = fmtDuration(Math.round(m.seconds));
  $('meterSpeed').textContent = live.speed == null ? '—' : String(Math.round(live.speed));
  $('meterSub').hidden = true;
  const pace = $('meterPace'); pace.hidden = !live.estimated;
  if (live.estimated) {
    $('meterEst').innerHTML = t('הערכה לפני הנסיעה: {amount}', { amount: `<b>${nis0(live.estimated)}</b>` });
    const over = s.total > live.estimated * 1.05;
    $('paceTag').className = 'tag pace' + (over ? ' over' : ''); $('paceTag').textContent = over ? t('מעל ההערכה') : t('בקצב');
  }
}
function paintGps() {
  const g = $('meterGps'); if (!g) return;
  const ok = /±/.test(live.gps), weak = /\(/.test(live.gps) && !ok, off = !live.timer && !ok;
  g.className = 'tag led' + (ok ? '' : weak ? ' weak' : live.gpsDenied ? ' bad' : ' off');
  g.innerHTML = `<span class="pulse"></span><span class="ell">${esc(live.gps || t('GPS כבוי'))}</span>`;
  const w = $('gpsWarn'); if (w) w.hidden = !live.gpsDenied;
}
function paintTiles() {
  const chips = $('liveChips'); if (!chips) return;
  chips.innerHTML = liveChipsHtml(live.opts, live.meter ? live.meter.period : activePeriod(new Date()));
  // נתיב מהיר: הסכום שעל השלט נכתב בשדה מתחת לצ'יפים
  const fl = $('liveFl'), flOn = live.opts.fastLane > 0 || !!live.opts.fastLaneOn;
  if (fl && fl.hidden === flOn) {
    fl.hidden = !flOn;
    if (flOn) $('liveFlAmt').value = live.opts.fastLane > 0 ? live.opts.fastLane : '';
  }
}
export function liveSnapshot() {
  if (!live.meter) return { total: 0, seconds: 0 };
  return { total: live.meter.snapshot().total, seconds: Math.round(live.meter.seconds) };
}

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
  live.gps = t('מחפש לוויינים…'); live.gpsDenied = false; paintGps();
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
  live.gpsDenied = false; live.gps = t("GPS פעיל · ±{n} מ'", { n: Math.round(accuracy) }); paintGps();
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
function onGpsError(err) { live.gpsDenied = err.code === 1; live.gps = err.code === 1 ? t('אין הרשאת מיקום') : err.message === 'unsupported' ? t('GPS לא נתמך') : t('אין קליטת GPS'); paintGps(); }
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
  openEndSheet(ride);
}
// "הגעת": המחיר המרבי, כמה הנהג ביקש והפער — לפני הסיכום
function openEndSheet(ride) {
  const facts = [t('{n} ק"מ', { n: ride.km.toFixed(1) }), t("{n} דק'", { n: Math.round(ride.minutes) }), tariffLabelT(ride.tariffLabel)].join(' · ');
  openSheet(t('הגעת. זה המחיר המרבי:'), `
    <div class="meter"><div class="lcd center" style="padding:18px 16px">${digitsHtml(ride.total, { size: 64 })}<p class="sub">${esc(facts)} · ${t('כולל מע"מ')}</p></div></div>
    <div class="field soft big"><label for="endAsked">${t('כמה הנהג ביקש?')}</label><div class="row"><input id="endAsked" type="number" inputmode="decimal" min="0" step="1" placeholder="₪ 0" value="${ride.asked || ''}"><span id="endGap"></span></div></div>
    <p class="small center" id="endNote" hidden>${t('פער מעל המחיר המרבי. אפשר להגיש תלונה למשרד התחבורה עם הקבלה.')}</p>
    <button type="button" class="btn taxi" id="endSum">${t('לסיכום ולקבלה')}</button>
    <div class="grid2"><button type="button" class="btn ghost" id="endComplain">${icon('shield')}${t('תלונה')}</button><button type="button" class="btn plain" id="endNew">${t('נסיעה חדשה')}</button></div>`, (b) => {
    const paint = () => {
      const g = ride.asked > 0 ? ride.asked - ride.total : null;
      b.querySelector('#endGap').innerHTML = g == null ? '' : g > 0.5 ? `<span class="tag warn">${t('+{amount} מעל', { amount: nis0(g) })}</span>` : `<span class="tag good">${t('בטווח')}</span>`;
      b.querySelector('#endNote').hidden = !(g > 0.5);
    };
    b.querySelector('#endAsked').addEventListener('input', (e) => { ride.asked = Number(e.target.value) || null; updateRide(ride); paint(); });
    b.querySelector('#endSum').onclick = () => { closeSheet(true); refreshScreen(); };
    b.querySelector('#endComplain').onclick = () => { closeSheet(true); refreshScreen(); openComplaint(ride); };
    b.querySelector('#endNew').onclick = () => { closeSheet(true); go('home', {}, { root: true }); };
    paint();
  }, { onClose: () => { if (document.documentElement.dataset.screen === 'summary') refreshScreen(); } });
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
  $('mapEmpty').textContent = resumed ? t('הנסיעה שוחזרה מהזיכרון וממשיכה') : mapEmptyText();
  if (running) { $('mapEmpty').hidden = !!map.ensure(); live.track.forEach((pt, i) => map.addPoint(pt[0], pt[1], i > 0 ? bearing(live.track[i - 1], pt) : null)); map.resize(); }
  paintNumbers(); paintGps(); paintTiles();
}

defineScreen('live', {
  render(el, params = {}) {
    map.destroy();
    el.classList.add('dark-scope');
    el.innerHTML = `
      <header class="top night"><button type="button" class="ibtn night" id="liveBack" aria-label="${t('חזרה')}">${icon('back')}</button><h1 class="title live-title">${t('מונה חי')}</h1><span class="tag led off" id="meterGps"></span></header>
      <div class="live-body">
        <section class="meter deep" id="meterHero" aria-live="off">
          <div class="lcd" style="padding:16px">
            <div class="between"><span class="free state-big" id="meterState">${t('פנוי')}</span><span id="liveRoof"></span></div>
            <div style="margin-top:12px">${digitsHtml(0, { id: 'meterTotal', size: 58, cls: 'off' })}</div>
            <p class="sub" id="meterSub"></p>
            <div class="between" id="meterPace" style="margin-top:8px" hidden><span class="pace" id="meterEst"></span><span class="tag pace" id="paceTag"></span></div>
          </div>
          <div class="meter-stats"><div><b id="meterKm">0.00</b><span>${t('ק"מ')}</span></div><div><b id="meterTime">00:00</b><span>${t('זמן')}</span></div><div><b id="meterSpeed">—</b><span>${t('קמ"ש')}</span></div></div>
        </section>
        <div class="lcd gps-warn" id="gpsWarn" hidden><span class="pulse" style="background:#FF6B6B;box-shadow:0 0 0 4px rgba(255,107,107,.2)"></span><span><b>${t('אין הרשאת מיקום')}</b><small>${t('המונה לא יכול למדוד בלי מיקום.')}</small></span><button type="button" class="btn led sm" id="gpsRetry">${t('אפשר')}</button></div>
        <div class="map" id="liveMap"><div class="map-empty" id="mapEmpty">${mapEmptyText()}</div><button class="recenter" id="recenter" type="button" aria-label="${t('חזור למיקום')}" hidden>${icon('gps')}</button></div>
        <div class="live-chips" id="liveChips" role="group" aria-label="${t('תוספות לנסיעה')}"></div>
        <div class="tile-opt live-fl" id="liveFl" hidden><label class="lbl" for="liveFlAmt">${t('נתיב מהיר – הסכום שעל השלט')}</label><span class="amt">₪<input type="number" inputmode="decimal" min="0" step="0.5" id="liveFlAmt" placeholder="0"></span></div>
      </div>
      <div class="live-foot">
        <button class="btn led xl" id="liveStart" type="button">${icon('play', 'l')}<span>${t('התחל נסיעה')}</span></button>
        <button class="btn stop xl hold" id="liveStop" type="button" hidden><span class="fillbar"></span>${icon('stop')}<span>${t('החזק לסיום הנסיעה')}</span></button>
      </div>`;
    $('liveBack').addEventListener('click', () => { if (!back()) go('home', {}, { root: true }); });
    $('liveStart').addEventListener('click', () => begin(false));
    wireHold($('liveStop'), stop);
    $('gpsRetry').addEventListener('click', () => { geoClear(live.watchId); startGps(); });
    $('liveChips').addEventListener('click', (e) => {
      const c = e.target.closest('[data-chip]'); if (!c) return;
      const key = tapLiveChip(c.dataset.chip, live.opts); if (!key) return;
      if (live.meter) { live.manual.add(key); Object.assign(live.meter.opts, live.opts); }
      paintTiles(); paintNumbers();
      if (key === 'fastLane' && !$('liveFl').hidden) $('liveFlAmt').focus();
    });
    $('liveFlAmt').addEventListener('input', (e) => {
      if (live.meter) live.manual.add('fastLane');
      live.opts.fastLane = Math.max(0, Number(e.target.value) || 0); live.opts.fastLaneOn = true;
      if (live.meter) Object.assign(live.meter.opts, live.opts);
      const chip = $('liveChips').querySelector('[data-chip="fastLane"]');
      if (chip) chip.setAttribute('aria-label', `${t('נתיב מהיר')}, ${live.opts.fastLane > 0 ? nis(live.opts.fastLane) : t('לפי השלט')}`);
      paintNumbers();
    });
    map.onDrag = () => { $('recenter').hidden = false; };
    $('recenter').addEventListener('click', () => { $('recenter').hidden = true; map.recenter(live.lastFix?.lat, live.lastFix?.lon); });
    if (params.start && !live.timer) begin(!!params.fromEstimate);
    paintScreenState(false);
  },
  onShow() { map.resize(); },
});

// "החזק לסיום": לחיצה ארוכה (1.2 שניות) מסיימת, כדי שנגיעה בטעות בכיס לא תעצור את המונה. במקלדת — Enter מסיים מיד.
function wireHold(btn, done) {
  const bar = btn.querySelector('.fillbar'); let t0 = 0, raf = 0;
  const reset = () => { cancelAnimationFrame(raf); t0 = 0; bar.style.width = '0'; };
  const step = () => { const p = Math.min(1, (performance.now() - t0) / 1200); bar.style.width = (p * 100) + '%'; if (p >= 1) { reset(); done(); return; } raf = requestAnimationFrame(step); };
  btn.addEventListener('pointerdown', (e) => { if (e.button > 0) return; t0 = performance.now(); raf = requestAnimationFrame(step); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, () => { if (t0) reset(); }));
  btn.addEventListener('click', (e) => { if (e.detail === 0) done(); });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

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
