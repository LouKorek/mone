import { isNative, nativeGoogleCredential, nativeAppleCredential, nativeSignOut } from './native.js';
// חשבון וענן — Firebase Authentication + Cloud Firestore (פרויקט mone-taxi, נתונים ב-me-west1 תל אביב).
// נטען דינמית מ-gstatic כדי שהאפליקציה תעבוד גם בלי רשת (בלי חשבון).
// authDomain: באתר החי דף ההתחברות מוגש מהדומיין שלנו (proxy ב-netlify.toml) — כך redirect עובד גם
// בדפדפנים שחוסמים אחסון צד-שלישי. בכל מקום אחר (פיתוח/תצוגה מקדימה) — הדומיין של Firebase.
const OWN_DOMAINS = ['mone-taxi.netlify.app'];
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAZ_12dAEsw_-YfHG_0FDrF-ZXEzlrH2K8',
  authDomain: OWN_DOMAINS.includes(location.hostname) ? location.hostname : 'mone-taxi.firebaseapp.com',
  projectId: 'mone-taxi',
  storageBucket: 'mone-taxi.firebasestorage.app',
  messagingSenderId: '1036744435942',
  appId: '1:1036744435942:web:5931e7f035b611e2233327',
};
const V = '11.10.0';
const CDN = (m) => `https://www.gstatic.com/firebasejs/${V}/firebase-${m}.js`;

let fb = null;           // { auth, db, mods }
let userListeners = [];
let currentUser = null;

export async function initCloud() {
  if (fb) return fb;
  const [app, auth, fs] = await Promise.all([import(CDN('app')), import(CDN('auth')), import(CDN('firestore'))]);
  const a = app.initializeApp(FIREBASE_CONFIG);
  const authInst = auth.getAuth(a);
  await auth.setPersistence(authInst, auth.browserLocalPersistence).catch(() => {});
  fb = { auth: authInst, db: fs.getFirestore(a), A: auth, F: fs };
  auth.onAuthStateChanged(authInst, (u) => { currentUser = u; userListeners.forEach(f => f(u)); });
  try { const r = await auth.getRedirectResult(authInst); if (r?.user) { currentUser = r.user; fb.redirected = true; } }
  catch (e) { console.warn('redirect', e.code); fb.redirectError = e; }
  return fb;
}
// האם הטעינה הנוכחית היא חזרה מהתחברות Google ב-redirect (כדי להראות אישור למשתמש)
export const redirectOutcome = () => ({ user: fb?.redirected ? currentUser : null, error: fb?.redirectError || null });
export const onUser = (f) => { userListeners.push(f); if (fb) f(currentUser); };
export const getUser = () => currentUser;

export async function signUpEmail(email, password, name) {
  const { A, auth } = await initCloud();
  const cred = await A.createUserWithEmailAndPassword(auth, email, password);
  if (name) await A.updateProfile(cred.user, { displayName: name });
  return cred.user;
}
// התחברות אחת: אם אין עדיין חשבון לאימייל — נוצר אוטומטית באותה לחיצה.
export async function signInOrRegister(email, password) {
  const { A, auth } = await initCloud();
  try { return { user: (await A.signInWithEmailAndPassword(auth, email, password)).user, created: false }; }
  catch (e) {
    if (!['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(e.code)) throw e;
    try {
      const cred = await A.createUserWithEmailAndPassword(auth, email, password);
      await A.updateProfile(cred.user, { displayName: email.split('@')[0] }).catch(() => {});
      return { user: cred.user, created: true };
    } catch (e2) {
      if (e2.code === 'auth/email-already-in-use') { const err = new Error('wrong password'); err.code = 'auth/wrong-password'; throw err; }
      throw e2;
    }
  }
}
export async function resetPassword(email) { const { A, auth } = await initCloud(); await A.sendPasswordResetEmail(auth, email); }
export async function signInGoogle() {
  const { A, auth } = await initCloud();
  if (isNative()) {   // אפליקציה מותקנת: חלון Google של המערכת, ואז כניסה ל-Firebase עם ה-token
    const c = await nativeGoogleCredential();
    return (await A.signInWithCredential(auth, A.GoogleAuthProvider.credential(c.idToken, c.accessToken || undefined))).user;
  }
  const provider = new A.GoogleAuthProvider();
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return A.signInWithRedirect(auth, provider);   // באפליקציה מותקנת חלון קופץ לא תמיד חוזר
  try { return (await A.signInWithPopup(auth, provider)).user; }
  catch (e) { if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') return A.signInWithRedirect(auth, provider); throw e; }
}
export async function signInApple() {
  const { A, auth } = await initCloud();
  const provider = new A.OAuthProvider('apple.com'); provider.addScope('email'); provider.addScope('name');
  if (isNative()) {
    const c = await nativeAppleCredential();
    const cred = provider.credential({ idToken: c.idToken, rawNonce: c.nonce });
    const u = (await A.signInWithCredential(auth, cred)).user;
    if (c.displayName && !u.displayName) await A.updateProfile(u, { displayName: c.displayName }).catch(() => {});
    return u;
  }
  try { return (await A.signInWithPopup(auth, provider)).user; }
  catch (e) { if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') return A.signInWithRedirect(auth, provider); throw e; }
}
export async function signOut() { const { A, auth } = await initCloud(); await A.signOut(auth); if (isNative()) await nativeSignOut(); }

// ---- נסיעות בענן: users/{uid}/rides/{id} ----
export async function pushRides(rides) {
  const { F, db } = await initCloud(); const u = currentUser; if (!u) return;
  const batch = F.writeBatch(db);
  rides.forEach(r => batch.set(F.doc(db, 'users', u.uid, 'rides', String(r.id)), { ...r, updatedAt: Date.now() }, { merge: true }));
  await batch.commit();
}
export async function pullRides() {
  const { F, db } = await initCloud(); const u = currentUser; if (!u) return [];
  const snap = await F.getDocs(F.query(F.collection(db, 'users', u.uid, 'rides'), F.orderBy('at', 'desc'), F.limit(200)));
  return snap.docs.map(d => d.data());
}
export async function deleteRideCloud(id) {
  const { F, db } = await initCloud(); const u = currentUser; if (!u) return;
  await F.deleteDoc(F.doc(db, 'users', u.uid, 'rides', String(id)));
}

// ---- מחיקת חשבון: קודם כל הנתונים, אחר כך המשתמש (דרישת Apple ו-Google Play) ----
export async function deleteAccount(password) {
  const { A, F, db, auth } = await initCloud(); const u = currentUser; if (!u) return;
  const reauth = async () => {
    const pid = u.providerData[0]?.providerId;
    if (pid === 'password' && password) await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, password));
    else if (pid === 'google.com') {
      if (isNative()) { const c = await nativeGoogleCredential(); await A.reauthenticateWithCredential(u, A.GoogleAuthProvider.credential(c.idToken)); }
      else await A.reauthenticateWithPopup(u, new A.GoogleAuthProvider());
    } else if (pid === 'apple.com') {
      const p = new A.OAuthProvider('apple.com');
      if (isNative()) { const c = await nativeAppleCredential(); await A.reauthenticateWithCredential(u, p.credential({ idToken: c.idToken, rawNonce: c.nonce })); }
      else await A.reauthenticateWithPopup(u, p);
    }
  };
  const wipe = async () => {
    const snap = await F.getDocs(F.collection(db, 'users', u.uid, 'rides'));
    const batch = F.writeBatch(db); snap.docs.forEach(d => batch.delete(d.ref)); batch.delete(F.doc(db, 'users', u.uid)); await batch.commit();
  };
  try { await wipe(); await A.deleteUser(u); }
  catch (e) {
    if (e.code === 'auth/requires-recent-login') { await reauth(); await wipe(); await A.deleteUser(u); }
    else throw e;
  }
}

export const errorHe = (e) => ({
  'auth/invalid-email': 'כתובת האימייל לא תקינה',
  'auth/user-not-found': 'לא נמצא חשבון עם האימייל הזה',
  'auth/wrong-password': 'סיסמה שגויה',
  'auth/invalid-credential': 'אימייל או סיסמה שגויים',
  'auth/email-already-in-use': 'כבר קיים חשבון עם האימייל הזה — נסה להתחבר',
  'auth/weak-password': 'הסיסמה חייבת להכיל לפחות 6 תווים',
  'auth/too-many-requests': 'יותר מדי ניסיונות — נסה שוב בעוד כמה דקות',
  'auth/network-request-failed': 'אין חיבור לאינטרנט',
  'auth/popup-closed-by-user': 'החלון נסגר לפני סיום ההתחברות',
  'auth/requires-recent-login': 'לביטחונך, התחבר מחדש ואז נסה שוב',
  'auth/account-exists-with-different-credential': 'האימייל הזה כבר רשום בדרך התחברות אחרת',
  'native/no-plugin': 'ההתחברות הזו לא זמינה בגרסה הזו',
}[e?.code] || (e?.message ? 'שגיאה: ' + e.message : 'משהו השתבש, נסה שוב'));
