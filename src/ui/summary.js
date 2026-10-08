// סיכום נסיעה: אותו מסך לנסיעה שהסתיימה במונה החי ולנסיעה מהספרייה.
// מחיר מרבי, מה הנהג ביקש והפער, חלוקה, פירוט, מפה, ופעולות: קבלה, תלונה, מחיקה.
import { t } from '../i18n.js';
import { updateRide, deleteRide } from '../store.js';
import { fareOf, gapOf } from '../ride.js';
import { $, esc, icon, nis, hm, relDay, arrow, defineScreen, go, back, sheetContext, tariffLabelT, dayLabelT } from './dom.js';
import { breakdownHtml, diffHtml, splitHtml, wireSplit } from './price.js';
import { miniMap } from './map.js';
import { openReceipt } from './receipt.js';
import { openComplaint, rideSource } from './more.js';

let shown = null;
export const shownRide = () => shown;

defineScreen('summary', {
  render(el, { ride, justEnded } = {}) {
    if (!ride) { go('home', {}, { replace: true }); return; }
    shown = ride; rideSource.current = () => ride;
    const fare = fareOf(ride);
    const d = new Date(ride.at);
    const where = ride.from && ride.to ? `<div class="places"><span class="dot from"></span><span class="p">${esc(ride.from)}</span><span class="arr">${arrow()}</span><span class="dot to"></span><span class="p">${esc(ride.to)}</span></div>` : '';
    const estLine = ride.estimated ? `<span class="range">${t('הערכה לפני הנסיעה: {amount}', { amount: nis(ride.estimated) })}</span>` : '';
    el.innerHTML = `
      <header class="appbar"><button type="button" class="iconbtn" id="sumBack" aria-label="${t('חזרה')}">${icon(justEnded ? 'close' : 'back')}</button><h1>${justEnded ? t('סיכום הנסיעה') : t('פרטי הנסיעה')}</h1></header>
      <div class="stack">
        <section class="hero">
          <span class="eyebrow">${ride.source === 'calc' ? t('המחיר המרבי לפי הצו') : t('מה המונה היה צריך להראות')}</span>
          <span class="amount">${nis(ride.total)}</span>
          <span class="meta">${esc(tariffLabelT(ride.tariffLabel))} · ${esc(dayLabelT(ride.dayLabel))}</span>
          ${estLine}
        </section>
        <div class="facts-row">
          <span><b>${hm(d)}</b>${esc(relDay(d))}</span>
          <span><b>${ride.km.toFixed(1)}</b>${t('ק"מ')}</span>
          <span><b>${Math.round(ride.minutes)}</b>${t('דקות')}</span>
        </div>
        ${where}
        <section class="card asked-card">
          <label class="field asked"><span>${t('הנהג ביקש')}</span><input id="rideAsked" type="number" inputmode="decimal" min="0" step="1" placeholder="₪" value="${ride.asked || ''}"></label>
          <div id="rideDiff">${diffHtml(ride.asked, ride.total)}</div>
        </section>
        ${splitHtml()}
        ${ride.track && ride.track.length > 1 ? '<div class="mini-map" id="miniMap"></div>' : ''}
        <details class="card details"><summary>${t('פירוט המחיר')}${icon('chev', 'chev')}</summary>${breakdownHtml(fare)}</details>
        <div class="actions"><button class="btn primary" id="rideReceipt" type="button">${icon('receipt')}${t('קבלה לשיתוף')}</button><button class="btn ghost" id="rideComplain" type="button">${icon('phone')}${t('הגש תלונה')}</button></div>
        <div class="actions">${justEnded ? `<button class="btn ghost" id="rideNew" type="button">${t('נסיעה חדשה')}</button>` : ''}${ride.source !== 'calc' ? `<button class="btn ghost danger-text" id="rideDel" type="button">${icon('trash')}${t('מחק')}</button>` : ''}</div>
      </div>`;
    const mm = $('miniMap'); if (mm) miniMap(mm, ride.track);
    wireSplit(el, ride.total);
    $('sumBack').addEventListener('click', () => { if (justEnded) go('home', {}, { root: true }); else if (!back()) go('home', {}, { root: true }); });
    $('rideAsked').addEventListener('input', (e) => {
      ride.asked = Number(e.target.value) || null; updateRide(ride);
      $('rideDiff').innerHTML = diffHtml(ride.asked, ride.total);
    });
    $('rideReceipt').addEventListener('click', () => openReceipt(ride));
    $('rideComplain').addEventListener('click', () => openComplaint(ride));
    $('rideNew')?.addEventListener('click', () => go('live', {}, { replace: true }));
    $('rideDel')?.addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.lastChild.textContent = t('לחץ שוב למחיקה'); return; }
      deleteRide(ride.id);
      if (!back()) go('home', {}, { root: true });
    });
  },
});
export const gapKind = (ride) => gapOf(ride)?.kind || null;
export const contextRide = () => sheetContext() || shown;
