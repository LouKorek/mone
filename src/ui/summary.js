// סיכום נסיעה: אותו מסך לנסיעה שהסתיימה במונה החי ולנסיעה מהספרייה.
// צג המונה עם המחיר המרבי, מה הנהג ביקש והפער, מפה, פירוט, חלוקה, ופעולות: קבלה, נסיעה חדשה, תלונה, מחיקה.
import { t } from '../i18n.js';
import { updateRide, deleteRide } from '../store.js';
import { fareOf, gapOf } from '../ride.js';
import { $, esc, icon, nis, nis0, hm, relDay, defineScreen, go, back, sheetContext, tariffLabelT, fmtDuration } from './dom.js';
import { breakdownHtml, diffHtml, splitHtml, wireSplit, surchargeTotal } from './price.js';
import { digitsHtml, govBoxHtml, backBarHtml } from './kit.js';
import { miniMap } from './map.js';
import { openReceipt } from './receipt.js';
import { openComplaint, rideSource } from './more.js';

let shown = null;
export const shownRide = () => shown;

function gapTag(ride) {
  const g = gapOf(ride); if (!g) return '';
  return g.kind === 'over' ? `<span class="tag warn">${t('+{amount} מעל המחיר המרבי', { amount: nis(g.gap) })}</span>` : `<span class="tag good">${icon('check', 's')}${t('בטווח')}</span>`;
}
function askedExtra(ride) {
  const g = gapOf(ride);
  return g && g.kind === 'over' ? diffHtml(ride.asked, ride.total) : '';
}

defineScreen('summary', {
  render(el, { ride, justEnded } = {}) {
    if (!ride) { go('home', {}, { replace: true }); return; }
    shown = ride; rideSource.current = () => ride;
    const fare = fareOf(ride);
    const d = new Date(ride.at), end = ride.end ? new Date(ride.end) : null;
    const when = `${esc(relDay(d))} · <span class="bidi">${hm(d)}${end ? '–' + hm(end) : ''}</span> · ${esc(tariffLabelT(ride.tariffLabel))}`;
    const estLine = ride.estimated ? `<span class="lcd-note">${t('הערכה מראש:')} <b class="num">${nis0(ride.estimated)}</b></span>` : '';
    const canDelete = ride.source !== 'calc';
    const del = canDelete ? `<button type="button" class="ibtn ghost" id="rideDel" aria-label="${t('מחק נסיעה')}">${icon('trash')}</button>` : '';
    const hasMap = ride.track && ride.track.length > 1;
    const tags = (ride.from || ride.to) ? `<div class="map-tags">${ride.from ? `<span class="tag mute"><span class="dot from"></span><span class="ell">${esc(ride.from)}</span></span>` : ''}${ride.to ? `<span class="tag mute"><span class="dot to"></span><span class="ell">${esc(ride.to)}</span></span>` : ''}</div>` : '';
    el.innerHTML = `
      ${backBarHtml('sumBack', justEnded ? t('סיכום הנסיעה') : t('פרטי הנסיעה'), del, justEnded ? 'close' : 'back')}
      <div class="stack sum-stack">
        <section class="meter" aria-label="${t('המחיר המרבי')}">
          <div class="lcd" style="padding:16px">
            <span class="lbl">${ride.source === 'calc' ? t('המחיר המרבי לפי הצו') : t('מה המונה היה צריך להראות')}</span>
            <div style="margin-top:8px">${digitsHtml(ride.total, { size: 60, label: nis(ride.total) })}</div>
            <div class="between lcd-meta"><span class="lcd-note">${when}</span>${estLine}</div>
          </div>
          <div class="meter-stats">
            <div><b>${ride.km.toFixed(1)}</b><span>${t('ק"מ')}</span></div>
            <div><b>${fmtDuration(Math.round(ride.minutes * 60))}</b><span>${t('זמן')}</span></div>
            <div><b>${nis(surchargeTotal(fare))}</b><span>${t('תוספות')}</span></div>
          </div>
        </section>
        <section class="card col asked-card">
          <div class="between"><label class="eyebrow" for="rideAsked">${t('הנהג ביקש')}</label><span id="rideGap">${gapTag(ride)}</span></div>
          <div class="between asked-row">
            <span class="asked-input"><span class="num">₪</span><input id="rideAsked" class="num" type="number" inputmode="decimal" min="0" step="1" placeholder="0" value="${ride.asked || ''}"></span>
            <button type="button" class="btn sm ${gapOf(ride)?.kind === 'over' ? 'stop' : 'ghost'}" id="rideComplain">${icon('shield', 's')}<span>${t('הגש תלונה')}</span></button>
          </div>
          <div id="rideDiff">${askedExtra(ride)}</div>
        </section>
        ${hasMap ? `<div class="mini-map" id="miniMap">${tags}</div>` : ''}
        <section class="card col"><h2 class="h3">${t('פירוט המחיר')}</h2>${breakdownHtml(fare)}</section>
        ${splitHtml()}
        <button type="button" class="btn taxi xl" id="rideReceipt">${icon('receipt')}<span>${t('קבלה לשיתוף')}</span></button>
        <button type="button" class="btn ghost" id="rideNew">${t('נסיעה חדשה')}</button>
        ${govBoxHtml(ride.source === 'calc' ? t('החישוב הוא הערכה לפי צו המחירים. המונה המכויל במונית הוא הקובע.') : t('מדידת GPS עשויה לסטות בכמה אחוזים מהמונה במונית. המונה המכויל במונית הוא הקובע.'))}
      </div>`;
    const mm = $('miniMap'); if (mm) miniMap(mm, ride.track);
    wireSplit(el, ride.total);
    $('sumBack').addEventListener('click', () => { if (justEnded) go('home', {}, { root: true }); else if (!back()) go('home', {}, { root: true }); });
    $('rideAsked').addEventListener('input', (e) => {
      ride.asked = Number(e.target.value) || null; updateRide(ride);
      $('rideGap').innerHTML = gapTag(ride);
      $('rideDiff').innerHTML = askedExtra(ride);
      const over = gapOf(ride)?.kind === 'over';
      $('rideComplain').classList.toggle('stop', over); $('rideComplain').classList.toggle('ghost', !over);
    });
    $('rideReceipt').addEventListener('click', () => openReceipt(ride));
    $('rideComplain').addEventListener('click', () => openComplaint(ride));
    $('rideNew').addEventListener('click', () => go('home', {}, { root: true }));
    $('rideDel')?.addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.classList.add('confirm'); b.setAttribute('aria-label', t('לחץ שוב למחיקה')); b.insertAdjacentHTML('beforeend', `<span class="confirm-tx">${t('לחץ שוב למחיקה')}</span>`); return; }
      deleteRide(ride.id);
      if (!back()) go('home', {}, { root: true });
    });
  },
});
export const gapKind = (ride) => gapOf(ride)?.kind || null;
export const contextRide = () => sheetContext() || shown;
