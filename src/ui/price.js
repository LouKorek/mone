// רכיבי מחיר משותפים: פירוט שורות, הפער מול מה שהנהג ביקש, חלוקה בין נוסעים, ושיתוף טקסט.
import { t } from '../i18n.js';
import { getTariffs } from '../engine.js';
import { shareText } from '../native.js';
import { prefs, setPref } from '../store.js';
import { perPassenger } from '../ride.js';
import { esc, nis, icon, lineLabel, tariffLabelT, dayLabelT, periodT } from './dom.js';

export const APP_URL = 'mone-taxi.netlify.app';

export function breakdownHtml(fare, opts = {}) {
  const rows = fare.lines.map((l) => `<div class="${l.key === 'vat' ? 'vat' : ''}"><span>${esc(lineLabel(l))}</span><span class="n">${l.amount.toFixed(2)}</span></div>`).join('');
  const total = opts.noTotal ? '' : `<div class="total"><span>${t('סה"כ')} · ${esc(tariffLabelT(fare.tariffLabel))}</span><span class="n">${nis(fare.total)}</span></div>`;
  return `<div class="breakdown">${rows}${total}</div>
    <p class="note">${esc(dayLabelT(fare.dayLabel))} · ${t('במזומן מעגלים ל-{amount}', { amount: nis(fare.cashTotal) })} · ${periodT(fare.period)} · ${t('כולל מע"מ {p}%', { p: Math.round(getTariffs().vat * 100) })}</p>`;
}

// סך התוספות (כולל מע"מ) מתוך שורות המחיר
const SUR_KEYS = new Set(['order', 'airport', 'road6', 'seg18', 'carmel']);
export function surchargeTotal(f) {
  const vat = f.lines.find((l) => l.key === 'vat');
  const base = f.lines.filter((l) => SUR_KEYS.has(l.key)).reduce((a, l) => a + l.amount, 0) * (vat ? 1 + vat.rate : 1);
  return base + f.lines.filter((l) => l.key === 'fastlane').reduce((a, l) => a + l.amount, 0);
}
// הפער בין מה שהנהג ביקש למחיר המרבי
export function diffHtml(asked, total) {
  if (!(asked > 0)) return '';
  const gap = asked - total;
  if (gap > 0.5) return `<div class="diff over">${icon('alert')}<div><b>${t('הנהג ביקש {amount} מעל המחיר המרבי.', { amount: nis(gap) })}</b> ${t('אסור לגבות יותר ממה שהמונה מראה (תקנה 512). בקש קבלה מודפסת מהמונה, וצלם את מספר הרישיון על גג המונית.')} <button type="button" class="linkbtn inline" data-open="complaint">${t('להגשת תלונה ›')}</button></div></div>`;
  return `<div class="diff ok">${icon('check')}<div><b>${t('המחיר תקין')}</b> ${gap < -0.5 ? t('{amount} מתחת למחיר המרבי.', { amount: nis(-gap) }) : t('בדיוק לפי הצו.')}</div></div>`;
}

// חלוקת המחיר בין נוסעים: בורר 1–4 והסכום לכל אחד
export function splitHtml({ card = true } = {}) {
  return `<section class="${card ? 'card ' : ''}split-card" role="group" aria-label="${t('חלוקה בין נוסעים')}">
    <div class="between"><h2 class="h3">${t('חלוקה בין נוסעים')}</h2><button type="button" class="linkbtn sm" data-split-share>${icon('share', 's')}<span>${t('שתף')}</span></button></div>
    <div class="row split"><div class="seg grow" role="radiogroup">${[1, 2, 3, 4].map((n) => `<button type="button" role="radio" data-split="${n}">${n}</button>`).join('')}</div><b class="per num" aria-live="polite"></b></div>
  </section>`;
}
export function wireSplit(root, total) {
  const box = root.querySelector('.split-card'); if (!box) return;
  box._total = total;
  const render = () => {
    const n = box._n;
    box.querySelectorAll('[data-split]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.split) === n)));
    box.querySelector('.per').textContent = nis(perPassenger(box._total, n));
  };
  if (!box._wired) {
    box._wired = true;
    box._n = Math.min(4, Math.max(1, Number(prefs.passengers) || 2));
    box.querySelectorAll('[data-split]').forEach((b) => b.addEventListener('click', () => { box._n = Number(b.dataset.split); setPref('passengers', box._n); render(); }));
    box.querySelector('[data-split-share]').addEventListener('click', async () => {
      const n = box._n, total = box._total;
      const text = t('נסיעה במונית: סה"כ {total} — {n} נוסעים, {per} לכל אחד. (חושב ב"מונה" לפי תעריפי משרד התחבורה) {url}', { total: nis(total), n, per: nis(perPassenger(total, n)), url: 'https://' + APP_URL });
      await shareTextAny(t('חלוקת נסיעה'), text);
    });
  }
  render();
}
export async function shareTextAny(title, text) {
  try {
    if (await shareText(title, text)) return;
    if (navigator.share) { await navigator.share({ title, text }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}
