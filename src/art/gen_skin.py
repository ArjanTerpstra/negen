# Generates the "Tegeltableau" skin CSS (skin v2) with inline SVG art.
import math, urllib.parse

def uri(svg):
    svg = ' '.join(svg.split())
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe=" =:/;,'()-.") + '")'

def petal(cx, cy, ang, r0, r1, w):
    ux, uy = math.cos(ang), math.sin(ang); nx, ny = -uy, ux
    ax, ay = cx + ux*r0, cy + uy*r0; bx, by = cx + ux*r1, cy + uy*r1
    mx, my = cx + ux*(r0+r1)/2, cy + uy*(r0+r1)/2
    return f"M{ax:.1f} {ay:.1f}Q{mx+nx*w:.1f} {my+ny*w:.1f} {bx:.1f} {by:.1f}Q{mx-nx*w:.1f} {my-ny*w:.1f} {ax:.1f} {ay:.1f}Z"

def corner_orn(cx, cy):
    d = ''.join(petal(cx, cy, math.radians(a), 3.2, 15, 3.4) for a in (45, 135, 225, 315))
    d += ''.join(petal(cx, cy, math.radians(a), 3, 8.5, 1.6) for a in (0, 90, 180, 270))
    return f"<path d='{d}'/><circle cx='{cx}' cy='{cy}' r='2.1'/>"

def sails(hx, hy):
    out = []
    for a in (35, 125, 215, 305):
        u = (math.cos(math.radians(a)), -math.sin(math.radians(a))); n = (-u[1], u[0])
        p = lambda t, s: (hx + u[0]*t + n[0]*s, hy + u[1]*t + n[1]*s)
        a0, a1, a2, a3 = p(5, 0), p(22, 0), p(22, 5.2), p(6, 5.2)
        out.append(f"<path d='M{hx:.1f} {hy:.1f}L{a1[0]:.1f} {a1[1]:.1f}' stroke-width='1.6'/>")
        out.append(f"<path class='w' d='M{a0[0]:.1f} {a0[1]:.1f}L{a1[0]:.1f} {a1[1]:.1f}L{a2[0]:.1f} {a2[1]:.1f}L{a3[0]:.1f} {a3[1]:.1f}Z'/>")
        for t in (11, 16.5):
            b0, b1 = p(t, 0), p(t, 5.2)
            out.append(f"<path d='M{b0[0]:.1f} {b0[1]:.1f}L{b1[0]:.1f} {b1[1]:.1f}' stroke-width='.8'/>")
    return ''.join(out)

SCENES = {
 'mill': "<path d='M30 83Q60 77 90 83'/><path d='M38 86l2-3M45 85l1.5-3M76 85l1.5-3M83 86l2-3' stroke-width='1'/>"
         "<path class='w' d='M53 81L56.5 55L63.5 55L67 81Z'/><path d='M58.4 81v-5a1.6 1.6 0 0 1 3.2 0v5'/>"
         "<path class='w2' d='M55 55Q60 47.5 65 55Z'/>" + sails(60, 51.5) + "<circle cx='60' cy='51.5' r='1.6' class='f'/>",
 'ship': "<path class='w' d='M35 69Q60 81 85 69L80.5 63.5L39.5 63.5Z'/><path d='M60 63.5V29M46 63.5V40M74 63.5V44'/>"
         "<path class='w2' d='M61 31Q74 38 61 46Z'/><path class='w2' d='M61 47Q76 55 61 62Z'/><path class='w2' d='M47 42Q57 48 47 55Z'/><path class='w2' d='M75 46Q83 51 75 57Z'/>"
         "<path d='M60 29l7 2.2l-7 2.2' class='f'/><path d='M29 79q5-3.5 10 0t10 0t10 0t10 0t10 0t10 0M35 85q5-3 10 0t10 0t10 0t10 0' stroke-width='1.1'/>",
 'tulip': "<path d='M60 87C60 77 59 66 60 55'/><path class='w' d='M60 81C50 77 44 69 45 61C53 65 58 71 60 78Z'/><path class='w' d='M60 75C69 72 75 65 75 58C67 61 62 66 60 72Z'/>"
          "<path class='w2' d='M51 39C50 50 54 56 60 56C66 56 70 50 69 39L64.5 44.5L60 36L55.5 44.5Z'/><path d='M60 36V50' stroke-width='.9'/><path d='M44 87q16-4 32 0' stroke-width='1.1'/>",
 'house': "<path class='w' d='M46 84V58H49V54H52V50H55V46H65V50H68V54H71V58H74V84Z'/>"
          "<path class='f' d='M51 63h6v6.5h-6zM63 63h6v6.5h-6zM57 51h6v5.5h-6z' fill-opacity='.55'/><path d='M57 84V77a3 3 0 0 1 6 0V84'/><path d='M33 84Q60 80.5 87 84'/>"
          "<path d='M82 84V73M82 73c-4-1-5-6-1-8c1-4 6-3 6 1c3 2 1 7-3 7' stroke-width='1.1'/>",
}

def tile_wall(color, op, wash):
    T = 120
    g = []
    # grout lines
    g.append(f"<path d='M0 0H240M0 120H240M0 240H240M0 0V240M120 0V240M240 0V240' stroke-width='1.4' opacity='.55'/>")
    for x in (0, 120, 240):
        for y in (0, 120, 240):
            g.append(corner_orn(x, y))
    for (name, ox, oy) in (('mill', 0, 0), ('ship', 120, 0), ('tulip', 0, 120), ('house', 120, 120)):
        g.append(f"<g transform='translate({ox} {oy})'><circle cx='60' cy='60' r='34'/><circle cx='60' cy='60' r='31' stroke-width='.7'/><g transform='translate(60 60) scale(.8) translate(-60 -61)'>{SCENES[name]}</g></g>")
    style = (f"<style>path,circle{{fill:none;stroke:{color};stroke-width:1.35;stroke-linecap:round;stroke-linejoin:round}}"
             f".w{{fill:{color};fill-opacity:{wash}}}.w2{{fill:{color};fill-opacity:{wash*1.6:.2f}}}.f{{fill:{color};stroke:none}}</style>")
    filt = ("<filter id='p' x='-2%' y='-2%' width='104%' height='104%'><feTurbulence type='fractalNoise' baseFrequency='.045' numOctaves='2' seed='11'/>"
            "<feDisplacementMap in='SourceGraphic' scale='2.4' xChannelSelector='R' yChannelSelector='G'/></filter>")
    svg = (f"<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'>{style}<defs>{filt}</defs>"
           f"<g filter='url(#p)' opacity='{op}'>{''.join(g)}</g></svg>")
    return uri(svg)

def orn_uri(color, op=1):
    d = corner_orn(12, 12)
    return uri(f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><g fill='{color}' opacity='{op}'>{d.replace('<path', '<path')}</g></svg>")

def key_corners(color, op):
    # small painted fans tucked into the four corners of a key tile, pointing at the centre
    out = []
    for (cx, cy, base) in ((2, 2, 45), (12, 2, 135), (2, 12, 315), (12, 12, 225)):
        d = petal(cx, cy, math.radians(base), 1.2, 9.5, 2.2) + petal(cx, cy, math.radians(base - 32), 1.2, 6.5, 1.3) + petal(cx, cy, math.radians(base + 32), 1.2, 6.5, 1.3)
        out.append(uri(f"<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14'><path d='{d}' fill='{color}' opacity='{op}'/></svg>"))
    return out

def frame_corner(color):
    # flourish for the board frame corners: a small painted fleuron
    d = petal(10, 10, math.radians(45), 1, 13, 3.6) + petal(10, 10, math.radians(15), 2, 9, 2) + petal(10, 10, math.radians(75), 2, 9, 2)
    return uri(f"<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'><path d='{d}' fill='{color}'/><circle cx='5' cy='5' r='1.6' fill='{color}'/></svg>")

light_wall = tile_wall('#1a3a9c', .17, .20)
dark_wall = tile_wall('#b8c9ff', .095, .22)
kc_l = key_corners('#2347b5', .42)
kc_d = key_corners('#c3d3ff', .30)
fc = frame_corner('rgba(255,255,255,.55)')

css = f"""
/* ================= SKIN v2: "Tegeltableau" (painted Dutch tiles, tin glaze, cobalt) ================= */
:root{{
  --bg:#efede6; --bg2:#e7e4da; --surface:#fcfbf7; --surface2:#f3f1ea;
  --ink:#0f2160; --ink2:#43507a; --ink3:#7d86a3;
  --line:#d3daeb; --line-strong:#173489;
  --accent:#2148bd; --accent-ink:#2550cc; --accent-soft:#dce4fa; --accent-softer:#eef2fc;
  --peer:#eef1f9; --same:#d7e1fa; --sel:#c5d4fb;
  --given:#0e2470;
  --wall:{light_wall};
  --glaze:radial-gradient(140% 100% at 18% 8%,rgba(255,255,255,1),rgba(255,255,255,0) 55%),linear-gradient(180deg,rgba(255,255,255,0) 60%,rgba(23,52,137,.035));
  --tile-edge:#cdd5e8;
  --cobalt-1:#2f5ad6; --cobalt-2:#1d3c9e; --cobalt-3:#0f2463;
}}
[data-theme="dark"]{{
  --bg:#071233; --bg2:#0a1840; --surface:#11266b; --surface2:#16307c;
  --ink:#f3f6ff; --ink2:#b9c6ee; --ink3:#7f90c4;
  --line:#2b4597; --line-strong:#8ea8f0;
  --accent:#9db6ff; --accent-ink:#b4c8ff; --accent-soft:#25429a; --accent-softer:#1a3483;
  --peer:#15307e; --same:#21419a; --sel:#2b52b8;
  --given:#ffffff;
  --hint:#c9b0ff; --hint-soft:#2c2a7a;
  --wall:{dark_wall};
  --glaze:radial-gradient(140% 100% at 18% 8%,rgba(170,195,255,.07),rgba(170,195,255,0) 50%),linear-gradient(180deg,rgba(0,0,0,0) 60%,rgba(0,0,20,.12));
  --tile-edge:#081538;
  --err-soft:#5a2350;
}}
html{{background:var(--bg)}}
body{{background-color:var(--bg);background-image:linear-gradient(180deg,var(--bg) 0,color-mix(in srgb,var(--bg) 82%,transparent) calc(env(safe-area-inset-top) + 64px),color-mix(in srgb,var(--bg) 0%,transparent) calc(env(safe-area-inset-top) + 190px)),radial-gradient(130% 70% at 50% 0%,rgba(255,255,255,.55),rgba(255,255,255,0) 60%),radial-gradient(120% 80% at 50% 110%,rgba(23,52,137,.10),transparent 60%),var(--wall);background-size:auto,auto,auto,200px 200px;background-position:0 0,0 0,0 0,center -12px;background-attachment:scroll}}
[data-theme="dark"] body{{background-image:linear-gradient(180deg,var(--bg) 0,color-mix(in srgb,var(--bg) 80%,transparent) calc(env(safe-area-inset-top) + 64px),color-mix(in srgb,var(--bg) 0%,transparent) calc(env(safe-area-inset-top) + 190px)),radial-gradient(120% 70% at 50% -5%,rgba(60,100,230,.30),rgba(60,100,230,0) 60%),radial-gradient(130% 80% at 50% 115%,rgba(0,0,0,.55),transparent 60%),var(--wall)}}
body::before{{display:none}}

/* header */
.brand{{font-size:28px;font-weight:700;color:var(--ink);font-variation-settings:"SOFT" 100,"opsz" 96;letter-spacing:-.015em}}
.brand .mark{{width:40px;height:40px;border-radius:10px;background:linear-gradient(150deg,#3a66e0,#18379a 55%,#0f2669);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.45),inset 0 -3px 0 rgba(0,0,20,.3),0 0 0 1px rgba(10,28,90,.5),0 8px 18px -6px rgba(16,40,130,.65);font-size:24px}}
.brand .mark::before{{content:"";position:absolute;inset:3px;border-radius:7px;border:1px solid rgba(255,255,255,.35)}}
.iconbtn{{color:var(--ink2)}}

/* chips as small glazed plaques */
.chip{{background:linear-gradient(180deg,var(--surface),var(--surface2));box-shadow:0 0 0 1px var(--tile-edge),0 2px 0 var(--tile-edge),0 8px 18px -10px rgba(15,36,99,.45);color:var(--ink2)}}
[data-theme="dark"] .chip{{background:linear-gradient(180deg,#183486,#122a70);box-shadow:0 0 0 1px #071233,0 2px 0 #050e2a,0 8px 18px -10px rgba(0,0,0,.8)}}
.chip.level{{color:var(--accent-ink)}}

/* board: a framed tile panel */
.board-wrap{{padding:11px;border-radius:24px;background:linear-gradient(155deg,#2d55c9 0%,#1a3a9e 30%,#132d80 62%,#0d2160 100%);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.32),inset 0 -3px 0 rgba(0,0,30,.35),0 0 0 1px rgba(8,24,80,.55),0 2px 0 #0b1d57,0 34px 70px -24px rgba(10,26,90,.65),0 8px 20px -10px rgba(10,26,90,.35)}}
.board-wrap::before{{inset:4px;border-radius:20px;border:1.2px solid rgba(255,255,255,.42);box-shadow:inset 0 0 0 2.5px rgba(10,30,100,.0),inset 0 0 0 3.6px rgba(255,255,255,.16)}}
.board-wrap::after{{content:"";position:absolute;inset:6px 12px;pointer-events:none;background:radial-gradient(circle,rgba(255,255,255,.62) 0 1.25px,transparent 1.7px) 0 0/11px 4px repeat-x,radial-gradient(circle,rgba(255,255,255,.62) 0 1.25px,transparent 1.7px) 0 100%/11px 4px repeat-x;background-repeat:round no-repeat,round no-repeat}}.board-wrap .orns::before{{content:"";position:absolute;inset:12px 6px;pointer-events:none;background:radial-gradient(circle,rgba(255,255,255,.62) 0 1.25px,transparent 1.7px) 0 0/4px 11px repeat-y,radial-gradient(circle,rgba(255,255,255,.62) 0 1.25px,transparent 1.7px) 100% 0/4px 11px repeat-y;background-repeat:no-repeat round,no-repeat round}}
[data-theme="dark"] .board-wrap{{background:linear-gradient(155deg,#2a4cb8 0%,#173489 35%,#0f2463 70%,#0a1a4c 100%);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.25),inset 0 -3px 0 rgba(0,0,0,.4),0 0 0 1px #030a24,0 2px 0 #030a24,0 34px 80px -20px rgba(0,0,0,.9)}}
.board{{background:#173489;gap:3px;border-radius:13px;box-shadow:0 0 0 1px rgba(5,18,70,.5),inset 0 0 0 1px rgba(0,0,0,.1)}}
[data-theme="dark"] .board{{background:#7d98e6}}
.box{{gap:1.5px;background:#cdd6ec}}
[data-theme="dark"] .box{{background:#2c4a9f}}
.cell{{background-color:var(--surface);background-image:var(--glaze);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),inset 0 -1px 0 rgba(15,36,99,.06)}}
[data-theme="dark"] .cell{{background-color:#10256a;box-shadow:inset 0 1px 0 rgba(170,195,255,.10),inset 0 -1px 0 rgba(0,0,20,.35)}}
/* hand-made tiles: each box glazed a hair differently */
.box:nth-child(2) .cell,.box:nth-child(6) .cell{{background-color:#fbfaf4}}
.box:nth-child(4) .cell,.box:nth-child(8) .cell{{background-color:#fdfcf8}}
.box:nth-child(3) .cell,.box:nth-child(7) .cell{{background-color:#fbfbf8}}
[data-theme="dark"] .box .cell{{background-color:#0f2263}}[data-theme="dark"] .box:nth-child(even) .cell{{background-color:#0e2060}}
.cell .v{{font-weight:500;color:var(--accent-ink);font-variation-settings:"SOFT" 100,"opsz" 72}}
.cell.given .v{{color:var(--given);font-weight:640;font-variation-settings:"SOFT" 50,"opsz" 72;text-shadow:0 .5px 0 rgba(255,255,255,.6),0 0 .6px rgba(14,36,112,.5)}}
[data-theme="dark"] .cell.given .v{{text-shadow:0 1px 6px rgba(150,180,255,.25)}}
[data-theme="dark"] .cell .v{{color:#a8c0ff}}
[data-theme="dark"] .cell.given .v{{color:#fff}}
.cell.peer{{background-color:var(--peer)}}
.cell.same{{background-color:var(--same)}}
.cell.sel{{background-color:var(--sel);box-shadow:inset 0 0 0 2.5px color-mix(in srgb,var(--accent) 70%,transparent),inset 0 0 14px rgba(33,72,189,.18)}}
[data-theme="dark"] .cell.sel{{box-shadow:inset 0 0 0 2.5px rgba(190,210,255,.85),inset 0 0 16px rgba(160,190,255,.25)}}
[data-theme="dark"] .cell.same .v{{color:#fff}}
[data-theme="dark"] .cell.peer,[data-theme="dark"] .box:nth-child(even) .cell.peer{{background-color:var(--peer)}}
[data-theme="dark"] .box:nth-child(even) .cell.same{{background-color:var(--same)}}
[data-theme="dark"] .box:nth-child(even) .cell.sel{{background-color:var(--sel)}}
.box .cell.peer{{background-color:var(--peer)}}.box .cell.same{{background-color:var(--same)}}.box .cell.sel{{background-color:var(--sel)}}
.box .cell.err{{background-color:var(--err-soft)}}
.orns i{{width:21px;height:21px;background:#173489}}
[data-theme="dark"] .orns i{{background:#c9d6ff;filter:drop-shadow(0 0 1.5px #10256a) drop-shadow(0 0 1.5px #10256a)}}

/* tools: porcelain buttons */
.tool{{text-shadow:0 0 2px var(--bg),0 0 5px var(--bg),0 0 9px var(--bg),0 0 14px var(--bg)}}
.tool .ic{{background-color:var(--surface);box-shadow:0 0 0 1px var(--tile-edge),0 3px 0 var(--tile-edge),0 10px 20px -10px rgba(15,36,99,.5)}}
.tool .ic::after{{content:"";position:absolute;inset:4px;border-radius:50%;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);pointer-events:none}}
.tool .ic{{position:relative}}
[data-theme="dark"] .tool .ic{{background-color:#14307f;box-shadow:0 0 0 1px #050e2a,0 3px 0 #050e2a,0 10px 22px -10px rgba(0,0,0,.9)}}

/* pad: painted porcelain tiles with corner ornaments */
.key{{border-radius:15px;background-color:var(--surface);background-image:{kc_l[0]},{kc_l[1]},{kc_l[2]},{kc_l[3]},var(--glaze);background-size:14px 14px,14px 14px,14px 14px,14px 14px,auto;background-position:5px 5px,calc(100% - 5px) 5px,5px calc(100% - 5px),calc(100% - 5px) calc(100% - 5px),0 0;background-repeat:no-repeat;box-shadow:0 0 0 1px var(--tile-edge),0 4px 0 var(--tile-edge),0 5px 0 rgba(15,36,99,.10),0 16px 24px -14px rgba(15,36,99,.55)}}
.key::before{{display:none}}.key .dg{{position:relative;line-height:1}}.key .dg::before{{content:"";position:absolute;left:50%;top:50%;width:1.42em;height:1.42em;border-radius:50%;transform:translate(-50%,-50%);border:1.3px solid color-mix(in srgb,var(--accent) 34%,transparent);box-shadow:inset 0 0 0 2.4px var(--surface),inset 0 0 0 3.3px color-mix(in srgb,var(--accent) 15%,transparent);pointer-events:none}}.key.erase::after{{content:"";position:absolute;left:50%;top:50%;width:1.42em;height:1.42em;border-radius:50%;transform:translate(-50%,-50%);border:1.3px solid color-mix(in srgb,var(--accent) 34%,transparent);box-shadow:inset 0 0 0 2.4px var(--surface),inset 0 0 0 3.3px color-mix(in srgb,var(--accent) 15%,transparent);pointer-events:none}}[data-theme="dark"] .key.erase::after{{box-shadow:inset 0 0 0 2.4px #132d79,inset 0 0 0 3.3px rgba(170,195,255,.14);border-color:rgba(170,195,255,.32)}}.notesmode .key.erase::after{{display:none}}.notesmode .key .dg::before,.colormode .key .dg::before,.centermode .key .dg::before{{display:none}}.notesmode .key::before,.centermode .key::before{{display:block}}[data-theme="dark"] .key .dg::before{{box-shadow:inset 0 0 0 2.4px #132d79,inset 0 0 0 3.3px rgba(170,195,255,.14);border-color:rgba(170,195,255,.32)}}.notesmode .key::before,.centermode .key::before{{transform:none;border:0;border-radius:0;box-shadow:none;width:11px;height:11px;max-height:none;aspect-ratio:auto;left:6px;top:6px}}
.key .dg,.key{{color:var(--accent-ink)}}
.key{{font-weight:560;font-variation-settings:"SOFT" 100,"opsz" 96}}
[data-theme="dark"] .key{{background-color:#132d79;background-image:{kc_d[0]},{kc_d[1]},{kc_d[2]},{kc_d[3]},var(--glaze);box-shadow:0 0 0 1px #050e2a,0 4px 0 #050e2a,0 16px 26px -14px rgba(0,0,0,.9);color:#c3d3ff}}

.key.locked{{background-image:linear-gradient(150deg,#3a66e0,#1a3a9e 60%,#122c7e);color:#fff}}
.notesmode .key{{background-color:var(--accent-softer)}}
[data-theme="dark"] .notesmode .key{{background-color:#1a3790}}

/* sheets: glazed plaques with a painted double rule */
.sheet{{background-color:var(--surface);box-shadow:0 0 0 1px var(--tile-edge),var(--shadow-lg)}}
.sheet::before{{content:"";position:absolute;inset:7px;border-radius:20px;border:1px solid color-mix(in srgb,var(--line-strong) 22%,transparent);box-shadow:inset 0 0 0 3px var(--surface),inset 0 0 0 4px color-mix(in srgb,var(--line-strong) 10%,transparent);pointer-events:none}}
[data-theme="dark"] .sheet{{background-color:#0f2263}}
.scrim{{background:rgba(8,22,80,.45)}}
.buildstamp{{margin:18px 0 2px;text-align:center;font-size:11.5px;font-weight:700;letter-spacing:.04em;color:var(--ink3);font-variant-numeric:tabular-nums}}
"""
open('/home/claude/sudoku/art/skin2.css', 'w').write(css)
print(len(css), len(light_wall))
