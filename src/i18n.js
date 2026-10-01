// שפות הממשק: עברית (מקור), English, Русский, العربية.
// המפתח של כל מחרוזת הוא הנוסח העברי עצמו: t('מחשבון') מחזיר את התרגום, ואם אין – את העברית.
// משתנים: t('יציאה ב-{time}', { time: '21:00' }). המילון עצמו ב-i18n-data.js.
import { I18N } from './i18n-data.js';

export const LANGS = {
  he: { name: 'עברית', dir: 'rtl', locale: 'he-IL' },
  en: { name: 'English', dir: 'ltr', locale: 'en-IL' },
  ru: { name: 'Русский', dir: 'ltr', locale: 'ru-IL' },
  ar: { name: 'العربية', dir: 'rtl', locale: 'ar-IL' },
};
const LANG_KEY = 'mone.lang';
let LANG = 'he';

// בחירה שמורה קודמת. אחרת: עברית אם היא באחת משפות המכשיר, או אם כבר יש נסיעות שמורות
// (משתמש ותיק – רבים בישראל מחזיקים טלפון באנגלית ולא נחליף להם פתאום שפה). אחרת – שפת המכשיר אם נתמכת, ואם לא – אנגלית.
function detect() {
  let old = false;
  try {
    const s = localStorage.getItem(LANG_KEY); if (s && LANGS[s]) return s;
    old = !!(localStorage.getItem('mone.history') || localStorage.getItem('mone.liveRide'));
  } catch (e) { /* */ }
  const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'he']).map((l) => String(l).slice(0, 2).toLowerCase());
  if (old || prefs.some((p) => p === 'he' || p === 'iw')) return 'he';
  for (const p of prefs) if (LANGS[p]) return p;
  return prefs.length && prefs[0] ? 'en' : 'he'; // שפה אחרת (צרפתית, גרמנית...) – כנראה תייר: אנגלית
}
export function initLang() {
  LANG = detect();
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANGS[LANG].dir;
  document.documentElement.classList.toggle('ltr', LANGS[LANG].dir === 'ltr');
  return LANG;
}
export const lang = () => LANG;
export const isRtl = () => LANGS[LANG].dir === 'rtl';
export function setLang(l) {
  if (!LANGS[l]) return;
  try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* */ }
  location.reload();
}

export function t(s, vars) {
  let r = s;
  if (LANG !== 'he') { const d = I18N[LANG]; if (d && Object.prototype.hasOwnProperty.call(d, s)) r = d[s]; }
  if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
  return r;
}

// תרגום התוכן הקבוע של index.html: טקסטים ותכונות נגישות/placeholder
export function translateStatic(root = document.body) {
  if (LANG === 'he') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const raw = n.nodeValue; const key = raw.trim();
    if (!key || !/[֐-׿]/.test(key)) continue;
    const tr = t(key); if (tr !== key) n.nodeValue = raw.replace(key, tr);
  }
  root.querySelectorAll('[placeholder],[aria-label],[title],[alt]').forEach((el) => {
    for (const a of ['placeholder', 'aria-label', 'title', 'alt']) {
      const v = el.getAttribute(a); if (v && /[֐-׿]/.test(v)) el.setAttribute(a, t(v));
    }
  });
  document.title = t(document.title);
}
