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

// הפער בין מה שהנהג ביקש למחיר המרבי
export function diffHtml(asked, total) {
  if (!(asked > 0)) return '';
  const gap = asked - total;
  if (gap > 0.5) return `<div class="diff over">${icon('alert')}<div><b>${t('הנהג ביקש {amount} מעל המחיר המרבי.', { amount: nis(gap) })}</b> ${t('אסור לגבות יותר ממה שהמונה מראה (תקנה 512). בקש קבלה מודפסת מהמונה, וצלם את מספר הרישיון על גג המונית.')} <button type="button" class="linkbtn inline" data-open="complaint">${t('להגשת תלונה ›')}</button></div></div>`;
  return `<div class="diff ok">${icon('check')}<div><b>${t('המחיר תקין')}</b> ${gap < -0.5 ? t('{amount} מתחת למחיר המרבי.', { amount: nis(-gap) }) : t('בדיוק לפי הצו.')}</div></div>`;
}

// חלוקת המחיר בין נוסעים
export function splitHtml() {
  return `<div class="split" role="group" aria-label="${t('חלוקה בין נוסעים')}"><span class="lbl">${t('חלוקה בין')}</span>
    <button type="button" class="step" data-split="-1" aria-label="${t('פחות נוסעים')}">−</button><b class="n" aria-live="polite">2</b><button type="button" class="step" data-split="1" aria-label="${t('יותר נוסעים')}">+</button>
    <span class="lbl">${t('נוסעים')}</span><b class="per"></b><button type="button" class="mini" data-split-share>${t('שתף')}</button></div>`;
}
export function wireSplit(root, total) {
  const box = root.querySelector('.split'); if (!box) return;
  let n = Math.min(8, Math.max(2, Number(prefs.passengers) || 2));
  const render = () => { box.querySelector('.n').textContent = n; box.querySelector('.per').textContent = t('{amount} לכל אחד', { amount: nis(perPassenger(total, n)) }); };
  box.querySelectorAll('[data-split]').forEach((b) => b.addEventListener('click', () => { n = Math.min(8, Math.max(2, n + Number(b.dataset.split))); setPref('passengers', n); render(); }));
  box.querySelector('[data-split-share]').addEventListener('click', async () => {
    const text = t('נסיעה במונית: סה"כ {total} — {n} נוסעים, {per} לכל אחד. (חושב ב"מונה" לפי תעריפי משרד התחבורה) {url}', { total: nis(total), n, per: nis(perPassenger(total, n)), url: 'https://' + APP_URL });
    await shareTextAny(t('חלוקת נסיעה'), text);
  });
  render();
}
export async function shareTextAny(title, text) {
  try {
    if (await shareText(title, text)) return;
    if (navigator.share) { await navigator.share({ title, text }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}
