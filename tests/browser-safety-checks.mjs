import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { chromium, desktopSafeChromium, blockNativePointerLock, startupTimeout } from '../tools/browser-safety.mjs';

function fixture(fail = false) {
  const scripts = [], contexts = [], launches = [];
  const context = () => {
    const c = { closed: false, timeouts: [], setDefaultTimeout(ms) { this.timeouts.push(ms); }, setDefaultNavigationTimeout(ms) { this.timeouts.push(ms); }, async addInitScript(script) { if (fail) throw Error('injection failed'); scripts.push(script); }, async close() { c.closed = true; } };
    contexts.push(c);
    return c;
  };
  const browser = { async newContext() { return context(); }, async newPage() { const c = context(); return { context: () => c }; } };
  return { type: { async launch(options) { launches.push(options); return browser; } }, browser, scripts, contexts, launches };
}

test('Windows protects explicit contexts and convenience pages before returning them', async () => {
  const f = fixture();
  const b = await desktopSafeChromium(f.type, 'win32').launch({ headless: true });
  await b.newContext();
  await b.newPage();
  assert.deepEqual(f.scripts, [blockNativePointerLock, blockNativePointerLock]);
});

test('a failed safety injection closes the context and rejects creation', async () => {
  for (const method of ['newContext', 'newPage']) {
    const f = fixture(true);
    const b = await desktopSafeChromium(f.type, 'win32').launch();
    await assert.rejects(b[method](), /injection failed/);
    assert.equal(f.contexts[0].closed, true);
  }
});

test('Linux acceptance retains the native browser API', async () => {
  const f = fixture();
  const b = await desktopSafeChromium(f.type, 'linux', false).launch();
  assert.equal(b, f.browser);
  await b.newPage();
  assert.equal(f.scripts.length, 0);
});

test('CI contexts allow slow startup while Linux native capture stays available', async () => {
  const f = fixture();
  const b = await desktopSafeChromium(f.type, 'linux', true).launch();
  await b.newContext();
  await b.newPage();
  assert.deepEqual(f.scripts, []);
  assert.deepEqual(f.contexts.map(c => c.timeouts), [[120000, 120000], [120000, 120000]]);
});

test('WebKit retains pointer protection and CI deadlines without Chromium-only flags', async () => {
  const f = fixture(); f.type.name = () => 'webkit';
  const b = await desktopSafeChromium(f.type, 'win32', true).launch({ headless: true });
  await b.newContext();
  assert.deepEqual(f.launches, [{ headless: true }]);
  assert.deepEqual(f.scripts, [blockNativePointerLock]);
  assert.deepEqual(f.contexts[0].timeouts, [120000, 120000]);
});

test('browser tests cannot silently bypass the shared launcher', () => {
  for (const folder of ['../tests/', '../tools/']) {
    for (const file of fs.readdirSync(new URL(folder, import.meta.url), { recursive: true })) {
      if (!file.endsWith('.mjs') || file === 'browser-safety.mjs') continue;
      const source = fs.readFileSync(new URL(folder + file.replaceAll('\\', '/'), import.meta.url), 'utf8');
      assert.doesNotMatch(source, /(?:from\s*|import\s*\()(['"])playwright-core\1/, file);
    }
  }
});

const executablePath = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => p && fs.existsSync(p));
test('real Windows Chromium rejects capture after clicks, navigation and in frames', { skip: process.platform !== 'win32' || !executablePath, timeout: startupTimeout(30000) }, async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const url = 'data:text/html,' + encodeURIComponent('<button onclick="this.requestPointerLock().catch(e=>document.body.dataset.result=e.name+\':\'+e.message)">Capture</button><iframe srcdoc="<p>frame</p>"></iframe>');
  try {
    for (const convenience of [false, true]) {
      const context = convenience ? null : await browser.newContext();
      const page = convenience ? await browser.newPage() : await context.newPage();
      for (let i = 0; i < 2; i++) {
        await page.goto(url);
        await page.locator('button').click();
        await page.waitForFunction(() => document.body.dataset.result);
        assert.match(await page.locator('body').getAttribute('data-result'), /^NotAllowedError:Native pointer capture is disabled/);
        assert.equal(await page.evaluate(() => document.pointerLockElement), null);
        const frame = page.frames().find((f) => f !== page.mainFrame());
        const result = await frame.evaluate(async () => {
          try { await document.body.requestPointerLock(); return 'unexpected success'; }
          catch (e) { return e.message; }
        });
        assert.match(result, /^Native pointer capture is disabled/);
      }
      await (context || page.context()).close();
    }
  } finally { await browser.close(); }
});
