// Browser audio state and signal checks. No autoplay bypass; emulated pads cannot grant activation.
// Waveforms establish signal routing, not speaker quality or human listening acceptance.
import {chromium, startupTimeout} from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';
const base = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:4236/';
const out = path.resolve('test-results/audio-lifecycle', process.env.AUDIO_LABEL || 'candidate');
fs.mkdirSync(out, {recursive:true});
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome'].find(p => fs.existsSync(p));
const browser = await chromium.launch({executablePath, headless:true, args:['--ignore-gpu-blocklist','--use-angle=d3d11','--autoplay-policy=document-user-activation-required']});
const checks = [], samples = [];
function check(name,ok,detail='') { checks.push({name,ok,detail}); console.log(`${ok?'PASS':'FAIL'}  ${name} ${typeof detail==='string'?detail:JSON.stringify(detail)}`); }
async function open({pad=false,touch=false}={}) {
  const ctx = await browser.newContext({viewport:{width:1280,height:720},hasTouch:touch});
  if(pad) await ctx.addInitScript(() => {
    window.__pad={axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
    navigator.getGamepads=()=>[{...window.__pad,id:'Xbox 360 Controller (XInput STANDARD GAMEPAD)',index:0,connected:true,mapping:'standard',timestamp:performance.now()}];
  });
  const page=await ctx.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}?quality=low&dynres=0`);
  if(pad) {
    const cdp=await ctx.newCDPSession(page);
    await cdp.send('Runtime.evaluate',{expression:`new Promise((resolve,reject) => { const timeout=setTimeout(()=>{clearInterval(id);reject(new Error("Start screen timeout"));},${startupTimeout(60000)}); const id=setInterval(()=>{if(window.__helicoptea && document.querySelector("#start-btn:not(.hidden)")){clearInterval(id);clearTimeout(timeout);resolve();}},20); })`,awaitPromise:true,userGesture:false});
  } else await page.locator('#start-btn:not(.hidden)').waitFor({ timeout: startupTimeout(60000) });
  return {ctx,page,errors};
}
const state=page=>page.evaluate(()=>({paused:window.__helicoptea.paused, audio:window.__helicoptea.audio.ctx?.state, time:window.__helicoptea.audio.ctx?.currentTime, toast:document.querySelector('#hud .toast')?.textContent}));
async function signal(page) {
  return page.evaluate(async()=>{
    const a=window.__helicoptea.audio, analyser=a.ctx.createAnalyser();
    analyser.fftSize=2048; a.comp.connect(analyser);
    await new Promise(r=>setTimeout(r,250));
    const data=new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data);
    a.comp.disconnect(analyser); analyser.disconnect();
    return {rms:Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length),peak:Math.max(...data.map(Math.abs)),state:a.ctx.state};
  });
}
async function startCapture(page) {
  if(!process.env.AUDIO_CAPTURE) return;
  await page.evaluate(()=>{
    const a=window.__helicoptea.audio, dest=a.ctx.createMediaStreamDestination();
    a.comp.connect(dest);
    const recorder=new MediaRecorder(dest.stream,{mimeType:'audio/webm'}), chunks=[];
    window.__audioCaptureDone=new Promise(resolve=>{
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=()=>{
        a.comp.disconnect(dest); dest.stream.getTracks().forEach(t=>t.stop());
        const reader=new FileReader(); reader.onload=()=>resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(new Blob(chunks,{type:'audio/webm'}));
      };
    });
    window.__audioCapture=recorder; recorder.start();
  });
}
async function stopCapture(page) {
  if(!process.env.AUDIO_CAPTURE) return;
  const data=await page.evaluate(()=>{window.__audioCapture.stop();return window.__audioCaptureDone;});
  fs.writeFileSync(path.join(out,'resume-flight-mute-recovery.webm'),Buffer.from(data,'base64'));
}
try {
  // The game's delayed startup warning must not mistake intentional pause for autoplay denial.
  {
    const {ctx,page,errors}=await open();
    await page.click('#start-btn'); await page.keyboard.press('Escape');
    await page.waitForFunction(()=>window.__helicoptea.paused);
    await page.waitForTimeout(650);
    const before=await state(page);
    check('rapid startup pause stays suspended',before.audio==='suspended'&&before.paused,before);
    check('intentional pause does not show an autoplay warning',!before.toast.includes('Sound is waiting'),before.toast);
    await page.locator('.overlay.show h2').filter({hasText:'Paused'}).click();
    await page.waitForTimeout(300);
    const after=await state(page); samples.push({scenario:'rapid-pause-menu-click',before,after});
    check('clicking a paused menu does not restart audio',after.paused&&after.audio==='suspended'&&after.time-before.time<0.05,after);
    await page.screenshot({path:path.join(out,'rapid-pause.png')});
    await startCapture(page);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const resumed=await signal(page); samples.push({scenario:'resume',...resumed});
    check('resume restores an unclipped rotor signal',resumed.state==='running'&&resumed.rms>1e-5&&resumed.peak<1,resumed);
    await page.keyboard.down('w'); await page.waitForTimeout(900); await page.keyboard.up('w');
    await page.keyboard.down('a'); await page.waitForTimeout(250); await page.keyboard.up('a');
    check('audio recovery still permits keyboard takeoff and yaw',await page.evaluate(()=>window.__helicoptea.sim.state==='flying'&&window.__helicoptea.sim.heli.pos.y>0.06));
    await page.screenshot({path:path.join(out,'flight-after-resume.png')});
    await page.keyboard.press('m'); await page.waitForTimeout(600);
    const muted=await signal(page); samples.push({scenario:'muted',...muted});
    check('mute silences the output signal',muted.rms<1e-5,muted);
    await page.keyboard.press('m'); await page.waitForTimeout(400);
    const unmuted=await signal(page); check('unmute restores rotor output',unmuted.rms>1e-5,unmuted);
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(150);
    check('focus loss suspends audio with the game',(await state(page)).audio==='suspended');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    check('resume after focus loss restores audio',(await state(page)).audio==='running');
    // Browser/OS interruption distinct from game pause: next trusted gesture should recover it.
    await page.evaluate(()=>window.__helicoptea.audio.ctx.suspend());
    await page.keyboard.press('u'); await page.waitForTimeout(250);
    check('a trusted flight key recovers unexpected audio suspension',(await state(page)).audio==='running');
    check('audio lifecycle has no page errors',errors.length===0,errors.join(';'));
    await stopCapture(page);
    await ctx.close();
  }
  for(const kind of ['keyboard','touch','gamepad']) {
    const {ctx,page,errors}=await open({pad:kind==='gamepad',touch:kind==='touch'});
    if(kind==='keyboard') await page.keyboard.press('Enter');
    else if(kind==='touch') await page.tap('#start-btn');
    else {
      // Playwright page.evaluate grants a browser user gesture. CDP without userGesture
      // is essential here: a real polled gamepad does not unlock browser autoplay.
      const cdp=await ctx.newCDPSession(page);
      await cdp.send('Runtime.evaluate',{expression:'window.__pad.buttons[0]={pressed:true,value:1}',userGesture:false});
      await cdp.send('Runtime.evaluate',{expression:`new Promise(resolve => { const id=setInterval(()=>{if(window.__helicoptea.started){clearInterval(id);window.__pad.buttons[0]={pressed:false,value:0};resolve();}},20); })`,awaitPromise:true,userGesture:false});
    }
    await page.waitForTimeout(650);
    const cdp=await ctx.newCDPSession(page);
    const {result}=await cdp.send('Runtime.evaluate',{expression:'({paused:window.__helicoptea.paused,audio:window.__helicoptea.audio.ctx?.state,time:window.__helicoptea.audio.ctx?.currentTime,toast:document.querySelector("#hud .toast")?.textContent,activation:navigator.userActivation.hasBeenActive})',returnByValue:true,userGesture:false});
    const s=result.value; samples.push({scenario:kind+'-start',...s});
    if(kind==='gamepad') {
      check('controller-only startup explains browser audio restriction',s.audio==='suspended'&&s.toast.includes('Sound is waiting'),s);
      await page.keyboard.press('u'); await page.waitForTimeout(250);
    }
    check(`${kind} startup unlocks audio${kind==='gamepad'?' after a real gesture':''}`,(await state(page)).audio==='running',await state(page));
    check(`${kind} startup has no page errors`,errors.length===0,errors.join(';'));
    await ctx.close();
  }
} finally { await browser.close(); fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,checks,samples},null,2)); }
if(checks.some(c=>!c.ok)) process.exitCode=1;
