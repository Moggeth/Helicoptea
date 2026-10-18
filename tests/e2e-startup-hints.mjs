import {chromium, startupTimeout} from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';
const base=process.argv.find(a=>a.startsWith('http'))||'http://127.0.0.1:4243/';
const out=path.resolve('test-results/startup-hints',process.env.STARTUP_LABEL||'candidate');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--ignore-gpu-blocklist','--use-angle=d3d11']});
const checks=[];const check=(name,ok,detail='')=>{checks.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'}  ${name} ${JSON.stringify(detail)}`);};
try{
 for(const aircraft of ['micro','chinook','skycrane'])for(const fps of [30,120]){
  const ctx=await browser.newContext({viewport:{width:1280,height:720}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}?aircraft=${aircraft}&fps=${fps}&worldSpeed=0.4&quality=low&dynres=0`);
  await page.locator('#start-btn:not(.hidden)').click({ timeout: startupTimeout(60000) });await page.waitForTimeout(500);
  const before=await page.evaluate(()=>({step:document.querySelector('.hint .step').textContent,text:document.querySelector('.hint .txt').textContent,grounded:window.__helicoptea.sim.heli.grounded,height:window.__helicoptea.sim.heli.pos.y}));
  check(`${aircraft} cap${fps}: lift instruction remains on pad`,before.step==='1'&&before.grounded,before);
  // Capture after the assertions: a WARP screenshot can stall the running physics loop just before
  // takeoff and turn this input/guidance check into a test of screenshot-induced catch-up.
  await page.evaluate(() => {
    const H=window.__helicoptea, ap=new H.Autopilot(), step=H.sim.step.bind(H.sim);
    const trace=window.__takeoff={lifted:false,maxClearance:0,crash:null};
    ap.target.copy(H.sim.heli.pos); ap.yaw=H.sim.heli.heading();
    // W still performs the takeoff. Once it reaches the existing target, hold there on the physics
    // clock so a slow CDP read/key-up cannot continue climbing into scenery between observations.
    H.sim.step=ctl=>{
      if(trace.lifted&&H.sim.heli){
        Object.assign(ctl,ap.update(H.sim.heli,null,null,H.sim.dt)); H.tuning.shapeCtl(ctl);
      }
      const result=step(ctl), h=H.sim.heli;
      if(h){
        trace.maxClearance=Math.max(trace.maxClearance,h.skidClearance);
        if(!trace.lifted&&h.skidClearance>0.08){trace.lifted=true;ap.target.y=h.pos.y+0.03;}
      }else trace.crash=H.sim.crashInfo;
      return result;
    };
  });
  await page.keyboard.down('w');
  await page.waitForFunction(()=>window.__takeoff.lifted||window.__takeoff.crash,null,{timeout:10000});
  await page.keyboard.up('w');await page.waitForTimeout(100);
  const after=await page.evaluate(()=>({step:document.querySelector('.hint .step').textContent,clearance:window.__helicoptea.sim.heli?.skidClearance,state:window.__helicoptea.sim.state,trace:window.__takeoff}));
  check(`${aircraft} cap${fps}: takeoff advances guidance`,after.step==='2'&&after.state==='flying'&&after.trace.lifted,after);
  check(`${aircraft} cap${fps}: no errors`,errors.length===0,errors);
  await page.screenshot({path:path.join(out,`${aircraft}-${fps}-takeoff.png`)});
  await ctx.close();
 }
}finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,checks},null,2));}
process.exit(checks.some(c=>!c.ok)?1:0);
