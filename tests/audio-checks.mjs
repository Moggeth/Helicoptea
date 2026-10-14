// Browser rejection/interruption branches that cannot be forced reliably with physical audio hardware.
import {Audio} from '../src/audio/audio.js';
const results=[];
const check=(name,ok)=>{results.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${name}`);};
for(const state of ['running','suspended','interrupted','closed']) {
  let resumes=0, suspends=0;
  const a=Object.create(Audio.prototype);
  a.ctx={state,resume:()=>{resumes++;return Promise.resolve();},suspend:()=>{suspends++;return Promise.resolve();}};
  a.unlock();
  check(`audio ${state}: unlock resumes only a recoverable context`,resumes===(['suspended','interrupted'].includes(state)?1:0));
  a.suspend(true);
  check(`audio ${state}: pause tolerates a closed context`,suspends===(state==='closed'?0:1));
}
const unhandled=[];
const onUnhandled=e=>unhandled.push(e);
process.on('unhandledRejection',onUnhandled);
const a=Object.create(Audio.prototype);
a.ctx={state:'suspended',resume:()=>Promise.reject(new Error('policy denied')),suspend:()=>Promise.reject(new Error('device unavailable'))};
a.unlock(); a.suspend(true); a.suspend(false);
await new Promise(resolve=>setTimeout(resolve,0));
check('denied audio operations do not cause unhandled rejection',unhandled.length===0);
process.off('unhandledRejection',onUnhandled);
let retried=false;
a.ctx.resume=()=>{retried=true;return Promise.resolve();};
a.unlock();
check('a failed unlock can be retried on a later gesture',retried);
console.log(`\n${results.filter(Boolean).length}/${results.length} audio checks passed`);
if(results.some(ok=>!ok)) process.exitCode=1;
