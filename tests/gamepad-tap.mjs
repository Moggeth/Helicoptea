// Deliver one pressed sample and one released sample to the actual consumer, regardless of RAF order.
// Input and replay both poll the same mocked pad; a frame-count wait can leave a tap down for two polls.
export function tapGamepad(page, index, timeoutMs = 3000) {
  return page.evaluate(({ index, timeoutMs }) => new Promise((resolve, reject) => {
    const H = window.__helicoptea, replay = H.replay.active;
    const owner = replay ? H.replay : H.input.pads, method = replay ? 'pollPad' : 'poll';
    const original = owner[method], released = { pressed: false, value: 0 };
    if (typeof original !== 'function') throw Error(`Gamepad consumer ${method} is unavailable`);
    let phase = 0, timer;
    const finish = error => {
      clearTimeout(timer);
      if (owner[method] === tapped) owner[method] = original;
      window.__pad.buttons[index] = released;
      if (error) reject(error); else resolve();
    };
    function tapped(...args) {
      const pressed = phase === 0;
      window.__pad.buttons[index] = { pressed, value: pressed ? 1 : 0 };
      try {
        const result = original.apply(this, args);
        if (!pressed || (replay && !H.replay.active)) finish();
        else phase = 1;
        return result;
      } catch (error) { finish(error); throw error; }
      finally { window.__pad.buttons[index] = released; }
    }
    owner[method] = tapped;
    timer = setTimeout(() => finish(Error(`Button ${index}: ${method} did not consume press/release within ${timeoutMs} ms`)), timeoutMs);
  }), { index, timeoutMs });
}
