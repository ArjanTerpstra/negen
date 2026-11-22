#!/usr/bin/env python3
"""Marker-aware 3-way merge for Negen.
usage: bmerge.py OUT TARGET  copy:base [copy:base ...]
Each file is split into a skeleton (marker lines kept, block bodies removed) and block bodies keyed by marker
(e.g. 'G1 js'). Skeletons are merged with git merge-file (small edits outside blocks), and each block body is
3-way merged on its own (base body vs current body vs copy body). Prints a report; exit code = number of conflicts."""
import re, sys, subprocess, tempfile, os
MARK = re.compile(r'@@([A-Z][0-9]+) (css|html|nl|en|js|head) \(')
def is_filler(s):
    t = s.strip()
    return t in ('/* -- */', '<!-- -- -->')
def split(text):
    lines = text.split('\n')
    skel, blocks, order = [], {}, []
    i = 0
    while i < len(lines):
        ln = lines[i]; m = MARK.search(ln)
        if m and not is_filler(ln):
            key = m.group(1) + ' ' + m.group(2)
            if key in blocks: raise SystemExit(f'duplicate marker {key}')
            skel.append(ln); body = []; i += 1
            while i < len(lines) and not is_filler(lines[i]) and not MARK.search(lines[i]):
                body.append(lines[i]); i += 1
            blocks[key] = body; order.append(key)
            continue
        skel.append(ln); i += 1
    return skel, blocks, order
def join(skel, blocks):
    out = []
    for ln in skel:
        out.append(ln)
        m = MARK.search(ln)
        if m and not is_filler(ln):
            out.extend(blocks.get(m.group(1) + ' ' + m.group(2), []))
    return '\n'.join(out)
def merge3(cur, base, other, label):
    if other == base: return cur, 0
    if cur == base: return other, 0
    if cur == other: return cur, 0
    with tempfile.TemporaryDirectory() as d:
        p = [os.path.join(d, n) for n in ('cur', 'base', 'other')]
        for path, ls in zip(p, (cur, base, other)):
            open(path, 'w').write('\n'.join(ls) + '\n')
        rc = subprocess.run(['git', 'merge-file', '-L', 'current', '-L', 'base', '-L', label, p[0], p[1], p[2]]).returncode
        res = open(p[0]).read()
    if res.endswith('\n'): res = res[:-1]
    return res.split('\n'), rc
out, target = sys.argv[1], sys.argv[2]
skel, blocks, order = split(open(target).read())
total = 0
for spec in sys.argv[3:]:
    cp, bp = spec.split(':')
    name = os.path.basename(cp.rstrip('/'))
    cs, cb, _ = split(open(os.path.join(cp, 'index.src.html')).read())
    bs, bb, _ = split(open(os.path.join(bp, 'index.src.html')).read())
    skel, rc = merge3(skel, bs, cs, name)
    sk_changes = 'skeleton changed' if cs != bs else 'skeleton same'
    changed = []
    for key in sorted(set(cb) | set(bb)):
        c, b = cb.get(key, []), bb.get(key, [])
        if c == b: continue
        if key not in blocks and key not in cb: continue
        cur = blocks.get(key, [])
        res, r2 = merge3(cur, b, c, name + ':' + key)
        blocks[key] = res; rc += r2
        changed.append(f'{key}(+{len(c)}/{len(b)}{" CONFLICT" if r2 else ""})')
    print(f'{name}: {sk_changes}, conflicts {rc}; blocks: {" ".join(changed)}')
    total += rc
open(out, 'w').write(join(skel, blocks))
print('total conflicts', total)
sys.exit(min(total, 100))
