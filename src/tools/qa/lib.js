// quick QA helpers for the integrated build: serve dist over http with the iPhone safe areas emulated
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
function serve(file, inset) {
  const ROOT = path.dirname(file);
  let html = fs.readFileSync(file, 'utf8');
  if (inset) html = html.replace(/env\(safe-area-inset-top(,[^)]*)?\)/g, '62px').replace(/env\(safe-area-inset-bottom(,[^)]*)?\)/g, '34px');
  const srv = http.createServer((q, s) => {
    let f = decodeURIComponent(q.url.split('?')[0].split('#')[0]);
    if (f === '/' || f === '/index.html') { s.writeHead(200, { 'Content-Type': 'text/html' }); s.end(html); return; }
    const fp = path.join(ROOT, f);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { s.writeHead(404); s.end(); return; }
    s.writeHead(200); fs.createReadStream(fp).pipe(s);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, url: `http://localhost:${srv.address().port}/` })));
}
async function phone(b, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: opts.w || 402, height: opts.h || 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: opts.dpr || 1, colorScheme: opts.scheme || 'light' });
  if (opts.store) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('qa-init')) { sessionStorage.setItem('qa-init', '1'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); } }, opts.store);
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) p.errs.push('console: ' + m.text()); });
  return { ctx, p };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = { chromium, serve, phone, wait };
