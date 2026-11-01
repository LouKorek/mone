// רכיבים משותפים לשפת העיצוב "נסיעת לילה": סרגל הלשוניות, שלט הגג (התעריף עכשיו), ספרות LED, ציר יום התעריפים
// ושורת "אינה אפליקציה ממשלתית". כל מסך מרכיב מהם את מה שהוא צריך.
import { t, isRtl } from '../i18n.js';
import { tariffAt, BANDS } from '../engine.js';
import { esc, icon, hm, pad2, go, tariffName, tariffShort, dayLabelT, sheetOpen, closeSheet } from './dom.js';

// ---- סרגל לשוניות תחתון ----
const TABS = [['home', 'home', 'בית'], ['rides', 'history', 'נסיעות'], ['tariffs', 'list', 'תעריפים'], ['rights', 'shield', 'זכויות ותלונה']];
export function tabbarHtml(active) {
  return `<nav class="tabbar" aria-label="${t('ניווט ראשי')}">${TABS.map(([k, ic, label]) => `<button type="button" class="tab${k === active ? ' on' : ''}" data-tab="${k}"${k === active ? ' aria-current="page"' : ''}>${icon(ic)}<span>${t(label)}</span></button>`).join('')}</nav>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  if (b.classList.contains('on')) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  go(b.dataset.tab, {}, { root: true });
});

// ---- שלט הגג: אות התעריף בחלון LED ----
export const tariffLetter = (k) => tariffShort(k).replace(/['׳]/g, '');
// מתי משתנה התעריף הבא (עד 24 שעות קדימה)
export function nextChange(now) {
  const cur = tariffAt(now).tariff;
  for (let m = 1; m <= 1440; m++) { const d = new Date(now.getTime() + m * 60000); const x = tariffAt(d); if (x.tariff !== cur) return { at: d, tariff: x.tariff }; }
  return null;
}
const countdown = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; };
// sub: 'until' → "יום חול · עד 21:00"; 'countdown' → "עוד 02:18 ב'"; 'day' → "יום חול"
export function roofHtml(now = new Date(), { id = '', sub = 'until', button = true, tariff = null } = {}) {
  const info = tariffAt(now), k = tariff || info.tariff, nx = nextChange(now);
  let s = dayLabelT(info.label);
  if (sub === 'until' && nx) s += ' · ' + t('עד {time}', { time: hm(new Date(nx.at.getTime() - 60000)) });
  if (sub === 'countdown' && nx) s = t('עוד {time} {tariff}', { time: countdown(nx.at - now), tariff: tariffShort(nx.tariff) });
  const tag = button ? 'button' : 'span';
  return `<${tag}${button ? ' type="button"' : ''} class="roof${button ? '' : ' static'}"${id ? ` id="${id}"` : ''}${button ? ` aria-label="${esc(t('התעריפים הנוכחיים'))}: ${esc(tariffName(k))}"` : ''}><span class="win ${k}" aria-hidden="true">${esc(tariffLetter(k))}</span><span class="tx"><b>${esc(tariffName(k))}</b><span>${esc(s)}</span></span></${tag}>`;
}

// ---- ספרות LED עם "רפאים" 888.88 מאחור ----
const FIG = ' ';
export function digitsInner(n, { cur = true, min = 6 } = {}) {
  const v = typeof n === 'number' ? n.toFixed(2) : String(n);
  const padded = v.padStart(min, FIG);
  const ghost = padded.replace(/[\d ]/g, '8');
  const c = cur ? '<span class="cur">₪</span>' : '';
  return `<span class="ghost" aria-hidden="true">${c}${ghost}</span>${c}${padded}`;
}
export const digitsHtml = (n, { id = '', size = 60, cls = '', cur = true, min = 6, label = '' } = {}) =>
  `<span class="digits ${cls}"${id ? ` id="${id}"` : ''} style="font-size:${size >= 40 ? `min(${size}px, calc((100vw - 80px) * ${(size / 310).toFixed(4)}))` : size + 'px'}"${label ? ` aria-label="${esc(label)}"` : ''}>${digitsInner(n, { cur, min })}</span>`;
// מקטין את הספרות כשהן רחבות מהצג (מסך צר או סכום ארוך)
export function fitDigits(el, max) {
  if (!el) return;
  el.style.fontSize = max + 'px';
  const avail = el.parentElement ? el.parentElement.clientWidth : 0, w = el.scrollWidth;
  if (avail && w > avail) el.style.fontSize = Math.floor(max * avail / w) + 'px';
}
export function setDigits(el, n, opts) { if (el) { el.innerHTML = digitsInner(n, opts); if (typeof n === 'number') el.setAttribute('aria-label', '₪' + n.toFixed(2)); } }

// ---- ציר יום התעריפים: 06:00 → 06:00 ----
export function timelineHtml(kind, now = null) {
  const bands = BANDS[kind]; let from = 0;
  const segs = bands.map(([k, until]) => { const w = (until - from) / 1440 * 100; from = until; return `<i class="${k}" style="width:${w.toFixed(3)}%">${esc(tariffShort(k))}</i>`; }).join('');
  let mark = '';
  if (now) {
    const m = ((now.getHours() * 60 + now.getMinutes()) - 360 + 1440) % 1440, x = m / 1440 * 100;
    mark = `<span class="now" style="left:${(isRtl() ? 100 - x : x).toFixed(2)}%" aria-hidden="true"></span>`;
  }
  return `<div class="tl" role="img" aria-label="${esc(t('ציר התעריפים לאורך היום'))}">${segs}${mark}</div><div class="tlaxis" aria-hidden="true"><span>06:00</span><span>12:00</span><span>18:00</span><span>00:00</span><span>06:00</span></div>`;
}

// ---- "אינה אפליקציה ממשלתית" ----
export const govLineHtml = () => `<p class="govline">${t('"מונה" אינה אפליקציה ממשלתית')} · <button type="button" class="linkbtn" data-open="about">${t('מקורות רשמיים')}</button></p>`;
export const govBoxHtml = (text) => `<div class="gov">${icon('shield')}<span>${text} ${t('"מונה" אינה אפליקציה ממשלתית')} · <button type="button" class="linkbtn" data-open="about">${t('מקורות רשמיים')}</button></span></div>`;
document.addEventListener('click', (e) => { if (e.target.closest('[data-open="about"]')) { if (sheetOpen()) closeSheet(true); go('about'); } });

// כותרת מסך עם כפתור חזרה
export const backBarHtml = (id, title, extra = '', ic = 'back') => `<header class="top"><button type="button" class="ibtn ghost" id="${id}" aria-label="${ic === 'close' ? t('סגור') : t('חזרה')}">${icon(ic)}</button><h1 class="title">${title}</h1>${extra}</header>`;
