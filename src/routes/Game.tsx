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
import {
  spawnMob, updateMob, hitMob, spawnArrow, updateArrow,
  type Mob, type MobKind, type Arrow,
} from '@/components/game/mobs';
import { spawnDrop, updateDrop, type Drop } from '@/components/game/drops.ts';
import { raycastVoxel } from '@/components/game/raycastVoxel';
import {
  RECIPES, SLOT_COUNT, emptyInventory, addItem, takeFromSlot, canCraft, craft,
  type Inventory,
} from '@/components/game/inventory';
import { useProfile, useProjects } from '@/lib/useContent';

const MAX_HP = 10;
const REACH = 4.8;
const BREAK_TIME = 0.34;
const INTERACT_R = 3.2;

/** What the player is currently close enough to press E on. */
type Interaction =
  | { kind: 'bed' }
  | { kind: 'craft' }
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
  const hpRef = useRef(MAX_HP);
  const flashRef = useRef<HTMLDivElement>(null);
  const invRef = useRef<Inventory>(emptyInventory());
  const selectedRef = useRef(0);
  const panelRef = useRef<string | null>(null);
  const interactRef = useRef<Interaction>(null);

  const profile = useProfile();
  const { projects } = useProjects();

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

  useEffect(() => { dayNightRef.current?.setNight(night); }, [night]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { panelRef.current = panel; }, [panel]);
  useEffect(() => { interactRef.current = interaction; }, [interaction]);

  const boardEntries = useMemo(
    () => projects.map((p) => ({ slug: p.slug, name: p.name, blurb: p.blurb })),
    [projects],
  );
  const openProject = useMemo(
    () => projects.find((p) => p.slug === panel) ?? null,
    [panel, projects],
  );

  const takeDamage = useCallback((dmg: number) => {
    hpRef.current = Math.max(0, hpRef.current - dmg);
    setHp(hpRef.current);
    const flash = flashRef.current;
    if (flash) {
      flash.style.opacity = '1';
      window.setTimeout(() => { if (flash) flash.style.opacity = '0'; }, 160);
    }
    if (hpRef.current <= 0) setDead(true);
  }, []);

  const respawn = useCallback(() => {
    hpRef.current = MAX_HP;
    setHp(MAX_HP);
    setDead(false);
    setNight(false);
    const bed = worldRef.current?.house.bedPos;
    if (bed && controllerRef.current) controllerRef.current.teleport(bed.x, bed.z + 2);
  }, []);

  /** Returns whether the item fitted, so a full inventory leaves drops on the floor. */
  const collect = useCallback((block: Block) => {
    const next = addItem(invRef.current, block, 1);
    if (next === invRef.current) return false;
    invRef.current = next;
    setInventory(next);
    return true;
  }, []);

  const craftRecipe = useCallback((id: string) => {
    const recipe = RECIPES.find((r) => r.id === id);
    if (!recipe) return;
    const next = craft(invRef.current, recipe);
    if (next === invRef.current) return;
    invRef.current = next;
    setInventory(next);
  }, []);

  /** Sleep: skip the night, and top the player up, like a bed should. */
  const sleep = useCallback(() => {
    setSleeping(true);
    controllerRef.current?.controls.unlock();
    window.setTimeout(() => {
      setNight(false);
      hpRef.current = MAX_HP;
      setHp(MAX_HP);
      setSleeping(false);
      controllerRef.current?.controls.lock();
    }, 1500);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(72, el.clientWidth / el.clientHeight, 0.1, 220);

    const world = buildWorld(projects, profile);
    worldRef.current = world;
    scene.add(world.group);

    const dayNight = new DayNight(scene);
    dayNightRef.current = dayNight;
    dayNight.setNight(false);

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
    const spawnRing = SIZE / 2 - 10;
    const kinds: MobKind[] = ['zombie', 'zombie', 'skeleton', 'zombie', 'skeleton', 'zombie'];
    kinds.forEach((kind, i) => {
      const a = (i / kinds.length) * Math.PI * 2 + 0.4;
      const x = SIZE / 2 + Math.cos(a) * spawnRing;
      const z = SIZE / 2 + Math.sin(a) * spawnRing;
      const mob = spawnMob(kind, x, z, world.heightAt(x, z) + 1);
      mob.group.visible = false;
      mobs.push(mob);
      scene.add(mob.group);
    });
    ([[14, 12], [30, 14], [12, 30], [30, 32], [22, 34]] as const).forEach(([x, z]) => {
      const mob = spawnMob('sheep', x, z, world.heightAt(x, z) + 1);
      mobs.push(mob);
      scene.add(mob.group);
    });
    mobsRef.current = mobs;
    arrowsRef.current = [];
    dropsRef.current = [];

    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);

    const forward2 = new THREE.Vector3();
    const dir2 = new THREE.Vector3();

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
        if (mob.dead || !mob.group.visible || mob.kind === 'sheep') continue;
        if (camera.position.distanceTo(mob.pos) > 2.8) continue;
        const toMob = mob.pos.clone().sub(camera.position).normalize();
        if (forward2.dot(toMob) > 0.6) {
          const kd = new THREE.Vector2(mob.pos.x - camera.position.x, mob.pos.z - camera.position.z).normalize();
          hitMob(mob, 3, kd);
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
      if (e.code === 'Escape') controller.controls.unlock();
      const num = Number(e.code.replace('Digit', ''));
      if (!Number.isNaN(num) && num >= 1 && num <= SLOT_COUNT) setSelected(num - 1);

      if (e.code === 'KeyE') {
        // One context-sensitive key, resolved against whatever is nearest,
        // rather than a separate binding per piece of furniture.
        if (panelRef.current) { setPanel(null); controller.controls.lock(); return; }
        const it = interactRef.current;
        if (!it || !controller.controls.isLocked) return;
        if (it.kind === 'board') { setPanel(it.slug); controller.controls.unlock(); }
        else if (it.kind === 'craft') { setPanel('__craft'); controller.controls.unlock(); }
        else if (it.kind === 'bed') sleep();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    let raf = 0;
    let last = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      dayNight.update(dt);
      const paused = !controller.controls.isLocked;
      if (!paused) controller.update(dt);

      // Nearest interactable, checked against the player rather than the
      // camera so looking away doesn't cancel a prompt you're standing on.
      const feet = camera.position;
      let found: Interaction = null;
      let bestD = INTERACT_R;
      const bedD = feet.distanceTo(world.house.bedPos);
      if (bedD < bestD) { bestD = bedD; found = { kind: 'bed' }; }
      const craftD = feet.distanceTo(world.craftingTablePos);
      if (craftD < bestD) { bestD = craftD; found = { kind: 'craft' }; }
      for (const b of world.boards) {
        const d = feet.distanceTo(b.position);
        if (d < bestD) {
          const proj = projects.find((p) => p.slug === b.slug);
          bestD = d;
          found = { kind: 'board', slug: b.slug, name: proj?.name ?? b.slug };
        }
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
      for (const mob of mobsRef.current) {
        if (mob.kind !== 'sheep') mob.group.visible = dayNight.factor > 0.15 || mob.dead;
        if (!mob.group.visible) continue;
        updateMob(
          mob, dt, camera.position, isNight && !paused, world.heightAt,
          (dmg) => takeDamage(dmg),
          (from, d) => {
            const arrow = spawnArrow(from, d);
            arrowsRef.current.push(arrow);
            scene.add(arrow.mesh);
          },
        );
      }

      arrowsRef.current = arrowsRef.current.filter((arrow) => {
        const done = updateArrow(arrow, dt, camera.position, (dmg) => takeDamage(dmg));
        if (done) scene.remove(arrow.mesh);
        return !done;
      });

      dropsRef.current = dropsRef.current.filter((drop) => {
        const done = updateDrop(drop, dt, camera.position, world.isSolidAt, collect);
        if (done) { scene.remove(drop.mesh); drop.mesh.geometry.dispose(); }
        return !done;
      });

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    setReady(true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      controller.controls.removeEventListener('lock', onLock);
      controller.controls.removeEventListener('unlock', onUnlock);
      controller.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hearts = Array.from({ length: 5 }, (_, i) => (hp > i * 2 + 1 ? 'full' : hp > i * 2 ? 'half' : 'empty'));
  const promptFor = (it: Interaction) =>
    it?.kind === 'bed' ? 'Sleep' : it?.kind === 'craft' ? 'Crafting table' : it ? `Read “${it.name}”` : '';

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
            <p className="voxel-hint">Esc to step out · hold left-click to mine · right-click to place</p>
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

      {panel === '__craft' && (
        <div className="voxel-modal">
          <div className="voxel-modal-inner">
            <p className="t-heading-md text-bone">Crafting table</p>
            <div className="flex flex-col gap-[10px]">
              {RECIPES.map((r) => {
                const ok = canCraft(inventory, r);
                return (
                  <button key={r.id} type="button" disabled={!ok}
                    onClick={() => craftRecipe(r.id)} className="voxel-recipe" data-ok={ok}>
                    <img className="voxel-icon-sm" src={blockIconUrl(r.output.block)} alt="" aria-hidden />
                    <span>{r.label}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="voxel-hint underline underline-offset-4"
              onClick={() => { setPanel(null); controllerRef.current?.controls.lock(); }}>
              Close (E)
            </button>
          </div>
        </div>
      )}

      {openProject && (
        <div className="voxel-modal">
          <div className="voxel-modal-inner voxel-modal-wide">
            <p className="t-heading-md text-bone">{openProject.name}</p>
            <p className="voxel-body">{openProject.blurb}</p>
            <button type="button" className="voxel-hint underline underline-offset-4"
              onClick={() => { setPanel(null); controllerRef.current?.controls.lock(); }}>
              Close (E)
            </button>
          </div>
        </div>
      )}

      {!locked && !dead && !panel && !sleeping && ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[18px] bg-black/55 text-center">
          <p className="t-heading-md text-bone">The island</p>
          <p className="voxel-hint max-w-[48ch]">
            WASD to walk · mouse to look · space to jump · shift to sprint · hold left-click to mine ·
            right-click to place · 1–9 or scroll to pick a slot · E to read a board, craft, or sleep ·
            pull the cord for night. Nothing you dig or build is saved.
          </p>
          <button type="button" onClick={() => controllerRef.current?.controls.lock()}
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