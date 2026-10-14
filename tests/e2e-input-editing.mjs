// Editing tuning JSON must not restart a flight, move the camera, or swallow game-key letters.
import {chromium} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const base=process.argv.find(a=>a.startsWith('http'))||'http://127.0.0.1:4238/';
const out=path.resolve('test-results/input-editing',process.env.INPUT_LABEL||'candidate');
fs.mkdirSync(out,{recursive:true});
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome'].find(p=>fs.existsSync(p));
const browser=await chromium.launch({executablePath,headless:true,args:['--ignore-gpu-blocklist','--use-angle=d3d11']});
const checks=[];
const check=(name,ok,detail='')=>{checks.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'}  ${name} ${JSON.stringify(detail)}`);};
try {
  const page=await browser.newPage({viewport:{width:1280,height:720}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}?quality=low`);
  await page.locator('#start-btn:not(.hidden)').click();
  await page.waitForTimeout(600);
  await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  await page.click('[data-act=tuning]');
  await page.click('[data-act=tuneImport]');
  const text='{"version":1,"global":{"coasting":0.8},"aircraft":{}}';
  const before=await page.evaluate(()=>{
    const H=window.__helicoptea;
    window.__editField=document.querySelector('.tune-import textarea');
    return {flight:H.recorder.current.id,camera:H.camMode,y:H.sim.heli.pos.y};
  });
  // fill() only sends an input event and would hide this bug: use actual keydown/keyup.
  await page.keyboard.type(text,{delay:15});
  await page.waitForTimeout(250);
  const after=await page.evaluate(()=>{
    const H=window.__helicoptea;
    return {value:window.__editField.value,connected:window.__editField.isConnected,paused:H.paused,
      flight:H.recorder.current.id,camera:H.camMode,y:H.sim.heli?.pos.y};
  });
  check('typing JSON retains every character',after.value===text,after);
  check('typing in the importer keeps the game paused',after.paused&&after.connected);
  check('typing does not restart the recorded flight or change camera',after.flight===before.flight&&after.camera===before.camera,{before,after});
  await page.screenshot({path:path.join(out,'typed-import.png')});
  if(after.paused&&after.connected) {
    await page.keyboard.press('Home');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    check('textarea navigation and newline retain native behaviour',await page.locator('.tune-import textarea').inputValue()===text+'\n');
    await page.click('[data-act=tuneImportApply]');
    check('typed tuning applies through the real importer',await page.evaluate(()=>window.__helicoptea.tuning.getGlobal('coasting')===0.8));
    await page.click('[data-act=tuneResetAll]');
    check('reset restores the shipped tuning after the test',await page.evaluate(()=>window.__helicoptea.tuning.getGlobal('coasting')===1));
    await page.click('[data-act=tuneImport]');
    await page.keyboard.press('Escape');
    check('Escape closes the import box but retains the board',await page.locator('.tune-import').evaluate(el=>el.classList.contains('hidden'))&&await page.locator('.tune-panel').isVisible());
    await page.keyboard.press('Escape');
    await page.locator('[data-act=tuning]').waitFor({state:'visible',timeout:3000});
    check('Escape returns from board to paused menu',await page.locator('[data-act=tuning]').isVisible());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await page.keyboard.press('r');await page.waitForTimeout(200);
    check('R still restarts during flight',await page.evaluate(()=>!window.__helicoptea.paused&&window.__helicoptea.sim.heli.pos.y<0.07));
    await page.keyboard.press('c');await page.waitForTimeout(150);
    check('C still switches the flight camera',await page.evaluate(()=>window.__helicoptea.camMode==='cockpit'));
  }
  check('input editing has no page errors',errors.length===0,errors);
} finally {await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,checks},null,2));}
if(checks.some(c=>!c.ok))process.exitCode=1;
