// measure how far the board, tools and pad move when a hint opens (iPhone home-screen 874 and Safari 752)
const { chromium, serve, phone, wait } = require('./lib');
const file = process.argv[2] || '/home/claude/work/int/dist/index.html', tag = process.argv[3] || 'a';
(async () => {
  const b = await chromium.launch();
  for (const h of [874, 752]) {
    const { srv, url } = await serve(file, h === 874);
    const { ctx, p } = await phone(b, { h, store: { 'negen.v1': JSON.stringify({ coach: 1 }) } });
    await p.goto(url); await wait(2200);
    await p.evaluate(() => document.querySelector('#homeGo').click()); await wait(1500);
    const m = () => p.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), Math.round(b.width)]; };
      return { board: r('#board'), status: r('.status'), hint: getComputedStyle(document.querySelector('#hintbox')).display === 'none' ? null : r('#hintbox'), tools: r('.tools'), pad: r('#pad'), key: r('.key'), sh: document.documentElement.scrollHeight, ih: innerHeight }; });
    const a = await m();
    await p.screenshot({ path: `/home/claude/work/qa/l/${tag}-${h}-0.png` });
    const res = [a];
    for (let k = 0; k < 3; k++) { await p.evaluate(() => document.querySelector(document.querySelector('#hintbox.show') ? '#hintNext' : '#tHint').click()); await wait(900); res.push(await m()); await p.screenshot({ path: `/home/claude/work/qa/l/${tag}-${h}-${k + 1}.png` }); }
    await p.evaluate(() => document.querySelector('#hintClose').click()); await wait(900); res.push(await m());
    console.log(h, JSON.stringify(res.map((x) => ({ b: x.board, s: x.status, h: x.hint, t: x.tools, p: x.pad, k: x.key, sh: x.sh }))));
    console.log('errs', JSON.stringify(p.errs));
    await ctx.close(); srv.close();
  }
  await b.close();
})();
