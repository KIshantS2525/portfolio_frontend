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
  teleport: (x: number, z: number) => void;
  swordGroup: THREE.Group;
  swing: () => void;
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
 * A camera-child sword. The classic first-person weapon trick: the blade
 * lives inside the camera's local space, at the bottom right of the frame,
 * so it turns with the view for free and never needs its own camera pass.
 */
function buildSword(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x5a3f26 });
  const steel = new THREE.MeshLambertMaterial({ color: 0xcfd3d8 });
  const guardMat = new THREE.MeshLambertMaterial({ color: 0x8a8d92 });

  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06), wood);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.07), guardMat);
  guard.position.y = 0.14;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.5, 0.032), steel);
  blade.position.y = 0.42;
  /*
   * The tip. The blade used to be a single box, so it ended in a flat cut —
   * it read as a bar of metal rather than a sword. Two stacked, shrinking
   * boxes give the stepped taper a blocky world wants, without a custom
   * geometry.
   */
  const tip1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.032), steel);
  tip1.position.y = 0.705;
  const tip2 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.032), steel);
  tip2.position.y = 0.77;

  g.add(hilt, guard, blade, tip1, tip2);
  g.scale.setScalar(0.58);
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
): PlayerController {
  const controls = new PointerLockControls(camera, domElement);

  const swordGroup = buildSword();
  camera.add(swordGroup);

  const avatar = buildAvatar();
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
    feet.x = THREE.MathUtils.clamp(feet.x, HALF + 0.01, bounds - HALF - 0.01);
    feet.z = THREE.MathUtils.clamp(feet.z, HALF + 0.01, bounds - HALF - 0.01);
    if (feet.y < -8) { feet.set(spawn.x, spawn.y, spawn.z); vel.set(0, 0, 0); }

    eyePos.set(feet.x, feet.y + EYE, feet.z);

    if (thirdPerson) {
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
    avatar.group.visible = thirdPerson;
    swordGroup.visible = !thirdPerson;

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

  /** Drops the player at a column, from just above it, and lets gravity settle them. */
  function teleport(x: number, z: number) {
    feet.set(x, spawn.y, z);
    // Lift out of anything solid rather than spawning embedded in a wall.
    let guard = 0;
    while (blocked(feet.x, feet.y, feet.z) && guard++ < 64) feet.y += 1;
    vel.set(0, 0, 0);
    camera.position.set(feet.x, feet.y + EYE, feet.z);
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    camera.remove(swordGroup);
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
    isSwimming: submerged,
    isMoving: () => wish.lengthSq() > 0.01 && grounded,
    avatar: avatar.group,
    toggleView: () => { thirdPerson = !thirdPerson; return thirdPerson; },
    isThirdPerson: () => thirdPerson,
    dispose,
  };
}
