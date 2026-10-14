import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

// Ground-truth ambient occlusion (GTAO) tuned for a centimetre-scale world: contact darkening where
// cups, the teapot, the tea bags and the helicopter's skids meet the table. Optional per quality tier.
//
// The chain is kept short because at 4K every full-screen pass costs about a millisecond:
//   1. the scene into a multisampled half-float target,
//   2. normals, AO and denoise at no more than quality.aoMaxHeight lines,
//   3. one pass to the screen that applies the AO, tone maps and converts to sRGB.
// (The stock EffectComposer chain copied the frame, blended the AO in a second pass and tone mapped in a
// third, all into multisampled 4K targets.)
export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    this.enabled = !!quality.ao;
    this.aoScale = 1;
    if (this.enabled) this.build(quality);
  }

  build(quality) {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality.antialias ? 4 : 0 });
    const ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    ao.output = GTAOPass.OUTPUT.Off; // compute the denoised AO only; the output pass below applies it
    ao.updateGtaoMaterial({ radius: 0.12, distanceExponent: 1.3, thickness: 0.06, scale: 1.9, samples: quality.aoSamples || 16, distanceFallOff: 1.0, screenSpaceRadius: false });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1.5, rings: 2, samples: 16 });
    // Transparent and effect-only objects (tea, rotor blur, particles, decals, glass, points, lines) must not
    // occlude. The list of them is gathered by walking the scene a few times a second rather than twice
    // every frame (the stock pass walks it and fills a Map per frame).
    const hidden = [], wasVisible = [];
    let age = Infinity;
    const gather = () => {
      hidden.length = 0;
      this.scene.traverse((o) => {
        if (o.isPoints || o.isLine || (o.isMesh && (o.userData.noAO || (o.material && (Array.isArray(o.material) ? o.material.some((m) => m.transparent) : o.material.transparent))))) hidden.push(o);
      });
      age = 0;
    };
    ao.overrideVisibility = () => {
      if (++age > 20) gather();
      wasVisible.length = hidden.length;
      for (let i = 0; i < hidden.length; i++) { wasVisible[i] = hidden[i].visible; hidden[i].visible = false; }
    };
    ao.restoreVisibility = () => { for (let i = 0; i < hidden.length; i++) hidden[i].visible = wasVisible[i]; };
    this.ao = ao;
    this.output = new FullScreenQuad(new THREE.RawShaderMaterial({
      name: 'HeliOutput',
      uniforms: { tDiffuse: { value: this.target.texture }, tAO: { value: ao.pdRenderTarget.texture }, intensity: { value: 1 }, toneMappingExposure: { value: 1 } },
      defines: { ACES_FILMIC_TONE_MAPPING: '', SRGB_TRANSFER: '' },
      vertexShader: /* glsl */`
        precision highp float;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        attribute vec3 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform sampler2D tAO;
        uniform float intensity;
        #include <tonemapping_pars_fragment>
        #include <colorspace_pars_fragment>
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
          gl_FragColor.rgb *= mix(vec3(1.0), texture2D(tAO, vUv).rgb, intensity);
          gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);
          gl_FragColor = sRGBTransferOETF(gl_FragColor);
        }`,
      depthTest: false, depthWrite: false,
    }));
  }

  setSize(w, h) {
    if (!this.enabled) return;
    const pr = this.renderer.getPixelRatio();
    const W = Math.max(1, Math.floor(w * pr)), H = Math.max(1, Math.floor(h * pr));
    this.target.setSize(W, H);
    // AO at no more than aoMaxHeight lines: it is a soft, denoised term, so a 4K screen gets it at half
    // resolution (a quarter of the pixels) and the output pass upsamples it without visible loss.
    const s = this.quality.aoMaxHeight ? Math.min(1, this.quality.aoMaxHeight / H) : 1;
    this.aoScale = s;
    this.ao.setSize(Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s)));
  }

  render() {
    const r = this.renderer;
    if (!this.enabled) { r.render(this.scene, this.camera); return; }
    r.setRenderTarget(this.target);
    r.render(this.scene, this.camera);
    this.ao.render(r, null, this.target);
    this.output.material.uniforms.toneMappingExposure.value = r.toneMappingExposure;
    r.setRenderTarget(null);
    this.output.render(r);
  }
}
