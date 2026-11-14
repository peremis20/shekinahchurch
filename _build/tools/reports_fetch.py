"""Daily Reports data for the admin dashboard.

Reads Google Analytics 4 and Google Search Console with a short lived access token
(GOOGLE_TOKEN, from keyless workload identity in .github/workflows/reports-daily.yml)
and writes one JSON file. Read only. No personal data: only totals, pages, sources,
cities and search phrases, the same things the Google screens show.
"""
import json, os, sys, urllib.request, urllib.parse, datetime as dt

TOKEN = os.environ['GOOGLE_TOKEN']
GA_PROPERTY = os.environ.get('GA_PROPERTY', '561104244')
GSC_SITE = os.environ.get('GSC_SITE', 'sc-domain:shekinahsda.org')
OUT = sys.argv[1] if len(sys.argv) > 1 else 'report.json'


def call(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method='POST',
                                 headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit('Google API error %s for %s: %s' % (e.code, url.split('?')[0], e.read().decode()[:400]))


def ga(dims, mets, start, end='yesterday', limit=50, order=None, filt=None):
    p = {'dateRanges': [{'startDate': start, 'endDate': end}], 'dimensions': [{'name': d} for d in dims],
         'metrics': [{'name': m} for m in mets], 'limit': limit}
    if order:
        p['orderBys'] = [order]
    if filt:
        p['dimensionFilter'] = filt
    j = call('https://analyticsdata.googleapis.com/v1beta/properties/%s:runReport' % GA_PROPERTY, p)
    rows = []
    for r in j.get('rows', []):
        row = {d: v['value'] for d, v in zip(dims, r.get('dimensionValues', []))}
        for m, v in zip(mets, r.get('metricValues', [])):
            x = float(v['value'])
            row[m] = round(x, 4) if x % 1 else int(x)
        rows.append(row)
    return rows


def ga_total(mets, start, end='yesterday'):
    r = ga([], mets, start, end, limit=1)
    return r[0] if r else {m: 0 for m in mets}


def gsc(dims, start, end, limit=25):
    url = 'https://searchconsole.googleapis.com/webmasters/v3/sites/%s/searchAnalytics/query' % urllib.parse.quote(GSC_SITE, safe='')
    j = call(url, {'startDate': start, 'endDate': end, 'dimensions': dims, 'rowLimit': limit, 'dataState': 'all'})
    out = []
    for r in j.get('rows', []):
        row = {d: k for d, k in zip(dims, r.get('keys', []))}
        row.update({'clicks': int(r['clicks']), 'impressions': int(r['impressions']), 'ctr': round(r['ctr'], 4), 'position': round(r['position'], 1)})
        out.append(row)
    return out


today = dt.date.today()
d = lambda n: (today - dt.timedelta(days=n)).isoformat()
TOT = ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'screenPageViews', 'averageSessionDuration', 'engagementRate']
by_views = {'metric': {'metricName': 'screenPageViews'}, 'desc': True}
by_sessions = {'metric': {'metricName': 'sessions'}, 'desc': True}
by_users = {'metric': {'metricName': 'activeUsers'}, 'desc': True}

report = {'generated_at': dt.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z', 'ga': {}, 'gsc': {}}
G = report['ga']
G['last7'] = ga_total(TOT, '7daysAgo')
G['prev7'] = ga_total(TOT, '14daysAgo', '8daysAgo')
G['last28'] = ga_total(TOT, '28daysAgo')
G['prev28'] = ga_total(TOT, '56daysAgo', '29daysAgo')
G['daily'] = sorted(ga(['date'], ['activeUsers', 'sessions', 'engagedSessions', 'screenPageViews'], '90daysAgo', limit=120), key=lambda r: r['date'])
G['pages'] = ga(['pagePath', 'pageTitle'], ['screenPageViews', 'activeUsers', 'userEngagementDuration'], '28daysAgo', limit=20, order=by_views)
G['sources'] = ga(['sessionDefaultChannelGroup'], ['sessions', 'engagedSessions'], '28daysAgo', limit=12, order=by_sessions)
G['referrers'] = ga(['sessionSource'], ['sessions', 'engagedSessions'], '28daysAgo', limit=12, order=by_sessions)
G['cities'] = ga(['city', 'region'], ['activeUsers', 'engagedSessions'], '28daysAgo', limit=12, order=by_users)
G['devices'] = ga(['deviceCategory'], ['activeUsers'], '28daysAgo', limit=5, order=by_users)
G['languages'] = ga(['language'], ['activeUsers'], '28daysAgo', limit=8, order=by_users)
G['events'] = ga(['eventName'], ['eventCount'], '28daysAgo', limit=30, order={'metric': {'metricName': 'eventCount'}, 'desc': True})

S = report['gsc']
try:
    S['daily'] = sorted(gsc(['date'], d(93), d(1), limit=200), key=lambda r: r['date'])
    S['last28'] = (gsc([], d(30), d(3), limit=1) or [{'clicks': 0, 'impressions': 0, 'ctr': 0, 'position': 0}])[0]
    S['prev28'] = (gsc([], d(58), d(31), limit=1) or [{'clicks': 0, 'impressions': 0, 'ctr': 0, 'position': 0}])[0]
    S['queries'] = gsc(['query'], d(30), d(3), limit=30)
    S['pages'] = gsc(['page'], d(30), d(3), limit=20)
    S['countries'] = gsc(['country'], d(30), d(3), limit=8)
except SystemExit as e:
    S['error'] = str(e)

json.dump(report, open(OUT, 'w'), indent=1)
print('ok', OUT, 'users28', G['last28'].get('activeUsers'), 'gsc', 'error' if S.get('error') else S.get('last28'))
