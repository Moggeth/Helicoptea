// D-pad camera movement must depend on elapsed time, not display refresh rate.
// Real browser/pad input pipeline; emulated controller is not physical device acceptance.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:4236/';
const label = process.env.CAMERA_RATE_LABEL || 'candidate';
const out = path.resolve('test-results/camera-rate', label);
fs.mkdirSync(out, { recursive: true });
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-frame-rate-limit', '--disable-background-timer-throttling'] });
const results = [], checks = [];
const check = (name, ok, detail) => { checks.push({name, ok, detail}); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail || ''}`); };
try {
  for (const fps of [30, 60, 120]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => {
      window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({length: 17}, () => ({pressed: false, value: 0})) };
      navigator.getGamepads = () => [{...window.__pad, id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, mapping: 'standard', connected: true, timestamp: performance.now()}];
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}?fps=${fps}&quality=low&dynres=0&view=chase`);
    await page.locator('#start-btn:not(.hidden)').click();
    await page.waitForFunction(() => window.__helicoptea?.started);
    if (process.env.CAMERA_RATE_CAPTURE) await page.evaluate(() => {
      const stream = window.__helicoptea.renderer.domElement.captureStream(30);
      const recorder = new MediaRecorder(stream, {mimeType:'video/webm'}), chunks = [];
      window.__captureDone = new Promise(resolve => {
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = async () => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(new Blob(chunks, {type:'video/webm'}));
          stream.getTracks().forEach(track => track.stop());
        };
      });
      window.__capture = recorder; recorder.start();
    });
    // Lift through the ordinary keyboard controls before orbiting a flying aircraft.
    await page.keyboard.down('w'); await page.waitForTimeout(900); await page.keyboard.up('w');
    await page.waitForTimeout(400);
    const sample = await page.evaluate(() => new Promise(resolve => {
      const H = window.__helicoptea, original = H.input.pollGamepad.bind(H.input);
      const sample = { seconds: 0, frames: 0, yaw: 0, zoom: 0 };
      window.__pad.buttons[14] = {pressed:true, value:1}; // D-pad left
      window.__pad.buttons[13] = {pressed:true, value:1}; // D-pad down / zoom out
      H.input.pollGamepad = dt => {
        const before = {...H.input.camOrbit};
        original(dt);
        sample.seconds += dt; sample.frames++;
        sample.yaw += H.input.camOrbit.yaw - before.yaw;
        sample.zoom += H.input.camOrbit.zoom - before.zoom;
        if (sample.seconds >= 1) {
          window.__pad.buttons[14] = window.__pad.buttons[13] = {pressed:false, value:0};
          H.input.pollGamepad = original;
          resolve({...sample, mode:H.camMode, state:H.sim.state});
        }
      };
    }));
    sample.cap = fps; sample.yawPerSecond = sample.yaw / sample.seconds; sample.zoomPerSecond = sample.zoom / sample.seconds;
    results.push(sample);
    check(`cap ${fps} D-pad orbit is 1.8 radians/sec`, Math.abs(sample.yawPerSecond - 1.8) < 0.03, JSON.stringify(sample));
    check(`cap ${fps} D-pad zoom is 1.2 units/sec`, Math.abs(sample.zoomPerSecond - 1.2) < 0.03);
    await page.screenshot({path:path.join(out, `${fps}-orbit.png`)});
    await page.keyboard.press('u'); await page.waitForTimeout(300);
    check(`cap ${fps} recenter clears camera offsets`, await page.evaluate(() => Object.values(window.__helicoptea.input.camOrbit).every(v => v === 0)));
    await page.keyboard.press('c'); await page.waitForTimeout(250);
    check(`cap ${fps} camera cycling works`, await page.evaluate(() => window.__helicoptea.camMode === 'cockpit'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    check(`cap ${fps} pause works`, await page.evaluate(() => window.__helicoptea.paused));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    check(`cap ${fps} resume works without errors`, await page.evaluate(() => !window.__helicoptea.paused) && errors.length === 0, errors.join(';'));
    if (process.env.CAMERA_RATE_CAPTURE) {
      const data = await page.evaluate(() => { window.__capture.stop(); return window.__captureDone; });
      fs.writeFileSync(path.join(out, `${fps}-flight-camera.webm`), Buffer.from(data, 'base64'));
    }
    await context.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({base,label,results,checks}, null, 2));
}
if (checks.some(c => !c.ok)) process.exitCode = 1;
