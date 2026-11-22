// Negen regression + screenshot harness.
// Usage: node check.js <path/to/dist/index.html> <outdir> [--quick]   (serves the file's folder on http://localhost)
// Prints a JSON report. Screens: launch, game, play, hint, win, stats, settings for 3 viewports.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path'), http = require('http');
const file = path.resolve(process.argv[2] || '/home/claude/sudoku/dist/index.html');
// Served over http://localhost (a secure context, like the real https site). file:// loses localStorage on reload in Chromium.
const ROOT = path.dirname(file), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
const server = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split('?')[0].split('#')[0]); if (f.endsWith('/')) f += path.basename(file); const fp = path.join(ROOT, f); if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); fs.createReadStream(fp).pipe(s); });
let URL0 = '';
const out = process.argv[3] || '/tmp/negen-shots'; fs.mkdirSync(out, { recursive: true });
const quick = process.argv.includes('--quick');
const VIEWS = [
  ['safari', { viewport: { width: 402, height: 752 }, isMobile: true, hasTouch: true, colorScheme: 'light', deviceScaleFactor: 2 }],
  ['app', { viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, colorScheme: 'dark', deviceScaleFactor: 2 }],
  ['desk', { viewport: { width: 1440, height: 900 }, colorScheme: 'light', deviceScaleFactor: 1 }],
];
const vis = (p, s) => p.locator(s).first().isVisible().catch(() => false);
async function press(p, s, touch) { if (touch) await p.tap(s); else await p.click(s); }
// Gets from a fresh first launch into a running expert game. Contract: first-run primary CTA is #welcomeGo or #homeGo;
// relaunch-with-game-in-progress continue button is #homeContinue (or #btnResume on the paused board).
// If the first-run flow changes, update ONLY this function (and say so).
async function enterGame(p, touch) {
  for (const s of ['#welcomeGo', '#homeGo']) if (await vis(p, s)) { await press(p, s, touch); await p.waitForTimeout(500); }
  if (!(await vis(p, '#newSheet.show'))) { await press(p, '#btnNew', touch); await p.waitForTimeout(500); }
  await press(p, '.lvlbtn[data-lv="expert"]', touch); await p.waitForTimeout(1400);
}
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); URL0 = `http://localhost:${server.address().port}/${path.basename(file)}`;
  const b = await chromium.launch(); const report = { file, url: URL0, views: {}, errors: [] };
  for (const [name, opts] of quick ? VIEWS.slice(0, 2) : VIEWS) {
    const ctx = await b.newContext(opts); const touch = !!opts.hasTouch; const r = (report.views[name] = {});
    // first run, but with the one-time coach bubble already dismissed so it does not cover the tools in screenshots
    await ctx.addInitScript(() => { if (!localStorage.getItem('negen.v1')) localStorage.setItem('negen.v1', JSON.stringify({ coach: 1 })); });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => report.errors.push(name + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) report.errors.push(name + ' console: ' + m.text()); });
    const shot = async (k) => { await p.screenshot({ path: `${out}/${name}-${k}.png` }); };
    const fit = async () => p.evaluate(() => [document.documentElement.scrollHeight, innerHeight, document.documentElement.scrollWidth, innerWidth]);
    try {
      await p.goto(URL0); await p.waitForTimeout(1500); await shot('01-launch');
      await enterGame(p, touch); await shot('02-game'); r.gameFit = await fit();
      const G = await p.evaluate(() => JSON.parse(localStorage.getItem('negen.v1')).game);
      const empties = G.values.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
      for (const i of empties.slice(0, 12)) { await press(p, `.cell[data-i="${i}"]`, touch); await p.keyboard.press('Digit' + G.solution[i]); }
      await press(p, `.cell[data-i="${empties[14]}"]`, touch); await p.waitForTimeout(500); await shot('03-play');
      // relaunch with a game in progress (the most common launch): must offer a way straight back into the game
      await p.reload(); await p.waitForTimeout(1500); await shot('03b-relaunch');
      for (const s of ['#homeContinue', '#btnResume']) if (await vis(p, s)) { await press(p, s, touch); await p.waitForTimeout(700); break; }
      await press(p, `.cell[data-i="${empties[14]}"]`, touch); await p.waitForTimeout(300);
      await press(p, '#tHint', touch); await p.waitForTimeout(300); await press(p, '#hintNext', touch); await p.waitForTimeout(900); await shot('04-hint'); r.hintFit = await fit();
      await press(p, '#hintClose', touch); await p.waitForTimeout(300);
      const G2 = await p.evaluate(() => JSON.parse(localStorage.getItem('negen.v1')).game);
      for (let i = 0; i < 81; i++) { if (G2.values[i]) continue; await press(p, `.cell[data-i="${i}"]`, touch); await p.keyboard.press('Digit' + G2.solution[i]); }
      await p.waitForTimeout(3200); await shot('05-win'); r.winText = (await p.textContent('#winSheet')).replace(/\s+/g, ' ').trim().slice(0, 160);
      await press(p, '#winStatsBtn', touch); await p.waitForTimeout(600); await shot('06-stats');
      await p.keyboard.press('Escape'); await p.waitForTimeout(400);
      await press(p, '#btnMenu', touch); await p.waitForTimeout(600); await shot('07-settings');
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    } catch (e) { report.errors.push(name + ' FLOW: ' + e.message.split('\n')[0]); await shot('99-fail').catch(() => {}); }
    await ctx.close();
  }
  // input semantics (phone)
  try {
    const ctx = await b.newContext(VIEWS[1][1]); const p = await ctx.newPage(); p.on('pageerror', (e) => report.errors.push('input: ' + e.message));
    await ctx.addInitScript(() => { if (!localStorage.getItem('negen.v1')) localStorage.setItem('negen.v1', JSON.stringify({ coach: 1 })); });
    await p.goto(URL0); await p.waitForTimeout(1200); await enterGame(p, true);
    const empty = await p.evaluate(() => JSON.parse(localStorage.getItem('negen.v1')).game.values.findIndex((v) => !v));
    await p.tap(`.cell[data-i="${empty}"]`);
    const k = await p.$('.key[data-d="5"]'); const bb = await k.boundingBox();
    await p.mouse.move(bb.x + 20, bb.y + 20); await p.mouse.down(); await p.waitForTimeout(50);
    const v1 = await p.evaluate((i) => document.querySelector(`.cell[data-i="${i}"] .v`)?.textContent, empty); await p.mouse.up();
    const k3 = await p.$('.key[data-d="3"]'); const b3 = await k3.boundingBox();
    await p.mouse.move(b3.x + 20, b3.y + 20); await p.mouse.down(); await p.waitForTimeout(600); await p.mouse.up();
    const locked = await p.evaluate((i) => [document.querySelector(`.cell[data-i="${i}"] .v`)?.textContent, document.querySelector('.key.locked')?.dataset.d], empty);
    await p.click('.key.locked'); await p.click('#tHint'); await p.click(`.cell[data-i="${empty}"]`);
    const hintStays = await p.evaluate(() => getComputedStyle(document.querySelector('#hintbox')).display);
    report.input = { pointerdownCommits: v1 === '5', longPressLocksAndReverts: locked[0] === '5' && locked[1] === '3', hintSurvivesCellTap: hintStays !== 'none' };
    await ctx.close();
  } catch (e) { report.errors.push('input FLOW: ' + e.message.split('\n')[0]); }
  const bad = [];
  for (const [n, r] of Object.entries(report.views)) { for (const k of ['gameFit', 'hintFit']) if (r[k] && (r[k][0] > r[k][1] + 1 || r[k][2] > r[k][3] + 1)) bad.push(`${n} ${k} overflow ${r[k]}`); }
  if (report.input) for (const [k, v] of Object.entries(report.input)) if (!v) bad.push('input ' + k + ' FAILED');
  report.pass = !bad.length && !report.errors.length; report.problems = bad;
  console.log(JSON.stringify(report, null, 1)); await b.close(); server.close();
})();
