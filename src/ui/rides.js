// הנסיעות שלי: סיכום החודש, סינון (הכל / מונה חי / עם פער), ורשימה לפי ימים עם סימון פער מול המחיר המרבי.
import { t } from '../i18n.js';
import { loadRides, subscribe } from '../store.js';
import { gapOf } from '../ride.js';
import { $, esc, icon, nis, nis0, hm, relDay, arrow, defineScreen, go, tariffLabelT } from './dom.js';
import { tabbarHtml } from './kit.js';
import { currentUser, openAccount } from './account.js';

let filter = 'all';
const FILTERS = [['all', 'הכל'], ['meter', 'מונה חי'], ['calc', 'הערכות'], ['gap', 'עם פער']];

function rowHtml(r) {
  const d = new Date(r.at), g = gapOf(r);
  const where = r.from && r.to ? `${esc(r.from)} ${arrow()} ${esc(r.to)}` : t('{n} ק"מ · {m} דק\'', { n: r.km.toFixed(1), m: Math.round(r.minutes) });
  const meta = [hm(d)];
  if (r.from && r.to) meta.push(t('{n} ק"מ', { n: r.km.toFixed(1) }), t("{n} דק'", { n: Math.round(r.minutes) }));
  else meta.push(tariffLabelT(r.tariffLabel));
  meta.push(r.source === 'calc' ? t('הערכה') : t('מונה חי'));
  const tag = g ? (g.kind === 'over' ? `<span class="tag warn xs">${t('+{amount} מעל', { amount: nis0(g.gap) })}</span>` : `<span class="tag good xs">${t('בטווח')}</span>`) : '';
  return `<button type="button" class="li" data-id="${r.id}"><span class="lead${r.source === 'calc' ? '' : ' taxi'}">${icon(r.source === 'calc' ? 'calc' : 'play')}</span>
    <span class="main"><b>${where}</b><span>${esc(meta.join(' · '))}</span></span>
    <span class="end col-end"><b class="num">${nis(r.total)}</b>${tag}</span></button>`;
}
function statsHtml(all) {
  const now = new Date(), month = all.filter((r) => { const d = new Date(r.at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const sum = month.reduce((a, r) => a + (r.total || 0), 0);
  const gaps = month.map(gapOf).filter((g) => g && g.kind === 'over');
  const gapSum = gaps.reduce((a, g) => a + g.gap, 0);
  const cell = (k, v, s, cls = '') => `<div class="stat"><span class="eyebrow">${k}</span><b class="num${cls}">${v}</b><span class="small">${s}</span></div>`;
  return `<section class="card stats3">
    ${cell(t('החודש'), nis0(sum), month.length === 1 ? t('נסיעה אחת') : t('{n} נסיעות', { n: month.length }))}
    ${cell(t('ממוצע'), month.length ? nis0(sum / month.length) : '—', t('לנסיעה'))}
    ${cell(t('פערים'), gaps.length ? nis0(gapSum) : '₪0', gaps.length === 1 ? t('בנסיעה אחת') : gaps.length ? t('ב-{n} נסיעות', { n: gaps.length }) : t('אין פערים'), gaps.length ? ' warn' : '')}
  </section>`;
}
function listHtml(all) {
  if (!all.length) return `<div class="card empty-state">
      <div class="meter mini-meter"><div class="lcd"><span class="digits dim" style="font-size:26px"><span class="cur">₪</span>0.00</span></div></div>
      <b>${t('עדיין אין נסיעות שמורות')}</b><p class="small">${t('נסיעות מהמונה החי נשמרות כאן אוטומטית.')}</p>
      <button type="button" class="btn go sm" id="emptyStart">${icon('play', 's')}<span>${t('התחל מונה')}</span></button></div>`;
  const list = all.filter((r) => filter === 'all' || (filter === 'meter' ? r.source !== 'calc' : filter === 'calc' ? r.source === 'calc' : gapOf(r)?.kind === 'over'));
  const seg = `<div class="seg ride-filter" role="radiogroup" aria-label="${t('סינון')}">${FILTERS.map(([k, l]) => `<button type="button" role="radio" data-filter="${k}" aria-checked="${filter === k}">${t(l)}</button>`).join('')}</div>`;
  if (!list.length) return statsHtml(all) + seg + `<p class="small center pad">${t('אין נסיעות שמתאימות לסינון')}</p>`;
  const groups = []; let cur = null;
  for (const r of list) { const k = relDay(new Date(r.at)); if (!cur || cur.k !== k) { cur = { k, items: [] }; groups.push(cur); } cur.items.push(r); }
  return statsHtml(all) + seg + groups.map((g) => `<span class="group-title">${esc(g.k)}</span><div class="list">${g.items.map(rowHtml).join('')}</div>`).join('');
}
function syncTag() {
  return currentUser() ? `<button type="button" class="tag good" id="syncTag">${icon('cloud', 's')}${t('מסונכרן')}</button>`
    : `<button type="button" class="tag mute" id="syncTag">${icon('cloud', 's')}${t('במכשיר בלבד')}</button>`;
}
defineScreen('rides', {
  render(el) {
    el.classList.add('tabs');
    el.innerHTML = `
      <header class="top"><h1 class="title big">${t('הנסיעות שלי')}</h1><span id="syncBox">${syncTag()}</span></header>
      <div class="stack" id="ridesList">${listHtml(loadRides())}</div>
      ${tabbarHtml('rides')}`;
    $('syncBox').addEventListener('click', (e) => { if (e.target.closest('#syncTag')) openAccount(); });
    $('ridesList').addEventListener('click', (e) => {
      if (e.target.closest('#emptyStart')) return go('live', { start: true });
      const f = e.target.closest('[data-filter]');
      if (f) { filter = f.dataset.filter; $('ridesList').innerHTML = listHtml(loadRides()); return; }
      const b = e.target.closest('.li[data-id]'); if (!b) return;
      const r = loadRides().find((x) => x.id === Number(b.dataset.id)); if (r) go('summary', { ride: r });
    });
  },
});
subscribe((what) => {
  if (document.documentElement.dataset.screen !== 'rides') return;
  if (what === 'rides') { const el = $('ridesList'); if (el) el.innerHTML = listHtml(loadRides()); }
  if (what === 'account') { const s = $('syncBox'); if (s) s.innerHTML = syncTag(); }
});
