// src/components/game/mobs.ts
import * as THREE from 'three';

/**
 * Zombies and skeletons — original blocky rigs (a few boxes, no borrowed
 * model), not the game they resemble. Both share one AI: harmless and
 * wandering by day, aggroed and chasing by night. A real Minecraft skeleton
 * kites and shoots arrows; this one just closes distance and swings, which
 * keeps combat to "walk up, click" without a projectile system the rest of
 * the scene doesn't need.
 */
export type MobKind = 'zombie' | 'skeleton' | 'sheep';

export type Mob = {
  kind: MobKind;
  group: THREE.Group;
  hp: number;
  maxHp: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  wanderTarget: THREE.Vector2;
  hitCooldown: number;
  attackCooldown: number;
  dead: boolean;
  deathTimer: number;
  parts: { leftLeg: THREE.Mesh; rightLeg: THREE.Mesh; leftArm: THREE.Mesh; rightArm: THREE.Mesh };
  walkPhase: number;
};

function buildRig(skinColor: number, accent: number): Mob['parts'] & { group: THREE.Group } {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const cloth = new THREE.MeshLambertMaterial({ color: accent });

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
  head.position.y = 1.65;
  group.add(head);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), cloth);
  body.position.y = 1.15;
  group.add(body);

  const legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.22);
  const leftLeg = new THREE.Mesh(legGeo, cloth);
  leftLeg.geometry = legGeo.clone();
  leftLeg.geometry.translate(0, -0.375, 0);
  leftLeg.position.set(-0.13, 0.75, 0);
  const rightLeg = new THREE.Mesh(legGeo.clone(), cloth);
  rightLeg.geometry.translate(0, -0.375, 0);
  rightLeg.position.set(0.13, 0.75, 0);
  group.add(leftLeg, rightLeg);

  const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
  const leftArm = new THREE.Mesh(armGeo.clone(), skin);
  leftArm.geometry.translate(0, -0.35, 0);
  leftArm.position.set(-0.37, 1.5, 0);
  const rightArm = new THREE.Mesh(armGeo.clone(), skin);
  rightArm.geometry.translate(0, -0.35, 0);
  rightArm.position.set(0.37, 1.5, 0);
  group.add(leftArm, rightArm);

  return { group, leftLeg, rightLeg, leftArm, rightArm };
}

function buildSheepRig(): Mob['parts'] & { group: THREE.Group } {
  const group = new THREE.Group();
  const wool = new THREE.MeshLambertMaterial({ color: 0xf2eee3 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8c5a8 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x5a5148 });

  /*
   * Proportions matter more than part count here. The first pass was a
   * near-cube body with a same-sized head on a stalk, which is why it read as
   * a couple of boxes rather than an animal: a sheep is long and deep in the
   * body, short in the leg, and small in the head. Fleece overhangs the frame
   * slightly, which is what gives the silhouette its fluff.
   */
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.95), wool);
  body.position.y = 0.72;
  group.add(body);

  // A second, slightly larger shell breaks up the flat sides so the fleece
  // doesn't read as one smooth slab.
  const fleece = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.46, 0.78), wool);
  fleece.position.set(0, 0.78, -0.02);
  group.add(fleece);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin);
  head.position.set(0, 0.74, 0.62);
  group.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.1), skin);
  snout.position.set(0, 0.68, 0.80);
  group.add(snout);

  const woolCap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.26), wool);
  woolCap.position.set(0, 0.90, 0.60);
  group.add(woolCap);

  for (const ex of [-0.19, 0.19]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.13), skin);
    ear.position.set(ex, 0.80, 0.60);
    group.add(ear);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.02), dark);
    eye.position.set(ex * 0.45, 0.77, 0.775);
    group.add(eye);
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.1), wool);
  tail.position.set(0, 0.82, -0.52);
  group.add(tail);

  // Short legs, pivoting from the hip so the walk cycle swings correctly.
  const legGeo = new THREE.BoxGeometry(0.15, 0.42, 0.15);
  const legs = ([[-0.2, 0.3], [0.2, 0.3], [-0.2, -0.3], [0.2, -0.3]] as const).map(([x, z]) => {
    const leg = new THREE.Mesh(legGeo.clone(), skin);
    leg.geometry.translate(0, -0.21, 0);
    leg.position.set(x, 0.46, z);
    group.add(leg);
    return leg;
  });

  // Front pair drives the visible swing; the rear pair is animated through
  // the arm slots the shared update loop already moves.
  return { group, leftLeg: legs[0], rightLeg: legs[1], leftArm: legs[2], rightArm: legs[3] };
}

export function spawnMob(kind: MobKind, x: number, z: number, y: number): Mob {
  const rig =
    kind === 'zombie' ? buildRig(0x4c7a3f, 0x2f5533) : kind === 'skeleton' ? buildRig(0xd9d2bd, 0x9a9482) : buildSheepRig();
  rig.group.position.set(x, y, z);
  return {
    kind,
    group: rig.group,
    hp: kind === 'zombie' ? 6 : kind === 'skeleton' ? 4 : 3,
    maxHp: kind === 'zombie' ? 6 : kind === 'skeleton' ? 4 : 3,
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    wanderTarget: new THREE.Vector2(x, z),
    hitCooldown: 0,
    attackCooldown: 0,
    dead: false,
    deathTimer: 0,
    parts: { leftLeg: rig.leftLeg, rightLeg: rig.rightLeg, leftArm: rig.leftArm, rightArm: rig.rightArm },
    walkPhase: Math.random() * Math.PI * 2,
  };
}

const AGGRO_R = 13;
const SPEED = 1.6;
const ATTACK_R = 1.15;
const BOW_MIN = 5.5; // skeletons back off if the player is closer than this
const BOW_MAX = 10; // ...and close in if farther than this
const BOW_RANGE = 13;

export function updateMob(
  mob: Mob,
  dt: number,
  playerPos: THREE.Vector3,
  isNight: boolean,
  heightAt: (x: number, z: number) => number,
  onAttack: (dmg: number) => void,
  onShoot?: (from: THREE.Vector3, dir: THREE.Vector2) => void,
) {
  if (mob.dead) {
    mob.deathTimer -= dt;
    mob.group.rotation.z = Math.min(Math.PI / 2, mob.group.rotation.z + dt * 4);
    mob.group.position.y -= dt * 0.3;
    return;
  }

  mob.hitCooldown = Math.max(0, mob.hitCooldown - dt);
  mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);

  const toPlayer = new THREE.Vector2(playerPos.x - mob.pos.x, playerPos.z - mob.pos.z);
  const dist = toPlayer.length();
  // Sheep never aggro, day or night — they're the one mob you can't get attacked by.
  const aggro = mob.kind !== 'sheep' && isNight && dist < AGGRO_R;

  let move = new THREE.Vector2();
  if (aggro && mob.kind === 'skeleton') {
    if (dist > BOW_MAX) move = toPlayer.clone().normalize();
    else if (dist < BOW_MIN) move = toPlayer.clone().normalize().multiplyScalar(-1);
    if (dist < BOW_RANGE && mob.attackCooldown <= 0 && onShoot) {
      onShoot(mob.pos.clone().setY(mob.pos.y + 1.4), toPlayer.clone().normalize());
      mob.attackCooldown = 1.7;
    }
    if (dist < ATTACK_R && mob.attackCooldown <= 0) {
      onAttack(1);
      mob.attackCooldown = 1.1;
    }
  } else if (aggro) {
    if (dist > ATTACK_R * 0.85) move = toPlayer.clone().normalize();
    if (dist < ATTACK_R && mob.attackCooldown <= 0) {
      onAttack(mob.kind === 'zombie' ? 2 : 1);
      mob.attackCooldown = 1.1;
    }
  } else {
    // Idle wander: amble toward a nearby random point, pick a new one on arrival.
    const toTarget = new THREE.Vector2(mob.wanderTarget.x - mob.pos.x, mob.wanderTarget.y - mob.pos.z);
    if (toTarget.length() < 0.6 || Math.random() < 0.002) {
      mob.wanderTarget.set(mob.pos.x + (Math.random() - 0.5) * 8, mob.pos.z + (Math.random() - 0.5) * 8);
    } else {
      move = toTarget.normalize().multiplyScalar(0.4);
    }
  }

  const speed = SPEED * (aggro ? 1 : 0.45);
  mob.pos.x += move.x * speed * dt;
  mob.pos.z += move.y * speed * dt;
  mob.pos.y = heightAt(mob.pos.x, mob.pos.z) + 1;

  if (move.lengthSq() > 0.0001) {
    mob.group.rotation.y = Math.atan2(move.x, move.y);
    mob.walkPhase += dt * 8 * (aggro ? 1.4 : 0.7);
    const swing = Math.sin(mob.walkPhase) * 0.6;
    mob.parts.leftLeg.rotation.x = swing;
    mob.parts.rightLeg.rotation.x = -swing;
    mob.parts.leftArm.rotation.x = -swing;
    mob.parts.rightArm.rotation.x = swing;
  }

  mob.group.position.copy(mob.pos);
}

export function hitMob(mob: Mob, dmg: number, knockDir: THREE.Vector2) {
  if (mob.dead) return;
  mob.hp -= dmg;
  mob.pos.x += knockDir.x * 0.6;
  mob.pos.z += knockDir.y * 0.6;
  mob.hitCooldown = 0.25;
  if (mob.hp <= 0) {
    mob.dead = true;
    mob.deathTimer = 0.6;
  }
}

/* ── arrows ─────────────────────────────────────────────────────────────── */

export type Arrow = { mesh: THREE.Mesh; pos: THREE.Vector3; vel: THREE.Vector3; life: number };

const ARROW_SPEED = 13;
const ARROW_LIFE = 3;

export function spawnArrow(from: THREE.Vector3, dir2: THREE.Vector2): Arrow {
  const geo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x3a2a18 }));
  mesh.position.copy(from);
  const angle = Math.atan2(dir2.x, dir2.y);
  mesh.rotation.y = angle;
  return {
    mesh,
    pos: from.clone(),
    vel: new THREE.Vector3(dir2.x, 0, dir2.y).multiplyScalar(ARROW_SPEED),
    life: ARROW_LIFE,
  };
}

/** Returns true if the arrow should be removed this frame (hit or expired). */
export function updateArrow(arrow: Arrow, dt: number, playerPos: THREE.Vector3, onHit: (dmg: number) => void): boolean {
  arrow.life -= dt;
  arrow.pos.addScaledVector(arrow.vel, dt);
  arrow.mesh.position.copy(arrow.pos);
  if (arrow.pos.distanceTo(playerPos) < 0.7) {
    onHit(1);
    return true;
  }
  return arrow.life <= 0;
}