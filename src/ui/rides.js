// ספריית הנסיעות: רשימה לפי ימים, עם סימון נסיעות שבהן הנהג ביקש יותר מהמותר.
import { t } from '../i18n.js';
import { loadRides, subscribe } from '../store.js';
import { gapOf } from '../ride.js';
import { $, esc, icon, nis, hm, relDay, arrow, defineScreen, go, back, tariffLabelT } from './dom.js';

function rowHtml(r) {
  const d = new Date(r.at), g = gapOf(r);
  const where = r.from && r.to ? `${esc(r.from)} ${arrow()} ${esc(r.to)}` : t('{n} ק"מ · {m} דק\'', { n: r.km.toFixed(1), m: Math.round(r.minutes) });
  const flag = g?.kind === 'over' ? `<span class="flag over">${t('+{amount} מעל', { amount: nis(g.gap) })}</span>` : '';
  return `<button type="button" class="ride" data-id="${r.id}"><span class="meta"><b>${where}</b><span>${hm(d)} · ${esc(tariffLabelT(r.tariffLabel))}${r.source === 'calc' ? ' · ' + t('הערכה') : ''}</span></span><span class="end"><span class="n">${nis(r.total)}</span>${flag}</span></button>`;
}
function listHtml(list) {
  if (!list.length) return `<div class="empty-state">${icon('history')}<p>${t('עדיין אין נסיעות שמורות. נסיעות מהמונה החי נשמרות כאן אוטומטית.')}</p><button type="button" class="btn meter" id="emptyStart">${icon('play')}<span>${t('התחל מונה')}</span></button></div>`;
  const groups = []; let cur = null;
  for (const r of list) { const k = relDay(new Date(r.at)); if (!cur || cur.k !== k) { cur = { k, items: [] }; groups.push(cur); } cur.items.push(r); }
  const sum = list.reduce((a, r) => a + (r.total || 0), 0);
  return `<p class="note total-line">${t('{n} נסיעות · סה"כ {amount}', { n: list.length, amount: nis(sum) })}</p>` +
    groups.map((g) => `<h2 class="group">${esc(g.k)}</h2><div class="list">${g.items.map(rowHtml).join('')}</div>`).join('');
}
defineScreen('rides', {
  render(el) {
    el.innerHTML = `
      <header class="appbar"><button type="button" class="iconbtn" id="ridesBack" aria-label="${t('חזרה')}">${icon('back')}</button><h1>${t('נסיעות')}</h1></header>
      <div class="stack" id="ridesList">${listHtml(loadRides())}</div>`;
    $('ridesBack').addEventListener('click', () => { if (!back()) go('home', {}, { root: true }); });
    $('ridesList').addEventListener('click', (e) => {
      if (e.target.closest('#emptyStart')) return go('live', { start: true });
      const b = e.target.closest('.ride'); if (!b) return;
      const r = loadRides().find((x) => x.id === Number(b.dataset.id)); if (r) go('summary', { ride: r });
    });
  },
});
subscribe((what) => { if (what === 'rides' && document.documentElement.dataset.screen === 'rides') { const el = $('ridesList'); if (el) el.innerHTML = listHtml(loadRides()); } });
