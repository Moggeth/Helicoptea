import assert from 'node:assert/strict';
import {test, afterEach} from 'node:test';
import {tapGamepad} from './gamepad-tap.mjs';
afterEach(() => { delete globalThis.window; });
function rig(active = false, closes = false) {
  const flight = [], replay = [];
  const pad = {buttons: Array.from({length: 17}, () => ({pressed:false,value:0}))};
  const H = {input:{pads:{poll(){flight.push(pad.buttons[0].pressed);}}},replay:{active,pollPad(){
    replay.push(pad.buttons[0].pressed);
    if(closes && pad.buttons[0].pressed) this.active=false;
  }}};
  globalThis.window = {__helicoptea:H,__pad:pad};
  return {H,pad,flight,replay,page:{evaluate:(fn,arg)=>fn(arg)}};
}
test('flight taps provide exactly one pressed and released poll and restore the consumer', async () => {
  const r=rig(), original=r.H.input.pads.poll, done=tapGamepad(r.page,0);
  r.H.input.pads.poll(0.75); r.H.input.pads.poll(0.75); await done;
  assert.deepEqual(r.flight,[true,false]); assert.equal(r.H.input.pads.poll,original);
  assert.equal(r.pad.buttons[0].pressed,false);
});
test('replay taps stay single-poll even when flight input also polls before each replay frame', async () => {
  const r=rig(true), original=r.H.replay.pollPad;
  for(let tap=0;tap<2;tap++) {
    const done=tapGamepad(r.page,0);
    r.H.input.pads.poll(0.75); r.H.replay.pollPad(0.75);
    r.H.input.pads.poll(0.75); r.H.replay.pollPad(0.75); await done;
  }
  assert.deepEqual(r.replay,[true,false,true,false]); assert.deepEqual(r.flight,[false,false,false,false]);
  assert.equal(r.H.replay.pollPad,original);
});
test('a tap that closes replay releases and restores without waiting for a retired consumer', async () => {
  const r=rig(true,true), original=r.H.replay.pollPad, done=tapGamepad(r.page,0);
  r.H.replay.pollPad(); await done;
  assert.equal(r.H.replay.active,false); assert.equal(r.H.replay.pollPad,original);
  assert.equal(r.pad.buttons[0].pressed,false);
});
test('an unconsumed tap fails and restores state instead of silently succeeding at its deadline', async () => {
  const r=rig(), original=r.H.input.pads.poll;
  await assert.rejects(tapGamepad(r.page,0,10),/did not consume press\/release/);
  assert.equal(r.H.input.pads.poll,original); assert.equal(r.pad.buttons[0].pressed,false);
});
