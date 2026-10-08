// מסך הבית: לאן נוסעים, שתי פעולות ראשיות (התחל מונה / חשב מחיר), כתובות שמורות, הנסיעה האחרונה.
import { t } from '../i18n.js';
import { tariffAt, activePeriod, getTariffs } from '../engine.js';
import { draft, quickPlaces, lastRide, subscribe } from '../store.js';
import { $, esc, icon, nis, hm, relDay, arrow, defineScreen, go, openSheet, tariffName, tariffShort, dayLabelT } from './dom.js';
import { profileBtnHtml } from './account.js';
import { routeFieldsHtml, wireRoute, onRoute, pickSaved, computeRoute } from './route.js';
import { liveState } from './live.js';
import { openMenu, openTariffs } from './more.js';

// מתי משתנה התעריף הבא (עד 24 שעות קדימה)
export function nextChange(now) {
  const cur = tariffAt(now).tariff;
  for (let m = 1; m <= 1440; m++) { const d = new Date(now.getTime() + m * 60000); const x = tariffAt(d); if (x.tariff !== cur) return { at: d, tariff: x.tariff }; }
  return null;
}
function nowChip() {
  const now = new Date(), info = tariffAt(now), nx = nextChange(now);
  const next = nx ? (nx.tariff > info.tariff ? t('מ-{time} {tariff}', { time: hm(nx.at), tariff: tariffShort(nx.tariff) }) : t('עד {time}', { time: hm(nx.at) })) : '';
  return `<button type="button" class="now-chip" id="nowChip" aria-label="${t('התעריפים הנוכחיים')}"><b>${esc(tariffName(info.tariff))}</b><span>${esc(dayLabelT(info.label))}${next ? ' · ' + esc(next) : ''}</span></button>`;
}
function chipsHtml() {
  const items = quickPlaces().slice(0, 4);
  if (!items.length) return '';
  const name = { home: t('בית'), work: t('עבודה') };
  return `<div class="chips" id="placeChips">${items.map((it, i) => `<button type="button" class="chip" data-i="${i}">${icon(it.tag === 'home' ? 'home' : it.tag === 'work' ? 'work' : 'clock')}<span>${esc(it.tag === 'recent' ? it.p.label : name[it.tag])}</span></button>`).join('')}</div>`;
}
function recentHtml() {
  const r = lastRide(); if (!r) return '';
  const d = new Date(r.at);
  const where = r.from && r.to ? `${esc(r.from)} ${arrow()} ${esc(r.to)}` : t('{n} ק"מ · {m} דק\'', { n: r.km.toFixed(1), m: Math.round(r.minutes) });
  return `<button type="button" class="card recent" id="recentRide"><span class="eyebrow">${t('הנסיעה האחרונה')} · ${esc(relDay(d))} ${hm(d)}</span><span class="line"><span class="where">${where}</span><b class="n">${nis(r.total)}</b></span></button>`;
}
// המחיר עכשיו: שלושת המספרים שקובעים את המונה בתעריף הנוכחי, כולל מע"מ
function ratesHtml() {
  const now = new Date(), p = activePeriod(now), k = tariffAt(now).tariff, vat = 1 + getTariffs().vat;
  const v = (x) => (x * vat).toFixed(2);
  return `<button type="button" class="card rates" id="ratesCard"><span class="eyebrow">${t('המחיר עכשיו, כולל מע"מ')} · ${esc(tariffName(k))}</span><span class="rates-row"><span><b class="n">${v(p.start)}</b>${t('הפעלה')}</span><span><b class="n">${v(p.per_min[k])}</b>${t('לדקה')}</span><span><b class="n">${v(p.per_km_upto10[k])}</b>${t('לק"מ')}</span></span></button>`;
}
function liveBanner() {
  if (!liveState.running) return '';
  return `<button type="button" class="banner live" id="liveBanner">${icon('meter')}<span><b>${t('נסיעה פעילה')}</b><small>${t('המונה ממשיך לרוץ ברקע')}</small></span>${icon('chev', 'chev')}</button>`;
}

defineScreen('home', {
  render(el) {
    el.innerHTML = `
      <header class="appbar home">
        <div class="brand"><img src="icons/logo-96.png" alt="" width="36" height="36"><span class="wordmark">${t('מונה')}</span></div>
        ${nowChip()}
        ${profileBtnHtml()}
        <button type="button" class="iconbtn" id="menuBtn" aria-label="${t('תפריט')}">${icon('menu')}</button>
      </header>
      <div class="stack">
        ${liveBanner()}
        <section class="card dest" aria-label="${t('לאן נוסעים?')}">
          ${routeFieldsHtml()}
          ${chipsHtml()}
          <div class="note route-status" id="rtInfo" aria-live="polite" hidden></div>
        </section>
        <div class="cta">
          <button type="button" class="btn meter" id="startMeter" ${liveState.running ? 'hidden' : ''}>${icon('play')}<span>${t('התחל מונה')}<small>${t('נכנסתי למונית – למדוד עם GPS')}</small></span></button>
          <button type="button" class="btn primary" id="estimateBtn">${icon('calc')}<span>${t('כמה זה יעלה?')}<small>${draft.from && draft.to ? t('לפי המסלול שבחרת') : t('לפי מסלול, או לפי ק"מ ודקות')}</small></span></button>
        </div>
        ${recentHtml()}
        ${ratesHtml()}
        <nav class="quick-links" aria-label="${t('עוד')}">
          <button type="button" data-sheet="tariffs">${icon('list')}${t('תעריפים')}</button>
          <button type="button" data-sheet="rights">${icon('info')}${t('זכויות')}</button>
          <button type="button" data-sheet="complaint">${icon('phone')}${t('תלונה')}</button>
          <button type="button" data-go="rides">${icon('history')}${t('נסיעות')}</button>
        </nav>
      </div>`;
    wireRoute();
    onRoute('home', (ev, msg) => {
      if (document.documentElement.dataset.screen !== 'home') return;
      const info = $('rtInfo'); if (!info) return;
      if (ev === 'computing') { info.hidden = false; info.textContent = t('מחשב מסלול ב-Google Maps…'); }
      else if (ev === 'error') { info.hidden = false; info.textContent = msg; }
      else if (ev === 'route') { info.hidden = true; go('estimate'); }
      else { info.hidden = true; }
      const b = $('estimateBtn'); if (b) b.querySelector('small').textContent = draft.from && draft.to ? t('לפי המסלול שבחרת') : t('לפי מסלול, או לפי ק"מ ודקות');
    });
    $('placeChips')?.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; const it = quickPlaces().slice(0, 4)[Number(c.dataset.i)]; if (it) pickSaved(it.p); });
    $('startMeter').addEventListener('click', () => go('live', { start: true }));
    $('estimateBtn').addEventListener('click', () => { if (draft.from && draft.to && !draft.route) computeRoute(); go('estimate'); });
    $('menuBtn').addEventListener('click', openMenu);
    $('nowChip').addEventListener('click', openTariffs);
    $('ratesCard').addEventListener('click', openTariffs);
    $('recentRide')?.addEventListener('click', () => { const r = lastRide(); if (r) go('summary', { ride: r }); });
    $('liveBanner')?.addEventListener('click', () => go('live'));
    el.querySelector('.quick-links').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.go) go(b.dataset.go); else openMenu(b.dataset.sheet);
    });
  },
});
subscribe((what) => {
  if (!['rides', 'places', 'live'].includes(what) || document.documentElement.dataset.screen !== 'home') return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;   // לא לצייר מחדש בזמן הקלדה
  go('home');
});
export const homeReady = true;
