<template>
   <div ref="host" class="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
</template>

<script setup lang="ts">
import { joinPublicAsset } from '~/utils/publicAsset';

/** Интерактивный фон: параллакс, объёмный свет, частицы. */

/** Меньше пикселей и кадров — почти без потери «леса», заметно меньше нагрева GPU. */
const FOREST_DPR_MAX = 1.45;
const FOREST_DPR_MAX_LOW = 1.15;
const FOREST_MIN_FRAME_MS = 1000 / 46;
const FOREST_DUST_NORMAL = 1750;
const FOREST_DUST_LOW = 880;

function forestGpuLowTier(reduceMotion: boolean): boolean {
   if (reduceMotion) return true;
   try {
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-data: reduce)').matches) return true;
   } catch {
      /* ignore */
   }
   const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 8 : 8;
   const dm = typeof navigator !== 'undefined' && 'deviceMemory' in navigator ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
   if (hc <= 4) return true;
   if (dm != null && dm <= 4) return true;
   return false;
}

const host = ref<HTMLElement | null>(null);
const base = useRuntimeConfig().app.baseURL || '/';

const props = withDefaults(defineProps<{ showForestImage?: boolean }>(), {
   showForestImage: false,
});

const FOREST_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Лес: диффуз по яркости текстуры + направление света от uMouse (левый верх по UV).
 * Туман убран — глубина только передний план + освещение.
 */
const FOREST_FS = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uMouse;
uniform vec2 uTexel;
uniform float uLight;
varying vec2 vUv;

void main() {
  vec4 tex = texture2D(uMap, vUv);
  vec3 cRaw = tex.rgb;
  float y = vUv.y;

  vec2 px = uTexel;
  float h0 = dot(cRaw, vec3(0.299, 0.587, 0.114));
  float hx = dot(texture2D(uMap, vUv + vec2(px.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
  float hy = dot(texture2D(uMap, vUv + vec2(0.0, px.y)).rgb, vec3(0.299, 0.587, 0.114));
  vec2 surf = vec2(h0 - hx, h0 - hy) * 2.15;
  vec3 N = normalize(vec3(surf, 0.38));

  vec2 sunUvDark = vec2(0.10 + uMouse.x * 0.14, 0.94 + uMouse.y * 0.11);
  vec2 sunUvLight = vec2(0.74 + uMouse.x * 0.12, 0.91 + uMouse.y * 0.09);
  vec2 sunUv = mix(sunUvDark, sunUvLight, uLight);
  vec3 L = normalize(vec3(sunUv.x - vUv.x, sunUv.y - vUv.y, 0.36));
  float wrap = mix(0.22, 0.26, uLight);
  float diff = clamp((max(dot(N, L), 0.0) + wrap) / (1.0 + wrap), 0.0, 1.0);
  diff = pow(diff, mix(0.82, 0.78, uLight));
  /* Тёмный — как было; светлый — сочнее: контраст и насыщение, без мыла */
  vec3 cDark = cRaw * mix(0.72, 1.18, diff);
  vec3 cLight = cRaw * mix(0.68, 1.08, diff);
  vec3 c = mix(cDark, cLight, uLight);
  vec3 coolSh = vec3(0.82, 0.90, 1.05);
  vec3 warmLitDark = vec3(1.14, 1.06, 0.92);
  vec3 warmLitDay = vec3(1.08, 1.02, 0.72);
  vec3 warmLit = mix(warmLitDark, warmLitDay, uLight);
  float warmMix = mix(diff * 0.82 + 0.06, diff * 0.72 + 0.12, uLight);
  c = mix(c * coolSh, c * warmLit, warmMix);
  float fg = smoothstep(1.0, 0.38, y);
  c *= mix(1.0, mix(0.78, 0.84, uLight), fg * mix(0.52, 0.38, uLight));
  /* Буст насыщенности только для светлого кадра */
  float yLight = dot(c, vec3(0.299, 0.587, 0.114));
  float sat = mix(1.0, 1.24, uLight);
  c = mix(vec3(yLight), c, sat);
  /* vec3 × vec3: mix(float, vec3, ·) запрещён в GLSL ES 1.0 — ломает всю сцену */
  c *= mix(vec3(1.0), vec3(1.02, 1.06, 1.01), uLight);
  c = clamp(c, 0.0, 1.14);
  gl_FragColor = vec4(c, 1.0);
}
`;

const RAY_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Объёмные лучи: источники слева сверху (UV), направление вниз-вправо.
 * tm = uTime * 0.107 — мерцание/шум в ~3× медленнее, чем раньше (0.32/3).
 */
const RAY_FS = /* glsl */ `
uniform float uTime;
uniform vec2 uMouse;
uniform float uWide;
uniform float uLight;
varying vec2 vUv;

float n2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = n2(i);
  float b = n2(i + vec2(1.0, 0.0));
  float c = n2(i + vec2(0.0, 1.0));
  float d = n2(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float shaftBeam(
  vec2 uv,
  vec2 src,
  vec2 rayDir,
  float spread,
  vec2 mouse,
  float wide
) {
  vec2 srcShift = src + vec2(mouse.x * 0.14, mouse.y * 0.11);
  vec2 rel = uv - srcShift;
  float along = dot(rel, rayDir);
  if (along < 0.02 || along > 1.55) return 0.0;

  vec2 perp = rel - rayDir * along;
  float lateral = length(perp);
  float beamW = spread * (1.0 + wide * 0.75) * (0.14 + along * 1.05);
  float cone = exp(-(lateral * lateral) / max(beamW * beamW, 1e-6));

  float tm = uTime * 0.107;
  float lenPhase = along * (13.0 + wide * 7.0);
  float shimmer = 0.70 + 0.30 * sin(tm * 2.1 + lenPhase + lateral * 6.0);
  float n = noise(uv * (9.5 - wide * 4.0) + tm * vec2(0.028, 0.068));
  cone *= shimmer * (0.60 + 0.40 * n);

  float screenFade = smoothstep(0.0, 0.14, uv.y) * (1.0 - smoothstep(0.96, 1.02, uv.y) * 0.35);
  float depthFade = mix(1.0, exp(-along * (0.26 + wide * 0.10)), smoothstep(0.0, 1.0, along));
  cone *= screenFade * depthFade;

  return cone;
}

vec2 sunShift(vec2 p, float ul) {
  vec2 q = p + vec2(0.50 * ul, -0.02 * ul);
  return mix(p, q, ul);
}

void main() {
  vec2 uv = vUv;
  vec2 m = uMouse;
  float tm = uTime * 0.107;
  float ul = uLight;

  vec2 rayDir = normalize(vec2(0.48, -0.88) + vec2(m.x * 0.28, m.y * 0.22));

  float wide = uWide;
  float spreadBase = mix(0.11, 0.28, wide) * mix(1.0, 1.14, ul);

  float b = 0.0;
  b += shaftBeam(uv, sunShift(vec2(0.06 + m.x * 0.07, 0.97 + m.y * 0.05), ul), rayDir, spreadBase * 1.05, m, wide);
  b += shaftBeam(uv, sunShift(vec2(0.14 + m.x * 0.09, 0.94 + m.y * 0.06), ul), rayDir, spreadBase * 1.12, m, wide);
  b += shaftBeam(uv, sunShift(vec2(0.22 + m.x * 0.11, 0.91 + m.y * 0.055), ul), rayDir, spreadBase, m, wide);
  b += shaftBeam(uv, sunShift(vec2(0.30 + m.x * 0.10, 0.88 + m.y * 0.05), ul), rayDir, spreadBase * 1.18, m, wide);
  b += shaftBeam(uv, sunShift(vec2(0.02 + m.x * 0.05, 0.90 + m.y * 0.045), ul), rayDir, spreadBase * 0.95, m, wide);

  float ambient = noise(uv * 6.0 + tm * 0.03) * mix(0.028, 0.055, ul) * smoothstep(0.12, 0.95, uv.y) * (1.0 - wide * 0.55);
  b += ambient;
  b *= mix(1.0, 1.32, ul);

  vec3 gold = vec3(1.0, 0.93, 0.72);
  vec3 lime = vec3(0.52, 0.72, 0.42);
  vec3 limeJuicy = vec3(0.42, 0.78, 0.38);
  vec3 amber = vec3(0.98, 0.88, 0.58);
  vec3 cream = vec3(0.96, 0.94, 0.82);
  vec3 skyWarm = vec3(1.0, 0.98, 0.90);
  float mixAmt = clamp(b * (1.22 - wide * 0.32), 0.0, 1.0);
  vec3 limePick = mix(lime, limeJuicy, ul);
  vec3 col = mix(limePick, mix(amber, mix(gold, cream, mixAmt * 0.55), mixAmt * 0.82), mixAmt);
  /* День: ярче золото и изумруд в лучах */
  vec3 lightShaft = vec3(0.92, 0.68, 0.28);
  vec3 lightMint = vec3(0.52, 0.92, 0.62);
  col = mix(col, mix(lightMint, lightShaft, 0.55), ul * mixAmt * 0.42);
  col = mix(col, skyWarm, ul * mixAmt * 0.06);

  float alpha = b * mix(0.29, 0.16, wide);
  alpha *= mix(1.0, 1.85, ul);
  float cap = mix(0.37, 0.24, step(0.5, wide)) * mix(1.0, 1.48, ul);
  alpha = clamp(alpha, 0.0, cap);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const DUST_FS = /* glsl */ `
uniform float uLight;
varying float vGlow;
void main() {
  vec2 pt = gl_PointCoord - vec2(0.5);
  float r = length(pt);
  if (r > 0.5) discard;
  float lit = clamp(vGlow, 0.0, 1.0);
  float ul = uLight;
  float a = smoothstep(0.5, 0.0, r);
  a *= mix(0.05, 0.22, lit);
  /* Светлый лес: темнее и плотнее альфа — частицы читаются на светлом фоне */
  a *= mix(1.0, 2.35, ul);
  a += ul * (0.045 + lit * 0.06);

  vec3 shadow = mix(vec3(0.42, 0.48, 0.44), vec3(0.16, 0.28, 0.20), ul);
  vec3 mid = mix(vec3(0.66, 0.76, 0.64), vec3(0.30, 0.46, 0.34), ul);
  vec3 beam = mix(vec3(0.86, 0.82, 0.72), vec3(0.44, 0.52, 0.32), ul);
  vec3 col = mix(shadow, mid, smoothstep(0.08, 0.45, lit));
  col = mix(col, beam, smoothstep(0.38, 0.94, lit));
  gl_FragColor = vec4(col, a);
}
`;

const DUST_VERTEX = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform vec2 uMouse;
uniform vec2 uBeam;
uniform vec2 uPlane;
uniform float uReduce;
uniform float uLight;
varying float vGlow;

vec2 dustSun(vec2 p, float ul) {
  return mix(p, p + vec2(0.50 * ul, -0.02 * ul), ul);
}

float shaftLit(vec2 uv, vec2 src, vec2 rayDir, float spread, vec2 mouse) {
  vec2 srcShift = src + vec2(mouse.x * 0.14, mouse.y * 0.11);
  vec2 rel = uv - srcShift;
  float along = dot(rel, rayDir);
  if (along < 0.02 || along > 1.55) return 0.0;
  vec2 perp = rel - rayDir * along;
  float lateral = length(perp);
  float beamW = spread * (0.14 + along * 1.05);
  float cone = exp(-(lateral * lateral) / max(beamW * beamW, 1e-6));
  float screenFade = smoothstep(0.0, 0.14, uv.y) * (1.0 - smoothstep(0.96, 1.02, uv.y) * 0.35);
  float depthFade = mix(1.0, exp(-along * 0.26), smoothstep(0.0, 1.0, along));
  return cone * screenFade * depthFade;
}

void main() {
  vec3 pos = position;
  /* Заметнее дрейф пыли: быстрее фаза + ~×1.5 амплитуда при том же reduced-motion */
  float t = uTime * 0.205 * (1.0 - uReduce);
  float zf = clamp(pos.z * 0.22, 0.0, 1.0);
  float driftAmp = mix(1.58, 1.12, uReduce);

  vec2 flow = uBeam;
  pos.x += flow.x * sin(t * 0.59 + aPhase * 1.1) * (0.075 + zf * 0.064) * driftAmp * (1.0 - uReduce);
  pos.y += flow.y * cos(t * 0.45 + aPhase * 1.35) * (0.064 + zf * 0.053) * driftAmp * (1.0 - uReduce);

  vec2 orth = vec2(-flow.y, flow.x);
  pos.xy += orth * sin(t * 0.91 + aPhase * 2.1) * 0.041 * driftAmp * (1.0 - uReduce);

  pos.x += sin(t * 0.96 + aPhase) * 0.051 * driftAmp * (1.0 - uReduce);
  pos.y += cos(t * 0.69 + aPhase * 1.7) * 0.041 * driftAmp * (1.0 - uReduce);

  float mx = uMouse.x * (0.26 + pos.z * 0.07);
  float my = uMouse.y * (0.20 + pos.z * 0.06);
  pos.x += mx;
  pos.y += my;

  vec2 nuv = vec2(pos.x / uPlane.x + 0.5, pos.y / uPlane.y + 0.5);
  vec2 m = uMouse;
  vec2 rayDir = normalize(vec2(0.48, -0.88) + vec2(m.x * 0.28, m.y * 0.22));
  float spread = 0.11 * mix(1.0, 1.12, uLight);
  float ul = uLight;
  float g = 0.0;
  g += shaftLit(nuv, dustSun(vec2(0.06 + m.x * 0.07, 0.97 + m.y * 0.05), ul), rayDir, spread * 1.05, m);
  g += shaftLit(nuv, dustSun(vec2(0.14 + m.x * 0.09, 0.94 + m.y * 0.06), ul), rayDir, spread * 1.12, m);
  g += shaftLit(nuv, dustSun(vec2(0.22 + m.x * 0.11, 0.91 + m.y * 0.055), ul), rayDir, spread, m);
  g += shaftLit(nuv, dustSun(vec2(0.30 + m.x * 0.10, 0.88 + m.y * 0.05), ul), rayDir, spread * 1.18, m);
  g += shaftLit(nuv, dustSun(vec2(0.02 + m.x * 0.05, 0.90 + m.y * 0.045), ul), rayDir, spread * 0.95, m);

  vGlow = clamp(g * mix(1.68, 2.05, uLight) + zf * mix(0.07, 0.11, uLight), 0.0, 1.0);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float ps = 130.0 * (0.82 + 0.18 * sin(aPhase + t * 0.93)) * (1.0 + vGlow * mix(0.28, 0.40, uLight));
  gl_PointSize = clamp(ps / max(-mvPosition.z, 0.25), 1.5, 78.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

let disposeFn: (() => void) | undefined;

onMounted(async () => {
   const root = host.value;
   if (!root || !import.meta.client) return;

   const THREE = await import('three');

   const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   const lowTier = forestGpuLowTier(reduceMotion);

   let width = root.clientWidth || window.innerWidth;
   let height = root.clientHeight || window.innerHeight;
   let aspect = width / height;

   const scene = new THREE.Scene();
   const timer = new THREE.Timer();
   timer.connect(document);

   const camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 100);
   camera.position.set(0, 0, 6.2);

   const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: 'default',
   });
   const dprMax = lowTier ? FOREST_DPR_MAX_LOW : FOREST_DPR_MAX;
   renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprMax));
   renderer.setSize(width, height);
   renderer.setClearColor(0x000000, 0);
   renderer.outputColorSpace = THREE.SRGBColorSpace;
   root.appendChild(renderer.domElement);
   const canvas = renderer.domElement;
   canvas.style.display = 'block';
   canvas.style.width = '100%';
   canvas.style.height = '100%';

   const world = new THREE.Group();
   scene.add(world);

   /* Запас под параллакс — иначе видны края текстуры при наклоне world */
   const pad = 1.38;
   const camZ = camera.position.z;

   function planeScale(): [number, number] {
      const vFov = (camera.fov * Math.PI) / 180;
      const h = 2 * Math.tan(vFov / 2) * camZ;
      const w = h * aspect;
      return [w * pad, h * pad];
   }

   const [sw, sh] = planeScale();

   let forest: import('three').Mesh | null = null;
   let forestGeo: import('three').PlaneGeometry | null = null;
   let forestMat: import('three').Material | null = null;
   let forestTexDark: import('three').Texture | undefined;

   if (props.showForestImage) {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');

      async function loadForestTexture(url: string): Promise<import('three').Texture | undefined> {
         try {
            const tex = await new Promise<import('three').Texture>((resolve, reject) => {
               loader.load(url, resolve, undefined, reject);
            });
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            return tex;
         } catch {
            return undefined;
         }
      }

      forestTexDark = await loadForestTexture(joinPublicAsset(base, '/chahta-forest.jpg'));

      function syncForestTextureBinding() {
         if (!forestUniforms) return;
         const tex = forestTexDark;
         if (!tex) return;
         if (forestUniforms.uMap.value !== tex) {
            forestUniforms.uMap.value = tex;
            const im = tex.image as { width?: number; height?: number } | undefined;
            const iw = im?.width ?? 2048;
            const ih = im?.height ?? 2048;
            forestUniforms.uTexel.value.set(1 / iw, 1 / ih);
         }
      }

      forestGeo = new THREE.PlaneGeometry(1, 1);

      type ForestUniforms = {
         uMap: { value: import('three').Texture };
         uMouse: { value: import('three').Vector2 };
         uTexel: { value: import('three').Vector2 };
         uLight: { value: number };
      };
      let forestUniforms: ForestUniforms | undefined;

      const initialForestTex = forestTexDark;
      forestMat = initialForestTex
         ? (() => {
              const texDims = initialForestTex.image as { width: number; height: number } | undefined;
              const iw = texDims?.width ?? 2048;
              const ih = texDims?.height ?? 2048;
              forestUniforms = {
                 uMap: { value: initialForestTex },
                 uMouse: { value: new THREE.Vector2(0, 0) },
                 uTexel: { value: new THREE.Vector2(1 / iw, 1 / ih) },
                 uLight: { value: 0 },
              };
              syncForestTextureBinding();
              return new THREE.ShaderMaterial({
                 uniforms: forestUniforms,
                 vertexShader: FOREST_VS,
                 fragmentShader: FOREST_FS,
              });
           })()
         : new THREE.MeshBasicMaterial({ color: 0x0a1510 });
      forest = new THREE.Mesh(forestGeo, forestMat);
      forest.position.z = 0;
      forest.scale.set(sw, sh, 1);
      world.add(forest);
   }

   function makeRayMaterial(wide: number) {
      return new THREE.ShaderMaterial({
         uniforms: {
            uTime: { value: 0 },
            uMouse: { value: new THREE.Vector2(0, 0) },
            uWide: { value: wide },
            uLight: { value: 0 },
         },
         vertexShader: RAY_VS,
         fragmentShader: RAY_FS,
         transparent: true,
         depthWrite: false,
         blending: THREE.AdditiveBlending,
         side: THREE.DoubleSide,
      });
   }

   const rayMatSharp = makeRayMaterial(0);
   const rayMatSoft = makeRayMaterial(1);

   const rayGeo = new THREE.PlaneGeometry(1, 1);
   const raysSharp = new THREE.Mesh(rayGeo, rayMatSharp);
   raysSharp.position.z = 0.42;
   raysSharp.scale.set(sw * 1.035, sh * 1.035, 1);
   raysSharp.renderOrder = 2;
   world.add(raysSharp);

   const raysSoft = new THREE.Mesh(rayGeo, rayMatSoft);
   raysSoft.position.z = 0.64;
   raysSoft.scale.set(sw * 1.08, sh * 1.08, 1);
   raysSoft.renderOrder = 2;
   world.add(raysSoft);
   /* Второй полноэкранный проход лучей — дорогой; на слабом железе хватает одного слоя. */
   raysSoft.visible = !lowTier;

   const dustCount = reduceMotion ? 400 : lowTier ? FOREST_DUST_LOW : FOREST_DUST_NORMAL;
   const positions = new Float32Array(dustCount * 3);
   const phases = new Float32Array(dustCount);
   for (let i = 0; i < dustCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * sw * 1.22;
      positions[i * 3 + 1] = (Math.random() - 0.5) * sh * 1.22;
      const t = Math.random();
      positions[i * 3 + 2] = 0.85 + t * t * 4.6;
      phases[i] = Math.random() * Math.PI * 2;
   }
   const dustGeo = new THREE.BufferGeometry();
   dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
   dustGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

   function syncLightBeam(mouseX: number, mouseY: number, out: import('three').Vector2) {
      const dx = 0.48 + mouseX * 0.28;
      const dy = -0.88 + mouseY * 0.22;
      const len = Math.hypot(dx, dy) || 1;
      out.set(dx / len, dy / len);
   }

   const dustUniforms = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uBeam: { value: new THREE.Vector2(0.48, -0.88).normalize() },
      uPlane: { value: new THREE.Vector2(sw, sh) },
      uReduce: { value: reduceMotion ? 1 : 0 },
      uLight: { value: 0 },
   };
   const dustShaderMat = new THREE.ShaderMaterial({
      uniforms: dustUniforms,
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
   });

   const dust = new THREE.Points(dustGeo, dustShaderMat);
   dust.renderOrder = 3;
   world.add(dust);

   const mouseTarget = new THREE.Vector2(0, 0);
   const mouseCur = new THREE.Vector2(0, 0);

   function onPointer(e: PointerEvent) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      mouseTarget.x = (e.clientX / w) * 2 - 1;
      mouseTarget.y = -(e.clientY / h) * 2 + 1;
   }

   window.addEventListener('pointermove', onPointer, { passive: true });

   let frame = 0;
   let lastDrawMs = 0;

   function scheduleFrame() {
      frame = requestAnimationFrame(tick);
   }

   function onForestVisibility() {
      if (document.hidden) {
         cancelAnimationFrame(frame);
         frame = 0;
      } else {
         lastDrawMs = 0;
         if (!frame) scheduleFrame();
      }
   }
   document.addEventListener('visibilitychange', onForestVisibility);

   const tick = (time: number) => {
      scheduleFrame();
      if (document.hidden) return;
      if (time - lastDrawMs < FOREST_MIN_FRAME_MS) return;
      lastDrawMs = time;
      timer.update();
      const t = reduceMotion ? 0 : timer.getElapsed();
      rayMatSharp.uniforms.uTime!.value = t;
      rayMatSoft.uniforms.uTime!.value = t;
      dustUniforms.uTime.value = t;

      mouseCur.lerp(mouseTarget, reduceMotion ? 1 : 0.052);
      const mx = reduceMotion ? 0 : mouseCur.x * 0.42;
      const my = reduceMotion ? 0 : mouseCur.y * 0.36;
      rayMatSharp.uniforms.uMouse!.value.set(mx, my);
      rayMatSoft.uniforms.uMouse!.value.set(mx, my);
      dustUniforms.uMouse.value.set(mx, my);
      syncLightBeam(mx, my, dustUniforms.uBeam.value);

      const uLightVal = 0;
      if (forestMat instanceof THREE.ShaderMaterial && forestMat.uniforms.uLight) {
         forestMat.uniforms.uLight.value = uLightVal;
      }
      rayMatSharp.uniforms.uLight!.value = uLightVal;
      rayMatSoft.uniforms.uLight!.value = uLightVal;
      dustUniforms.uLight.value = uLightVal;

      if (forestMat instanceof THREE.ShaderMaterial && forestMat.uniforms.uMouse) {
         forestMat.uniforms.uMouse.value.set(mx, my);
      }

      /* Лёгкий параллакс: сильный наклон по Y даёт чёрные края — коэффициенты маленькие */
      world.rotation.y = mx * 0.055;
      world.rotation.x = my * 0.072;

      renderer.render(scene, camera);
   };
   scheduleFrame();

   function resize() {
      const el = host.value;
      if (!el) return;
      width = el.clientWidth || window.innerWidth;
      height = el.clientHeight || window.innerHeight;
      aspect = width / height;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);

      const [nw, nh] = planeScale();
      if (forest) forest.scale.set(nw, nh, 1);
      raysSharp.scale.set(nw * 1.035, nh * 1.035, 1);
      raysSoft.scale.set(nw * 1.08, nh * 1.08, 1);
      dustUniforms.uPlane.value.set(nw, nh);
   }

   const ro = new ResizeObserver(() => resize());
   /* TS 6 / пересечение типов DOM даёт ложное несовпадение с Element — безопасно для реального HTMLElement из шаблона. */
   ro.observe(root as unknown as Element);

   disposeFn = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      document.removeEventListener('visibilitychange', onForestVisibility);
      timer.dispose();
      window.removeEventListener('pointermove', onPointer);
      ro.disconnect();
      renderer.dispose();
      forestGeo?.dispose();
      forestMat?.dispose();
      forestTexDark?.dispose();
      rayGeo.dispose();
      rayMatSharp.dispose();
      rayMatSoft.dispose();
      dustGeo.dispose();
      dustShaderMat.dispose();
      canvas.remove();
   };
});

onBeforeUnmount(() => {
   disposeFn?.();
});
</script>
