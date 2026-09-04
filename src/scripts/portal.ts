// Portal de limo estilo Rick and Morty: disco 3D, células y chispas.

import * as THREE from 'three';

const PORTAL_VERT = `
uniform float uTime;
varying vec2 vUv;

void main() {
  vec3 p = position;
  float a = atan(p.y, p.x);
  float r = length(p.xy);
  float wobble = 0.04 * sin(a * 4.0 + uTime * 1.35)
    + 0.024 * sin(a * 7.0 - uTime * 1.85)
    + 0.014 * sin(a * 2.0 + uTime * 0.6);
  p.xy *= 1.0 + wobble * smoothstep(0.15, 0.95, r);
  p.z += (0.08 * sin(a * 3.0 + uTime * 0.95) + 0.04 * sin(a * 8.0 - uTime)) * r * r;
  vUv = p.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const PORTAL_FRAG = `
uniform float uTime;
uniform float uChaos;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.05 + vec2(11.2, 3.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  float t = uTime;
  float r = length(uv);
  float ang = atan(uv.y, uv.x);

  float nEdge = fbm(vec2(cos(ang), sin(ang)) * 2.2 + t * 0.32);
  float border = 0.68
    + 0.04 * sin(ang * 3.0 + t * 1.15)
    + 0.025 * sin(ang * 5.0 - t * 1.55)
    + 0.03 * nEdge;
  border += uChaos * 0.035 * sin(ang * 10.0 + t * 5.5);

  float wisp = fbm(vec2(ang * 2.1, r * 3.8 - t * 0.55));
  float slimeMask = smoothstep(border + 0.05 + wisp * 0.04, border - 0.05, r);
  float glow = smoothstep(border + 0.16, border - 0.02, r) * 0.4;
  float alpha = max(slimeMask, glow);
  if (alpha < 0.012) discard;

  float twist = ang + (0.7 - r) * 4.6 - t * 1.9;
  vec2 swirled = vec2(cos(twist), sin(twist)) * pow(r, 0.78);
  float slime = fbm(swirled * 5.4 + vec2(t * 0.38, -t * 0.3));
  slime = fbm(swirled * 3.2 + slime * 1.8 + t * 0.2);

  float cells = 0.0;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float spin = t * (0.7 + fi * 0.025) + fi * 0.73;
    float rad = 0.06 + 0.42 * fract(sin(fi * 19.7) * 13.1);
    vec2 c = vec2(cos(spin), sin(spin * 1.05)) * rad;
    c *= 0.82 + 0.18 * sin(t * 1.1 + fi * 1.7);
    float cr = 0.026 + 0.02 * fract(sin(fi * 7.3) * 5.9);
    cells += smoothstep(cr, cr * 0.18, length(uv - c));
  }
  cells = clamp(cells, 0.0, 1.0);

  vec3 dark = vec3(0.12, 0.45, 0.16);
  vec3 mid = vec3(0.44, 0.83, 0.24);
  vec3 hot = vec3(0.59, 0.97, 0.36);
  vec3 core = vec3(0.87, 1.0, 0.7);
  vec3 blob = vec3(0.06, 0.3, 0.12);

  vec3 col = mix(mid, hot, slime);
  col = mix(col, dark, (1.0 - slime) * 0.35);
  col = mix(col, blob, cells * 0.7);
  col = mix(col, core, pow(max(slime, 0.0), 4.0) * 0.45);

  float rim = smoothstep(0.08, 0.0, abs(r - border));
  col = mix(col, core, rim * 0.7 * slimeMask);
  col += hot * rim * 0.28 * slimeMask;
  col += hot * glow * 0.5;
  col *= slimeMask + glow * 0.85;

  if (uChaos > 0.5) {
    float flicker = 0.8 + 0.2 * step(0.14, fract(t * 6.2));
    col.rb += vec2(0.12, 0.04) * step(0.88, hash(vec2(floor(t * 11.0), 2.2)));
    col *= flicker;
    alpha *= flicker;
  }

  gl_FragColor = vec4(col, alpha);
}
`;

const BUBBLE_COUNT = 18;
const SPARK_COUNT = 90;

function sparkMap(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(223, 255, 178, 1)');
  glow.addColorStop(0.3, 'rgba(151, 247, 93, 0.75)');
  glow.addColorStop(1, 'rgba(31, 138, 59, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function showPortalFallback(wrap: Element | null): void {
  if (!wrap) return;
  if (!wrap.querySelector('.portal-rings')) {
    const rings = document.createElement('div');
    rings.className = 'portal-rings';
    wrap.querySelector('.portal-canvas')?.before(rings);
  }
  wrap.classList.add('portal-fallback');
}

function startPortal(canvas: HTMLCanvasElement): void {
  const wrap = canvas.closest('.portal-wrap');
  const chaos = canvas.closest('.lost-portal') ? 1 : 0;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
  } catch {
    showPortalFallback(wrap);
    return;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.set(0.12, 0.08, 3);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0x1f8a3b, 1.05));
  const keyLight = new THREE.PointLight(0x97f75d, 2.2, 6);
  keyLight.position.set(0.55, 0.7, 1.4);
  scene.add(keyLight);

  const group = new THREE.Group();
  group.rotation.x = 0.16;
  group.rotation.y = -0.18;
  scene.add(group);

  const restTilt = { x: 0.16, y: -0.18 };
  const look = { x: 0, y: 0 };
  const lookTarget = { x: 0, y: 0 };
  let scrollTilt = 0;
  const events = new AbortController();

  function aimFromPointer(clientX: number, clientY: number): void {
    const box = (wrap ?? canvas).getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const nx = ((clientX - box.left) / box.width) * 2 - 1;
    const ny = ((clientY - box.top) / box.height) * 2 - 1;
    lookTarget.y = Math.max(-1, Math.min(1, nx)) * 0.55;
    lookTarget.x = Math.max(-1, Math.min(1, -ny)) * 0.48;
  }

  function resetAim(): void {
    lookTarget.x = 0;
    lookTarget.y = 0;
  }

  function updateScrollTilt(): void {
    const box = (wrap ?? canvas).getBoundingClientRect();
    const mid = box.top + box.height / 2;
    const view = window.innerHeight || 1;
    scrollTilt = Math.max(-1, Math.min(1, (view * 0.42 - mid) / view));
  }

  const portalMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uChaos: { value: chaos },
    },
    vertexShader: PORTAL_VERT,
    fragmentShader: PORTAL_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const portalGeo = new THREE.CircleGeometry(1, 96);
  const portal = new THREE.Mesh(portalGeo, portalMat);
  group.add(portal);

  const bubbleGeo = new THREE.SphereGeometry(1, 18, 14);
  const bubbleMat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    shininess: 95,
    emissive: new THREE.Color(0x0c2a08),
    toneMapped: false,
    depthWrite: false,
  });
  const bubbles = new THREE.InstancedMesh(bubbleGeo, bubbleMat, BUBBLE_COUNT);
  const bubbleDummy = new THREE.Object3D();
  const bubbleColor = new THREE.Color();
  for (let i = 0; i < BUBBLE_COUNT; i += 1) {
    if (i % 4 === 0) bubbleColor.setRGB(0.59, 0.97, 0.36);
    else if (i % 4 === 1) bubbleColor.setRGB(0.44, 0.83, 0.24);
    else bubbleColor.setRGB(0.12, 0.45, 0.16);
    bubbles.setColorAt(i, bubbleColor);
  }
  if (bubbles.instanceColor) bubbles.instanceColor.needsUpdate = true;
  group.add(bubbles);

  const sparkGeo = new THREE.BufferGeometry();
  const sparkSeeds = new Float32Array(SPARK_COUNT * 3);
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    sparkSeeds[i * 3] = Math.random();
    sparkSeeds[i * 3 + 1] = Math.random();
    sparkSeeds[i * 3 + 2] = Math.random();
  }
  sparkGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3),
  );
  sparkGeo.setAttribute('seed', new THREE.BufferAttribute(sparkSeeds, 3));
  const sparkTex = sparkMap();
  const sparkMat = new THREE.PointsMaterial({
    map: sparkTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    size: 0.045,
    sizeAttenuation: true,
    color: 0x97f75d,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  group.add(sparks);

  const born = performance.now();
  let frame = 0;
  let visible = true;

  function resize(): void {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    if (aspect >= 1) {
      camera.left = -aspect;
      camera.right = aspect;
      camera.top = 1;
      camera.bottom = -1;
    } else {
      camera.left = -1;
      camera.right = 1;
      camera.top = 1 / aspect;
      camera.bottom = -1 / aspect;
    }
    camera.updateProjectionMatrix();
  }

  function placeBubbles(time: number): void {
    for (let i = 0; i < BUBBLE_COUNT; i += 1) {
      const seed = i * 1.37;
      const speed = 0.32 + (i % 5) * 0.07;
      const ang = time * speed + seed;
      const rad = 0.12 + (i % 9) * 0.075;
      bubbleDummy.position.set(
        Math.cos(ang) * rad,
        Math.sin(ang * 1.08) * rad * 0.92,
        Math.sin(ang * 0.65 + seed) * 0.12,
      );
      const scale = (0.018 + (i % 5) * 0.008) * (1 + 0.14 * Math.sin(time * 2.1 + seed));
      bubbleDummy.scale.setScalar(scale);
      bubbleDummy.updateMatrix();
      bubbles.setMatrixAt(i, bubbleDummy.matrix);
    }
    bubbles.instanceMatrix.needsUpdate = true;
  }

  function placeSparks(time: number): void {
    const positions = sparkGeo.getAttribute('position');
    const seeds = sparkGeo.getAttribute('seed');
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      const sx = seeds.getX(i);
      const sy = seeds.getY(i);
      const sz = seeds.getZ(i);
      const life = (time * (0.18 + sx * 0.22) + sy) % 1;
      const ang = sx * Math.PI * 2 + time * (0.5 + sz * 0.4) + life * 1.8;
      const rad = 0.7 + life * 0.08 + sy * 0.04;
      positions.setXYZ(
        i,
        Math.cos(ang) * rad,
        Math.sin(ang) * rad * 0.92,
        (sz - 0.5) * 0.2 + Math.sin(time + sx * 6.0) * 0.05,
      );
    }
    positions.needsUpdate = true;
  }

  function paint(now: number): void {
    resize();
    const time = reduceMotion.matches ? 1.1 : (now - born) / 1000;
    portalMat.uniforms.uTime.value = time;
    look.x += (lookTarget.x - look.x) * 0.08;
    look.y += (lookTarget.y - look.y) * 0.08;
    group.rotation.x = restTilt.x + Math.sin(time * 0.22) * 0.05 + look.x + scrollTilt * 0.28;
    group.rotation.y = restTilt.y + Math.sin(time * 0.28) * 0.08 + look.y;
    group.rotation.z = look.y * 0.14;
    group.position.x = look.y * 0.08;
    group.position.y = -look.x * 0.06;
    keyLight.position.set(0.55 + look.y * 1.4, 0.7 - look.x * 1.1, 1.4);
    placeBubbles(time);
    placeSparks(time);
    renderer.render(scene, camera);
    if (wrap && !wrap.classList.contains('portal-live')) wrap.classList.add('portal-live');
  }

  function loop(now: number): void {
    if (!canvas.isConnected) {
      cancelAnimationFrame(frame);
      events.abort();
      portalGeo.dispose();
      portalMat.dispose();
      bubbleGeo.dispose();
      bubbleMat.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
      sparkTex.dispose();
      renderer.dispose();
      return;
    }
    paint(now);
    if (!reduceMotion.matches && !document.hidden && visible) {
      frame = requestAnimationFrame(loop);
    }
  }

  function restart(): void {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(loop);
  }

  const io = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible) restart();
  });
  io.observe(canvas);

  const host = wrap ?? canvas;
  if (!reduceMotion.matches) {
    host.addEventListener(
      'pointermove',
      (event) => {
        if (event instanceof PointerEvent) aimFromPointer(event.clientX, event.clientY);
      },
      { signal: events.signal },
    );
    host.addEventListener('pointerleave', resetAim, { signal: events.signal });
    window.addEventListener('scroll', updateScrollTilt, { signal: events.signal, passive: true });
    updateScrollTilt();
  }

  window.addEventListener('resize', () => {
    updateScrollTilt();
    if (reduceMotion.matches || document.hidden || !visible) paint(performance.now());
  });
  reduceMotion.addEventListener('change', restart);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) restart();
  });

  renderer.compile(scene, camera);
  paint(performance.now());
  restart();
}

const started = new WeakSet<HTMLCanvasElement>();

function mountPortals(): void {
  for (const node of document.querySelectorAll<HTMLCanvasElement>('.portal-canvas')) {
    if (started.has(node)) continue;
    started.add(node);
    startPortal(node);
  }
}

mountPortals();
document.addEventListener('astro:after-swap', mountPortals);
document.addEventListener('astro:page-load', mountPortals);
