// src/routes/Game.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import { PullCord } from 'pullcord';
import 'pullcord/pullcord.css';
import '@/components/game/game.css';
import { buildWorld, SIZE, type BuiltWorld } from '@/components/game/world';
import { Block } from '@/components/game/blocks';
import { blockIconUrl, heartUrl } from '@/components/game/hudIcons';
import { createPlayerController, type PlayerController } from '@/components/game/player';
import { DayNight } from '@/components/game/dayNight';
import { Torches } from '@/components/game/torches';
import { createPostFX, type PostFX } from '@/components/game/postfx';
import {
  spawnMob, updateMob, hitMob, spawnArrow, updateArrow, resetOutfitCursor,
  type Mob, type MobKind, type Arrow,
} from '@/components/game/mobs';
import { spawnDrop, updateDrop, type Drop } from '@/components/game/drops';
import { raycastVoxel } from '@/components/game/raycastVoxel';
import {
  SLOT_COUNT, emptyInventory, addItem, takeFromSlot,
  type Inventory,
} from '@/components/game/inventory';
import { GameAudio } from '@/components/game/audio';
import { NpcChat } from '@/components/game/NpcChat';
import { useProfile, useProjects, useRoles } from '@/lib/useContent';

const MAX_HP = 10;
const REACH = 4.8;
const BREAK_TIME = 0.34;
const INTERACT_R = 3.2;
/** The one resident of the house, roaming its floor and answering questions. */
const NPC_NAME = 'the Guide';

/** What the player is currently close enough to press E on. */
type Interaction =
  | { kind: 'bed' }
  | { kind: 'chest' }
  | { kind: 'map' }
  | { kind: 'npc' }
  | { kind: 'board'; slug: string; name: string }
  | null;

export default function Game() {
  const host = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<PlayerController | null>(null);
  const worldRef = useRef<BuiltWorld | null>(null);
  const mobsRef = useRef<Mob[]>([]);
  const arrowsRef = useRef<Arrow[]>([]);
  const dropsRef = useRef<Drop[]>([]);
  const dayNightRef = useRef<DayNight | null>(null);
  const postfxRef = useRef<PostFX | null>(null);
  const audioRef = useRef<GameAudio | null>(null);
  const hpRef = useRef(MAX_HP);
  const flashRef = useRef<HTMLDivElement>(null);
  const invRef = useRef<Inventory>(emptyInventory());
  const selectedRef = useRef(0);
  const panelRef = useRef<string | null>(null);
  const interactRef = useRef<Interaction>(null);
  const sleepTimerRef = useRef<number | null>(null);
  /** The one NPC in the house — set once it's spawned, read every frame for proximity and the head bubble. */
  const guideRef = useRef<Mob | null>(null);
  const npcOpenRef = useRef(false);
  const npcBubbleRef = useRef<string | null>(null);
  const bubbleElRef = useRef<HTMLDivElement>(null);

  const profile = useProfile();
  const { projects, ready: contentReady } = useProjects();
  const roles = useRoles();

  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [night, setNight] = useState(false);
  const [hp, setHp] = useState(MAX_HP);
  const [dead, setDead] = useState(false);
  const [inventory, setInventory] = useState<Inventory>(() => emptyInventory());
  const [selected, setSelected] = useState(0);
  const [breakProgress, setBreakProgress] = useState(0);
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [sleeping, setSleeping] = useState(false);
  const [thirdPerson, setThirdPerson] = useState(false);
  const [phase, setPhase] = useState('Morning');
  const [muted, setMuted] = useState(false);
  const [npcOpen, setNpcOpen] = useState(false);
  const [npcBubble, setNpcBubble] = useState<string | null>(null);

  useEffect(() => { dayNightRef.current?.setNight(night); }, [night]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { panelRef.current = panel; }, [panel]);
  useEffect(() => { interactRef.current = interaction; }, [interaction]);
  useEffect(() => { npcOpenRef.current = npcOpen; }, [npcOpen]);
  useEffect(() => { npcBubbleRef.current = npcBubble; }, [npcBubble]);
  // Stop (suspend) all sound whenever the game isn't actually being played:
  // pointer unlocked (Esc, opening a panel, sleeping), dead, or not ready
  // yet. Previously nothing gated ambience on pause at all — footsteps,
  // wind, and the night drone kept running under the pause overlay.
  useEffect(() => {
    audioRef.current?.setPaused(!locked || dead);
  }, [locked, dead]);

  const boardEntries = useMemo(
    () => projects.map((p) => ({ slug: p.slug, name: p.name, blurb: p.blurb })),
    [projects],
  );
  const openProject = useMemo(
    () => projects.find((p) => p.slug === panel) ?? null,
    [panel, projects],
  );
  /**
   * The same breakdown WritingPad uses in the archive — problem/approach/
   * outcome plus any extra detail paragraphs. The E-interact panel used to
   * show only the one-line `blurb`, which is a fraction of what every other
   * path into a project's write-up on this site shows.
   */
  const projectParas = useMemo(() => {
    if (!openProject) return [] as [string, string][];
    return [
      openProject.challenge && (['The problem', openProject.challenge] as [string, string]),
      openProject.approach && (['What I did', openProject.approach] as [string, string]),
      openProject.outcome && (['What came of it', openProject.outcome] as [string, string]),
      ...(openProject.detail ?? []).map((d) => ['', d] as [string, string]),
    ].filter((v): v is [string, string] => Boolean(v));
  }, [openProject]);

  const takeDamage = useCallback((dmg: number, source?: THREE.Vector3) => {
    hpRef.current = Math.max(0, hpRef.current - dmg);
    setHp(hpRef.current);
    const flash = flashRef.current;
    if (flash) {
      flash.style.opacity = '1';
      window.setTimeout(() => { if (flash) flash.style.opacity = '0'; }, 160);
    }
    audioRef.current?.hurt();
    // Getting hit should physically move the player, not just dock a heart
    // silently — same feedback set every mob's own hit gets (flash, sound,
    // knockback), just aimed the other way. `source` is the attacker's
    // position when known (every real hit has one); push straight away from it.
    const controller = controllerRef.current;
    if (controller && source) {
      const dx = controller.feet.x - source.x;
      const dz = controller.feet.z - source.z;
      const len = Math.hypot(dx, dz) || 1;
      controller.applyKnockback(dx / len, dz / len, 3.2);
    }
    if (hpRef.current <= 0) {
      setDead(true);
      /*
       * Death used to paint the "Knocked out" overlay over a simulation that
       * kept right on running underneath it: `paused` is `!controls.isLocked`,
       * and nothing here ever released the pointer lock on death, so mobs
       * kept moving and landing hits, mining kept working, and the camera
       * kept turning — all hidden behind the overlay. It also meant the
       * pointer stayed invisible (Pointer Lock hides the OS cursor while
       * locked), so the "Wake up" button had nothing visible to click until
       * the player guessed to hit Escape first. Unlocking here fixes both:
       * `paused` flips true next frame, and the cursor reappears with it.
       */
      controllerRef.current?.controls.unlock();
      // A mob could land the killing blow while the 1500ms sleep timer is
      // still running (mobs are only gated on `paused`, and sleeping merely
      // unlocks the pointer — it doesn't pause them). Without this, the
      // sleeping overlay and the death screen rendered on top of each other
      // simultaneously, and since the sleep timeout's own `setSleeping(false)`
      // either already ran or was about to overwrite this, the sleeping
      // overlay could get stuck on screen indefinitely after respawning.
      setSleeping(false);
      if (sleepTimerRef.current != null) {
        window.clearTimeout(sleepTimerRef.current);
        sleepTimerRef.current = null;
      }
    }
  }, []);

  const respawn = useCallback(() => {
    hpRef.current = MAX_HP;
    setHp(MAX_HP);
    setDead(false);
    setSleeping(false);
    setNight(false);
    const world = worldRef.current;
    const bed = world?.house.bedPos;
    if (bed && world && controllerRef.current) {
      // Drop from just above the bed's own height, not spawn's — the bed can
      // sit meaningfully higher or lower than the original spawn point, and
      // starting the settle-down search from the wrong height either buried
      // the player in the floor or dropped them a long way.
      const fromY = world.heightAt(bed.x, bed.z + 2) + 3;
      controllerRef.current.teleport(bed.x, bed.z + 2, fromY);
    }
  }, []);

  /** Returns whether the item fitted, so a full inventory leaves drops on the floor. */
  const collect = useCallback((block: Block) => {
    const next = addItem(invRef.current, block, 1);
    if (next === invRef.current) return false;
    invRef.current = next;
    setInventory(next);
    audioRef.current?.pickup();
    return true;
  }, []);

  /** Sleep: skip the night, and top the player up, like a bed should. */
  const sleep = useCallback(() => {
    setSleeping(true);
    controllerRef.current?.controls.unlock();
    sleepTimerRef.current = window.setTimeout(() => {
      sleepTimerRef.current = null;
      dayNightRef.current?.skipToMorning();
      setNight(false);
      hpRef.current = MAX_HP;
      setHp(MAX_HP);
      setSleeping(false);
      /*
       * No `controls.lock()` here. PointerLockControls.lock() calls
       * `requestPointerLock()`, which browsers require to come from a direct
       * user gesture — a setTimeout callback isn't one, so Chrome and
       * Firefox silently ignore it. The player used to wake up with the
       * pointer never re-locked, stuck looking at a black screen with no
       * visible way back in until they guessed to click. Leaving `sleeping`
       * false and `locked` false (already the case, since `unlock()` was
       * called above) lets the normal "Click to enter" overlay reappear,
       * which both explains what happened and re-locks on a real click.
       */
    }, 1500);
  }, []);

  useEffect(() => {
    /*
     * Wait for the content fetch before building anything.
     *
     * This effect used to run once on mount (`[]` deps) and close over
     * whatever `projects`/`profile` were on that very first render. But
     * `useProjects()`/`useProfile()` start out on the *compiled* content.ts
     * values and only switch to the live /api/content tree once that fetch
     * resolves — which is asynchronous and essentially never wins the race
     * against two nested requestAnimationFrame calls. In practice that meant
     * the island was built from the static, build-time project list every
     * single time, and adding or removing a project in the admin panel had
     * no effect here no matter how many times the page was reloaded: by the
     * time the fetch came back, the world (and its fixed number of notice
     * boards, torches, and its mob/villager layout) already existed.
     *
     * Gating on `contentReady` and listing it as a dependency means this
     * effect body runs as a no-op on the first (not-yet-loaded) render and
     * then runs for real exactly once, the moment the store has an answer —
     * whether that's the live backend tree or, if the backend is down or
     * unseeded, the same static fallback as before. Either way the world is
     * always built from whatever `projects` actually is by then, not from a
     * value captured before it was known.
     */
    if (!contentReady) return;

    const el = host.current;
    if (!el) return;

    /*
     * Boot is deferred, not run inline.
     *
     * Everything below — terrain meshing, the atlas, mob rigs, shader compiles
     * — is synchronous and takes a few hundred milliseconds. Running it
     * straight from the effect blocks the main thread *before the browser has
     * painted*, so the loading overlay never appeared: the tab simply froze on
     * the previous frame and then the world popped in. Yielding for two frames
     * first lets the overlay render, and the freeze then happens behind it,
     * which is the whole point of having one.
     */
    let cancelled = false;
    let teardown: (() => void) | null = null;

    const boot = () => {
      if (cancelled || !host.current) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      /*
       * Capped at 1.5 rather than 2. With a full post chain the cost scales
       * with pixel count, and on a 3x phone the difference between 1.5 and 2 is
       * invisible next to the framerate it costs.
       */
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.shadowMap.enabled = true;
      // Soft percentage-closer filtering: the spec asks for soft shadows, and
      // hard block shadows are the single most "untreated" looking thing here.
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      el.appendChild(renderer.domElement);

      // Quality tier, picked once from the device rather than guessed per frame.
      const quality: 'high' | 'low' =
        window.devicePixelRatio > 2.5 || window.innerWidth < 900 ? 'low' : 'high';

      const scene = new THREE.Scene();
      /*
       * Far plane trimmed from 220 to 170: the exponential fog (density
       * 0.012, set in dayNight.ts) already reduces visibility to a few
       * percent well before 170 — at 220 the renderer was still submitting
       * and rasterising chunk geometry that fog had already made
       * practically invisible. Long, open sightlines (across water, or
       * from high ground looking back over the island) are exactly where
       * this mattered: the more of the map a view could see at once, the
       * more of that "rendering fog" was wasted GPU work rather than
       * cropping anything actually visible.
       */
      const camera = new THREE.PerspectiveCamera(72, el.clientWidth / el.clientHeight, 0.1, 170);

      // Villagers pick their outfit from a module-level counter in mobs.ts;
      // reset it here so every fresh world (including a remount after
      // navigating away and back) starts the cycle from the same place
      // instead of wherever a previous mount or a dev hot-reload left it.
      resetOutfitCursor();

      const world = buildWorld(projects, profile);
      worldRef.current = world;
      scene.add(world.group);

      const dayNight = new DayNight(scene, quality === 'high' ? 36 : 28);
      dayNightRef.current = dayNight;

      const audio = new GameAudio();
      audioRef.current = audio;

      const torches = new Torches(scene);
      for (const t of world.torchSpots) torches.add(t.x, t.y, t.z, t.style);

      const postfx: PostFX = createPostFX(renderer, scene, camera, el.clientWidth, el.clientHeight, quality);
      postfxRef.current = postfx;

      const spawnPos = new THREE.Vector3(
        world.house.doorX + 0.5,
        world.heightAt(world.house.doorX, world.house.doorZ + 2) + 3,
        world.house.doorZ + 2.5,
      );
      const controller = createPlayerController(
        camera, renderer.domElement, world.isSolidAt, SIZE, spawnPos, world.waterLevel,
      );
      controllerRef.current = controller;
      scene.add(controller.controls.object);

      const onLock = () => setLocked(true);
      const onUnlock = () => setLocked(false);
      controller.controls.addEventListener('lock', onLock);
      controller.controls.addEventListener('unlock', onUnlock);

      /*
       * The targeted-block outline. Without it there is no way to tell which
       * block you are about to hit, or that reach is limited at all — you click
       * and something somewhere changes. It's an edges-only box a hair larger
       * than a block so it sits just proud of the face instead of z-fighting
       * with it.
       */
      const highlight = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
        new THREE.LineBasicMaterial({ color: 0x101010, transparent: true, opacity: 0.55 }),
      );
      highlight.visible = false;
      scene.add(highlight);

      const mobs: Mob[] = [];
      /*
       * Population bumped from 6 (4 zombies, 2 skeletons) to 18 — with the
       * golems now actively hunting hostiles down at night to "control the
       * population" (per the brief), 6 wasn't enough of a population for
       * that to be visible as an ongoing thing rather than "the two zombies
       * near the village died once and that was it". Split across two
       * rings at different radii, rather than one circle, so they don't all
       * stand shoulder to shoulder at the same distance from the house.
       */
      const spawnRings: { radius: number; kinds: MobKind[] }[] = [
        { radius: Math.min(SIZE / 2 - 10, 22), kinds: ['zombie', 'zombie', 'skeleton', 'zombie', 'skeleton', 'zombie', 'zombie', 'skeleton'] },
        { radius: Math.min(SIZE / 2 - 6, 32), kinds: ['zombie', 'skeleton', 'zombie', 'zombie', 'skeleton', 'zombie', 'skeleton', 'zombie', 'zombie', 'skeleton'] },
      ];
      for (const { radius, kinds } of spawnRings) {
        kinds.forEach((kind, i) => {
          const a = (i / kinds.length) * Math.PI * 2 + 0.4;
          const x = SIZE / 2 + Math.cos(a) * radius;
          const z = SIZE / 2 + Math.sin(a) * radius;
          const mob = spawnMob(kind, x, z, world.heightAt(x, z) + 1);
          mob.group.visible = false;
          mobs.push(mob);
          scene.add(mob.group);
          scene.add(mob.hpBar);
        });
      }
      const addMob = (kind: MobKind, x: number, z: number, hidden = false, y?: number) => {
        const mob = spawnMob(kind, x, z, y ?? world.heightAt(x, z) + 1);
        mob.group.visible = !hidden;
        mobs.push(mob);
        scene.add(mob.group);
        scene.add(mob.hpBar);
        return mob;
      };
      /*
       * Animals scattered around the plateau by polar offset rather than by
       * absolute coordinate, so they follow the island's centre instead of
       * clustering in one corner when SIZE changes.
       */
      const C = SIZE / 2;
      const ring = (n: number, r: number, off: number, fn: (x: number, z: number) => void) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + off;
          fn(C + Math.cos(a) * r, C + Math.sin(a) * r);
        }
      };
      ring(6, 18, 0.3, (x, z) => addMob('sheep', x, z));
      ring(5, 24, 1.1, (x, z) => addMob('pig', x, z));

      // One villager per cottage doorstep, with a bed inside to retreat to
      // at night, plus two guardians posted to protect the village and two
      // more posted at the player's own house.
      world.village.forEach((v) => {
        // Spawned at the cottage's own known floor height (`groundY`), not
        // `heightAt(x, z) + 1` — a roofed building is exactly the case
        // `heightAt` gets wrong: scanning down from the sky for the first
        // solid block finds the *roof*, not the floor underneath it, which
        // is how villagers kept ending up spawned standing on their own
        // cottage's roof instead of at the door.
        const villager = addMob('villager', v.x, v.z, false, v.groundY);
        villager.sleepPos = new THREE.Vector2(v.bedPos.x, v.bedPos.z);
      });
      if (world.village.length) {
        const mx = world.village.reduce((a, v) => a + v.x, 0) / world.village.length;
        const mz = world.village.reduce((a, v) => a + v.z, 0) / world.village.length;
        // Two posts a few blocks apart rather than stacking both guardians
        // on the exact same spot — each patrols its own little territory
        // around the village centre instead of moving as a single unit.
        addMob('guardian', mx - 4, mz - 3);
        addMob('guardian', mx + 4, mz + 3);
      }
      // Two more stationed right at the house — one either side of the
      // gate, so "protect the safe zone" covers home as well as the village.
      const houseGateZ = world.house.cz + world.house.half + 3;
      addMob('guardian', world.house.cx - 5, houseGateZ);
      addMob('guardian', world.house.cx + 5, houseGateZ);

      // The one resident of the house — wanders the great room floor
      // (`guideHome`, dead centre) and is who the chat panel talks to.
      // Spawned at `guideHome.y` explicitly, not `heightAt()` — the
      // player's own house is a roofed structure too, so scanning down
      // from the sky at the room's centre found the *roof*, the same bug
      // that was putting villagers on their cottages' roofs.
      guideRef.current = addMob('villager', world.guideHome.x, world.guideHome.z, false, world.guideHome.y);
      // Regular villagers walk home and stop once they get there after dark
      // — sensible when home is a cottage across the map. The guide's home
      // is wherever it already always is, so without this flag that same
      // "stop once home" behaviour made it freeze solid every night, with
      // no way to tell that apart from actually being stuck.
      guideRef.current.indoor = true;

      controller.avatar.traverse((o) => { o.castShadow = true; });
      scene.add(controller.avatar);
      for (const m of mobs) m.group.traverse((o) => { o.castShadow = true; });
      mobsRef.current = mobs;
      arrowsRef.current = [];
      dropsRef.current = [];

      const onResize = () => {
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight);
        postfx.setSize(el.clientWidth, el.clientHeight);
      };
      window.addEventListener('resize', onResize);

      const forward2 = new THREE.Vector3();
      const dir2 = new THREE.Vector3();
      const bubbleVec = new THREE.Vector3();
      const lookDir = new THREE.Vector3();

      /**
       * Ray-sphere hit test, returning the distance along the ray to the
       * intersection (or null for a miss / behind the camera). `dir` must
       * be a unit vector. Used below so "what can I interact with" is
       * whatever's actually under the crosshair, not whatever happens to
       * be nearest the player's feet in open 3D space — the two used to
       * disagree constantly once the gallery had more than a handful of
       * plaques close together (a plaque one row up could be "nearer" by
       * straight-line distance than the one you're actually looking at).
       */
      function raySphere(origin: THREE.Vector3, dir: THREE.Vector3, center: THREE.Vector3, radius: number): number | null {
        const ocx = origin.x - center.x;
        const ocy = origin.y - center.y;
        const ocz = origin.z - center.z;
        const b = ocx * dir.x + ocy * dir.y + ocz * dir.z;
        const c = ocx * ocx + ocy * ocy + ocz * ocz - radius * radius;
        const disc = b * b - c;
        if (disc < 0) return null;
        const t = -b - Math.sqrt(disc);
        // A negative entry point means the sphere's near face is behind the
        // camera — which is also exactly what happens when the camera is
        // standing *inside* the sphere (close enough to a big interactable,
        // the bed especially, that the eye is past its near surface). `c < 0`
        // is precisely that case, and it's a hit, not a miss: being close
        // enough to be inside the thing you're trying to interact with
        // should never be the one position that fails the crosshair check.
        if (t < 0) return c < 0 ? 0 : null;
        return t;
      }

      let mining = false;
      let mineTarget: THREE.Vector3 | null = null;
      let mineT = 0;

      const currentHit = () => {
        camera.getWorldDirection(dir2);
        return raycastVoxel(camera.position, dir2, REACH, (x, y, z) => world.getBlock(x, y, z) !== Block.AIR);
      };

      function tryAttackMob(): boolean {
        camera.getWorldDirection(forward2);
        for (const mob of mobsRef.current) {
          // Every mob can be hit, peaceful or not — the sword used to pass
          // straight through sheep, pigs and townsfolk, which read as the swing
          // being broken rather than as a deliberate rule.
          // The one exception is the guide: it's the only way to reach the
          // chat panel, so letting it be killed like any other villager would
          // let the player permanently break their own conversation feature
          // for the rest of the session.
          if (mob === guideRef.current) continue;
          if (mob.dead || !mob.group.visible) continue;
          if (camera.position.distanceTo(mob.pos) > 2.8) continue;
          const toMob = mob.pos.clone().sub(camera.position).normalize();
          if (forward2.dot(toMob) > 0.6) {
            const kd = new THREE.Vector2(mob.pos.x - camera.position.x, mob.pos.z - camera.position.z).normalize();
            hitMob(mob, 3, kd, world.isSolidAt);
            audioRef.current?.mobHit();
            return true;
          }
        }
        return false;
      }

      const onMouseDown = (e: MouseEvent) => {
        if (!controller.controls.isLocked) return;
        if (e.button === 0) {
          controller.swing();
          if (tryAttackMob()) return;
          const hit = currentHit();
          if (hit) { mining = true; mineTarget = hit.cell; mineT = 0; }
        } else if (e.button === 2) {
          const hit = currentHit();
          const slot = invRef.current[selectedRef.current];
          if (hit && slot) {
            const p = hit.place;
            // Don't let a placed block occupy the space the player is in.
            if (p.distanceTo(camera.position) > 1.0) {
              if (world.placeBlock(p.x, p.y, p.z, slot.block)) {
              audio.place();
                const next = takeFromSlot(invRef.current, selectedRef.current, 1);
                invRef.current = next;
                setInventory(next);
              }
            }
          }
        }
      };
      const onMouseUp = (e: MouseEvent) => {
        if (e.button === 0) { mining = false; mineTarget = null; setBreakProgress(0); }
      };
      const onContextMenu = (e: MouseEvent) => e.preventDefault();
      renderer.domElement.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);
      renderer.domElement.addEventListener('contextmenu', onContextMenu);

      const onWheel = (e: WheelEvent) => {
        if (!controller.controls.isLocked) return;
        setSelected((s) => (s + (e.deltaY > 0 ? 1 : -1) + SLOT_COUNT) % SLOT_COUNT);
      };
      window.addEventListener('wheel', onWheel);

      const onKeyDown = (e: KeyboardEvent) => {
        // While the chat is open, every other key is left alone — typing a
        // question shouldn't also flip hotbar slots (digits) or toggle third
        // person (C). Escape still closes it, same as every other panel.
        if (npcOpenRef.current) {
          if (e.code === 'Escape') { setNpcOpen(false); controller.controls.lock(); }
          return;
        }
        if (e.code === 'Escape') controller.controls.unlock();
        const num = Number(e.code.replace('Digit', ''));
        if (!Number.isNaN(num) && num >= 1 && num <= SLOT_COUNT) setSelected(num - 1);

        if (e.code === 'KeyC' && controller.controls.isLocked) {
          setThirdPerson(controller.toggleView());
        }

        if (e.code === 'KeyT' && controller.controls.isLocked) {
          controller.toggleTorch();
        }

        if (e.code === 'KeyE') {
          // One context-sensitive key, resolved against whatever is nearest,
          // rather than a separate binding per piece of furniture.
          if (panelRef.current) { setPanel(null); controller.controls.lock(); return; }
          const it = interactRef.current;
          if (!it || !controller.controls.isLocked) return;
          // Opening any panel used to leave `mining`/`mineTarget` set if the
          // player was holding left-click the moment they pressed E — the
          // loop's `!paused` guard stopped the block actually breaking, but
          // the break-progress ring stayed on screen over the panel until
          // mouseup. Clearing it here matches what mouseup already does.
          mining = false; mineTarget = null; mineT = 0; setBreakProgress(0);
          if (it.kind === 'board') { setPanel(it.slug); controller.controls.unlock(); }
          else if (it.kind === 'chest') { setPanel('__chest'); controller.controls.unlock(); }
          else if (it.kind === 'map') { setPanel('__map'); controller.controls.unlock(); }
          else if (it.kind === 'bed') sleep();
          else if (it.kind === 'npc') { setNpcOpen(true); controller.controls.unlock(); }
        }
      };
      window.addEventListener('keydown', onKeyDown);

      /*
       * Prime the spawn area synchronously before the first frame. This is
       * the one place a stall is fine — the loading overlay is already on
       * screen, which is exactly what it is for.
       */
      world.updateStreaming(spawnPos.x, spawnPos.z, 25);

      let raf = 0;
      let warmupFrames = 0;
      let readySet = false;
      /** Flips once every chunk on the island has been built — see the loop, and the readiness gate below. */
      let mapLoaded = false;
      let last = performance.now();
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        /*
         * `VIEW_CHUNKS` is generous enough that, from anywhere near the
         * middle of the map (spawn included), every chunk on the island
         * counts as "wanted" from frame one — this was never really a
         * streaming radius that shrinks what's loaded, just a staged
         * build-it-once budget. The bug was in how that staging worked: the
         * loading screen only primed a `budget: 25` burst near spawn and
         * then hid itself after two rendered frames — unconditionally, not
         * "once the map is actually built". Whatever didn't finish in that
         * first burst (most of the island, in practice) was left to stream
         * in during real gameplay at a trickle of 4 chunks a frame, and
         * since players start moving the instant control is handed to them,
         * that trickle reliably landed right on top of "I just started
         * running" — which is exactly the lag being reported. Now the loop
         * keeps building at a fast clip *before* `ready` ever flips true, so
         * the loading screen simply stays up until there's nothing left to
         * stream — meaning there's nothing left to stutter on once you can
         * actually move.
         */
        const stream = world.updateStreaming(camera.position.x, camera.position.z, mapLoaded ? 2 : 24);
        if (!mapLoaded && stream.ready >= stream.total) mapLoaded = true;

        dayNight.update(dt, camera.position);
        torches.update(dt, camera.position, dayNight.factor, now / 1000);
      world.water.update(now / 1000, camera.position, dayNight.skyTint, dayNight.factor);

        postfx.updateGrade(dayNight.factor, Math.sin((dayNight.phase - 0.25) * Math.PI * 2));
        setPhase(dayNight.label);
        const paused = !controller.controls.isLocked;
        if (!paused) controller.update(dt);

        // What the crosshair is actually pointing at, not whatever's
        // nearest the player's feet — see raySphere above. Each candidate
        // is a sphere at roughly its own size; the winner is whichever the
        // look-ray hits first (smallest distance along the ray), same
        // logic as a real raycast, so overlapping candidates resolve the
        // way looking at one of two overlapping objects actually should.
        camera.getWorldDirection(lookDir);
        const feet = controller.feet;
        let found: Interaction = null;
        let bestT = INTERACT_R + 1.2; // a little past INTERACT_R: the ray origin is the eye, not the feet
        const tryHit = (center: THREE.Vector3, radius: number, make: () => NonNullable<Interaction>) => {
          if (feet.distanceTo(center) > INTERACT_R + 1.5) return; // sanity cap, mainly for third-person's pulled-back camera
          const t = raySphere(camera.position, lookDir, center, radius);
          if (t !== null && t < bestT) { bestT = t; found = make(); }
        };
        tryHit(world.house.bedPos, 1.1, () => ({ kind: 'bed' }));
        // Chest and map were never added to this sweep at all — the modals
        // for both exist in the JSX and both are reachable in principle, but
        // interactRef could never actually become { kind: 'chest' | 'map' },
        // so neither panel could ever open.
        tryHit(world.chestPos, 0.7, () => ({ kind: 'chest' }));
        tryHit(world.mapPos, 0.7, () => ({ kind: 'map' }));
        // Kept separate from the crosshair hit-test above: the chest's lid
        // animation is ambient (it should pop open just from being nearby,
        // the way the original design intended), not something that should
        // require staring directly at it the way opening the panel does.
        const chestD = feet.distanceTo(world.chestPos);
        // The guide moves, unlike everything else in this sweep, so its
        // position has to be read live every frame rather than a value
        // baked in once at world-build time.
        if (guideRef.current && !guideRef.current.dead) {
          tryHit(guideRef.current.pos, 0.8, () => ({ kind: 'npc' }));
        }
        for (const b of world.boards) {
          tryHit(b.position, 0.55, () => {
            const proj = projects.find((p) => p.slug === b.slug);
            return { kind: 'board', slug: b.slug, name: proj?.name ?? b.slug };
          });
        }
        setInteraction((prev) => {
          const same = prev?.kind === found?.kind
            && (prev as { slug?: string })?.slug === (found as { slug?: string })?.slug;
          return same ? prev : found;
        });

        const hit = !paused ? currentHit() : null;
        if (hit) {
          highlight.visible = true;
          highlight.position.set(hit.cell.x + 0.5, hit.cell.y + 0.5, hit.cell.z + 0.5);
        } else {
          highlight.visible = false;
        }

        if (mining && mineTarget && !paused) {
          if (!hit || !hit.cell.equals(mineTarget)) {
            mining = false; mineTarget = null; mineT = 0; setBreakProgress(0);
          } else {
            mineT += dt;
            setBreakProgress(Math.min(1, mineT / BREAK_TIME));
            if (mineT >= BREAK_TIME) {
              const dropped = world.breakBlock(mineTarget.x, mineTarget.y, mineTarget.z);
            audio.mine();
              if (dropped != null) {
                const d = spawnDrop(
                  dropped, mineTarget.x + 0.5, mineTarget.y + 0.5, mineTarget.z + 0.5,
                  world.itemMaterial,
                );
                dropsRef.current.push(d);
                scene.add(d.mesh);
              }
              mining = false; mineTarget = null; mineT = 0; setBreakProgress(0);
            }
          }
        }

        const isNight = dayNight.factor > 0.5;
        /*
         * Every entity update below used to run unconditionally, regardless
         * of `paused` — mining was already gated, but mobs kept walking and
         * attacking, and arrows kept flying and landing hits, underneath
         * every panel, the NPC chat, and (worst of all) the death screen.
         * Wrapping combat/physics in `!paused` is what makes "paused" mean
         * paused rather than just "camera stopped, everything else keeps
         * going." The visible world — day/night, water, clouds, chest lid,
         * ambience — keeps living on purpose; only what could hurt or move
         * the player stops.
         */
        if (!paused) {
          // Nearest active zombie/skeleton this frame, for the proximity
          // sound cues below — sight alone wasn't enough warning on a map
          // with trees and buildings blocking the view at night.
          let nearestZombieD = Infinity;
          let nearestSkeletonD = Infinity;
          for (const mob of mobsRef.current) {
            if (mob.kind === 'zombie' || mob.kind === 'skeleton') {
              /*
               * Was `isNight || mob.dead` — a blanket switch with no idea
               * whether the mob was standing in the open or tucked under a
               * tree canopy or a roof. Real shade should matter: a hostile
               * that happened to end the night under cover can survive into
               * the morning there rather than blinking out the instant the
               * sun comes up, and only "burns" (disappears) once it's
               * actually caught somewhere with open sky overhead. Scanning
               * a handful of cells straight up is a cheap stand-in for a
               * real sunlight raycast — cheap enough to run for every
               * hostile, every frame, without it costing anything visible.
               */
              const shaded = !isNight && (() => {
                const mx = Math.floor(mob.pos.x);
                const mz = Math.floor(mob.pos.z);
                for (let y = Math.floor(mob.pos.y) + 1; y <= Math.floor(mob.pos.y) + 8; y++) {
                  if (world.isSolidAt(mx, y, mz)) return true;
                }
                return false;
              })();
              mob.group.visible = isNight || shaded || mob.dead;
            }
            if (!mob.group.visible) continue;
            if (!mob.dead) {
              if (mob.kind === 'zombie') nearestZombieD = Math.min(nearestZombieD, camera.position.distanceTo(mob.pos));
              else if (mob.kind === 'skeleton') nearestSkeletonD = Math.min(nearestSkeletonD, camera.position.distanceTo(mob.pos));
            }
            updateMob(
              mob, dt, camera.position, isNight, world.heightAt,
              (dmg) => takeDamage(dmg, mob.pos),
              (from, target) => {
                const arrow = spawnArrow(from, target);
                arrowsRef.current.push(arrow);
                scene.add(arrow.mesh);
              },
              mobsRef.current,
              // The mob-only collider (see world.ts) — the one thing this
              // adds over the player's own isSolidAt is the house's doorway
              // opening, which is solid to every mob so zombies can't wander
              // in at night and the guide can't wander out.
              world.isMobSolidAt,
            );
          }
          const PROX_R = 16;
          audio.zombieNear(dt, nearestZombieD === Infinity ? 0 : Math.max(0, 1 - nearestZombieD / PROX_R));
          audio.skeletonNear(dt, nearestSkeletonD === Infinity ? 0 : Math.max(0, 1 - nearestSkeletonD / PROX_R));

          // Dead mobs used to stay in the array (and the scene) forever: the
          // death animation ran once, `updateMob` kept iterating and
          // early-returning for them every frame after, and their sunk
          // geometry was never removed from the scene graph.
          mobsRef.current = mobsRef.current.filter((mob) => {
            if (mob.dead && mob.deathTimer <= 0) {
              scene.remove(mob.group);
              mob.group.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); });
              scene.remove(mob.hpBar);
              mob.hpBar.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); });
              return false;
            }
            return true;
          });

          arrowsRef.current = arrowsRef.current.filter((arrow) => {
            // For the knockback direction, a point behind the arrow along its
            // own flight path — the arrow's position *at* the hit is nearly
            // on top of the player by definition, which would give
            // `takeDamage` a near-zero, noisy direction to normalize instead
            // of "push back the way this arrow came from".
            const done = updateArrow(
              arrow, dt, camera.position,
              (dmg) => takeDamage(dmg, arrow.pos.clone().addScaledVector(arrow.vel, -1)),
              world.isMobSolidAt,
            );
            if (done) scene.remove(arrow.mesh);
            return !done;
          });

          dropsRef.current = dropsRef.current.filter((drop) => {
            const done = updateDrop(drop, dt, controller.feet, world.isSolidAt, collect);
            if (done) { scene.remove(drop.mesh); drop.mesh.geometry.dispose(); }
            return !done;
          });
        }

        /*
         * While the chat is open the guide is otherwise completely frozen —
         * it's a mob, and the pause fix above (see takeDamage/#32) correctly
         * stops every mob's update while `paused` is true, which is exactly
         * what should happen for combat and wandering. But applied to the
         * one mob the player is actively looking at and talking to, "frozen"
         * reads as broken: it keeps facing whatever direction it happened to
         * be walking when the chat opened, and its arms/legs stay locked
         * mid-stride. This runs even while paused (npcOpen implies paused)
         * to fix exactly that: turn to face the player, plant the feet, and
         * play a small idle arm-sway instead of a static mannequin pose.
         */
        const guide = guideRef.current;
        if (guide && npcOpenRef.current && !guide.dead) {
          const dx = camera.position.x - guide.pos.x;
          const dz = camera.position.z - guide.pos.z;
          if (dx * dx + dz * dz > 0.0001) guide.group.rotation.y = Math.atan2(dx, dz);
          const t = now / 1000;
          guide.parts.leftArm.rotation.x = Math.sin(t * 2.2) * 0.18;
          guide.parts.rightArm.rotation.x = -Math.sin(t * 2.2) * 0.18;
          guide.parts.leftLeg.rotation.x = 0;
          guide.parts.rightLeg.rotation.x = 0;
          guide.group.position.copy(guide.pos);
        }

        // The chest's lid/glow, the ambience (footsteps, birds, crickets,
        // wind, night drone) and the panel depth-of-field were all fully
        // implemented but never actually driven from the loop — the chest
        // never opened, the game was silent, and the BokehPass ran every
        // frame as a permanent no-op passthrough.
        world.chest.setOpen(panelRef.current === '__chest');
        world.chest.update(dt, chestD < INTERACT_R, now / 1000);
        audio.update(dt, dayNight.factor, controller.isMoving() && !paused, controller.isSwimming());
        postfx.setFocus(panelRef.current ? 1 : 0, 6, dt);

        // Clouds were added to the scene and never moved again, despite the
        // "drifting cloud slabs" comment. A slow, wrapping drift of the
        // whole layer is enough to sell it without tracking each cloud.
        world.clouds.position.x = ((now / 1000) * 0.4) % 200 - 100;

        /*
         * The guide's speech bubble is positioned imperatively, not through
         * React state — projecting a moving 3D point to screen space is a
         * per-frame calculation, and running it through setState would
         * re-render this whole component 60 times a second for a div that
         * only actually needs new *text* on the rare occasions the bubble's
         * content changes (which IS state — see npcBubble/onBubble).
         */
        const bubbleEl = bubbleElRef.current;
        if (bubbleEl) {
          if (guide && !guide.dead && npcBubbleRef.current) {
            bubbleVec.set(guide.pos.x, guide.pos.y + 2.1, guide.pos.z).project(camera);
            if (bubbleVec.z < 1) {
              const sx = (bubbleVec.x * 0.5 + 0.5) * el.clientWidth;
              const sy = (1 - (bubbleVec.y * 0.5 + 0.5)) * el.clientHeight;
              bubbleEl.style.display = 'block';
              bubbleEl.style.left = `${sx}px`;
              bubbleEl.style.top = `${sy}px`;
            } else {
              bubbleEl.style.display = 'none';
            }
          } else {
            bubbleEl.style.display = 'none';
          }
        }

        postfx.composer.render();

        // Two rendered frames before revealing (the first triggers the last
        // of the shader compiles, so lifting the overlay on frame one still
        // shows a stutter) — *and* the whole map actually finished streaming
        // in, so nothing is left to build once the player can move.
        if (warmupFrames < 2) warmupFrames++;
        if (!readySet && warmupFrames >= 2 && mapLoaded) { readySet = true; setReady(true); }
      };
      raf = requestAnimationFrame(loop);

      teardown = () => {
        cancelAnimationFrame(raf);
        if (sleepTimerRef.current != null) {
          window.clearTimeout(sleepTimerRef.current);
          sleepTimerRef.current = null;
        }
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('wheel', onWheel);
        renderer.domElement.removeEventListener('mousedown', onMouseDown);
        renderer.domElement.removeEventListener('contextmenu', onContextMenu);
        controller.controls.removeEventListener('lock', onLock);
        controller.controls.removeEventListener('unlock', onUnlock);
        controller.dispose();
        postfx.dispose();
        dayNight.dispose();
        torches.dispose();
        world.dispose();
        // GameAudio.dispose() was never called anywhere — leaving /game left
        // the AudioContext (wind, drone, and anything still scheduled)
        // running in the background indefinitely, since nothing ever closed
        // it. This is what actually stops the sound when the game closes.
        audio.dispose();
        for (const mob of mobsRef.current) {
          mob.group.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); });
          mob.hpBar.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); });
        }
        for (const arrow of arrowsRef.current) arrow.mesh.geometry.dispose();
        for (const drop of dropsRef.current) drop.mesh.geometry.dispose();
        renderer.dispose();
        el.removeChild(renderer.domElement);
      };
      };

    const kick = window.setTimeout(
      () => requestAnimationFrame(() => requestAnimationFrame(boot)),
      0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(kick);
      teardown?.();
    };
    // profile/projects/roles are intentionally not in this list — once the
    // world is built for a session it stays built (a live rebuild mid-play
    // would tear down/regenerate the whole island under the player's feet).
    // contentReady is the only signal this effect needs: it flips from
    // false to true exactly once per mount, right when the real data is
    // finally known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentReady]);


  const hearts = Array.from({ length: 5 }, (_, i) => (hp > i * 2 + 1 ? 'full' : hp > i * 2 ? 'half' : 'empty'));
  const promptFor = (it: Interaction) => {
    if (!it) return '';
    switch (it.kind) {
      case 'bed': return 'Sleep';
      case 'chest': return 'Open the chest';
      case 'map': return 'My journey';
      case 'npc': return `Talk to ${NPC_NAME}`;
      default: return `Read “${it.name}”`;
    }
  };

  return (
    <div className="voxel-room relative h-screen w-screen overflow-hidden bg-black">
      <div ref={host} className="absolute inset-0" />

      {!ready && (
        <div className="voxel-loading">
          <p className="voxel-loading-title">Generating world…</p>
          <span className="voxel-loading-bar"><i /></span>
        </div>
      )}

      <PullCord
        pulled={night}
        onPull={() => setNight((n) => !n)}
        ariaLabel={`Switch to ${night ? 'day' : 'night'}`}
        className="world-pullcord"
      />

      {/*
        The guide's head bubble. Always mounted (so the ref survives) but
        hidden by default — its position is set imperatively every frame in
        the render loop from a world-to-screen projection of the guide's
        head, not by React layout, since that has to track a moving 3D
        object rather than sit at a fixed place in the DOM.
      */}
      <div ref={bubbleElRef} className="voxel-npc-bubble" aria-live="polite">
        {npcBubble}
      </div>

      <NpcChat
        open={npcOpen}
        npcName={NPC_NAME}
        onClose={() => {
          setNpcOpen(false);
          controllerRef.current?.controls.lock();
        }}
        onBubble={setNpcBubble}
      />

      {locked && !dead && (
        <>
          <div className="voxel-crosshair">
            {breakProgress > 0 && (
              <div className="voxel-break-ring"
                style={{ background: `conic-gradient(#f4efe2 ${breakProgress * 360}deg, transparent 0deg)` }} />
            )}
          </div>
          <div ref={flashRef} className="voxel-hurt-flash" />

          <div className="absolute right-[20px] top-[20px] flex flex-col items-end gap-[6px]">
            <div className="voxel-hearts">
              {hearts.map((s, i) => <img key={i} className="voxel-heart" src={heartUrl(s)} alt="" aria-hidden />)}
            </div>
            <p className="voxel-hint voxel-clock">{phase}</p>
            <button
              type="button"
              className="voxel-hint voxel-mute"
              onClick={() => { const m = !muted; setMuted(m); audioRef.current?.setMuted(m); }}
            >
              {muted ? 'sound off' : 'sound on'}
            </button>
            <p className="voxel-hint">Esc to step out · mine · right-click to place · C for {thirdPerson ? 'first' : 'third'} person</p>
          </div>

          {interaction && (
            <div className="voxel-prompt"><kbd>E</kbd> {promptFor(interaction)}</div>
          )}

          <div className="voxel-hotbar">
            {Array.from({ length: SLOT_COUNT }, (_, i) => {
              const slot = inventory[i];
              return (
                <button key={i} type="button" className="voxel-slot"
                  data-active={selected === i} onClick={() => setSelected(i)}>
                  <span className="voxel-slot-key">{i + 1}</span>
                  {slot && <img className="voxel-icon" src={blockIconUrl(slot.block)} alt="" aria-hidden />}
                  {slot && slot.count > 1 && <span className="voxel-count">{slot.count}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {sleeping && (
        <div className="voxel-sleep"><p>Sleeping…</p></div>
      )}

      {panel === '__chest' && (
        <div className="voxel-modal">
          <div className="voxel-modal-inner voxel-modal-wide">
            <p className="t-heading-md text-bone">The chest</p>
            <p className="voxel-body">{profile.positioning}</p>
            <div className="voxel-chest-grid">
              <a className="voxel-link" href={profile.resume} target="_blank" rel="noreferrer">Résumé (PDF)</a>
              <a className="voxel-link" href={profile.github} target="_blank" rel="noreferrer">GitHub</a>
              <a className="voxel-link" href={profile.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
              <a className="voxel-link" href={`mailto:${profile.email}`}>{profile.email}</a>
            </div>
            <p className="voxel-hint">{profile.availability}</p>
            <button type="button" className="voxel-hint underline underline-offset-4"
              onClick={() => { setPanel(null); controllerRef.current?.controls.lock(); }}>
              Close (E)
            </button>
          </div>
        </div>
      )}

      {panel === '__map' && (
        <div className="voxel-modal">
          <div className="voxel-modal-inner voxel-modal-wide">
            <p className="t-heading-md text-bone">My journey</p>
            <ol className="voxel-journey">
              {roles.map((r) => (
                <li key={r.slug}>
                  <span className="voxel-journey-when">{r.period}</span>
                  <span className="voxel-journey-what">
                    <strong>{r.title}</strong> · {r.company}
                    <em>{r.summary}</em>
                  </span>
                </li>
              ))}
            </ol>
            <button type="button" className="voxel-hint underline underline-offset-4"
              onClick={() => { setPanel(null); controllerRef.current?.controls.lock(); }}>
              Close (E)
            </button>
          </div>
        </div>
      )}

      {openProject && (
        <div className="voxel-modal">
          <div className="voxel-modal-inner voxel-modal-wide voxel-project-modal">
            <p className="t-heading-md text-bone">{openProject.name}</p>
            <p className="voxel-project-meta">{openProject.year} · {openProject.context}</p>
            <div className="voxel-project-scroll" data-lenis-prevent onWheel={(e) => e.stopPropagation()}>
              <p className="voxel-body voxel-project-blurb">{openProject.blurb}</p>
              {projectParas.map(([head, text], i) => (
                <div key={i} className="voxel-project-para">
                  {head && <p className="voxel-project-head">{head}</p>}
                  <p className="voxel-body">{text}</p>
                </div>
              ))}
              {!!openProject.tech?.length && (
                <p className="voxel-project-tech">{openProject.tech.join(' · ')}</p>
              )}
              {!!openProject.links?.length && (
                <div className="voxel-project-links">
                  {openProject.links.map((l) => (
                    <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="voxel-link-inline">
                      {l.label} ↗
                    </a>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="voxel-hint underline underline-offset-4"
              onClick={() => { setPanel(null); controllerRef.current?.controls.lock(); }}>
              Close (E)
            </button>
          </div>
        </div>
      )}

      {!locked && !dead && !panel && !sleeping && !npcOpen && ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[18px] bg-black/55 text-center">
          <p className="t-heading-md text-bone">The island</p>
          <p className="voxel-hint max-w-[48ch]">
            WASD to walk · mouse to look · space to jump · shift to sprint · hold left-click to mine ·
            right-click to place · 1–9 or scroll to pick a slot · C to switch view · T to toggle your torch · E to read a board, open
            the chest, check the map, talk to {NPC_NAME}, or sleep · pull the cord for night. Nothing you dig
            or build is saved.
          </p>
          <button type="button" onClick={() => { audioRef.current?.start(); controllerRef.current?.controls.lock(); }}
            className="rounded-full bg-iris px-[22px] py-[11px] text-[14px] text-white transition-opacity hover:opacity-85">
            Click to enter
          </button>
          <Link to="/" className="voxel-hint underline underline-offset-4 opacity-70 hover:opacity-100">
            ← back to the portfolio
          </Link>
        </div>
      )}

      {dead && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[14px] bg-black/75 text-center">
          <p className="t-heading-md text-bone">Knocked out</p>
          <p className="voxel-hint">The night got you. You wake up back at the bed.</p>
          <button type="button" onClick={() => { respawn(); controllerRef.current?.controls.lock(); }}
            className="rounded-full bg-iris px-[22px] py-[11px] text-[14px] text-white transition-opacity hover:opacity-85">
            Wake up
          </button>
        </div>
      )}

      <nav className="sr-only" aria-label="Island contents">
        <h1>The island — a voxel walk through the work</h1>
        <p>{profile.name} — {profile.title}.</p>
        <ul>
          {boardEntries.map((b) => <li key={b.slug}>{b.name}: {b.blurb}</li>)}
        </ul>
      </nav>
    </div>
  );
}