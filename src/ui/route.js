// מוצא ← יעד: שדות עם השלמה אוטומטית (Google Places דרך הפונקציה שלנו ב-Netlify), מיקום נוכחי, כתובות שמורות,
// וחישוב מסלול (Routes API). התוצאה נכתבת ל-draft שב-store; המסך מקבל קריאה חוזרת ומצייר מחדש.
import { t } from '../i18n.js';
import { isNative, geoOnce } from '../native.js';
import { decodePolyline, detectSurcharges } from '../geo.js';
import { draft, places, quickPlaces, rememberPlace, setNamedPlace, samePlace, applyDetected, resetAuto, emit } from '../store.js';
import { $, esc, icon, toast, autoName } from './dom.js';
import { APP_URL } from './price.js';

const API_BASE = isNative() ? `https://${APP_URL}` : '';
const state = { token: null, timer: null, active: null, req: 0, near: null, items: [], sel: -1, lastFix: null };
export const setNearFix = (fix) => { state.lastFix = fix; };

const newToken = () => { state.token = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())).slice(0, 36); };
newToken();
export async function mapsApi(path, body) {
  const r = await fetch(`${API_BASE}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.message || 'maps'), { code: data.error || r.status });
  return data;
}
export const routeErr = (e) => e.code === 'missing-key' ? t('שירות המסלולים עדיין לא הופעל') : e.code === 'no-route' ? t('לא נמצא מסלול נסיעה בין הנקודות') : (navigator.onLine === false || e.name === 'TypeError') ? t('אין חיבור לאינטרנט — הזן ק"מ ודקות ידנית') : t('חישוב המסלול נכשל, נסה שוב');

export function routeFieldsHtml() {
  return `<div class="route" id="route">
    <div class="field place ${draft.from ? 'set' : ''}" data-which="from"><span class="dot from"></span><input id="rtFrom" type="text" class="txt" placeholder="${t('מוצא')}" value="${esc(draft.from?.label || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" aria-label="${t('נקודת מוצא')}" role="combobox" aria-autocomplete="list" aria-controls="rtList" aria-expanded="false"><button class="iconbtn sm" id="rtGps" type="button" title="${t('המיקום הנוכחי שלי')}" aria-label="${t('המיקום הנוכחי שלי')}">${icon('gps')}</button></div>
    <button class="swap" id="rtSwap" type="button" title="${t('החלף מוצא ויעד')}" aria-label="${t('החלף מוצא ויעד')}">${icon('swap')}</button>
    <div class="field place ${draft.to ? 'set' : ''}" data-which="to"><span class="dot to"></span><input id="rtTo" type="text" class="txt" placeholder="${t('לאן נוסעים?')}" value="${esc(draft.to?.label || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="${t('יעד')}" role="combobox" aria-autocomplete="list" aria-controls="rtList" aria-expanded="false"></div>
    <div class="suggest" id="rtList" role="listbox" aria-label="${t('הצעות כתובת')}" hidden></div>
  </div>`;
}

const field = (which) => $(which === 'from' ? 'rtFrom' : 'rtTo');
function setPlace(which, place) {
  draft[which] = place;
  const inp = field(which); if (!inp) return;
  inp.value = place ? place.label : inp.value;
  inp.closest('.field').classList.toggle('set', !!place);
}
function hideList() {
  const l = $('rtList'); if (!l) return;
  l.hidden = true; l.innerHTML = ''; state.items = []; state.sel = -1;
  ['rtFrom', 'rtTo'].forEach((id) => { $(id)?.setAttribute('aria-expanded', 'false'); $(id)?.removeAttribute('aria-activedescendant'); });
}
function placeList(which, html) {
  const list = $('rtList'), inp = field(which); if (!list || !inp) return;
  const f = inp.closest('.field');
  list.style.top = (f.offsetTop + f.offsetHeight + 4) + 'px';
  list.innerHTML = html; list.hidden = false; inp.setAttribute('aria-expanded', 'true');
  list.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));   // לא לאבד פוקוס לפני הלחיצה
  list.querySelectorAll('[role=option]').forEach((b) => b.addEventListener('click', () => pickItem(which, state.items[Number(b.dataset.i)])));
}
function showList(items, which) {
  state.items = items.map((s) => ({ kind: 's', s })); state.sel = -1;
  placeList(which, items.length
    ? items.map((s, i) => `<button type="button" role="option" id="rtOpt${i}" aria-selected="false" data-i="${i}">${icon('pin')}<span><b>${esc(s.main)}</b>${s.secondary ? `<small>${esc(s.secondary)}</small>` : ''}</span></button>`).join('')
    : `<div class="empty">${t('לא נמצאו תוצאות — נסה כתובת מדויקת יותר')}</div>`);
}
function showQuick(which) {
  const items = quickPlaces().map((x) => ({ kind: 'p', ...x }));
  if (!items.length) return hideList();
  state.items = items; state.sel = -1;
  const tagName = { home: t('בית'), work: t('עבודה') };
  const rows = items.map((it, i) => {
    const ic = it.tag === 'home' ? 'home' : it.tag === 'work' ? 'work' : 'clock';
    const main = it.tag === 'recent' ? `<b>${esc(it.p.label)}</b>` : `<b>${tagName[it.tag]}</b><small>${esc(it.p.label)}</small>`;
    const acts = it.tag === 'recent'
      ? `<button type="button" class="qa" data-act="home" data-i="${i}" title="${t('שמור כבית')}" aria-label="${t('שמור כבית')}">${icon('home')}</button><button type="button" class="qa" data-act="work" data-i="${i}" title="${t('שמור כעבודה')}" aria-label="${t('שמור כעבודה')}">${icon('work')}</button>`
      : `<button type="button" class="qa" data-act="unset" data-i="${i}" title="${t('הסר')}" aria-label="${t('הסר')} ${tagName[it.tag]}">×</button>`;
    return `<div class="qrow"><button type="button" role="option" id="rtOpt${i}" aria-selected="false" data-i="${i}">${icon(ic)}<span>${main}</span></button>${acts}</div>`;
  }).join('');
  const hint = !places.home && !places.work ? `<div class="empty small">${t('אפשר לשמור כתובת כבית או כעבודה בלחיצה על הסמל שלידה')}</div>` : '';
  placeList(which, rows + hint);
  $('rtList').querySelectorAll('.qa').forEach((b) => b.addEventListener('click', () => {
    const it = state.items[Number(b.dataset.i)]; if (!it) return;
    if (b.dataset.act === 'unset') setNamedPlace(it.tag, null);
    else { setNamedPlace(b.dataset.act, it.p); toast(b.dataset.act === 'home' ? t('נשמר כבית') : t('נשמר כעבודה')); }
    showQuick(which);
  }));
}
// מאזינים לפי מסך (כל מסך רושם פעם אחת; רישום חוזר מחליף)
const routeListeners = new Map();
export const onRoute = (key, fn) => { routeListeners.set(key, fn); };
const onRouteChange = (ev, msg) => routeListeners.forEach((fn) => { try { fn(ev, msg); } catch (e) { console.warn('route', e); } });
function pickItem(which, it) {
  if (!it) return;
  const place = it.kind === 's' ? { label: it.s.secondary ? `${it.s.main}, ${it.s.secondary}` : it.s.main, placeId: it.s.placeId } : { ...it.p };
  setPlace(which, place); rememberPlace(place);
  hideList(); if (it.kind === 's') newToken();
  if (which === 'from' && !draft.to) $('rtTo').focus(); else field(which).blur();
  onRouteChange('place');
  computeRoute();
}
async function suggest(which) {
  const q = field(which).value.trim();
  if (!q) return showQuick(which);
  if (q.length < 2) return hideList();
  const my = ++state.req;
  try {
    const { suggestions } = await mapsApi('places', { input: q, sessionToken: state.token, near: state.near || state.lastFix || null });
    if (my !== state.req || field(which).value.trim() !== q) return;
    showList(suggestions, which);
  } catch (e) { if (my === state.req) { hideList(); if (e.code === 'missing-key') toast(routeErr(e)); } }
}
function markSel() {
  $('rtList').querySelectorAll('[role=option]').forEach((b, i) => { b.setAttribute('aria-selected', String(i === state.sel)); if (i === state.sel) b.scrollIntoView({ block: 'nearest' }); });
  const inp = field(state.active || 'from'); if (state.sel >= 0) inp.setAttribute('aria-activedescendant', 'rtOpt' + state.sel); else inp.removeAttribute('aria-activedescendant');
}
export function clearRoute() {
  if (!draft.route) return;
  draft.route = null; draft.points = null; draft.found = []; resetAuto(draft);
  onRouteChange('clear');
}
export function clearPlaces() {
  setPlace('from', null); setPlace('to', null);
  if ($('rtFrom')) { $('rtFrom').value = ''; $('rtTo').value = ''; }
  clearRoute(); onRouteChange('place');
}
export async function computeRoute() {
  if (!draft.from || !draft.to) return;
  const my = ++state.req;
  onRouteChange('computing');
  try {
    const when = draft.when;
    const r = await mapsApi('route', { origin: draft.from, destination: draft.to, departureTime: when && !isNaN(when) ? when.toISOString() : undefined });
    if (my !== state.req) return;
    draft.route = r;
    draft.points = r.polyline ? decodePolyline(r.polyline) : [];
    if (draft.from.gps && draft.points.length) draft.points.unshift([draft.from.lat, draft.from.lon]);
    resetAuto(draft);
    draft.found = applyDetected(draft, detectSurcharges(draft.points)).map(([k, v]) => autoName(k, v));
    draft.km = Number(r.km.toFixed(1)); draft.minutes = r.minutes;
    emit('draft');
    onRouteChange('route');
  } catch (e) {
    if (my !== state.req) return;
    draft.route = null; draft.points = null; draft.found = [];
    onRouteChange('error', routeErr(e));
  }
}
export async function useMyLocation() {
  const btn = $('rtGps'); btn?.classList.add('busy');
  try {
    const p = await geoOnce({ timeout: 15000 });
    state.near = { lat: p.lat, lon: p.lon };
    setPlace('from', { label: t('המיקום הנוכחי שלי'), lat: p.lat, lon: p.lon, gps: true });
    hideList(); onRouteChange('place');
    if (draft.to) computeRoute(); else $('rtTo')?.focus();
  } catch (e) {
    toast(e.code === 1 ? t('אין הרשאת מיקום — אפשר לתת הרשאה בהגדרות, או להקליד מוצא') : t('לא הצלחנו לקבל מיקום — הקלד מוצא'));
  } finally { btn?.classList.remove('busy'); }
}
// מחבר את ההתנהגות לשדות שכבר קיימים ב-DOM (אחרי routeFieldsHtml)
export function wireRoute() {
  if (!$('rtFrom')) return;
  ['from', 'to'].forEach((which) => {
    const inp = field(which);
    inp.addEventListener('input', () => {
      if (draft[which]) { draft[which] = null; inp.closest('.field').classList.remove('set'); clearRoute(); onRouteChange('place'); }
      state.active = which; clearTimeout(state.timer);
      if (!inp.value.trim()) { showQuick(which); return; }
      state.timer = setTimeout(() => suggest(which), 320);
    });
    inp.addEventListener('focus', () => { state.active = which; const v = inp.value.trim(); if (!v) showQuick(which); else if (v.length >= 2 && !draft[which]) suggest(which); });
    inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('rtFrom') && document.activeElement !== $('rtTo')) hideList(); }, 150));
    inp.addEventListener('keydown', (e) => {
      const n = state.items.length;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); state.sel = (state.sel + 1) % n; markSel(); }
      else if (e.key === 'ArrowUp' && n) { e.preventDefault(); state.sel = (state.sel - 1 + n) % n; markSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (n) pickItem(which, state.items[state.sel < 0 ? 0 : state.sel]); }
      else if (e.key === 'Escape') hideList();
    });
  });
  $('rtGps').addEventListener('click', useMyLocation);
  $('rtSwap').addEventListener('click', () => {
    const [f, to] = [draft.from, draft.to]; const [fv, tv] = [$('rtFrom').value, $('rtTo').value];
    setPlace('from', to); setPlace('to', f);
    if (!to) $('rtFrom').value = tv; if (!f) $('rtTo').value = fv;
    hideList(); onRouteChange('place');
    if (draft.from && draft.to) computeRoute(); else clearRoute();
  });
}
// בחירה מהירה מכתובת שמורה (צ'יפים במסך הבית) – תמיד כיעד
export function pickSaved(p) {
  setPlace('to', { ...p }); rememberPlace(p); onRouteChange('place');
  if (!draft.from) useMyLocation(); else computeRoute();
}
export const isSame = samePlace;
