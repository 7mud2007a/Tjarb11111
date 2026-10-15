// jellyShaders.js
// GLSL for the three ShaderMaterials: the grooved surface, the jelly wall and
// the coloured shadow streak. Colours are written as display (sRGB) values.

// ---------------------------------------------------------------- surface --
export const SURFACE_VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPos = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const SURFACE_FRAG = /* glsl */ `
uniform vec2 uRes;
uniform float uHx;      // half length of the groove's straight part
uniform float uR;       // groove radius (half width)
uniform sampler2D uText;
uniform vec4 uTextRect; // x0, x1, zCenter, zHalf
uniform vec3 uBgA;
uniform vec3 uBgB;
uniform vec3 uLabel;
uniform vec3 uLight;
varying vec3 vPos;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  // Soft studio gradient: light top-left, darker bottom-right.
  vec2 sc = gl_FragCoord.xy / uRes;
  float g = clamp(0.62 * (1.0 - sc.y) + 0.38 * sc.x, 0.0, 1.0);
  vec3 bg = mix(uBgA, uBgB, smoothstep(0.0, 1.0, g));

  // Groove = capsule signed distance (negative inside).
  vec2 p = vPos.xz;
  vec2 cp = vec2(clamp(p.x, -uHx, uHx), 0.0);
  vec2 q = p - cp;
  float ql = max(length(q), 1e-4);
  float d = ql - uR;
  vec2 gr = q / ql;

  // Rounded lip: normal from the derivative of a smoothstep height profile.
  float bw = 0.085;
  float t = clamp((d + bw) / (2.0 * bw), 0.0, 1.0);
  float slope = 0.13 * 6.0 * t * (1.0 - t) / (2.0 * bw);
  vec3 n = normalize(vec3(-slope * gr.x, 1.0, -slope * gr.y));
  vec3 L = normalize(uLight);
  float shade = clamp(dot(n, L) / L.y, 0.55, 1.25);
  vec3 col = bg * shade;

  // Groove floor: darker, occluded near the walls, extra dark under the back lip.
  float inside = 1.0 - smoothstep(-0.02, 0.03, d);
  float ao = 1.0 - 0.30 * exp(d * 7.0);
  float back = exp(d * 11.0) * smoothstep(0.0, 0.8, -gr.y);
  col = mix(col, col * 0.82 * ao * (1.0 - 0.18 * back), inside);

  // Embossed % label on the floor.
  vec2 tuv = vec2((p.x - uTextRect.x) / (uTextRect.y - uTextRect.x),
                  0.5 - (p.y - uTextRect.z) / (2.0 * uTextRect.w));
  float inRect = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);
  float ta = texture2D(uText, clamp(tuv, 0.0, 1.0)).a * inRect;
  col = mix(col, uLabel, ta * 0.78 * inside);

  col += (hash(gl_FragCoord.xy) - 0.5) * (1.5 / 255.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ------------------------------------------------------------------ jelly --
export const JELLY_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const JELLY_FRAG = /* glsl */ `
uniform vec3 uLight;
uniform float uThin;   // 0 = squashed & thick, 1 = stretched & thin
uniform vec3 uC0;      // cream
uniform vec3 uC1;      // peach
uniform vec3 uC2;      // amber
uniform vec3 uC3;      // deep orange
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;

void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uLight);
  float s = vUv.x;
  float v = clamp(vUv.y, 0.0, 1.0);

  // Colour runs cream -> peach -> amber -> deep orange towards the handle,
  // and saturates as the jelly thins out.
  float k = clamp(s + (uThin - 0.5) * 0.5, 0.0, 1.0);
  vec3 base = mix(uC0, uC1, smoothstep(0.05, 0.42, k));
  base = mix(base, uC2, smoothstep(0.36, 0.74, k));
  base = mix(base, uC3, smoothstep(0.72, 1.0, k));

  float nv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - nv, 3.0);
  float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);

  // Back-lit glow: the light sits behind the sheet, so it shines through.
  vec3 Lh = normalize(vec3(L.x, 0.0, L.z));
  vec3 Vh = normalize(vec3(V.x, 0.0, V.z));
  float trans = pow(clamp(dot(-Lh, Vh) * 0.5 + 0.5, 0.0, 1.0), 2.2);
  trans *= 0.7 + 0.5 * smoothstep(0.2, 1.0, v);
  float glow = 0.45 + 0.75 * uThin;

  vec3 col = base * (0.50 + 0.32 * wrap) + base * trans * glow * 0.65;

  // Studio reflections.
  vec3 R = reflect(-V, N);
  float sb1 = smoothstep(0.80, 0.97, dot(R, normalize(vec3(-0.35, 0.75, 0.55))));
  float sb2 = smoothstep(0.92, 0.995, dot(R, normalize(vec3(0.6, 0.6, -0.5))));
  col += vec3(1.0, 0.97, 0.93) * (sb1 * 0.55 + sb2 * 0.35);
  col += vec3(1.0, 0.93, 0.85) * fres * 0.35;

  // Bright rolled top edge, darker foot.
  col = mix(col, vec3(1.0, 0.90, 0.72), smoothstep(0.92, 0.995, v) * 0.5);
  col *= mix(0.80, 1.0, smoothstep(0.0, 0.3, v));

  float alpha = mix(0.70, 0.95, smoothstep(0.0, 0.45, v));
  gl_FragColor = vec4(col, alpha);
}
`;

// ----------------------------------------------------------------- shadow --
export const SHADOW_VERT = /* glsl */ `
attribute float aH;
varying vec2 vUv;
varying float vH;
void main() {
  vUv = uv;
  vH = aH;
  vec4 w = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const SHADOW_FRAG = /* glsl */ `
uniform vec3 uGray;
uniform vec3 uGlow;
varying vec2 vUv;
varying float vH;
void main() {
  float s = vUv.x;
  float v = vUv.y;
  float fall = pow(1.0 - v, 1.35);
  float soft = smoothstep(0.0, 0.10, s);
  float a = 0.85 * fall * soft * clamp(vH, 0.0, 1.0);
  float tint = smoothstep(0.15, 0.85, s);
  vec3 c = mix(uGray, uGlow, tint);
  gl_FragColor = vec4(c, a * mix(0.85, 1.0, tint));
}
`;
