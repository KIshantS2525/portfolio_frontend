// src/components/game/player.ts
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

/**
 * The player, as a body rather than a camera.
 *
 * ── What was wrong before ──
 *
 * The previous controller had no collision volume. It wrote the new X and Z
 * straight onto the camera and then asked `heightAt(x, z)` for the top of
 * that one column, which has three consequences, all of which showed up the
 * moment anyone actually walked around:
 *
 *   · Walls did nothing. A cliff face is not a column you are standing over,
 *     so nothing consulted it. You walked through it, and the instant your
 *     centre crossed into the next column you were teleported up onto its
 *     roof — or, on the way out, dropped off it.
 *   · There was no body, so a one-block gap you could not fit through and a
 *     doorway you could were the same thing.
 *   · Nothing stopped you leaving the island. The only bound was a clamp to
 *     the map edge, so you could stroll off the beach and keep going until
 *     the seabed caught you, which is exactly the screenshot: standing at the
 *     bottom of the ocean looking up at a cliff.
 *
 * ── What this does instead ──
 *
 * The player is an axis-aligned box, 0.6 wide and 1.8 tall, with the camera
 * at eye height inside it. Each frame the box is moved one axis at a time and
 * each move is resolved independently against the voxels it overlaps. Solving
 * per-axis is what makes sliding along a wall work: the blocked axis is
 * cancelled and the other one survives, so walking diagonally into a wall
 * slides you along it instead of stopping you dead.
 *
 * Movement is also substepped, because a single-shot collision test only
 * holds while the step is smaller than a block. At sprint speed plus a long
 * frame you can otherwise clear 1.2 blocks in one go, pass clean through a
 * wall and be resolved out the far side.
 */

const HALF = 0.3; //        half the player's width/depth
const BODY = 1.8; //        total height of the body box
const EYE = 1.62; //        camera height above the feet
/*
 * How high a ledge you walk up without jumping.
 *
 * Java Minecraft puts this at 0.6, so a full block has to be jumped, and on
 * hand-built terrain that is the right call. This terrain is value noise, so
 * one-block steps are everywhere and everywhere, and at 0.6 you spend the
 * whole walk jumping over ground that visually reads as a slope. 1.05 is the
 * Bedrock auto-jump behaviour: a single block is walked, two is still a wall.
 */
const STEP = 1.05;
const GRAVITY = 26;
const JUMP_V = 8.4;
const WALK = 4.6;
const SPRINT = 6.6;
const SWIM = 3.2;
const TERMINAL = 48; //     fall speed cap, so a long drop can't tunnel
const EPS = 1e-3;

/**
 * What the controller builds besides the body.
 *
 * Added for Collapse World, which wants this exact body — the per-axis
 * sliding, the substepping, the step-up — and none of the survival kit hung on
 * it. A sword and a flashlight bobbing at the bottom of the frame while you
 * walk through someone's portfolio would be a joke nobody asked for.
 *
 * Every option defaults to what /game has always had, and the argument itself
 * is optional, so Game.tsx's call does not change and cannot change behaviour.
 * Disabled parts still exist on the returned object as inert stand-ins (an
 * empty sword group, a torch toggle that reports off) so the type is identical
 * either way and no caller has to narrow it.
 */
export type PlayerOptions = {
  /** Camera-child sword viewmodel. */
  sword?: boolean;
  /** Camera-child flashlight and its PointLight. */
  torch?: boolean;
  /** Third-person body. Without it `toggleView` is a no-op that stays first person. */
  avatar?: boolean;
  /**
   * Clamp the feet to [0, bounds] on x and z.
   *
   * The island lives in positive coordinates from a corner, so the clamp is a
   * wall around it. Collapse World is centred on the origin and runs toward −z;
   * with the clamp on, the player could never take a single step in either of
   * those directions.
   */
  bounded?: boolean;
};

export type PlayerController = {
  controls: PointerLockControls;
  update: (dt: number) => void;
  /** The camera's eye position — kept for the raycasts and mob checks in Game.tsx. */
  position: THREE.Vector3;
  /**
   * The player's FEET, in world space.
   *
   * Exposed because `position` is the camera, and in third person the camera
   * is several metres behind the body — anything that means "where the player
   * is standing" (item pickup, proximity prompts) has to use this or it is
   * measuring from the wrong place.
   */
  feet: THREE.Vector3;
  /**
   * Drops the player at (x, z), settling onto the ground below `fromY`.
   * `fromY` defaults to the original spawn height — fine for the spawn
   * point itself, but wrong for anywhere else on the terrain: respawning at
   * the bed used to start the drop-and-settle search from spawn's height
   * rather than the bed's, so on a map where the bed sits meaningfully
   * higher or lower than spawn the player could respawn embedded in the
   * ground or fall a long way before the collision guard caught them.
   */
  teleport: (x: number, z: number, fromY?: number) => void;
  swordGroup: THREE.Group;
  swing: () => void;
  /** Shoves the player horizontally — a unit direction plus a strength. See the implementation for why this can't just be added to velocity directly. */
  applyKnockback: (dirX: number, dirZ: number, strength: number) => void;
  /** Toggles the held flashlight on/off ('T' in Game.tsx); returns the new state. */
  toggleTorch: () => boolean;
  isSwimming: () => boolean;
  /** True when the player is actually walking, for footstep timing. */
  isMoving: () => boolean;
  /** The third-person body. Game.tsx adds this to the scene. */
  avatar: THREE.Group;
  /** Flips between first and third person; returns the new state. */
  toggleView: () => boolean;
  isThirdPerson: () => boolean;
  dispose: () => void;
};

/**
 * A torch prop — used both as the camera-child held item (first person) and
 * as a smaller copy attached to the avatar's off-hand (third person). A
 * function rather than a single shared mesh because camera-local space and
 * avatar-arm-local space are different scales/coordinate systems; each
 * caller gets its own instance, sized and placed for where it's mounted.
 *
 * Redesigned from a wooden stick with a flame on top into an actual
 * flashlight: a cylindrical body held level and pointing straight ahead,
 * with a lens on the front end — a modern hand torch, not a medieval one.
 * Built extending along -Z, so "forward" here already matches the camera's
 * own forward axis and mounting it takes little more than a position offset.
 */
function buildTorchProp(): { group: THREE.Group; lensMat: THREE.MeshBasicMaterial } {
  const g = new THREE.Group();
  /*
   * Unlit, same reasoning as the sword: this prop sits only a few
   * centimetres from its own PointLight (see buildHeldTorch), and a
   * shaded material that close to a bright light source blows out to
   * white — the "torch is glowing" half of the same bug the sword had.
   * A held flashlight's barrel isn't something the player needs to see
   * shaded by scene lighting anyway.
   */
  const body = new THREE.MeshBasicMaterial({ color: 0x2b2e31 });
  const grip = new THREE.MeshBasicMaterial({ color: 0x1a1c1e });
  const rimMat = new THREE.MeshBasicMaterial({ color: 0x8a8f94 });
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xfff6da });
  const buttonMat = new THREE.MeshBasicMaterial({ color: 0xc23b2e });

  // Barrel: the main cylindrical body, pointing forward (-Z).
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.3, 12), body);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.15;
  g.add(barrel);

  // A slightly thicker grip section at the back, textured with a couple of
  // grooves (thin rings) so it doesn't read as one plain tube.
  const gripMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.048, 0.16, 12), grip);
  gripMesh.rotation.x = Math.PI / 2;
  gripMesh.position.z = 0.06;
  g.add(gripMesh);
  for (const gz of [0.02, 0.1]) {
    const groove = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 12), rimMat);
    groove.position.z = gz;
    g.add(groove);
  }

  // A small power button on top of the grip.
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 8), buttonMat);
  button.position.set(0, 0.05, 0.06);
  g.add(button);

  // The head: a wider rim around the lens, and the glowing lens itself.
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.043, 0.05, 12), rimMat);
  head.rotation.x = Math.PI / 2;
  head.position.z = -0.325;
  g.add(head);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.046, 12), lensMat);
  lens.position.z = -0.351;
  g.add(lens);

  return { group: g, lensMat };
}

/**
 * The held torch: the sword occupies the right hand, so this is the other
 * one — a camera-child mesh mirrored to the left side of frame, plus a
 * PointLight that travels with the player. Unlike every other light in the
 * game, this one isn't part of the shared torch pool (see torches.ts) and
 * isn't reassigned or budget-limited — it's the player's own light, so it
 * has to stay on regardless of how many world torches are nearby, which is
 * the whole point of carrying one into a dark forest or an unlit beach.
 *
 * Intensity was 1.3 against a world torch's peak of 12 — roughly a tenth as
 * bright, which is why "the torch I'm holding" didn't actually seem to light
 * anything: it was barely doing more than the ambient night light already
 * was. Brought up to be genuinely the brightest thing near the player, on
 * the reasoning that a torch you're holding at arm's length should light
 * your immediate surroundings better than one bolted to a wall ten blocks
 * away, not worse.
 */
function buildHeldTorch(): { group: THREE.Group; light: THREE.PointLight; lensMat: THREE.MeshBasicMaterial } {
  const { group, lensMat } = buildTorchProp();
  group.scale.setScalar(0.95);
  group.position.set(-0.3, -0.26, -0.55);
  group.rotation.set(-0.05, 0.16, 0);

  const light = new THREE.PointLight(0xfff0d0, 13, 11, 1.5);
  // At the lens, roughly — the light was never actually positioned before
  // (it defaulted to the camera's own local origin, i.e. the player's eye),
  // which is also not where a flashlight's beam should originate from.
  light.position.set(-0.35, -0.28, -0.9);
  return { group, light, lensMat };
}

/**
 * A camera-child sword. The classic first-person weapon trick: the blade
 * lives inside the camera's local space, at the bottom right of the frame,
 * so it turns with the view for free and never needs its own camera pass.
 *
 * Rebuilt from a plain hilt-guard-blade stack (no pommel, a guard barely
 * wider than the grip, and a blunt two-step taper) into something with an
 * actual silhouette: a pommel to balance the bottom, a proper crossguard
 * that reads as a cross rather than a collar, a wrapped-looking grip, and a
 * three-step taper to a real point with a fuller (the groove down a real
 * blade's centre) for surface detail instead of a flat slab of steel.
 */
function buildSword(): THREE.Group {
  const g = new THREE.Group();
  /*
   * MeshBasicMaterial, not MeshLambertMaterial — deliberately unlit. The
   * held torch's PointLight sits only a third of a block away from this
   * viewmodel (see buildHeldTorch), and a lit material that close to a
   * bright point light blows out to solid white well before the inverse-
   * square falloff has any chance to look reasonable — that's the "sword
   * is glowing" bug. The fix isn't to keep tuning the light's numbers
   * around this one mesh; it's that a first-person viewmodel doesn't need
   * to react to scene lighting at all, the way most games render theirs
   * with fixed or simplified lighting for exactly this reason. Unlit here
   * means the sword always renders at its own true colour, immune to the
   * torch, moonlight, a nearby lamp, or anything else that might otherwise
   * sit inches from it.
   */
  const grip = new THREE.MeshBasicMaterial({ color: 0x3a2a1a });
  const wrap = new THREE.MeshBasicMaterial({ color: 0x241a10 });
  const brass = new THREE.MeshBasicMaterial({ color: 0xc9a227 });
  const steel = new THREE.MeshBasicMaterial({ color: 0xe4e8ec });
  const darkSteel = new THREE.MeshBasicMaterial({ color: 0x7a828a });

  // Pommel: weights the bottom of the hilt so the silhouette doesn't just
  // stop dead at the grip.
  const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.09), brass);
  pommel.position.y = -0.02;
  g.add(pommel);

  // Grip, with two darker wrap bands rather than one flat-coloured box.
  const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.22, 0.065), grip);
  gripMesh.position.y = 0.1;
  g.add(gripMesh);
  for (const y of [0.05, 0.16]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.025, 0.072), wrap);
    band.position.y = y;
    g.add(band);
  }

  // Crossguard: wide and thin, so it actually reads as a cross against the
  // blade rather than a slightly-fatter bit of the handle.
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.09), brass);
  guard.position.y = 0.225;
  g.add(guard);
  const guardCenter = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), brass);
  guardCenter.position.y = 0.235;
  g.add(guardCenter);

  // Blade: three tapering segments (base → mid → point) instead of two, for
  // a genuine point rather than a stepped stub, plus a fuller — a thin,
  // slightly darker groove down the centre — so the flat face reads as a
  // forged blade rather than a painted bar of metal.
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.32, 0.034), steel);
  base.position.y = 0.42;
  const mid = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.03), steel);
  mid.position.y = 0.66;
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.09, 0.024), steel);
  tip.position.y = 0.785;
  g.add(base, mid, tip);

  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.42, 0.008), darkSteel);
  fuller.position.set(0, 0.5, 0.02);
  g.add(fuller);

  g.scale.setScalar(0.62);
  g.position.set(0.33, -0.30, -0.78);
  g.rotation.set(0.18, -0.2, 0.42);
  return g;
}

/**
 * The player avatar, for third-person.
 *
 * Original design, not the character from the game this resembles — that
 * one's skin and proportions are Mojang's. This is a generic blocky figure in
 * a green tunic: same voxel idiom, nobody else's character.
 */
function buildAvatar(): { group: THREE.Group; legs: [THREE.Mesh, THREE.Mesh]; arms: [THREE.Mesh, THREE.Mesh] } {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98f66 });
  const tunic = new THREE.MeshLambertMaterial({ color: 0x3f7a55 });
  const trouser = new THREE.MeshLambertMaterial({ color: 0x3b4a6b });
  const hair = new THREE.MeshLambertMaterial({ color: 0x2f2418 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x241c14 });

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
  head.position.y = 1.55;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.52), hair);
  cap.position.y = 1.74;
  for (const ex of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), dark);
    eye.position.set(ex, 1.58, 0.255);
    group.add(eye);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.26), tunic);
  torso.position.y = 0.94;
  group.add(head, cap, torso);

  const legGeo = new THREE.BoxGeometry(0.22, 0.58, 0.22);
  const mkLeg = (x: number) => {
    const leg = new THREE.Mesh(legGeo.clone(), trouser);
    leg.geometry.translate(0, -0.29, 0);
    leg.position.set(x, 0.58, 0);
    group.add(leg);
    return leg;
  };
  const legs: [THREE.Mesh, THREE.Mesh] = [mkLeg(-0.13), mkLeg(0.13)];

  const armGeo = new THREE.BoxGeometry(0.2, 0.62, 0.2);
  const mkArm = (x: number) => {
    const arm = new THREE.Mesh(armGeo.clone(), tunic);
    arm.geometry.translate(0, -0.31, 0);
    arm.position.set(x, 1.28, 0);
    group.add(arm);
    return arm;
  };
  const arms: [THREE.Mesh, THREE.Mesh] = [mkArm(-0.35), mkArm(0.35)];

  group.visible = false; // first-person by default
  return { group, legs, arms };
}

export function createPlayerController(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  isSolid: (x: number, y: number, z: number) => boolean,
  bounds: number,
  spawn: THREE.Vector3,
  waterY: number,
  options: PlayerOptions = {},
): PlayerController {
  const withSword = options.sword ?? true;
  const withTorch = options.torch ?? true;
  const withAvatar = options.avatar ?? true;
  const bounded = options.bounded ?? true;

  const controls = new PointerLockControls(camera, domElement);

  const swordGroup = withSword ? buildSword() : new THREE.Group();
  if (withSword) camera.add(swordGroup);

  const heldTorch = withTorch ? buildHeldTorch() : null;
  if (heldTorch) {
    camera.add(heldTorch.group);
    camera.add(heldTorch.light);
  }
  let torchOn = withTorch;
  const lensOnColor = heldTorch ? heldTorch.lensMat.color.clone() : new THREE.Color();
  /** Toggled by the 'T' key (Game.tsx) — off means dark (no light, dim lens), not "put away". */
  function toggleTorch(): boolean {
    if (!heldTorch) return false;
    torchOn = !torchOn;
    heldTorch.light.visible = torchOn;
    avatarTorchProp?.lensMat.color.copy(torchOn ? lensOnColor : new THREE.Color(0x2a2620));
    heldTorch.lensMat.color.copy(torchOn ? lensOnColor : new THREE.Color(0x2a2620));
    return torchOn;
  }

  const avatar = withAvatar ? buildAvatar() : null;
  // Third-person's copy of the same torch, sized for the avatar's arm rather
  // than camera-local space — parented to the left arm so it swings with it
  // exactly like the sword conceptually would on the right.
  const avatarTorchProp = avatar && withTorch ? buildTorchProp() : null;
  if (avatar && avatarTorchProp) {
    const avatarTorch = avatarTorchProp.group;
    avatarTorch.scale.setScalar(0.85);
    avatarTorch.position.set(0, -0.58, 0.06);
    // The prop now points forward (-Z) by default rather than up, since it's
    // a flashlight rather than a torch with the flame on top — tilted down
    // from the lowered arm so the beam still reads as pointing out and ahead
    // rather than straight down at the villager's own feet.
    avatarTorch.rotation.x = -1.15;
    avatar.arms[0].add(avatarTorch);
  }
  /*
   * Third-person is a camera offset, not a second camera. PointerLockControls
   * owns the camera's rotation either way; all that changes is where the
   * camera sits along that rotation — at the eyes, or pulled back behind
   * them. That keeps aiming, the block raycast and mob hits identical in both
   * views, because they all work from the same look direction.
   */
  let thirdPerson = false;
  const camBack = new THREE.Vector3();
  const eyePos = new THREE.Vector3();

  const keys = new Set<string>();
  const onKeyDown = (e: KeyboardEvent) => keys.add(e.code);
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => keys.clear(); // or a key held during an alt-tab sticks forever
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  /** Feet position. The camera is derived from this, never the other way round. */
  const feet = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
  const vel = new THREE.Vector3();
  /**
   * A separate, decaying impulse for "something just hit me" knockback.
   * `vel.x`/`vel.z` are overwritten from input every frame (`vel.x = wish.x`
   * below) rather than integrated, so simply adding a shove to `vel` would
   * vanish the instant `update()` next read the keyboard — there was no way
   * for a hit to actually move the player at all under the old scheme. This
   * is added on top of `vel` each frame instead, and decays on its own, so a
   * hit shoves the player regardless of what they're pressing and fades out
   * over a few frames rather than being an on/off snap.
   */
  const knockback = new THREE.Vector3();
  let grounded = false;
  let swingT = 0;
  let walkPhase = 0;

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const wish = new THREE.Vector3();

  /** Does the body box, at this feet position, overlap any solid voxel? */
  function blocked(px: number, py: number, pz: number): boolean {
    const x0 = Math.floor(px - HALF + EPS);
    const x1 = Math.floor(px + HALF - EPS);
    const y0 = Math.floor(py + EPS);
    const y1 = Math.floor(py + BODY - EPS);
    const z0 = Math.floor(pz - HALF + EPS);
    const z1 = Math.floor(pz + HALF - EPS);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  /**
   * Moves one axis and snaps back to the block face on contact.
   *
   * Snapping to the face (rather than just reverting the move) is what stops
   * the player hovering a fraction of a block away from every wall, which
   * reads as invisible padding around the world.
   */
  function moveAxis(axis: 'x' | 'y' | 'z', d: number): boolean {
    if (d === 0) return false;
    const before = feet[axis];
    feet[axis] = before + d;
    if (!blocked(feet.x, feet.y, feet.z)) return false;

    if (axis === 'y') {
      feet.y = d > 0
        ? Math.ceil(feet.y + BODY) - BODY - EPS // head hit a ceiling
        : Math.floor(feet.y) + 1 + EPS; //         feet landed on a floor
    } else {
      feet[axis] = d > 0
        ? Math.floor(feet[axis] + HALF) - HALF - EPS
        : Math.floor(feet[axis] - HALF) + 1 + HALF + EPS;
    }
    // If the snap itself is still inside something (a corner case at block
    // seams), give up on this axis entirely rather than leave the body
    // embedded in geometry.
    if (blocked(feet.x, feet.y, feet.z)) feet[axis] = before;
    return true;
  }

  /**
   * Horizontal move with a step-up assist.
   *
   * Without this, every one-block rise on the terrain is a wall you have to
   * jump, which makes walking over gently bumpy ground exhausting. Tried only
   * when grounded and only if the raised position is actually clear, so it
   * can never be used to climb a real wall or to phase into a low ceiling.
   */
  function moveHorizontal(axis: 'x' | 'z', d: number) {
    const y0 = feet.y;
    const p0 = feet[axis];
    if (!moveAxis(axis, d)) return;
    if (!grounded) { vel[axis] = 0; return; }

    const stopped = feet[axis];
    feet.y = y0 + STEP;
    feet[axis] = p0;
    if (!blocked(feet.x, feet.y, feet.z)) {
      feet[axis] = p0 + d;
      if (!blocked(feet.x, feet.y, feet.z)) return; // stepped up cleanly
    }
    feet.y = y0;
    feet[axis] = stopped;
    vel[axis] = 0;
  }

  /** Eyes under the surface of the sea. */
  function submerged() {
    return feet.y + EYE < waterY;
  }
  function inWater() {
    return feet.y + 0.6 < waterY;
  }

  function update(dt: number) {
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    /*
     * right = forward × up.
     *
     * This was `(forward.z, 0, -forward.x)`, which is that cross product
     * negated — so A and D were swapped at every heading, not just some. The
     * correct expansion of the cross product for a Y-up world is
     * (-forward.z, 0, forward.x); check it against the default heading, where
     * looking down -Z must put world +X on your right.
     */
    right.set(-forward.z, 0, forward.x);

    wish.set(0, 0, 0);
    if (keys.has('KeyW') || keys.has('ArrowUp')) wish.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) wish.sub(forward);
    if (keys.has('KeyD') || keys.has('ArrowRight')) wish.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.sub(right);

    const swimming = inWater();
    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = swimming ? SWIM : sprinting ? SPRINT : WALK;
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

    if (swimming) {
      // Buoyant, draggy, and you can paddle upward — so falling in the sea is
      // a swim back to the beach instead of the dead end it was.
      vel.y -= GRAVITY * 0.22 * dt;
      if (keys.has('Space')) vel.y += GRAVITY * 0.42 * dt;
      vel.y *= 0.86;
      vel.y = THREE.MathUtils.clamp(vel.y, -4, 4.2);
    } else {
      if (keys.has('Space') && grounded) {
        vel.y = JUMP_V;
        grounded = false;
      }
      vel.y -= GRAVITY * dt;
      if (vel.y < -TERMINAL) vel.y = -TERMINAL;
    }

    vel.x = wish.x;
    vel.z = wish.z;

    // The knockback impulse rides on top of whatever the player's own input
    // wanted this frame, and bleeds off exponentially — fast enough to feel
    // like a shove, not a loss of control for a full second.
    if (knockback.lengthSq() > 0.0004) {
      vel.x += knockback.x;
      vel.z += knockback.z;
      const decay = Math.max(0, 1 - dt * 7);
      knockback.x *= decay;
      knockback.z *= decay;
    } else {
      knockback.set(0, 0, 0);
    }

    /*
     * Substep so no single move exceeds half a block. A collision test that
     * only samples the end position is valid only while the step is smaller
     * than the thing it might hit; at sprint speed on a long frame it is not.
     */
    const dist = Math.hypot(vel.x * dt, vel.y * dt, vel.z * dt);
    const steps = Math.min(8, Math.max(1, Math.ceil(dist / 0.45)));
    const sdt = dt / steps;

    for (let i = 0; i < steps; i++) {
      moveHorizontal('x', vel.x * sdt);
      moveHorizontal('z', vel.z * sdt);

      const hitVertical = moveAxis('y', vel.y * sdt);
      if (hitVertical) {
        grounded = vel.y < 0;
        vel.y = 0;
      } else if (vel.y < 0) {
        grounded = false;
      }
    }

    // Keep the body inside the map even if it somehow escapes the terrain.
    if (bounded) {
      feet.x = THREE.MathUtils.clamp(feet.x, HALF + 0.01, bounds - HALF - 0.01);
      feet.z = THREE.MathUtils.clamp(feet.z, HALF + 0.01, bounds - HALF - 0.01);
    }
    if (feet.y < -8) { feet.set(spawn.x, spawn.y, spawn.z); vel.set(0, 0, 0); }

    eyePos.set(feet.x, feet.y + EYE, feet.z);

    if (thirdPerson && avatar) {
      // Pull back along the full look vector (pitch included), but stop short
      // of any solid block so the camera never ends up inside terrain.
      camera.getWorldDirection(camBack);
      let dist = 4.2;
      for (let t = 0.4; t <= dist; t += 0.25) {
        const px = eyePos.x - camBack.x * t;
        const py = eyePos.y - camBack.y * t;
        const pz = eyePos.z - camBack.z * t;
        if (isSolid(Math.floor(px), Math.floor(py), Math.floor(pz))) { dist = Math.max(0.9, t - 0.35); break; }
      }
      camera.position.set(
        eyePos.x - camBack.x * dist,
        eyePos.y - camBack.y * dist + 0.25,
        eyePos.z - camBack.z * dist,
      );
      avatar.group.position.set(feet.x, feet.y, feet.z);
      // Face the way the camera looks, so the body turns with the view.
      avatar.group.rotation.y = Math.atan2(forward.x, forward.z) + Math.PI;

      const moving = wish.lengthSq() > 0.01;
      walkPhase += dt * (moving ? 9 : 0);
      const swingAmt = moving ? Math.sin(walkPhase) * 0.7 : 0;
      avatar.legs[0].rotation.x = swingAmt;
      avatar.legs[1].rotation.x = -swingAmt;
      avatar.arms[0].rotation.x = -swingAmt;
      avatar.arms[1].rotation.x = swingT > 0 ? -1.4 + swingT : swingAmt;
      if (!moving) { avatar.legs[0].rotation.x = 0; avatar.legs[1].rotation.x = 0; }
    } else {
      camera.position.copy(eyePos);
    }
    if (avatar) avatar.group.visible = thirdPerson;
    swordGroup.visible = !thirdPerson;
    if (heldTorch) heldTorch.group.visible = !thirdPerson;

    if (swingT > 0) {
      swingT = Math.max(0, swingT - dt * 5);
      swordGroup.rotation.x = 0.2 - Math.sin(swingT * Math.PI) * 1.1;
    } else {
      swordGroup.rotation.x = 0.2;
    }
  }

  function swing() {
    swingT = 1;
  }

  /**
   * Shoves the player horizontally — `dirX`/`dirZ` should be a unit vector
   * pointing away from whatever hit them. Called from Game.tsx's
   * `takeDamage`, so a zombie's claw or a skeleton's arrow actually moves
   * the player, rather than just docking health while they stand rooted to
   * the spot the way the old flash-only feedback did.
   */
  function applyKnockback(dirX: number, dirZ: number, strength: number) {
    knockback.x += dirX * strength;
    knockback.z += dirZ * strength;
  }

  /** Drops the player at a column, from just above it, and lets gravity settle them. */
  function teleport(x: number, z: number, fromY: number = spawn.y) {
    feet.set(x, fromY, z);
    // Lift out of anything solid rather than spawning embedded in a wall.
    let guard = 0;
    while (blocked(feet.x, feet.y, feet.z) && guard++ < 64) feet.y += 1;
    vel.set(0, 0, 0);
    knockback.set(0, 0, 0);
    camera.position.set(feet.x, feet.y + EYE, feet.z);
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    camera.remove(swordGroup);
    if (heldTorch) {
      camera.remove(heldTorch.group);
      camera.remove(heldTorch.light);
    }
  }

  // Settle onto the ground at spawn rather than trusting the caller's Y.
  teleport(spawn.x, spawn.z);

  return {
    controls,
    update,
    position: camera.position,
    feet,
    teleport,
    swordGroup,
    swing,
    applyKnockback,
    toggleTorch,
    isSwimming: submerged,
    isMoving: () => wish.lengthSq() > 0.01 && grounded,
    /* An empty group when built without one, so Game.tsx-style `scene.add(avatar)` stays harmless. */
    avatar: avatar ? avatar.group : new THREE.Group(),
    toggleView: () => {
      if (!avatar) return false;
      thirdPerson = !thirdPerson;
      return thirdPerson;
    },
    isThirdPerson: () => thirdPerson,
    dispose,
  };
}