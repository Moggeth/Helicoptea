// Exercise real phone batches across all aircraft/cockpit switches, with the Windows pointer guard.
import { chromium, startupTimeout } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
const base = process.argv.find(a => a.startsWith('http')) || 'http://localhost:4178/';
const executablePath = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(p => p && fs.existsSync(p));
const results = [], errors = [];
const check = (name, ok, detail) => {
  results.push({name, ok, detail});
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${JSON.stringify(detail)}`);
};
const browser = await chromium.launch({executablePath, headless: true});
try {
  const context = await browser.newContext({viewport: {width: 412, height: 891}, hasTouch: true});
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?quality=medium&phone=1&hints=0&lesson=0&record=0');
  await page.waitForSelector('#start-btn:not(.hidden)', {timeout: startupTimeout(60000)});
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await page.evaluate(() => window.__helicoptea.doAction('skiphints'));
  check('phone batching is active', await page.evaluate(() => window.__helicoptea.phone?.members.length > 0));
  for (const id of ['micro', 'chinook', 'skycrane']) {
    const frame = await page.evaluate(id => {
      const H = window.__helicoptea; H.setAircraft(id); H.setView('chase'); return H.frames;
    }, id);
    await page.waitForFunction(f => window.__helicoptea.frames > f + 3, frame);
    const before = await page.evaluate(() => window.__helicoptea.phone.stats.ejected);
    for (const mode of ['cockpit', 'chase', 'cockpit', 'chase']) {
      const f = await page.evaluate(mode => {const H = window.__helicoptea; H.setView(mode); return H.frames;}, mode);
      await page.waitForFunction(({f, mode}) => {
        const H = window.__helicoptea; return H.frames > f + 3 && H.camMode === mode;
      }, {f, mode}, {timeout: 60000});
    }
    const after = await page.evaluate(() => window.__helicoptea.phone.stats.ejected);
    check(`${id}: cockpit round trips retain phone batches`, before === after, {before, after});
  }
  const sight = await page.evaluate(() => {
    const H = window.__helicoptea, members = H.phone.members;
    let live = 0; H.view.scene.traverse(o => {if (o.userData.sightMilk) live++;});
    return {live, batched: members.filter(m => !m.dead && m.o.userData.sightMilk).length};
  });
  check('milk sight-level geometry remains live outside immutable batches', sight.live > 0 && sight.batched === 0, sight);
  check('no browser exceptions during phone aircraft/camera switches', errors.length === 0, errors);
} finally {
  await browser.close();
  fs.mkdirSync('test-results/phone-batches', {recursive: true});
  fs.writeFileSync('test-results/phone-batches/results.json', JSON.stringify({results, errors}, null, 2));
}
if (results.some(r => !r.ok)) process.exitCode = 1;
