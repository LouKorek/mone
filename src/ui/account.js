// חשבון וסנכרון ענן (Firebase): התחברות, פרופיל, מחיקת חשבון, ומיזוג הנסיעות בין המכשיר לענן.
import { t } from '../i18n.js';
import { initCloud, onUser, getUser, redirectOutcome, signInOrRegister, resetPassword, signInGoogle, signInApple, signOut, pushRides, pullRides, deleteRideCloud, deleteAccount, errorHe } from '../cloud.js';
import { hasNativeApple } from '../native.js';
import { loadRides, storeRides, subscribe, emit } from '../store.js';
import { esc, icon, toast, openSheet as openSheetRaw, closeSheet, sheetOpen, sheetDepth, defineScreen, go, currentScreen } from './dom.js';

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
  openSheet(t('התחברות'), loginHtml(true), (b) => wireLogin(b, (u) => openProfile(u)));
}

// טופס ההתחברות: משותף לגיליון החשבון ולמסך הפתיחה
const GOOGLE_SVG = '<svg class="gicon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4 5.6-4z"/></svg>';
function loginHtml(emailOpen) {
  return `
    <button class="btn google" data-a="google" type="button">${GOOGLE_SVG} ${t('המשך עם Google')}</button>
    ${hasNativeApple() ? `<button class="btn apple" data-a="apple" type="button"> ${t('המשך עם Apple')}</button>` : ''}
    <details class="email-login"${emailOpen ? ' open' : ''}>${emailOpen ? `<summary class="or"><span>${t('או באימייל')}</span></summary>` : `<summary class="btn google">${t('המשך עם אימייל')}</summary>`}
      <div class="email-fields">
        <label class="field"><span>${t('אימייל')}</span><input data-a="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" dir="ltr"></label>
        <label class="field"><span>${t('סיסמה')}</span><input data-a="pass" type="password" autocomplete="current-password" placeholder="${t('6 תווים לפחות')}" dir="ltr"></label>
        <button class="btn ghost" data-a="go" type="button">${t('התחבר')}</button>
        <button type="button" class="linkbtn" data-a="forgot">${t('שכחתי סיסמה')}</button>
      </div>
    </details>
    <p class="err" data-a="err" hidden></p>
    <p class="note">${t('בהתחברות הראשונה נפתח לך חשבון אוטומטית. בהתחברות אתה מאשר את {terms} ו{privacy}.', { terms: `<a href="#" data-doc="terms">${t('תנאי השימוש')}</a>`, privacy: `<a href="#" data-doc="privacy">${t('מדיניות הפרטיות')}</a>` })}</p>`;
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
    el.innerHTML = `
      <div class="welcome">
        <div class="welcome-brand"><img src="icons/logo-96.png" alt="" width="88" height="88"><h1 class="wordmark">${t('מונה')}</h1><p>${t('המחיר החוקי של כל נסיעה במונית')}</p></div>
        <div class="welcome-card card">
          <p class="lead">${t('התחבר כדי לשמור את הנסיעות שלך בענן ולגשת אליהן מכל מכשיר')}</p>
          ${loginHtml(false)}
        </div>
        <button type="button" class="btn ghost guest" id="guestBtn">${t('המשך כאורח')}</button>
        <p class="note center">${t('אפשר להתחבר בכל רגע מכפתור הפרופיל')}</p>
      </div>`;
    wireLogin(el, () => go('home', {}, { root: true }));
    el.querySelector('#guestBtn').addEventListener('click', () => go('home', {}, { root: true }));
    cloudUp().catch(() => {});   // טוענים את Firebase מראש כדי שהכפתורים יגיבו מיד
  },
  onHide() { const el = document.querySelector('.screen[data-screen="welcome"]'); if (el) el.innerHTML = ''; },
});
function openProfile(u) {
  const pid = u.providerData[0]?.providerId;
  openSheet(t('החשבון שלי'), `
    <dl class="kv"><dt>${t('שם')}</dt><dd>${esc(u.displayName || '—')}</dd><dt>${t('אימייל')}</dt><dd>${esc(u.email || '—')}</dd><dt>${t('התחברות')}</dt><dd>${pid === 'google.com' ? 'Google' : pid === 'apple.com' ? 'Apple' : t('אימייל וסיסמה')}</dd><dt>${t('נסיעות בענן')}</dt><dd>${loadRides().length}</dd></dl>
    <p class="note">${t('הנסיעות שלך נשמרות ב-Firebase (שרתי Google בתל אביב) ומסונכרנות לכל מכשיר שבו תתחבר.')}</p>
    <div class="actions"><button class="btn ghost" id="pOut" type="button">${t('התנתק')}</button><button class="btn ghost danger" id="pDel" type="button">${t('מחק חשבון')}</button></div>`, (b) => {
    b.querySelector('#pOut').onclick = async () => { await signOut(); setHint(null); closeSheet(true); renderAccountRow(); go('welcome', {}, { root: true }); };
    b.querySelector('#pDel').onclick = () => openDeleteAccount(u);
  });
}
function openDeleteAccount(u) {
  const needPass = u.providerData[0]?.providerId === 'password';
  openSheet(t('מחיקת חשבון'), `
    <p>${t('המחיקה מוחקת לצמיתות את החשבון ואת כל הנסיעות השמורות בענן. הנסיעות שבמכשיר הזה יישארו רק אם תבחר להשאירן.')}</p>
    ${needPass ? `<label class="field"><span>${t('סיסמה לאישור')}</span><input id="dPass" type="password" autocomplete="current-password" dir="ltr"></label>` : `<p class="note">${t('ייתכן שתתבקש לאשר מחדש את ההתחברות עם Google.')}</p>`}
    <label class="check"><input id="dLocal" type="checkbox" checked> ${t('למחוק גם את הנסיעות שבמכשיר הזה')}</label>
    <p class="err" id="dErr" hidden></p>
    <div class="actions"><button class="btn danger" id="dGo" type="button">${t('מחק לצמיתות')}</button><button class="btn ghost" id="dNo" type="button">${t('ביטול')}</button></div>`, (b) => {
    b.querySelector('#dNo').onclick = () => openProfile(u);
    b.querySelector('#dGo').onclick = async () => {
      const e = b.querySelector('#dErr'); e.hidden = true; b.querySelector('#dGo').disabled = true;
      try {
        await deleteAccount(needPass ? b.querySelector('#dPass').value : null);
        if (b.querySelector('#dLocal').checked) storeRides([]);
        setHint(null); closeSheet(true); renderAccountRow(); go('welcome', {}, { root: true });
        openSheet(t('החשבון נמחק'), `<p>${t('החשבון וכל הנתונים בענן נמחקו. תודה שהשתמשת ב"מונה".')}</p>`);
      } catch (err) { e.hidden = false; e.textContent = errT(err); b.querySelector('#dGo').disabled = false; }
    };
  });
}

