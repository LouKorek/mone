// מכין את פרויקט ה-Android שנוצר על ידי `npx cap add android`:
// google-services.json, הרשאות מיקום, Google Sign-In, מספר גרסה וחתימה (אם יש מפתח).
// מריצים אחרי `npx cap add android` ולפני `npx cap sync android`.
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const android = resolve(root, 'android');
if (!existsSync(android)) { console.error('android/ לא קיים — הרץ קודם: npx cap add android'); process.exit(1); }

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const versionName = pkg.version;
const versionCode = Number(process.env.ANDROID_VERSION_CODE || 1);
const edit = (rel, fn) => { const p = resolve(android, rel); const before = readFileSync(p, 'utf8'); const after = fn(before); if (after !== before) { writeFileSync(p, after); console.log('עודכן', rel); } };

// 1) google-services.json (רישום האפליקציה ב-Firebase — פרויקט mone-taxi)
const gs = resolve(root, 'native/google-services.json');
if (existsSync(gs)) { copyFileSync(gs, resolve(android, 'app/google-services.json')); console.log('הועתק google-services.json'); }

// 2) build.gradle (root): ודא שיש classpath ל-google-services
edit('build.gradle', (s) => {
  if (/com\.google\.gms:google-services/.test(s)) return s;
  return s.replace(/(classpath\s+['"]com\.android\.tools\.build:gradle[^\n]*\n)/, `$1        classpath 'com.google.gms:google-services:4.4.2'\n`);
});

// 3) app/build.gradle: הפעלת google-services אם חסר, גרסה, וחתימה
edit('app/build.gradle', (s) => {
  if (!/com\.google\.gms\.google-services/.test(s)) s += `\napply plugin: 'com.google.gms.google-services'\n`;
  s = s.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
  if (process.env.ANDROID_KEYSTORE_BASE64 && !/signingConfigs\s*\{/.test(s)) {
    // מפענחים את המפתח (מסירים רווחים/שורות שנוספו בהדבקה) ובודקים שזה באמת keystore
    const b64 = process.env.ANDROID_KEYSTORE_BASE64.replace(/[^A-Za-z0-9+/=]/g, '');
    const ks = Buffer.from(b64, 'base64');
    const head = ks.subarray(0, 4).toString('hex');
    const looksPkcs12 = head.startsWith('3082'), looksJks = head === 'feedfeed';
    console.log(`keystore: ${ks.length} bytes, header ${head} (${looksPkcs12 ? 'PKCS12' : looksJks ? 'JKS' : 'לא מזוהה'})`);
    if (!looksPkcs12 && !looksJks) {
      console.error('ANDROID_KEYSTORE_BASE64 לא מפוענח לקובץ keystore תקין. צור מחדש: [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\\mone-upload.jks")) והדבק כערך ה-Secret.');
      process.exit(2);
    }
    writeFileSync(resolve(android, 'app/release.keystore'), ks);
    // הסיסמאות: מנקים רווחים/שורות שנוספו בהדבקה, ובודקים מראש שהן פותחות את המפתח
    const storePassword = (process.env.ANDROID_KEYSTORE_PASSWORD || '').trim();
    const keyAlias = (process.env.ANDROID_KEY_ALIAS || 'mone').trim();
    const keyPassword = (process.env.ANDROID_KEY_PASSWORD || storePassword).trim();
    const opens = (pw) => { try { execFileSync('keytool', ['-list', '-keystore', resolve(android, 'app/release.keystore'), '-storepass', pw], { stdio: 'pipe' }); return true; } catch { return false; } };
    if (!storePassword || !opens(storePassword)) {
      console.error(opens('SECRET')
        ? 'ANDROID_KEYSTORE_PASSWORD לא תואם: המפתח עדיין מוגן בסיסמה SECRET — פקודת keytool -storepasswd לא בוצעה, או שהודבק המפתח הישן.'
        : `ANDROID_KEYSTORE_PASSWORD (${storePassword.length} תווים) לא פותח את המפתח. בדוק את הסיסמה ב-Secrets.`);
      process.exit(3);
    }
    console.log('סיסמת המפתח אומתה');
    writeFileSync(resolve(android, 'keystore.properties'), `storePassword=${storePassword}\nkeyAlias=${keyAlias}\nkeyPassword=${keyPassword}\n`);
    s = s.replace(/android\s*\{/, `def ksProps = new Properties()
ksProps.load(new FileInputStream(rootProject.file('keystore.properties')))
android {
    signingConfigs {
        release {
            storeFile file('release.keystore')
            storePassword ksProps['storePassword']
            keyAlias ksProps['keyAlias']
            keyPassword ksProps['keyPassword']
        }
    }`);
    s = s.replace(/buildTypes\s*\{\s*release\s*\{/, `buildTypes {\n        debug {\n            signingConfig signingConfigs.release\n        }\n        release {\n            signingConfig signingConfigs.release`);
    console.log('הוגדרה חתימת release');
  }
  return s;
});

// 4) variables.gradle: Google Sign-In עבור @capacitor-firebase/authentication
edit('variables.gradle', (s) => {
  if (/rgcfaIncludeGoogle/.test(s)) return s;
  return s.replace(/ext\s*\{/, `ext {\n    rgcfaIncludeGoogle = true\n    androidxCredentialsVersion = '1.3.0'`);
});

// 5) AndroidManifest.xml: מיקום (למונה החי) + GPS לא חובה
edit('app/src/main/AndroidManifest.xml', (s) => {
  const perms = ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION', 'android.permission.WAKE_LOCK'];
  let add = perms.filter(p => !s.includes(p)).map(p => `    <uses-permission android:name="${p}" />`).join('\n');
  if (!s.includes('android.hardware.location.gps')) add += `\n    <uses-feature android:name="android.hardware.location.gps" android:required="false" />`;
  return add.trim() ? s.replace(/<\/manifest>/, add + '\n</manifest>') : s;
});

// 6) שם האפליקציה בעברית
edit('app/src/main/res/values/strings.xml', (s) => s.replace(/<string name="app_name">[^<]*<\/string>/, '<string name="app_name">מונה</string>').replace(/<string name="title_activity_main">[^<]*<\/string>/, '<string name="title_activity_main">מונה</string>'));

mkdirSync(resolve(android, 'app/src/main/res/values'), { recursive: true });
console.log(`מוכן: גרסה ${versionName} (${versionCode})`);
