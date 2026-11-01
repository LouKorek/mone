// מסך הבית: צג המונה "פנוי" עם התעריף עכשיו והכפתור "התחל מונה", "כמה זה יעלה?" עם מוצא ← יעד,
// הנסיעה האחרונה, והסרגל התחתון. כשיש מסלול: מפה קטנה, תוספות שזוהו והטווח הצפוי על הכפתור.
import { t } from '../i18n.js';
import { tariffAt, activePeriod, getTariffs } from '../engine.js';
import { draft, quickPlaces, lastRide, subscribe } from '../store.js';
import { estimate, priceRange, gapOf } from '../ride.js';
import { $, esc, icon, nis, nis0, hm, relDay, arrow, defineScreen, go, fmtDuration } from './dom.js';
import { routeFieldsHtml, wireRoute, onRoute, pickSaved, computeRoute } from './route.js';
import { liveState, liveSnapshot } from './live.js';
import { openMenu } from './more.js';
import { miniMap } from './map.js';
import { roofHtml, digitsHtml, setDigits, tabbarHtml, govLineHtml } from './kit.js';


function chipsHtml() {
  const items = quickPlaces().slice(0, 4);
  if (!items.length) return '';
  const name = { home: t('בית'), work: t('עבודה') };
  return `<div class="chips" id="placeChips">${items.map((it, i) => `<button type="button" class="chip" data-i="${i}">${icon(it.tag === 'home' ? 'home' : it.tag === 'work' ? 'work' : 'clock')}<span>${esc(it.tag === 'recent' ? it.p.label : name[it.tag])}</span></button>`).join('')}</div>`;
}
function recentHtml() {
  const r = lastRide(); if (!r) return '';
  const d = new Date(r.at), g = gapOf(r);
  const where = r.from && r.to ? `${esc(r.from)} ${arrow()} ${esc(r.to)}` : t('{n} ק"מ · {m} דק\'', { n: r.km.toFixed(1), m: Math.round(r.minutes) });
  const tag = g ? (g.kind === 'over' ? `<span class="tag warn xs">${t('+{amount} מעל', { amount: nis0(g.gap) })}</span>` : `<span class="tag good xs">${t('בטווח')}</span>`) : '';
  return `<button type="button" class="card recent" id="recentRide"><span class="li-lead">${icon('receipt')}</span>
    <span class="recent-main"><span class="eyebrow">${t('הנסיעה האחרונה')} · ${esc(relDay(d))} ${hm(d)}</span><b>${where}</b></span>
    <span class="recent-end"><b class="num">${nis(r.total)}</b>${tag}</span></button>`;
}
// צג המונה במצב "פנוי": שעון LED ושלושת המספרים שקובעים את המונה בתעריף הנוכחי, כולל מע"מ
function heroHtml() {
  const now = new Date(), p = activePeriod(now), k = tariffAt(now).tariff, vat = 1 + getTariffs().vat;
  const rate = (label, x) => `<div><span class="lbl">${label}</span>${digitsHtml(x * vat, { size: 20, min: 1 })}</div>`;
  return `<section class="meter" aria-label="${t('המחיר עכשיו, כולל מע"מ')}">
      <button type="button" class="lcd lcd-btn" id="ratesCard" aria-label="${t('התעריפים הנוכחיים')}">
        <span class="between"><span class="free state-big">${t('פנוי')}</span><span class="digits" style="font-size:22px" id="homeClock"><span class="ghost" aria-hidden="true">88:88</span>${hm(now)}</span></span>
        <span class="rates3">${rate(t('הפעלה'), p.start)}${rate(t('לדקה'), p.per_min[k])}${rate(t('לק"מ'), p.per_km_upto10[k])}</span>
      </button>
      <button type="button" class="btn led xl" id="startMeter">${icon('play')}<span>${t('התחל מונה')}<small>${t('נכנסתי למונית – למדוד עם GPS')}</small></span></button>
    </section>`;
}
function liveBanner() {
  const s = liveSnapshot();
  return `<button type="button" class="meter live-banner" id="liveBanner"><span class="pulse"></span>
    <span class="lb-main"><b>${t('נסיעה פעילה')} · <span class="num" id="lbTime">${fmtDuration(s.seconds)}</span></b><span>${t('המונה ממשיך לרוץ ברקע')}</span></span>
    ${digitsHtml(s.total, { size: 26, min: 1, id: 'lbTotal' })}${icon('chev', 's')}</button>`;
}
function routeExtra() {
  if (!(draft.from && draft.to)) return '';
  const r = draft.route;
  if (!r) return `<p class="small" id="rtWait">${t('מחשב מסלול ב-Google Maps…')}</p>`;
  const est = estimate(draft), range = priceRange(draft, est);
  const price = range ? `${nis0(range[0])}–${Math.round(range[1])}` : nis(est.fare.total);
  const found = draft.found.length ? `<span class="tag warn">${t('זוהה: {list}', { list: draft.found.map(esc).join(', ') })}</span>` : '';
  return `${draft.points && draft.points.length > 1 ? '<div class="home-map" id="homeMap"></div>' : ''}
    <div class="between rt-line"><span class="small">${t('לפי Google Maps:')} <b class="num">${r.km.toFixed(1)}</b> ${t('ק"מ')} · <b class="num">${r.minutes}</b> ${t("דק'")}${r.via ? ' · ' + t('דרך {via}', { via: esc(r.via) }) : ''}</span>${found}</div>
    <button type="button" class="btn taxi spread" id="estimateGo"><span>${t('כמה זה יעלה?')}<small>${t('לפי המסלול שבחרת')}</small></span><b class="price">${price}</b></button>`;
}

let clockTimer = 0;
defineScreen('home', {
  render(el) {
    el.classList.add('tabs');
    el.innerHTML = `
      <header class="top">
        <div class="brand"><img src="icons/logo-96.png" alt="" width="36" height="36"><b>${t('מונה')}</b></div>
        <span class="grow"></span>
        ${roofHtml(new Date(), { id: 'nowChip' })}
        <button type="button" class="ibtn" id="menuBtn" aria-label="${t('תפריט')}">${icon('menu')}</button>
      </header>
      <div class="stack home-stack">
        ${liveState.running ? liveBanner() : heroHtml()}
        <section class="card col dest" aria-label="${t('כמה זה יעלה?')}">
          <div class="between dest-head"><h2 class="h2">${t('כמה זה יעלה?')}</h2><button type="button" class="linkbtn sm" id="estimateBtn">${t('לפי ק"מ ודקות')}</button></div>
          ${routeFieldsHtml()}
          ${chipsHtml()}
          <div class="small route-status" id="rtInfo" aria-live="polite" hidden></div>
          <div id="routeExtra">${routeExtra()}</div>
        </section>
        ${recentHtml()}
        ${govLineHtml()}
      </div>
      ${tabbarHtml('home')}`;
    wireRoute();
    const paintExtra = () => {
      const box = $('routeExtra'); if (!box) return;
      box.innerHTML = routeExtra();
      const m = $('homeMap'); if (m) miniMap(m, draft.points);
      $('estimateGo')?.addEventListener('click', openEstimate);
      const both = !!(draft.from && draft.to);
      if ($('placeChips')) $('placeChips').hidden = both;
    };
    onRoute('home', (ev, msg) => {
      if (document.documentElement.dataset.screen !== 'home') return;
      const info = $('rtInfo'); if (!info) return;
      if (ev === 'computing') { info.hidden = false; info.textContent = t('מחשב מסלול ב-Google Maps…'); }
      else if (ev === 'error') { info.hidden = false; info.textContent = msg; }
      else info.hidden = true;
      if (ev === 'route' || ev === 'clear' || ev === 'place') paintExtra();
    });
    function openEstimate() { if (draft.from && draft.to && !draft.route) computeRoute(); go('estimate', draft.from && draft.to ? {} : { focus: 'km' }); }
    $('estimateBtn').addEventListener('click', openEstimate);
    paintExtra();
    $('placeChips')?.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; const it = quickPlaces().slice(0, 4)[Number(c.dataset.i)]; if (it) pickSaved(it.p); });
    $('startMeter')?.addEventListener('click', () => go('live', { start: true }));
    $('menuBtn').addEventListener('click', () => openMenu());
    $('nowChip').addEventListener('click', () => go('tariffs', {}, { root: true }));
    $('ratesCard')?.addEventListener('click', () => go('tariffs', {}, { root: true }));
    $('recentRide')?.addEventListener('click', () => { const r = lastRide(); if (r) go('summary', { ride: r }); });
    $('liveBanner')?.addEventListener('click', () => go('live'));
    clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      if (document.documentElement.dataset.screen !== 'home') return;
      const c = $('homeClock'); if (c) c.lastChild.textContent = hm(new Date());
      if (liveState.running && $('lbTime')) { const s = liveSnapshot(); $('lbTime').textContent = fmtDuration(s.seconds); setDigits($('lbTotal'), s.total, { min: 1 }); }
    }, 1000);
  },
  onHide() { clearInterval(clockTimer); },
});
subscribe((what) => {
  if (!['rides', 'places', 'live'].includes(what) || document.documentElement.dataset.screen !== 'home') return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;   // לא לצייר מחדש בזמן הקלדה
  go('home');
});
export const homeReady = true;
