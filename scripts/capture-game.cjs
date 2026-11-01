// Visual smoke check for Game Mode: opens it at a desktop size and a phone-touch size, starts a match, plays a little and
// captures the screens (title, kickoff, shot charge, play, pause), printing console errors and the final game state.
// Not part of `npm test` or CI, and not deployed. Needs the `playwright` package with a browser installed.
// Usage: node scripts/capture-game.cjs [outDir]   (default ./game-shots)
/* global __dirname, process, console, document */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || 'game-shots');
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (file.endsWith(path.sep)) file += 'index.html';
  fs.readFile(file, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); res.end(d); } });
}).listen(0, async () => {
  const url = `http://localhost:${server.address().port}/index.html?game`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const sizes = [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }]];
  for (const [name, options] of sizes) {
    const ctx = await browser.newContext(options);
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(String(e)));
    tab.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await tab.goto(url);
    await tab.waitForTimeout(500);
    await tab.click('#game-mode-toggle');
    await tab.waitForTimeout(800);
    await tab.screenshot({ path: `${out}/${name}-title.png` });
    await tab.click('text=Kick off');
    await tab.waitForTimeout(2500);
    await tab.screenshot({ path: `${out}/${name}-kickoff.png` });
    if (name === 'desktop') {
      await tab.keyboard.down('ArrowRight');
      await tab.keyboard.down('KeyL');
      await tab.waitForTimeout(1800);
      await tab.keyboard.up('ArrowRight');
      await tab.keyboard.up('KeyL');
      await tab.keyboard.press('KeyJ');
      await tab.waitForTimeout(900);
      await tab.keyboard.down('KeyK');
      await tab.waitForTimeout(500);
      await tab.screenshot({ path: `${out}/${name}-charge.png` });
      await tab.keyboard.up('KeyK');
      await tab.waitForTimeout(2500);
      await tab.screenshot({ path: `${out}/${name}-play.png` });
      await tab.keyboard.press('Escape');
      await tab.waitForTimeout(300);
      await tab.screenshot({ path: `${out}/${name}-pause.png` });
    } else {
      // First run: the tips card is up. Dismiss it, then drag the left thumb 45 degrees down-right and measure the real movement.
      await tab.screenshot({ path: `${out}/${name}-tips.png` });
      await tab.click('text=Got it');
      await tab.waitForTimeout(300);
      const cdp = await ctx.newCDPSession(tab);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      const where = async () => (await tab.evaluate(() => document.querySelector('#game-root').dataset.activeAt)).split(',').map(Number);
      const [x0, y0] = await where();
      await touch('touchStart', 140, 250);
      for (let k = 1; k <= 12; k += 1) { await touch('touchMove', 140 + k * 5, 250 + k * 5); await tab.waitForTimeout(30); }
      await tab.waitForTimeout(700);
      await tab.screenshot({ path: `${out}/${name}-drag.png` });
      await tab.waitForTimeout(500);
      await touch('touchEnd');
      const [x1, y1] = await where();
      console.log(name, 'drag 45 deg down-right moved world', (x1 - x0).toFixed(2), (y1 - y0).toFixed(2), 'ratio y/x', ((y1 - y0) / (x1 - x0)).toFixed(2), '(1.28 = a 45 degree line on screen)');
      await tab.waitForTimeout(800);
      await tab.screenshot({ path: `${out}/${name}-play.png` });
    }
    const info = await tab.evaluate(() => ({ phase: document.querySelector('#game-root').dataset.gamePhase, score: document.querySelector('#game-root').dataset.score }));
    console.log(name, JSON.stringify(info), 'errors', JSON.stringify(errors));
    await ctx.close();
  }
  // Who gets the ball when it goes out: the human dribbles it over the top touchline, so the computer must get the throw-in.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const tab = await ctx.newPage();
    await tab.goto(url);
    await tab.waitForTimeout(500);
    await tab.click('#game-mode-toggle');
    await tab.waitForTimeout(600);
    await tab.click('text=Kick off');
    await tab.waitForTimeout(2200);
    await tab.keyboard.down('ArrowUp');
    await tab.keyboard.down('KeyL');
    let restart = '';
    for (let i = 0; i < 40 && !restart; i += 1) { await tab.waitForTimeout(250); restart = await tab.evaluate(() => document.querySelector('#game-root').dataset.restart); }
    await tab.keyboard.up('ArrowUp');
    await tab.keyboard.up('KeyL');
    await tab.screenshot({ path: `${out}/out-of-play.png` });
    console.log('human dribbled it out ->', restart || '(no restart seen)', '(expected throw-in:away)');
    await ctx.close();
  }
  await browser.close();
  server.close();
});
