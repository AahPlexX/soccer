// Visual smoke check: serves the app and captures the 2D and 3D board at desktop and phone sizes, printing console errors.
// Not part of `npm test` or CI, and not deployed. Needs the `playwright` package with a browser installed.
// Usage: node scripts/capture.cjs [outDir]   (default ./shots)
/* global __dirname, process, console */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || 'shots');
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  if (file.endsWith(path.sep)) file += 'index.html';
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(0, async () => {
  const url = `http://localhost:${server.address().port}/index.html`;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, width, height] of [['desktop', 1366, 800], ['phone', 390, 800]]) {
    const tab = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    tab.on('pageerror', (error) => errors.push(String(error)));
    tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await tab.goto(url);
    await tab.waitForTimeout(800);
    await tab.screenshot({ path: path.join(out, `${name}-2d.png`) });
    await tab.click('#view-3d-toggle');
    await tab.waitForTimeout(1500);
    await tab.screenshot({ path: path.join(out, `${name}-3d.png`) });
    console.log(name, 'console errors:', JSON.stringify(errors));
  }
  await browser.close();
  server.close();
});
