import { readFileSync } from 'node:fs';
import { loadTariffs, tariffAt, computeFare, LiveMeter } from '../src/engine.js';

loadTariffs(JSON.parse(readFileSync(new URL('../src/data/tariffs.json', import.meta.url), 'utf8')));

let pass = 0, fail = 0;
const ok = (name, got, exp) => {
  const good = typeof exp === 'number' ? Math.abs(got - exp) < 0.011 : got === exp;
  if (good) pass++; else { fail++; console.log(`✗ ${name}: got ${got}, expected ${exp}`); }
};
const d = (s) => new Date(s); // זמן מקומי

// ---- זיהוי תעריף לפי שעה ויום (ספטמבר 2026: 6.9 ראשון, 10.9 חמישי, 11.9 שישי וערב ר"ה, 12–13.9 ר"ה, 20.9 ערב יו"כ, 21.9 יו"כ) ----
const T = [
  ['2026-09-06T10:00', 'A'], ['2026-09-06T21:00', 'A'], ['2026-09-06T21:01', 'B'], ['2026-09-07T05:59', 'B'], ['2026-09-07T06:00', 'A'],
  ['2026-09-10T22:30', 'B'], ['2026-09-10T23:00', 'B'], ['2026-09-10T23:01', 'C'], ['2026-09-11T03:00', 'C'],
  ['2026-09-11T06:00', 'A'], ['2026-09-11T16:00', 'A'], ['2026-09-11T16:01', 'B'], ['2026-09-11T21:01', 'C'],
  ['2026-09-12T05:59', 'C'], ['2026-09-12T06:00', 'B'], ['2026-09-12T19:00', 'B'], ['2026-09-12T19:01', 'C'],
  ['2026-09-13T05:59', 'C'], ['2026-09-13T12:00', 'B'],  // ראש השנה יום ב' – יום מנוחה
  ['2026-09-13T20:00', 'C'], ['2026-09-14T03:00', 'C'], ['2026-09-14T08:00', 'A'],
  ['2026-09-20T17:00', 'B'],  // ערב יום כיפור (ראשון) – ערב יום מנוחה
  ['2026-09-21T12:00', 'B'],  // יום כיפור
  ['2026-09-30T10:00', 'A'],  // רביעי רגיל
  ['2026-10-01T22:00', 'B'],  // חמישי, ערב שמחת תורה? לא – שמחת תורה 3.10 (שבת); 2.10 שישי
  ['2027-05-11T18:00', 'B'],  // ערב יום העצמאות (יום הזיכרון), שלישי
  ['2027-05-12T10:00', 'B'],  // יום העצמאות (רביעי)
  ['2028-05-02T10:00', 'B'],  // יום העצמאות נדחה לשלישי ו' באייר
  ['2028-05-01T10:00', 'A'],  // שני – ערב יום העצמאות מ-16:01 בלבד
  ['2028-05-01T17:00', 'B'],
];
for (const [s, exp] of T) ok('tariffAt ' + s, tariffAt(d(s)).tariff, exp);

// ---- דוגמאות מהמסמך (כולל מע"מ 18%) ----
ok('עירונית 5 ק"מ 15 דק א', computeFare({ start: d('2026-09-06T10:00'), minutes: 15, km: 5 }).total, 51.40);
ok('עירונית 10 ק"מ 25 דק ב + הזמנה', computeFare({ start: d('2026-09-06T22:00'), minutes: 25, km: 10, order: true }).total, 100.02);
ok('מנתב"ג 20 ק"מ 30 דק א', computeFare({ start: d('2026-09-06T10:00'), minutes: 30, km: 20, airport: 'ben-gurion' }).total, 133.22);
ok('ת"א-ירושלים מוצ"ש 65 ק"מ 60 דק ג', computeFare({ start: d('2026-09-12T20:00'), minutes: 60, km: 65 }).total, 454.43);
ok('ת"א-חיפה כביש 6', computeFare({ start: d('2026-09-06T10:00'), minutes: 70, km: 95, road6: true }).total, 510.18);
ok('אילת ללא מע"מ', computeFare({ start: d('2026-09-06T10:00'), minutes: 12, km: 5, eilat: true }).total, 38.61);
ok('מסך 3 במסמך: שישי 17:40, 12.4 ק"מ 28 דק, הזמנה', computeFare({ start: d('2026-09-18T17:40'), minutes: 28, km: 12.4, order: true }).total, 117.06);

// ---- מעבר תעריף באמצע נסיעה: ראשון 20:50, 20 דק, 10 ק"מ → 11 דק א' + 9 דק ב' ----
const cross = computeFare({ start: d('2026-09-06T20:50'), minutes: 20, km: 10 });
// א': 11 דק × 1.65 + 5.5 ק"מ × 1.65 ; ב': 9 × 1.98 + 4.5 × 1.98 ; + 10.56 ; × 1.18
ok('מעבר תעריף', cross.total, (10.56 + 16.5 * 1.65 + 13.5 * 1.98) * 1.18);
ok('מעבר תעריף – שני תעריפים', cross.tariffs.join(''), 'AB');

// ---- תקופה: אחרי 1.4.2027 עוברים לסט הקבוע ----
const later = computeFare({ start: d('2027-04-01T10:00'), minutes: 10, km: 5 });
ok('סט קבוע מ-1.4.2027', later.total, (10.26 + 10 * 1.61 + 5 * 1.61) * 1.18);
ok('שם התקופה', later.period, 'קבוע');

// ---- מקרי קצה ----
ok('אפס דקות, רק מרחק', computeFare({ start: d('2026-09-06T10:00'), minutes: 0, km: 3 }).total, (10.56 + 3 * 1.65) * 1.18);
ok('רק הפעלה', computeFare({ start: d('2026-09-06T10:00'), minutes: 0, km: 0 }).total, 10.56 * 1.18);
ok('נתיב מהיר נוסף אחרי מע"מ', computeFare({ start: d('2026-09-06T10:00'), minutes: 0, km: 0, fastLane: 7 }).total, 10.56 * 1.18 + 7);
ok('מנהרות הכרמל 2 קטעים', computeFare({ start: d('2026-09-06T10:00'), minutes: 0, km: 0, carmel: 2 }).total, (10.56 + 20.03) * 1.18);
ok('עיגול למזומן', computeFare({ start: d('2026-09-06T10:00'), minutes: 15, km: 5 }).cashTotal, 51.4);

// ---- מונה חי: 20 דקות ב-30 קמ"ש = 10 ק"מ, ראשון 10:00 ----
const m = new LiveMeter(d('2026-09-06T10:00'), { order: true });
for (let s = 0; s < 1200; s++) m.tick(new Date(d('2026-09-06T10:00').getTime() + s * 1000), 1, 30000 / 3600);
ok('מונה חי 10 ק"מ 20 דק', m.snapshot().total, computeFare({ start: d('2026-09-06T10:00'), minutes: 20, km: 10, order: true }).total);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
