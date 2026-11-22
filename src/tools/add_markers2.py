# usage: add_markers2.py FILE AFTER_ID ID:name [ID:name ...]
# inserts empty marker blocks (css/html/nl/en/js) right after the AFTER_ID block (marker, its body, its filler line)
import sys, re
p, after, specs = sys.argv[1], sys.argv[2], sys.argv[3:]
names = [x.split(':', 1) for x in specs]
s = open(p).read()
def block(kind, indent=''):
    if kind == 'html': return ''.join(f"<!-- @@{g} html ({n}) -->\n<!-- -- -->\n" for g, n in names)
    if kind in ('nl', 'en'): return ''.join(f"{indent}/* @@{g} {kind} ({n}) */\n{indent}/* -- */\n" for g, n in names)
    return ''.join(f"/* @@{g} {kind} ({n}) */\n/* -- */\n" for g, n in names)
for kind in ['css', 'html', 'nl', 'en', 'js']:
    if kind == 'html': pat = r"<!-- @@" + after + r" html \([^)]*\) -->\n"; fill = re.compile(r"^<!-- -- -->$", re.M)
    else: pat = r"( *)/\* @@" + after + " " + kind + r" \([^)]*\) \*/\n"; fill = re.compile(r"^ */\* -- \*/$", re.M)
    m = re.search(pat, s); assert m, kind
    f = fill.search(s, m.end()); assert f, ('no filler', kind)
    nl = f.end()  # end of the filler line (before its newline)
    indent = (m.group(1) if m.groups() else '') or ''
    for g, n in names: assert f"@@{g} {kind}" not in s, (g, kind)
    s = s[:nl + 1] + block(kind, indent) + s[nl + 1:]
open(p, 'w').write(s); print('markers added after', after, [g for g, _ in names])
