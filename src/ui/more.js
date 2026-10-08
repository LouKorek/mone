// התפריט (גיליון): חשבון, נסיעות, תעריפים, זכויות, תלונה, שפה, ערכת צבעים, התקנה, אודות ומסמכים.
import { t, lang, isRtl, LANGS, setLang } from '../i18n.js';
import { activePeriod, getTariffs } from '../engine.js';
import { isNative } from '../native.js';
import { DOCS, docHtml } from '../legal.js';
import { lastRide, updateRide, prefs, setPref, subscribe } from '../store.js';
import { $, esc, icon, nis, fmtDate, fmtDT, toast, openSheet, closeSheet, sheetContext, go, tariffShort, tariffLabelT } from './dom.js';
import { shareReceipt } from './receipt.js';
import { openAccount, currentUser, isCloudReady, firstName } from './account.js';

const BUILD = '__BUILD__';     // מוחלף בזמן הבנייה (build.mjs)
const VERSION = '__VERSION__'; // מוחלף בזמן הבנייה מ-package.json
const COMPLAINT_FORM = 'https://govforms.gov.il/mw/forms/PublicTransportRequest@mot.gov.il';
const T = getTariffs();
const VAT = 1 + T.vat;

// ---- ערכת צבעים: אוטומטי (לפי המכשיר) / בהיר / כהה ----
export function applyTheme() {
  const v = prefs.theme;
  if (v === 'light' || v === 'dark') document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme;
  const dark = v === 'dark' || (v !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1118' : '#f4f2ec');
  return dark;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { applyTheme(); themeListeners.forEach((f) => f()); });
export const themeListeners = new Set();
const THEMES = [['auto', 'אוטומטי'], ['light', 'בהיר'], ['dark', 'כהה']];

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
const SHEETS = { tariffs: () => openTariffs(), rights: () => openRights(), complaint: () => openComplaint(null), language: () => openLanguage(), about: () => openAbout(), account: () => openAccount(), terms: () => openDoc('terms'), privacy: () => openDoc('privacy'), accessibility: () => openDoc('accessibility') };
export function openMenu(direct) {
  if (direct && SHEETS[direct]) return SHEETS[direct]();
  const u = currentUser();
  const acct = u
    ? `<button type="button" data-m="account" class="account on">${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" width="32" height="32" class="avatar" referrerpolicy="no-referrer">` : icon('user')}<span><b>${esc(t('שלום, {name}', { name: firstName(u) }))}</b><small>${esc(u.email || '')} · ${t('הנסיעות מסונכרנות')}</small></span>${icon('chev', 'chev')}</button>`
    : `<button type="button" data-m="account" class="account">${icon('user')}<span><b>${t('התחברות')}</b><small>${navigator.onLine === false ? t('אין אינטרנט — הנסיעות נשמרות במכשיר ויסונכרנו אחר כך') : t('שמור נסיעות בענן וגש אליהן מכל מכשיר')}</small></span>${icon('chev', 'chev')}</button>`;
  const row = (k, ic, label, extra = '') => `<button type="button" data-m="${k}">${icon(ic)}<span>${label}</span>${extra}${icon('chev', 'chev')}</button>`;
  openSheet(t('תפריט'), `
    <div class="list menu">${acct}</div>
    <div class="list menu">
      ${row('rides', 'history', t('נסיעות'))}
      ${row('tariffs', 'list', t('התעריפים הנוכחיים'))}
      ${row('rights', 'info', t('ידעת? זכויות הנוסע'))}
      ${row('complaint', 'phone', t('הגשת תלונה על נהג'))}
    </div>
    <div class="list menu">
      ${row('language', 'globe', t('שפה'), `<b class="side" lang="und">${LANGS[lang()].name}</b>`)}
      <div class="menu-row"><span class="lbl">${icon('theme')}${t('ערכת צבעים')}</span><div class="seg" role="radiogroup" id="themeSeg">${THEMES.map(([k, l]) => `<button type="button" role="radio" data-theme-opt="${k}" aria-checked="${prefs.theme === k}">${t(l)}</button>`).join('')}</div></div>
      ${canInstall() ? row('install', 'download', t('התקן את מונה במסך הבית')) : ''}
      ${row('about', 'meter', t('אודות ומקורות'))}
    </div>
    <div class="legal-links"><button type="button" data-m="terms">${t('תנאי שימוש')}</button><span>·</span><button type="button" data-m="privacy">${t('מדיניות פרטיות')}</button><span>·</span><button type="button" data-m="accessibility">${t('הצהרת נגישות')}</button></div>`, (b) => {
    b.addEventListener('click', (e) => {
      const th = e.target.closest('[data-theme-opt]');
      if (th) { setPref('theme', th.dataset.themeOpt); applyTheme(); themeListeners.forEach((f) => f()); b.querySelectorAll('[data-theme-opt]').forEach((x) => x.setAttribute('aria-checked', String(x === th))); return; }
      const m = e.target.closest('[data-m]'); if (!m) return;
      const k = m.dataset.m;
      if (k === 'rides') { closeSheet(true); go('rides'); return; }
      if (k === 'install') { install(); return; }
      SHEETS[k]?.();
    });
  });
}
document.addEventListener('click', (e) => { const a = e.target.closest('a[data-doc]'); if (a) { e.preventDefault(); openDoc(a.dataset.doc); } });
// "להגשת תלונה" מתוך הודעת פער: הנסיעה שבגיליון, או זו שהמסך הנוכחי מציג (המסכים רושמים כאן מאיפה לקחת אותה)
export const rideSource = { current: null };
document.addEventListener('click', (e) => { const b = e.target.closest('[data-open="complaint"]'); if (b) openComplaint(sheetContext() || rideSource.current?.() || null); });

export function openTariffs() {
  const p = activePeriod(new Date());
  const row = (label, a, b, c) => `<tr><td>${label}</td><td class="n">${a}</td><td class="n">${b}</td><td class="n">${c}</td></tr>`;
  const v = (x) => (x * VAT).toFixed(2);
  openSheet(t('התעריפים הנוכחיים'), `
    <p class="note">${p.name === 'קבוע' ? t('הסט הקבוע') : t('הוראת שעה')} · ${fmtDate(p.valid_from)}${p.valid_to ? '–' + fmtDate(p.valid_to) : ' ' + t('ואילך')} · ${t('המחירים כאן כוללים מע"מ 18% (באילת: המחיר הנקוב בצו, ללא מע"מ)')}</p>
    <table class="tbl"><tr><th></th><th>${tariffShort('A')}</th><th>${tariffShort('B')}</th><th>${tariffShort('C')}</th></tr>
      ${row(t('הפעלת המונה'), v(p.start), v(p.start), v(p.start))}
      ${row(t('לכל דקה'), v(p.per_min.A), v(p.per_min.B), v(p.per_min.C))}
      ${row(t('לכל ק"מ, עד 10 ק"מ'), v(p.per_km_upto10.A), v(p.per_km_upto10.B), v(p.per_km_upto10.C))}
      ${row(t('לכל ק"מ, מעל 10 ק"מ'), v(p.per_km_over10.A), v(p.per_km_over10.B), v(p.per_km_over10.C))}
      ${row(t('שעת המתנה'), v(p.wait_hour.A), v(p.wait_hour.B), v(p.wait_hour.C))}
    </table>
    <table class="tbl"><tr><th>${t('תוספת')}</th><th></th></tr>
      <tr><td>${t('הזמנת מונית')}</td><td class="n">${v(p.order_surcharge)}</td></tr>
      <tr><td>${t('יציאה מנתב"ג / מרמון וחיפה')}</td><td class="n pair">${v(T.surcharges.ben_gurion)} / ${v(T.surcharges.ramon_or_haifa_airport)}</td></tr>
      <tr><td>${t('כביש 6 / קטע 18')}</td><td class="n pair">${v(T.surcharges.road6_main)} / ${v(T.surcharges.road6_segment18)}</td></tr>
      <tr><td>${t('מנהרות הכרמל, קטע / שניים')}</td><td class="n pair">${v(T.surcharges.carmel_tunnels_one)} / ${v(T.surcharges.carmel_tunnels_two)}</td></tr>
      <tr><td>${t('נתיב מהיר')}</td><td class="n">${t('לפי השלט')}</td></tr>
    </table>
    <table class="tbl times"><tr><th>${t('מתי חל כל תעריף')}</th><th>${tariffShort('A')}</th><th>${tariffShort('B')}</th><th>${tariffShort('C')}</th></tr>
      ${row(t('ראשון–רביעי'), '06:00–21:00', '21:01–05:59', '—')}
      ${row(t('חמישי'), '06:00–21:00', '21:01–23:00', '23:01–05:59')}
      ${row(t('שישי וערב חג'), '06:00–16:00', '16:01–21:00', '21:01–05:59')}
      ${row(t('שבת וחג'), '—', '06:00–19:00', '19:01–05:59')}
    </table>
    <p class="note">${t('המונה מחייב לפי זמן ולפי מרחק לאורך כל הנסיעה. מעל 10 ק"מ רק תעריף הק"מ עולה; החיוב לדקה נמשך כרגיל.')}</p>
    <p class="note">${t('מקור: צו פיקוח על מחירי מצרכים ושירותים (מחירי נסיעה במוניות), התשע"ח–2018, כפי שתוקן ב-30.3.2026.')}</p>`);
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
export function openRights() {
  openSheet(t('ידעת? זכויות הנוסע'), `<div class="facts">${FACTS.map(([a, d, s]) => `<div class="fact"><b>${t(a)}</b>${t(d)}${s ? `<small>${t(s)}</small>` : ''}</div>`).join('')}</div>`);
}

// ============ תלונה ============
function complaintText(ride) {
  if (!ride) return '';
  const parts = [];
  if (ride.asked > 0) parts.push(t('הנהג דרש {asked}; המחיר המרבי לפי הצו לנסיעה של {km} ק"מ ו-{min} דקות ({tariff}) הוא {total} — פער של {gap}.', { asked: nis(ride.asked), km: ride.km.toFixed(1), min: Math.round(ride.minutes), tariff: tariffLabelT(ride.tariffLabel), total: nis(ride.total), gap: nis(ride.asked - ride.total) }));
  else parts.push(t('נסיעה של {km} ק"מ ו-{min} דקות ({tariff}); המחיר המרבי לפי הצו: {total}.', { km: ride.km.toFixed(1), min: Math.round(ride.minutes), tariff: tariffLabelT(ride.tariffLabel), total: nis(ride.total) }));
  if (ride.track && ride.track.length > 1) parts.push(t('מצורפת קבלה עם מפת המסלול שנמדד.'));
  return parts.join(' ');
}
export function openComplaint(ride) {
  if (!ride) ride = lastRide();
  const when = ride ? fmtDT(new Date(ride.at)) : fmtDT(new Date());
  const where = ride && ride.from && ride.to ? `${ride.from} ${isRtl() ? '←' : '→'} ${ride.to}` : '';
  openSheet(t('הגשת תלונה על נהג'), `
    <p class="note">${t('משרד התחבורה מטפל בתלונות על הפקעת מחיר, אי הפעלת מונה, סירוב להסיע ועוד — רק אם הוגשו עד חודשיים מהאירוע.')}</p>
    <label class="field"><span>${t("מס' רישיון המונית")}</span><input id="cTaxi" type="text" class="txt" inputmode="numeric" value="${esc(ride?.taxi || '')}" placeholder="${t("על ה'כובע' ועל הדלת האחורית")}"></label>
    <label class="field"><span>${t('שם בעל המונית / הנהג')}</span><input id="cDriver" type="text" class="txt" value="${esc(ride?.driver || '')}" placeholder="${t('מהלוחית שבתוך המונית')}"></label>
    <label class="field"><span>${t('תאריך ושעה')}</span><input id="cWhen" type="text" value="${esc(when)}"></label>
    <label class="field"><span>${t('מקום')}</span><input id="cWhere" type="text" class="txt" value="${esc(where)}" placeholder="${t('מאיפה לאן')}"></label>
    <textarea id="cText" placeholder="${t('מה קרה? (למשל: הנהג דרש 140 ₪ בעוד שהמונה/החישוב לפי הצו הוא 117 ₪)')}">${esc(complaintText(ride))}</textarea>
    <ol class="steps">
      ${ride ? `<li>${t('שמור את הקבלה (עם מפת המסלול) כדי לצרף אותה.')} <button type="button" class="linkbtn inline" id="cReceipt">${t('שמור קבלה')}</button></li>` : ''}
      <li>${t('לחץ "פתח טופס תלונה" — הטקסט יועתק אוטומטית.')}</li>
      <li>${t('בטופס: בחר "פנייה חדשה", הדבק את הטקסט וצרף את הקבלה. תתבקש גם למלא תעודת זהות, כתובת וטלפון.')}</li>
    </ol>
    <div class="actions"><a class="btn primary" id="cSubmit" href="${COMPLAINT_FORM}" target="_blank" rel="noopener">${t('פתח טופס תלונה')} ↗</a></div>
    <div class="actions"><button class="btn ghost" id="cCopy" type="button">${t('העתק את הטקסט')}</button><a class="btn ghost" href="tel:*8787">${t('חייג *8787')}</a></div>`, (b) => {
    const g = (id) => b.querySelector(id).value.trim();
    const fullText = () => `${t('תלונה על נהג מונית')}\n${t("מס' רישיון המונית")}: ${g('#cTaxi')}\n${t('בעל המונית/הנהג')}: ${g('#cDriver')}\n${t('תאריך ושעה')}: ${g('#cWhen')}\n${t('מקום')}: ${g('#cWhere')}\n\n${g('#cText')}\n\n${t('(חושב באמצעות אפליקציית "מונה" לפי צו פיקוח על מחירי נסיעה במוניות)')}`;
    const copy = async () => { try { await navigator.clipboard.writeText(fullText()); return true; } catch (e) { return false; } };
    const sync = () => { if (ride && ride.source !== 'calc') { ride.taxi = g('#cTaxi'); ride.driver = g('#cDriver'); updateRide(ride); } else if (ride) { ride.taxi = g('#cTaxi'); ride.driver = g('#cDriver'); } };
    ['#cTaxi', '#cDriver'].forEach(id => b.querySelector(id).addEventListener('change', sync));
    b.querySelector('#cCopy').onclick = async () => { b.querySelector('#cCopy').textContent = (await copy()) ? t('הועתק ✓') : t('לא ניתן להעתיק'); };
    b.querySelector('#cSubmit').addEventListener('click', () => { sync(); copy().then((ok) => toast(ok ? t('הטקסט הועתק — הדבק אותו בטופס') : t('העתק את הטקסט ידנית מהשדה'))); });
    b.querySelector('#cReceipt')?.addEventListener('click', (e) => { sync(); shareReceipt(ride, e.currentTarget); });
  });
  sheetContext(ride);
}

export function openDoc(key) { openSheet(t(DOCS[key].title), `<div class="legal">${docHtml(key, { lang: lang() })}</div>`); }

export function openAbout() {
  openSheet(t('אודות'), `<p>${t('"מונה" מחשבת את המחיר המרבי החוקי של נסיעה במונית מיוחדת בישראל, לפי צו פיקוח על מחירי מצרכים ושירותים (מחירי נסיעה במוניות), התשע"ח–2018, כפי שתוקן ב-30.3.2026 (ק"ת 12345), ולפי תקנות התעבורה.')}</p>
    <p class="note">${t('החישוב הוא הערכה: המונה המכויל במונית הוא הקובע, ומדידת GPS יכולה לסטות בכמה אחוזים. התעריפים מתעדכנים כל 1 באפריל.')}</p>
    <p class="note">${t('"מונה" אינה אפליקציה ממשלתית ואינה קשורה למשרד התחבורה או לכל גוף ממשלתי.')} ${t('מקורות רשמיים:')} <a href="https://www.gov.il/he/pages/taxi-rate-2026" target="_blank" rel="noopener">${t('משרד התחבורה — תעריפי מוניות 2026')}</a> · <a href="https://www.gov.il/he/pages/taxi_driver_and_passenger_information" target="_blank" rel="noopener">${t('משרד התחבורה — מידע לנהג ולנוסע במונית')}</a></p>
    <p class="note">${t('גרסה')} ${VERSION === '__VERSION__' ? 'dev' : VERSION} (${BUILD === '__BUILD__' ? 'dev' : BUILD}) · ${t('לו קורק')} · lou.korek@gmail.com · <a href="#" data-doc="terms">${t('תנאי שימוש')}</a> · <a href="#" data-doc="privacy">${t('פרטיות')}</a> · <a href="#" data-doc="accessibility">${t('נגישות')}</a></p>
    <div class="actions"><button class="btn ghost" id="chkUpd" type="button">${t('בדוק עדכון')}</button></div>`, (b) => {
    b.querySelector('#chkUpd').onclick = async () => {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) return toast(t('האפליקציה רצה ללא מטמון (דפדפן ישן או תצוגה מקדימה)'));
      await reg.update(); toast(reg.installing || reg.waiting ? t('נמצא עדכון — מתקין…') : t('זו הגרסה העדכנית'));
    };
  });
}


export function openLanguage() {
  openSheet(t('שפה'), `<div class="list menu langs">${Object.entries(LANGS).map(([k, v]) => `<button type="button" data-lang="${k}" lang="${k}" dir="${v.dir}" class="${k === lang() ? 'on' : ''}" aria-pressed="${k === lang()}"><span>${v.name}</span>${k === lang() ? '<b aria-hidden="true">✓</b>' : ''}</button>`).join('')}</div>
    <p class="note">${t('המסמכים המשפטיים זמינים בעברית ובאנגלית; הנוסח העברי הוא המחייב.')}</p>`, (b) => {
    b.querySelectorAll('[data-lang]').forEach(x => x.addEventListener('click', () => { if (x.dataset.lang !== lang()) setLang(x.dataset.lang); else closeSheet(false); }));
  });
}


