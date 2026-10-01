// זיהוי אוטומטי של תוספות לפי מיקום: יציאה משדה תעופה, כביש 6, קטע 18, מנהרות הכרמל.
// הקווים נלקחו ממסלולי Google Maps (Routes API) ופושטו ל-~20 מ'. משמש גם את המונה החי (נקודות GPS)
// וגם את המחשבון (קו המסלול שחזר מ-Google).
const pts = (s) => s.trim().split(/\s+/).map((p) => p.split(',').map(Number));

// כביש 6 – הקטע בתשלום של "דרך ארץ" (מחלף שורק ← מחלף עירון). התוספת בצו: "כביש 6 (למעט קטע 18)".
const ROAD6 = pts(`
31.8050,34.8319 31.8011,34.8302 31.7969,34.8291 31.7938,34.8299 31.7949,34.8318 31.7948,34.8324 31.7944,34.8326 31.7939,34.8323
31.7939,34.8315 31.7951,34.8308 31.7996,34.8306 31.8031,34.8316 31.8060,34.8332 31.8283,34.8528 31.8531,34.8711 31.8569,34.8724
31.8670,34.8741 31.8733,34.8756 31.8856,34.8805 31.8977,34.8837 31.9018,34.8860 31.9057,34.8900 31.9140,34.9025 31.9151,34.9052
31.9190,34.9195 31.9215,34.9235 31.9241,34.9255 31.9273,34.9269 31.9494,34.9315 31.9572,34.9360 31.9591,34.9378 31.9605,34.9400
31.9692,34.9570 31.9712,34.9592 31.9745,34.9610 31.9894,34.9632 31.9995,34.9662 32.0153,34.9671 32.0185,34.9670 32.0213,34.9660
32.0232,34.9647 32.0294,34.9593 32.0366,34.9521 32.0534,34.9406 32.0551,34.9398 32.0777,34.9328 32.1107,34.9363 32.1146,34.9375
32.1192,34.9401 32.1390,34.9587 32.1425,34.9609 32.1469,34.9625 32.1507,34.9630 32.1548,34.9627 32.1918,34.9563 32.1955,34.9563
32.1985,34.9571 32.2030,34.9595 32.2200,34.9728 32.2236,34.9750 32.2436,34.9843 32.2537,34.9877 32.2739,34.9964 32.2810,35.0000
32.2922,35.0081 32.2957,35.0099 32.2996,35.0112 32.3036,35.0120 32.3120,35.0127 32.3202,35.0128 32.3250,35.0120 32.3372,35.0085
32.3408,35.0084 32.3582,35.0157 32.3608,35.0158 32.3723,35.0145 32.3745,35.0150 32.3848,35.0193 32.3879,35.0200 32.4072,35.0208
32.4135,35.0216 32.4227,35.0209 32.4257,35.0213 32.4285,35.0223 32.4310,35.0239 32.4423,35.0345 32.4446,35.0357 32.4472,35.0364
32.4562,35.0371 32.4633,35.0352 32.4659,35.0350 32.4744,35.0374 32.4768,35.0375 32.4806,35.0368 32.4825,35.0377 32.4831,35.0376
32.4821,35.0319 32.4825,35.0346
`);
// קטע 18 – מחלף עירון ← מחלף עין תות (תוספת נפרדת בצו).
const SEG18 = pts(`
32.4825,35.0346 32.4830,35.0376 32.4835,35.0375 32.4855,35.0329 32.4882,35.0295 32.4910,35.0276 32.4939,35.0267 32.5096,35.0274
32.5338,35.0269 32.5370,35.0277 32.5407,35.0299 32.5439,35.0311 32.5517,35.0313 32.5544,35.0320 32.5570,35.0335 32.5623,35.0390
32.5649,35.0409 32.5841,35.0473 32.5861,35.0477 32.5888,35.0476 32.5974,35.0448 32.6008,35.0443 32.6055,35.0454 32.6103,35.0483
`);
// מנהרות הכרמל (כביש 23): פורטל מזרחי (צ'ק פוסט) ← מחלף רופין ← פורטל מערבי (חוף הכרמל).
const CARMEL = pts(`
32.7899,35.0263 32.7889,35.0245 32.7883,35.0223 32.7884,35.0205 32.7890,35.0176 32.7896,35.0151 32.7901,35.0131 32.7907,35.0095
32.7910,35.0060 32.7910,35.0038 32.7907,35.0001 32.7908,34.9982 32.7912,34.9931 32.7921,34.9816 32.7926,34.9763 32.7927,34.9741
32.7925,34.9706 32.7928,34.9672 32.7927,34.9643 32.7926,34.9612
`);
// שני הקטעים לפי קו האורך: מזרחי (צ'ק פוסט–רופין) ומערבי (רופין–חוף הכרמל), בלי אזורי המחלפים.
const CARMEL_SECTIONS = [[35.0070, 35.0240], [34.9650, 34.9990]];
// שדות תעופה: מרכז ורדיוס (מ') – התוספת חלה רק על נסיעה שמתחילה בשדה.
const AIRPORTS = [
  { key: 'ben-gurion', lat: 31.9975, lon: 34.8830, r: 1800 },   // טרמינל 1 + טרמינל 3
  { key: 'ramon', lat: 29.7245, lon: 35.0080, r: 2000 },
  { key: 'haifa', lat: 32.8110, lon: 35.0420, r: 900 },
];

const RAD = Math.PI / 180;
// מרחק במטרים בין נקודה לקו שבור (קירוב מישורי מקומי – מדויק מספיק לטווחים של עשרות ק"מ)
function distToLine(lat, lon, line) {
  const kx = 111320 * Math.cos(lat * RAD), ky = 110574;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][1] - lon) * kx, ay = (line[i - 1][0] - lat) * ky;
    const bx = (line[i][1] - lon) * kx, by = (line[i][0] - lat) * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return best;
}
export function geoDistance(lat1, lon1, lat2, lon2) {
  const a = Math.sin((lat2 - lat1) * RAD / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin((lon2 - lon1) * RAD / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}
export function airportAt(lat, lon) {
  const a = AIRPORTS.find((x) => geoDistance(lat, lon, x.lat, x.lon) <= x.r);
  return a ? a.key : null;
}

const NEAR = 150;          // מ' מהקו – נחשב "על הכביש"
const ROAD_MIN = 1500;     // מ' על הכביש כדי להכריז על נסיעה בו (מונע זיהוי שגוי במחלפים)
const TUNNEL_NEAR = 500;   // בתוך המנהרה אין GPS – מספיק ששתי הנקודות שלפני ואחרי יהיו ליד הפורטלים

// גלאי מצטבר: מזינים נקודות לפי הסדר ומקבלים אילו תוספות זוהו.
export class SurchargeDetector {
  constructor() { this.prev = null; this.first = true; this.road6 = 0; this.seg18 = 0; this.cover = [[], []]; this.airport = null; }
  feed(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return this.result();
    if (this.first) { this.first = false; this.airport = airportAt(lat, lon); }
    const p = this.prev; this.prev = [lat, lon];
    if (p) {
      const d = geoDistance(p[0], p[1], lat, lon);
      if (d > 0) {
        if (distToLine(lat, lon, ROAD6) < NEAR && distToLine(p[0], p[1], ROAD6) < NEAR) this.road6 += d;
        if (distToLine(lat, lon, SEG18) < NEAR && distToLine(p[0], p[1], SEG18) < NEAR) this.seg18 += d;
        const a = distToLine(lat, lon, CARMEL), b = distToLine(p[0], p[1], CARMEL);
        if ((a < NEAR && b < NEAR) || (d >= 400 && a < TUNNEL_NEAR && b < TUNNEL_NEAR)) {
          const lo = Math.min(lon, p[1]), hi = Math.max(lon, p[1]);
          CARMEL_SECTIONS.forEach(([s0, s1], i) => { const x0 = Math.max(lo, s0), x1 = Math.min(hi, s1); if (x1 > x0) this.cover[i].push([x0, x1]); });
        }
      }
    }
    return this.result();
  }
  sectionCovered(i) {
    const [s0, s1] = CARMEL_SECTIONS[i];
    const iv = this.cover[i].slice().sort((x, y) => x[0] - y[0]);
    let sum = 0, cur = null;
    for (const [a, b] of iv) { if (!cur || a > cur[1]) { if (cur) sum += cur[1] - cur[0]; cur = [a, b]; } else cur[1] = Math.max(cur[1], b); }
    if (cur) sum += cur[1] - cur[0];
    return sum / (s1 - s0) >= 0.6;
  }
  result() {
    return {
      airport: this.airport,
      road6: this.road6 >= ROAD_MIN,
      segment18: this.seg18 >= ROAD_MIN,
      carmel: (this.sectionCovered(0) ? 1 : 0) + (this.sectionCovered(1) ? 1 : 0),
    };
  }
}
// כל המסלול בבת אחת (למחשבון)
export function detectSurcharges(points) {
  const d = new SurchargeDetector(); let r = d.result();
  for (const [lat, lon] of points) r = d.feed(lat, lon);
  return r;
}
// פענוח קו מקודד של Google (encoded polyline)
export function decodePolyline(s) {
  const out = []; let i = 0, lat = 0, lng = 0;
  while (s && i < s.length) {
    let b, sh = 0, r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lat += (r & 1) ? ~(r >> 1) : (r >> 1);
    sh = 0; r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lng += (r & 1) ? ~(r >> 1) : (r >> 1);
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}
