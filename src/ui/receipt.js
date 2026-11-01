// קבלה בפורמט מונה: תמונה (canvas) לשיתוף או לצירוף לתלונה. נבנית מרשומת הנסיעה.
import { t, lang, isRtl } from '../i18n.js';
import { shareImage } from '../native.js';
import { updateRide } from '../store.js';
import { esc, icon, nis, pad2, hm, toast, openSheet, sheetContext, tariffLabelT, dayLabelT, lineLabel } from './dom.js';
import { APP_URL } from './price.js';

// ============ קבלה בפורמט מונה ============
export function receiptLines(ride) {
  const start = new Date(ride.at), end = ride.end ? new Date(ride.end) : null;
  const head = [
    [t('תאריך'), `${pad2(start.getDate())}.${pad2(start.getMonth() + 1)}.${start.getFullYear()}`],
    [t('התחלה'), hm(start)], [t('סיום'), end ? hm(end) : '—'],
  ];
  if (ride.from) head.push([t('מוצא'), ride.from]);
  if (ride.to) head.push([t('יעד'), ride.to]);
  head.push(
    [t("מונית מס'"), ride.taxi || '—'], [t('נהג'), ride.driver || '—'],
    [t('תעריף'), `${tariffLabelT(ride.tariffLabel)} · ${dayLabelT(ride.dayLabel)}`],
    [t('מרחק'), t('{n} ק"מ', { n: ride.km.toFixed(2) })], [t('זמן'), t("{n} דק'", { n: Math.round(ride.minutes) })],
  );
  const items = ride.lines.map(l => [lineLabel(l), l.amount.toFixed(2)]);
  const foot = [[t('סה"כ לתשלום'), nis(ride.total)], [t('במזומן (עיגול)'), nis(ride.cashTotal)]];
  if (ride.asked > 0) { const over = ride.asked - ride.total > 0.5; foot.push([t('הנהג ביקש'), nis(ride.asked)], [over ? t('פער מעל המחיר המרבי') : t('פער'), (over ? '+' : '') + nis(ride.asked - ride.total), over]); }
  return { head, items, foot };
}
export function renderReceipt(ride) {
  const W = 480, pad = 28, lh = 30, MAP_H = 170;
  const rtl = isRtl();
  const { head, items, foot } = receiptLines(ride);
  const mono = '"JetBrains Mono", "Courier New", monospace', sans = '"Rubik", "Segoe UI", "Arial Hebrew", Arial, sans-serif';
  const INK = '#151815', GRAY = '#5A615C';
  const hasRtlChars = (v) => /[֐-׿؀-ۿ]/.test(v);
  const hasLetters = (v) => /[A-Za-zЀ-ӿ֐-׿؀-ۿ]/.test(v);
  const track = ride.track && ride.track.length > 1 ? ride.track : null;
  const fit = (x, s, max) => { let v = s; while (v.length > 3 && x.measureText(v).width > max) v = v.slice(0, -2); return v === s ? s : v + '…'; };
  const draw = (x, H) => {
    let y = 44;
    if (x) {
      x.fillStyle = '#FFFEFA'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#E1E4DE';
      for (let i = 0; i < W; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 8, 0); x.lineTo(i + 4, 6); x.closePath(); x.fill(); x.beginPath(); x.moveTo(i, H); x.lineTo(i + 8, H); x.lineTo(i + 4, H - 6); x.closePath(); x.fill(); }
      x.direction = rtl ? 'rtl' : 'ltr'; x.fillStyle = INK; x.textAlign = 'center';
      x.font = `800 26px ${sans}`; x.fillText(lang() === 'he' ? 'מ ו נ ה' : t('מונה'), W / 2, y);
    }
    y += 26;
    if (x) { x.font = `500 14px ${sans}`; x.fillText(t('קבלת נסיעה · הערכה לפי צו מחירי הנסיעה במוניות'), W / 2, y); } y += 18;
    if (x) { x.font = `12px ${sans}`; x.fillStyle = GRAY; x.fillText(t('(אינה חשבונית מס — המונה במונית הוא הקובע)'), W / 2, y); } y += 22;
    const dash = () => { if (x) { x.strokeStyle = '#C7CBC5'; x.lineWidth = 1.5; x.setLineDash([5, 4]); x.beginPath(); x.moveTo(pad, y); x.lineTo(W - pad, y); x.stroke(); x.setLineDash([]); } y += 18; };
    const row = (k, v, bold, hl) => {
      if (x) {
        if (hl) { x.fillStyle = '#FFE9D6'; x.beginPath(); x.roundRect ? x.roundRect(pad - 8, y - 20, W - 2 * pad + 16, 30, 8) : x.rect(pad - 8, y - 20, W - 2 * pad + 16, 30); x.fill(); }
        x.fillStyle = hl ? '#A34A00' : bold ? INK : '#3A403C';
        const kx = rtl ? W - pad : pad, vx = rtl ? pad : W - pad;
        x.direction = rtl ? 'rtl' : 'ltr'; x.textAlign = rtl ? 'right' : 'left'; x.font = `${bold ? 700 : 400} 15px ${sans}`;
        x.fillText(fit(x, k, W * 0.5), kx, y);
        x.textAlign = rtl ? 'left' : 'right';
        if (hasLetters(v)) { x.direction = hasRtlChars(v) ? 'rtl' : 'ltr'; x.font = `${bold ? 700 : 500} 15px ${sans}`; }
        else { x.direction = 'ltr'; x.font = `${bold ? 600 : 400} 15px ${mono}`; }
        x.fillText(fit(x, String(v), W * 0.42), vx, y);
      }
      y += lh;
    };
    dash(); head.forEach(([k, v]) => row(k, v)); y += 4; dash();
    if (track) {   // מפת המסלול (קו בלבד, בלי אריחי מפה)
      if (x) drawTrack(x, track, pad, y - 6, W - 2 * pad, MAP_H);
      y += MAP_H + 10; dash();
    }
    items.forEach(([k, v]) => row(k, v)); y += 4; dash();
    foot.forEach(([k, v, hl], i) => row(k, v, i === 0 || hl, hl)); y += 4; dash();
    if (x) { x.textAlign = 'center'; x.direction = rtl ? 'rtl' : 'ltr'; x.fillStyle = GRAY; x.font = `12px ${sans}`; x.fillText(t('חושב ב"מונה" לפי הצו שבתוקף') + ' · ' + APP_URL, W / 2, y + 4); }
    y += 20;
    if (x) x.fillText(ride.source === 'calc' ? (track ? t('חישוב לפי מסלול Google Maps — המונה במונית הוא הקובע') : t('הערכה לפי המרחק והזמן שהוזנו — המונה במונית הוא הקובע')) : t('מדידת GPS עשויה לסטות בכמה אחוזים מהמונה במונית'), W / 2, y + 4);
    y += 20;
    if (x) x.fillText(t('"מונה" אינה אפליקציה ממשלתית'), W / 2, y + 4);
    return y + 40;
  };
  const H = draw(null, 0);
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
  const x = c.getContext('2d'); x.scale(2, 2); draw(x, H);
  return c;
}
const INK_D = '#151815';
function drawTrack(x, track, left, top, w, h) {
  x.save();
  x.fillStyle = '#EBEDE8';
  x.beginPath(); if (x.roundRect) x.roundRect(left, top, w, h, 8); else x.rect(left, top, w, h); x.fill();
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [la, lo] of track) { minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la); minLon = Math.min(minLon, lo); maxLon = Math.max(maxLon, lo); }
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const spanX = Math.max((maxLon - minLon) * k, 1e-5), spanY = Math.max(maxLat - minLat, 1e-5);
  const m = 14, s = Math.min((w - 2 * m) / spanX, (h - 2 * m) / spanY);
  const ox = left + (w - spanX * s) / 2, oy = top + (h - spanY * s) / 2;
  const P = ([la, lo]) => [ox + (lo - minLon) * k * s, oy + (maxLat - la) * s];
  x.lineJoin = 'round'; x.lineCap = 'round';
  const path = () => { x.beginPath(); track.forEach((p, i) => { const [px, py] = P(p); if (i) x.lineTo(px, py); else x.moveTo(px, py); }); };
  x.strokeStyle = '#1B1500'; x.lineWidth = 6.5; path(); x.stroke();
  x.strokeStyle = '#FFC21A'; x.lineWidth = 4; path(); x.stroke();
  { const [px, py] = P(track[0]); x.fillStyle = '#fff'; x.strokeStyle = INK_D; x.lineWidth = 2.5; x.beginPath(); x.arc(px, py, 5.5, 0, Math.PI * 2); x.fill(); x.stroke(); }
  { const [px, py] = P(track[track.length - 1]); x.fillStyle = '#FFC21A'; x.fillRect(px - 6, py - 6, 12, 12); x.strokeStyle = '#1B1500'; x.lineWidth = 1.5; x.strokeRect(px - 6, py - 6, 12, 12); }
  x.restore();
}
export async function shareReceipt(ride, btn) {
  const canvas = renderReceipt(ride);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], `mone-${ride.id}.png`, { type: 'image/png' });
  const text = t('קבלת נסיעה מ"מונה": {km} ק"מ, {min} דק\', {tariff} — {total} (מחיר מרבי לפי הצו).', { km: ride.km.toFixed(1), min: Math.round(ride.minutes), tariff: tariffLabelT(ride.tariffLabel), total: nis(ride.total) });
  try {
    if (await shareImage(blob, file.name, t('קבלת נסיעה — מונה'), text)) return;
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: t('קבלת נסיעה — מונה'), text }); return; }
    if (navigator.share) { await navigator.share({ title: t('קבלת נסיעה — מונה'), text: text + ' ' + APP_URL }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  toast(t('הקבלה נשמרה כתמונה'));
}
export function saveReceipt(ride) {
  renderReceipt(ride).toBlob((blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `mone-${ride.id}.png`; a.click(); toast(t('הקבלה נשמרה כתמונה')); }, 'image/png');
}
export function openReceipt(ride) {
  openSheet(t('קבלת הנסיעה'), `
    <div class="grid2"><label class="field"><span>${t("מונית מס'")}</span><input id="rTaxi" type="text" class="num" inputmode="numeric" value="${esc(ride.taxi || '')}" placeholder="${t('על הגג')}"></label>
    <label class="field"><span>${t('נהג')}</span><input id="rDriver" type="text" value="${esc(ride.driver || '')}" placeholder="${t('מהלוחית')}"></label></div>
    <div class="receipt-wrap"><img id="rImg" class="receipt-img" alt="${t('קבלת נסיעה')}"></div>
    <button class="btn go xl" id="rShare" type="button">${icon('share')}<span>${t('שתף קבלה')}</span></button>
    <div class="grid2"><button class="btn ghost" id="rSave" type="button">${icon('download', 's')}<span>${t('שמור תמונה')}</span></button><button class="btn ghost" id="rComplain" type="button" data-open="complaint">${icon('warn', 's')}<span>${t('הגש תלונה')}</span></button></div>`, (b) => {
    const img = b.querySelector('#rImg');
    const refresh = () => { img.src = renderReceipt(ride).toDataURL('image/png'); };
    ['rTaxi', 'rDriver'].forEach(id => b.querySelector('#' + id).addEventListener('input', (e) => { ride[id === 'rTaxi' ? 'taxi' : 'driver'] = e.target.value.trim(); if (ride.source !== 'calc') updateRide(ride); refresh(); }));
    b.querySelector('#rShare').onclick = (e) => shareReceipt(ride, null);
    b.querySelector('#rSave').onclick = () => saveReceipt(ride);
    if (document.fonts?.ready) document.fonts.ready.then(refresh);
    refresh();
  });
  sheetContext(ride);
}
