// src/components/collapse/environment.ts
import * as THREE from 'three';
import { Sky } from '@/components/game/sky';

/**
 * The night the site collapses into: sky, moon, stars, ground, fog.
 *
 * ── What is reused, and what isn't ──
 *
 * The sky is `game/sky.ts`, unmodified. It is already a camera-centred dome
 * with a hash star field and colours handed in as uniforms — so a permanent
 * night is just a permanent set of arguments. No day cycle: the plan locked
 * this world at night, and `dayNight.ts` would be a whole clock driving numbers
 * that never change.
 *
 * Its MOON is not used. See `buildMoon` for why, and for where it went.
 *
 * The ground is new, because it is not terrain. It is one enormous plane that
 * follows the camera, so it is infinite in practice without being large in
 * memory. Walkable from slice 4; nothing out there, on purpose.
 *
 * ── The one colour rule that matters here ──
 *
 * `Sky`'s shader writes its colour straight to the framebuffer, with no
 * sRGB encode (it has no `colorspace_fragment`). Standard three materials DO
 * encode. So the same `THREE.Color` shown by the sky and by a standard material
 * comes out as two different colours on screen — and the place that difference
 * would show is the horizon, where fogged ground meets sky and any seam reads
 * as a line drawn around the world.
 *
 * So there is exactly one list of on-screen colours (NIGHT below), and each
 * consumer is handed that colour in whichever form makes IT display correctly:
 * raw for the sky and the ground shader, which do not encode; converted from
 * sRGB for scene fog, which does.
 */

/** What is actually on screen, as 0–1 display values. Not linear. */
const NIGHT = {
  zenith: [0.018, 0.024, 0.07],
  horizon: [0.06, 0.072, 0.15],
  /*
   * The sky shader adds this around the sun and along the horizon band. Its
   * default is a daylight orange, which at night paints a sunset where no sun
   * is — kept near-black and cool so the band reads as city glow at most.
   */
  tint: [0.02, 0.025, 0.05],
  ground: [0.012, 0.014, 0.024],
} as const;

/**
 * Scene fog density once the camera is on the ground.
 *
 * Exponential-squared, so it holds clear and then closes fast. It was 0.008
 * (half gone at 100m) until the buildings arrived: the replica poster is
 * ~450m long, the nearest project block stands ~130m from where the player
 * lands, and the monument will be at the far end — at 0.008 the entire city
 * rose inside the fog, unseen. At 0.0028 the nearest building is ~87% clear,
 * 300m is about half, and the far end still dissolves into the dark rather
 * than ending at an edge.
 */
export const GROUND_FOG_DENSITY = 0.0028;

/**
 * The floor under the fog for the ground plane alone.
 *
 * At the swap the camera is ~170m up and scene fog is zero (CSS has no fog, and
 * the quad must match the DOM exactly). Without a floor the ground would be one
 * flat colour to its edge, meeting the sky in a hard line. This thin haze makes
 * the ground brighten toward the horizon at any altitude, and is invisible up
 * close.
 */
const GROUND_HAZE = 0.00028;

/**
 * Half-size of the ground plane, in metres.
 *
 * Big enough that from the swap camera's height its edge sits well under a
 * pixel below the horizon, where the haze has already taken it to the horizon
 * colour. It follows the camera, so this is never a distance you can walk to.
 */
const GROUND_HALF = 20000;

const groundVert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/*
 * Written without `colorspace_fragment`, matching Sky — see the colour rule
 * above. Adding the encode here would brighten the ground and open a seam at
 * the horizon.
 */
const groundFrag = /* glsl */ `
precision highp float;
varying vec3 vWorld;
uniform vec3 uColor;
uniform vec3 uFogColor;
uniform vec3 uCam;
uniform float uDensity;
void main() {
  float d = distance(vWorld, uCam);
  float f = 1.0 - exp(-uDensity * uDensity * d * d);
  gl_FragColor = vec4(mix(uColor, uFogColor, clamp(f, 0.0, 1.0)), 1.0);
}
`;

export type Environment = {
  /** The sky's own scene, rendered first with the sky camera. */
  skyScene: THREE.Scene;
  update: (camera: THREE.Camera, skyCamera: THREE.Camera, fogDensity: number, time: number) => void;
  dispose: () => void;
};

export function createEnvironment(scene: THREE.Scene): Environment {
  const raw = (c: readonly number[]) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
  /*
   * Interpreting the display values AS sRGB makes three convert them to linear,
   * and the output encode then converts them straight back — so a fogged pixel
   * lands on exactly the numbers the sky shader writes.
   */
  const encoded = (c: readonly number[]) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

  /* ── Sky ── */
  const skyScene = new THREE.Scene();
  const sky = new Sky();
  skyScene.add(sky.mesh);

  /*
   * Straight up, so the shader's own moon — always drawn opposite the sun — is
   * at the nadir, under the ground, where nothing can see it. At night with the
   * sun overhead the shader's other sun terms all vanish too: the sun disc is
   * multiplied by (1 − night), and the horizon band by how LOW the sun is.
   */
  const sunDir = new THREE.Vector3(0, 1, 0);
  const moon = buildMoon();
  skyScene.add(moon.sprite);
  const zenith = raw(NIGHT.zenith);
  const horizon = raw(NIGHT.horizon);
  const tint = raw(NIGHT.tint);

  /* ── Fog ── */
  const fog = new THREE.FogExp2(encoded(NIGHT.horizon), 0);
  scene.fog = fog;

  /* ── Ground ── */
  const groundMat = new THREE.ShaderMaterial({
    vertexShader: groundVert,
    fragmentShader: groundFrag,
    uniforms: {
      uColor: { value: raw(NIGHT.ground) },
      uFogColor: { value: horizon.clone() },
      uCam: { value: new THREE.Vector3() },
      uDensity: { value: GROUND_HAZE },
    },
    /*
     * No depth write, drawn first. The ground occludes nothing — it is the
     * bottom of the world — and writing depth for it would put it into a
     * precision fight with the poster quad lying exactly on it, which at the
     * swap camera's altitude flickers along every edge of the sheet.
     */
    depthWrite: false,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_HALF * 2, GROUND_HALF * 2), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.renderOrder = -10;
  ground.frustumCulled = false;
  ground.name = 'collapse-ground';
  scene.add(ground);

  return {
    skyScene,
    update(camera, skyCamera, fogDensity, time) {
      sky.update(sunDir, 1, zenith, horizon, tint, time);
      /* Rides with the sky camera, like the dome, so it never parallaxes. */
      moon.sprite.position.copy(skyCamera.position).addScaledVector(MOON_DIR, MOON_DISTANCE);
      fog.density = fogDensity;

      /*
       * The plane rides along under the camera, snapped to a 100m grid. Snapping
       * is irrelevant for a colour that doesn't vary with position today, but
       * the moment the ground gets any texture, a plane sliding continuously
       * under the player makes that texture swim — so it snaps from the start.
       */
      ground.position.x = Math.round(camera.position.x / 100) * 100;
      ground.position.z = Math.round(camera.position.z / 100) * 100;
      groundMat.uniforms.uCam.value.copy(camera.position);
      groundMat.uniforms.uDensity.value = Math.max(GROUND_HAZE, fogDensity);
    },
    dispose() {
      sky.dispose();
      moon.dispose();
      ground.geometry.dispose();
      groundMat.dispose();
      scene.remove(ground);
      scene.fog = null;
    },
  };
}

/* ── The moon ───────────────────────────────────────────────────────────── */

/**
 * Ahead and up-left of where the player lands looking — down the poster, toward
 * −z. Visible at the swap, visible from the ground, never behind you.
 */
export const MOON_DIR = new THREE.Vector3(-0.42, 0.34, -0.84).normalize();

/** Inside the sky camera's 10-unit far plane. The absolute value means nothing; only the angle does. */
const MOON_DISTANCE = 5;

/** Angular radius of the disc, and of the whole sprite including its halo. */
const MOON_DISC_DEG = 2.1;
const MOON_SPRITE_DEG = 7.5;

/**
 * The moon as a screen-aligned sprite instead of a shape in the sky shader.
 *
 * ── Why the shader's moon came out as an egg ──
 *
 * `Sky` draws the moon as a cone of DIRECTIONS — every pixel whose view ray is
 * within ~2° of the moon direction is lit. That is a perfect circle on the
 * sphere. A rectilinear camera does not map the sphere onto the screen evenly:
 * a direction θ off the lens axis lands at f·tan θ, which stretches radially by
 * 1/cos²θ and sideways by only 1/cos θ. At the centre of frame that is nothing.
 * Where the moon sits, about 30° up-left, it is a 15% stretch along the line
 * from screen centre — exactly the tilted oval in the screenshot. /game never
 * showed it because its moon crosses the sky and is rarely held off-axis.
 *
 * A game camera cannot avoid that distortion for anything that is actually IN
 * the world. The moon is not; it is a picture of something infinitely far away,
 * and people expect it to be round wherever it is on screen. A sprite is a
 * quad kept parallel to the image plane, so both of its axes are divided by the
 * same depth and it projects as the same round shape at any position in frame.
 *
 * ── The stars stay in the shader ──
 *
 * They distort the same way, but a star is a couple of pixels, and a couple of
 * pixels stretched by 15% is still a couple of pixels.
 */
function buildMoon(): { sprite: THREE.Sprite; dispose: () => void } {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  /* Disc radius as a fraction of the sprite's half-width, from the two angles. */
  const discR = (Math.tan((MOON_DISC_DEG * Math.PI) / 180) / Math.tan((MOON_SPRITE_DEG * Math.PI) / 180)) * c;

  if (ctx) {
    /*
     * Halo first: a soft falloff that reaches zero exactly at the sprite's edge,
     * so the quad's square boundary can never show as a faint box around it.
     */
    const halo = ctx.createRadialGradient(c, c, discR * 0.9, c, c, c);
    halo.addColorStop(0, 'rgba(190, 200, 255, 0.34)');
    halo.addColorStop(0.35, 'rgba(160, 175, 240, 0.1)');
    halo.addColorStop(1, 'rgba(140, 160, 230, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);

    /* The disc. A slightly soft limb — a hard-edged circle reads as a UI dot. */
    const disc = ctx.createRadialGradient(c, c, discR * 0.82, c, c, discR);
    disc.addColorStop(0, 'rgba(236, 240, 255, 1)');
    disc.addColorStop(1, 'rgba(236, 240, 255, 0)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(c, c, discR, 0, Math.PI * 2);
    ctx.fill();

    /*
     * Two faint maria. Barely there, but a disc with no surface at all is the
     * other thing that makes a moon read as a light rather than a body.
     */
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(150, 158, 190, 0.22)';
    for (const [mx, my, mr] of [
      [-0.28, -0.18, 0.3],
      [0.22, 0.26, 0.22],
    ]) {
      /* A path per spot. Two arcs in one path are joined by a straight edge, and fill as a wedge. */
      ctx.beginPath();
      ctx.arc(c + discR * mx, c + discR * my, discR * mr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map,
    transparent: true,
    /* Additive, like the shader moon it replaces: light added to the sky behind it. */
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const sprite = new THREE.Sprite(material);
  const world = 2 * MOON_DISTANCE * Math.tan((MOON_SPRITE_DEG * Math.PI) / 180);
  sprite.scale.set(world, world, 1);
  /* After the dome, which draws first at −1000. */
  sprite.renderOrder = 10;
  sprite.frustumCulled = false;
  sprite.name = 'collapse-moon';

  return {
    sprite,
    dispose() {
      map.dispose();
      material.dispose();
    },
  };
}