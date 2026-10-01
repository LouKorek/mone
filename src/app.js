import { loadTariffs, computeFare, tariffAt, activePeriod, getTariffs, TARIFF_NAMES, LiveMeter } from './engine.js';
import tariffs from './data/tariffs.json' with { type: 'json' };
import { DOCS, docHtml } from './legal.js';
import { initCloud, onUser, getUser, redirectOutcome, signInOrRegister, resetPassword, signInGoogle, signInApple, signOut, pushRides, pullRides, deleteRideCloud, deleteAccount, errorHe } from './cloud.js';
import { isNative, platform, geoWatch, geoOnce, geoClear, keepAwake, shareImage, shareText, hasNativeApple, initNative } from './native.js';
import { initLang, t, lang, isRtl, LANGS, setLang, translateStatic } from './i18n.js';
import { SurchargeDetector, detectSurcharges, decodePolyline } from './geo.js';

// ⚠️ הקוד כולו מאוחד לסקריפט אחד (build.mjs): כל const/let שמשמש בזמן הטעינה חייב להיות מוגדר לפני השימוש.
// לכן כל משתני המצב מוגדרים כאן למעלה, לפני הקריאה הראשונה ל-recalc().
initLang();
loadTariffs(tariffs);
const BUILD = '__BUILD__';     // מוחלף בזמן הבנייה (build.mjs)
const VERSION = '__VERSION__'; // מוחלף בזמן הבנייה מ-package.json
const APP_URL = 'mone-taxi.netlify.app';
const API_BASE = isNative() ? `https://${APP_URL}` : '';
const COMPLAINT_FORM = 'https://govforms.gov.il/mw/forms/PublicTransportRequest@mot.gov.il';
const T = getTariffs();
const VAT = 1 + tariffs.vat;

const $ = (id) => document.getElementById(id);
const nis = (n) => '₪ ' + Number(n).toFixed(2);
const nis0 = (n) => '₪ ' + Math.round(Number(n));
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${Number(d)}.${Number(m)}.${y}`; };
const fmtDT = (d) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const hm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtNum = (n) => Number.isInteger(n) ? String(n) : Number(n).toFixed(1);

// ---- תוויות מתורגמות (המנוע מחזיר עברית) ----
const TARIFF_LETTER = { A: "א'", B: "ב'", C: "ג'" };
const tariffShort = (k) => t(TARIFF_LETTER[k]);
const tariffName = (k) => t(TARIFF_NAMES[k]);
const tariffLabelT = (label) => String(label || '').split(' + ').map((x) => t(x)).join(' + ');
function dayLabelT(label) {
  if (!label) return '';
  if (label.startsWith('ערב ') && label !== 'ערב שבת') return t('ערב {name}', { name: t(label.slice(4)) });
  return t(label);
}
const periodT = (p) => p === 'קבוע' ? t('הסט הקבוע של הצו') : t('הוראת השעה בצו');
function lineLabel(l) {
  const sfx = l.tariff ? ` (${tariffName(l.tariff)})` : '';
  switch (l.key) {
    case 'start': return t('הפעלת המונה');
    case 'time': if (l.qty != null) return t("{n} דק' × {rate}", { n: fmtNum(l.qty), rate: l.rate.toFixed(2) }) + sfx; break;
    case 'km': if (l.qty != null) return t('{n} ק"מ × {rate}', { n: fmtNum(l.qty), rate: l.rate.toFixed(2) }) + sfx; break;
    case 'km10': if (l.qty != null) return t('{n} ק"מ מעל 10 × {rate}', { n: fmtNum(l.qty), rate: l.rate.toFixed(2) }) + sfx; break;
    case 'order': return t('הזמנת מונית');
    case 'airport': if (l.which) return l.which === 'ramon' ? t('יציאה משדה תעופה רמון/חיפה') : t('יציאה מנתב"ג'); break;
    case 'road6': return t('כביש 6');
    case 'seg18': return t('כביש 6 – קטע 18');
    case 'carmel': if (l.n) return l.n === 2 ? t('מנהרות הכרמל – שני קטעים') : t('מנהרות הכרמל – קטע אחד'); break;
    case 'vat': return t('מע"מ {p}%', { p: Math.round((l.rate ?? T.vat) * 100) });
    case 'fastlane': return t('נתיב מהיר (לפי השלט)');
  }
  return t(l.label);   // נסיעות ישנות שנשמרו לפני שהיו שדות מובנים
}

// ============ מצב האפליקציה (מוגדר מוקדם – ראו הערה למעלה) ============
const newOpts = () => ({ order: false, airport: null, road6: false, segment18: false, carmel: 0, eilat: false, fastLane: 0 });
const calc = { opts: newOpts(), fare: null, auto: {} };
const route = { from: null, to: null, token: null, timer: null, active: null, req: 0, near: null, result: null, points: null, found: [], items: [], sel: -1 };
const live = { meter: null, watchId: null, timer: null, lastFix: null, lastTickAt: null, wakeLock: null, speed: null, opts: newOpts(), track: [], det: null, manual: new Set(), savedAt: null };
const gmap = { map: null, line: null, taxi: null, start: null, follow: true, lastHeading: 0 };
const pwa = { reloadPending: false, installEvt: null };
const PLACES_KEY = 'mone.places';
const places = (() => { try { return Object.assign({ home: null, work: null, recent: [] }, JSON.parse(localStorage.getItem(PLACES_KEY) || '{}')); } catch (e) { return { home: null, work: null, recent: [] }; } })();
let sheetRide = null;      // הנסיעה שמוצגת כרגע בגיליון (לתלונה מתוך הגיליון)
let cloudReady = false;
let accountReq = 0;

translateStatic();

// ============ ניווט ============
const SUBTITLES = { calc: 'מחשבון', live: 'מונה חי', rides: 'נסיעות', more: 'עוד' };
document.querySelectorAll('.tabbar [role=tab]').forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));
function showView(name) {
  document.querySelectorAll('.tabbar [role=tab]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.view === name)));
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
  $('topSub').textContent = t(SUBTITLES[name]);
  if (name === 'rides') renderRides();
  if (name === 'live' && gmap.map) setTimeout(() => gmap.map.invalidateSize(), 50);
}

// ============ הודעה קצרה ============
function toast(msg) { const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 3600); }

// ============ גיליון תחתון ============
const sheet = $('sheet'), backdrop = $('sheetBackdrop');
let onSheetClose = null;
function openSheet(title, html, after) {
  sheetRide = null;
  $('sheetTitle').textContent = title; $('sheetBody').innerHTML = html;
  sheet.hidden = false; backdrop.hidden = false;
  if (after) after($('sheetBody'));
  $('sheetClose').focus();
}
function closeSheet() { sheet.hidden = true; backdrop.hidden = true; sheetRide = null; if (onSheetClose) { const f = onSheetClose; onSheetClose = null; f(); } }
$('sheetClose').addEventListener('click', closeSheet);
backdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

// ============ אריחי תוספות (משותף למחשבון ולמונה החי) ============
const sur = (x) => nis(x * VAT);
const TILES = [
  { key: 'order', icon: 'phone', label: () => t('הזמנה'), price: (p) => sur(p.order_surcharge), on: (o) => o.order, tap: (o) => { o.order = !o.order; } },
  { key: 'airport', icon: 'plane', label: (o) => o.airport === 'ramon' ? t('מרמון/חיפה') : t('מנתב"ג'),
    price: (p, o) => o.airport === 'ramon' ? sur(T.surcharges.ramon_or_haifa_airport) : sur(T.surcharges.ben_gurion),
    on: (o) => !!o.airport, tap: (o) => { o.airport = o.airport ? null : 'ben-gurion'; } },
  { key: 'road6', icon: 'road', label: () => t('כביש 6'), price: () => sur(T.surcharges.road6_main), on: (o) => o.road6, tap: (o) => { o.road6 = !o.road6; } },
  { key: 'segment18', icon: 'road', label: () => t('קטע 18'), price: () => sur(T.surcharges.road6_segment18), on: (o) => o.segment18, tap: (o) => { o.segment18 = !o.segment18; } },
  { key: 'carmel', icon: 'tunnel', label: (o) => o.carmel === 2 ? t('כרמל · 2 קטעים') : t('מנהרות הכרמל'),
    price: (p, o) => sur(o.carmel === 2 ? T.surcharges.carmel_tunnels_two : T.surcharges.carmel_tunnels_one),
    on: (o) => o.carmel > 0, tap: (o) => { o.carmel = o.carmel > 0 ? 0 : 1; } },
  { key: 'fastLane', icon: 'bolt', label: () => t('נתיב מהיר'), price: (p, o) => o.fastLane > 0 ? nis(o.fastLane) : t('לפי השלט'), on: (o) => o.fastLane > 0 || !!o.fastLaneOn, tap: (o) => { if (o.fastLane > 0 || o.fastLaneOn) { o.fastLane = 0; o.fastLaneOn = false; } else o.fastLaneOn = true; } },
  { key: 'eilat', icon: 'palm', label: () => t('אילת'), price: () => t('ללא מע"מ'), on: (o) => o.eilat, tap: (o) => { o.eilat = !o.eilat; } },
  { key: 'info', icon: 'info', label: () => t('ידעת?'), price: () => t('זכויות'), on: () => false, tap: 'info', cls: 'info' },
];
// התוספות שמזוהות אוטומטית לפי מיקום/מסלול, וערכי ברירת המחדל שלהן
const AUTO_DEFAULT = { airport: null, road6: false, segment18: false, carmel: 0 };
const autoName = (k, v) => ({ airport: v === 'ramon' ? t('יציאה משדה תעופה רמון/חיפה') : t('יציאה מנתב"ג'), road6: t('כביש 6'), segment18: t('קטע 18'), carmel: v === 2 ? t('מנהרות הכרמל – שני קטעים') : t('מנהרות הכרמל') })[k];

// כל אריח הוא מתג פשוט: לחיצה אחת מפעילה, לחיצה נוספת מבטלת.
// לתוספות עם כמה אפשרויות (שדה תעופה, מנהרות הכרמל, נתיב מהיר) נפתחת מתחת לאריחים שורת בחירה – בלי חלון נוסף.
function tileOptsHtml(opts) {
  const seg = (key, cur, items) => `<div class="seg" role="radiogroup">${items.map(([v, label, price]) => `<button type="button" role="radio" data-opt="${key}" data-val="${v}" aria-checked="${cur === v}"><span>${esc(label)}</span>${price ? `<small>${esc(price)}</small>` : ''}</button>`).join('')}</div>`;
  let h = '';
  if (opts.airport) h += `<div class="tile-opt" data-for="airport"><span class="lbl">${t('יציאה מ:')}</span>${seg('airport', opts.airport === 'haifa' ? 'ramon' : opts.airport, [['ben-gurion', t('נתב"ג'), sur(T.surcharges.ben_gurion)], ['ramon', t('רמון / חיפה'), sur(T.surcharges.ramon_or_haifa_airport)]])}</div>`;
  if (opts.carmel > 0) h += `<div class="tile-opt" data-for="carmel"><span class="lbl">${t('מנהרות הכרמל')}</span>${seg('carmel', String(opts.carmel), [['1', t('קטע אחד'), sur(T.surcharges.carmel_tunnels_one)], ['2', t('שני קטעים'), sur(T.surcharges.carmel_tunnels_two)]])}</div>`;
  if (opts.fastLane > 0 || opts.fastLaneOn) h += `<div class="tile-opt" data-for="fastLane"><label class="lbl" for="fl-amt">${t('נתיב מהיר – הסכום שעל השלט')}</label><span class="amt">₪<input type="number" inputmode="decimal" min="0" step="0.5" class="fl-amt" value="${opts.fastLane > 0 ? opts.fastLane : ''}" placeholder="0" aria-label="${t('נתיב מהיר – הסכום שעל השלט')}"></span></div>`;
  return h;
}
function renderTiles(container, opts, period, onChange, onManual, focusKey) {
  container.innerHTML = TILES.map(tile => {
    const label = tile.label(opts);
    const price = tile.price(period, opts);
    return `<button type="button" class="tile ${tile.cls || ''}" data-key="${tile.key}" aria-pressed="${tile.on(opts)}" aria-label="${esc(label)}, ${esc(price)}"><svg aria-hidden="true"><use href="#i-${tile.icon}"/></svg>${esc(label)}<small aria-hidden="true">${esc(price)}</small></button>`;
  }).join('') + tileOptsHtml(opts);
  const rerender = (k) => { renderTiles(container, opts, period, onChange, onManual, k); onChange(); };
  container.onclick = (e) => {
    const opt = e.target.closest('[data-opt]');
    if (opt) {
      const k = opt.dataset.opt; if (onManual) onManual(k);
      opts[k] = k === 'carmel' ? Number(opt.dataset.val) : opt.dataset.val;
      return rerender();
    }
    const btn = e.target.closest('.tile'); if (!btn) return;
    const tile = TILES.find(x => x.key === btn.dataset.key);
    if (tile.tap === 'info') return openRights();
    if (onManual) onManual(tile.key);
    tile.tap(opts); rerender(tile.key);
  };
  const amt = container.querySelector('.fl-amt');
  if (amt) {
    amt.id = container.id + '-fl';
    container.querySelector('label[for="fl-amt"]')?.setAttribute('for', amt.id);
    amt.oninput = () => {
      if (onManual) onManual('fastLane');
      opts.fastLane = Math.max(0, Number(amt.value) || 0); opts.fastLaneOn = true;
      const small = container.querySelector('.tile[data-key="fastLane"] small');
      if (small) small.textContent = opts.fastLane > 0 ? nis(opts.fastLane) : t('לפי השלט');
      onChange();
    };
    if (focusKey === 'fastLane') amt.focus();
  }
}

// ============ פירוט, פער מחיר וחלוקה בין נוסעים ============
function breakdownHtml(fare) {
  return `<div class="breakdown">${fare.lines.map(l => `<div><span>${esc(lineLabel(l))}</span><span>${l.amount.toFixed(2)}</span></div>`).join('')}
    <div class="total"><span>${t('סה"כ')} · ${esc(tariffLabelT(fare.tariffLabel))}</span><span>${nis(fare.total)}</span></div></div>
    <p class="note">${esc(dayLabelT(fare.dayLabel))} · ${t('במזומן מעגלים ל-{amount}', { amount: nis(fare.cashTotal) })} · ${periodT(fare.period)} · ${t('כולל מע"מ {p}%', { p: Math.round(T.vat * 100) })}</p>`;
}
function diffHtml(asked, total) {
  if (!(asked > 0)) return '';
  const gap = asked - total;
  if (gap > 0.5) return `<div class="diff over"><b>${t('הנהג ביקש {amount} מעל המחיר המרבי.', { amount: nis(gap) })}</b> ${t('אסור לגבות יותר ממה שהמונה מראה (תקנה 512). בקש קבלה מודפסת מהמונה, וצלם את מספר הרישיון על גג המונית.')} <button type="button" data-open="complaint">${t('להגשת תלונה ›')}</button></div>`;
  return `<div class="diff ok"><b>${t('המחיר תקין')}</b> — ${gap < -0.5 ? t('{amount} מתחת למחיר המרבי.', { amount: nis(-gap) }) : t('בדיוק לפי הצו.')}</div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-open="complaint"]'); if (!b) return;
  const ride = sheetRide || calcRide();
  closeSheet(); openComplaint(ride);
});

// חלוקת המחיר בין נוסעים
function splitHtml() {
  return `<div class="split" role="group" aria-label="${t('חלוקה בין נוסעים')}"><span>${t('חלוקה בין')}</span>
    <button type="button" class="mini step" data-split="-1" aria-label="${t('פחות נוסעים')}">−</button><b class="n" aria-live="polite">2</b><button type="button" class="mini step" data-split="1" aria-label="${t('יותר נוסעים')}">+</button>
    <span>${t('נוסעים')}:</span><b class="per"></b><button type="button" class="mini" data-split-share>${t('שתף')}</button></div>`;
}
function wireSplit(root, total) {
  const box = root.querySelector('.split'); if (!box) return;
  let n = 2;
  const per = () => Math.ceil(total * 100 / n - 1e-9) / 100;
  const render = () => { box.querySelector('.n').textContent = n; box.querySelector('.per').textContent = t('{amount} לכל אחד', { amount: nis(per()) }); };
  box.querySelectorAll('[data-split]').forEach(b => b.addEventListener('click', () => { n = Math.min(8, Math.max(2, n + Number(b.dataset.split))); render(); }));
  box.querySelector('[data-split-share]').addEventListener('click', async () => {
    const text = t('נסיעה במונית: סה"כ {total} — {n} נוסעים, {per} לכל אחד. (חושב ב"מונה" לפי תעריפי משרד התחבורה) {url}', { total: nis(total), n, per: nis(per()), url: 'https://' + APP_URL });
    await shareTextAny(t('חלוקת נסיעה'), text);
  });
  render();
}
async function shareTextAny(title, text) {
  try {
    if (await shareText(title, text)) return;
    if (navigator.share) { await navigator.share({ title, text }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}

// ============ מחשבון ============
function toLocalInputValue(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
const startDate = () => { const v = $('when').value ? new Date($('when').value) : new Date(); return isNaN(v) ? new Date() : v; };
$('nowBtn').addEventListener('click', () => { $('when').value = toLocalInputValue(new Date()); recalc(); });
['km', 'minutes', 'when', 'asked'].forEach(id => $(id).addEventListener('input', recalc));
$('calcPrice').addEventListener('click', () => {
  if (!calc.fare) return;
  const range = calcRange();
  openSheet(t('פירוט המחיר'), breakdownHtml(calc.fare)
    + (range ? `<p class="note">${t('טווח צפוי: {low}–{high}. המחיר בפועל תלוי בעומסי התנועה ובמסלול שהנהג בוחר; המונה במונית הוא הקובע.', { low: nis0(range[0]), high: Math.round(range[1]) })}</p>` : '')
    + splitHtml() + diffHtml(Number($('asked').value), calc.fare.total), (b) => wireSplit(b, calc.fare.total));
});

// טווח מחיר צפוי: מחיר אחד (הנוכחי) + טווח סביר לפי עומסי תנועה וסטיות מסלול
function calcRange() {
  if (!calc.fare) return null;
  const start = startDate(), km = Number($('km').value) || 0, minutes = Number($('minutes').value) || 0;
  const r = route.result && !routeEdited() ? route.result : null;
  const minLo = r ? Math.min(r.minutes, r.staticMinutes || r.minutes) : minutes;
  const minHi = r ? Math.max(r.minutes, r.staticMinutes || r.minutes) : minutes;
  const lo = computeFare({ start, km, minutes: minLo * 0.9, ...calc.opts }).total;
  const hi = computeFare({ start, km: km * 1.05, minutes: minHi * 1.25 + (minutes > 0 ? 2 : 0), ...calc.opts }).total;
  return [Math.min(lo, calc.fare.total), Math.max(hi, calc.fare.total)];
}
// טיפ על שעת היציאה: מתי משתנה התעריף בשלוש השעות הקרובות, והאם כדאי לחכות / למהר
function departureTip(start, km, minutes, total) {
  const t0 = start.getTime(); let prev = tariffAt(start).tariff, best = null, worse = null;
  for (let m = 1; m <= 180; m++) {
    const d = new Date(t0 + m * 60000); const tar = tariffAt(d).tariff;
    if (tar === prev) continue;
    prev = tar;
    const f = computeFare({ start: d, km, minutes, ...calc.opts }).total;
    if (total - f >= 3 && (!best || f < best.f)) best = { d, f, tar };
    if (f - total >= 3 && m <= 60 && !worse) worse = { d, f, tar };
  }
  if (best) return { d: best.d, cls: 'good', text: t('אם תצא ב-{time} ({tariff}) הנסיעה תעלה כ-{amount} פחות', { time: hm(best.d), tariff: tariffName(best.tar), amount: nis0(total - best.f) }) };
  if (worse) return { d: null, cls: 'warn', text: t('מ-{time} מתחיל {tariff} — אותה נסיעה תעלה כ-{amount} יותר', { time: hm(worse.d), tariff: tariffName(worse.tar), amount: nis0(worse.f - total) }) };
  return null;
}

function recalc() {
  const start = startDate();
  const info = tariffAt(start);
  const period = activePeriod(start);
  $('calcTariff').textContent = tariffShort(info.tariff);
  $('calcTariff').title = `${tariffName(info.tariff)} · ${dayLabelT(info.label)}`;
  renderTiles($('calcTiles'), calc.opts, period, recalcOnly, (k) => { delete calc.auto[k]; });
  recalcOnly();
  function recalcOnly() {
    const km = Number($('km').value) || 0, minutes = Number($('minutes').value) || 0;
    const fare = computeFare({ start, km, minutes, ...calc.opts });
    calc.fare = (km > 0 || minutes > 0) ? fare : null;
    $('calcTotal').textContent = nis(fare.total);
    $('calcSub').textContent = calc.fare ? `${tariffLabelT(fare.tariffLabel)} · ${dayLabelT(fare.dayLabel)} · ${t('לפירוט ↑')}` : `${tariffName(info.tariff)} · ${dayLabelT(info.label)} · ${t('הזן מרחק ודקות')}`;
    const range = calcRange();
    $('calcRange').hidden = !range;
    if (range) $('calcRange').textContent = t('טווח צפוי {low}–{high}', { low: nis0(range[0]), high: Math.round(range[1]) });
    const tip = calc.fare ? departureTip(start, km, minutes, fare.total) : null;
    const tipEl = $('calcTip'); tipEl.hidden = !tip;
    if (tip) {
      tipEl.className = 'tip ' + tip.cls;
      tipEl.innerHTML = `<svg aria-hidden="true"><use href="#i-clock"/></svg><span>${esc(tip.text)}</span>${tip.d ? `<button type="button" class="mini" id="tipSet">${t('קבע שעה')}</button>` : ''}`;
      if (tip.d) $('tipSet').onclick = () => { $('when').value = toLocalInputValue(tip.d); recalc(); if (route.from && route.to) computeRoute(); };
    }
    const d = $('calcDiff'); const html = calc.fare ? diffHtml(Number($('asked').value), fare.total) : '';
    d.hidden = !html; d.innerHTML = html;
  }
}
$('when').value = toLocalInputValue(new Date());
recalc();

// נסיעה "וירטואלית" מהמחשבון – לקבלה ולתלונה
function calcRide() {
  if (!calc.fare) return null;
  const f = calc.fare, asked = Number($('asked').value) || null;
  return { id: Date.now(), source: 'calc', at: startDate().toISOString(), end: null, km: Number($('km').value) || 0, minutes: Number($('minutes').value) || 0,
    total: f.total, cashTotal: f.cashTotal, tariffLabel: f.tariffLabel, dayLabel: f.dayLabel, period: f.period, lines: f.lines, opts: { ...calc.opts },
    track: route.points && !routeEdited() ? route.points : [], asked, from: route.from?.label || null, to: route.to?.label || null };
}

// ============ מסלול: מוצא → יעד (Google Maps דרך הפונקציה שלנו ב-Netlify) ============
// המפתח של Google נשאר בשרת (netlify/functions/maps.mjs). ק"מ ודקות מתמלאים מהמסלול ונשארים ניתנים לעריכה.
const newToken = () => { route.token = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())).slice(0, 36); };
newToken();
async function mapsApi(path, body) {
  const r = await fetch(`${API_BASE}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.message || 'maps'), { code: data.error || r.status });
  return data;
}
const routeErr = (e) => e.code === 'missing-key' ? t('שירות המסלולים עדיין לא הופעל') : e.code === 'no-route' ? t('לא נמצא מסלול נסיעה בין הנקודות') : (navigator.onLine === false || e.name === 'TypeError') ? t('אין חיבור לאינטרנט — הזן ק"מ ודקות ידנית') : t('חישוב המסלול נכשל, נסה שוב');
const routeEdited = () => !!route.result && (Number($('km').value) !== Number(route.result.km.toFixed(1)) || Number($('minutes').value) !== route.result.minutes);

function routeField(which) { return $(which === 'from' ? 'rtFrom' : 'rtTo'); }
function setPlace(which, place) {
  route[which] = place;
  const inp = routeField(which);
  inp.value = place ? place.label : inp.value;
  inp.closest('.field').classList.toggle('set', !!place);
}
// ---- כתובות שמורות: בית, עבודה ואחרונות (במכשיר בלבד) ----
const savePlaces = () => { try { localStorage.setItem(PLACES_KEY, JSON.stringify(places)); } catch (e) { /* */ } };
const samePlace = (a, b) => !!a && !!b && ((a.placeId && a.placeId === b.placeId) || a.label === b.label);
function rememberPlace(p) {
  if (!p || p.gps) return;
  const clean = { label: p.label, placeId: p.placeId || null, lat: p.lat ?? null, lon: p.lon ?? null };
  places.recent = [clean, ...places.recent.filter(x => !samePlace(x, clean))].slice(0, 6); savePlaces();
}

function hideList() { $('rtList').hidden = true; $('rtList').innerHTML = ''; route.items = []; route.sel = -1; ['rtFrom', 'rtTo'].forEach(id => { $(id).setAttribute('aria-expanded', 'false'); $(id).removeAttribute('aria-activedescendant'); }); }
function placeList(list, which, html) {
  const inp = routeField(which);
  list.style.top = (inp.closest('.field').offsetTop + inp.closest('.field').offsetHeight + 4) + 'px';
  list.innerHTML = html; list.hidden = false; inp.setAttribute('aria-expanded', 'true');
  list.querySelectorAll('button').forEach(b => b.addEventListener('mousedown', (e) => e.preventDefault()));   // לא לאבד פוקוס לפני הלחיצה
  list.querySelectorAll('[role=option]').forEach(b => b.addEventListener('click', () => pickItem(which, route.items[Number(b.dataset.i)])));
}
function showList(items, which) {
  route.items = items.map(s => ({ kind: 's', s })); route.sel = -1;
  placeList($('rtList'), which, items.length
    ? items.map((s, i) => `<button type="button" role="option" id="rtOpt${i}" aria-selected="false" data-i="${i}"><b>${esc(s.main)}</b>${s.secondary ? `<small>${esc(s.secondary)}</small>` : ''}</button>`).join('')
    : `<div class="empty">${t('לא נמצאו תוצאות — נסה כתובת מדויקת יותר')}</div>`);
}
function showQuick(which) {
  const items = [];
  if (places.home) items.push({ kind: 'p', p: places.home, tag: 'home' });
  if (places.work) items.push({ kind: 'p', p: places.work, tag: 'work' });
  places.recent.filter(x => !samePlace(x, places.home) && !samePlace(x, places.work)).forEach(p => items.push({ kind: 'p', p, tag: 'recent' }));
  if (!items.length) return hideList();
  route.items = items; route.sel = -1;
  const tagName = { home: t('בית'), work: t('עבודה') };
  const rows = items.map((it, i) => {
    const icon = it.tag === 'home' ? 'home' : it.tag === 'work' ? 'work' : 'clock';
    const main = it.tag === 'recent' ? `<b>${esc(it.p.label)}</b>` : `<b>${tagName[it.tag]}</b><small>${esc(it.p.label)}</small>`;
    const acts = it.tag === 'recent'
      ? `<button type="button" class="qa" data-act="home" data-i="${i}" title="${t('שמור כבית')}" aria-label="${t('שמור כבית')}"><svg aria-hidden="true"><use href="#i-home"/></svg></button><button type="button" class="qa" data-act="work" data-i="${i}" title="${t('שמור כעבודה')}" aria-label="${t('שמור כעבודה')}"><svg aria-hidden="true"><use href="#i-work"/></svg></button>`
      : `<button type="button" class="qa" data-act="unset" data-i="${i}" title="${t('הסר')}" aria-label="${t('הסר')} ${tagName[it.tag]}">×</button>`;
    return `<div class="qrow"><button type="button" role="option" id="rtOpt${i}" aria-selected="false" data-i="${i}" class="q"><svg aria-hidden="true"><use href="#i-${icon}"/></svg><span>${main}</span></button>${acts}</div>`;
  }).join('');
  const hint = !places.home && !places.work ? `<div class="empty small">${t('אפשר לשמור כתובת כבית או כעבודה בלחיצה על הסמל שלידה')}</div>` : '';
  placeList($('rtList'), which, rows + hint);
  $('rtList').querySelectorAll('.qa').forEach(b => b.addEventListener('click', () => {
    const it = route.items[Number(b.dataset.i)]; if (!it) return;
    if (b.dataset.act === 'unset') places[it.tag] = null;
    else { places[b.dataset.act] = { ...it.p }; toast(b.dataset.act === 'home' ? t('נשמר כבית') : t('נשמר כעבודה')); }
    savePlaces(); showQuick(which);
  }));
}
function pickItem(which, it) {
  if (!it) return;
  const place = it.kind === 's' ? { label: it.s.secondary ? `${it.s.main}, ${it.s.secondary}` : it.s.main, placeId: it.s.placeId } : { ...it.p };
  setPlace(which, place); rememberPlace(place);
  hideList(); if (it.kind === 's') newToken();
  if (which === 'from' && !route.to) $('rtTo').focus(); else routeField(which).blur();
  computeRoute();
}
async function suggest(which) {
  const q = routeField(which).value.trim();
  if (!q) return showQuick(which);
  if (q.length < 2) return hideList();
  const my = ++route.req;
  try {
    const { suggestions } = await mapsApi('places', { input: q, sessionToken: route.token, near: route.near || (live.lastFix ? { lat: live.lastFix.lat, lon: live.lastFix.lon } : null) });
    if (my !== route.req || routeField(which).value.trim() !== q) return;
    showList(suggestions, which);
  } catch (e) { if (my === route.req) { hideList(); if (e.code === 'missing-key') toast(routeErr(e)); } }
}
['from', 'to'].forEach((which) => {
  const inp = routeField(which);
  inp.addEventListener('input', () => {
    if (route[which]) { route[which] = null; inp.closest('.field').classList.remove('set'); clearRouteResult(); }
    route.active = which; clearTimeout(route.timer);
    if (!inp.value.trim()) { showQuick(which); return; }
    route.timer = setTimeout(() => suggest(which), 320);
  });
  inp.addEventListener('focus', () => { route.active = which; const v = inp.value.trim(); if (!v) showQuick(which); else if (v.length >= 2 && !route[which]) suggest(which); });
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('rtFrom') && document.activeElement !== $('rtTo')) hideList(); }, 150));
  inp.addEventListener('keydown', (e) => {
    const n = route.items.length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); route.sel = (route.sel + 1) % n; markSel(); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); route.sel = (route.sel - 1 + n) % n; markSel(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (n) pickItem(which, route.items[route.sel < 0 ? 0 : route.sel]); }
    else if (e.key === 'Escape') hideList();
  });
});
function markSel() {
  $('rtList').querySelectorAll('[role=option]').forEach((b, i) => { b.setAttribute('aria-selected', String(i === route.sel)); if (i === route.sel) b.scrollIntoView({ block: 'nearest' }); });
  const inp = routeField(route.active || 'from'); if (route.sel >= 0) inp.setAttribute('aria-activedescendant', 'rtOpt' + route.sel); else inp.removeAttribute('aria-activedescendant');
}

$('rtGps').addEventListener('click', async () => {
  const btn = $('rtGps'); btn.classList.add('busy');
  try {
    const p = await geoOnce({ timeout: 15000 });
    route.near = { lat: p.lat, lon: p.lon };
    setPlace('from', { label: t('המיקום הנוכחי שלי'), lat: p.lat, lon: p.lon, gps: true });
    hideList();
    if (route.to) computeRoute(); else $('rtTo').focus();
  } catch (e) {
    toast(e.code === 1 ? t('אין הרשאת מיקום — אפשר לתת הרשאה בהגדרות, או להקליד מוצא') : t('לא הצלחנו לקבל מיקום — הקלד מוצא'));
  } finally { btn.classList.remove('busy'); }
});
$('rtSwap').addEventListener('click', () => {
  const [f, to] = [route.from, route.to]; const [fv, tv] = [$('rtFrom').value, $('rtTo').value];
  setPlace('from', to); setPlace('to', f);
  if (!to) $('rtFrom').value = tv; if (!f) $('rtTo').value = fv;
  hideList(); if (route.from && route.to) computeRoute(); else clearRouteResult();
});
$('when').addEventListener('change', () => { if (route.from && route.to) computeRoute(); });
['km', 'minutes'].forEach(id => $(id).addEventListener('input', () => { if (route.result) renderRouteInfo(); }));

// תוספות לפי המסלול: יציאה משדה תעופה, כביש 6, קטע 18, מנהרות הכרמל
function resetRouteAuto() {
  for (const [k, v] of Object.entries(calc.auto)) if (calc.opts[k] === v) calc.opts[k] = AUTO_DEFAULT[k];
  calc.auto = {};
}
function applyRouteSurcharges(points) {
  resetRouteAuto();
  const det = detectSurcharges(points);
  const want = { airport: det.airport === 'haifa' ? 'ramon' : det.airport, road6: det.road6, segment18: det.segment18, carmel: det.carmel || 0 };
  const found = [];
  for (const [k, v] of Object.entries(want)) {
    if (!v) continue;
    found.push(autoName(k, v));
    if (calc.opts[k] !== v) { calc.opts[k] = v; calc.auto[k] = v; }
  }
  return found;
}
function clearRouteResult() {
  if (!route.result) return;
  route.result = null; route.points = null; route.found = []; resetRouteAuto(); recalc(); renderRouteInfo();
}
async function computeRoute() {
  if (!route.from || !route.to) return;
  const my = ++route.req;
  $('rtInfo').hidden = false; $('rtInfo').className = 'note route-info'; $('rtInfo').textContent = t('מחשב מסלול ב-Google Maps…');
  try {
    const when = $('when').value ? new Date($('when').value) : null;
    const r = await mapsApi('route', { origin: route.from, destination: route.to, departureTime: when && !isNaN(when) ? when.toISOString() : undefined });
    if (my !== route.req) return;
    route.result = r;
    route.points = r.polyline ? decodePolyline(r.polyline) : [];
    if (route.from.gps && route.points.length) route.points.unshift([route.from.lat, route.from.lon]);
    route.found = applyRouteSurcharges(route.points);
    $('km').value = r.km.toFixed(1); $('minutes').value = String(r.minutes);
    recalc(); renderRouteInfo();
  } catch (e) {
    if (my !== route.req) return;
    route.result = null; route.points = null; route.found = []; $('rtInfo').hidden = false; $('rtInfo').textContent = routeErr(e);
  }
}
function renderRouteInfo() {
  const el = $('rtInfo'); const r = route.result;
  if (!r) { el.hidden = true; el.innerHTML = ''; return; }
  const edited = routeEdited();
  const traffic = r.staticMinutes && r.staticMinutes !== r.minutes ? ` ${t("({n} דק' ללא עומסים)", { n: r.staticMinutes })}` : '';
  const found = route.found.length ? `<span class="found">${t('זוהו תוספות: {list}', { list: route.found.map(esc).join(', ') })}</span>` : '';
  el.className = 'note route-info' + (edited ? ' edited' : '');
  el.innerHTML = `${t('לפי Google Maps:')} <b>${t('{n} ק"מ', { n: r.km.toFixed(1) })}</b> · <b>${t("{n} דק'", { n: r.minutes })}</b>${traffic}${r.via ? ` · ${t('דרך {via}', { via: esc(r.via) })}` : ''}${edited ? ' · ' + t('שונה ידנית') : ''}<button type="button" class="clear" id="rtReset">${edited ? t('חזור למסלול') : t('נקה')}</button>${found}`;
  el.hidden = false;
  $('rtReset').onclick = () => {
    if (edited) { $('km').value = r.km.toFixed(1); $('minutes').value = String(r.minutes); recalc(); renderRouteInfo(); return; }
    setPlace('from', null); setPlace('to', null); $('rtFrom').value = ''; $('rtTo').value = ''; clearRouteResult();
  };
}


// ============ מפה (Leaflet + OpenStreetMap) ============
const TAXI_SVG = `<svg viewBox="0 0 32 32"><path d="M7 14l2.2-5A3 3 0 0 1 12 7h8a3 3 0 0 1 2.8 2l2.2 5h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v2a2 2 0 0 1-4 0v-2H11v2a2 2 0 0 1-4 0v-2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zm3.2 0h11.6l-1.4-3.2a1 1 0 0 0-.9-.6h-7a1 1 0 0 0-.9.6zM8 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0zm13 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z" fill="#f2b91d"/><rect x="13" y="4" width="6" height="3" rx="1" fill="#f2b91d"/></svg>`;
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
const STORE_KEY = 'mone.liveRide';
const liveTilesChanged = () => { if (live.meter) Object.assign(live.meter.opts, live.opts); renderMeter(); };
const liveManual = (k) => { if (live.meter) live.manual.add(k); };
renderTiles($('liveTiles'), live.opts, activePeriod(new Date()), liveTilesChanged, liveManual);
$('liveStart').addEventListener('click', () => startRide(false));
$('liveStop').addEventListener('click', stopRide);

function startRide(resumed) {
  if (!live.meter) { live.meter = new LiveMeter(new Date(), live.opts); live.track = []; live.manual = new Set(); }
  live.det = new SurchargeDetector(); live.detAirport = !resumed;   // תוספת שדה תעופה – רק לפי נקודת ההתחלה של נסיעה חדשה
  // שחזור אחרי שהאפליקציה נסגרה: המונה במונית לא עצר — מחייבים גם את הזמן שעבר מאז השמירה האחרונה
  live.lastTickAt = resumed && live.savedAt ? Math.min(Date.now(), live.savedAt) : Date.now(); live.lastFix = null; live.speed = null;
  mapReset(); ensureMap(); if (gmap.map) setTimeout(() => gmap.map.invalidateSize(), 100);
  live.track.forEach((pt, i) => mapAddPoint(pt[0], pt[1], i > 0 ? bearing(live.track[i - 1], pt) : null));
  $('liveStart').hidden = true; $('liveStop').hidden = false;
  $('livePrice').classList.add('running');
  $('mapEmpty').textContent = resumed ? t('הנסיעה שוחזרה מהזיכרון וממשיכה') : t('המפה תופיע כאן בזמן הנסיעה');
  live.timer = setInterval(onTimer, 1000);
  startGps(); requestWakeLock(); renderMeter();
}
function onTimer() {
  const now = Date.now();
  live.meter.tick(new Date(now), (now - live.lastTickAt) / 1000, 0);
  live.lastTickAt = now;
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ meter: live.meter.toJSON(), opts: live.opts, track: live.track.length > 3000 ? compactTrack(live.track) : live.track, savedAt: now })); } catch (e) { /* */ }
  renderMeter();
}
async function startGps() {
  $('meterGps').textContent = t('מחפש לוויינים…');
  live.watchId = await geoWatch(onFix, onGpsError, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
// זיהוי אוטומטי של תוספות בזמן הנסיעה (רק מוסיף; מה שהמשתמש שינה ידנית – לא נוגעים)
function liveDetect(lat, lon) {
  if (!live.det || !live.meter) return;
  const r = live.det.feed(lat, lon);
  const added = [];
  const want = { airport: live.detAirport && Date.now() - live.meter.start.getTime() < 5 * 60000 ? (r.airport === 'haifa' ? 'ramon' : r.airport) : null, road6: r.road6, segment18: r.segment18, carmel: r.carmel || 0 };
  live.detAirport = false;
  for (const [k, v] of Object.entries(want)) {
    if (!v || live.manual.has(k)) continue;
    if (k === 'carmel' ? v > live.opts.carmel : !live.opts[k]) { live.opts[k] = v; added.push(autoName(k, v)); }
  }
  if (added.length) {
    Object.assign(live.meter.opts, live.opts);
    renderTiles($('liveTiles'), live.opts, live.meter.period, liveTilesChanged, liveManual);
    toast(t('זוהה אוטומטית: {list} — התוספת נוספה למחיר', { list: added.join(', ') }));
  }
}
function onFix(pos) {
  const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords; const ts = pos.timestamp;
  if (accuracy > 60) { $('meterGps').textContent = t("דיוק נמוך ({n} מ')", { n: Math.round(accuracy) }); return; }
  $('meterGps').textContent = t("GPS פעיל · ±{n} מ'", { n: Math.round(accuracy) });
  if (speed != null && !Number.isNaN(speed)) live.speed = speed * 3.6;
  if (live.lastFix) {
    const d = haversine(live.lastFix.lat, live.lastFix.lon, lat, lon);
    const dt = (ts - live.lastFix.t) / 1000;
    const noise = Math.max(4, Math.min(accuracy, live.lastFix.acc) * 0.5);
    const implied = dt > 0 ? (d / dt) * 3.6 : 0;
    if (d > noise && implied < 160) {
      live.meter.tick(new Date(ts), 0, d);
      live.track.push([lat, lon]);
      mapAddPoint(lat, lon, bearing([live.lastFix.lat, live.lastFix.lon], [lat, lon]));
      if (live.speed == null) live.speed = implied;
      liveDetect(lat, lon);
    }
  } else { live.track.push([lat, lon]); mapAddPoint(lat, lon, null); liveDetect(lat, lon); }
  live.lastFix = { lat, lon, t: ts, acc: accuracy };
  renderMeter();
}
function onGpsError(err) { $('meterGps').textContent = err.code === 1 ? t('אין הרשאת מיקום') : err.message === 'unsupported' ? t('GPS לא נתמך') : t('אין קליטת GPS'); }
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, r = (x) => x * Math.PI / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
async function requestWakeLock() { if (await keepAwake(true)) return; try { live.wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) { /* */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && live.timer) requestWakeLock(); });

function renderMeter() {
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
  const sec = Math.round(m.seconds);
  $('meterTime').textContent = sec >= 3600 ? `${Math.floor(sec / 3600)}:${pad2(Math.floor(sec % 3600 / 60))}:${pad2(sec % 60)}` : `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
  $('meterSpeed').textContent = live.speed == null ? '—' : String(Math.round(live.speed));
}
function stopRide() {
  clearInterval(live.timer); live.timer = null;
  geoClear(live.watchId); live.watchId = null;
  live.wakeLock?.release?.(); live.wakeLock = null; keepAwake(false);
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* */ }
  $('livePrice').classList.remove('running'); $('liveStop').hidden = true; $('meterGps').textContent = t('GPS כבוי');
  mapFinish(live.track);
  const fare = live.meter.snapshot();
  const ride = { id: Date.now(), at: live.meter.start.toISOString(), end: new Date().toISOString(), km: fare.km, minutes: fare.minutes, total: fare.total, cashTotal: fare.cashTotal, tariffLabel: fare.tariffLabel, dayLabel: fare.dayLabel, period: fare.period, lines: fare.lines, opts: { ...live.meter.opts }, track: compactTrack(live.track), asked: null };
  saveRide(ride);
  renderMeter();
  openRideSheet(ride, true);
}
function resetRide() {
  live.meter = null; live.speed = null; live.lastFix = null; live.track = []; live.savedAt = null; live.det = null; live.manual = new Set();
  Object.assign(live.opts, newOpts());
  renderTiles($('liveTiles'), live.opts, activePeriod(new Date()), liveTilesChanged, liveManual);
  mapReset(); if (gmap.map) { gmap.map.remove(); gmap.map = null; $('mapEmpty').hidden = false; }
  $('liveStart').hidden = false; $('mapEmpty').textContent = t('המפה תופיע כאן בזמן הנסיעה');
  renderMeter();
  applyPendingReload();
}

// ============ נסיעות (שמירה) – מוגדר לפני שחזור נסיעה פעילה ============
const HIST_KEY = 'mone.history';
const loadRides = () => { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch (e) { return []; } };
// שמירה עם הגנה ממכסת האחסון (~5MB): אם אין מקום — מוותרים על מסלולי ה-GPS של הנסיעות הישנות ומנסים שוב
const storeRides = (list) => {
  list = list.slice(0, 100);
  for (let keepTracks = list.length; keepTracks >= 0; keepTracks = keepTracks > 10 ? Math.floor(keepTracks / 2) : keepTracks - 1) {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(keepTracks >= list.length ? list : list.map((r, i) => i < keepTracks ? r : { ...r, track: [] }))); return true; }
    catch (e) { if (e.name !== 'QuotaExceededError' && e.code !== 22) return false; }
  }
  return false;
};
// מסלול לשמירה: נקודה כל ~15 מ' לכל היותר, עד 2,000 נקודות, 5 ספרות אחרי הנקודה (~1 מ')
function compactTrack(track) {
  const out = [];
  for (const p of track) { const last = out[out.length - 1]; if (!last || haversine(last[0], last[1], p[0], p[1]) >= 15) out.push([+p[0].toFixed(5), +p[1].toFixed(5)]); }
  if (track.length > 1) { const end = track[track.length - 1]; const last = out[out.length - 1]; if (last[0] !== +end[0].toFixed(5) || last[1] !== +end[1].toFixed(5)) out.push([+end[0].toFixed(5), +end[1].toFixed(5)]); }
  if (out.length <= 2000) return out;
  const step = out.length / 2000; return Array.from({ length: 2000 }, (_, i) => out[Math.min(out.length - 1, Math.round(i * step))]).concat([out[out.length - 1]]);
}
function saveRide(ride) { const list = loadRides(); list.unshift(ride); storeRides(list); if (getUser()) pushRides([ride]).catch(() => {}); }
function updateRide(ride) { if (ride.source === 'calc') return; const list = loadRides(); const i = list.findIndex(r => r.id === ride.id); if (i >= 0) list[i] = ride; storeRides(list); if (getUser()) pushRides([ride]).catch(() => {}); }

(function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved) return;
    if (Date.now() - new Date(saved.meter.start).getTime() > 6 * 3600000) { localStorage.removeItem(STORE_KEY); return; }
    live.meter = LiveMeter.fromJSON(saved.meter); Object.assign(live.opts, saved.opts); live.track = saved.track || []; live.savedAt = saved.savedAt || null;
    // מה שכבר מופעל נחשב כבחירה של המשתמש – הזיהוי האוטומטי רק יוסיף
    Object.entries(live.opts).forEach(([k, v]) => { if (v) live.manual.add(k); });
    renderTiles($('liveTiles'), live.opts, live.meter.period, liveTilesChanged, liveManual);
    showView('live'); startRide(true);
  } catch (e) { /* */ }
})();
renderMeter();

// ============ נסיעות (תצוגה) ============
function renderRides() {
  const list = loadRides();
  $('ridesEmpty').hidden = list.length > 0;
  $('ridesList').innerHTML = list.map(r => {
    const d = new Date(r.at);
    return `<button type="button" class="ride" data-id="${r.id}"><span class="meta"><b>${fmtDT(d)}</b><span>${t('{n} ק"מ', { n: r.km.toFixed(1) })} · ${t("{n} דק'", { n: Math.round(r.minutes) })} · ${esc(tariffLabelT(r.tariffLabel))}</span></span><span class="amt">${nis(r.total)}</span></button>`;
  }).join('');
  $('ridesList').onclick = (e) => { const b = e.target.closest('.ride'); if (!b) return; const r = loadRides().find(x => x.id === Number(b.dataset.id)); if (r) openRideSheet(r, false); };
}
function openRideSheet(ride, justEnded) {
  const fare = { lines: ride.lines, total: ride.total, cashTotal: ride.cashTotal, tariffLabel: ride.tariffLabel, dayLabel: ride.dayLabel, period: ride.period };
  const html = `<p class="note">${fmtDT(new Date(ride.at))} · ${t('{n} ק"מ', { n: ride.km.toFixed(2) })} · ${t("{n} דק'", { n: Math.round(ride.minutes) })}</p>
    ${!justEnded && ride.track && ride.track.length > 1 ? '<div class="mini-map" id="miniMap"></div>' : ''}
    ${breakdownHtml(fare)}
    ${splitHtml()}
    <label class="field asked"><span>${t('הנהג ביקש')}</span><input id="rideAsked" type="number" inputmode="decimal" min="0" step="1" placeholder="₪" value="${ride.asked || ''}"></label>
    <div id="rideDiff">${diffHtml(ride.asked, ride.total)}</div>
    <div class="actions"><button class="btn" id="rideReceipt" type="button">${t('קבלה לשיתוף')}</button><button class="btn ghost" id="rideComplain" type="button">${t('הגש תלונה')}</button></div>
    <div class="actions">${justEnded ? `<button class="btn ghost" id="rideNew" type="button">${t('נסיעה חדשה')}</button>` : `<button class="btn ghost" id="rideDel" type="button">${t('מחק')}</button>`}</div>`;
  openSheet(justEnded ? t('סיכום הנסיעה') : t('פרטי הנסיעה'), html, (b) => {
    const mm = b.querySelector('#miniMap'); if (mm) miniMap(mm, ride.track);
    wireSplit(b, ride.total);
    b.querySelector('#rideAsked').addEventListener('input', (e) => { ride.asked = Number(e.target.value) || null; updateRide(ride); b.querySelector('#rideDiff').innerHTML = diffHtml(ride.asked, ride.total); });
    b.querySelector('#rideReceipt').addEventListener('click', () => { onSheetClose = null; openReceipt(ride); });
    b.querySelector('#rideComplain').addEventListener('click', () => { onSheetClose = null; openComplaint(ride); });
    b.querySelector('#rideNew')?.addEventListener('click', () => { closeSheet(); resetRide(); });
    b.querySelector('#rideDel')?.addEventListener('click', () => { storeRides(loadRides().filter(r => r.id !== ride.id)); if (getUser()) deleteRideCloud(ride.id).catch(() => {}); closeSheet(); renderRides(); });
  });
  sheetRide = ride;
  if (justEnded) onSheetClose = () => { if (!live.timer) resetRide(); };
}


// ============ קבלה בפורמט מונה ============
function receiptLines(ride) {
  const start = new Date(ride.at), end = ride.end ? new Date(ride.end) : null;
  const head = [
    [t('תאריך'), `${pad2(start.getDate())}.${pad2(start.getMonth() + 1)}.${start.getFullYear()}`],
    [t('התחלה'), hm(start)], [t('סיום'), end ? hm(end) : '—'],
  ];
  if (ride.from) head.push([t('מוצא'), ride.from]);
  if (ride.to) head.push([t('יעד'), ride.to]);
  head.push(
    [t("מונית מס'"), ride.taxi || '—'], [t('נהג'), ride.driver || '—'],
    [t('תעריף'), `${tariffLabelT(ride.tariffLabel)} · ${dayLabelT(ride.dayLabel)}`],
    [t('מרחק'), t('{n} ק"מ', { n: ride.km.toFixed(2) })], [t('זמן'), t("{n} דק'", { n: Math.round(ride.minutes) })],
  );
  const items = ride.lines.map(l => [lineLabel(l), l.amount.toFixed(2)]);
  const foot = [[t('סה"כ לתשלום'), nis(ride.total)], [t('במזומן (עיגול)'), nis(ride.cashTotal)]];
  if (ride.asked > 0) foot.push([t('הנהג ביקש'), nis(ride.asked)], [ride.asked - ride.total > 0.5 ? t('פער מעל המחיר המרבי') : t('פער'), nis(ride.asked - ride.total)]);
  return { head, items, foot };
}
function renderReceipt(ride) {
  const W = 480, pad = 28, lh = 30, MAP_H = 170;
  const rtl = isRtl();
  const { head, items, foot } = receiptLines(ride);
  const mono = '"IBM Plex Mono", "Courier New", monospace', sans = '"Heebo", "Segoe UI", "Arial Hebrew", Arial, sans-serif';
  const hasRtlChars = (v) => /[֐-׿؀-ۿ]/.test(v);
  const hasLetters = (v) => /[A-Za-zЀ-ӿ֐-׿؀-ۿ]/.test(v);
  const track = ride.track && ride.track.length > 1 ? ride.track : null;
  const fit = (x, s, max) => { let v = s; while (v.length > 3 && x.measureText(v).width > max) v = v.slice(0, -2); return v === s ? s : v + '…'; };
  const draw = (x, H) => {
    let y = 44;
    if (x) {
      x.fillStyle = '#fbfaf5'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#efece3';
      for (let i = 0; i < W; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 8, 0); x.lineTo(i + 4, 6); x.closePath(); x.fill(); x.beginPath(); x.moveTo(i, H); x.lineTo(i + 8, H); x.lineTo(i + 4, H - 6); x.closePath(); x.fill(); }
      x.direction = rtl ? 'rtl' : 'ltr'; x.fillStyle = '#1c1f26'; x.textAlign = 'center';
      x.font = `700 26px ${sans}`; x.fillText(lang() === 'he' ? 'מ ו נ ה' : t('מונה'), W / 2, y);
    }
    y += 26;
    if (x) { x.font = `500 14px ${sans}`; x.fillText(t('קבלת נסיעה · הערכה לפי צו מחירי הנסיעה במוניות'), W / 2, y); } y += 18;
    if (x) { x.font = `12px ${sans}`; x.fillStyle = '#666'; x.fillText(t('(אינה חשבונית מס — המונה במונית הוא הקובע)'), W / 2, y); } y += 22;
    const dash = () => { if (x) { x.strokeStyle = '#999'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(pad, y); x.lineTo(W - pad, y); x.stroke(); x.setLineDash([]); } y += 18; };
    const row = (k, v, bold) => {
      if (x) {
        x.fillStyle = '#1c1f26';
        const kx = rtl ? W - pad : pad, vx = rtl ? pad : W - pad;
        x.direction = rtl ? 'rtl' : 'ltr'; x.textAlign = rtl ? 'right' : 'left'; x.font = `${bold ? 700 : 400} 15px ${sans}`;
        x.fillText(fit(x, k, W * 0.5), kx, y);
        x.textAlign = rtl ? 'left' : 'right';
        if (hasLetters(v)) { x.direction = hasRtlChars(v) ? 'rtl' : 'ltr'; x.font = `${bold ? 700 : 500} 15px ${sans}`; }
        else { x.direction = 'ltr'; x.font = `${bold ? 600 : 400} 15px ${mono}`; }
        x.fillText(fit(x, String(v), W * 0.42), vx, y);
      }
      y += lh;
    };
    dash(); head.forEach(([k, v]) => row(k, v)); y += 4; dash();
    if (track) {   // מפת המסלול (קו בלבד, בלי אריחי מפה)
      if (x) drawTrack(x, track, pad, y - 6, W - 2 * pad, MAP_H);
      y += MAP_H + 10; dash();
    }
    items.forEach(([k, v]) => row(k, v)); y += 4; dash();
    foot.forEach(([k, v], i) => row(k, v, i === 0)); y += 4; dash();
    if (x) { x.textAlign = 'center'; x.direction = rtl ? 'rtl' : 'ltr'; x.fillStyle = '#666'; x.font = `12px ${sans}`; x.fillText(t('חושב ב"מונה" לפי הצו שבתוקף') + ' · ' + APP_URL, W / 2, y + 4); }
    y += 20;
    if (x) x.fillText(ride.source === 'calc' ? t('חישוב לפי מסלול Google Maps — המונה במונית הוא הקובע') : t('מדידת GPS עשויה לסטות בכמה אחוזים מהמונה במונית'), W / 2, y + 4);
    return y + 40;
  };
  const H = draw(null, 0);
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
  const x = c.getContext('2d'); x.scale(2, 2); draw(x, H);
  return c;
}
function drawTrack(x, track, left, top, w, h) {
  x.save();
  x.fillStyle = '#f1efe6'; x.strokeStyle = '#dcd8cb'; x.lineWidth = 1;
  x.beginPath(); x.rect(left, top, w, h); x.fill(); x.stroke();
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [la, lo] of track) { minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la); minLon = Math.min(minLon, lo); maxLon = Math.max(maxLon, lo); }
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const spanX = Math.max((maxLon - minLon) * k, 1e-5), spanY = Math.max(maxLat - minLat, 1e-5);
  const m = 14, s = Math.min((w - 2 * m) / spanX, (h - 2 * m) / spanY);
  const ox = left + (w - spanX * s) / 2, oy = top + (h - spanY * s) / 2;
  const P = ([la, lo]) => [ox + (lo - minLon) * k * s, oy + (maxLat - la) * s];
  x.strokeStyle = '#c99a06'; x.lineWidth = 3.5; x.lineJoin = 'round'; x.lineCap = 'round';
  x.beginPath(); track.forEach((p, i) => { const [px, py] = P(p); if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.stroke();
  const dot = (p, fill) => { const [px, py] = P(p); x.fillStyle = fill; x.beginPath(); x.arc(px, py, 5.5, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke(); };
  dot(track[0], '#2e9e5b'); dot(track[track.length - 1], '#1c1f26');
  x.restore();
}
async function shareReceipt(ride, btn) {
  const canvas = renderReceipt(ride);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], `mone-${ride.id}.png`, { type: 'image/png' });
  const text = t('קבלת נסיעה מ"מונה": {km} ק"מ, {min} דק\', {tariff} — {total} (מחיר מרבי לפי הצו).', { km: ride.km.toFixed(1), min: Math.round(ride.minutes), tariff: tariffLabelT(ride.tariffLabel), total: nis(ride.total) });
  try {
    if (await shareImage(blob, file.name, t('קבלת נסיעה — מונה'), text)) return;
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: t('קבלת נסיעה — מונה'), text }); return; }
    if (navigator.share) { await navigator.share({ title: t('קבלת נסיעה — מונה'), text: text + ' ' + APP_URL }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  if (btn) btn.textContent = t('הקבלה נשמרה כתמונה');
}
function openReceipt(ride) {
  openSheet(t('קבלת הנסיעה'), `
    <div class="row2"><label class="field"><span>${t("מונית מס'")}</span><input id="rTaxi" type="text" inputmode="numeric" value="${esc(ride.taxi || '')}" placeholder="${t('על הגג')}"></label>
    <label class="field"><span>${t('נהג')}</span><input id="rDriver" type="text" value="${esc(ride.driver || '')}" placeholder="${t('מהלוחית')}"></label></div>
    <img id="rImg" class="receipt-img" alt="${t('קבלת נסיעה')}">
    <div class="actions"><button class="btn" id="rShare" type="button">${t('שתף קבלה')}</button><button class="btn ghost" id="rComplain" type="button">${t('הגש תלונה')}</button></div>`, (b) => {
    const img = b.querySelector('#rImg');
    const refresh = () => { img.src = renderReceipt(ride).toDataURL('image/png'); };
    ['rTaxi', 'rDriver'].forEach(id => b.querySelector('#' + id).addEventListener('input', (e) => { ride[id === 'rTaxi' ? 'taxi' : 'driver'] = e.target.value.trim(); updateRide(ride); refresh(); }));
    b.querySelector('#rShare').onclick = (e) => shareReceipt(ride, e.currentTarget);
    b.querySelector('#rComplain').onclick = () => openComplaint(ride);
    if (document.fonts?.ready) document.fonts.ready.then(refresh);
    refresh();
  });
  sheetRide = ride;
}

// ============ עוד ============
document.querySelectorAll('#view-more [data-sheet]').forEach(b => b.addEventListener('click', () => ({ account: openAccount, tariffs: openTariffs, rights: openRights, complaint: () => openComplaint(null), about: openAbout, language: openLanguage, terms: () => openDoc('terms'), privacy: () => openDoc('privacy'), accessibility: () => openDoc('accessibility') })[b.dataset.sheet]()));
$('langName').textContent = LANGS[lang()].name;

function openLanguage() {
  openSheet(t('שפה'), `<div class="list menu langs">${Object.entries(LANGS).map(([k, v]) => `<button type="button" data-lang="${k}" lang="${k}" dir="${v.dir}" class="${k === lang() ? 'on' : ''}" aria-pressed="${k === lang()}"><span>${v.name}</span>${k === lang() ? '<b aria-hidden="true">✓</b>' : ''}</button>`).join('')}</div>
    <p class="note">${t('המסמכים המשפטיים זמינים בעברית ובאנגלית; הנוסח העברי הוא המחייב.')}</p>`, (b) => {
    b.querySelectorAll('[data-lang]').forEach(x => x.addEventListener('click', () => { if (x.dataset.lang !== lang()) setLang(x.dataset.lang); else closeSheet(); }));
  });
}


// ============ חשבון (Firebase) ============
const errT = (e) => { const m = errorHe(e); return m.startsWith('שגיאה: ') ? t('שגיאה: {msg}', { msg: m.slice(7) }) : t(m); };
function accountLabel(u) { return u ? (u.displayName || u.email || t('מחובר')) : t('התחברות'); }
function firstName(u) { return (u.displayName || u.email || '').split(/[\s@]/)[0] || ''; }
function renderAccountRow() {
  const u = getUser();
  $('accountLabel').textContent = u ? t('שלום, {name}', { name: firstName(u) }) : t('התחברות');
  $('accountSub').textContent = u ? `${t('מחובר')} · ${u.email || accountLabel(u)} · ${t('הנסיעות מסונכרנות')}` : t('שמור נסיעות בענן וגש אליהן מכל מכשיר');
  const img = $('accountImg'); img.src = u?.photoURL || 'icons/logo-96.png'; img.classList.toggle('avatar', !!u?.photoURL);
  document.querySelector('#view-more .account').classList.toggle('on', !!u);
}
function greet(u) { toast(t('שלום, {name} — התחברת בהצלחה', { name: firstName(u) || t('ברוך הבא') })); }
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
function cloudUp() {
  if (cloudReady) return Promise.resolve();
  return initCloud().then(() => {
    if (cloudReady) return;
    cloudReady = true;
    onUser((u) => { renderAccountRow(); if (u) syncRides(); });
    const r = redirectOutcome();          // חזרה מהתחברות Google (אפליקציה מותקנת כ-PWA)
    if (r.user) { greet(r.user); showView('more'); }
    else if (r.error) { showView('more'); openSheet(t('ההתחברות לא הושלמה'), `<p class="err">${esc(errT(r.error))}</p><p class="note">${t('נסה שוב, או התחבר באימייל.')}</p>`); }
  });
}
cloudUp().catch(() => { $('accountSub').textContent = t('אין חיבור לאינטרנט — הנסיעות נשמרות במכשיר'); });

async function openAccount() {
  if (!cloudReady) {
    // עדיין נטען (או נכשל קודם) — מנסים שוב עכשיו במקום להציג הודעה סתמית
    const my = ++accountReq;
    openSheet(t('חשבון'), `<p class="note">${t('מתחבר לענן…')}</p>`);
    try { await cloudUp(); if (my !== accountReq || sheet.hidden) return; }
    catch (e) {
      if (my !== accountReq || sheet.hidden) return;
      console.warn('cloud', e);
      return openSheet(t('חשבון'), `<p class="note">${t('לא הצלחנו להתחבר לענן')}${navigator.onLine === false ? ' — ' + t('אין חיבור לאינטרנט') : ''}. ${t('הנסיעות נשמרות בינתיים במכשיר.')}</p>
        <div class="actions"><button class="btn ghost" id="aRetry" type="button">${t('נסה שוב')}</button></div>`, (b) => { b.querySelector('#aRetry').onclick = () => openAccount(); });
    }
  }
  const u = getUser();
  if (u) return openProfile(u);
  openSheet(t('התחברות'), `
    <button class="btn" id="aGoogle" type="button"><svg class="gicon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4 5.6-4z"/></svg> ${t('המשך עם Google')}</button>
    ${hasNativeApple() ? `<button class="btn apple" id="aApple" type="button"> ${t('המשך עם Apple')}</button>` : ''}
    <div class="or"><span>${t('או באימייל')}</span></div>
    <label class="field"><span>${t('אימייל')}</span><input id="aEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" dir="ltr"></label>
    <label class="field"><span>${t('סיסמה')}</span><input id="aPass" type="password" autocomplete="current-password" placeholder="${t('6 תווים לפחות')}" dir="ltr"></label>
    <p class="err" id="aErr" hidden></p>
    <button class="btn ghost" id="aGo" type="button">${t('התחבר')}</button>
    <button type="button" class="linkbtn" id="aForgot">${t('שכחתי סיסמה')}</button>
    <p class="note">${t('בהתחברות הראשונה נפתח לך חשבון אוטומטית. בהתחברות אתה מאשר את {terms} ו{privacy}.', { terms: `<a href="#" data-doc="terms">${t('תנאי השימוש')}</a>`, privacy: `<a href="#" data-doc="privacy">${t('מדיניות הפרטיות')}</a>` })}</p>`, (b) => {
    const err = (m) => { const e = b.querySelector('#aErr'); e.hidden = !m; e.textContent = m || ''; };
    b.querySelector('#aGo').onclick = async () => {
      const email = b.querySelector('#aEmail').value.trim(), pass = b.querySelector('#aPass').value;
      if (!email || !pass) return err(t('מלא אימייל וסיסמה'));
      if (pass.length < 6) return err(t('הסיסמה חייבת להכיל לפחות 6 תווים'));
      b.querySelector('#aGo').disabled = true; err('');
      try { const r = await signInOrRegister(email, pass); renderAccountRow(); openProfile(r.user); toast(r.created ? t('נפתח לך חשבון חדש — ברוך הבא') : t('שלום, {name} — התחברת בהצלחה', { name: firstName(r.user) })); }
      catch (e) { err(errT(e)); } finally { b.querySelector('#aGo').disabled = false; }
    };
    b.querySelector('#aGoogle').onclick = async () => {
      err(''); b.querySelector('#aGoogle').disabled = true;
      try { const u = await signInGoogle(); if (u) { renderAccountRow(); openProfile(u); greet(u); } else toast(t('עוברים ל-Google להתחברות…')); }
      catch (e) { err(errT(e)); } finally { b.querySelector('#aGoogle').disabled = false; }
    };
    b.querySelector('#aApple') && (b.querySelector('#aApple').onclick = async () => {
      err(''); try { const u = await signInApple(); if (u) { renderAccountRow(); openProfile(u); greet(u); } } catch (e) { err(errT(e)); }
    });
    b.querySelector('#aForgot').onclick = async () => {
      const email = b.querySelector('#aEmail').value.trim(); if (!email) return err(t('כתוב את האימייל שלך ואז לחץ "שכחתי סיסמה"'));
      try { await resetPassword(email); err(t('שלחנו לך מייל לאיפוס הסיסמה')); } catch (e) { err(errT(e)); }
    };
  });
}
function openProfile(u) {
  const pid = u.providerData[0]?.providerId;
  openSheet(t('החשבון שלי'), `
    <dl class="kv"><dt>${t('שם')}</dt><dd>${esc(u.displayName || '—')}</dd><dt>${t('אימייל')}</dt><dd>${esc(u.email || '—')}</dd><dt>${t('התחברות')}</dt><dd>${pid === 'google.com' ? 'Google' : pid === 'apple.com' ? 'Apple' : t('אימייל וסיסמה')}</dd><dt>${t('נסיעות בענן')}</dt><dd>${loadRides().length}</dd></dl>
    <p class="note">${t('הנסיעות שלך נשמרות ב-Firebase (שרתי Google בתל אביב) ומסונכרנות לכל מכשיר שבו תתחבר.')}</p>
    <div class="actions"><button class="btn ghost" id="pOut" type="button">${t('התנתק')}</button><button class="btn ghost danger" id="pDel" type="button">${t('מחק חשבון')}</button></div>`, (b) => {
    b.querySelector('#pOut').onclick = async () => { await signOut(); closeSheet(); renderAccountRow(); };
    b.querySelector('#pDel').onclick = () => openDeleteAccount(u);
  });
}
function openDeleteAccount(u) {
  const needPass = u.providerData[0]?.providerId === 'password';
  openSheet(t('מחיקת חשבון'), `
    <p>${t('המחיקה מוחקת לצמיתות את החשבון ואת כל הנסיעות השמורות בענן. הנסיעות שבמכשיר הזה יישארו רק אם תבחר להשאירן.')}</p>
    ${needPass ? `<label class="field"><span>${t('סיסמה לאישור')}</span><input id="dPass" type="password" autocomplete="current-password" dir="ltr"></label>` : `<p class="note">${t('ייתכן שתתבקש לאשר מחדש את ההתחברות עם Google.')}</p>`}
    <label class="check"><input id="dLocal" type="checkbox" checked> ${t('למחוק גם את הנסיעות שבמכשיר הזה')}</label>
    <p class="err" id="dErr" hidden></p>
    <div class="actions"><button class="btn danger" id="dGo" type="button">${t('מחק לצמיתות')}</button><button class="btn ghost" id="dNo" type="button">${t('ביטול')}</button></div>`, (b) => {
    b.querySelector('#dNo').onclick = () => openProfile(u);
    b.querySelector('#dGo').onclick = async () => {
      const e = b.querySelector('#dErr'); e.hidden = true; b.querySelector('#dGo').disabled = true;
      try {
        await deleteAccount(needPass ? b.querySelector('#dPass').value : null);
        if (b.querySelector('#dLocal').checked) storeRides([]);
        closeSheet(); renderAccountRow(); renderRides();
        openSheet(t('החשבון נמחק'), `<p>${t('החשבון וכל הנתונים בענן נמחקו. תודה שהשתמשת ב"מונה".')}</p>`);
      } catch (err) { e.hidden = false; e.textContent = errT(err); b.querySelector('#dGo').disabled = false; }
    };
  });
}

function openTariffs() {
  const p = activePeriod(new Date());
  const row = (label, a, b, c) => `<tr><td>${label}</td><td class="n">${a}</td><td class="n">${b}</td><td class="n">${c}</td></tr>`;
  const v = (x) => (x * VAT).toFixed(2);
  openSheet(t('התעריפים הנוכחיים'), `
    <p class="note">${p.name === 'קבוע' ? t('הסט הקבוע') : t('הוראת שעה')} · ${fmtDate(p.valid_from)}${p.valid_to ? '–' + fmtDate(p.valid_to) : ' ' + t('ואילך')} · ${t('המחירים כאן כוללים מע"מ 18% (באילת: המחיר הנקוב בצו, ללא מע"מ)')}</p>
    <table class="tbl"><tr><th></th><th>${tariffShort('A')}</th><th>${tariffShort('B')}</th><th>${tariffShort('C')}</th></tr>
      ${row(t('הפעלת המונה'), v(p.start), v(p.start), v(p.start))}
      ${row(t('לכל דקה'), v(p.per_min.A), v(p.per_min.B), v(p.per_min.C))}
      ${row(t('לכל ק"מ, עד 10 ק"מ'), v(p.per_km_upto10.A), v(p.per_km_upto10.B), v(p.per_km_upto10.C))}
      ${row(t('לכל ק"מ, מעל 10 ק"מ'), v(p.per_km_over10.A), v(p.per_km_over10.B), v(p.per_km_over10.C))}
      ${row(t('שעת המתנה'), v(p.wait_hour.A), v(p.wait_hour.B), v(p.wait_hour.C))}
    </table>
    <table class="tbl"><tr><th>${t('תוספת')}</th><th></th></tr>
      <tr><td>${t('הזמנת מונית')}</td><td class="n">${v(p.order_surcharge)}</td></tr>
      <tr><td>${t('יציאה מנתב"ג / מרמון וחיפה')}</td><td class="n">${v(T.surcharges.ben_gurion)} / ${v(T.surcharges.ramon_or_haifa_airport)}</td></tr>
      <tr><td>${t('כביש 6 / קטע 18')}</td><td class="n">${v(T.surcharges.road6_main)} / ${v(T.surcharges.road6_segment18)}</td></tr>
      <tr><td>${t('מנהרות הכרמל, קטע / שניים')}</td><td class="n">${v(T.surcharges.carmel_tunnels_one)} / ${v(T.surcharges.carmel_tunnels_two)}</td></tr>
      <tr><td>${t('נתיב מהיר')}</td><td class="n">${t('לפי השלט')}</td></tr>
    </table>
    <table class="tbl"><tr><th>${t('מתי חל כל תעריף')}</th><th>${tariffShort('A')}</th><th>${tariffShort('B')}</th><th>${tariffShort('C')}</th></tr>
      ${row(t('ראשון–רביעי'), '06:00–21:00', '21:01–05:59', '—')}
      ${row(t('חמישי'), '06:00–21:00', '21:01–23:00', '23:01–05:59')}
      ${row(t('שישי וערב חג'), '06:00–16:00', '16:01–21:00', '21:01–05:59')}
      ${row(t('שבת וחג'), '—', '06:00–19:00', '19:01–05:59')}
    </table>
    <p class="note">${t('מקור: צו פיקוח על מחירי מצרכים ושירותים (מחירי נסיעה במוניות), התשע"ח–2018, כפי שתוקן ב-30.3.2026.')}</p>`);
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
  ['קבלה', 'בקש קבלה מודפסת מהמונה — היא הבסיס לכל תלונה. ב"מונה" אפשר גם להפיק "קבלה" משלך להשוואה (נסיעות ← נסיעה ← קבלה לשיתוף).', ''],
  ['עישון ורדיו', 'אסור לנהג לעשן כשיש נוסעים; חייב להנמיך רדיו לפי בקשה.', 'משרד התחבורה — חובות הנהג'],
];
function openRights() {
  openSheet(t('ידעת? זכויות הנוסע'), `<div class="facts">${FACTS.map(([a, d, s]) => `<div class="fact"><b>${t(a)}</b>${t(d)}${s ? `<small>${t(s)}</small>` : ''}</div>`).join('')}</div>`);
}

// ============ תלונה ============
function complaintText(ride) {
  if (!ride) return '';
  const parts = [];
  if (ride.asked > 0) parts.push(t('הנהג דרש {asked}; המחיר המרבי לפי הצו לנסיעה של {km} ק"מ ו-{min} דקות ({tariff}) הוא {total} — פער של {gap}.', { asked: nis(ride.asked), km: ride.km.toFixed(1), min: Math.round(ride.minutes), tariff: tariffLabelT(ride.tariffLabel), total: nis(ride.total), gap: nis(ride.asked - ride.total) }));
  else parts.push(t('נסיעה של {km} ק"מ ו-{min} דקות ({tariff}); המחיר המרבי לפי הצו: {total}.', { km: ride.km.toFixed(1), min: Math.round(ride.minutes), tariff: tariffLabelT(ride.tariffLabel), total: nis(ride.total) }));
  if (ride.track && ride.track.length > 1) parts.push(t('מצורפת קבלה עם מפת המסלול שנמדד.'));
  return parts.join(' ');
}
function openComplaint(ride) {
  if (!ride) { const last = loadRides()[0]; ride = last || null; }
  const when = ride ? fmtDT(new Date(ride.at)) : fmtDT(new Date());
  const where = ride && ride.from && ride.to ? `${ride.from} ${isRtl() ? '←' : '→'} ${ride.to}` : '';
  openSheet(t('הגשת תלונה על נהג'), `
    <p class="note">${t('משרד התחבורה מטפל בתלונות על הפקעת מחיר, אי הפעלת מונה, סירוב להסיע ועוד — רק אם הוגשו עד חודשיים מהאירוע.')}</p>
    <label class="field"><span>${t("מס' רישיון המונית")}</span><input id="cTaxi" type="text" class="txt" inputmode="numeric" value="${esc(ride?.taxi || '')}" placeholder="${t("על ה'כובע' ועל הדלת האחורית")}"></label>
    <label class="field"><span>${t('שם בעל המונית / הנהג')}</span><input id="cDriver" type="text" class="txt" value="${esc(ride?.driver || '')}" placeholder="${t('מהלוחית שבתוך המונית')}"></label>
    <label class="field"><span>${t('תאריך ושעה')}</span><input id="cWhen" type="text" value="${esc(when)}"></label>
    <label class="field"><span>${t('מקום')}</span><input id="cWhere" type="text" class="txt" value="${esc(where)}" placeholder="${t('מאיפה לאן')}"></label>
    <textarea id="cText" placeholder="${t('מה קרה? (למשל: הנהג דרש 140 ₪ בעוד שהמונה/החישוב לפי הצו הוא 117 ₪)')}">${esc(complaintText(ride))}</textarea>
    <ol class="steps">
      ${ride ? `<li>${t('שמור את הקבלה (עם מפת המסלול) כדי לצרף אותה.')} <button type="button" class="linkbtn inline" id="cReceipt">${t('שמור קבלה')}</button></li>` : ''}
      <li>${t('לחץ "פתח טופס תלונה" — הטקסט יועתק אוטומטית.')}</li>
      <li>${t('בטופס: בחר "פנייה חדשה", הדבק את הטקסט וצרף את הקבלה. תתבקש גם למלא תעודת זהות, כתובת וטלפון.')}</li>
    </ol>
    <div class="actions"><a class="btn" id="cSubmit" href="${COMPLAINT_FORM}" target="_blank" rel="noopener">${t('פתח טופס תלונה')} ↗</a></div>
    <div class="actions"><button class="btn ghost" id="cCopy" type="button">${t('העתק את הטקסט')}</button><a class="btn ghost" href="tel:*8787">${t('חייג *8787')}</a></div>`, (b) => {
    const g = (id) => b.querySelector(id).value.trim();
    const fullText = () => `${t('תלונה על נהג מונית')}\n${t("מס' רישיון המונית")}: ${g('#cTaxi')}\n${t('בעל המונית/הנהג')}: ${g('#cDriver')}\n${t('תאריך ושעה')}: ${g('#cWhen')}\n${t('מקום')}: ${g('#cWhere')}\n\n${g('#cText')}\n\n${t('(חושב באמצעות אפליקציית "מונה" לפי צו פיקוח על מחירי נסיעה במוניות)')}`;
    const copy = async () => { try { await navigator.clipboard.writeText(fullText()); return true; } catch (e) { return false; } };
    const sync = () => { if (ride && ride.source !== 'calc') { ride.taxi = g('#cTaxi'); ride.driver = g('#cDriver'); updateRide(ride); } else if (ride) { ride.taxi = g('#cTaxi'); ride.driver = g('#cDriver'); } };
    ['#cTaxi', '#cDriver'].forEach(id => b.querySelector(id).addEventListener('change', sync));
    b.querySelector('#cCopy').onclick = async () => { b.querySelector('#cCopy').textContent = (await copy()) ? t('הועתק ✓') : t('לא ניתן להעתיק'); };
    b.querySelector('#cSubmit').addEventListener('click', () => { sync(); copy().then((ok) => toast(ok ? t('הטקסט הועתק — הדבק אותו בטופס') : t('העתק את הטקסט ידנית מהשדה'))); });
    b.querySelector('#cReceipt')?.addEventListener('click', (e) => { sync(); shareReceipt(ride, e.currentTarget); });
  });
}

function openDoc(key) { openSheet(t(DOCS[key].title), `<div class="legal">${docHtml(key, { lang: lang() })}</div>`); }
document.addEventListener('click', (e) => { const a = e.target.closest('a[data-doc]'); if (a) { e.preventDefault(); openDoc(a.dataset.doc); } });

function openAbout() {
  openSheet(t('אודות'), `<p>${t('"מונה" מחשבת את המחיר המרבי החוקי של נסיעה במונית מיוחדת בישראל, לפי צו פיקוח על מחירי מצרכים ושירותים (מחירי נסיעה במוניות), התשע"ח–2018, כפי שתוקן ב-30.3.2026 (ק"ת 12345), ולפי תקנות התעבורה.')}</p>
    <p class="note">${t('החישוב הוא הערכה: המונה המכויל במונית הוא הקובע, ומדידת GPS יכולה לסטות בכמה אחוזים. התעריפים מתעדכנים כל 1 באפריל.')}</p>
    <p class="note">${t('"מונה" אינה אפליקציה ממשלתית ואינה קשורה למשרד התחבורה או לכל גוף ממשלתי.')} ${t('מקורות רשמיים:')} <a href="https://www.gov.il/he/pages/taxi-rate-2026" target="_blank" rel="noopener">${t('משרד התחבורה — תעריפי מוניות 2026')}</a> · <a href="https://www.gov.il/he/pages/taxi_driver_and_passenger_information" target="_blank" rel="noopener">${t('משרד התחבורה — מידע לנהג ולנוסע במונית')}</a></p>
    <p class="note">${t('גרסה')} ${VERSION === '__VERSION__' ? 'dev' : VERSION} (${BUILD === '__BUILD__' ? 'dev' : BUILD}) · ${t('לו קורק')} · lou.korek@gmail.com · <a href="#" data-doc="terms">${t('תנאי שימוש')}</a> · <a href="#" data-doc="privacy">${t('פרטיות')}</a> · <a href="#" data-doc="accessibility">${t('נגישות')}</a></p>
    <div class="actions"><button class="btn ghost" id="chkUpd" type="button">${t('בדוק עדכון')}</button></div>`, (b) => {
    b.querySelector('#chkUpd').onclick = async () => {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) return toast(t('האפליקציה רצה ללא מטמון (דפדפן ישן או תצוגה מקדימה)'));
      await reg.update(); toast(reg.installing || reg.waiting ? t('נמצא עדכון — מתקין…') : t('זו הגרסה העדכנית'));
    };
  });
}

// ============ PWA: עבודה בלי אינטרנט, עדכונים והתקנה ============
if (!isNative() && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast(t('הורדה גרסה חדשה של מונה')); });
    });
  }).catch((e) => console.warn('sw', e));
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }       // התקנה ראשונה — אין מה לרענן
    if (live.timer) { pwa.reloadPending = true; return; }         // באמצע נסיעה לא מרעננים; נרענן אחרי הסיום
    location.reload();
  });
}
function applyPendingReload() { if (pwa.reloadPending) { pwa.reloadPending = false; setTimeout(() => location.reload(), 1500); } }

// התקנה במסך הבית
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pwa.installEvt = e; renderInstallRow(); });
window.addEventListener('appinstalled', () => { pwa.installEvt = null; renderInstallRow(); toast(t('מונה הותקנה במסך הבית')); });
function renderInstallRow() {
  const row = $('installRow'); if (!row) return;
  row.hidden = isNative() || isStandalone() || !(pwa.installEvt || isIOS);
}
$('installRow')?.addEventListener('click', async () => {
  if (pwa.installEvt) { pwa.installEvt.prompt(); const r = await pwa.installEvt.userChoice; if (r.outcome === 'accepted') pwa.installEvt = null; renderInstallRow(); return; }
  openSheet(t('התקנה במסך הבית'), `<p>${t('ב-iPhone: לחץ על כפתור השיתוף {icon} בסרגל של Safari, גלול ובחר {add}, ואז {ok}.', { icon: '<b>⎙</b>', add: `<b>"${t('הוסף למסך הבית')}"</b>`, ok: `<b>"${t('הוסף')}"</b>` })}</p><p class="note">${t('אחרי ההתקנה מונה נפתחת כמו אפליקציה רגילה, במסך מלא וגם בלי אינטרנט.')}</p>`);
});
renderInstallRow();

// מצב רשת
function renderOnline() {
  document.body.classList.toggle('offline', !navigator.onLine);
  $('topSub').dataset.off = t('לא מקוון');
  if (!getUser()) $('accountSub').textContent = navigator.onLine ? t('שמור נסיעות בענן וגש אליהן מכל מכשיר') : t('אין אינטרנט — הנסיעות נשמרות במכשיר ויסונכרנו אחר כך');
}
window.addEventListener('online', () => { renderOnline(); if (getUser()) syncRides(); });
window.addEventListener('offline', renderOnline);
renderOnline();

// ============ אפליקציה מותקנת (Android/iOS) ============
initNative({ onBack: () => { if (!sheet.hidden) { closeSheet(); return true; } const cur = document.querySelector('.tabbar [aria-selected="true"]')?.dataset.view; if (cur && cur !== 'calc') { showView('calc'); return true; } return false; } });
