// התפריט (גיליון) והמסכים שמאחוריו: תעריפים, זכויות הנוסע, תלונה, אודות ומקורות, שפה וערכת צבעים, ומסמכים.
import { t, lang, isRtl, LANGS, setLang } from '../i18n.js';
import { activePeriod, getTariffs, tariffAt, BANDS } from '../engine.js';
import { isNative } from '../native.js';
import { DOCS, docHtml } from '../legal.js';
import { lastRide, updateRide, prefs, setPref } from '../store.js';
import { $, esc, icon, nis, hm, pad2, fmtDate, fmtDT, toast, openSheet, closeSheet, sheetOpen, sheetContext, go, back, defineScreen, tariffShort, tariffName, tariffLabelT, dayLabelT } from './dom.js';
import { tabbarHtml, roofHtml, timelineHtml, govBoxHtml, govLineHtml, backBarHtml } from './kit.js';
import { shareReceipt } from './receipt.js';
import { openAccount, currentUser, firstName } from './account.js';

const BUILD = '__BUILD__';     // מוחלף בזמן הבנייה (build.mjs)
const VERSION = '__VERSION__'; // מוחלף בזמן הבנייה מ-package.json
const COMPLAINT_FORM = 'https://govforms.gov.il/mw/forms/PublicTransportRequest@mot.gov.il';
const T = getTariffs();
const VAT = 1 + T.vat;
const versionStr = () => (VERSION === '__VERSION__' ? 'dev' : VERSION);
// מסך מתוך התפריט: סוגרים את הגיליון ועוברים
const toScreen = (name, params = {}, opts = {}) => { if (sheetOpen()) closeSheet(true); go(name, params, opts); };
const backOr = (fallback = 'home') => { if (!back()) go(fallback, {}, { root: true }); };

// ---- ערכת צבעים: אוטומטי (לפי המכשיר) / בהיר / כהה ----
export function applyTheme() {
  const v = prefs.theme;
  if (v === 'light' || v === 'dark') document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme;
  const dark = v === 'dark' || (v !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0A0D0B' : '#F2F3EF');
  return dark;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { applyTheme(); themeListeners.forEach((f) => f()); });
export const themeListeners = new Set();
const THEMES = [['auto', 'לפי המכשיר'], ['light', 'בהיר'], ['dark', 'כהה']];

// ---- התקנה במסך הבית (PWA) ----
export const pwa = { installEvt: null };
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
export const canInstall = () => !isNative() && !isStandalone() && !!(pwa.installEvt || isIOS);
async function install() {
  if (pwa.installEvt) { pwa.installEvt.prompt(); const r = await pwa.installEvt.userChoice; if (r.outcome === 'accepted') pwa.installEvt = null; return; }
  openSheet(t('התקנה במסך הבית'), `<p>${t('ב-iPhone: לחץ על כפתור השיתוף {icon} בסרגל של Safari, גלול ובחר {add}, ואז {ok}.', { icon: '<b>⎙</b>', add: `<b>"${t('הוסף למסך הבית')}"</b>`, ok: `<b>"${t('הוסף')}"</b>` })}</p>`);
}

// ---- התפריט ----
const MENU = {
  tariffs: () => toScreen('tariffs', {}, { root: true }), rights: () => toScreen('rights', {}, { root: true }), rides: () => toScreen('rides', {}, { root: true }),
  complaint: () => openComplaint(null), language: () => toScreen('settings'), settings: () => toScreen('settings'), about: () => toScreen('about'),
  account: () => openAccount(), terms: () => openDoc('terms'), privacy: () => openDoc('privacy'), accessibility: () => openDoc('accessibility'), install: () => install(),
};
function avatarHtml(u) {
  if (u?.photoURL) return `<span class="avatar-md"><img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer"></span>`;
  if (u) return `<span class="avatar-md">${esc((firstName(u) || '?').charAt(0).toUpperCase())}</span>`;
  return `<span class="avatar-md guest">${icon('user')}</span>`;
}
export function openMenu(direct) {
  if (direct && MENU[direct]) return MENU[direct]();
  const u = currentUser();
  const acct = `<button type="button" data-m="account" class="card profile-card">${avatarHtml(u)}
      <span class="pc-main"><b>${u ? esc(t('שלום, {name}', { name: firstName(u) })) : t('התחברות')}</b><span class="small">${u ? t('הנסיעות מסונכרנות לענן') : navigator.onLine === false ? t('אין אינטרנט — הנסיעות נשמרות במכשיר ויסונכרנו אחר כך') : t('שמור נסיעות בענן וגש אליהן מכל מכשיר')}</span></span>${icon('chev', 's chev')}</button>`;
  const li = (k, ic, lead, title, sub = '', end = icon('chev', 's chev')) => `<button type="button" class="li" data-m="${k}"><span class="lead ${lead}">${icon(ic)}</span><span class="main"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</span>${end}</button>`;
  const themeName = t(THEMES.find(([k]) => k === prefs.theme)?.[1] || 'לפי המכשיר');
  openSheet(t('תפריט'), `
    ${acct}
    <div class="list">
      ${li('tariffs', 'list', 'taxi', t('תעריפים'), t('מתי חל כל תעריף ומה המחירים'))}
      ${li('rights', 'shield', 'good', t('זכויות הנוסע'), t('מה מותר ומה אסור לנהג'))}
      ${li('complaint', 'warn', 'stop', t('תלונה על נהג'), t('טופס משרד התחבורה, עם הקבלה'))}
      ${li('rides', 'history', '', t('הנסיעות שלי'))}
    </div>
    <div class="list">
      ${li('language', 'globe', '', t('שפה'), '', `<span class="end" lang="und">${LANGS[lang()].name}</span>`)}
      ${li('settings', 'theme', '', t('ערכת צבעים'), '', `<span class="end">${themeName}</span>`)}
      ${canInstall() ? li('install', 'download', '', t('התקן את מונה במסך הבית')) : ''}
      ${li('about', 'info', '', t('אודות ומקורות רשמיים'), '', `<span class="end num xs">${versionStr()}</span>`)}
    </div>
    ${govLineHtml()}`, (b) => {
    b.addEventListener('click', (e) => { const m = e.target.closest('[data-m]'); if (m) MENU[m.dataset.m]?.(); });
  });
}
document.addEventListener('click', (e) => { const a = e.target.closest('a[data-doc]'); if (a) { e.preventDefault(); openDoc(a.dataset.doc); } });
// "להגשת תלונה" מתוך הודעת פער: הנסיעה שבגיליון, או זו שהמסך הנוכחי מציג (המסכים רושמים כאן מאיפה לקחת אותה)
export const rideSource = { current: null };
document.addEventListener('click', (e) => { const b = e.target.closest('[data-open="complaint"]'); if (b) openComplaint(sheetContext() || rideSource.current?.() || null); });

// הבהרה ומקורות רשמיים: בכל מקום שמוצג מידע ממשלתי (מדיניות Google Play על טענות מטעות)
export const GOV_SOURCES = [
  ['צו פיקוח על מחירי מצרכים ושירותים (מחירי נסיעה במוניות), התשע"ח–2018', 'https://www.gov.il/BlobFolder/dynamiccollectorresultitem/supervisionorder_05072018/he/decision_and_directives_SupervisionOrder_05072018.pdf'],
  ['הצו (תיקון), התשפ"ו–2026: התעריפים בתוקף מ-1.4.2026', 'https://www.gov.il/BlobFolder/policy/taxi-rate-2026/he/taxi-rate-26.pdf'],
  ['משרד התחבורה: תעריפי מוניות 2026', 'https://www.gov.il/he/pages/taxi-rate-2026'],
  ['פקודת התעבורה ותקנות התעבורה, התשכ"א–1961 (תקנות 501–512)', 'https://main.knesset.gov.il/apps/legislation/main/laws/2000933'],
  ['משרד התחבורה: מידע לנהג ולנוסע במונית', 'https://www.gov.il/he/pages/taxi_driver_and_passenger_information'],
  ['חוק שוויון זכויות לאנשים עם מוגבלות, התשנ"ח–1998', 'https://main.knesset.gov.il/apps/legislation/main/laws/2001218'],
  ['משרד התחבורה: טופס פנייה בנושא תחבורה ציבורית', COMPLAINT_FORM],
];
export function govNote() {
  return `<div class="gov-note"><b>${t('"מונה" אינה אפליקציה ממשלתית ואינה קשורה למשרד התחבורה או לכל גוף ממשלתי.')}</b>
    <span>${t('המידע כאן מבוסס על המקורות הרשמיים הבאים:')}</span>
    <ul>${GOV_SOURCES.map(([n, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${t(n)}</a></li>`).join('')}</ul></div>`;
}

const FACTS = [
  ['המונה חובה — בכל נסיעה מיוחדת', 'הנהג מפעיל את המונה כשהמונית עומדת לרשותך, ומכבה בסיום. "ספיישל" במחיר קבוע מותר רק אם הוא נמוך ממה שהמונה היה מראה.', 'תקנות התעבורה 510, 512'],
  ['אסור לגבות שום דבר מעבר למונה', 'לא "עמלת אשראי", לא טיפ חובה, לא דמי מזוודות. רק התוספות שבצו: הזמנה, יציאה משדה תעופה, כבישי אגרה שביקשת.', 'תקנה 512(3)'],
  ['מספר נוסעים לא משנה את המחיר', 'עד המותר ברישיון הרכב, ועוד שני ילדים מתחת לגיל 5. גם ואן גדול או מונית נגישה — אותו תעריף.', 'תקנה 502; התוספת בוטלה ב-2020'],
  ['מזוודות — חינם', 'התוספת על כבודה פקעה ב-31.12.2020. הנהג חייב לעזור בהטענה ובפריקה.', 'תקנה 504; הצו, חלק ד\' סעיף 3'],
  ['נוסע עם מוגבלות', 'אסור לסרב, אסור לגבות תוספת על כיסא גלגלים או כלב נחייה, והנהג חייב לסייע בעלייה ובירידה. מונית נגישה שהוזמנה מחברה — עד חצי שעה.', 'חוק שוויון זכויות לאנשים עם מוגבלות'],
  ['הדרך הקצרה, והיעד שאתה בוחר', 'הנהג חייב לנסוע בדרך הקצרה ביותר בנסיבות, ולכבד מסלול שביקשת. אפשר לשנות יעד תוך כדי נסיעה.', 'תקנה 503'],
  ['אסור לסרב', 'הנהג חייב להסיע כל נוסע ומטענו לכל יעד, אלא מסיבה סבירה. אסור להתנות בנסיעה ארוכה או במחיר.', 'תקנה 501'],
  ['המונה חייב להיות גלוי', 'צג המונה חייב להיות גלוי לנוסעים מכל המושבים, כל הנסיעה.', 'תקנה 509(ב)'],
  ['קבלה', 'בקש קבלה מודפסת מהמונה — היא הבסיס לכל תלונה. ב"מונה" אפשר גם להפיק "קבלה" משלך להשוואה (נסיעות ← נסיעה ← קבלה לשיתוף).', ''],
  ['עישון ורדיו', 'אסור לנהג לעשן כשיש נוסעים; חייב להנמיך רדיו לפי בקשה.', 'משרד התחבורה — חובות הנהג'],
];
function complaintText(ride) {
  if (!ride) return '';
  const parts = [];
  if (ride.asked - ride.total > 0.5) parts.push(t('הנהג דרש {asked}; המחיר המרבי לפי הצו לנסיעה של {km} ק"מ ו-{min} דקות ({tariff}) הוא {total} — פער של {gap}.', { asked: nis(ride.asked), km: ride.km.toFixed(1), min: Math.round(ride.minutes), tariff: tariffLabelT(ride.tariffLabel), total: nis(ride.total), gap: nis(ride.asked - ride.total) }));
  else parts.push(t('נסיעה של {km} ק"מ ו-{min} דקות ({tariff}); המחיר המרבי לפי הצו: {total}.', { km: ride.km.toFixed(1), min: Math.round(ride.minutes), tariff: tariffLabelT(ride.tariffLabel), total: nis(ride.total) }));
  if (ride.track && ride.track.length > 1) parts.push(t('מצורפת קבלה עם מפת המסלול שנמדד.'));
  return parts.join(' ');
}
// ============ תעריפים ============
const KINDS = [['weekday', 'ראשון–רביעי'], ['thursday', 'חמישי'], ['eve', 'שישי וערב חג'], ['rest', 'שבת וחג']];
const at6 = (m) => { const x = (360 + m) % 1440; return `${pad2(Math.floor(x / 60))}:${pad2(x % 60)}`; };
function bandsHtml(kind) {
  let from = 0;
  return `<div class="bands">${BANDS[kind].map(([k, until]) => { const s = `<span class="band"><span class="win ${k}">${esc(tariffShort(k).replace(/['׳]/g, ''))}</span><span class="num">${at6(from)}–${at6(until - 1)}</span></span>`; from = until; return s; }).join('')}</div>`;
}
defineScreen('tariffs', {
  render(el, params = {}) {
    el.classList.add('tabs');
    const now = new Date(), info = tariffAt(now), p = activePeriod(now);
    let kind = params.kind || info.kind;
    const v = (x) => (x * VAT).toFixed(2);
    const tr = (label, a, b, c) => `<div class="tr"><span>${label}</span><b>${a}</b><b>${b}</b><b>${c}</b></div>`;
    const validity = `${p.name === 'קבוע' ? t('הסט הקבוע') : t('הוראת שעה')} · ${p.valid_to ? t('עד {date}', { date: fmtDate(p.valid_to) }) : t('מ-{date}', { date: fmtDate(p.valid_from) })}`;
    el.innerHTML = `
      <header class="top"><h1 class="title big">${t('תעריפים')}</h1><span class="tag mute">${esc(validity)}</span></header>
      <div class="stack">
        <section class="card col">
          <div class="between wrap-gap"><span class="eyebrow">${t('עכשיו')} · ${esc(dayLabelT(info.label))} ${hm(now)}</span>${roofHtml(now, { sub: 'countdown', button: false })}</div>
          <div id="tarTl"></div>
        </section>
        <div class="seg" role="radiogroup" id="daySeg" aria-label="${t('מתי חל כל תעריף')}">${KINDS.map(([k, l]) => `<button type="button" role="radio" data-kind="${k}">${t(l)}</button>`).join('')}</div>
        <section class="card ttable" aria-label="${t('התעריפים הנוכחיים')}">
          <div class="tr"><span>${t('כולל מע"מ {p}%', { p: Math.round(T.vat * 100) })}</span><span class="hA">${tariffShort('A')}</span><span class="hB">${tariffShort('B')}</span><span class="hC">${tariffShort('C')}</span></div>
          <div class="tr"><span>${t('הפעלת המונה')}</span><b class="span3">${v(p.start)}</b></div>
          ${tr(t('לכל דקה'), v(p.per_min.A), v(p.per_min.B), v(p.per_min.C))}
          ${tr(t('לכל ק"מ, עד 10 ק"מ'), v(p.per_km_upto10.A), v(p.per_km_upto10.B), v(p.per_km_upto10.C))}
          ${tr(t('לכל ק"מ, מעל 10 ק"מ'), v(p.per_km_over10.A), v(p.per_km_over10.B), v(p.per_km_over10.C))}
          ${tr(t('שעת המתנה'), (p.wait_hour.A * VAT).toFixed(1), (p.wait_hour.B * VAT).toFixed(1), (p.wait_hour.C * VAT).toFixed(1))}
        </section>
        <section class="card col">
          <h2 class="h3">${t('תוספות')}</h2>
          <div class="rline"><span>${t('הזמנת מונית')}</span><b>${v(p.order_surcharge)}</b></div>
          <div class="rline"><span>${t('יציאה מנתב"ג')}</span><b>${v(T.surcharges.ben_gurion)}</b></div>
          <div class="rline"><span>${t('יציאה משדה תעופה רמון/חיפה')}</span><b>${v(T.surcharges.ramon_or_haifa_airport)}</b></div>
          <div class="rline"><span>${t('כביש 6 / קטע 18')}</span><b>${v(T.surcharges.road6_main)} · ${v(T.surcharges.road6_segment18)}</b></div>
          <div class="rline"><span>${t('מנהרות הכרמל, קטע / שניים')}</span><b>${v(T.surcharges.carmel_tunnels_one)} · ${v(T.surcharges.carmel_tunnels_two)}</b></div>
          <div class="rline"><span>${t('נתיב מהיר')}</span><b class="txt">${t('לפי השלט')}</b></div>
        </section>
        <p class="small pad-x">${t('המונה מחייב לפי זמן ולפי מרחק לאורך כל הנסיעה. מעל 10 ק"מ רק תעריף הק"מ עולה; החיוב לדקה נמשך כרגיל.')} ${t('המחירים כאן כוללים מע"מ 18% (באילת: המחיר הנקוב בצו, ללא מע"מ)')}</p>
        ${govBoxHtml(t('מקור: צו פיקוח על מחירי מצרכים ושירותים (מחירי נסיעה במוניות), התשע"ח–2018, כפי שתוקן ב-30.3.2026.'))}
      </div>
      ${tabbarHtml('tariffs')}`;
    const paint = () => {
      el.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.kind === kind)));
      $('tarTl').innerHTML = timelineHtml(kind, kind === info.kind ? now : null) + bandsHtml(kind);
    };
    $('daySeg').addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (b) { kind = b.dataset.kind; paint(); } });
    paint();
  },
});
export function openTariffs() { toScreen('tariffs', {}, { root: true }); }

// ============ זכויות הנוסע ============
const FACT_ICONS = ['meter', 'receipt', 'users', 'check', 'shield', 'road', 'alert', 'screen', 'receipt', 'info'];
const FACT_LEADS = ['good', 'stop', 'good', 'good', 'good', 'good', 'stop', 'good', 'taxi', ''];
defineScreen('rights', {
  render(el) {
    el.classList.add('tabs');
    el.innerHTML = `
      <header class="top"><h1 class="title big">${t('זכויות הנוסע')}</h1><button type="button" class="btn sm stop" id="rightsComplain">${icon('warn', 's')}<span>${t('תלונה')}</span></button></header>
      <div class="stack">
        <div class="list">${FACTS.map(([a, d, s], i) => `<div class="li top-align"><span class="lead ${FACT_LEADS[i] || ''}">${icon(FACT_ICONS[i] || 'info')}</span><span class="main"><b>${t(a)}</b><span>${t(d)}</span>${s ? `<small>${t(s)}</small>` : ''}</span></div>`).join('')}</div>
        <button type="button" class="card li-card" id="rightsComplaint2"><span class="lead stop">${icon('warn')}</span><span class="main"><b>${t('תלונה עד חודשיים מהאירוע')}</b><span>${t('משרד התחבורה מטפל בתלונות על הפקעת מחיר, אי הפעלת מונה, סירוב להסיע ועוד — רק אם הוגשו עד חודשיים מהאירוע.')}</span></span>${icon('chev', 's chev')}</button>
        ${govBoxHtml(t('מבוסס על תקנות התעבורה ועל צו המחירים.'))}
      </div>
      ${tabbarHtml('rights')}`;
    $('rightsComplain').addEventListener('click', () => openComplaint(null));
    $('rightsComplaint2').addEventListener('click', () => openComplaint(null));
  },
});
export function openRights() { toScreen('rights', {}, { root: true }); }

// ============ תלונה ============
export function openComplaint(ride) {
  if (!ride) ride = lastRide();
  toScreen('complaint', { ride });
}
defineScreen('complaint', {
  render(el, { ride } = {}) {
    const when = ride ? fmtDT(new Date(ride.at)) : fmtDT(new Date());
    const where = ride && ride.from && ride.to ? `${ride.from} ${isRtl() ? '←' : '→'} ${ride.to}` : '';
    const gap = ride && ride.asked > 0 && ride.asked - ride.total > 0.5;
    const banner = ride ? `<div class="banner ${gap ? 'warn' : 'taxi'} top-align">${icon(gap ? 'warn' : 'info')}<span>${esc(complaintText(ride))}</span></div>` : '';
    el.innerHTML = `
      ${backBarHtml('cBack', t('תלונה על נהג מונית'))}
      <div class="stack">
        <p class="small pad-x">${t('משרד התחבורה מטפל בתלונות על הפקעת מחיר, אי הפעלת מונה, סירוב להסיע ועוד — רק אם הוגשו עד חודשיים מהאירוע.')}</p>
        ${banner}
        <section class="card steps3">
          <div class="stp"><span class="no on">1</span><span><b>${t('מספר המונית ושם הנהג')}</b><span class="small">${t('מהלוחית שבתוך המונית או מהשלט על הגג')}</span></span></div>
          <div class="fields">
            <label class="field"><span>${t("מס' רישיון המונית")}</span><input id="cTaxi" type="text" inputmode="numeric" value="${esc(ride?.taxi || '')}" placeholder="${t("על ה'כובע' ועל הדלת האחורית")}"></label>
            <label class="field"><span>${t('שם בעל המונית / הנהג')}</span><input id="cDriver" type="text" value="${esc(ride?.driver || '')}" placeholder="${t('לא חובה')}"></label>
            <label class="field full"><span>${t('תאריך ושעה')}</span><input id="cWhen" type="text" value="${esc(when)}"></label>
            <label class="field full"><span>${t('מקום')}</span><input id="cWhere" type="text" value="${esc(where)}" placeholder="${t('מאיפה לאן')}"></label>
          </div>
          ${ride ? `<div class="stp"><span class="no">2</span><span><b>${t('הקבלה עם המפה')}</b><span class="small">${t('שמור את הקבלה (עם מפת המסלול) כדי לצרף אותה.')}</span></span><button type="button" class="btn sm ghost" id="cReceipt">${icon('download', 's')}<span>${t('שמור קבלה')}</span></button></div>` : ''}
          <div class="stp"><span class="no">${ride ? 3 : 2}</span><span><b>${t('פתח את טופס משרד התחבורה')}</b><span class="small">${t('לחץ "פתח טופס תלונה" — הטקסט יועתק אוטומטית.')} ${t('בטופס: בחר "פנייה חדשה", הדבק את הטקסט וצרף את הקבלה. תתבקש גם למלא תעודת זהות, כתובת וטלפון.')}</span></span></div>
        </section>
        <section class="card flat col">
          <label class="eyebrow" for="cText">${t('הטקסט שיועתק')}</label>
          <textarea id="cText" class="box" rows="5" placeholder="${t('מה קרה? (למשל: הנהג דרש 140 ₪ בעוד שהמונה/החישוב לפי הצו הוא 117 ₪)')}">${esc(complaintText(ride))}</textarea>
        </section>
        <a class="btn go xl" id="cSubmit" href="${COMPLAINT_FORM}" target="_blank" rel="noopener">${icon('ext')}<span>${t('פתח טופס תלונה')}</span></a>
        <div class="btn-row"><button class="btn ghost" id="cCopy" type="button">${icon('doc', 's')}<span>${t('העתק את הטקסט')}</span></button><a class="btn ghost" href="tel:*8787">${icon('phone', 's')}<span>${t('חייג *8787')}</span></a></div>
        <p class="govline">${t('הטופס נמצא באתר משרד התחבורה')} · ${t('"מונה" אינה אפליקציה ממשלתית')} · <button type="button" class="linkbtn" data-open="about">${t('מקורות רשמיים')}</button></p>
      </div>`;
    const g = (id) => $(id).value.trim();
    const fullText = () => `${t('תלונה על נהג מונית')}\n${t("מס' רישיון המונית")}: ${g('cTaxi')}\n${t('בעל המונית/הנהג')}: ${g('cDriver')}\n${t('תאריך ושעה')}: ${g('cWhen')}\n${t('מקום')}: ${g('cWhere')}\n\n${g('cText')}\n\n${t('(חושב באמצעות אפליקציית "מונה" לפי צו פיקוח על מחירי נסיעה במוניות)')}`;
    const copy = async () => { try { await navigator.clipboard.writeText(fullText()); return true; } catch (e) { return false; } };
    const sync = () => { if (!ride) return; ride.taxi = g('cTaxi'); ride.driver = g('cDriver'); if (ride.source !== 'calc') updateRide(ride); };
    ['cTaxi', 'cDriver'].forEach((id) => $(id).addEventListener('change', sync));
    $('cBack').addEventListener('click', () => backOr('rights'));
    $('cCopy').addEventListener('click', async () => { const ok = await copy(); $('cCopy').lastChild.textContent = ok ? t('הועתק') : t('לא ניתן להעתיק'); });
    $('cSubmit').addEventListener('click', () => { sync(); copy().then((ok) => toast(ok ? t('הטקסט הועתק — הדבק אותו בטופס') : t('העתק את הטקסט ידנית מהשדה'))); });
    $('cReceipt')?.addEventListener('click', (e) => { sync(); shareReceipt(ride, e.currentTarget); });
  },
});

export function openDoc(key) { openSheet(t(DOCS[key].title), `<div class="legal">${docHtml(key, { lang: lang() })}</div>`); }

// ============ אודות ומקורות ============
const SRC_META = [['taxi', 'PDF'], ['taxi', 'PDF'], ['', 'gov.il'], ['', 'knesset.gov.il'], ['', 'gov.il'], ['', 'knesset.gov.il'], ['stop', 'gov.il']];
defineScreen('about', {
  render(el) {
    el.innerHTML = `
      ${backBarHtml('aboutBack', t('אודות ומקורות'))}
      <div class="stack">
        <section class="card about-card"><img src="icons/logo-96.png" alt="" width="56" height="56"><span class="col-tight"><b>${t('מונה')} · ${t('גרסה')} <span class="num">${versionStr()}</span></b><span class="small">${t('"מונה" מחשבת את המחיר המרבי החוקי של נסיעה במונית מיוחדת בישראל, לפי צו פיקוח על מחירי מצרכים ושירותים (מחירי נסיעה במוניות), התשע"ח–2018, כפי שתוקן ב-30.3.2026, ולפי תקנות התעבורה.')}</span></span></section>
        <div class="banner warn top-align">${icon('warn')}<span><b>${t('"מונה" אינה אפליקציה ממשלתית ואינה קשורה למשרד התחבורה או לכל גוף ממשלתי.')}</b> ${t('החישוב הוא הערכה: המונה המכויל במונית הוא הקובע, ומדידת GPS יכולה לסטות בכמה אחוזים. התעריפים מתעדכנים כל 1 באפריל.')}</span></div>
        <span class="group-title">${t('המידע כאן מבוסס על המקורות הרשמיים הבאים:')}</span>
        <div class="list">${GOV_SOURCES.map(([n, u], i) => `<a class="li" href="${u}" target="_blank" rel="noopener"><span class="lead ${SRC_META[i]?.[0] || ''}">${icon(SRC_META[i]?.[1] === 'PDF' ? 'doc' : 'globe')}</span><span class="main"><b>${t(n)}</b><span lang="und" dir="ltr" class="src">${SRC_META[i]?.[1] || ''}</span></span>${icon('ext', 's ext')}</a>`).join('')}</div>
        <div class="list">${[['terms', 'תנאי שימוש'], ['privacy', 'מדיניות פרטיות'], ['accessibility', 'הצהרת נגישות']].map(([k, l]) => `<button type="button" class="li" data-doc-btn="${k}"><span class="main"><b>${t(l)}</b></span>${icon('chev', 's chev')}</button>`).join('')}</div>
        <div class="between pad-x"><span class="small col about-meta"><span>${t('לו קורק')} · <bdi>lou.korek@gmail.com</bdi></span><span class="num">${BUILD === '__BUILD__' ? 'dev' : BUILD}</span></span><button class="btn sm ghost" id="chkUpd" type="button">${t('בדוק עדכון')}</button></div>
      </div>`;
    $('aboutBack').addEventListener('click', () => backOr());
    el.querySelectorAll('[data-doc-btn]').forEach((b) => b.addEventListener('click', () => openDoc(b.dataset.docBtn)));
    $('chkUpd').addEventListener('click', async () => {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) return toast(t('האפליקציה רצה ללא מטמון (דפדפן ישן או תצוגה מקדימה)'));
      await reg.update(); toast(reg.installing || reg.waiting ? t('נמצא עדכון — מתקין…') : t('זו הגרסה העדכנית'));
    });
  },
});
export function openAbout() { toScreen('about'); }

// ============ שפה וערכת צבעים ============
defineScreen('settings', {
  render(el) {
    el.innerHTML = `
      ${backBarHtml('setBack', t('שפה וערכת צבעים'))}
      <div class="stack">
        <span class="group-title">${t('שפה')}</span>
        <div class="list langs">${Object.entries(LANGS).map(([k, v]) => `<button type="button" class="li${k === lang() ? ' sel' : ''}" data-lang="${k}" aria-pressed="${k === lang()}"><span class="main"><b lang="${k}" dir="${v.dir}">${v.name}</b></span>${k === lang() ? `<span class="tick">${icon('check', 's')}</span>` : ''}</button>`).join('')}</div>
        <p class="small pad-x">${t('המסמכים המשפטיים זמינים בעברית ובאנגלית; הנוסח העברי הוא המחייב.')}</p>
        <span class="group-title">${t('ערכת צבעים')}</span>
        <div class="themes" role="radiogroup" aria-label="${t('ערכת צבעים')}">${THEMES.map(([k, l]) => `<button type="button" class="theme-card" role="radio" data-theme-opt="${k}" aria-checked="${prefs.theme === k}"><span class="pv ${k}"><i></i><s></s></span><b>${t(l)}</b></button>`).join('')}</div>
      </div>`;
    $('setBack').addEventListener('click', () => backOr());
    el.querySelectorAll('[data-lang]').forEach((x) => x.addEventListener('click', () => { if (x.dataset.lang !== lang()) setLang(x.dataset.lang); }));
    el.querySelectorAll('[data-theme-opt]').forEach((th) => th.addEventListener('click', () => {
      setPref('theme', th.dataset.themeOpt); applyTheme(); themeListeners.forEach((f) => f());
      el.querySelectorAll('[data-theme-opt]').forEach((x) => x.setAttribute('aria-checked', String(x === th)));
    }));
  },
});
export function openLanguage() { toScreen('settings'); }
