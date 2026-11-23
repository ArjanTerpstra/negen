// playing + docked hint, home-screen app sizes (insets 62/34): does the page fit, do the keys stay put?
const { chromium, serve, wait } = require('./lib');
(async () => {
  const b = await chromium.launch();
  const { srv, url } = await serve(process.argv[2] || '/home/claude/work/int/dist/index.html', true);
  for (const [w, h] of [[402, 874], [393, 852], [440, 956], [375, 812]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('q')) { sessionStorage.setItem('q', '1'); localStorage.setItem('negen.v1', JSON.stringify({ coach: 1 })); } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url); await wait(2000); await p.evaluate(() => document.querySelector('#homeGo').click()); await wait(1400);
    const m = () => p.evaluate(() => [document.documentElement.scrollHeight, JSON.stringify(document.querySelector('#pad').getBoundingClientRect()), Math.round(document.querySelector('.key').getBoundingClientRect().height * 10) / 10]);
    const a = await m();
    for (let s = 0; s < 2; s++) { await p.evaluate(() => document.querySelector(document.querySelector('#hintbox.show') ? '#hintNext' : '#tHint').click()); await wait(700); }
    const c = await m(); const hb = await p.evaluate(() => { const r = document.querySelector('#hintbox').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height), document.body.classList.contains('hintdock') ? 'dock' : 'old']; });
    console.log(`${w}x${h}`, 'play scrollH', a[0], 'key', a[2], '| hint scrollH', c[0], 'padSame', a[1] === c[1], 'panel', hb, JSON.stringify(errs));
    await ctx.close();
  }
  srv.close(); await b.close();
})();
