# מעלה את ה-AAB של "מונה" ל-Google Play (מסלול Production) ושולח לבדיקה, דרך Google Play Developer API.
# רץ ב-GitHub Actions (play-submit.yml): python tools/play-submit.py <path.aab> "<what's new>"
# דורש Secret בשם PLAY_SERVICE_ACCOUNT_JSON: מפתח JSON של Service Account שקיבל הרשאת Release ב-Play Console.
import json, os, sys
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

PACKAGE = 'com.loukorek.mone'
aab, notes = sys.argv[1], sys.argv[2]
raw = os.environ.get('PLAY_SERVICE_ACCOUNT_JSON', '').strip()
if not raw:
    print('::error title=play::חסר ה-Secret PLAY_SERVICE_ACCOUNT_JSON'); raise SystemExit(1)

creds = service_account.Credentials.from_service_account_info(json.loads(raw), scopes=['https://www.googleapis.com/auth/androidpublisher'])
ap = build('androidpublisher', 'v3', credentials=creds, cache_discovery=False)
edits = ap.edits()
eid = edits.insert(packageName=PACKAGE, body={}).execute()['id']
bundle = edits.bundles().upload(packageName=PACKAGE, editId=eid, media_body=MediaFileUpload(aab, mimetype='application/octet-stream', resumable=True)).execute()
vc = bundle['versionCode']
print(f'::notice title=play::uploaded versionCode {vc}')
edits.tracks().update(packageName=PACKAGE, editId=eid, track='production', body={'track': 'production', 'releases': [{
    'versionCodes': [str(vc)], 'status': 'completed',
    'releaseNotes': [{'language': 'iw-IL', 'text': notes}]}]}).execute()
edits.commit(packageName=PACKAGE, editId=eid).execute()
print(f'::notice title=play::versionCode {vc} sent to Production review')
