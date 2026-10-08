// הישות המרכזית: נסיעה. כאן נבנית נסיעה מהערכה (מחשבון) או ממדידה (מונה חי), ומחושבים הדברים שנגזרים ממנה:
// טווח צפוי, טיפ שעת יציאה, קווי קבלה. אין כאן DOM.
import { computeFare, tariffAt, LiveMeter } from './engine.js';
import { geoDistance } from './geo.js';

// ---- הערכה (מחשבון) ----
export function estimate(draft) {
  const start = draft.when || new Date();
  const km = Number(draft.km) || 0, minutes = Number(draft.minutes) || 0;
  const fare = computeFare({ start, km, minutes, ...draft.opts });
  return { start, km, minutes, fare, hasInput: km > 0 || minutes > 0, info: tariffAt(start) };
}

// טווח מחיר צפוי: המחיר המחושב + סטייה סבירה לפי עומסי תנועה ומסלול
export function priceRange(draft, est) {
  if (!est.hasInput) return null;
  const r = draft.route && !routeEdited(draft) ? draft.route : null;
  const minLo = r ? Math.min(r.minutes, r.staticMinutes || r.minutes) : est.minutes;
  const minHi = r ? Math.max(r.minutes, r.staticMinutes || r.minutes) : est.minutes;
  const lo = computeFare({ start: est.start, km: est.km, minutes: minLo * 0.9, ...draft.opts }).total;
  const hi = computeFare({ start: est.start, km: est.km * 1.05, minutes: minHi * 1.25 + (est.minutes > 0 ? 2 : 0), ...draft.opts }).total;
  return [Math.min(lo, est.fare.total), Math.max(hi, est.fare.total)];
}
export const routeEdited = (draft) => !!draft.route && (Number(Number(draft.km).toFixed(1)) !== Number(draft.route.km.toFixed(1)) || Number(draft.minutes) !== draft.route.minutes);

// טיפ על שעת היציאה: מתי משתנה התעריף בשלוש השעות הקרובות, והאם כדאי לחכות / למהר
export function departureTip(draft, est) {
  if (!est.hasInput) return null;
  const t0 = est.start.getTime(); let prev = est.info.tariff, best = null, worse = null;
  for (let m = 1; m <= 180; m++) {
    const d = new Date(t0 + m * 60000); const tar = tariffAt(d).tariff;
    if (tar === prev) continue;
    prev = tar;
    const f = computeFare({ start: d, km: est.km, minutes: est.minutes, ...draft.opts }).total;
    if (est.fare.total - f >= 3 && (!best || f < best.f)) best = { d, f, tar };
    if (f - est.fare.total >= 3 && m <= 60 && !worse) worse = { d, f, tar };
  }
  if (best) return { kind: 'save', at: best.d, tariff: best.tar, amount: est.fare.total - best.f };
  if (worse) return { kind: 'hurry', at: worse.d, tariff: worse.tar, amount: worse.f - est.fare.total };
  return null;
}

// ---- בניית רשומת נסיעה (נשמרת בספרייה ובענן; שמות השדות נשמרים לתאימות לנסיעות ישנות) ----
function base(fare, opts) {
  return { total: fare.total, cashTotal: fare.cashTotal, tariffLabel: fare.tariffLabel, dayLabel: fare.dayLabel, period: fare.period, lines: fare.lines, opts: { ...opts } };
}
export function rideFromEstimate(draft, est) {
  if (!est.hasInput) return null;
  return { id: Date.now(), source: 'calc', at: est.start.toISOString(), end: null, km: est.km, minutes: est.minutes, ...base(est.fare, draft.opts),
    track: draft.points && !routeEdited(draft) ? draft.points : [], asked: draft.asked || null, from: draft.from?.label || null, to: draft.to?.label || null };
}
export function rideFromMeter(meter, track, extra = {}) {
  const s = meter.snapshot();
  return { id: Date.now(), source: 'meter', at: meter.start.toISOString(), end: new Date().toISOString(), km: s.km, minutes: s.minutes, ...base(s, meter.opts),
    track: compactTrack(track), asked: null, from: extra.from || null, to: extra.to || null, estimated: extra.estimated || null };
}
export const fareOf = (ride) => ({ lines: ride.lines, total: ride.total, cashTotal: ride.cashTotal, tariffLabel: ride.tariffLabel, dayLabel: ride.dayLabel, period: ride.period });
export const newMeter = (opts) => new LiveMeter(new Date(), opts);

// מסלול לשמירה: נקודה כל ~15 מ' לכל היותר, עד 2,000 נקודות, 5 ספרות אחרי הנקודה (~1 מ')
export function compactTrack(track) {
  const out = [];
  for (const p of track) { const last = out[out.length - 1]; if (!last || geoDistance(last[0], last[1], p[0], p[1]) >= 15) out.push([+p[0].toFixed(5), +p[1].toFixed(5)]); }
  if (track.length > 1) { const end = track[track.length - 1]; const last = out[out.length - 1]; if (last[0] !== +end[0].toFixed(5) || last[1] !== +end[1].toFixed(5)) out.push([+end[0].toFixed(5), +end[1].toFixed(5)]); }
  if (out.length <= 2000) return out;
  const step = out.length / 2000; return Array.from({ length: 2000 }, (_, i) => out[Math.min(out.length - 1, Math.round(i * step))]).concat([out[out.length - 1]]);
}

// הפער בין מה שהנהג ביקש למחיר המרבי: 'over' / 'ok' / 'under' / null
export function gapOf(ride) {
  if (!(ride.asked > 0)) return null;
  const gap = ride.asked - ride.total;
  return { gap, kind: gap > 0.5 ? 'over' : gap < -0.5 ? 'under' : 'exact' };
}
// חלוקה בין נוסעים: מעגלים כלפי מעלה לאגורה
export const perPassenger = (total, n) => Math.ceil(total * 100 / n - 1e-9) / 100;
