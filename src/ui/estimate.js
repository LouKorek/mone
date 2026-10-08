// מסך ההערכה: המסלול (או ק"מ ודקות ידניים), מתי, תוספות, והמחיר המרבי עם טווח, טיפ שעת יציאה ופער מול מה שהנהג ביקש.
import { t } from '../i18n.js';
import { activePeriod } from '../engine.js';
import { draft } from '../store.js';
import { estimate, priceRange, departureTip, routeEdited, rideFromEstimate } from '../ride.js';
import { $, esc, icon, nis, nis0, hm, arrow, toLocalInputValue, defineScreen, go, back, tariffShort, tariffName, dayLabelT, tariffLabelT } from './dom.js';
import { renderTiles } from './tiles.js';
import { breakdownHtml, diffHtml, splitHtml, wireSplit } from './price.js';
import { computeRoute, clearPlaces, onRoute } from './route.js';
import { openReceipt } from './receipt.js';
import { openComplaint, rideSource } from './more.js';

let est = null;
export const currentEstimate = () => est;
export const currentRide = () => (est ? rideFromEstimate(draft, est) : null);

function routeCard() {
  if (!draft.from && !draft.to) return `<button type="button" class="card route-card empty" id="pickRoute">${icon('pin')}<span>${t('בחר מוצא ויעד למילוי אוטומטי של המרחק והזמן')}</span>${icon('chev', 'chev')}</button>`;
  const r = draft.route;
  const edited = routeEdited(draft);
  const traffic = r && r.staticMinutes && r.staticMinutes !== r.minutes ? ` ${t("({n} דק' ללא עומסים)", { n: r.staticMinutes })}` : '';
  const line = r ? `${t('לפי Google Maps:')} <b>${t('{n} ק"מ', { n: r.km.toFixed(1) })}</b> · <b>${t("{n} דק'", { n: r.minutes })}</b>${traffic}${r.via ? ` · ${t('דרך {via}', { via: esc(r.via) })}` : ''}${edited ? ' · ' + t('שונה ידנית') : ''}` : `<span id="rtStatus">${t('מחשב מסלול ב-Google Maps…')}</span>`;
  const found = draft.found.length ? `<div class="found">${icon('check')} ${t('זוהו תוספות: {list}', { list: draft.found.map(esc).join(', ') })}</div>` : '';
  return `<div class="card route-card">
    <div class="places"><span class="dot from"></span><span class="p">${esc(draft.from?.label || '—')}</span><span class="arr">${arrow()}</span><span class="dot to"></span><span class="p">${esc(draft.to?.label || '—')}</span></div>
    <div class="route-info ${edited ? 'edited' : ''}" id="rtInfo">${line}</div>${found}
    <div class="route-actions"><button type="button" class="linkbtn" id="rtChange">${t('שנה מסלול')}</button>${edited ? `<button type="button" class="linkbtn" id="rtReset">${t('חזור למסלול')}</button>` : ''}<button type="button" class="linkbtn" id="rtClear">${t('נקה')}</button></div>
  </div>`;
}

function recalc(el) {
  est = estimate(draft);
  const f = est.fare;
  $('estTariff').textContent = tariffShort(est.info.tariff);
  $('estTariff').title = `${tariffName(est.info.tariff)} · ${dayLabelT(est.info.label)}`;
  $('calcTotal').textContent = nis(f.total);
  $('estSub').textContent = est.hasInput ? `${tariffLabelT(f.tariffLabel)} · ${dayLabelT(f.dayLabel)}` : `${tariffName(est.info.tariff)} · ${dayLabelT(est.info.label)} · ${t('הזן מרחק ודקות')}`;
  const range = priceRange(draft, est);
  $('estRange').hidden = !range;
  if (range) $('estRange').textContent = t('טווח צפוי {low}–{high}', { low: '\u2066' + nis0(range[0]), high: Math.round(range[1]) + '\u2069' });
  const tip = departureTip(draft, est);
  const tipEl = $('estTip'); tipEl.hidden = !tip;
  if (tip) {
    tipEl.className = 'tip ' + (tip.kind === 'save' ? 'good' : 'warn');
    const text = tip.kind === 'save' ? t('אם תצא ב-{time} ({tariff}) הנסיעה תעלה כ-{amount} פחות', { time: hm(tip.at), tariff: tariffName(tip.tariff), amount: nis0(tip.amount) })
      : t('מ-{time} מתחיל {tariff} — אותה נסיעה תעלה כ-{amount} יותר', { time: hm(tip.at), tariff: tariffName(tip.tariff), amount: nis0(tip.amount) });
    tipEl.innerHTML = `${icon('clock')}<span>${esc(text)}</span>${tip.kind === 'save' ? `<button type="button" class="mini" id="tipSet">${t('קבע שעה')}</button>` : ''}`;
    if (tip.kind === 'save') $('tipSet').onclick = () => { draft.when = tip.at; $('when').value = toLocalInputValue(tip.at); recalc(el); if (draft.from && draft.to) computeRoute(); };
  }
  $('estBreak').innerHTML = est.hasInput ? breakdownHtml(f, { noTotal: true }) : `<p class="note">${t('הפירוט יופיע אחרי הזנת מרחק או דקות')}</p>`;
  const d = $('estDiff'); const html = est.hasInput ? diffHtml(draft.asked, f.total) : '';
  d.hidden = !html; d.innerHTML = html;
  el.querySelectorAll('[data-needs-input]').forEach((b) => { b.disabled = !est.hasInput; });
  wireSplit(el, f.total);
}

defineScreen('estimate', {
  render(el, params = {}) {
    const period = activePeriod(draft.when || new Date());
    el.innerHTML = `
      <header class="appbar"><button type="button" class="iconbtn" id="estBack" aria-label="${t('חזרה')}">${icon('back')}</button><h1>${t('כמה זה יעלה?')}</h1></header>
      <div class="stack">
        <div id="routeCard">${routeCard()}</div>
        <div class="row2">
          <label class="field num"><span>${t('ק"מ')}</span><input id="km" type="number" inputmode="decimal" min="0" step="0.1" placeholder="0.0" value="${draft.km || ''}"></label>
          <label class="field num"><span>${t('דקות')}</span><input id="minutes" type="number" inputmode="numeric" min="0" step="1" placeholder="0" value="${draft.minutes || ''}"></label>
        </div>
        <div class="field when"><span>${t('מתי')}</span><input id="when" type="datetime-local" aria-label="${t('תאריך ושעת הנסיעה')}" value="${toLocalInputValue(draft.when || new Date())}"><button class="mini" id="nowBtn" type="button">${t('עכשיו')}</button><b class="badge" id="estTariff">א'</b></div>
        <section class="hero" aria-live="polite">
          <span class="eyebrow">${t('המחיר המרבי לפי הצו')}</span>
          <span class="amount" id="calcTotal">₪0.00</span>
          <span class="meta" id="estSub"></span>
          <span class="range" id="estRange" hidden></span>
        </section>
        <div class="tip" id="estTip" role="status" hidden></div>
        <section class="card tiles-card"><h2 class="card-title">${t('תוספות')}</h2><div class="tiles" id="calcTiles" role="group" aria-label="${t('תוספות')}"></div></section>
        <details class="card details" id="estDetails"><summary>${t('פירוט המחיר')}${icon('chev', 'chev')}</summary><div id="estBreak"></div>${splitHtml()}</details>
        <label class="field asked"><span>${t('הנהג ביקש')}</span><input id="asked" type="number" inputmode="decimal" min="0" step="1" placeholder="₪" value="${draft.asked || ''}"></label>
        <div id="estDiff" hidden></div>
        <div class="actions col">
          <button type="button" class="btn meter" id="estStart" data-needs-input>${icon('play')}<span>${t('התחל מונה לנסיעה הזו')}<small>${t('התוספות שבחרת יעברו למונה החי')}</small></span></button>
          <div class="actions"><button type="button" class="btn ghost" id="estReceipt" data-needs-input>${icon('receipt')}${t('קבלה')}</button><button type="button" class="btn ghost" id="estComplain" data-needs-input>${icon('phone')}${t('תלונה')}</button></div>
        </div>
      </div>`;
    rideSource.current = currentRide;
    const tiles = () => renderTiles($('calcTiles'), draft.opts, period, { onChange: () => recalc(el), onManual: (k) => { delete draft.auto[k]; }, auto: draft.auto });
    tiles();
    $('estBack').addEventListener('click', () => { if (!back()) go('home'); });
    $('km').addEventListener('input', () => { draft.km = Number($('km').value) || 0; recalc(el); refreshRoute(); });
    $('minutes').addEventListener('input', () => { draft.minutes = Number($('minutes').value) || 0; recalc(el); refreshRoute(); });
    $('asked').addEventListener('input', () => { draft.asked = Number($('asked').value) || null; recalc(el); });
    $('when').addEventListener('input', () => { const v = $('when').value ? new Date($('when').value) : null; draft.when = v && !isNaN(v) ? v : null; recalc(el); tiles(); });
    $('when').addEventListener('change', () => { if (draft.from && draft.to) computeRoute(); });
    $('nowBtn').addEventListener('click', () => { draft.when = null; $('when').value = toLocalInputValue(new Date()); recalc(el); tiles(); if (draft.from && draft.to) computeRoute(); });
    $('estStart').addEventListener('click', () => go('live', { start: true, fromEstimate: true }));
    $('estReceipt').addEventListener('click', () => { const r = currentRide(); if (r) openReceipt(r); });
    $('estComplain').addEventListener('click', () => { const r = currentRide(); if (r) openComplaint(r); });
    $('estDetails').open = !!params.openDetails;
    function refreshRoute() { $('routeCard').innerHTML = routeCard(); wireRouteCard(); }
    function wireRouteCard() {
      $('pickRoute')?.addEventListener('click', () => { go('home'); setTimeout(() => $('rtTo')?.focus(), 50); });
      $('rtChange')?.addEventListener('click', () => go('home'));
      $('rtClear')?.addEventListener('click', () => { clearPlaces(); draft.km = 0; draft.minutes = 0; $('km').value = ''; $('minutes').value = ''; refreshRoute(); recalc(el); });
      $('rtReset')?.addEventListener('click', () => { const r = draft.route; draft.km = Number(r.km.toFixed(1)); draft.minutes = r.minutes; $('km').value = draft.km; $('minutes').value = draft.minutes; refreshRoute(); recalc(el); });
    }
    wireRouteCard();
    // תוצאת מסלול שמגיעה בזמן שהמסך פתוח (למשל אחרי "קבע שעה")
    onRoute('estimate', (ev, msg) => {
      if (document.documentElement.dataset.screen !== 'estimate') return;
      if (ev === 'route') { $('km').value = draft.km; $('minutes').value = draft.minutes; refreshRoute(); tiles(); recalc(el); }
      else if (ev === 'error') { const s = $('rtStatus'); if (s) s.textContent = msg; else refreshRoute(); }
    });
    recalc(el);
    if (params.focus === 'km') setTimeout(() => $('km').focus(), 80);
  },
});
