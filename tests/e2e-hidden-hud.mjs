// Hidden overlays must not intercept canvas gestures or visible HUD controls.
import {chromium} from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';
const base=process.argv.find(a=>a.startsWith('http'))||'http://127.0.0.1:4235/';
const out=path.resolve('test-results/hidden-hud',process.env.HUD_LABEL||'candidate');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--ignore-gpu-blocklist','--use-angle=d3d11']});
const checks=[];const check=(name,ok,detail='')=>{checks.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'}  ${name} ${JSON.stringify(detail)}`);};
try{
 for(const touch of [false,true]){
  const ctx=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}?quality=low&worldSpeed=1`);await page.locator('#start-btn:not(.hidden)').click({ timeout: 60000 });await page.waitForTimeout(600);
  const tag=touch?'touch':'desktop';
  const hit=await page.evaluate(()=>{
   const c=document.querySelector('.crash'),r=c.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
   const target=document.elementFromPoint(x,y);return{x,y,hidden:!c.classList.contains('show'),pointer:getComputedStyle(c).pointerEvents,intercepts:c.contains(target)};
  });
  check(`${tag}: hidden crash panel does not intercept the flight view`,hit.hidden&&!hit.intercepts,hit);
  // Use physical coordinates, not forced DOM clicks, so baseline interception is visible.
  const skip=await page.locator('[data-act=skiphints]').boundingBox();
  if(touch)await page.touchscreen.tap(skip.x+skip.width/2,skip.y+skip.height/2);else await page.mouse.click(skip.x+skip.width/2,skip.y+skip.height/2);
  await page.waitForTimeout(200);
  const skipped=await page.evaluate(()=>({hidden:!document.querySelector('.hint').classList.contains('show'),paused:window.__helicoptea.paused,replay:window.__helicoptea.replay.active}));
  check(`${tag}: Skip tips responds through normal pointer input`,skipped.hidden&&!skipped.paused,skipped);
  if(!skipped.hidden||skipped.paused){await page.screenshot({path:path.join(out,`${tag}-intercepted-skip.png`)});await ctx.close();continue;}
  const hint=await page.evaluate(()=>{const h=document.querySelector('.hint'),r=h.getBoundingClientRect();return{hidden:!h.classList.contains('show'),intercepts:h.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
  check(`${tag}: hidden hint does not intercept the flight view`,hint.hidden&&!hint.intercepts,hint);
  await page.screenshot({path:path.join(out,`${tag}-after-skip.png`)});
  // Test camera input after dismissing the hint, independently of touch device-label reflow.
  const yaw=await page.evaluate(()=>window.__helicoptea.input.camOrbit.yaw);
  if(touch){
   const cdp=await ctx.newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:hit.x,y:hit.y,id:7}]});
   for(let i=1;i<=4;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:hit.x+i*10,y:hit.y,id:7}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{await page.mouse.move(hit.x,hit.y);await page.mouse.down();await page.mouse.move(hit.x+40,hit.y,{steps:4});await page.mouse.up();}
  const afterYaw=await page.evaluate(()=>window.__helicoptea.input.camOrbit.yaw);
  check(`${tag}: dragging through the hidden panel orbits the camera`,Math.abs(afterYaw-yaw)>0.1,{yaw,afterYaw});
  // A normal keyboard takeoff still works; a controlled crash fixture then exercises visible recovery UI.
  await page.keyboard.down('w');await page.waitForTimeout(900);await page.keyboard.up('w');
  check(`${tag}: takeoff works`,await page.evaluate(()=>window.__helicoptea.sim.heli.pos.y>0.1));
  await page.evaluate(()=>{const s=window.__helicoptea.sim;s.heli.body.setTranslation({x:s.heli.pos.x,y:0.025,z:s.heli.pos.z},true);s.heli.body.setLinvel({x:0,y:-5,z:0},true);});
  await page.waitForFunction(()=>window.__helicoptea.sim.state==='destroyed');
  const restart=page.locator('.crash [data-act=restart]');if(touch)await restart.tap();else await restart.click();
  await page.waitForFunction(()=>window.__helicoptea.sim.state==='flying');
  check(`${tag}: visible crash restart remains clickable`,true);
  check(`${tag}: no page errors`,errors.length===0,errors);
  await ctx.close();
 }
}finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,checks},null,2));}
process.exit(checks.some(c=>!c.ok)?1:0);
