// Tutorial progression must use measured airborne state, including frames before physics starts.
import {initPhysics} from '../src/sim/physics.js';
import {Sim} from '../src/sim/sim.js';
import {Flow} from '../src/game/flow.js';
await initPhysics();
let failed=0;
const check=(name,ok,detail)=>{console.log(`${ok?'PASS':'FAIL'}  ${name} ${JSON.stringify(detail)}`);if(!ok)failed++;};
for(const aircraft of ['micro','chinook','skycrane']){
 const sim=new Sim({aircraft});
 const hud={device:'keyboard',key:a=>a,showHint(){},showPrompt(){},setInvite(){}};
 const flow=new Flow(sim,hud);
 flow.update(0);
 check(`${aircraft}: unmeasured startup height does not skip lift`,flow.step===0,{step:flow.step,clearance:sim.heli.skidClearance,grounded:sim.heli.grounded});
 flow.replay();
 const ctl={pitch:0,roll:0,yaw:0,collective:0};
 for(let i=0;i<240;i++){sim.step(ctl);flow.update(sim.dt);}
 check(`${aircraft}: resting on the pad keeps lift guidance`,flow.step===0,{step:flow.step,clearance:sim.heli.skidClearance});
 for(let i=0;i<480&&flow.step===0;i++){sim.step({...ctl,collective:1});flow.update(sim.dt);}
 check(`${aircraft}: real takeoff advances to hook guidance`,flow.step===1&&sim.heli.skidClearance>0.06,{step:flow.step,clearance:sim.heli.skidClearance});
 sim.dispose();
}
process.exit(failed?1:0);
