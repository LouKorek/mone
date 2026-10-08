// אריחי התוספות (משותף להערכה ולמונה החי). כל אריח הוא מתג: לחיצה מפעילה, לחיצה נוספת מבטלת.
// לתוספות עם כמה אפשרויות (שדה תעופה, מנהרות הכרמל, נתיב מהיר) נפתחת מתחת לאריחים שורת בחירה – בלי חלון נוסף.
import { t } from '../i18n.js';
import { getTariffs } from '../engine.js';
import { esc, nis, icon } from './dom.js';

const VAT = () => 1 + getTariffs().vat;
const sur = (x) => nis(x * VAT());
const S = () => getTariffs().surcharges;

const TILES = [
  { key: 'order', icon: 'phone', label: () => t('הזמנה'), price: (p) => sur(p.order_surcharge), on: (o) => o.order, tap: (o) => { o.order = !o.order; } },
  { key: 'airport', icon: 'plane', label: (o) => o.airport === 'ramon' ? t('מרמון/חיפה') : t('מנתב"ג'),
    price: (p, o) => o.airport === 'ramon' ? sur(S().ramon_or_haifa_airport) : sur(S().ben_gurion),
    on: (o) => !!o.airport, tap: (o) => { o.airport = o.airport ? null : 'ben-gurion'; } },
  { key: 'road6', icon: 'road', label: () => t('כביש 6'), price: () => sur(S().road6_main), on: (o) => o.road6, tap: (o) => { o.road6 = !o.road6; } },
  { key: 'segment18', icon: 'road', label: () => t('קטע 18'), price: () => sur(S().road6_segment18), on: (o) => o.segment18, tap: (o) => { o.segment18 = !o.segment18; } },
  { key: 'carmel', icon: 'tunnel', label: (o) => o.carmel === 2 ? t('כרמל · 2 קטעים') : t('מנהרות הכרמל'),
    price: (p, o) => sur(o.carmel === 2 ? S().carmel_tunnels_two : S().carmel_tunnels_one),
    on: (o) => o.carmel > 0, tap: (o) => { o.carmel = o.carmel > 0 ? 0 : 1; } },
  { key: 'fastLane', icon: 'bolt', label: () => t('נתיב מהיר'), price: (p, o) => o.fastLane > 0 ? nis(o.fastLane) : t('לפי השלט'), on: (o) => o.fastLane > 0 || !!o.fastLaneOn, tap: (o) => { if (o.fastLane > 0 || o.fastLaneOn) { o.fastLane = 0; o.fastLaneOn = false; } else o.fastLaneOn = true; } },
  { key: 'eilat', icon: 'palm', label: () => t('אילת'), price: () => t('ללא מע"מ'), on: (o) => o.eilat, tap: (o) => { o.eilat = !o.eilat; } },
];

function optsHtml(opts, autoKeys) {
  const seg = (key, cur, items) => `<div class="seg" role="radiogroup">${items.map(([v, label, price]) => `<button type="button" role="radio" data-opt="${key}" data-val="${v}" aria-checked="${cur === v}"><span>${esc(label)}</span>${price ? `<small>${esc(price)}</small>` : ''}</button>`).join('')}</div>`;
  let h = '';
  if (opts.airport) h += `<div class="tile-opt" data-for="airport"><span class="lbl">${t('יציאה מ:')}</span>${seg('airport', opts.airport === 'haifa' ? 'ramon' : opts.airport, [['ben-gurion', t('נתב"ג'), sur(S().ben_gurion)], ['ramon', t('רמון / חיפה'), sur(S().ramon_or_haifa_airport)]])}</div>`;
  if (opts.carmel > 0) h += `<div class="tile-opt" data-for="carmel"><span class="lbl">${t('מנהרות הכרמל')}</span>${seg('carmel', String(opts.carmel), [['1', t('קטע אחד'), sur(S().carmel_tunnels_one)], ['2', t('שני קטעים'), sur(S().carmel_tunnels_two)]])}</div>`;
  if (opts.fastLane > 0 || opts.fastLaneOn) h += `<div class="tile-opt" data-for="fastLane"><label class="lbl">${t('נתיב מהיר – הסכום שעל השלט')}</label><span class="amt">₪<input type="number" inputmode="decimal" min="0" step="0.5" class="fl-amt" value="${opts.fastLane > 0 ? opts.fastLane : ''}" placeholder="0" aria-label="${t('נתיב מהיר – הסכום שעל השלט')}"></span></div>`;
  return h;
}

/**
 * מצייר את האריחים לתוך container.
 * @param {HTMLElement} container
 * @param {object} opts         התוספות בתוקף (משתנה במקום)
 * @param {object} period       הסט התעריפי (למחיר ההזמנה)
 * @param {object} cb           { onChange(), onManual(key), auto: {key: value} (מסומנים כ"זוהה אוטומטית") }
 */
export function renderTiles(container, opts, period, cb, focusKey) {
  const auto = cb.auto || {};
  container.innerHTML = TILES.map((tile) => {
    const label = tile.label(opts), price = tile.price(period, opts), on = tile.on(opts);
    const isAuto = on && auto[tile.key] !== undefined && auto[tile.key] === opts[tile.key];
    return `<button type="button" class="tile${isAuto ? ' auto' : ''}" data-key="${tile.key}" aria-pressed="${on}" aria-label="${esc(label)}, ${esc(price)}">${icon(tile.icon)}<span class="lbl">${esc(label)}</span><small aria-hidden="true">${esc(price)}</small></button>`;
  }).join('') + optsHtml(opts);
  const rerender = (k) => { renderTiles(container, opts, period, cb, k); cb.onChange(); };
  container.onclick = (e) => {
    const opt = e.target.closest('[data-opt]');
    if (opt) {
      const k = opt.dataset.opt; cb.onManual?.(k);
      opts[k] = k === 'carmel' ? Number(opt.dataset.val) : opt.dataset.val;
      return rerender();
    }
    const btn = e.target.closest('.tile'); if (!btn) return;
    const tile = TILES.find((x) => x.key === btn.dataset.key);
    cb.onManual?.(tile.key);
    tile.tap(opts); rerender(tile.key);
  };
  const amt = container.querySelector('.fl-amt');
  if (amt) {
    amt.id = container.id + '-fl';
    container.querySelector('.tile-opt[data-for="fastLane"] label')?.setAttribute('for', amt.id);
    amt.oninput = () => {
      cb.onManual?.('fastLane');
      opts.fastLane = Math.max(0, Number(amt.value) || 0); opts.fastLaneOn = true;
      const small = container.querySelector('.tile[data-key="fastLane"] small');
      if (small) small.textContent = opts.fastLane > 0 ? nis(opts.fastLane) : t('לפי השלט');
      cb.onChange();
    };
    if (focusKey === 'fastLane') amt.focus();
  }
}
// כמה תוספות פעילות (לכותרת מקופלת)
export const activeCount = (opts) => TILES.filter((x) => x.on(opts)).length;
