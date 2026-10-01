// המסמכים המשפטיים של "מונה" — מקור אחד לאפליקציה (גיליון) ולעמודים הציבוריים (legal/*.html).
// מפעיל: לו קורק · lou.korek@gmail.com · עודכן: 2.10.2026
export const LEGAL_META = { operator: 'לו קורק', email: 'lou.korek@gmail.com', updated: '2 באוקטובר 2026', app: 'מונה', site: 'https://mone-taxi.netlify.app' };

export const DOCS = {
  terms: {
    title: 'תנאי שימוש',
    intro: 'ברוכים הבאים ל"מונה". השימוש באפליקציה ובאתר (יחד: "השירות") כפוף לתנאים אלה. אם אינך מסכים להם, אנא אל תשתמש בשירות.',
    sections: [
      ['מי מפעיל את השירות', `השירות מופעל על ידי ${LEGAL_META.operator} (להלן "המפעיל"), כתובת לפניות: ${LEGAL_META.email}. השירות ניתן ללא תשלום.`],
      ['מה השירות עושה — ומה לא', `"מונה" מחשבת הערכה של המחיר המרבי המותר לנסיעה במונית מיוחדת ("ספיישל") בישראל, לפי צו פיקוח על מחירי מצרכים ושירותים (מחירי נסיעה במוניות), התשע"ח–2018, כפי שתוקן מעת לעת, ולפי תקנות התעבורה. החישוב הוא הערכה בלבד: המונה המכויל שבמונית הוא הקובע על פי דין. מדידת מרחק וזמן באמצעות ה-GPS של הטלפון עשויה לסטות מהמונה, בפרט באזורים צפופים או במנהרות. תוספות שמזוהות אוטומטית (יציאה משדה תעופה, כביש 6, מנהרות הכרמל) הן עזר בלבד ועלולות לטעות; תמיד אפשר לבטל אותן. המידע בשירות אינו ייעוץ משפטי, ואינו תחליף לפנייה לגורם מוסמך.`],
      ['עדכון תעריפים', 'התעריפים מתעדכנים בדרך כלל ב-1 באפריל בכל שנה, לאחר פרסום ברשומות. המפעיל מעדכן את השירות בסמוך לפרסום, אך ייתכן פער זמן שבו יוצגו תעריפים שאינם עדכניים. תאריך התעריפים המוצגים מופיע בשירות.'],
      ['חשבון משתמש', 'פתיחת חשבון אפשרית באמצעות כתובת אימייל וסיסמה, חשבון Google או (באייפון) Apple. אתה אחראי לשמירת סודיות פרטי ההתחברות ולכל פעולה בחשבונך. השירות מיועד למשתמשים מגיל 16 ומעלה; משתמש צעיר יותר רשאי להשתמש בו רק באישור הורה או אפוטרופוס. אפשר למחוק את החשבון בכל עת מתוך השירות (עוד ← החשבון שלי ← מחק חשבון).'],
      ['שימוש מותר', 'אין להשתמש בשירות באופן המפר דין, לפגוע בפעילותו, לנסות לעקוף את מנגנוני האבטחה, להתחזות לאחר, או להעתיק ולהפיץ חלקים ממנו ללא רשות. "קבלת הנסיעה" שהשירות מפיק היא מסמך עזר להשוואה בלבד; היא אינה חשבונית מס, אינה קבלה רשמית ואינה מסמך מטעם המונית או משרד התחבורה, ואין להציגה ככזו.'],
      ['תלונות על נהגים', 'השירות מסייע לך לנסח תלונה למשרד התחבורה על בסיס הנתונים שהזנת ושנמדדו. האחריות לנכונות התלונה ולהגשתה היא שלך בלבד. מומלץ לצרף לתלונה קבלה מודפסת מהמונה ולהגישה בתוך חודשיים מהאירוע, כנדרש על ידי משרד התחבורה.'],
      ['קניין רוחני', 'הקוד, העיצוב, הלוגו והתכנים בשירות הם קניינו של המפעיל. המפות מבוססות על נתוני OpenStreetMap (© OpenStreetMap contributors, רישיון ODbL). נוסח הצו ותקנות התעבורה הם מסמכים רשמיים ואינם בבעלות המפעיל.'],
      ['הגבלת אחריות', 'השירות ניתן כמות שהוא (AS IS). המפעיל אינו מתחייב שהשירות יהיה זמין בכל עת, נטול שגיאות או מדויק לחלוטין, ולא יישא באחריות לכל נזק ישיר או עקיף הנובע מהסתמכות על החישוב, לרבות תשלום ביתר או בחסר לנהג, או ממחלוקת עם נהג או חברת מוניות.'],
      ['שינויים והפסקת השירות', 'המפעיל רשאי לשנות את השירות, את התנאים ואת מדיניות הפרטיות, או להפסיק את השירות, בכל עת. שינוי מהותי בתנאים יוצג בשירות. המשך השימוש לאחר השינוי מהווה הסכמה לו.'],
      ['דין וסמכות שיפוט', 'על תנאים אלה יחול הדין הישראלי בלבד. סמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים במחוז תל אביב–יפו.'],
      ['יצירת קשר', `לכל שאלה: ${LEGAL_META.email}.`],
    ],
  },
  privacy: {
    title: 'מדיניות פרטיות',
    intro: 'מדיניות זו מסבירה איזה מידע "מונה" אוספת, למה, איפה הוא נשמר ומה הזכויות שלך — בהתאם לחוק הגנת הפרטיות, התשמ"א–1981 (כולל תיקון 13) והתקנות מכוחו. הודעה זו נמסרת לך לפי סעיף 11 לחוק לפני איסוף המידע.',
    sections: [
      ['מי אחראי על המידע', `בעל השליטה במידע הוא ${LEGAL_META.operator}, ${LEGAL_META.email}. מסירת המידע אינה חובה על פי דין; היא נדרשת כדי לספק את השירות, ובחלקה (חשבון וסנכרון) היא רשות.`],
      ['איזה מידע נאסף', `<b>בלי חשבון:</b> כל הנתונים נשמרים במכשיר שלך בלבד ואינם נשלחים למפעיל.<br><b>עם חשבון:</b> (1) פרטי חשבון — כתובת אימייל, שם (כפי שמתקבל מ-Google או נגזר מהאימייל) ומזהה משתמש; (2) נסיעות — תאריך ושעה, מרחק, משך, נקודות ציון של מסלול הנסיעה (GPS), התוספות שבחרת, סכומי החישוב, ומה שהזנת ידנית: מספר המונית, שם הנהג והסכום שהנהג ביקש; (3) מידע טכני שמערכת Firebase של Google שומרת לצורכי אבטחה — כתובת IP וזמני התחברות.<br>אין בשירות Google Analytics, פרסומות, פיקסלים או עוגיות מעקב.`],
      ['מיקום', 'המיקום נאסף רק לאחר שאישרת את ההרשאה, ורק בשני מקרים: בזמן נסיעה פעילה ב"מונה חי" (למדידת המרחק, להצגת המסלול ולזיהוי אוטומטי של תוספות כמו יציאה משדה תעופה, כביש 6 או מנהרות הכרמל – הזיהוי מתבצע במכשיר עצמו), וכשאתה לוחץ במחשבון על "המיקום הנוכחי שלי" (מיקום חד-פעמי כנקודת מוצא). השירות אינו אוסף מיקום ברקע כשהאפליקציה סגורה. אפשר לבטל את ההרשאה בכל עת בהגדרות המכשיר; המחשבון ממשיך לעבוד גם בלי מיקום.'],
      ['חישוב מסלול (מוצא ויעד)', 'כשאתה מקליד מוצא ויעד במחשבון, הטקסט שהקלדת (וכשביקשת — המיקום הנוכחי שלך, או מיקום הנסיעה הפעילה לשיפור ההצעות) נשלח דרך השרת של "מונה" (Netlify) אל Google Maps Platform, לצורך השלמת כתובות וחישוב המרחק וזמן הנסיעה. המידע הזה לא נשמר אצל המפעיל ואינו משויך לחשבון שלך; Google מעבדת אותו לפי תנאי Google Maps Platform ומדיניות הפרטיות של Google. כתובות שבחרת לאחרונה, ו"בית" ו"עבודה" אם שמרת, נשמרות במכשיר שלך בלבד ואינן נשלחות למפעיל.'],
      ['למה משתמשים במידע', 'כדי לחשב את מחיר הנסיעה, להציג את המסלול, לשמור את הנסיעות שלך ולסנכרן אותן בין המכשירים שלך, לאפשר התחברות ולאבטח את החשבון, ולענות לפניותיך. הבסיס לעיבוד הוא הסכמתך והצורך במתן השירות שביקשת. המידע אינו נמכר, אינו מועבר לצדדים שלישיים למטרות שיווק, ואינו משמש לפרופיילינג.'],
      ['איפה המידע נשמר והעברה לחו"ל', 'הנסיעות נשמרות ב-Cloud Firestore של Google בשרתים באזור תל אביב (me-west1), בישראל. פרטי החשבון מנוהלים ב-Firebase Authentication של Google, ששרתיו עשויים להיות מחוץ לישראל (בעיקר בארצות הברית). ההעברה נעשית בהתאם לתקנות הגנת הפרטיות (העברת מידע אל מאגרי מידע שמחוץ לגבולות המדינה), על בסיס התחייבות Google לתנאי עיבוד מידע ולרמת הגנה נאותה.'],
      ['ספקים שמעורבים במתן השירות', 'Google (Firebase — אימות ומסד נתונים; Google Maps Platform — השלמת כתובות וחישוב מסלול); Netlify (אירוח האתר ושרת המסלולים); OpenStreetMap (אריחי מפה — כשהמפה נטענת, שרתי OSM מקבלים את כתובת ה-IP שלך ואת אזור המפה שביקשת); Google Fonts (גופנים). ספקים אלה מעבדים מידע רק לצורך מתן השירות ובהתאם לתנאיהם.'],
      ['כמה זמן שומרים', 'כל עוד החשבון שלך פעיל. כשאתה מוחק נסיעה או את החשבון, המידע נמחק ממסד הנתונים מיד, ומגיבויים בתוך 30 יום לכל היותר. נתונים ללא חשבון נשמרים במכשיר עד שתמחק אותם או את האפליקציה.'],
      ['הזכויות שלך', `אתה זכאי לעיין במידע שנשמר עליך, לבקש לתקנו או למחקו, ולבטל את הסכמתך. את רוב הפעולות אפשר לבצע לבד: עריכה ומחיקה של נסיעות בלשונית "נסיעות", ומחיקת החשבון וכל המידע ב"עוד ← החשבון שלי ← מחק חשבון". לכל בקשה אחרת כתוב ל-${LEGAL_META.email} — נענה בתוך 30 יום. אם לדעתך זכויותיך נפגעו, אפשר לפנות גם לרשות להגנת הפרטיות.`],
      ['אבטחת מידע', 'המידע מוצפן בתעבורה (HTTPS) ובאחסון. הגישה לנסיעות מוגבלת בכללי אבטחה כך שרק המשתמש המחובר יכול לקרוא ולכתוב את המידע שלו. המפעיל אינו רואה סיסמאות; הן מנוהלות על ידי Firebase. אף מערכת אינה חסינה לחלוטין, ולכן מומלץ לבחור סיסמה ייחודית.'],
      ['קטינים', 'השירות מיועד לבני 16 ומעלה. איננו אוספים ביודעין מידע מילדים מתחת לגיל 14; אם נודע לנו על מידע כזה, נמחק אותו.'],
      ['רישום מאגר', 'ככל שהדין מחייב רישום של מאגר המידע בפנקס מאגרי המידע, הרישום יבוצע. המידע הנשמר אינו כולל מידע רגיש במיוחד כהגדרתו בחוק, למעט נתוני מיקום שנאספים בהסכמתך המפורשת בזמן נסיעה.'],
      ['שינויים במדיניות', `מדיניות זו עודכנה לאחרונה ב-${LEGAL_META.updated}. שינוי מהותי יוצג בשירות לפני כניסתו לתוקף.`],
    ],
  },
  accessibility: {
    title: 'הצהרת נגישות',
    intro: '"מונה" מחויבת לאפשר לכל אדם, לרבות אנשים עם מוגבלות, להשתמש בשירות בקלות ובנוחות. ההצהרה נמסרת לפי תקנה 35 לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג–2013.',
    sections: [
      ['רמת הנגישות', 'השירות תוכנן לעמוד בדרישות תקן ישראלי 5568 (הנגשת תכנים באינטרנט) ברמה AA, המבוסס על הנחיות WCAG 2.0, ובשאיפה ל-WCAG 2.1 AA. ההצהרה מבוססת על בדיקה עצמית של המפעיל; לא בוצעה בדיקה חיצונית מוסמכת.'],
      ['מה הונגש', 'ניווט מלא במקלדת (Tab, Enter, Escape לסגירת חלונות) עם סימון פוקוס ברור; תמיכה בקוראי מסך — כל הכפתורים והשדות מתויגים, מצב האריחים מוקרא (aria-pressed), וחלונות נפתחים כדיאלוגים; ניגודיות צבעים גבוהה (טקסט על רקע כהה ביחס של 4.5:1 לפחות); אזורי מגע בגודל 44 פיקסלים לפחות; הטקסט ניתן להגדלה עד 200% ללא אובדן תוכן (במקרה הצורך המסך יגלול); כיבוד העדפת "הפחתת תנועה" של מערכת ההפעלה; כל הנתונים המספריים מוצגים גם כטקסט, לא רק על מפה. הממשק זמין בעברית, באנגלית, ברוסית ובערבית.'],
      ['מה עדיין לא מונגש במלואו', 'המפה במסך "מונה חי" היא רכיב גרפי ואינה נגישה לקורא מסך; המידע החיוני (מחיר, מרחק, זמן, מהירות) מוצג לצידה כטקסט נגיש. תמונת הקבלה לשיתוף היא תמונה; הפירוט המלא זמין כטקסט בגיליון "פרטי הנסיעה". אנו עובדים על שיפורים אלה.'],
      ['דרכי פנייה', `רכז הנגישות: ${LEGAL_META.operator}, ${LEGAL_META.email}. נשמח לקבל דיווח על כל בעיה בנגישות, ונשיב בתוך 7 ימי עסקים.`],
      ['תוקף ההצהרה', `ההצהרה עודכנה ב-${LEGAL_META.updated} ותיבדק מחדש אחת לשנה או עם שינוי מהותי בשירות.`],
    ],
  },
  delete: {
    title: 'מחיקת חשבון ומידע',
    intro: 'אפשר למחוק את חשבון "מונה" ואת כל המידע הקשור אליו בכל עת, מתוך האפליקציה או בפנייה למפעיל.',
    sections: [
      ['מתוך האפליקציה (מומלץ)', 'עוד ← החשבון שלי ← "מחק חשבון" ← אישור. המחיקה מסירה מיד את כל הנסיעות מהענן ואת החשבון עצמו. אפשר לבחור אם למחוק גם את הנסיעות השמורות במכשיר.'],
      ['בפנייה למפעיל', `שלח מייל מכתובת האימייל של החשבון אל ${LEGAL_META.email} עם הנושא "מחיקת חשבון מונה". החשבון והמידע יימחקו בתוך 30 יום ותקבל אישור במייל.`],
      ['מה נמחק', 'פרטי החשבון (אימייל, שם, מזהה), כל הנסיעות והמסלולים השמורים בענן, וכל מידע אחר שנשמר בחשבון. לא נשמר עותק, למעט גיבויים טכניים הנמחקים בתוך 30 יום.'],
    ],
  },
};

export function docHtml(key, { standalone = false, lang = 'he' } = {}) {
  const d = lang && lang !== 'he' ? DOCS_EN[key] : DOCS[key];
  const en = lang && lang !== 'he';
  const tag = standalone ? 'section' : 'details';
  const body = d.sections.map(([h, t], i) => standalone
    ? `<section><h2>${h}</h2><p>${t}</p></section>`
    : `<details${i === 0 ? ' open' : ''}><summary>${h}</summary><p>${t}</p></details>`).join('');
  const meta = en ? `${META_EN.operator} · ${LEGAL_META.email} · Updated ${META_EN.updated}` : `${LEGAL_META.operator} · ${LEGAL_META.email} · עודכן ${LEGAL_META.updated}`;
  return `<div${en ? ' dir="ltr" lang="en"' : ''}><p class="intro">${d.intro}</p>${body}<p class="meta">${meta}</p></div>`;
}

// ---- English versions (shown for English, Russian and Arabic; the Hebrew text prevails) ----
const META_EN = { operator: 'Lou Korek', updated: 'October 2, 2026' };
export const DOCS_EN = {
  terms: {
    title: 'Terms of Use',
    intro: 'Welcome to "Mone". Use of the app and the website (together, the "Service") is subject to these terms. If you do not agree to them, please do not use the Service. This is a translation; in case of any discrepancy the Hebrew version prevails.',
    sections: [
      ['Who operates the Service', `The Service is operated by ${META_EN.operator} (the "Operator"), contact: ${LEGAL_META.email}. The Service is provided free of charge.`],
      ['What the Service does — and what it does not', '"Mone" calculates an estimate of the maximum permitted fare for a special (metered) taxi ride in Israel, according to the Supervision of Prices of Goods and Services Order (Taxi Fares), 5778–2018, as amended from time to time, and the Traffic Regulations. The calculation is an estimate only: by law, the calibrated meter in the taxi is decisive. Distance and time measured by the phone\'s GPS may differ from the meter, especially in dense areas or tunnels. Automatically detected surcharges (airport departure, Road 6, Carmel Tunnels) are an aid only and may be wrong; you can always switch them off. Information in the Service is not legal advice and does not replace contacting a competent authority.'],
      ['Tariff updates', 'Tariffs are usually updated on April 1 each year, after publication in the official gazette. The Operator updates the Service shortly after publication, but there may be a gap during which outdated tariffs are shown. The date of the displayed tariffs appears in the Service.'],
      ['User account', 'You can open an account with an email address and password, a Google account or (on iPhone) Apple. You are responsible for keeping your login details confidential and for any action in your account. The Service is intended for users aged 16 and over; a younger user may use it only with a parent\'s or guardian\'s consent. You can delete your account at any time from within the Service (More → My account → Delete account).'],
      ['Permitted use', 'Do not use the Service in a way that breaks the law, harm its operation, try to bypass its security mechanisms, impersonate others, or copy and distribute parts of it without permission. The "ride receipt" produced by the Service is a reference document for comparison only; it is not a tax invoice, not an official receipt and not a document issued by the taxi or the Ministry of Transport, and must not be presented as such.'],
      ['Complaints about drivers', 'The Service helps you draft a complaint to the Ministry of Transport based on the data you entered and that was measured. You alone are responsible for the accuracy of the complaint and for submitting it. It is recommended to attach a printed receipt from the meter and to submit within two months of the incident, as required by the Ministry of Transport.'],
      ['Intellectual property', 'The code, design, logo and content of the Service belong to the Operator. Maps are based on OpenStreetMap data (© OpenStreetMap contributors, ODbL license). The text of the Order and the Traffic Regulations are official documents and are not owned by the Operator.'],
      ['Limitation of liability', 'The Service is provided "AS IS". The Operator does not guarantee that the Service will always be available, error-free or completely accurate, and will not be liable for any direct or indirect damage resulting from reliance on the calculation, including over- or under-payment to a driver, or from a dispute with a driver or taxi company.'],
      ['Changes and termination', 'The Operator may change the Service, these terms and the privacy policy, or discontinue the Service, at any time. A material change to the terms will be shown in the Service. Continued use after the change constitutes acceptance.'],
      ['Governing law and jurisdiction', 'These terms are governed exclusively by Israeli law. Exclusive jurisdiction lies with the competent courts in the Tel Aviv–Jaffa district.'],
      ['Contact', `For any question: ${LEGAL_META.email}.`],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'This policy explains what information "Mone" collects, why, where it is stored and what your rights are — in accordance with the Israeli Protection of Privacy Law, 5741–1981 (including Amendment 13) and its regulations. This notice is given to you before the information is collected. This is a translation; in case of any discrepancy the Hebrew version prevails.',
    sections: [
      ['Who is responsible', `The database controller is ${META_EN.operator}, ${LEGAL_META.email}. Providing information is not required by law; it is needed to provide the Service, and in part (account and sync) it is optional.`],
      ['What is collected', '<b>Without an account:</b> all data stays on your device only and is not sent to the Operator.<br><b>With an account:</b> (1) account details — email address, name (as received from Google/Apple or derived from the email) and user ID; (2) rides — date and time, distance, duration, GPS track points of the ride, the surcharges you selected, the calculated amounts, and what you entered manually: taxi number, driver name and the amount the driver asked; (3) technical information that Google\'s Firebase keeps for security — IP address and login times.<br>The Service has no Google Analytics, ads, pixels or tracking cookies.'],
      ['Location', 'Location is collected only after you grant permission, and only in two cases: during an active ride in "Live meter" (to measure distance, show the route and automatically detect surcharges such as airport departure, Road 6 or the Carmel Tunnels — detection runs on the device itself), and when you tap "My current location" in the calculator (a one-time location as the starting point). The Service does not collect location in the background when the app is closed. You can revoke the permission at any time in your device settings; the calculator keeps working without location.'],
      ['Route calculation (origin and destination)', 'When you type an origin and destination in the calculator, the text you typed (and, when you asked for it, your current location, or the location of the active ride to improve suggestions) is sent through the "Mone" server (Netlify) to Google Maps Platform to complete addresses and calculate distance and travel time. This information is not stored by the Operator and is not linked to your account; Google processes it under the Google Maps Platform terms and Google\'s privacy policy. Recently chosen addresses, and "Home" and "Work" if you saved them, are stored on your device only and are not sent to the Operator.'],
      ['How the information is used', 'To calculate the fare, show the route, save your rides and sync them between your devices, enable sign-in and secure the account, and answer your inquiries. The legal basis is your consent and the need to provide the Service you requested. The information is not sold, not transferred to third parties for marketing and not used for profiling.'],
      ['Where it is stored and transfer abroad', 'Rides are stored in Google Cloud Firestore on servers in the Tel Aviv region (me-west1), in Israel. Account details are managed by Google Firebase Authentication, whose servers may be outside Israel (mainly in the United States). The transfer is made in accordance with the Privacy Protection (Transfer of Data to Databases Abroad) Regulations, based on Google\'s data processing terms and an adequate level of protection.'],
      ['Providers involved', 'Google (Firebase — authentication and database; Google Maps Platform — address completion and route calculation); Netlify (website hosting and the route server); OpenStreetMap (map tiles — when the map loads, OSM servers receive your IP address and the map area requested); Google Fonts (fonts). These providers process information only to provide the Service and under their own terms.'],
      ['Retention', 'As long as your account is active. When you delete a ride or the account, the information is deleted from the database immediately, and from backups within 30 days at most. Data without an account stays on the device until you delete it or the app.'],
      ['Your rights', `You may review the information stored about you, ask to correct or delete it, and withdraw your consent. Most actions you can do yourself: edit and delete rides in the "Rides" tab, and delete the account and all information under "More → My account → Delete account". For any other request write to ${LEGAL_META.email} — we will reply within 30 days. If you believe your rights were infringed, you may also contact the Israeli Privacy Protection Authority.`],
      ['Information security', 'Information is encrypted in transit (HTTPS) and at rest. Access to rides is restricted by security rules so that only the signed-in user can read and write their own data. The Operator does not see passwords; they are managed by Firebase. No system is completely immune, so we recommend choosing a unique password.'],
      ['Minors', 'The Service is intended for ages 16 and over. We do not knowingly collect information from children under 14; if we learn of such information, we will delete it.'],
      ['Database registration', 'Where the law requires registering the database, registration will be made. The stored information does not include especially sensitive information as defined by law, except location data collected with your explicit consent during a ride.'],
      ['Changes to this policy', `This policy was last updated on ${META_EN.updated}. A material change will be shown in the Service before it takes effect.`],
    ],
  },
  accessibility: {
    title: 'Accessibility Statement',
    intro: '"Mone" is committed to enabling everyone, including people with disabilities, to use the Service easily and comfortably. This statement is provided under regulation 35 of the Israeli Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations, 5773–2013. This is a translation; in case of any discrepancy the Hebrew version prevails.',
    sections: [
      ['Accessibility level', 'The Service was designed to meet Israeli Standard 5568 (web content accessibility) at level AA, based on WCAG 2.0, aiming for WCAG 2.1 AA. The statement is based on the Operator\'s self-assessment; no certified external audit was performed.'],
      ['What was made accessible', 'Full keyboard navigation (Tab, Enter, Escape to close dialogs) with a clear focus indicator; screen reader support — all buttons and fields are labeled, tile states are announced (aria-pressed) and sheets open as dialogs; high color contrast (at least 4.5:1); touch targets of at least 44 pixels; text can be enlarged up to 200% without loss of content (the screen scrolls if needed); the operating system\'s "reduce motion" preference is respected; all numerical data is also shown as text, not only on a map. The interface is available in Hebrew, English, Russian and Arabic.'],
      ['What is not yet fully accessible', 'The map in the "Live meter" screen is a graphical component and is not accessible to screen readers; the essential information (fare, distance, time, speed) is shown next to it as accessible text. The shareable receipt image is an image; the full breakdown is available as text in the "Ride details" sheet. We are working on these improvements.'],
      ['Contact', `Accessibility coordinator: ${META_EN.operator}, ${LEGAL_META.email}. We will be happy to receive reports of any accessibility issue and will reply within 7 business days.`],
      ['Validity', `This statement was updated on ${META_EN.updated} and will be reviewed once a year or upon a material change to the Service.`],
    ],
  },
  delete: {
    title: 'Deleting your account and data',
    intro: 'You can delete your "Mone" account and all related information at any time, from within the app or by contacting the Operator.',
    sections: [
      ['From the app (recommended)', 'More → My account → "Delete account" → confirm. Deletion immediately removes all rides from the cloud and the account itself. You can choose whether to also delete the rides stored on the device.'],
      ['By contacting the Operator', `Send an email from your account\'s email address to ${LEGAL_META.email} with the subject "Delete Mone account". The account and data will be deleted within 30 days and you will receive a confirmation email.`],
      ['What is deleted', 'Account details (email, name, ID), all rides and tracks stored in the cloud, and any other information stored in the account. No copy is kept, except technical backups that are deleted within 30 days.'],
    ],
  },
};
export function docFor(key, lang) { return lang && lang !== 'he' ? DOCS_EN[key] : DOCS[key]; }
