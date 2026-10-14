import * as THREE from 'three';

// Cached static shadows for one directional light (the sun).
//
// Most of the ~250 shadow casters in the house and garden never move, but three.js redraws every one of
// them into the shadow map each frame. This keeps a copy of the shadow map with only the still casters in
// it, and each frame starts the shadow map from that copy (a framebuffer blit of colour and depth) and
// draws just the casters that move. The copy is redrawn when the light's shadow camera moves (the garden's
// follow is snapped to texels, so that is a step now and then) or when a caster thought to be still moves,
// appears or disappears.
//
// A caster counts as moving once its world matrix, its vertex positions, its instance matrices or its
// visibility change; it stays in the moving set for a while (so a cup knocked over doesn't rebuild the
// cache every frame) and becomes still again after STILL_FRAMES frames without change.
const STILL_FRAMES = 240;

export class ShadowCache {
  constructor(renderer, scene, light) {
    this.renderer = renderer;
    this.scene = scene;
    this.light = light;
    this.enabled = true;
    this.track = new Map();     // mesh -> { m: Float64Array(16), pos, inst, still: frames unchanged }
    this.visible = [];          // casters reached by a visible walk this frame
    this.camKey = new Float64Array(32);
    this.cache = null;          // WebGLRenderTarget copy of the static-only shadow map
    this.valid = false;
    this.frame = 0;
    this.stats = { rebuilds: 0, statics: 0, movers: 0 };
    this._blit = false;
    const sm = renderer.shadowMap;
    const origRender = sm.render.bind(sm);
    const origClear = renderer.clear.bind(renderer);
    // Shadow maps are cleared with renderer.clear() right after binding them: for the sun, when the cache
    // is ready, start from the cached static shadows instead.
    renderer.clear = (...a) => {
      if (this._blit && renderer.getRenderTarget() === this.light.shadow.map) { this._blit = false; this.copy(this.cache, this.light.shadow.map); return; }
      origClear(...a);
    };
    sm.render = (lights, sc, camera) => {
      if (!this.enabled || !this.light.castShadow || (!sm.autoUpdate && !sm.needsUpdate) || sc !== this.scene || !lights.includes(this.light)) { origRender(lights, sc, camera); return; }
      this.render(origRender, lights, sc, camera);
    };
  }

  // Which visible casters are still, and has anything about the still set changed since the cache was made?
  classify() {
    this.frame++;
    const vis = this.visible;
    vis.length = 0;
    this.scene.traverseVisible((o) => { if ((o.isMesh || o.isLine || o.isPoints) && o.castShadow) vis.push(o); });
    let dirty = false;
    const seen = this.frame;
    for (const o of vis) {
      let t = this.track.get(o);
      const pos = o.geometry && o.geometry.attributes.position ? o.geometry.attributes.position.version : 0;
      const inst = o.isInstancedMesh ? o.instanceMatrix.version : 0;
      if (!t) {
        // New casters (and ones back in view) start as movers: they only join the cache once still.
        this.track.set(o, { m: new Float64Array(o.matrixWorld.elements), pos, inst, still: 0, seen });
        continue;
      }
      t.seen = seen;
      const e = o.matrixWorld.elements, m = t.m;
      let same = pos === t.pos && inst === t.inst;
      if (same) for (let i = 0; i < 16; i++) if (e[i] !== m[i]) { same = false; break; }
      if (same) {
        if (t.still < STILL_FRAMES) { t.still++; if (t.still === STILL_FRAMES) dirty = true; } // joins the cache
      } else {
        if (t.still >= STILL_FRAMES) dirty = true; // it was in the cache: the cache is stale
        t.still = 0;
        m.set(e); t.pos = pos; t.inst = inst;
      }
    }
    // Still casters that vanished leave a stale shadow in the cache.
    for (const [o, t] of this.track) {
      if (t.seen === seen) continue;
      if (t.still >= STILL_FRAMES) dirty = true;
      this.track.delete(o);
    }
    return dirty;
  }

  cameraMoved() {
    const c = this.light.shadow.camera;
    c.updateMatrixWorld();
    const a = c.matrixWorldInverse.elements, b = c.projectionMatrix.elements, k = this.camKey;
    let moved = false;
    for (let i = 0; i < 16; i++) { if (k[i] !== a[i]) { moved = true; k[i] = a[i]; } if (k[16 + i] !== b[i]) { moved = true; k[16 + i] = b[i]; } }
    return moved;
  }

  render(origRender, lights, scene, camera) {
    const light = this.light;
    // The light's shadow camera is placed inside origRender (shadow.updateMatrices) from the light and its
    // target; do the same here first so a moved light invalidates the cache this frame.
    light.updateMatrixWorld(); light.target.updateMatrixWorld();
    light.shadow.updateMatrices(light);
    const dirty = this.classify() || this.cameraMoved();
    const vis = this.visible;
    let statics = 0;
    for (const o of vis) if (this.track.get(o).still >= STILL_FRAMES) statics++;
    this.stats.statics = statics; this.stats.movers = vis.length - statics;
    if (statics < 8) { origRender(lights, scene, camera); return; } // nothing worth caching yet
    const hide = (still) => { for (const o of vis) if ((this.track.get(o).still >= STILL_FRAMES) === still) o.castShadow = false; };
    const show = () => { for (const o of vis) o.castShadow = true; };
    const map = () => light.shadow.map;
    if (dirty || !this.valid || !map()) {
      // Static casters only, for the sun alone, then keep a copy.
      hide(false);
      origRender([light], scene, camera);
      show();
      const m = map();
      if (!this.cache || this.cache.width !== m.width || this.cache.height !== m.height) {
        if (this.cache) this.cache.dispose();
        this.cache = new THREE.WebGLRenderTarget(m.width, m.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      }
      this.copy(m, this.cache);
      this.valid = true;
      this.stats.rebuilds++;
    }
    // This frame: the cached static shadows, plus the movers drawn over them.
    this.renderer.shadowMap.needsUpdate = true; // the rebuild above consumed it
    hide(true);
    this._blit = true;
    origRender(lights, scene, camera);
    this._blit = false;
    show();
  }

  // Colour and depth, framebuffer to framebuffer.
  copy(from, to) {
    const r = this.renderer, gl = r.getContext();
    const prev = r.getRenderTarget();
    r.setRenderTarget(to);   // makes sure both framebuffers exist
    r.setRenderTarget(from);
    const props = r.properties;
    const src = props.get(from).__webglFramebuffer, dst = props.get(to).__webglFramebuffer;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst);
    gl.blitFramebuffer(0, 0, from.width, from.height, 0, 0, to.width, to.height, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    r.state.bindFramebuffer(gl.FRAMEBUFFER, null); // three's cached binding no longer matches; reset it
    r.setRenderTarget(to === this.light.shadow.map ? to : prev);
  }
}
