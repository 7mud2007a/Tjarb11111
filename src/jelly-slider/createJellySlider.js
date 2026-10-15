// createJellySlider.js
// Framework-agnostic three.js layer: scene, render loop, pointer handling.
// <JellySlider /> in JellySlider.jsx is a thin React wrapper around this.

import * as THREE from 'three';
import {
  CAMERA_DIR,
  CAMERA_TARGET,
  GROOVE_LENGTH,
  GROOVE_WIDTH,
  JELLY_VERTS,
  JellyChain,
  LABEL_H,
  LABEL_W,
  LIGHT,
  REST_VALUE,
  SHADOW_VERTS,
  TEXT_RECT,
  VIEW_WIDTH,
  computeNormals,
  drawLabel,
  fillJelly,
  fillShadow,
  jellyIndices,
  shadowIndices,
} from './jellyScene.js';
import {
  JELLY_FRAG,
  JELLY_VERT,
  SHADOW_FRAG,
  SHADOW_VERT,
  SURFACE_FRAG,
  SURFACE_VERT,
} from './jellyShaders.js';

export const DEFAULT_FONT =
  "'Oswald', 'Barlow Condensed', 'Bebas Neue', 'Arial Narrow', system-ui, sans-serif";

export const DEFAULT_THEME = {
  surfaceLight: '#eeeef2', // top-left of the backdrop
  surfaceDark: '#b8b8bf', // bottom-right of the backdrop
  label: '#6b6b72', // % readout
  jelly: ['#f5e3cc', '#ffb357', '#ff841a', '#db470a'], // cream -> deep orange
  shadow: '#4d4a54', // cool part of the shadow
  glow: '#ff7320', // orange part of the shadow
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Colours are passed through untouched (display values), so no colour-space
// conversion happens: hex in, the same RGB on screen.
const rgb = (hex) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export function createJellySlider(container, options = {}) {
  const opts = {
    value: REST_VALUE,
    fontFamily: DEFAULT_FONT,
    snapBackTo: null,
    onChange: null,
    onChangeEnd: null,
    ...options,
  };
  let theme = { ...DEFAULT_THEME, ...(options.theme || {}) };

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  Object.assign(canvas.style, {
    display: 'block',
    width: '100%',
    height: '100%',
    touchAction: 'pan-y',
    cursor: 'default',
  });
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const chain = new JellyChain(opts.value);
  const calm = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const hx = (GROOVE_LENGTH - GROOVE_WIDTH) / 2;
  const R = GROOVE_WIDTH / 2;

  // ---- scene ---------------------------------------------------------------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
  const drawingSize = new THREE.Vector2(1, 1);

  // Label texture
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = LABEL_W;
  labelCanvas.height = LABEL_H;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.minFilter = THREE.LinearFilter;
  labelTex.magFilter = THREE.LinearFilter;
  labelTex.generateMipmaps = false;
  let shownLabel = null;

  const lightVec = new THREE.Vector3(...LIGHT);

  // Surface with the groove (shading only, no geometry)
  const surfaceMat = new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
    depthWrite: false,
    uniforms: {
      uRes: { value: drawingSize },
      uHx: { value: hx },
      uR: { value: R },
      uText: { value: labelTex },
      uTextRect: { value: new THREE.Vector4(...TEXT_RECT) },
      uBgA: { value: rgb(theme.surfaceLight) },
      uBgB: { value: rgb(theme.surfaceDark) },
      uLabel: { value: rgb(theme.label) },
      uLight: { value: lightVec },
    },
  });
  const surfaceGeo = new THREE.PlaneGeometry(800, 800);
  surfaceGeo.rotateX(-Math.PI / 2);
  const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
  surface.frustumCulled = false;
  surface.renderOrder = 0;
  scene.add(surface);

  // Shadow streak
  const sIdx = shadowIndices();
  const sPos = new Float32Array(SHADOW_VERTS * 3);
  const sUv = new Float32Array(SHADOW_VERTS * 2);
  const sH = new Float32Array(SHADOW_VERTS);
  const shadowGeo = new THREE.BufferGeometry();
  shadowGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  shadowGeo.setAttribute('uv', new THREE.BufferAttribute(sUv, 2).setUsage(THREE.DynamicDrawUsage));
  shadowGeo.setAttribute('aH', new THREE.BufferAttribute(sH, 1).setUsage(THREE.DynamicDrawUsage));
  shadowGeo.setIndex(new THREE.BufferAttribute(sIdx, 1));
  const shadowMat = new THREE.ShaderMaterial({
    vertexShader: SHADOW_VERT,
    fragmentShader: SHADOW_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uGray: { value: rgb(theme.shadow) },
      uGlow: { value: rgb(theme.glow) },
    },
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.frustumCulled = false;
  shadow.renderOrder = 1;
  scene.add(shadow);

  // Jelly wall
  const jIdx = jellyIndices();
  const jPos = new Float32Array(JELLY_VERTS * 3);
  const jNor = new Float32Array(JELLY_VERTS * 3);
  const jUv = new Float32Array(JELLY_VERTS * 2);
  const jellyGeo = new THREE.BufferGeometry();
  jellyGeo.setAttribute('position', new THREE.BufferAttribute(jPos, 3).setUsage(THREE.DynamicDrawUsage));
  jellyGeo.setAttribute('normal', new THREE.BufferAttribute(jNor, 3).setUsage(THREE.DynamicDrawUsage));
  jellyGeo.setAttribute('uv', new THREE.BufferAttribute(jUv, 2).setUsage(THREE.DynamicDrawUsage));
  jellyGeo.setIndex(new THREE.BufferAttribute(jIdx, 1));
  const jellyMat = new THREE.ShaderMaterial({
    vertexShader: JELLY_VERT,
    fragmentShader: JELLY_FRAG,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    uniforms: {
      uLight: { value: lightVec },
      uThin: { value: 0.5 },
      uC0: { value: rgb(theme.jelly[0]) },
      uC1: { value: rgb(theme.jelly[1]) },
      uC2: { value: rgb(theme.jelly[2]) },
      uC3: { value: rgb(theme.jelly[3]) },
    },
  });
  const jelly = new THREE.Mesh(jellyGeo, jellyMat);
  jelly.frustumCulled = false;
  jelly.renderOrder = 2;
  scene.add(jelly);

  // ---- render loop (stops itself once everything has settled) --------------
  let disposed = false;
  let raf = 0;
  let last = 0;
  let idle = 0;
  let dragging = false;

  function frame(t) {
    raf = 0;
    if (disposed) return;
    const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
    last = t;

    chain.step(dt, calm);

    const lv = Math.round(chain.value);
    if (lv !== shownLabel) {
      drawLabel(labelCanvas, lv, opts.fontFamily);
      labelTex.needsUpdate = true;
      shownLabel = lv;
    }

    fillJelly(chain, jPos, jUv);
    computeNormals(jPos, jIdx, jNor);
    fillShadow(chain, sPos, sUv, sH);
    for (const name of ['position', 'normal', 'uv']) jellyGeo.getAttribute(name).needsUpdate = true;
    for (const name of ['position', 'uv', 'aH']) shadowGeo.getAttribute(name).needsUpdate = true;
    jellyMat.uniforms.uThin.value = chain.thin;

    renderer.render(scene, camera);

    idle = dragging || !chain.isSettled() ? 0 : idle + 1;
    if (idle < 2) raf = requestAnimationFrame(frame);
    else last = 0; // fully at rest: stop until something changes
  }

  function invalidate() {
    if (disposed || raf) return;
    idle = 0;
    raf = requestAnimationFrame(frame);
  }

  // ---- sizing --------------------------------------------------------------
  const T = CAMERA_TARGET;
  const D = CAMERA_DIR;
  function resize() {
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
    const dist = VIEW_WIDTH / 2 / Math.tan(hfov / 2);
    camera.position.set(T[0] + D[0] * dist, T[1] + D[1] * dist, T[2] + D[2] * dist);
    camera.lookAt(T[0], T[1], T[2]);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    renderer.getDrawingBufferSize(drawingSize);
    invalidate();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // ---- value reporting -------------------------------------------------------
  let lastReported = Math.round(chain.xToValue(chain.target));
  function report() {
    const v = Math.round(chain.xToValue(chain.target));
    if (v === lastReported) return;
    lastReported = v;
    opts.onChange?.(v);
  }

  // ---- pointer ---------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4); // y = 0.4, about knob height
  const hit = new THREE.Vector3();
  let grabOffset = 0;

  function pointerWorld(e) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(dragPlane, hit);
  }
  const grooveDistance = (p) => Math.hypot(p.x - clamp(p.x, -hx, hx), p.z) - R;

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = pointerWorld(e);
    if (!p || grooveDistance(p) > 1.0) return;
    dragging = true;
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = 'grabbing';
    // Grabbing the knob keeps your offset; clicking elsewhere jumps there.
    grabOffset = Math.abs(p.x - chain.handleX) < 0.7 ? p.x - chain.handleX : 0;
    chain.setTargetX(p.x - grabOffset);
    report();
    invalidate();
    e.preventDefault();
  }

  function onPointerMove(e) {
    const p = pointerWorld(e);
    if (dragging) {
      if (!p) return;
      chain.setTargetX(p.x - grabOffset);
      report();
      invalidate();
    } else {
      canvas.style.cursor = p && grooveDistance(p) <= 1.0 ? 'grab' : 'default';
    }
  }

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    canvas.releasePointerCapture?.(e.pointerId);
    canvas.style.cursor = 'grab';
    if (opts.snapBackTo != null) {
      chain.setValue(opts.snapBackTo, false);
      report();
    }
    opts.onChangeEnd?.(Math.round(chain.xToValue(chain.target)));
    invalidate();
  }

  const onLeave = () => {
    if (!dragging) canvas.style.cursor = 'default';
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', onLeave);

  // Redraw the label once a web font has loaded.
  document.fonts?.ready.then(() => {
    if (disposed) return;
    shownLabel = null;
    invalidate();
  });

  resize();

  // ---- public API ------------------------------------------------------------
  return {
    /** Move to a value (0-100). Ignored while the user is dragging. */
    setValue(v, { notify = false } = {}) {
      if (dragging) return;
      const next = clamp(v, 0, 100);
      if (Math.round(chain.xToValue(chain.target)) === Math.round(next)) return;
      chain.setValue(next, false);
      if (notify) report();
      else lastReported = Math.round(next);
      invalidate();
    },
    /** Keyboard-style step. */
    nudge(delta) {
      const next = clamp(Math.round(chain.xToValue(chain.target)) + delta, 0, 100);
      chain.setValue(next, false);
      report();
      invalidate();
    },
    setTheme(next) {
      theme = { ...DEFAULT_THEME, ...(next || {}) };
      surfaceMat.uniforms.uBgA.value.copy(rgb(theme.surfaceLight));
      surfaceMat.uniforms.uBgB.value.copy(rgb(theme.surfaceDark));
      surfaceMat.uniforms.uLabel.value.copy(rgb(theme.label));
      shadowMat.uniforms.uGray.value.copy(rgb(theme.shadow));
      shadowMat.uniforms.uGlow.value.copy(rgb(theme.glow));
      ['uC0', 'uC1', 'uC2', 'uC3'].forEach((k, i) => jellyMat.uniforms[k].value.copy(rgb(theme.jelly[i])));
      invalidate();
    },
    setOptions(next = {}) {
      if (next.snapBackTo !== undefined) opts.snapBackTo = next.snapBackTo;
      if (next.fontFamily && next.fontFamily !== opts.fontFamily) {
        opts.fontFamily = next.fontFamily;
        shownLabel = null;
        invalidate();
      }
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('pointerleave', onLeave);
      [surfaceGeo, shadowGeo, jellyGeo].forEach((g) => g.dispose());
      [surfaceMat, shadowMat, jellyMat].forEach((m) => m.dispose());
      labelTex.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
