# מגיש גרסה של "מונה" לבדיקה ב-App Store דרך App Store Connect API (בלי דפדפן).
# רץ ב-GitHub Actions (ios-submit.yml): python tools/asc-submit.py <status|submit> <version> <build> "<what's new>"
# status רק מדווח. submit: מבטל הגשה פתוחה של גרסה קודמת, מכין את הגרסה, מצמיד את ה-build, ממלא "מה חדש" ושולח.
# הדיווח יוצא כ-annotations (::notice::) כדי שאפשר יהיה לקרוא אותו גם בלי גישה ללוג המלא.
import json, os, sys, time, urllib.error, urllib.request
import jwt

APP_ID = '6811308141'
KEY_ID, ISSUER, P8 = os.environ['ASC_KEY_ID'], os.environ['ASC_ISSUER_ID'], os.environ['ASC_KEY_P8']
mode, version, build_no, notes = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
OPEN = ('WAITING_FOR_REVIEW', 'READY_FOR_REVIEW', 'IN_REVIEW', 'UNRESOLVED_ISSUES')
EDITABLE = ('PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY')


def note(msg, kind='notice'):
    print(f'::{kind} title=asc::' + str(msg).replace('\n', ' '), flush=True)


def token():
    now = int(time.time())
    return jwt.encode({'iss': ISSUER, 'iat': now, 'exp': now + 1100, 'aud': 'appstoreconnect-v1'}, P8,
                      algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})


def api(method, path, body=None):
    req = urllib.request.Request('https://api.appstoreconnect.apple.com' + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        note(f'{method} {path} -> {e.code}: {e.read().decode()[:700]}', 'error')
        raise SystemExit(1)


def submissions():
    return api('GET', f'/v1/reviewSubmissions?filter[app]={APP_ID}&filter[platform]=IOS&limit=5')['data']


def app_versions():
    return api('GET', f'/v1/apps/{APP_ID}/appStoreVersions?filter[platform]=IOS&limit=5')['data']


versions, subs = app_versions(), submissions()
for v in versions:
    note(f"version {v['attributes']['versionString']}: {v['attributes']['appStoreState']}")
for s in subs:
    note(f"review submission {s['id']}: {s['attributes']['state']}")
builds = api('GET', f'/v1/builds?filter[app]={APP_ID}&filter[version]={build_no}&limit=1')['data']
if not builds:
    note(f'build {build_no} not found', 'error')
    raise SystemExit(1)
b = builds[0]
note(f"build {build_no}: {b['attributes']['processingState']}, usesNonExemptEncryption={b['attributes'].get('usesNonExemptEncryption')}")
if mode != 'submit':
    raise SystemExit(0)

# 1) הגשה פתוחה של גרסה קודמת: מבטלים, כדי שהגרסה החדשה תחליף אותה
pending = [s for s in subs if s['attributes']['state'] in OPEN]
for s in pending:
    api('PATCH', f"/v1/reviewSubmissions/{s['id']}",
        {'data': {'type': 'reviewSubmissions', 'id': s['id'], 'attributes': {'canceled': True}}})
    note(f"canceled review submission {s['id']}")
if pending:
    for _ in range(30):
        time.sleep(10)
        if not any(s['attributes']['state'] in OPEN + ('CANCELING',) for s in submissions()):
            break

# 2) גרסה לעריכה: אותו מספר, או גרסה שלא שוחררה (משנים לה את המספר); אחרת יוצרים חדשה
versions = app_versions()
ver = next((v for v in versions if v['attributes']['versionString'] == version), None) \
    or next((v for v in versions if v['attributes']['appStoreState'] in EDITABLE), None)
if ver and ver['attributes']['versionString'] != version:
    api('PATCH', f"/v1/appStoreVersions/{ver['id']}",
        {'data': {'type': 'appStoreVersions', 'id': ver['id'], 'attributes': {'versionString': version}}})
    note(f"renamed version {ver['attributes']['versionString']} to {version}")
if not ver:
    ver = api('POST', '/v1/appStoreVersions', {'data': {
        'type': 'appStoreVersions', 'attributes': {'platform': 'IOS', 'versionString': version, 'releaseType': 'AFTER_APPROVAL'},
        'relationships': {'app': {'data': {'type': 'apps', 'id': APP_ID}}}}})['data']
    note(f'created version {version}')
vid = ver['id']

# 3) build: הצהרת הצפנה (האפליקציה משתמשת רק ב-HTTPS) והצמדה לגרסה
for _ in range(30):
    if api('GET', f"/v1/builds/{b['id']}")['data']['attributes']['processingState'] == 'VALID':
        break
    time.sleep(20)
if b['attributes'].get('usesNonExemptEncryption') is None:
    api('PATCH', f"/v1/builds/{b['id']}",
        {'data': {'type': 'builds', 'id': b['id'], 'attributes': {'usesNonExemptEncryption': False}}})
api('PATCH', f'/v1/appStoreVersions/{vid}/relationships/build', {'data': {'type': 'builds', 'id': b['id']}})
note(f'attached build {build_no}')

# 4) "מה חדש" בכל השפות של דף האפליקציה
for loc in api('GET', f'/v1/appStoreVersions/{vid}/appStoreVersionLocalizations')['data']:
    api('PATCH', f"/v1/appStoreVersionLocalizations/{loc['id']}",
        {'data': {'type': 'appStoreVersionLocalizations', 'id': loc['id'], 'attributes': {'whatsNew': notes}}})
    note(f"whatsNew set for {loc['attributes']['locale']}")

# 5) הגשה לבדיקה
ready = [s for s in submissions() if s['attributes']['state'] == 'READY_FOR_REVIEW']
sub = ready[0] if ready else api('POST', '/v1/reviewSubmissions', {'data': {
    'type': 'reviewSubmissions', 'attributes': {'platform': 'IOS'},
    'relationships': {'app': {'data': {'type': 'apps', 'id': APP_ID}}}}})['data']
api('POST', '/v1/reviewSubmissionItems', {'data': {'type': 'reviewSubmissionItems', 'relationships': {
    'reviewSubmission': {'data': {'type': 'reviewSubmissions', 'id': sub['id']}},
    'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': vid}}}}})
api('PATCH', f"/v1/reviewSubmissions/{sub['id']}",
    {'data': {'type': 'reviewSubmissions', 'id': sub['id'], 'attributes': {'submitted': True}}})
note(f'submitted {version} (build {build_no}) for review')
