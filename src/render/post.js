import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Ground-truth ambient occlusion (GTAO) tuned for a centimetre-scale world: contact darkening where
// cups, the teapot, the tea bags and the helicopter's skids meet the table. Optional per quality tier.
export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = !!quality.ao;
    this.composer = null;
    if (this.enabled) this.build(quality);
  }

  build(quality) {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality.antialias ? 4 : 0 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    ao.updateGtaoMaterial({ radius: 0.12, distanceExponent: 1.3, thickness: 0.06, scale: 1.9, samples: quality.aoSamples || 16, distanceFallOff: 1.0, screenSpaceRadius: false });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1.5, rings: 2, samples: 16 });
    ao.blendIntensity = 1.0;
    // Transparent and effect-only objects (tea, rotor blur, particles, decals, glass) must not occlude.
    const baseOverride = ao.overrideVisibility.bind(ao);
    ao.overrideVisibility = () => {
      baseOverride();
      this.scene.traverse((o) => {
        if (o.isMesh && (o.userData.noAO || (o.material && (Array.isArray(o.material) ? o.material.some((m) => m.transparent) : o.material.transparent)))) o.visible = false;
      });
    };
    this.ao = ao;
    this.composer.addPass(ao);
    this.composer.addPass(new OutputPass());
  }

  setSize(w, h) {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
