// מסך ההערכה: המסלול (או ק"מ ודקות ידניים), מתי, תוספות, והמחיר המרבי עם טווח, טיפ שעת יציאה ופער מול מה שהנהג ביקש.
import { t } from '../i18n.js';
import { activePeriod } from '../engine.js';
import { draft } from '../store.js';
import { estimate, priceRange, departureTip, routeEdited, rideFromEstimate } from '../ride.js';
import { $, esc, icon, nis, nis0, hm, arrow, toLocalInputValue, defineScreen, go, back, tariffName, dayLabelT, tariffLabelT } from './dom.js';
import { digitsHtml, setDigits, timelineHtml, govBoxHtml } from './kit.js';
import { profileBtnHtml } from './account.js';
import { renderTiles, activeCount } from './tiles.js';
import { breakdownHtml, diffHtml, splitHtml, wireSplit, surchargeTotal } from './price.js';
import { computeRoute, clearPlaces, onRoute } from './route.js';
import { openReceipt } from './receipt.js';
import { openComplaint, rideSource } from './more.js';

let est = null;
export const currentEstimate = () => est;
export const currentRide = () => (est ? rideFromEstimate(draft, est) : null);

function routeCard() {
  if (!draft.from && !draft.to) return `<button type="button" class="card route-card empty" id="pickRoute"><span class="li-lead taxi">${icon('pin')}</span><span class="small" style="flex:1">${t('בחר מוצא ויעד למילוי אוטומטי של המרחק והזמן')}</span>${icon('chev', 's')}</button>`;
  const r = draft.route;
  const edited = routeEdited(draft);
  const traffic = r && r.staticMinutes && r.staticMinutes !== r.minutes ? ` ${t("({n} דק' ללא עומסים)", { n: r.staticMinutes })}` : '';
  const line = r ? `${t('לפי Google Maps:')} <b class="num">${r.km.toFixed(1)}</b> ${t('ק"מ')} · <b class="num">${r.minutes}</b> ${t("דק'")}${traffic}${r.via ? ` · ${t('דרך {via}', { via: esc(r.via) })}` : ''}${edited ? ' · ' + t('שונה ידנית') : ''}` : `<span id="rtStatus">${t('מחשב מסלול ב-Google Maps…')}</span>`;
  const found = draft.found.length ? `<div class="banner good sm">${icon('check', 's')}<span>${t('זוהו תוספות: {list}', { list: draft.found.map(esc).join(', ') })}</span></div>` : '';
  return `<section class="card col route-card">
    <div class="row" style="gap:10px"><span class="li-lead taxi">${icon('pin')}</span>
      <span class="rc-main"><b>${esc(draft.from?.label || '—')} ${arrow()} ${esc(draft.to?.label || '—')}</b><span class="small route-info ${edited ? 'edited' : ''}" id="rtInfo">${line}</span></span>
      <button type="button" class="linkbtn sm" id="rtChange">${t('שנה')}</button></div>
    ${found}
    <div class="route-actions">${edited ? `<button type="button" class="linkbtn sm" id="rtReset">${t('חזור למסלול')}</button>` : ''}<button type="button" class="linkbtn sm" id="rtClear">${t('נקה')}</button></div>
  </section>`;
}
function rangeHtml(range, total) {
  if (!range) return '';
  const [lo, hi] = range, pad = Math.max(1, (hi - lo) * 0.6), min = lo - pad, max = hi + pad * 0.8, pct = (v) => ((v - min) / (max - min) * 100).toFixed(1);
  return `<div class="range" aria-hidden="true"><span class="fill" style="left:${pct(lo)}%;right:${(100 - pct(hi)).toFixed(1)}%"></span><span class="pin" style="left:${pct(total)}%"></span></div>
    <div class="range-lbl"><span>${nis0(lo)}</span><span>${t('טווח צפוי לפי פקקים')}</span><span>${nis0(hi)}</span></div>`;
}

function recalc(el) {
  est = estimate(draft);
  const f = est.fare;
  setDigits($('calcTotal'), f.total);
  $('estSub').textContent = `${t('המחיר המרבי לפי הצו')} · ${est.hasInput ? `${tariffLabelT(f.tariffLabel)} · ${dayLabelT(f.dayLabel)}` : `${tariffName(est.info.tariff)} · ${dayLabelT(est.info.label)}`}`;
  $('calcTotal').classList.toggle('off', !est.hasInput);
  const range = priceRange(draft, est);
  $('estRange').innerHTML = rangeHtml(range, f.total);
  $('estRange').hidden = !range;
  $('estHint').hidden = est.hasInput;
  $('estKm').textContent = est.km ? est.km.toFixed(1) : '0';
  $('estMin').textContent = String(Math.round(est.minutes || 0));
  $('estSur').textContent = nis(surchargeTotal(f));
  $('estWhenTl').innerHTML = timelineHtml(est.info.kind, est.start);
  $('tileCount').textContent = activeCount(draft.opts) ? t('{n} נבחרו', { n: activeCount(draft.opts) }) : '';
  const tip = departureTip(draft, est);
  const tipEl = $('estTip'); tipEl.hidden = !tip;
  if (tip) {
    const text = tip.kind === 'save' ? t('אם תצא ב-{time} ({tariff}) הנסיעה תעלה כ-{amount} פחות', { time: hm(tip.at), tariff: tariffName(tip.tariff), amount: nis0(tip.amount) })
      : t('מ-{time} מתחיל {tariff} — אותה נסיעה תעלה כ-{amount} יותר', { time: hm(tip.at), tariff: tariffName(tip.tariff), amount: nis0(tip.amount) });
    tipEl.className = 'banner sm ' + (tip.kind === 'save' ? 'good' : 'taxi');
    tipEl.innerHTML = `${icon('clock', 's')}<span>${esc(text)}</span>${tip.kind === 'save' ? `<button type="button" class="mini" id="tipSet">${t('קבע שעה')}</button>` : ''}`;
    if (tip.kind === 'save') $('tipSet').onclick = () => { draft.when = tip.at; $('when').value = toLocalInputValue(tip.at); paintWhen(); recalc(el); if (draft.from && draft.to) computeRoute(); };
  }
  $('estBreak').innerHTML = est.hasInput ? breakdownHtml(f) : `<p class="note">${t('הפירוט יופיע אחרי הזנת מרחק או דקות')}</p>`;
  const d = $('estDiff'); const html = est.hasInput ? diffHtml(draft.asked, f.total) : '';
  d.hidden = !html; d.innerHTML = html;
  el.querySelectorAll('[data-needs-input]').forEach((b) => { b.disabled = !est.hasInput; });
  wireSplit(el, f.total);
}
function paintWhen() {
  const other = !!draft.when;
  $('nowBtn').setAttribute('aria-checked', String(!other)); $('otherBtn').setAttribute('aria-checked', String(other));
  $('whenBox').hidden = !other;
}

defineScreen('estimate', {
  render(el, params = {}) {
    const period = activePeriod(draft.when || new Date());
    const stepper = (id, label, val, step, mode, ph) => `<div class="stepper"><label class="eyebrow" for="${id}">${label}</label><div class="ctl"><button type="button" data-step="${id}" data-d="-${step}" aria-label="${t('פחות')}">${icon('minus', 's')}</button><input id="${id}" type="number" inputmode="${mode}" min="0" step="${step}" placeholder="${ph}" value="${val || ''}"><button type="button" data-step="${id}" data-d="${step}" aria-label="${t('יותר')}">${icon('plus', 's')}</button></div></div>`;
    el.innerHTML = `
      <header class="top"><button type="button" class="ibtn ghost" id="estBack" aria-label="${t('חזרה')}">${icon('back')}</button><h1 class="title">${t('כמה זה יעלה?')}</h1>${profileBtnHtml()}</header>
      <div class="stack">
        <div id="routeCard">${routeCard()}</div>
        <div class="grid2">${stepper('km', t('ק"מ'), draft.km, 0.5, 'decimal', '0.0')}${stepper('minutes', t('דקות'), draft.minutes, 1, 'numeric', '0')}</div>
        <section class="card col when-card">
          <div class="between"><span class="eyebrow">${t('מתי יוצאים')}</span><div class="seg" role="radiogroup" style="width:200px"><button type="button" role="radio" id="nowBtn">${t('עכשיו')}</button><button type="button" role="radio" id="otherBtn">${t('שעה אחרת')}</button></div></div>
          <label class="field" id="whenBox" hidden><span>${t('תאריך ושעת הנסיעה')}</span><input id="when" type="datetime-local" value="${toLocalInputValue(draft.when || new Date())}"></label>
          <div id="estWhenTl"></div>
          <div class="banner sm taxi" id="estTip" role="status" hidden></div>
        </section>
        <section class="meter" aria-live="polite">
          <div class="lcd" style="padding:16px">
            <span class="lbl" id="estSub"></span>
            <div style="margin-top:10px">${digitsHtml(0, { id: 'calcTotal', size: 62 })}</div>
            <div id="estRange" hidden></div>
            <p class="sub" id="estHint">${t('הזן מרחק ודקות')}</p>
          </div>
          <div class="meter-stats"><div><b id="estKm">0</b><span>${t('ק"מ')}</span></div><div><b id="estMin">0</b><span>${t('דקות')}</span></div><div><b id="estSur">₪0.00</b><span>${t('תוספות')}</span></div></div>
        </section>
        <section class="card col"><div class="between"><h2 class="h3">${t('תוספות')}</h2><span class="small" id="tileCount"></span></div><div class="tiles" id="calcTiles" role="group" aria-label="${t('תוספות')}"></div></section>
        <details class="card" id="estDetails"><summary>${t('פירוט המחיר')}${icon('down', 's down')}</summary><div id="estBreak"></div><hr class="dash">${splitHtml({ card: false })}</details>
        <div class="field asked"><label for="asked">${t('הנהג ביקש')}</label><div class="row"><input id="asked" type="number" inputmode="decimal" min="0" step="1" placeholder="₪ 0" value="${draft.asked || ''}"><span class="small">${t('נבדוק מול המחיר המרבי')}</span></div></div>
        <div id="estDiff" hidden></div>
        <button type="button" class="btn go start xl" id="estStart" data-needs-input>${icon('play')}<span>${t('התחל מונה לנסיעה הזו')}<small>${t('התוספות שבחרת יעברו למונה החי')}</small></span></button>
        <div class="grid2"><button type="button" class="btn ghost" id="estReceipt" data-needs-input>${icon('receipt')}${t('קבלה')}</button><button type="button" class="btn ghost" id="estComplain" data-needs-input>${icon('shield')}${t('תלונה')}</button></div>
        ${govBoxHtml(t('החישוב הוא הערכה לפי צו המחירים. המונה המכויל במונית הוא הקובע.'))}
      </div>`;
    rideSource.current = currentRide;
    const tiles = () => renderTiles($('calcTiles'), draft.opts, period, { onChange: () => recalc(el), onManual: (k) => { delete draft.auto[k]; }, auto: draft.auto });
    tiles();
    $('estBack').addEventListener('click', () => { if (!back()) go('home'); });
    $('km').addEventListener('input', () => { draft.km = Number($('km').value) || 0; recalc(el); refreshRoute(); });
    $('minutes').addEventListener('input', () => { draft.minutes = Number($('minutes').value) || 0; recalc(el); refreshRoute(); });
    $('asked').addEventListener('input', () => { draft.asked = Number($('asked').value) || null; recalc(el); });
    $('when').addEventListener('input', () => { const v = $('when').value ? new Date($('when').value) : null; draft.when = v && !isNaN(v) ? v : null; paintWhen(); recalc(el); tiles(); });
    $('otherBtn').addEventListener('click', () => { $('whenBox').hidden = false; $('otherBtn').setAttribute('aria-checked', 'true'); $('nowBtn').setAttribute('aria-checked', 'false'); $('when').focus(); try { $('when').showPicker?.(); } catch (e) { /* */ } });
    el.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
      const inp = $(b.dataset.step), d = Number(b.dataset.d);
      const v = Math.max(0, Math.round(((Number(inp.value) || 0) + d) * 10) / 10);
      inp.value = v || ''; inp.dispatchEvent(new Event('input', { bubbles: true }));
    }));
    $('when').addEventListener('change', () => { if (draft.from && draft.to) computeRoute(); });
    $('nowBtn').addEventListener('click', () => { draft.when = null; $('when').value = toLocalInputValue(new Date()); paintWhen(); recalc(el); tiles(); if (draft.from && draft.to) computeRoute(); });
    $('estStart').addEventListener('click', () => go('live', { start: true, fromEstimate: true }));
    $('estReceipt').addEventListener('click', () => { const r = currentRide(); if (r) openReceipt(r); });
    $('estComplain').addEventListener('click', () => { const r = currentRide(); if (r) openComplaint(r); });
    $('estDetails').open = !!params.openDetails;
    function refreshRoute() { $('routeCard').innerHTML = routeCard(); wireRouteCard(); }
    function wireRouteCard() {
      $('pickRoute')?.addEventListener('click', () => { go('home', {}, { root: true }); setTimeout(() => $('rtTo')?.focus(), 50); });
      $('rtChange')?.addEventListener('click', () => { go('home', {}, { root: true }); setTimeout(() => $('rtTo')?.focus(), 50); });
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
    paintWhen();
    recalc(el);
    if (params.focus === 'km') setTimeout(() => $('km').focus(), 80);
  },
});
