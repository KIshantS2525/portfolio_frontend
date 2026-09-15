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
export type MobKind = 'zombie' | 'skeleton' | 'sheep' | 'pig' | 'villager' | 'guardian';

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
  /** Where this mob belongs — townsfolk and the constable stay near it. */
  home: THREE.Vector2;
  /** Vertical velocity, for gravity and stepping down off ledges. */
  velY: number;
  grounded: boolean;
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

/** A pig: low, round, snouted. Same quadruped skeleton as the sheep. */
function buildPigRig(): Mob['parts'] & { group: THREE.Group } {
  const group = new THREE.Group();
  const hide = new THREE.MeshLambertMaterial({ color: 0xe0949a });
  const snoutMat = new THREE.MeshLambertMaterial({ color: 0xc87c84 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2018 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.5, 0.92), hide);
  body.position.y = 0.6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.36), hide);
  head.position.set(0, 0.66, 0.6);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.1), snoutMat);
  snout.position.set(0, 0.6, 0.81);
  group.add(body, head, snout);
  for (const ex of [-0.13, 0.13]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), hide);
    ear.position.set(ex, 0.86, 0.52);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.02), dark);
    eye.position.set(ex, 0.72, 0.775);
    group.add(ear, eye);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.07), hide);
  tail.position.set(0, 0.74, -0.49);
  group.add(tail);

  const legGeo = new THREE.BoxGeometry(0.16, 0.34, 0.16);
  const mk = (x: number, z: number) => {
    const leg = new THREE.Mesh(legGeo.clone(), hide);
    leg.geometry.translate(0, -0.17, 0);
    leg.position.set(x, 0.36, z);
    group.add(leg);
    return leg;
  };
  return { group, leftLeg: mk(-0.2, 0.3), rightLeg: mk(0.2, 0.3), leftArm: mk(-0.2, -0.3), rightArm: mk(0.2, -0.3) };
}

/**
 * Townsfolk.
 *
 * Fills the villager role without Mojang's villager design — no heavy brow,
 * no crossed arms, no robe-and-nose silhouette, since that silhouette is the
 * recognisable part of someone else's creature. These are well-dressed
 * villagers: a coloured waistcoat over a collared shirt, with a scarf and
 * trousers. Each one picks a colourway from a small palette so the village
 * doesn't look like five copies of one person.
 */
const OUTFITS: { coat: number; shirt: number; trouser: number; scarf: number; hair: number }[] = [
  { coat: 0x7b3f5e, shirt: 0xe8e0cf, trouser: 0x3b3a44, scarf: 0xd9a441, hair: 0x2f2418 },
  { coat: 0x2f5d7c, shirt: 0xf0ead8, trouser: 0x33323c, scarf: 0xb5503f, hair: 0x4a3423 },
  { coat: 0x4a6b3a, shirt: 0xeee6d2, trouser: 0x3e3830, scarf: 0x8a5ba0, hair: 0x1f1a14 },
  { coat: 0x8a5a2b, shirt: 0xf2ecdc, trouser: 0x2f3440, scarf: 0x4f8a8b, hair: 0x5a4030 },
  { coat: 0x55467e, shirt: 0xeae3d2, trouser: 0x38333a, scarf: 0xd4794f, hair: 0x33261b },
];
let outfitCursor = 0;

function buildVillagerRig(): Mob['parts'] & { group: THREE.Group } {
  const group = new THREE.Group();
  const o = OUTFITS[outfitCursor++ % OUTFITS.length];
  const skin = new THREE.MeshLambertMaterial({ color: 0xc08a5e });
  const coat = new THREE.MeshLambertMaterial({ color: o.coat });
  const shirt = new THREE.MeshLambertMaterial({ color: o.shirt });
  const trouser = new THREE.MeshLambertMaterial({ color: o.trouser });
  const scarf = new THREE.MeshLambertMaterial({ color: o.scarf });
  const hair = new THREE.MeshLambertMaterial({ color: o.hair });
  const dark = new THREE.MeshLambertMaterial({ color: 0x241c14 });

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), skin);
  head.position.y = 1.56;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.15, 0.48), hair);
  cap.position.y = 1.75;
  group.add(head, cap);
  for (const ex of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), dark);
    eye.position.set(ex, 1.58, 0.235);
    group.add(eye);
  }

  // Shirt front showing between the open waistcoat panels.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.78, 0.28), shirt);
  torso.position.y = 0.96;
  const waistL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.76, 0.32), coat);
  waistL.position.set(-0.17, 0.95, 0);
  const waistR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.76, 0.32), coat);
  waistR.position.set(0.17, 0.95, 0);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.76, 0.1), coat);
  back.position.set(0, 0.95, -0.12);
  const neckScarf = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.13, 0.32), scarf);
  neckScarf.position.y = 1.32;
  group.add(torso, waistL, waistR, back, neckScarf);

  const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
  const mkLeg = (x: number) => {
    const leg = new THREE.Mesh(legGeo.clone(), trouser);
    leg.geometry.translate(0, -0.3, 0);
    leg.position.set(x, 0.6, 0);
    group.add(leg);
    return leg;
  };
  const armGeo = new THREE.BoxGeometry(0.18, 0.62, 0.18);
  const mkArm = (x: number) => {
    const arm = new THREE.Mesh(armGeo.clone(), coat);
    arm.geometry.translate(0, -0.31, 0);
    arm.position.set(x, 1.3, 0);
    group.add(arm);
    return arm;
  };
  return { group, leftLeg: mkLeg(-0.12), rightLeg: mkLeg(0.12), leftArm: mkArm(-0.34), rightArm: mkArm(0.34) };
}

/**
 * The constable — the village's protector, in police uniform.
 *
 * Fills the same role as the golem it replaces (tall, slow, hits hard,
 * defends the village) but is now plainly a police officer: navy tunic with
 * a high-vis belt, a peaked cap with a badge, and epaulettes. Still an
 * original figure rather than any particular force's uniform or insignia.
 */
function buildGuardianRig(): Mob['parts'] & { group: THREE.Group } {
  const group = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1f2c4d });
  const navyDark = new THREE.MeshLambertMaterial({ color: 0x172139 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc08a5e });
  const belt = new THREE.MeshLambertMaterial({ color: 0x14161c });
  const hiVis = new THREE.MeshLambertMaterial({ color: 0xd9e04a });
  const badge = new THREE.MeshBasicMaterial({ color: 0xe8c65a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x241c14 });

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.54, 0.54), skin);
  head.position.y = 2.28;
  // Peaked cap: crown, brim, badge.
  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.20, 0.58), navy);
  crown.position.y = 2.62;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.22), navyDark);
  brim.position.set(0, 2.52, 0.36);
  const capBadge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), badge);
  capBadge.position.set(0, 2.62, 0.30);
  group.add(head, crown, brim, capBadge);
  for (const ex of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), dark);
    eye.position.set(ex, 2.30, 0.28);
    group.add(eye);
  }

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.98, 1.0, 0.48), navy);
  torso.position.y = 1.62;
  const sash = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.5), hiVis);
  sash.position.y = 1.78;
  const dutyBelt = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.5), belt);
  dutyBelt.position.y = 1.18;
  const chestBadge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.02), badge);
  chestBadge.position.set(-0.26, 1.9, 0.25);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.32, 0.44), navyDark);
  hips.position.y = 1.0;
  group.add(torso, sash, dutyBelt, chestBadge, hips);

  const legGeo = new THREE.BoxGeometry(0.3, 0.86, 0.3);
  const mkLeg = (x: number) => {
    const leg = new THREE.Mesh(legGeo.clone(), navyDark);
    leg.geometry.translate(0, -0.43, 0);
    leg.position.set(x, 1.0, 0);
    group.add(leg);
    return leg;
  };
  const armGeo = new THREE.BoxGeometry(0.26, 1.06, 0.26);
  const mkArm = (x: number) => {
    const arm = new THREE.Mesh(armGeo.clone(), navy);
    arm.geometry.translate(0, -0.53, 0);
    arm.position.set(x, 2.04, 0);
    group.add(arm);
    // Epaulette, so the shoulders read as uniform rather than bare blocks.
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), hiVis);
    ep.position.set(x, 2.02, 0);
    group.add(ep);
    return arm;
  };
  return { group, leftLeg: mkLeg(-0.2), rightLeg: mkLeg(0.2), leftArm: mkArm(-0.62), rightArm: mkArm(0.62) };
}

export function spawnMob(kind: MobKind, x: number, z: number, y: number): Mob {
  const rig =
    kind === 'zombie' ? buildRig(0x4c7a3f, 0x2f5533)
    : kind === 'skeleton' ? buildRig(0xd9d2bd, 0x9a9482)
    : kind === 'sheep' ? buildSheepRig()
    : kind === 'pig' ? buildPigRig()
    : kind === 'villager' ? buildVillagerRig()
    : buildGuardianRig();
  rig.group.position.set(x, y, z);
  const hp = HP_BY_KIND[kind];
  return {
    kind,
    group: rig.group,
    hp,
    maxHp: hp,
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    wanderTarget: new THREE.Vector2(x, z),
    hitCooldown: 0,
    attackCooldown: 0,
    dead: false,
    deathTimer: 0,
    parts: { leftLeg: rig.leftLeg, rightLeg: rig.rightLeg, leftArm: rig.leftArm, rightArm: rig.rightArm },
    walkPhase: Math.random() * Math.PI * 2,
    home: new THREE.Vector2(x, z),
    velY: 0,
    grounded: false,
  };
}

/** Half-width and height of each mob's collision box, in blocks. */
const BODY: Record<MobKind, { half: number; height: number }> = {
  zombie: { half: 0.3, height: 1.8 },
  skeleton: { half: 0.3, height: 1.8 },
  sheep: { half: 0.35, height: 1.1 },
  pig: { half: 0.35, height: 0.95 },
  villager: { half: 0.3, height: 1.8 },
  guardian: { half: 0.45, height: 2.6 },
};

const HP_BY_KIND: Record<MobKind, number> = {
  zombie: 6, skeleton: 4, sheep: 3, pig: 3, villager: 6, guardian: 30,
};

/** Mobs that never attack, and that the player's sword ignores. */
export const PEACEFUL = new Set<MobKind>(['sheep', 'pig', 'villager']);
/** Night mobs — what the guardian hunts. */
export const HOSTILE = new Set<MobKind>(['zombie', 'skeleton']);

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
  /** Everything else alive, so mobs can target each other rather than only the player. */
  others?: Mob[],
  /** Voxel collider, so mobs respect walls like the player does. */
  isSolid?: (x: number, y: number, z: number) => boolean,
) {
  if (mob.dead) {
    mob.deathTimer -= dt;
    mob.group.rotation.z = Math.min(Math.PI / 2, mob.group.rotation.z + dt * 4);
    mob.group.position.y -= dt * 0.3;
    return;
  }

  mob.hitCooldown = Math.max(0, mob.hitCooldown - dt);
  mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);

  /*
   * The guardian is the one mob that fights *for* the village. It ignores the
   * player entirely and hunts the nearest hostile, which is what makes the
   * village feel inhabited rather than decorative: at night you can stand
   * back and watch it work instead of being the only thing that matters.
   */
  if (mob.kind === 'guardian') {
    let target: Mob | null = null;
    let best = 16;
    for (const o of others ?? []) {
      if (o.dead || !HOSTILE.has(o.kind)) continue;
      const d = o.pos.distanceTo(mob.pos);
      if (d < best) { best = d; target = o; }
    }
    let gmove = new THREE.Vector2();
    if (target) {
      const to = new THREE.Vector2(target.pos.x - mob.pos.x, target.pos.z - mob.pos.z);
      if (to.length() > 1.6) gmove = to.clone().normalize();
      else if (mob.attackCooldown <= 0) {
        hitMob(target, 12, to.clone().normalize());
        mob.attackCooldown = 1.4;
        mob.parts.rightArm.rotation.x = -1.6;
      }
    } else {
      // Patrol slowly around its post.
      const to = new THREE.Vector2(mob.home.x - mob.pos.x, mob.home.y - mob.pos.z);
      if (to.length() > 3) gmove = to.normalize().multiplyScalar(0.5);
    }
    applyMove(mob, gmove, dt, 1.5, heightAt, isSolid);
    mob.parts.rightArm.rotation.x *= 0.9;
    return;
  }

  const toPlayer = new THREE.Vector2(playerPos.x - mob.pos.x, playerPos.z - mob.pos.z);
  let dist = toPlayer.length();
  let aimAtPlayer = true;
  let aim = toPlayer;

  // Hostiles prefer whichever is closer: the player, or a villager.
  if (HOSTILE.has(mob.kind) && others) {
    for (const o of others) {
      if (o.dead || o.kind !== 'villager') continue;
      const d = o.pos.distanceTo(mob.pos);
      if (d < dist) {
        dist = d;
        aim = new THREE.Vector2(o.pos.x - mob.pos.x, o.pos.z - mob.pos.z);
        aimAtPlayer = false;
      }
    }
  }

  const aggro = !PEACEFUL.has(mob.kind) && isNight && dist < AGGRO_R;

  let move = new THREE.Vector2();
  if (aggro && mob.kind === 'skeleton') {
    if (dist > BOW_MAX) move = aim.clone().normalize();
    else if (dist < BOW_MIN) move = aim.clone().normalize().multiplyScalar(-1);
    if (aimAtPlayer && dist < BOW_RANGE && mob.attackCooldown <= 0 && onShoot) {
      onShoot(mob.pos.clone().setY(mob.pos.y + 1.4), aim.clone().normalize());
      mob.attackCooldown = 1.7;
    }
    if (dist < ATTACK_R && mob.attackCooldown <= 0) {
      if (aimAtPlayer) onAttack(1);
      mob.attackCooldown = 1.1;
    }
  } else if (aggro) {
    if (dist > ATTACK_R * 0.85) move = aim.clone().normalize();
    if (dist < ATTACK_R && mob.attackCooldown <= 0) {
      if (aimAtPlayer) onAttack(mob.kind === 'zombie' ? 2 : 1);
      mob.attackCooldown = 1.1;
    }
  } else if (mob.kind === 'villager' && isNight) {
    // Head home after dark instead of standing out in the open.
    const to = new THREE.Vector2(mob.home.x - mob.pos.x, mob.home.y - mob.pos.z);
    if (to.length() > 1.2) move = to.normalize().multiplyScalar(0.8);
  } else {
    const toTarget = new THREE.Vector2(mob.wanderTarget.x - mob.pos.x, mob.wanderTarget.y - mob.pos.z);
    if (toTarget.length() < 0.6 || Math.random() < 0.002) {
      // Villagers wander around their home, animals roam freely.
      const anchor = mob.kind === 'villager' ? mob.home : new THREE.Vector2(mob.pos.x, mob.pos.z);
      const range = mob.kind === 'villager' ? 6 : 8;
      mob.wanderTarget.set(
        anchor.x + (Math.random() - 0.5) * range,
        anchor.y + (Math.random() - 0.5) * range,
      );
    } else {
      move = toTarget.normalize().multiplyScalar(0.4);
    }
  }

  applyMove(mob, move, dt, SPEED * (aggro ? 1 : 0.45), heightAt, isSolid);
}

/**
 * Shared locomotion, collision and walk cycle.
 *
 * Mobs used to be pinned to `heightAt(x, z)` — the top of whatever column
 * they stood over — which meant they had no body at all. They walked straight
 * through cottage walls, through the player's house, through each other, and
 * they teleported up cliff faces instead of walking round them. This runs the
 * same axis-by-axis box collision the player uses, just simplified: one
 * shared step-up, gravity, and no swimming.
 */
function applyMove(
  mob: Mob,
  move: THREE.Vector2,
  dt: number,
  speed: number,
  heightAt: (x: number, z: number) => number,
  isSolid?: (x: number, y: number, z: number) => boolean,
) {
  const size = BODY[mob.kind];

  if (!isSolid) {
    // No collider supplied: fall back to terrain-following.
    mob.pos.x += move.x * speed * dt;
    mob.pos.z += move.y * speed * dt;
    mob.pos.y = heightAt(mob.pos.x, mob.pos.z) + 1;
    animate(mob, move, dt);
    return;
  }

  const EPS = 1e-3;
  const blocked = (px: number, py: number, pz: number) => {
    const x0 = Math.floor(px - size.half + EPS), x1 = Math.floor(px + size.half - EPS);
    const y0 = Math.floor(py + EPS), y1 = Math.floor(py + size.height - EPS);
    const z0 = Math.floor(pz - size.half + EPS), z1 = Math.floor(pz + size.half - EPS);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++)
          if (isSolid(x, y, z)) return true;
    return false;
  };

  const stepAxis = (axis: 'x' | 'z', d: number) => {
    if (d === 0) return;
    const before = mob.pos[axis];
    const y0 = mob.pos.y;
    mob.pos[axis] = before + d;
    if (!blocked(mob.pos.x, mob.pos.y, mob.pos.z)) return;

    // Try stepping up one block before giving up — terrain here is noisy, and
    // a mob that stops at every bump never leaves its spawn point.
    mob.pos.y = y0 + 1.05;
    if (!blocked(mob.pos.x, mob.pos.y, mob.pos.z)) return;

    mob.pos.y = y0;
    mob.pos[axis] = before;
    // Bounce the wander target so it picks a new direction rather than
    // grinding against the wall forever.
    mob.wanderTarget.set(
      mob.pos.x + (Math.random() - 0.5) * 6,
      mob.pos.z + (Math.random() - 0.5) * 6,
    );
  };

  const dist = Math.hypot(move.x * speed * dt, move.y * speed * dt);
  const steps = Math.min(4, Math.max(1, Math.ceil(dist / 0.4)));
  for (let i = 0; i < steps; i++) {
    stepAxis('x', (move.x * speed * dt) / steps);
    stepAxis('z', (move.y * speed * dt) / steps);
  }

  // Gravity, so a mob that walks off a ledge falls instead of gliding.
  mob.velY -= 24 * dt;
  if (mob.velY < -40) mob.velY = -40;
  const beforeY = mob.pos.y;
  mob.pos.y += mob.velY * dt;
  if (blocked(mob.pos.x, mob.pos.y, mob.pos.z)) {
    if (mob.velY < 0) {
      /*
       * Snap to the top of the block the feet have just entered — which
       * means flooring the position *after* the move, not before it.
       *
       * This read `Math.floor(beforeY)`, and that is the mob hop: standing at
       * y = 11.001, gravity moves you to 10.99, the test says blocked, and
       * flooring the pre-move value resolves you to 12.0 — a whole block
       * above where you started. Every frame. So every non-player entity
       * bounced in place forever, because landing itself launched them.
       */
      mob.pos.y = Math.floor(mob.pos.y) + 1 + EPS;
      mob.grounded = true;
    } else {
      mob.pos.y = beforeY;
    }
    mob.velY = 0;
  } else {
    mob.grounded = false;
  }

  // Safety net: if a mob ends up inside geometry (world edits, bad spawn),
  // lift it out rather than leaving it stuck in a wall forever.
  let guard = 0;
  while (blocked(mob.pos.x, mob.pos.y, mob.pos.z) && guard++ < 8) mob.pos.y += 1;
  if (mob.pos.y < -4) mob.pos.set(mob.home.x, heightAt(mob.home.x, mob.home.y) + 1, mob.home.y);

  animate(mob, move, dt);
}

function animate(mob: Mob, move: THREE.Vector2, dt: number) {
  if (move.lengthSq() > 0.0001) {
    mob.group.rotation.y = Math.atan2(move.x, move.y);
    mob.walkPhase += dt * 8;
    const swing = Math.sin(mob.walkPhase) * 0.6;
    mob.parts.leftLeg.rotation.x = swing;
    mob.parts.rightLeg.rotation.x = -swing;
    if (mob.kind !== 'guardian') {
      mob.parts.leftArm.rotation.x = -swing;
      mob.parts.rightArm.rotation.x = swing;
    }
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
