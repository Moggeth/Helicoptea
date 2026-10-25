// Paired fixed-camera render benchmark. GPU completion is included (gl.finish), unlike CPU submission
// timing. This is a renderer microbenchmark, not gameplay FPS. Never run alongside another benchmark.
// node tests/perf-render.mjs http://localhost:4387/ http://localhost:4388/ [--phone]
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
const urls=process.argv.filter(a=>a.startsWith('http')), phone=process.argv.includes('--phone');
if(!urls.length) throw new Error('Supply one or more preview URLs');
const out='test-results/perf'; fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome'].find(fs.existsSync),headless:true,args:['--ignore-gpu-blocklist',...(process.platform==='win32'?['--use-angle=d3d11']:[])]});
const rows=[]; const start=performance.now();
try {
 for(let round=0;round<3;round++) for(const url of (round%2?[...urls].reverse():urls)) {
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1920,height:1080},hasTouch:phone,isMobile:phone});
  const page=await context.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{let seed=17;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}; const raf=requestAnimationFrame; window.requestAnimationFrame=fn=>raf(t=>{if(!window.__freeze)fn(t);else window.__resume=fn;});});
  const load=performance.now(); await page.goto(`${url}?quality=${phone?'medium':'high'}&record=0&dynres=0`);
  await page.waitForSelector('#start-btn:not(.hidden)',{timeout:90000});
  const readyMs=performance.now()-load;
  // The start-screen scene is paused already. Fixed cameras exercise indoor/outdoor and grass boundaries.
  for(const [name,pos,look] of [['kitchen',[0.6,0.55,0.8],[0,0.1,0]],['garden',[0.4,0.4,-2.4],[0,-0.5,-4.5]],['street',[0,0.3,8],[5,-0.5,12]]]) {
   await page.evaluate(({pos,look})=>{window.__freeze=false;if(window.__resume){requestAnimationFrame(window.__resume);window.__resume=null;}const H=window.__helicoptea;H.freeCam.on=true;H.freeCam.pos.set(...pos);H.freeCam.look.set(...look);}, {pos,look});
   await page.waitForTimeout(700); await page.evaluate(()=>{window.__freeze=true;}); await page.waitForTimeout(100);
   const r=await page.evaluate(()=>{
    const H=window.__helicoptea,r=H.renderer,gl=r.getContext(),ms=[];
    for(let i=0;i<35;i++){r.info.reset();const t=performance.now();H.post.render();gl.finish();if(i>=5)ms.push(performance.now()-t);}
    ms.sort((a,b)=>a-b);return {medianMs:ms[15],p90Ms:ms[27],camera:H.post.camera.position.toArray(),calls:r.info.render.calls,tris:r.info.render.triangles};
   });
   if(r.camera.some((v,i)=>Math.abs(v-pos[i])>1e-5))throw new Error('Camera did not reach requested position: '+r.camera);
   rows.push({round,url,phone,name,readyMs,...r});console.log(JSON.stringify(rows.at(-1)));
   if(round===0){await page.addStyleTag({content:'#loading,#start,.hud,.overlay{visibility:hidden!important}'});await page.screenshot({path:`${out}/render-${new URL(url).port}-${phone?'phone':'desktop'}-${name}.png`});}
  }
  if(errors.length)throw new Error(errors.join('\n')); await context.close();
 }
}finally{await browser.close();fs.writeFileSync(`${out}/render-${phone?'phone':'desktop'}.json`,JSON.stringify({seconds:(performance.now()-start)/1000,rows},null,2));}
