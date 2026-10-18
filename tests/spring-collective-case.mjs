// Shared by standalone keyboard QA and native mouse acceptance; no pointer capture is requested here.
export async function springCollectiveCase(page) {
  await page.keyboard.up('w');
  const frame = await page.evaluate(() => {
    const g = window.__helicoptea;
    g.input.clearAll(); g.doAction('restart'); return g.frames;
  });
  await page.waitForFunction(frame => {
    const g = window.__helicoptea;
    return g.frames > frame && !g.paused && g.sim.heli && g.sim.state === 'flying';
  }, frame);
  const neutral = await page.evaluate(() => {
    const g = window.__helicoptea;
    g.input.centreMouse(); g.input.clearAll();
    if (g.sim.assist) g.doAction('assist');
    return g.CFG.collective.neutral / g.CFG.heli.thrustToWeight;
  });
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(neutral => {
      const g = window.__helicoptea;
      return g.input.ctl.collective > 0.9 && g.sim.heli?.collective > neutral + 0.05;
    }, neutral, { timeout: 5000 });
    const held = await page.evaluate(() => window.__helicoptea.sim.heli.collective);
    await page.keyboard.up('w');
    await page.waitForFunction(({ held, neutral }) => {
      const g = window.__helicoptea, h = g.sim.heli;
      return h && Math.abs(g.input.ctl.collective) < 0.05 && h.collective <= neutral + 0.02 && h.collective < held - 0.05;
    }, { held, neutral }, { timeout: 5000 });
    return { held, released: await page.evaluate(() => window.__helicoptea.sim.heli.collective), neutral };
  } finally { await page.keyboard.up('w'); }
}
