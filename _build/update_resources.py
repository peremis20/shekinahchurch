#!/usr/bin/env python3
"""Replace the Resources page data across the site.

Usage: python3 _build/update_resources.py <resources.json>
The JSON has keys: updated, crisis, local, national_tools (see content-defaults.json "resources"
for the exact shape). Crisis entries may include phone (tap to call) and sms {"number", "body"}
(tap to text, for example the Crisis Text Line uses sms only, no phone). Local categories must be one of RES_CATS in _build/index.src.html.
Updates content-defaults.json and the RESOURCES constant in every built page.
"""
import json, re, sys, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
CATS = {'Food', 'Housing and Utilities', 'Health and Dental', 'Mental Health', 'Domestic Violence',
        'Family and Children', 'Legal Help', 'Immigration', 'Seniors', 'Jobs', 'Veterans'}


def main(path):
    R = json.load(open(path, encoding='utf-8'))
    R = {k: R[k] for k in ('updated', 'crisis', 'local', 'national_tools')}
    errs = []
    for r in R['local']:
        if r.get('category') not in CATS:
            errs.append('bad category %r for %s' % (r.get('category'), r.get('name')))
        for k in ('name', 'what', 'area', 'url'):
            if not r.get(k):
                errs.append('missing %s for %s' % (k, r.get('name')))
        if re.search(r'[-–—]', r.get('what', '') + r.get('phone', '')):
            errs.append('hyphen or dash in text or phone for %s' % r.get('name'))
    if len(R['crisis']) < 5 or len(R['local']) < 10:
        errs.append('too few entries, refusing to shrink the page this much')
    if errs:
        raise SystemExit('\n'.join(errs))
    d = json.load(open('content-defaults.json', encoding='utf-8'))
    d['resources'] = R
    json.dump(d, open('content-defaults.json', 'w', encoding='utf-8'), ensure_ascii=False)
    js = json.dumps(R, ensure_ascii=False)
    files = ['_build/index.src.html'] + [l for l in subprocess.check_output(['git', 'ls-files', '*.html']).decode().split() if not l.startswith('_build')]
    n = 0
    for f in files:
        s = open(f, encoding='utf-8').read()
        m = re.search(r'let RESOURCES = (\{.*?\});\nconst RES_CATS', s, re.S)
        if not m:
            continue
        s = s[:m.start(1)] + js + s[m.end(1):]
        open(f, 'w', encoding='utf-8').write(s)
        n += 1
    print('updated', n, 'files;', len(R['crisis']), 'crisis lines,', len(R['local']), 'local listings,', len(R['national_tools']), 'tools')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
