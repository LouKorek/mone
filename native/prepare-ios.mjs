// מכין את פרויקט ה-iOS שנוצר על ידי `npx cap add ios`:
// GoogleService-Info.plist, הרשאת מיקום בעברית, סכמת URL ל-Google Sign-In, Sign in with Apple, גרסה ומספר build.
// מריצים אחרי `npx cap add ios` ולפני `npx cap sync ios`.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ios = resolve(root, 'ios/App');
if (!existsSync(ios)) { console.error('ios/ לא קיים — הרץ קודם: npx cap add ios'); process.exit(1); }

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const versionName = pkg.version;
const buildNumber = Number(process.env.IOS_BUILD_NUMBER || 1);
const edit = (rel, fn) => { const p = resolve(ios, rel); const before = readFileSync(p, 'utf8'); const after = fn(before); if (after !== before) { writeFileSync(p, after); console.log('עודכן', rel); } };
const plistInsert = (s, xml) => s.replace(/<\/dict>\s*<\/plist>\s*$/, xml + '\n</dict>\n</plist>\n');

// 1) GoogleService-Info.plist (רישום האפליקציה ב-Firebase)
const gsp = resolve(root, 'native/GoogleService-Info.plist');
let reversedClientId = null;
if (existsSync(gsp)) {
  copyFileSync(gsp, resolve(ios, 'App/GoogleService-Info.plist'));
  reversedClientId = (readFileSync(gsp, 'utf8').match(/<key>REVERSED_CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/) || [])[1] || null;
  console.log('הועתק GoogleService-Info.plist');
}

// 2) Info.plist: שם, עברית, מיקום, סכמת URL, ללא הצפנה מיוחדת (חוסך שאלת export compliance)
edit('App/Info.plist', (s) => {
  let add = '';
  if (!s.includes('NSLocationWhenInUseUsageDescription')) add += `
	<key>NSLocationWhenInUseUsageDescription</key>
	<string>מונה משתמשת במיקום כדי למדוד את מרחק הנסיעה ולהציג את המסלול על המפה בזמן הנסיעה.</string>`;
  if (!s.includes('ITSAppUsesNonExemptEncryption')) add += `
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>`;
  if (!s.includes('CFBundleLocalizations')) add += `
	<key>CFBundleLocalizations</key>
	<array><string>he</string></array>`;
  if (reversedClientId && !s.includes(reversedClientId)) add += `
	<key>CFBundleURLTypes</key>
	<array><dict><key>CFBundleURLSchemes</key><array><string>${reversedClientId}</string></array></dict></array>`;
  s = s.replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleDisplayName</key>\n\t<string>מונה</string>');
  s = s.replace(/<key>CFBundleDevelopmentRegion<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleDevelopmentRegion</key>\n\t<string>he</string>');
  return add ? plistInsert(s, add) : s;
});

// 3) Sign in with Apple: קובץ entitlements + חיבור בפרויקט
const ent = resolve(ios, 'App/App.entitlements');
if (!existsSync(ent)) {
  writeFileSync(ent, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.applesignin</key>
	<array><string>Default</string></array>
</dict>
</plist>
`);
  console.log('נוצר App.entitlements');
}
edit('App.xcodeproj/project.pbxproj', (s) => {
  if (!s.includes('CODE_SIGN_ENTITLEMENTS')) s = s.replace(/(PRODUCT_BUNDLE_IDENTIFIER = [^;]+;)/g, '$1\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;');
  s = s.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${versionName};`).replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`);
  // 3b) GoogleService-Info.plist חייב להיכלל ב-bundle (Firebase Auth), אז מוסיפים אותו לפרויקט: קובץ + קבוצת App + שלב Resources
  if (reversedClientId && !s.includes('GoogleService-Info.plist')) {
    const fileRef = 'F1A0B2C3D4E5000000000001', buildFile = 'F1A0B2C3D4E5000000000002';
    s = s.replace('/* Begin PBXBuildFile section */\n', `/* Begin PBXBuildFile section */\n\t\t${buildFile} /* GoogleService-Info.plist in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRef} /* GoogleService-Info.plist */; };\n`);
    s = s.replace('/* Begin PBXFileReference section */\n', `/* Begin PBXFileReference section */\n\t\t${fileRef} /* GoogleService-Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = "GoogleService-Info.plist"; sourceTree = "<group>"; };\n`);
    const groupIdx = s.indexOf('path = App;');
    const childrenIdx = groupIdx > 0 ? s.lastIndexOf('children = (', groupIdx) : -1;
    if (childrenIdx < 0) { console.error('לא נמצאה קבוצת App ב-project.pbxproj'); process.exit(2); }
    const insertAt = s.indexOf('\n', childrenIdx) + 1;
    s = s.slice(0, insertAt) + `\t\t\t\t${fileRef} /* GoogleService-Info.plist */,\n` + s.slice(insertAt);
    const resIdx = s.indexOf('isa = PBXResourcesBuildPhase;');
    const filesIdx = resIdx > 0 ? s.indexOf('files = (', resIdx) : -1;
    if (filesIdx < 0) { console.error('לא נמצא שלב Resources ב-project.pbxproj'); process.exit(2); }
    const insertAt2 = s.indexOf('\n', filesIdx) + 1;
    s = s.slice(0, insertAt2) + `\t\t\t\t${buildFile} /* GoogleService-Info.plist in Resources */,\n` + s.slice(insertAt2);
    console.log('GoogleService-Info.plist נוסף לפרויקט Xcode');
  }
  return s;
});

// 4) Podfile: Google Sign-In עבור @capacitor-firebase/authentication
if (!existsSync(resolve(ios, 'Podfile'))) { console.error('אין Podfile — הפרויקט נוצר עם SPM. הרץ: npx cap add ios --packagemanager CocoaPods'); process.exit(3); }
edit('Podfile', (s) => {
  if (s.includes('CapacitorFirebaseAuthentication/Google')) return s;
  return s.replace(/(target 'App' do\s*\n\s*capacitor_pods)/, `$1\n  pod 'CapacitorFirebaseAuthentication/Google', :path => '../../node_modules/@capacitor-firebase/authentication'`);
});

console.log(`מוכן: גרסה ${versionName} (build ${buildNumber})`);
