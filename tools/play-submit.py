# מעלה את ה-AAB של "מונה" ל-Google Play ושולח לבדיקה, דרך Google Play Developer API.
# רץ ב-GitHub Actions (play-submit.yml): python tools/play-submit.py <check|submit|shots> <path.aab> "<what's new>" <track>
# shots: רק מחליף את צילומי המסך (phoneScreenshots) בכל שפות דף האפליקציה. גם ב-submit, אם SHOTS_DIR מוגדר.
# ההרשאה: Workload Identity Federation (בלי קובץ מפתח) — google-github-actions/auth מגדיר Application Default Credentials.
import os
import sys
import google.auth
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

PACKAGE = 'com.loukorek.mone'
mode, aab, notes, track = (sys.argv[1:] + ['', '', '', ''])[:4]
track = track or 'production'

def note(msg, kind='notice'):
    print(f'::{kind} title=play::' + msg.replace('\n', ' '), flush=True)

creds, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/androidpublisher'])
edits = build('androidpublisher', 'v3', credentials=creds, cache_discovery=False).edits()
eid = edits.insert(packageName=PACKAGE, body={}).execute()['id']

if mode != 'submit':
    for t in edits.tracks().list(packageName=PACKAGE, editId=eid).execute().get('tracks', []):
        for r in t.get('releases', []):
            note(f"{t['track']}: {r.get('name', '')} versionCodes={r.get('versionCodes')} status={r.get('status')}")
    for lst in edits.listings().list(packageName=PACKAGE, editId=eid).execute().get('listings', []):
        n = len(edits.images().list(packageName=PACKAGE, editId=eid, language=lst['language'], imageType='phoneScreenshots').execute().get('images', []))
        note(f"listing {lst['language']}: {n} phone screenshots")
    edits.delete(packageName=PACKAGE, editId=eid).execute()
    note('access OK (check only, nothing changed)')
    raise SystemExit(0)

def replace_shots():
    shots = os.environ.get('SHOTS_DIR')
    if not shots or not os.path.isdir(shots):
        return False
    files = sorted(f for f in os.listdir(shots) if f.endswith('.png'))[:8]
    if not files:
        note('no screenshots found', 'error'); raise SystemExit(1)
    for lst in edits.listings().list(packageName=PACKAGE, editId=eid).execute().get('listings', []):
        lang = lst['language']
        edits.images().deleteall(packageName=PACKAGE, editId=eid, language=lang, imageType='phoneScreenshots').execute()
        for f in files:
            edits.images().upload(packageName=PACKAGE, editId=eid, language=lang, imageType='phoneScreenshots',
                                  media_body=MediaFileUpload(os.path.join(shots, f), mimetype='image/png')).execute()
        note(f'{lang}: replaced phone screenshots with {len(files)}')
    return True

if mode == 'shots':
    if not replace_shots():
        note('SHOTS_DIR missing', 'error'); raise SystemExit(1)
    edits.commit(packageName=PACKAGE, editId=eid).execute()
    note('screenshots sent to review')
    raise SystemExit(0)

replace_shots()
if not aab or not notes:
    note('missing AAB or notes', 'error'); raise SystemExit(1)
bundle = edits.bundles().upload(packageName=PACKAGE, editId=eid, media_body=MediaFileUpload(aab, mimetype='application/octet-stream', resumable=True)).execute()
vc = bundle['versionCode']
note(f'uploaded versionCode {vc}')
edits.tracks().update(packageName=PACKAGE, editId=eid, track=track, body={'track': track, 'releases': [{
    'versionCodes': [str(vc)], 'status': 'completed',
    'releaseNotes': [{'language': 'iw-IL', 'text': notes}]}]}).execute()
edits.commit(packageName=PACKAGE, editId=eid).execute()
note(f'versionCode {vc} sent to {track} review')
