// מנוע החישוב של "מונה" — לפי צו פיקוח על מחירי מצרכים ושירותים (מחירי נסיעה במוניות), התשע"ח–2018,
// כפי שתוקן ב-30.3.2026 (ק"ת 12345), בתוקף מ-1.4.2026.
import { buildRestDayMap } from './hebcal.js';

export const TARIFF_NAMES = { A: "תעריף א'", B: "תעריף ב'", C: "תעריף ג'" };

// ---------- תעריפים לפי תאריך ----------
let TARIFFS = null;
export function loadTariffs(json) { TARIFFS = json; return json; }
export function getTariffs() { if (!TARIFFS) throw new Error('התעריפים לא נטענו'); return TARIFFS; }

const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// הסט (הוראת שעה / קבוע) שחל בתאריך נתון. אם אין סט מתאים – האחרון.
export function activePeriod(date) {
  const day = isoLocal(date);
  const periods = getTariffs().periods;
  return periods.find(p => day >= p.valid_from && (!p.valid_to || day <= p.valid_to)) || periods[periods.length - 1];
}

// ---------- זיהוי סוג היום והתעריף ----------
const restMap = buildRestDayMap(2020, 2060); // ימי מנוחה (ללא שבתות) לפי הלוח העברי

// "יום תעריף" מתחיל ב-06:00. מחזיר את התאריך הלועזי שבו התחיל היום, ואת דקות-היום מ-06:00.
export function tariffDayOf(date) {
  const shifted = new Date(date.getTime() - 6 * 3600000);
  const day = new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
  const minutesFrom6 = shifted.getHours() * 60 + shifted.getMinutes();
  return { day, minutesFrom6 };
}

export function dayKind(day) {
  const dow = day.getDay(); // 0=ראשון, 4=חמישי, 5=שישי, 6=שבת
  const iso = isoLocal(day);
  const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  if (dow === 6) return { kind: 'rest', label: 'שבת' };
  if (restMap.has(iso)) return { kind: 'rest', label: restMap.get(iso) };
  if (dow === 5) return { kind: 'eve', label: 'ערב שבת' };
  if (restMap.has(isoLocal(next))) return { kind: 'eve', label: 'ערב ' + restMap.get(isoLocal(next)) };
  if (dow === 4) return { kind: 'thursday', label: 'יום חמישי' };
  return { kind: 'weekday', label: 'יום חול' };
}

// מפת השעות מהצו (הגדרת "תעריף א'/ב'/ג'"). הגבולות בדקות מ-06:00; הדקה 21:00 עדיין א', מ-21:01 ב'.
const BANDS = {
  weekday:  [['A', 15 * 60 + 1], ['B', 24 * 60]],
  thursday: [['A', 15 * 60 + 1], ['B', 17 * 60 + 1], ['C', 24 * 60]],
  eve:      [['A', 10 * 60 + 1], ['B', 15 * 60 + 1], ['C', 24 * 60]],
  rest:     [['B', 13 * 60 + 1], ['C', 24 * 60]],
};

export function tariffAt(date) {
  const { day, minutesFrom6 } = tariffDayOf(date);
  const { kind, label } = dayKind(day);
  for (const [t, until] of BANDS[kind]) {
    if (minutesFrom6 < until) return { tariff: t, kind, label };
  }
  return { tariff: 'B', kind, label };
}

// ---------- חישוב מחיר ----------
export function ratePerKm(period, tariff, cumulativeKm) {
  return cumulativeKm < 10 ? period.per_km_upto10[tariff] : period.per_km_over10[tariff];
}

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * חישוב מחיר לנסיעה שהוזנה ידנית (מחשבון).
 * @param {Object} ride
 * @param {Date}   ride.start        זמן תחילת הנסיעה
 * @param {number} ride.minutes      משך הנסיעה בדקות (כולל עצירות/המתנה)
 * @param {number} ride.km           מרחק בק"מ
 * @param {boolean} [ride.order]     מונית שהוזמנה למקום המזמין
 * @param {string}  [ride.airport]   'ben-gurion' | 'ramon' | 'haifa' | null  (יציאה משדה תעופה)
 * @param {boolean} [ride.road6]     כביש 6 (למעט קטע 18)
 * @param {boolean} [ride.segment18] קטע 18 הצפוני
 * @param {number}  [ride.carmel]    מנהרות הכרמל: 0 / 1 / 2 קטעים
 * @param {number}  [ride.fastLane]  אגרת נתיב מהיר לפי השלט (סכום סופי, כולל מע"מ)
 * @param {boolean} [ride.eilat]     נסיעה באזור אילת (ללא מע"מ)
 */
export function computeFare(ride) {
  const T = getTariffs();
  const period = activePeriod(ride.start);
  const minutes = Math.max(0, Number(ride.minutes) || 0);
  const km = Math.max(0, Number(ride.km) || 0);

  // מפצלים את הנסיעה לדקות; המרחק מתפזר באופן אחיד לאורך הזמן (הערכה).
  const kmPerMinute = minutes > 0 ? km / minutes : 0;
  const byTariff = {};                       // {A:{minutes, km, kmUpto10, kmOver10}}
  let cumKm = 0;
  const steps = minutes > 0 ? Math.ceil(minutes) : 1;
  for (let i = 0; i < steps; i++) {
    const frac = minutes > 0 ? Math.min(1, minutes - i) : 0;       // הדקה האחרונה יכולה להיות חלקית
    const t = tariffAt(new Date(ride.start.getTime() + i * 60000)).tariff;
    const b = byTariff[t] || (byTariff[t] = { minutes: 0, km: 0, kmUpto10: 0, kmOver10: 0 });
    b.minutes += frac;
    const dKm = minutes > 0 ? kmPerMinute * frac : km;
    const upto = Math.max(0, Math.min(dKm, 10 - cumKm));
    b.kmUpto10 += upto; b.kmOver10 += dKm - upto; b.km += dKm; cumKm += dKm;
  }

  return summarize(period, byTariff, ride, tariffAt(ride.start).label);
}

// בונה את הפירוט והסכום מתוך הצבירה לפי תעריף (משותף למחשבון ולמונה החי).
function summarize(period, byTariff, opts, dayLabel) {
  const T = getTariffs();
  const lines = [{ key: 'start', label: 'הפעלת המונה', amount: period.start }];
  let subtotal = period.start;
  const tariffsUsed = Object.keys(byTariff).sort();
  for (const t of tariffsUsed) {
    const b = byTariff[t];
    const suffix = tariffsUsed.length > 1 ? ` (${TARIFF_NAMES[t]})` : '';
    if (b.minutes > 0) { const a = b.minutes * period.per_min[t]; subtotal += a; lines.push({ key: 'time', label: `${fmt(b.minutes)} דק' × ${period.per_min[t].toFixed(2)}${suffix}`, amount: a }); }
    if (b.kmUpto10 > 0) { const a = b.kmUpto10 * period.per_km_upto10[t]; subtotal += a; lines.push({ key: 'km', label: `${fmt(b.kmUpto10)} ק"מ × ${period.per_km_upto10[t].toFixed(2)}${suffix}`, amount: a }); }
    if (b.kmOver10 > 0) { const a = b.kmOver10 * period.per_km_over10[t]; subtotal += a; lines.push({ key: 'km10', label: `${fmt(b.kmOver10)} ק"מ מעל 10 × ${period.per_km_over10[t].toFixed(2)}${suffix}`, amount: a }); }
  }
  const add = (cond, key, label, amount) => { if (cond && amount) { subtotal += amount; lines.push({ key, label, amount }); } };
  add(opts.order, 'order', 'הזמנת מונית', period.order_surcharge);
  add(opts.airport === 'ben-gurion', 'airport', 'יציאה מנתב"ג', T.surcharges.ben_gurion);
  add(opts.airport === 'ramon' || opts.airport === 'haifa', 'airport', 'יציאה משדה תעופה רמון/חיפה', T.surcharges.ramon_or_haifa_airport);
  add(opts.road6, 'road6', 'כביש 6', T.surcharges.road6_main);
  add(opts.segment18, 'seg18', 'כביש 6 – קטע 18', T.surcharges.road6_segment18);
  add(opts.carmel === 1, 'carmel', 'מנהרות הכרמל – קטע אחד', T.surcharges.carmel_tunnels_one);
  add(opts.carmel === 2, 'carmel', 'מנהרות הכרמל – שני קטעים', T.surcharges.carmel_tunnels_two);

  const vatRate = opts.eilat ? T.eilat_vat : T.vat;
  const vat = subtotal * vatRate;
  if (vatRate > 0) lines.push({ key: 'vat', label: `מע"מ ${Math.round(vatRate * 100)}%`, amount: vat });
  let total = subtotal + vat;
  const fastLane = Number(opts.fastLane) || 0;
  if (fastLane > 0) { lines.push({ key: 'fastlane', label: 'נתיב מהיר (לפי השלט)', amount: fastLane }); total += fastLane; }

  return {
    total: round2(total),
    subtotal: round2(subtotal),
    vat: round2(vat),
    lines: lines.map(l => ({ ...l, amount: round2(l.amount) })),
    tariffs: tariffsUsed,
    tariffLabel: tariffsUsed.map(t => TARIFF_NAMES[t]).join(' + '),
    dayLabel,
    period: period.name,
    cashTotal: Math.round(total * 10) / 10,   // עיגול ל-10 אגורות בתשלום במזומן
  };
}

function fmt(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }

// ---------- מונה חי ----------
// צובר עלות בזמן אמת: כל קריאה ל-tick מוסיפה שניות ומטרים בתעריף שחל באותו רגע.
export class LiveMeter {
  constructor(start = new Date(), opts = {}) {
    this.start = start; this.opts = { ...opts };
    this.period = activePeriod(start);
    this.seconds = 0; this.meters = 0;
    this.byTariff = {};
    this.tariff = tariffAt(start).tariff;
  }
  bucket(t) { return this.byTariff[t] || (this.byTariff[t] = { minutes: 0, km: 0, kmUpto10: 0, kmOver10: 0 }); }
  tick(now, dSeconds, dMeters) {
    const t = tariffAt(now).tariff;
    this.tariff = t;
    const b = this.bucket(t);
    b.minutes += dSeconds / 60;
    const kmBefore = this.meters / 1000, dKm = dMeters / 1000;
    const upto = Math.max(0, Math.min(dKm, 10 - kmBefore));
    b.kmUpto10 += upto; b.kmOver10 += dKm - upto; b.km += dKm;
    this.seconds += dSeconds; this.meters += dMeters;
  }
  setOption(key, value) { this.opts[key] = value; }
  snapshot() {
    if (this.seconds === 0 && this.meters === 0) this.bucket(this.tariff);
    const s = summarize(this.period, this.byTariff, this.opts, tariffAt(this.start).label);
    return { ...s, km: this.meters / 1000, minutes: this.seconds / 60, tariff: this.tariff };
  }
  // שמירה/שחזור (למקרה שהדפדפן נסגר באמצע נסיעה)
  toJSON() { return { start: this.start.toISOString(), opts: this.opts, seconds: this.seconds, meters: this.meters, byTariff: this.byTariff, tariff: this.tariff }; }
  static fromJSON(j) {
    const m = new LiveMeter(new Date(j.start), j.opts);
    Object.assign(m, { seconds: j.seconds, meters: j.meters, byTariff: j.byTariff, tariff: j.tariff });
    return m;
  }
}
