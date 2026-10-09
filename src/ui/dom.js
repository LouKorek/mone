// עזרי ממשק משותפים: בחירה, פורמט, תוויות מתורגמות, הודעה קצרה, גיליון תחתון עם מחסנית, וניווט בין מסכים.
import { booted } from '../boot.js';
import { t, lang, isRtl } from '../i18n.js';
import { getTariffs, TARIFF_NAMES } from '../engine.js';

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const nis = (n) => '₪' + Number(n).toFixed(2);
export const nis0 = (n) => '₪' + Math.round(Number(n));
export const pad2 = (n) => String(n).padStart(2, '0');
export const fmtNum = (n) => Number.isInteger(n) ? String(n) : Number(n).toFixed(1);
export const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${Number(d)}.${Number(m)}.${y}`; };
export const fmtDT = (d) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const hm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const fmtDuration = (sec) => sec >= 3600 ? `${Math.floor(sec / 3600)}:${pad2(Math.floor(sec % 3600 / 60))}:${pad2(sec % 60)}` : `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
export const toLocalInputValue = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const arrow = () => isRtl() ? '←' : '→';
// תאריך יחסי קצר לרשימות: היום / אתמול / תאריך
export function relDay(d) {
  const now = new Date(); const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return t('היום'); if (diff === 1) return t('אתמול');
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}${d.getFullYear() !== now.getFullYear() ? '.' + d.getFullYear() : ''}`;
}

// ---- תוויות מתורגמות (המנוע מחזיר עברית) ----
const TARIFF_LETTER = { A: "א'", B: "ב'", C: "ג'" };
export const tariffShort = (k) => t(TARIFF_LETTER[k]);
export const tariffName = (k) => t(TARIFF_NAMES[k]);
export const tariffLabelT = (label) => String(label || '').split(' + ').map((x) => t(x)).join(' + ');
export function dayLabelT(label) {
  if (!label) return '';
  if (label.startsWith('ערב ') && label !== 'ערב שבת') return t('ערב {name}', { name: t(label.slice(4)) });
  return t(label);
}
export const periodT = (p) => p === 'קבוע' ? t('הסט הקבוע של הצו') : t('הוראת השעה בצו');
export function lineLabel(l) {
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
    case 'vat': return t('מע"מ {p}%', { p: Math.round((l.rate ?? getTariffs().vat) * 100) });
    case 'fastlane': return t('נתיב מהיר (לפי השלט)');
  }
  return t(l.label);   // נסיעות ישנות שנשמרו לפני שהיו שדות מובנים
}
export const autoName = (k, v) => ({ airport: v === 'ramon' ? t('יציאה משדה תעופה רמון/חיפה') : t('יציאה מנתב"ג'), road6: t('כביש 6'), segment18: t('קטע 18'), carmel: v === 2 ? t('מנהרות הכרמל – שני קטעים') : t('מנהרות הכרמל') })[k];

// ---- הודעה קצרה ----
export function toast(msg, ms = 3600) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), ms);
}

// ---- גיליון תחתון: מחסנית, כך שגיליון שנפתח מתוך גיליון חוזר אליו בסגירה ----
const stack = [];        // [{ title, html, after, onClose }]
let sheetCtx = null;     // מידע שהגיליון הנוכחי חושף (למשל הנסיעה המוצגת)
export const sheetContext = (v) => { if (v !== undefined) sheetCtx = v; return sheetCtx; };
export const sheetOpen = () => !$('sheet').hidden;
export const sheetDepth = () => stack.length;
function paint(entry) {
  const sheet = $('sheet'); sheetCtx = null;
  $('sheetTitle').textContent = entry.title; $('sheetBody').innerHTML = entry.html;
  $('sheetBack').hidden = stack.length < 2;
  const wasOpen = !sheet.hidden;
  clearTimeout(hideTimer); sheet.classList.remove('closing'); $('sheetBackdrop').classList.remove('closing');
  sheet.style.transform = ''; $('sheetBackdrop').style.opacity = '';
  sheet.hidden = false; $('sheetBackdrop').hidden = false;
  if (!wasOpen) { sheet.classList.remove('opening'); void sheet.offsetWidth; sheet.classList.add('opening'); }
  document.documentElement.classList.add('sheet-open');
  $('sheetBody').scrollTop = 0;
  if (entry.after) entry.after($('sheetBody'));
  $('sheetClose').focus({ preventScroll: true });
}
export function openSheet(title, html, after, opts = {}) {
  if (opts.replace && stack.length) stack.pop();
  stack.push({ title, html, after, onClose: opts.onClose || null });
  paint(stack[stack.length - 1]);
}
// סוגר את הגיליון העליון; אם יש גיליון מתחתיו – חוזר אליו (אלא אם all=true)
export function closeSheet(all = false) {
  if (!stack.length) return;
  const closed = all ? stack.splice(0) : [stack.pop()];
  if (stack.length) { paint(stack[stack.length - 1]); }
  else { hideSheet(); sheetCtx = null; }
  closed.forEach((e) => { if (e.onClose) e.onClose(); });
}
// יציאה עם החלקה למטה, כמו גיליון אמיתי
let hideTimer = 0;
function hideSheet() {
  const sheet = $('sheet'), bd = $('sheetBackdrop');
  document.documentElement.classList.remove('sheet-open');
  sheet.classList.remove('opening'); sheet.classList.add('closing'); bd.classList.add('closing');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { sheet.hidden = true; bd.hidden = true; sheet.classList.remove('closing'); bd.classList.remove('closing'); sheet.style.transform = ''; bd.style.opacity = ''; }, 220);
}
// גרירה למטה סוגרת: מהידית ומהכותרת תמיד, ומתוך התוכן כשהוא גלול לראש
function initSheetDrag() {
  const sheet = $('sheet'), body = $('sheetBody'), bd = $('sheetBackdrop');
  let y0 = 0, t0 = 0, dy = 0, mode = null; // null | 'maybe' | 'drag' | 'scroll'
  sheet.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { mode = null; return; }
    y0 = e.touches[0].clientY; t0 = Date.now(); dy = 0;
    const inBody = body.contains(e.target);
    mode = !inBody ? 'drag' : body.scrollTop <= 0 ? 'maybe' : 'scroll';
    if (mode === 'drag' && e.target.closest('button, input, select, textarea, a')) mode = 'maybe';
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (!mode || mode === 'scroll') return;
    const d = e.touches[0].clientY - y0;
    if (mode === 'maybe') {
      if (Math.abs(d) < 6) return;
      if (d < 0 || body.scrollTop > 0) { mode = 'scroll'; return; }
      mode = 'drag';
    }
    dy = Math.max(0, d);
    if (e.cancelable) e.preventDefault();
    sheet.style.transition = 'none'; bd.style.transition = 'none';
    sheet.style.transform = `translateY(${dy}px)`;
    bd.style.opacity = String(Math.max(0, 1 - dy / Math.max(1, sheet.offsetHeight)));
  }, { passive: false });
  const end = () => {
    if (mode !== 'drag') { mode = null; return; }
    mode = null;
    sheet.style.transition = ''; bd.style.transition = '';
    const fast = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.5;
    if (dy > sheet.offsetHeight * 0.3 || fast) closeSheet(true);
    else { sheet.style.transform = ''; bd.style.opacity = ''; }
  };
  sheet.addEventListener('touchend', end); sheet.addEventListener('touchcancel', end);
}
export function initSheet() {
  initSheetDrag();
  $('sheetClose').addEventListener('click', () => closeSheet(true));
  $('sheetBack').addEventListener('click', () => closeSheet(false));
  $('sheetBackdrop').addEventListener('click', () => closeSheet(true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen()) closeSheet(false); });
}

// ---- ניווט: מסך אחד פעיל, מחסנית לחזרה (כפתור חזרה באנדרואיד / חץ בראש המסך) ----
const screens = new Map();   // name -> { render(el, params), onShow?, onHide? }
const history = [];          // [{ name, params }]
export function defineScreen(name, def) { screens.set(name, def); }
export const currentScreen = () => history[history.length - 1]?.name || null;
export function go(name, params = {}, opts = {}) {
  const def = screens.get(name); if (!def) throw new Error('מסך לא קיים: ' + name);
  const prev = history[history.length - 1];
  if (prev && prev.name === name && !opts.force) { render(name, params); return; }
  if (opts.replace && history.length) history.pop();
  if (opts.root) history.length = 0;
  history.push({ name, params });
  if (prev && prev.name !== name) screens.get(prev.name).onHide?.();
  render(name, params);
}
function render(name, params) {
  const def = screens.get(name);
  const main = $('screens');
  let el = main.querySelector(`.screen[data-screen="${name}"]`);
  if (!el) { el = document.createElement('section'); el.className = 'screen'; el.dataset.screen = name; main.appendChild(el); }
  def.render(el, params);
  main.querySelectorAll('.screen').forEach((s) => { s.hidden = s !== el; });
  el.scrollTop = 0;
  document.documentElement.dataset.screen = name;
  def.onShow?.(params);
}
// חזרה אחורה; מחזיר false אם אין לאן
export function back() {
  if (sheetOpen()) { closeSheet(false); return true; }
  if (history.length < 2) return false;
  const cur = history.pop(); screens.get(cur.name).onHide?.();
  const prev = history[history.length - 1]; render(prev.name, prev.params);
  return true;
}
export function refreshScreen() { const cur = history[history.length - 1]; if (cur) render(cur.name, cur.params); }
export function screenEl(name) { return $('screens').querySelector(`.screen[data-screen="${name}"]`); }
export const langName = () => lang();
