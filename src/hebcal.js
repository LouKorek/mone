// לוח שנה עברי — חישוב ימי מנוחה לפי סעיף 18א(א) לפקודת סדרי השלטון והמשפט + יום העצמאות.
// אלגוריתם לפי Reingold & Dershowitz, "Calendrical Calculations". ללא תלות בספריות חיצוניות.

const HEBREW_EPOCH_RD = -1373427;   // R.D. של 1 בתשרי שנה 1
const RD_OF_1970 = 719163;          // R.D. של 1.1.1970

export function isHebrewLeapYear(y) { return ((7 * y + 1) % 19) < 7; }

function elapsedDays(y) {
  const monthsElapsed = Math.floor((235 * y - 234) / 19);
  const partsElapsed = 12084 + 13753 * monthsElapsed;
  let day = monthsElapsed * 29 + Math.floor(partsElapsed / 25920);
  if ((3 * (day + 1)) % 7 < 3) day += 1;
  return day;
}
function newYearDelay(y) {
  const ny0 = elapsedDays(y - 1), ny1 = elapsedDays(y), ny2 = elapsedDays(y + 1);
  if (ny2 - ny1 === 356) return 2;
  if (ny1 - ny0 === 382) return 1;
  return 0;
}
function roshHashanaRD(y) { return HEBREW_EPOCH_RD + elapsedDays(y) + newYearDelay(y); }
export function daysInHebrewYear(y) { return roshHashanaRD(y + 1) - roshHashanaRD(y); }

// חודשים בסדר השנה החל מתשרי. בשנה מעוברת יש "אדר א" (30) ו"אדר ב" (29).
export function monthsOfYear(y) {
  const len = daysInHebrewYear(y);
  const cheshvan = (len === 355 || len === 385) ? 30 : 29;
  const kislev = (len === 353 || len === 383) ? 29 : 30;
  const m = [
    ['תשרי', 30], ['חשוון', cheshvan], ['כסלו', kislev], ['טבת', 29], ['שבט', 30],
  ];
  if (isHebrewLeapYear(y)) m.push(['אדר א', 30], ['אדר ב', 29]); else m.push(['אדר', 29]);
  m.push(['ניסן', 30], ['אייר', 29], ['סיוון', 30], ['תמוז', 29], ['אב', 30], ['אלול', 29]);
  return m;
}

// ממיר תאריך עברי (שנה, שם חודש, יום) לתאריך לועזי (Date בחצות UTC).
export function hebrewToDate(y, monthName, day) {
  let rd = roshHashanaRD(y);
  for (const [name, len] of monthsOfYear(y)) {
    if (name === monthName) return rdToDate(rd + day - 1);
    rd += len;
  }
  throw new Error('חודש לא קיים בשנה זו: ' + monthName);
}
function rdToDate(rd) { return new Date((rd - RD_OF_1970) * 86400000); }
export function dateToRD(d) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000) + RD_OF_1970; }

// השנה העברית שבה נופל תאריך לועזי (לפי ראש השנה).
export function hebrewYearOf(d) {
  const rd = dateToRD(d);
  let y = d.getFullYear() + 3760;
  if (rd >= roshHashanaRD(y + 1)) y += 1;
  return y;
}

const isoDate = (dt) => dt.toISOString().slice(0, 10);

// ימי המנוחה של שנה עברית: [{date:'YYYY-MM-DD', name}]
export function restDaysOfHebrewYear(y) {
  const days = [
    ['תשרי', 1, 'ראש השנה'], ['תשרי', 2, 'ראש השנה (יום ב\')'], ['תשרי', 10, 'יום הכיפורים'],
    ['תשרי', 15, 'סוכות'], ['תשרי', 22, 'שמיני עצרת / שמחת תורה'],
    ['ניסן', 15, 'פסח'], ['ניסן', 21, 'שביעי של פסח'], ['סיוון', 6, 'שבועות'],
  ].map(([m, d, name]) => ({ date: isoDate(hebrewToDate(y, m, d)), name }));

  // יום העצמאות: ה' באייר; אם חל בשישי → נדחה ליום חמישי ד' באייר; אם בשבת → יום חמישי ג' באייר; אם ביום שני → יום שלישי ו' באייר.
  const iyar5 = hebrewToDate(y, 'אייר', 5);
  const dow = iyar5.getUTCDay(); // 0=ראשון ... 5=שישי, 6=שבת
  let indep = 5;
  if (dow === 5) indep = 4; else if (dow === 6) indep = 3; else if (dow === 1) indep = 6;
  days.push({ date: isoDate(hebrewToDate(y, 'אייר', indep)), name: 'יום העצמאות' });
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

// מפה של כל ימי המנוחה (ללא שבתות) לטווח שנים לועזיות. מפתח: 'YYYY-MM-DD'.
export function buildRestDayMap(fromYear, toYear) {
  const map = new Map();
  for (let hy = fromYear + 3759; hy <= toYear + 3761; hy++) {
    for (const { date, name } of restDaysOfHebrewYear(hy)) {
      const gy = Number(date.slice(0, 4));
      if (gy >= fromYear && gy <= toYear) map.set(date, name);
    }
  }
  return map;
}
