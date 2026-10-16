// Normal-input hint transitions and stable-node regression. Mutation counts are DOM work, not FPS.
import {chromium} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const base=process.argv.find(a=>a.startsWith('http'))||'http://127.0.0.1:4240/';
const out=path.resolve('test-results/hints',process.env.HINT_LABEL||'candidate');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--ignore-gpu-blocklist','--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const checks=[];const check=(name,ok,detail='')=>{checks.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'}  ${name} ${JSON.stringify(detail)}`);};
try{
 for(const mode of ['keyboard','touch','gamepad']){
  const touch=mode==='touch',pad=mode==='gamepad';
  const ctx=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  if(pad)await ctx.addInitScript(()=>{window.__pad={axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>[{...window.__pad,index:0,connected:true,mapping:'standard',id:'Xbox 360 Controller (XInput STANDARD GAMEPAD)',timestamp:performance.now()}];});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}?quality=medium&dynres=0&worldSpeed=1`);
  await page.locator('#start-btn:not(.hidden)').click();
  await page.waitForFunction(()=>document.querySelector('.hint')?.classList.contains('show'));
  const prefix=mode;
  if(touch){await page.waitForFunction(()=>document.querySelector('.hint .txt').textContent.includes('left stick'));}
  if(pad){await page.evaluate(()=>window.__pad.buttons[1]={pressed:true,value:1});await page.waitForTimeout(120);await page.evaluate(()=>window.__pad.buttons[1]={pressed:false,value:0});await page.waitForFunction(()=>document.querySelector('.hint .txt').textContent.includes('L-stick'));}
  const before=await page.locator('.hint').textContent();
  check(`${prefix}: lift hint uses current device`,before.includes(touch?'left stick':pad?'L-stick':'W'),before);
  const work=await page.evaluate(()=>new Promise(resolve=>{
   const hint=document.querySelector('.hint'),text=hint.querySelector('.txt'),node=text.firstChild,H=window.__helicoptea,start=performance.now(),first=H.frames;
   let childChanges=0,attributes=0;const observer=new MutationObserver(records=>{for(const r of records){if(r.type==='childList')childChanges++;else attributes++;}});
   observer.observe(hint,{subtree:true,childList:true,attributes:true});
   setTimeout(()=>{observer.disconnect();resolve({childChanges,attributes,frames:H.frames-first,elapsed:performance.now()-start,sameNode:node===text.firstChild});},1500);
  }));
  check(`${prefix}: unchanged hint keeps its text nodes`,work.sameNode&&work.childChanges===0,work);
  await page.screenshot({path:path.join(out,`${prefix}-lift.png`)});
  // A real keyboard event switches the label even in the touch-capable context.
  await page.keyboard.press('u');
  await page.waitForFunction(()=>document.querySelector('.hint .txt').textContent.includes('Hold W'));
  check(`${prefix}: device change refreshes key labels`,true);
  await page.keyboard.down('w');await page.waitForTimeout(1300);await page.keyboard.up('w');
  await page.waitForFunction(()=>document.querySelector('.hint .step').textContent==='2');
  check(`${prefix}: takeoff advances to hook guidance`,(await page.locator('.hint .txt').textContent()).includes('bag'));
  await page.screenshot({path:path.join(out,`${prefix}-hook.png`)});
  await page.locator('[data-act=skiphints]').click();await page.waitForFunction(()=>!document.querySelector('.hint').classList.contains('show'));
  check(`${prefix}: Skip tips hides guidance`,true);
  await page.keyboard.press('r');await page.waitForTimeout(200);await page.keyboard.press('Escape');
  await page.waitForSelector('.overlay.show details.more');await page.evaluate(()=>document.querySelector('.overlay.show details.more').setAttribute('open',''));   // under More settings on touch
  await page.locator('[data-act=resethints]').click();
  await page.waitForFunction(()=>document.querySelector('.hint').classList.contains('show')&&document.querySelector('.hint .step').textContent==='1');
  check(`${prefix}: replay tips restores first step`,true);
  check(`${prefix}: no page errors`,errors.length===0,errors);
  await ctx.close();
 }
}finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,checks},null,2));}
process.exit(checks.some(c=>!c.ok)?1:0);
