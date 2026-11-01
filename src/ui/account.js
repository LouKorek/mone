// חשבון וסנכרון ענן (Firebase): התחברות, פרופיל, מחיקת חשבון, ומיזוג הנסיעות בין המכשיר לענן.
import { t } from '../i18n.js';
import { initCloud, onUser, getUser, redirectOutcome, signInOrRegister, resetPassword, signInGoogle, signInApple, signOut, pushRides, pullRides, deleteRideCloud, deleteAccount, errorHe } from '../cloud.js';
import { hasNativeApple } from '../native.js';
import { loadRides, storeRides, subscribe, emit } from '../store.js';
import { esc, icon, nis0, toast, openSheet as openSheetRaw, closeSheet, sheetOpen, sheetDepth, defineScreen, go, currentScreen } from './dom.js';

// גיליונות החשבון מחליפים זה את זה (התחברות ← פרופיל), מעל מה שהיה פתוח לפני כן (למשל התפריט)
let baseDepth = -1;
function openSheet(title, html, after) {
  const replace = baseDepth >= 0 && sheetOpen() && sheetDepth() > baseDepth;
  if (!replace) baseDepth = sheetDepth();
  openSheetRaw(title, html, after, { replace, onClose: () => { if (sheetDepth() <= baseDepth) baseDepth = -1; } });
}

let cloudReady = false;

// רמז מקומי שהמשתמש מחובר: Firebase משחזר את ההתחברות רק אחרי שנטען, ובינתיים צריך לדעת אם להציג את מסך הפתיחה
const HINT = 'mone.authHint';
export function authHint() { try { return JSON.parse(localStorage.getItem(HINT) || 'null'); } catch (e) { return null; } }
function setHint(u) { try { if (u) localStorage.setItem(HINT, JSON.stringify({ name: firstName(u), photo: u.photoURL || null })); else localStorage.removeItem(HINT); } catch (e) { /* */ } }

// כפתור הפרופיל הקבוע בשורה העליונה: תמונה / אות ראשונה / סמל אורח
function profileInner() {
  const u = getUser(), h = u ? { name: firstName(u), photo: u.photoURL } : authHint();
  if (h?.photo) return `<img src="${esc(h.photo)}" alt="" class="avatar" referrerpolicy="no-referrer">`;
  if (h?.name) return `<span class="initial">${esc(h.name.charAt(0).toUpperCase())}</span>`;
  return icon('user');
}
export function profileBtnHtml() {
  const on = !!(getUser() || authHint());
  return `<button type="button" class="iconbtn profile${on ? ' on' : ''}" data-profile aria-label="${on ? t('פרופיל') : t('התחברות')}">${profileInner()}</button>`;
}
function paintProfile() {
  const on = !!(getUser() || authHint());
  document.querySelectorAll('[data-profile]').forEach((b) => { b.innerHTML = profileInner(); b.classList.toggle('on', on); b.setAttribute('aria-label', on ? t('פרופיל') : t('התחברות')); });
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-profile]')) openAccount(); });
subscribe((what) => { if (what === 'account') paintProfile(); });
let accountReq = 0;
export const currentUser = () => getUser();
export const isCloudReady = () => cloudReady;
// כל שמירה/מחיקה של נסיעה עוברת לענן אם מחוברים
subscribe((what, data) => {
  if (!getUser()) return;
  if (what === 'ride-saved' && data && data.source !== 'calc') pushRides([data]).catch(() => {});
  if (what === 'ride-deleted') deleteRideCloud(data).catch(() => {});
});
const errT = (e) => { const m = errorHe(e); return m.startsWith('שגיאה: ') ? t('שגיאה: {msg}', { msg: m.slice(7) }) : t(m); };
export function accountLabel(u) { return u ? (u.displayName || u.email || t('מחובר')) : t('התחברות'); }
export function firstName(u) { return (u.displayName || u.email || '').split(/[\s@]/)[0] || ''; }
function renderAccountRow() { emit('account'); }
function greet(u) { toast(t('שלום, {name} — התחברת בהצלחה', { name: firstName(u) || t('ברוך הבא') })); }
export async function syncRides() {
  try {
    const local = loadRides();
    const cloud = await pullRides();
    const byId = new Map(cloud.map(r => [r.id, r]));
    const toPush = local.filter(r => !byId.has(r.id));
    local.forEach(r => { if (!byId.has(r.id)) byId.set(r.id, r); });
    const merged = [...byId.values()].sort((a, b) => new Date(b.at) - new Date(a.at));
    storeRides(merged);
    if (toPush.length) await pushRides(toPush);
  } catch (e) { console.warn('sync', e); }
}
function cloudUp() {
  if (cloudReady) return Promise.resolve();
  return initCloud().then(() => {
    if (cloudReady) return;
    cloudReady = true;
    onUser((u) => {
      if (u) setHint(u);
      renderAccountRow();
      if (u) { syncRides(); if (currentScreen() === 'welcome') go('home', {}, { root: true }); }
    });
    const r = redirectOutcome();          // חזרה מהתחברות Google (אפליקציה מותקנת כ-PWA)
    if (r.user) { greet(r.user); }
    else if (r.error) { openSheet(t('ההתחברות לא הושלמה'), `<p class="err">${esc(errT(r.error))}</p><p class="note">${t('נסה שוב, או התחבר באימייל.')}</p>`); }
  });
}
export function startCloud() { cloudUp().catch(() => emit('account')); }

export async function openAccount() {
  baseDepth = -1;
  if (!cloudReady) {
    // עדיין נטען (או נכשל קודם) — מנסים שוב עכשיו במקום להציג הודעה סתמית
    const my = ++accountReq;
    openSheet(t('חשבון'), `<p class="note">${t('מתחבר לענן…')}</p>`);
    try { await cloudUp(); if (my !== accountReq || !sheetOpen()) return; }
    catch (e) {
      if (my !== accountReq || !sheetOpen()) return;
      console.warn('cloud', e);
      return openSheet(t('חשבון'), `<p class="note">${t('לא הצלחנו להתחבר לענן')}${navigator.onLine === false ? ' — ' + t('אין חיבור לאינטרנט') : ''}. ${t('הנסיעות נשמרות בינתיים במכשיר.')}</p>
        <div class="actions"><button class="btn ghost" id="aRetry" type="button">${t('נסה שוב')}</button></div>`, (b) => { b.querySelector('#aRetry').onclick = () => openAccount(); });
    }
  }
  const u = getUser();
  if (u) return openProfile(u);
  openSheet(t('התחברות'), loginSheetHtml(), (b) => wireLogin(b, (u) => openProfile(u)));
}

// טופס ההתחברות: חלקים משותפים לגיליון החשבון ולמסך הפתיחה
const GOOGLE_SVG = '<svg class="gicon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4 5.6-4z"/></svg>';
const APPLE_SVG = '<svg class="gicon" viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor;stroke:none"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2.1-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1zM13.9 4.9c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z"/></svg>';
const emailFieldsHtml = () => `
  <label class="field"><span>${t('אימייל')}</span><input data-a="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" dir="ltr"></label>
  <label class="field"><span>${t('סיסמה')} · ${t('6 תווים לפחות')}</span><input data-a="pass" type="password" autocomplete="current-password" dir="ltr"></label>
  <div class="between"><button type="button" class="linkbtn sm" data-a="forgot">${t('שכחתי סיסמה')}</button><span class="small">${t('נשלח מייל לאיפוס')}</span></div>
  <button class="btn go" data-a="go" type="button">${t('התחבר')}</button>`;
const consentHtml = () => t('בהתחברות הראשונה נפתח לך חשבון אוטומטית. בהתחברות אתה מאשר את {terms} ו{privacy}.', { terms: `<a href="#" data-doc="terms">${t('תנאי השימוש')}</a>`, privacy: `<a href="#" data-doc="privacy">${t('מדיניות הפרטיות')}</a>` });
function loginSheetHtml() {
  return `
    <div class="col-tight"><h3 class="h2">${t('נסיעות בענן')}</h3><p class="body">${t('התחבר כדי לשמור את הנסיעות שלך בענן ולגשת אליהן מכל מכשיר')}</p></div>
    ${emailFieldsHtml()}
    <p class="err" data-a="err" hidden></p>
    <div class="or-line"><span>${t('או')}</span></div>
    <div class="grid2"><button class="btn ghost" data-a="google" type="button">${GOOGLE_SVG}<span>Google</span></button>${hasNativeApple() ? `<button class="btn ghost" data-a="apple" type="button">${APPLE_SVG}<span>Apple</span></button>` : ''}</div>
    <p class="small center">${t('הנסיעות שלך נשמרות ב-Firebase (שרתי Google בתל אביב) ומסונכרנות לכל מכשיר שבו תתחבר.')} ${consentHtml()}</p>`;
}
function wireLogin(b, done) {
  const q = (k) => b.querySelector(`[data-a="${k}"]`);
  const err = (m) => { const e = q('err'); e.hidden = !m; e.textContent = m || ''; };
  const signedIn = (u) => { setHint(u); renderAccountRow(); done(u); };
  const busy = async (btn, fn) => { err(''); btn.disabled = true; try { await cloudUp(); await fn(); } catch (e) { err(errT(e)); } finally { btn.disabled = false; } };
  q('go').onclick = () => {
    const email = q('email').value.trim(), pass = q('pass').value;
    if (!email || !pass) return err(t('מלא אימייל וסיסמה'));
    if (pass.length < 6) return err(t('הסיסמה חייבת להכיל לפחות 6 תווים'));
    busy(q('go'), async () => { const r = await signInOrRegister(email, pass); signedIn(r.user); toast(r.created ? t('נפתח לך חשבון חדש — ברוך הבא') : t('שלום, {name} — התחברת בהצלחה', { name: firstName(r.user) })); });
  };
  q('google').onclick = () => busy(q('google'), async () => { const u = await signInGoogle(); if (u) { signedIn(u); greet(u); } else toast(t('עוברים ל-Google להתחברות…')); });
  if (q('apple')) q('apple').onclick = () => busy(q('apple'), async () => { const u = await signInApple(); if (u) { signedIn(u); greet(u); } });
  q('forgot').onclick = () => {
    const email = q('email').value.trim(); if (!email) return err(t('כתוב את האימייל שלך ואז לחץ "שכחתי סיסמה"'));
    busy(q('forgot'), async () => { await resetPassword(email); err(t('שלחנו לך מייל לאיפוס הסיסמה')); });
  };
}

// ---- מסך הפתיחה: נפתח בכל כניסה לאפליקציה כשאין משתמש מחובר ----
defineScreen('welcome', {
  render(el) {
    el.classList.add('dark-scope');
    el.innerHTML = `
      <div class="welcome">
        <div class="hero-logo"><img src="icons/icon-512.png" alt="${t('סמל מונה')}" width="112" height="112">
          <div class="meter"><div class="lcd"><span class="free" style="font-size:30px">${t('פנוי')}</span></div></div></div>
        <div class="lead"><h1 class="h1">${t('המחיר החוקי של כל נסיעה במונית')}</h1><p class="body">${t('מונה GPS חי, מחיר לפני שיוצאים, וקבלה מוכנה לתלונה. לפי צו המחירים שבתוקף.')}</p></div>
        <div class="feats"><div>${icon('meter')}<span>${t('מונה חי')}</span></div><div>${icon('calc')}<span>${t('מחיר מראש')}</span></div><div>${icon('receipt')}<span>${t('קבלה ותלונה')}</span></div></div>
        <div class="spacer"></div>
        <div class="acts">
          <div class="email-box col" id="emailBox" hidden>${emailFieldsHtml()}</div>
          <p class="err" data-a="err" hidden></p>
          <button class="btn white" data-a="google" type="button">${GOOGLE_SVG}<span>${t('המשך עם Google')}</span></button>
          ${hasNativeApple() ? `<button class="btn apple" data-a="apple" type="button">${APPLE_SVG}<span>${t('המשך עם Apple')}</span></button>` : ''}
          <div class="grid2"><button type="button" class="btn ghost" id="emailBtn" aria-expanded="false">${icon('mail', 's')}<span>${t('אימייל')}</span></button><button type="button" class="btn taxi" id="guestBtn">${t('המשך כאורח')}</button></div>
          <p class="small center">${consentHtml()} ${t('"מונה" אינה אפליקציה ממשלתית')}</p>
        </div>
      </div>`;
    wireLogin(el, () => go('home', {}, { root: true }));
    el.querySelector('#guestBtn').addEventListener('click', () => go('home', {}, { root: true }));
    el.querySelector('#emailBtn').addEventListener('click', (e) => {
      const box = el.querySelector('#emailBox'), open = box.hidden;
      box.hidden = !open; e.currentTarget.setAttribute('aria-expanded', String(open));
      if (open) setTimeout(() => box.querySelector('[data-a="email"]').focus(), 30);
    });
    cloudUp().catch(() => {});   // טוענים את Firebase מראש כדי שהכפתורים יגיבו מיד
  },
  onHide() { const el = document.querySelector('.screen[data-screen="welcome"]'); if (el) el.innerHTML = ''; },
});
function openProfile(u) {
  const pid = u.providerData[0]?.providerId;
  const rides = loadRides(), now = new Date();
  const month = rides.filter((r) => { const d = new Date(r.at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const gaps = rides.reduce((a, r) => a + (r.asked > 0 && r.asked - r.total > 0.5 ? r.asked - r.total : 0), 0);
  const av = u.photoURL ? `<span class="avatar-lg"><img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer"></span>` : `<span class="avatar-lg">${esc((firstName(u) || '?').charAt(0).toUpperCase())}</span>`;
  openSheet(t('החשבון שלי'), `
    <section class="card profile-hero">${av}<div class="col-tight center"><b class="pname">${esc(u.displayName || firstName(u) || '—')}</b><span class="small" dir="ltr">${esc(u.email || '')}</span></div>
      <span class="tag good">${icon('cloud', 's')}${t('מחובר · הנסיעות מסונכרנות')}</span><span class="small">${t('התחברות')}: ${pid === 'google.com' ? 'Google' : pid === 'apple.com' ? 'Apple' : t('אימייל וסיסמה')}</span></section>
    <section class="card stats3 center"><div class="stat"><b class="num">${rides.length}</b><span class="small">${t('נסיעות בענן')}</span></div><div class="stat"><b class="num">${month}</b><span class="small">${t('החודש')}</span></div><div class="stat"><b class="num">${nis0(gaps)}</b><span class="small">${t('פערים שנחשפו')}</span></div></section>
    <p class="small pad-x">${t('הנסיעות שלך נשמרות ב-Firebase (שרתי Google בתל אביב) ומסונכרנות לכל מכשיר שבו תתחבר.')}</p>
    <div class="list"><button type="button" class="li" id="pSettings"><span class="lead">${icon('globe')}</span><span class="main"><b>${t('שפה וערכת צבעים')}</b></span>${icon('chev', 's chev')}</button></div>
    <div class="list">
      <button type="button" class="li" id="pOut"><span class="lead">${icon('logout')}</span><span class="main"><b>${t('התנתק')}</b><span>${t('הנסיעות יישארו בענן ובמכשיר')}</span></span></button>
      <button type="button" class="li" id="pDel"><span class="lead stop">${icon('trash')}</span><span class="main"><b class="stop-text">${t('מחק חשבון')}</b><span>${t('לצמיתות, כולל כל הנסיעות בענן')}</span></span></button>
    </div>`, (b) => {
    b.querySelector('#pSettings').onclick = () => { closeSheet(true); go('settings'); };
    b.querySelector('#pOut').onclick = async () => { await signOut(); setHint(null); closeSheet(true); renderAccountRow(); go('welcome', {}, { root: true }); };
    b.querySelector('#pDel').onclick = () => openDeleteAccount(u);
  });
}
function openDeleteAccount(u) {
  const needPass = u.providerData[0]?.providerId === 'password';
  const n = loadRides().length;
  openSheet(t('מחיקת חשבון'), `
    <section class="card col danger-card">
      <div class="row"><span class="li-lead stop">${icon('trash')}</span><div class="col-tight"><b class="h3">${t('למחוק את החשבון לצמיתות?')}</b><span class="small">${t('כולל {n} נסיעות בענן. אי אפשר לשחזר.', { n })}</span></div></div>
      <p class="small">${t('המחיקה מוחקת לצמיתות את החשבון ואת כל הנסיעות השמורות בענן. הנסיעות שבמכשיר הזה יישארו רק אם תבחר להשאירן.')}</p>
      ${needPass ? `<label class="field"><span>${t('סיסמה לאישור')}</span><input id="dPass" type="password" autocomplete="current-password" dir="ltr"></label>` : `<p class="small">${t('ייתכן שתתבקש לאשר מחדש את ההתחברות עם Google.')}</p>`}
      <label class="check"><input id="dLocal" type="checkbox" checked> ${t('למחוק גם את הנסיעות שבמכשיר הזה')}</label>
      <p class="err" id="dErr" hidden></p>
      <div class="grid2"><button class="btn ghost" id="dNo" type="button">${t('ביטול')}</button><button class="btn stop hold" id="dGo" type="button"><span class="fillbar"></span><span>${t('החזק למחיקה')}</span></button></div>
    </section>`, (b) => {
    b.querySelector('#dNo').onclick = () => openProfile(u);
    wireHoldBtn(b.querySelector('#dGo'), async () => {
      const e = b.querySelector('#dErr'); e.hidden = true; b.querySelector('#dGo').disabled = true;
      try {
        await deleteAccount(needPass ? b.querySelector('#dPass').value : null);
        if (b.querySelector('#dLocal').checked) storeRides([]);
        setHint(null); closeSheet(true); renderAccountRow(); go('welcome', {}, { root: true });
        openSheet(t('החשבון נמחק'), `<p>${t('החשבון וכל הנתונים בענן נמחקו. תודה שהשתמשת ב"מונה".')}</p>`);
      } catch (err) { e.hidden = false; e.textContent = errT(err); b.querySelector('#dGo').disabled = false; }
    });
  });
}
// כפתור "החזק": לחיצה ארוכה של 1.2 שניות (במקלדת: Enter מבצע מיד)
export function wireHoldBtn(btn, done, ms = 1200) {
  let timer = 0;
  const fill = btn.querySelector('.fillbar');
  const cancel = () => { clearTimeout(timer); btn.classList.remove('holding'); if (fill) { fill.style.transition = 'width .15s'; fill.style.width = '0'; } };
  btn.addEventListener('pointerdown', (e) => {
    if (btn.disabled) return;
    e.preventDefault(); btn.setPointerCapture?.(e.pointerId); btn.classList.add('holding');
    if (fill) { fill.style.transition = `width ${ms}ms linear`; fill.style.width = '100%'; }
    timer = setTimeout(() => { cancel(); done(); }, ms);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, cancel));
  btn.addEventListener('click', (e) => { if (e.detail === 0) done(); });
}
