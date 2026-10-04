// src/components/graph/GraphJourney.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { buildGraph, type GraphNode, type NodeKind } from '@/lib/graph';
import { usePalette, useTheme } from '@/lib/useTheme';
import { DustCloud } from '@/components/graph/DustCloud';
import { BlackHoleHeroSection } from '@/components/graph/BlackHole';
import { OUTER, starFieldShape, type Vec3 } from '@/components/graph/shapes';
import {
  GALAXY_NORMAL,
  butterflyFigure,
  eyeFigure,
  galaxyFigures,
  galaxyNodeFigures,
  orionFigures,
  vortexFigure,
  type Figure,
} from '@/components/graph/cosmos';
import { useVisible } from '@/components/core/WhenVisible';
import { GraphReadout } from '@/components/graph/GraphReadout';
import { AskChat } from '@/components/ask/AskChat';
import { buildMatcher } from '@/components/archive/cite';
import { Compare } from '@/components/studio/Compare';
import { SplitFlap } from '@/components/studio/SplitFlap';
import { prefillAsk } from '@/lib/ask';
// `metrics` is not part of the admin tree, so it stays compiled. `profile` is,
// so it comes from the store — see useProfile.
import { metrics } from '@/lib/content';
import type { Project } from '@/lib/content';
import { useAchievements, useProfile, useRoles } from '@/lib/useContent';

/**
 * ============================================================================
 *  TUNE ME — "Ask about me" section, knowledge-graph size
 * ============================================================================
 * How big the sphere (and the moon/sun node at its centre) renders next to
 * the Ask AI card, as a percentage of the size it originally shipped at.
 *
 *   • Bigger graph  → INCREASE this number  (e.g. 150 = 50% bigger).
 *   • Smaller graph → DECREASE this number  (e.g. 70 = 30% smaller).
 *   • 100 = the original framing, before this was made adjustable.
 *
 * Under the hood this moves the camera closer or further away (see `ZOOM.
 * heroLeft` below, which is derived from this number), so the graph stays
 * perfectly round and in focus at any value — no other number needs to
 * change. Sensible range is roughly 60–170: much bigger and the sphere starts
 * cropping against the card/edge of the screen, much smaller and it shrinks
 * to a speck. The transition in and out of this size (from Hero, into
 * Metrics) is already eased over the scroll, so changing this number alone
 * keeps that transition smooth — nothing else needs adjusting for that.
 */
const ASK_AI_GRAPH_SIZE_PERCENT = 210;

/**
 * How long, in milliseconds, the "cited nodes" highlight takes to fade in
 * once an Ask AI answer finishes. Snapping it on instantly is what read as
 * buggy — a handful of dots suddenly jumping in size and brightness the
 * instant the last token arrives. Raise this for a slower, more deliberate
 * reveal; lower it (or set to 0) to go back to an instant switch.
 */
const CITE_FADE_MS = 900;

/**
 * ============================================================================
 *  TUNE ME — Graph size, laptop vs. monitor
 * ============================================================================
 * The entire scroll sequence (galaxy, stardust, chart, nebula, black hole — every keyframe)
 * used to render at a fixed number of *pixels* no matter how tall or short
 * the actual browser window was: a 900px-tall laptop window and a 1440px-tall
 * external-monitor window got the identical-size sculpture, because the old
 * framing math held world-units-per-pixel constant on purpose (see the
 * WORLD_ACROSS comment below for why that was once the right call). The
 * side effect is that the same graph reads as generously sized on a small
 * laptop and looks small and adrift in the middle of a big monitor, since it
 * never claims any more of the extra screen it's been given.
 *
 * This section makes it genuinely responsive instead: the graph's on-screen
 * size now scales with the visitor's actual window height, bounded so it
 * never gets silly at either end.
 *
 *   • VIEWPORT_REFERENCE_HEIGHT — the window height (in CSS px) the sequence
 *     was originally tuned at. At exactly this height, nothing changes from
 *     before.
 *   • SCREEN_SCALE_RANGE — how far the graph is allowed to grow (second
 *     number) on tall monitor windows, or shrink (first number) on short
 *     laptop windows, as a multiplier on its reference size.
 *       - Want a BIGGER graph on big monitors  → RAISE the second number.
 *       - Want a SMALLER graph on small laptops → LOWER the first number.
 *       - Set both to 1 to turn this off and go back to the old fixed-pixel
 *         behaviour.
 */
const VIEWPORT_REFERENCE_HEIGHT = 900;
const SCREEN_SCALE_RANGE: [number, number] = [0.82, 1.3];

/**
 * The whole opening act, one graph.
 *
 * Second version. The first version got the basic idea right — one graph,
 * mounted once, pinned and morphing through a shape sequence while Hero / Ask
 * AI / Metrics / Proof took turns being shown beside it — but got the
 * mechanism wrong. It made all four of those absolutely positioned on top of
 * each other in the same box and crossfaded between them by hand. Two
 * problems followed directly from that: content that should scroll past just
 * faded in place instead, and — because "faded out" still means "in the DOM,
 * stacked on top of the next thing" for a brief window — Hero's name bled
 * through onto the Ask AI card while they crossed over.
 *
 * This version is the standard pinned-sidebar layout instead: a two-column
 * grid, the graph alone in a `position: sticky` right column, and Hero / Ask
 * AI / Metrics / Proof as ordinary, separate, normal-flow blocks in the left
 * column, stacked one after another. They scroll like any other page content
 * — because they *are* any other page content now, nothing fades, and by the
 * time one is centred in the viewport the previous one has already scrolled
 * fully past, so there's nothing to bleed through. The only actor with
 * anything special going on is the graph.
 *
 * Sequence, in order (see KEYS for the exact keyframes, cosmos.ts for the figures):
 *   Galaxy        Hero        — the knowledge graph as a spiral galaxy, nodes clickable
 *   Galaxy Dive   Ask         — same galaxy, turned, camera closer, beside the Ask pill
 *   Stardust      Numbers/Proof — the arms unwind into a quiet cloud behind the copy
 *   Constellation Connected   — the graph as a star chart; lines draw themselves in
 *   Eye           One Mind    — a bipolar nebula seen end-on
 *   Butterfly     Other Lens  — the same nebula a quarter turn round
 *   Black Hole    Signature   — collapses into a black hole (an eclipse on the light theme)
 *
 * Node count is never touched by any of this — every keyframe is a
 * repositioning of the same fixed set of points, which is what keeps the
 * on-screen density roughly constant instead of dipping to near-empty
 * between beats.
 *
 * ForceGraph3D is used purely as a sprite renderer — every node pinned every
 * frame, physics fully disabled, and d3AlphaDecay / d3AlphaMin /
 * d3VelocityDecay set as props rather than instance methods (calling them on
 * the ref throws on this project's resolved three-forcegraph version).
 *
 * Below `lg`: none of the pinning. A two-column layout doesn't mean anything
 * on a phone-width screen, so it's Hero, then a plain non-scroll-driven
 * sphere, then Ask AI, Metrics and Proof, stacked and scrolled normally.
 */

type PNode = {
  id: string;
  kind: NodeKind;
  /** Sprite diameter while the field is still a readable graph. */
  dot: number;
  /** Sprite diameter once it is a sculpture — one of the dust sizes. See DUST_MATCH. */
  sculptDot: number;
  color: string;
};

/** Unit vector from the origin toward the fixed camera — see the camera effect below. */
const CAM = new THREE.Vector3(0.18, 0.1, 1).normalize();

const DOT: Record<NodeKind, number> = {
  person: 20, // deliberately larger than everything — queen-bee node.
  role: 9,
  project: 6.6,
  domain: 4.8,
  achievement: 4.6,
  tech: 3.2,
};
const DEGREE_BONUS: Record<NodeKind, number> = {
  person: 0,
  role: 0.04,
  project: 0.28,
  domain: 0.16,
  achievement: 0,
  tech: 0.34,
};

/*
 * The sequence. One keyframe per screenful of scroll, so each figure is fully
 * formed exactly when its own heading is centred.
 *
 *   galaxy     0  Hero        — the knowledge graph as a spiral galaxy, Core at its heart
 *   core       1  Ask         — the camera falls into the galaxy's heart: the nodes
 *                               gather into the Globe round the sun / moon, close up
 *   orionWide  2  Numbers     — an emission nebula opened out, quiet behind the copy
 *   orionHold  3  Proof       — the same, held
 *   orion      4  Connected   — the nebula gathers in
 *   eye        5  One Mind    — the Helix, the Core as its central star
 *   butterfly  6  Other Lens  — two wings pinched at a white-hot waist
 *   vortex     7  Signature   — a nebula wound into a whirlpool
 *   rest       8  Rest        — the whirlpool holds where it is while the
 *                               ray-traced black hole (BlackHole.tsx) scrolls
 *                               up over it as its own full-bleed screen
 *
 * Node count never changes. Every keyframe is a repositioning of the same
 * points, so every transition is a flow rather than a cut.
 */
const KEYS = [
  'galaxy',
  'core',
  'orionWide',
  'orionHold',
  'orion',
  'eye',
  'butterfly',
  'vortex',
  'rest',
] as const;
type Key = (typeof KEYS)[number];
const SEG_COUNT = KEYS.length - 1;

/**
 * Sideways push per keyframe, as a fraction of the visible width. On the two
 * opening screens it is deliberately past any legal value — "as far as it
 * will go" — and EDGE decides where that is.
 */
const PAN: Partial<Record<Key, number>> = {
  galaxy: 0.5,
  core: -0.5,
};

/** How close to the screen edge the figure may sit on the opening screens, in OUTER radii. */
const EDGE: Partial<Record<Key, number>> = {
  galaxy: 2.0,
  // Close in on the galaxy's heart, parked left of the Ask pill.
  core: 0.5,
};

/** Where the figure is docked on each screen: opposite the words. */
const DOCK_POS: number[] = [
  +0.3, // 0 Hero
  -0.3, // 1 Ask
  0, //    2 Numbers
  0, //    3 Proof
  -0.25, // 4 Connected  — heading right
  +0.26, // 5 One Mind   — heading left
  -0.3, // 6 Other Lens  — heading right
  +0.24, // 7 Signature  — heading left
  +0.24, // 8 Rest       — held: the black hole screen covers it
];

/** Fraction of each screen at either end during which the dock holds still. */
const DOCK_HOLD = 0.3;

/** Roll about the view axis. The Butterfly on its diagonal; the vortex rolled to match the black hole. */
const TILT: Partial<Record<Key, number>> = {
  butterfly: 0.95,
  vortex: -0.35,
  rest: -0.35,
};

/**
 * Camera distance per keyframe, as a multiple of the base framing.
 * `core` is derived from ASK_AI_GRAPH_SIZE_PERCENT at the top of the file.
 */
const ZOOM: Partial<Record<Key, number>> = {
  core: 0.55 * (100 / ASK_AI_GRAPH_SIZE_PERCENT),
  orion: 0.95,
  eye: 0.95,
  butterfly: 1.0,
  vortex: 0.95,
  rest: 0.95,
};

/** Depth cue per keyframe: `half` is the figure's reach along the view axis, `back` the far-side alpha. */
const DEPTH: Record<Key, { half: number; back: number }> = {
  galaxy: { half: OUTER * 1.3, back: 0.55 },
  core: { half: OUTER, back: 0.62 },
  orionWide: { half: OUTER * 2.0, back: 0.75 },
  orionHold: { half: OUTER * 2.0, back: 0.75 },
  orion: { half: OUTER * 0.9, back: 0.6 },
  eye: { half: OUTER * 0.6, back: 0.7 },
  butterfly: { half: OUTER * 0.8, back: 0.6 },
  vortex: { half: OUTER * 1.2, back: 0.55 },
  rest: { half: OUTER * 1.2, back: 0.55 },
};

/**
 * How strongly the dust shows. The galaxy is real from the first frame. In
 * the Globe the camera is inside the galaxy's heart, so the dust is thinned
 * right back and the Core and its sphere of topics carry the screen; behind
 * the numbers it is a quiet cloud; at Rest it drains to nothing as the
 * black hole fades in.
 */
const DUST_A: Record<Key, number> = {
  galaxy: 0.8,
  core: 0.24,
  orionWide: 0.7,
  orionHold: 0.7,
  orion: 1,
  eye: 1,
  butterfly: 1,
  vortex: 1,
  rest: 1,
};

/** 1 = nodes are a readable graph (own sizes and colours, clickable); 0 = they dissolve into the figure. */
const NODE_G: Record<Key, number> = {
  galaxy: 1,
  core: 1,
  orionWide: 0,
  orionHold: 0,
  orion: 0,
  eye: 0,
  butterfly: 0,
  vortex: 0,
  rest: 0,
};
const INTERACTIVE_AT = 0.75;

/** The Core (sun / moon). In the Eye it is the dying star at the centre; it is swallowed at the end. */
const CORE_A: Record<Key, number> = {
  galaxy: 1,
  core: 1,
  orionWide: 1,
  orionHold: 1,
  orion: 1,
  eye: 1,
  butterfly: 0.7,
  vortex: 0.6,
  rest: 0.6,
};

/**
 * Node size relative to its graph size. Close up inside the galaxy the nodes
 * would otherwise read as big blobs; they are brought down to sit in the arms.
 */
const NODE_S: Record<Key, number> = {
  galaxy: 1,
  core: 0.62,
  orionWide: 1,
  orionHold: 1,
  orion: 1,
  eye: 1,
  butterfly: 1,
  vortex: 1,
  rest: 1,
};

/** Size of the Core relative to its graph size: large where it is the subject — the heart of the Globe. */
const CORE_S: Record<Key, number> = {
  galaxy: 1.3,
  core: 2.6,
  orionWide: 1,
  orionHold: 1,
  orion: 1,
  eye: 0.8,
  butterfly: 0.7,
  vortex: 0.7,
  rest: 0.7,
};

/** No yaw: every figure is authored facing the camera. */
const YAW_DELTA: number[] = new Array(SEG_COUNT).fill(0);

/**
 * Segments that interpolate along an arc about an axis instead of a straight
 * line, so a turning figure keeps turning instead of cutting across its own
 * middle. `turns` adds whole extra revolutions (whole, so the end is exact).
 */
const SWIRL: Partial<Record<number, { axis: Vec3; turns: number }>> = {
  0: { axis: GALAXY_NORMAL, turns: 0 },
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (t: number) => t * t * (3 - 2 * t);
/** Fast start, slow finish — used for the citation highlight's fade-in. */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * A star, as an alpha profile.
 *
 * The old texture was opaque out to 40% of its radius and then faded — which
 * is a *bubble*: a flat disc with a soft edge, and at a hundred of them on a
 * pale page it read exactly like one, a field of blue soap. A star does not
 * look like that. A star is a point the eye cannot resolve, so what you
 * actually see is a tiny blown-out core, an Airy disc around it, and a long
 * faint halo that falls away for a surprisingly long distance.
 *
 * That is what this draws, per pixel rather than through gradient stops,
 * because the shape that matters is the *rate* the falloff changes at and a
 * handful of stops cannot describe it. Three terms: core, glow, halo. Plus
 * four faint diffraction spikes, which are strictly an artefact of camera
 * optics rather than anything a star does — and which are, for that exact
 * reason, the single strongest "this is a star" signal there is.
 *
 * The core is kept at 22% of the radius rather than the 5% a real point
 * source would give. One texture serves both a 20-unit person node and a
 * 4-unit mote, and a core tuned to look right on the former is sub-pixel on
 * the latter: the dust would simply stop existing. 22% is the compromise that
 * keeps the smallest particle a visible point while leaving the largest
 * looking like a star instead of a disc — and it is why the dust buckets in
 * DustCloud are set roughly half again as wide as the old ones, since the
 * quad now has to carry a halo as well as the point at the middle of it.
 */
function makeStarTexture() {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(s, s);
    const mid = (s - 1) / 2;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (x - mid) / mid;
        const dy = (y - mid) / mid;
        const r = Math.hypot(dx, dy);
        let a = 0;
        if (r < 1) {
          const core = Math.exp(-((r / 0.22) ** 2));
          const glow = 0.46 * Math.exp(-((r / 0.46) ** 2));
          const halo = 0.1 * (1 - r) ** 3;
          // Spikes run along the sprite's own axes, and a sprite always faces
          // the camera, so they stay screen-aligned however the piece turns.
          const axis = Math.min(Math.abs(dx), Math.abs(dy));
          const spike = 0.3 * Math.exp(-((axis / 0.022) ** 2)) * (1 - r) ** 2;
          a = Math.min(1, core + glow + halo + spike);
        }
        const i = (y * s + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = 255;
        image.data[i + 2] = 255;
        image.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Value noise on an integer lattice, smoothly interpolated. Two hashes and a
 * pair of Hermite blends per sample.
 *
 * This exists because the sun and the moon needed a *surface*, and a surface
 * is texture at several scales at once. Everything else drawn in this file is
 * radially symmetric — a function of distance from the middle and nothing
 * else — which is correct for a point source and is exactly why the two
 * resolved bodies looked like stickers: perfectly smooth discs of flat colour
 * with a glow around them. No amount of tuning the glow fixes a disc with
 * nothing on it.
 */
function lattice(a: number, b: number) {
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise2(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = lattice(xi, yi);
  const b = lattice(xi + 1, yi);
  const c = lattice(xi, yi + 1);
  const d = lattice(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal sum of the above. Four octaves is plenty at 128px. */
function fbm(x: number, y: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * f, y * f);
    amp *= 0.5;
    f *= 2.07;
  }
  return sum;
}

/**
 * The one body in the field that is close enough to have a disc: the person
 * node, drawn as the sun on the light theme and the moon on the dark one.
 *
 * Everything else in this scene is a point source. This is not — it is a
 * resolved edge with something around it, which is the whole difference
 * between "the brightest star" and "the thing we are orbiting". Both share a
 * hard-edged disc; what separates them is what happens outside it. The sun
 * gets a corona and four long rays. The moon gets neither: airless, no
 * atmosphere to scatter through, so it is a clean disc with the faintest
 * possible bloom and nothing radiating off it.
 *
 * Second pass, and it is about what happens *inside* the disc. It used to be
 * a flat fill, which is survivable at twenty pixels across and is not
 * survivable at the size the body reaches beside the Ask AI card, where it is
 * the largest object on the screen and about two hundred pixels wide. At that
 * size a uniform circle does not read as a body at all; it reads as a dot
 * that has been scaled up, because the one cue that says "sphere" rather than
 * "circle" — detail that compresses as it approaches the limb — is missing.
 *
 * So both now carry a surface, and the two are built from opposite physics:
 *
 *   moon — maria first, as a wide low-frequency threshold, because the dark
 *          seas are the single most recognisable thing about a full moon and
 *          the eye finds them before it finds anything else. Then regolith
 *          mottle over the whole face, then a fine speckle of craters, then
 *          the beginnings of a ray system thrown out of one bright crater in
 *          the southern half. Limb darkening is deliberately slight: a full
 *          moon is lit from behind the observer, so it is famously *flat* at
 *          the edges, and pushing a strong terminator onto it is the classic
 *          way to make it look like a billiard ball.
 *
 *   sun  — the reverse. Granulation at high frequency (convection cells, and
 *          the reason the photosphere is never smooth), supergranulation
 *          under it as a slower swell, two spots with penumbrae, and then
 *          heavy limb darkening — down to a bit over half brightness at the
 *          edge, which is roughly true and is what makes the disc read as a
 *          ball of gas rather than a hole cut in the page.
 *
 * The detail is written into RGB and the silhouette stays in alpha. That
 * distinction matters: the sprite is tinted by the node colour, so baking the
 * markings into alpha would make the maria *transparent* — the page showing
 * through the moon — rather than dark. Multiplying the tint instead darkens
 * them on black and on parchment alike, and leaves the bloom, halo and rays
 * outside the disc at full tint where they belong.
 *
 * `su`/`sv` are the pixel remapped onto the front of a sphere before being
 * handed to the noise, so features crowd toward the limb the way they do on
 * anything round. It is the cheapest possible sphere-mapping and it is the
 * entire reason this reads as a body rather than as a textured coin.
 */
function makeOrbTexture(rayed: boolean) {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(s, s);
    const mid = (s - 1) / 2;
    // A disc with a one-pixel-ish soft edge — resolved, not a point.
    const edge = rayed ? 0.24 : 0.27;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (x - mid) / mid;
        const dy = (y - mid) / mid;
        const r = Math.hypot(dx, dy);
        let a = 0;
        let shade = 1;
        if (r < 1) {
          const disc = 1 - smoothstep(edge - 0.03, edge + 0.03, r);
          const bloom = (rayed ? 0.34 : 0.16) * Math.exp(-((r / (rayed ? 0.42 : 0.34)) ** 2));
          const halo = (rayed ? 0.13 : 0.05) * (1 - r) ** 2.4;
          const axis = Math.min(Math.abs(dx), Math.abs(dy));
          const rays = rayed ? 0.4 * Math.exp(-((axis / 0.03) ** 2)) * (1 - r) ** 1.4 : 0;
          a = Math.min(1, disc + bloom + halo + rays);

          if (disc > 0.001) {
            // Project the pixel onto the front of a unit sphere. `nz` is the
            // cosine of the angle off the sub-observer point, so it is both
            // the crowding factor for the texture and the lighting term.
            const rr = Math.min(1, r / edge);
            const nz = Math.sqrt(Math.max(0, 1 - rr * rr));
            const crowd = 0.42 + 0.58 * nz;
            const su = dx / edge / crowd;
            const sv = dy / edge / crowd;

            if (rayed) {
              // Photosphere: fine convection cells over a slower swell.
              const gran = fbm(su * 13 + 4.3, sv * 13 - 2.1, 4);
              const superGran = fbm(su * 3.6 - 2.2, sv * 3.6 + 5.5, 3);
              shade = 0.92 + 0.3 * (gran - 0.5) - 0.1 * smoothstep(0.54, 0.86, superGran);
              /*
               * A spot *group*, not two spots.
               *
               * The first pass had one large spot and one small one placed
               * symmetrically either side of the middle, and the result was a
               * face. Two dark circles roughly level with each other on a
               * bright disc is the strongest pareidolia trigger there is, and
               * once it is seen on the largest object on the screen it cannot
               * be unseen. Real spots do not arrive in pairs; they arrive in
               * groups, at one active latitude, strung out along it. Three of
               * them at decreasing size on a diagonal, well inside the limb so
               * they never fight with the edge.
               */
              const spot = (cx: number, cy: number, rad: number) =>
                1 - smoothstep(rad * 0.5, rad, Math.hypot(su - cx, sv - cy));
              shade -=
                0.42 * spot(-0.36, -0.2, 0.17) +
                0.3 * spot(0.16, 0.3, 0.12) +
                0.22 * spot(0.31, 0.21, 0.08);
              // Limb darkening, and a lot of it. This is the sphere cue.
              shade *= 0.56 + 0.44 * nz ** 0.55;
            } else {
              // Maria: a wide threshold on low-frequency noise, so the dark
              // regions have coastlines rather than soft gradients.
              const seas = smoothstep(0.44, 0.74, fbm(su * 2.0 + 3.1, sv * 2.0 - 1.7, 4));
              shade = 1 - 0.32 * seas;
              // Regolith, then craters, then one bright ray system.
              shade -= 0.11 * (fbm(su * 7.5 - 5.0, sv * 7.5 + 1.4, 3) - 0.42);
              shade += 0.13 * (fbm(su * 17 + 9.0, sv * 17 - 4.0, 2) - 0.5);
              const rayLen = Math.hypot(su + 0.16, sv - 0.44);
              const rayAngle = Math.atan2(sv - 0.44, su + 0.16);
              shade +=
                0.1 *
                Math.max(0, 1 - rayLen * 1.1) *
                smoothstep(0.55, 0.95, 0.5 + 0.5 * Math.cos(rayAngle * 9));
              // Barely any. A full moon is lit from behind the observer and
              // is genuinely flat at the edges.
              shade *= 0.86 + 0.14 * nz;
            }
            // Blend the markings out through the soft edge, so the rim never
            // shows a stepped seam where the surface stops.
            shade = 1 + (shade - 1) * disc;
          }
        }
        const v = Math.round(Math.max(0.1, Math.min(1, shade)) * 255);
        const i = (y * s + x) * 4;
        image.data[i] = v;
        image.data[i + 1] = v;
        image.data[i + 2] = v;
        image.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** Hermite step, for the orb's edge. */
function smoothstep(a: number, b: number, t: number) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

type Node3D = PNode & {
  name: string;
  label: string;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
};

/**
 * How many particles the sculpture is made of.
 *
 * The knowledge graph has around a hundred nodes, which is plenty for a
 * sphere — a sphere is legible from a dozen points because the brain fills in
 * a shape it already expects. It is nowhere near enough for the knight. A
 * silhouette with real features (a stepped pedestal, a throat, a jaw, a
 * muzzle, two ears, a scalloped mane) needs enough points that each feature
 * gets a crowd, and at a hundred nodes the ears were getting two or three
 * each — so the piece came out as a wire outline with gaps rather than an
 * object with a surface.
 *
 * This was 190, and 190 was a ceiling imposed by the wrong mechanism rather
 * than by the design: the dust used to be extra nodes in ForceGraph3D's list,
 * one sprite and one draw call each. It is now a `THREE.Points` field in the
 * same scene, which costs three draw calls in total however many particles
 * are in it, so the number can be what the shape actually needs. See
 * DustCloud.
 *
 * What the shape needs turns out to be a lot. Seven thousand sounds generous
 * until it is spread over the whole surface of a real model — a knight has
 * some five hundred square millimetres of skin per particle at that count, and
 * the piece reads as a sketch of itself. Twenty-six thousand is where the
 * surface stops looking sampled and starts looking continuous. The GPU does not care
 * (it is still three draw calls); what does care is the frame loop, which is
 * why the keyframes below are flat `Float32Array`s rather than arrays of
 * triples — the per-frame work is then a straight walk through typed memory
 * with no per-particle object to index into.
 *
 * They stay inert: no id in the graph, no label, no hover, no click, and no
 * existence at all until the graph has stopped being a graph. They take their
 * colours from the theme's `graph.dust` array, which exists for this and only
 * this: a mote drifting behind a paragraph and a mote holding up a chess piece
 * want opposite things from a light background, and one array cannot be both.
 */
const DUST_COUNT = 34000;

/**
 * How many of those hang back as a starfield rather than belonging to the
 * shape.
 *
 * The sculpture's own halo reaches maybe 30mm off a 160mm piece, which is the
 * right distance for something that is part of the object. It is nowhere near
 * far enough to make the screen feel like space: a knight with a tight halo
 * and hard nothing beyond it reads as an exhibit under glass. These are the
 * rest of the sky — spread across a volume comfortably wider and taller than
 * the frame, identical in every keyframe, and held at half strength so they
 * stay behind the piece rather than beside it.
 *
 * "So they never move" was, until this pass, a claim the code did not honour:
 * these were fed through the same pan, yaw and roll as the sculpture, which is
 * why the far end of the sky swung across the page every time the piece turned
 * and why the slab's own edges ended up on screen. They are now excluded from
 * all three in the frame loop — a separate pass, not a branch — so the sky is
 * genuinely fixed and the sculpture moves in front of it. The count went up
 * with the volume, so the density on screen is unchanged.
 */
const FIELD_COUNT = 8800;


/**
 * Sprite scales that land a real node at exactly the on-screen size of the
 * three dust buckets, so that once the field is a sculpture there is no such
 * thing as "a node" and "a mote" — there is one material.
 *
 * The 2.15 is not a fudge. A sprite is measured in world units and covers
 * `s / (2 · distance · tan(fov/2))` of the frame; a `THREE.Points` particle
 * goes through three's own attenuation, `size · (height/2) / distance`, and
 * with the renderer's default 50° field of view those two differ by a factor
 * of 1 / (2 · tan 25°) ≈ 2.15. Which is why the previous pass looked wrong
 * even though the numbers on both sides were the same: dust buckets of
 * 7.5 / 11.5 / 17.5 draw at the size of sprites 3.5 / 5.4 / 8.2, and the nodes —
 * a project hub reaching 10 units after its degree bonus — were landing at
 * three or four times that. Hence the two visible populations.
 *
 * They are also *assigned* rather than scaled. Multiplying each node's own
 * diameter by a constant preserves the whole spread of node sizes, degree
 * bonus and all, so a hub stays a hub and stays conspicuous; handing every
 * node one of three fixed sizes is what actually dissolves them into the
 * field.
 */
const DUST_MATCH = [3.5, 5.36, 8.16];
/**
 * The person node keeps a little of its status — half again the largest mote,
 * no more. It is still the origin every shape is built around, but in the
 * knight it sits inside the turned pedestal, and at its old size it read as a
 * lamp buried in the base rather than as the brightest thing in a field.
 */
const PERSON_SCULPT_SIZE = DUST_MATCH[2] * 1.5;


function useNodes(projects: Project[] | undefined) {
  const palette = usePalette();
  const colors = palette.graph;
  /*
   * The graph is now built from the live roles and achievements too, not just
   * the live projects. Before this it drew the compiled ones, so an admin edit
   * that added a role produced a card in the readout with no node to open it
   * from — the two halves of the same screen disagreeing about what exists.
   */
  const roles = useRoles();
  const achievements = useAchievements();
  const profile = useProfile();
  const graph = useMemo(
    () => buildGraph(true, projects ?? undefined, { roles, achievements, profile }),
    [projects, roles, achievements, profile],
  );
  const nodes = useMemo<Node3D[]>(() => {
    const degree = new Map<string, number>();
    for (const n of graph.nodes) degree.set(n.id, graph.adjacency.get(n.id)?.size ?? 0);
    return graph.nodes.map((n, i) => ({
      id: n.id,
      name: n.label,
      label: n.label,
      kind: n.kind,
      dot: DOT[n.kind] + Math.min(3.6, (degree.get(n.id) ?? 0) * DEGREE_BONUS[n.kind]),
      color: colors[n.kind],
      sculptDot: n.kind === 'person' ? PERSON_SCULPT_SIZE : DUST_MATCH[i % 3],
    }));
  }, [graph, colors]);
  return { graph, nodes };
}

export function GraphJourney({
  className = '',
  projects,
}: {
  className?: string;
  projects?: Project[];
}) {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 64rem)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 64rem)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return isDesktop ? (
    <DesktopJourney className={className} projects={projects} />
  ) : (
    <MobileJourney projects={projects} />
  );
}

/* ── Desktop: pinned graph column, scrolling content column ─────────────── */

function DesktopJourney({ className, projects }: { className?: string; projects?: Project[] }) {
  const palette = usePalette();
  const colors = palette.graph;
  const [theme] = useTheme();
  const visible = useVisible();
  const { graph, nodes } = useNodes(projects);

  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  /** Nodes the current Ask AI answer named. Empty until one does. */
  const [cited, setCited] = useState<Set<string>>(new Set());
  /**
   * When the current citation set started fading in, or null while nothing is
   * fading. Read inside the rAF loop to ease the highlight in over
   * CITE_FADE_MS rather than snapping it on the frame the answer finishes —
   * see the "answer finished" effect below and CITE_FADE_MS above.
   */
  const citeStart = useRef<number | null>(null);
  const outerRef = useRef<HTMLElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const askBlockRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const texture = useRef<THREE.Texture | null>(null);
  /*
   * Whether the graph is still a thing you can interrogate. True for the two
   * screens where the copy says "tap a node" and every dot is a labelled
   * project; false from the crossover onward, where the nodes have shrunk into
   * a uniform field and there is nothing left to reveal — a readout popping
   * out of an anonymous 6px speck in the middle of the knight is noise, not
   * information. Read inside the rAF loop and the ForceGraph callbacks, so it
   * is a ref rather than state: flipping it must not re-render.
   */
  const interactive = useRef(true);
  const dots = useRef(new Map<string, THREE.Sprite>());
  /** The sun or the moon, depending on the theme. Person node only. */
  const orb = useRef<THREE.Texture | null>(null);
  const labels = useRef(new Map<string, THREE.Sprite>());
  const dust = useRef<DustCloud | null>(null);
  /** The distance the camera would sit at with no push-in. Solved once, in the camera effect. */
  const fit = useRef(0);
  /** The distance it is actually at, so the dolly only writes when it moves. */
  const camDist = useRef(0);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const pick = (raw: Node3D) => {
    if (!interactive.current) return;
    const node = graph.nodes.find((n) => n.id === raw.id) ?? null;
    setSelected((prev) => (prev?.id === node?.id ? null : node));
    if (node) prefillAsk(`Tell me about ${node.label}`);
  };

  /*
   * The graph listens to the answer.
   *
   * The chat and the constellation have sat beside each other on this screen
   * since the first version and never spoken. They should: the answer names
   * projects and tools that are *already nodes with ids*, so lighting the ones
   * it drew on turns the graph into the citation. Nothing has to be trusted —
   * if a node lights up, its name is in the paragraph you are reading.
   *
   * Matching is on the answer's own words rather than on anything the model
   * is asked to emit. A model told to append machine-readable references gets
   * them wrong some of the time: it invents an id, cites something it never
   * mentioned, or forgets under a long answer. Every one of those lights the
   * wrong node, which is worse than lighting none, and it would put the
   * feature at the mercy of a prompt surviving model upgrades. See cite.ts.
   *
   * This used to match on every `askai:stream` chunk — every token the model
   * typed re-ran the matcher against the accumulated-so-far text and pushed a
   * new set straight into state. Nodes flickered in and out mid-sentence as
   * partial words matched and stopped matching, and whatever was lit at that
   * instant snapped to its highlighted size with no transition. Matching only
   * once, against the complete text on `askai:done`, is what "the final one
   * only" means below — the set of lit nodes is now a single fact about the
   * finished answer rather than something being recomputed live underneath a
   * conversation still being typed. `askai:start` (fired the moment a new
   * question is sent) clears the previous set immediately, so an old
   * citation never sits there through the next question's thinking time.
   */
  useEffect(() => {
    const match = buildMatcher(graph.nodes);
    const onDone = (e: Event) => {
      const ids = match((e as CustomEvent<string>).detail ?? '');
      citeStart.current = ids.size ? performance.now() : null;
      setCited(ids);
    };
    const onStart = () => {
      citeStart.current = null;
      setCited(new Set());
    };
    window.addEventListener('askai:done', onDone);
    window.addEventListener('askai:start', onStart);
    return () => {
      window.removeEventListener('askai:done', onDone);
      window.removeEventListener('askai:start', onStart);
    };
  }, [graph]);

  /**
   * "Blast radius" — what stays lit while everything else dims.
   *
   * Three sources feed it, in strict priority: a pointer on a node, a
   * selected node, and the nodes an answer cited. Pointer and selection light
   * a node plus its direct neighbours, because the question those answer is
   * "what is this connected to". A citation lights exactly what was named and
   * nothing else — adding neighbours there would light nodes the answer never
   * mentioned, and the whole value of this is that everything lit is
   * verifiable by reading the text.
   *
   * Hover and selection outrank citation rather than merging with it. Once
   * the visitor starts pointing at things, the graph is answering them, not
   * the chat.
   */
  const activeId = hovered ?? selected?.id ?? null;
  const highlightIds = useMemo(() => {
    if (activeId) {
      const set = new Set<string>([activeId]);
      graph.adjacency.get(activeId)?.forEach((id) => set.add(id));
      return set;
    }
    return cited.size ? cited : null;
  }, [activeId, cited, graph]);
  /** True when the lit set came from an answer, which scales them differently. */
  const citing = !activeId && cited.size > 0;

  /**
   * The graph's own nodes, in every figure. Same index space as `nodes`.
   *
   * In the Galaxy they are placed by importance — Core at the centre, roles
   * at the bulge, projects along the arms, tools further out — so the
   * brightest stars of the galaxy are the things you can click. On the Ask
   * screen they gather into the Globe round the Core. After that they
   * dissolve into each nebula.
   */
  const light = theme === 'light';
  const figures = useMemo<Record<Key, Figure>>(() => {
    const n = nodes.length;
    const rank: Record<NodeKind, number> = {
      person: 0,
      role: 1,
      project: 2,
      achievement: 3,
      domain: 4,
      tech: 5,
    };
    const order = nodes
      .map((node, i) => ({ i, r: rank[node.kind] }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((o) => o.i);
    const gal = galaxyNodeFigures(order, light);
    const or = orionFigures(n, light, 0x1d0e);
    const eye = eyeFigure(n, light, 0x2e7e);
    const fly = butterflyFigure(n, light, 0x3b7f);
    const vor = vortexFigure(n, light, 0, 0x4e0e);

    const all = [gal.galaxy, gal.dive, or.spread, or.gathered, eye, fly, vor];
    // The Core sits at the origin of every figure.
    const core = nodes.findIndex((node) => node.kind === 'person');
    if (core >= 0) for (const f of all) f.pos.fill(0, core * 3, core * 3 + 3);

    // Shared references for held keyframes: identical numbers, so a hold is a hold.
    return {
      galaxy: gal.galaxy,
      core: gal.dive,
      orionWide: or.spread,
      orionHold: or.spread,
      orion: or.gathered,
      eye,
      butterfly: fly,
      vortex: vor,
      rest: vor,
    };
  }, [nodes, light]);

  /**
   * The dust, in every figure — a separate, far larger index space. The last
   * FIELD_COUNT particles are the Sky, which is not a figure: it is written
   * where it was authored and never moves, so the figures move in front of it.
   */
  const shaped = DUST_COUNT - FIELD_COUNT;
  const dustFigures = useMemo<Record<Key, Figure>>(() => {
    const gal = galaxyFigures(shaped, light);
    const or = orionFigures(shaped, light);
    const eye = eyeFigure(shaped, light);
    const fly = butterflyFigure(shaped, light);
    const vor = vortexFigure(shaped, light, 0);
    return {
      galaxy: gal.galaxy,
      // Close in on the galaxy's heart: the same stars, turned a little as we fall in.
      core: gal.dive,
      orionWide: or.spread,
      orionHold: or.spread,
      orion: or.gathered,
      eye,
      butterfly: fly,
      vortex: vor,
      rest: vor,
    };
  }, [shaped, light]);
  const sky = useMemo(() => starFieldShape(FIELD_COUNT, 907), []);

  /** Whether the black hole is mounted. It is expensive, so it exists only near the Rest screen. */
  const [holeOn, setHoleOn] = useState(false);

  const profile = useProfile();
  const [first, ...rest] = profile.name.split(' ');

  /**
   * Sized to the slot itself — not the outer full-viewport sticky wrapper.
   * ForceGraph3D's canvas renders at exactly the width/height it's given and
   * doesn't shrink to fit a smaller parent on its own; measuring off the
   * wrong (larger) element is what let the canvas balloon past its box.
   */
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    texture.current = makeStarTexture();
    // The orb differs between themes — sun on light, moon on dark — so unlike
    // the star it has to be rebuilt when the theme flips.
    orb.current = makeOrbTexture(theme === 'light');
    const star = texture.current;
    const body = orb.current;
    return () => {
      star?.dispose();
      body?.dispose();
    };
  }, [theme]);

  /** Renderer-only setup. See the file header for why these are props, not methods. */
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge', null);
    fg.d3Force('center', null);
    fg.d3Force('link', null);
  }, [nodes, size.w]);

  /**
   * The dust field, added straight into the graph's own scene rather than
   * handed to it as nodes. Rebuilt when the canvas or the palette changes,
   * because both the colours and the blend mode are baked in at construction.
   */
  useEffect(() => {
    const fg = fgRef.current;
    const map = texture.current;
    if (!fg || !size.w || !map) return;
    const scene = fg.scene?.();
    if (!scene) return;
    const cloud = new DustCloud(DUST_COUNT, colors.dust, map, theme !== 'light');
    for (const points of cloud.objects) scene.add(points);
    dust.current = cloud;


    return () => {
      for (const points of cloud.objects) scene.remove(points);
      cloud.dispose();
      dust.current = null;
    };
  }, [size.w, size.h, colors, theme]);

  const nodeObject = (raw: Node3D) => {
    const group = new THREE.Group();
    const dot = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: (raw.kind === 'person' ? orb.current : texture.current) ?? undefined,
        color: new THREE.Color(raw.color),
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        // Additive on the dark theme, so overlapping cores sum toward white
        // the way real starlight does and a cluster reads as a cluster. On
        // paper there is nothing to add light to, so it stays a normal blend.
        // The Core is the exception: additive would wash its surface out to
        // a white disc over the bright bulge, and the moon's maria and the
        // sun's spots are the whole point of drawing it. Normal blend, and
        // drawn last, over the dust.
        blending:
          theme === 'light' || raw.kind === 'person'
            ? THREE.NormalBlending
            : THREE.AdditiveBlending,
        depthTest: raw.kind !== 'person',
      }),
    );
    if (raw.kind === 'person') dot.renderOrder = 10;
    const diameter = raw.dot * 3;
    dot.scale.set(diameter, diameter, 1);
    dot.userData.phase = raw.dot * 1.7;
    dot.userData.kindColor = new THREE.Color(raw.color);
    group.add(dot);
    dots.current.set(raw.id, dot);

    if (raw.kind === 'person' || raw.kind === 'role' || raw.kind === 'project') {
      const text = new SpriteText(raw.name) as unknown as THREE.Sprite & {
        color: string;
        textHeight: number;
      };
      text.color = raw.kind === 'person' ? palette.text : palette.textBody;
      text.textHeight = raw.kind === 'person' ? 12 : 7.5;
      text.position.set(0, raw.dot + 9, 0);
      (text.material as THREE.SpriteMaterial).depthWrite = false;
      text.material.transparent = true;
      text.visible = false;
      group.add(text);
      labels.current.set(raw.id, text);
    }

    return group;
  };

  useEffect(() => {
    dots.current.clear();
    labels.current.clear();
  }, [nodes]);

  /**
   * Fixed cinematic camera.
   *
   * Framed off the canvas *height* rather than its aspect ratio, which is the
   * change that came with going full-viewport. The old formula solved for the
   * proportions of a 46vw box, and feeding it a whole screen would have made
   * everything 20% larger for no reason other than that the element grew.
   * Holding world-units-per-pixel constant instead means the sculpture is the
   * same physical size on the page as it was in the box — the canvas got
   * bigger, the subject did not.
   *
   * WORLD_ACROSS is that constant: the world height the old 760px slot showed,
   * divided by 760. Everything downstream — the framing, the dolly, the dock
   * offsets — is derived from it, so this one number is the scale of the whole
   * sequence.
   */
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !size.w || !size.h) return;
    const controls = fg.controls?.();
    if (controls) controls.enabled = false;
    const WORLD_ACROSS = (OUTER * 4.7) / 760;
    /*
     * How far this window's height sits from the reference, as a bounded
     * multiplier — see the SCREEN_SCALE_RANGE block above for the two
     * numbers to change. >1 on windows taller than the reference (external
     * monitors), <1 on windows shorter than it (small laptops).
     */
    const screenScale = Math.min(
      SCREEN_SCALE_RANGE[1],
      Math.max(SCREEN_SCALE_RANGE[0], size.h / VIEWPORT_REFERENCE_HEIGHT),
    );
    // 2·tan(fov/2) for the renderer's default 50° vertical field of view.
    // Dividing by screenScale is what makes a bigger screen a *closer*
    // camera (and therefore a bigger graph) rather than merely a wider view
    // of the same fixed-size object.
    const solved = (size.h * WORLD_ACROSS) / 0.9326 / screenScale;
    fit.current = solved;
    camDist.current = solved;
    fg.cameraPosition(
      { x: solved * 0.18, y: solved * 0.1, z: solved },
      { x: 0, y: 0, z: 0 },
      0,
    );
  }, [size.w, size.h]);

  /** The scroll-to-figure mapping. Progress is measured across the whole outer section. */
  useEffect(() => {
    if (!visible) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tmpColor = new THREE.Color();
    const out: [number, number, number] = [0, 0, 0];

    let raf = 0;
    let holeMounted = false;
    const tick = () => {
      const el = outerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const scrollable = Math.max(1, rect.height - window.innerHeight);
        const progress = reduced ? 0 : clamp01(-rect.top / scrollable);

        const segF = progress * SEG_COUNT;
        const segIdx = Math.min(SEG_COUNT - 1, Math.floor(segF));
        const localT = easeInOut(clamp01(segF - segIdx));
        const fromKey = KEYS[segIdx];
        const toKey = KEYS[segIdx + 1];
        const lerpK = (table: Record<Key, number>) =>
          table[fromKey] + (table[toKey] - table[fromKey]) * localT;

        // Dolly first: everything horizontal is measured against the visible width.
        const zoomFrom = ZOOM[fromKey] ?? 1;
        const zoomTo = ZOOM[toKey] ?? 1;
        const wanted = fit.current * (zoomFrom + (zoomTo - zoomFrom) * localT);
        if (fit.current && Math.abs(wanted - camDist.current) > 0.4) {
          camDist.current = wanted;
          fgRef.current?.cameraPosition(
            { x: wanted * 0.18, y: wanted * 0.1, z: wanted },
            { x: 0, y: 0, z: 0 },
            0,
          );
        }
        const visibleWidth = 0.9326 * camDist.current * (size.w / Math.max(1, size.h));

        // Pan + dock, both fractions of the visible width.
        const panFrom = PAN[fromKey] ?? 0;
        const panTo = PAN[toKey] ?? 0;
        const dockT = easeInOut(clamp01((segF - segIdx - DOCK_HOLD) / (1 - 2 * DOCK_HOLD)));
        const dockNow = DOCK_POS[segIdx] + (DOCK_POS[segIdx + 1] - DOCK_POS[segIdx]) * dockT;
        let panFrac = panFrom + (panTo - panFrom) * localT + dockNow;
        const edgeFrom = EDGE[fromKey] ?? 0;
        const edgeTo = EDGE[toKey] ?? 0;
        const edge = edgeFrom + (edgeTo - edgeFrom) * localT;
        const ballFrac = (OUTER * 1.06) / Math.max(1, visibleWidth);
        const limit = Math.max(0, 0.5 - ballFrac * edge);
        panFrac = Math.max(-limit, Math.min(limit, panFrac));
        const panX = panFrac * visibleWidth;

        const tiltFrom = TILT[fromKey] ?? 0;
        const tiltTo = TILT[toKey] ?? 0;
        const tilt = tiltFrom + (tiltTo - tiltFrom) * localT;
        const cosT = Math.cos(tilt);
        const sinT = Math.sin(tilt);

        let yaw = 0;
        for (let s = 0; s < segIdx; s++) yaw += YAW_DELTA[s];
        yaw += YAW_DELTA[segIdx] * localT;
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);

        const dFrom = DEPTH[fromKey];
        const dTo = DEPTH[toKey];
        const half = dFrom.half + (dTo.half - dFrom.half) * localT;
        const back = dFrom.back + (dTo.back - dFrom.back) * localT;

        const dustA = lerpK(DUST_A);
        const nodeG = lerpK(NODE_G);
        const coreA = lerpK(CORE_A);
        const coreS = lerpK(CORE_S);
        const nodeS = lerpK(NODE_S);

        // Swirl setup for this segment, if any: an orthonormal basis about its axis.
        const sw = SWIRL[segIdx];
        let e1x = 0, e1y = 0, e1z = 0, e2x = 0, e2y = 0, e2z = 0, ax = 0, ay = 0, az = 0;
        if (sw) {
          [ax, ay, az] = sw.axis;
          // Any vector not parallel to the axis, Gram–Schmidt, then cross.
          let hx = 1, hy = 0, hz = 0;
          if (Math.abs(ax) > 0.9) {
            hx = 0;
            hy = 1;
          }
          const d = hx * ax + hy * ay + hz * az;
          e1x = hx - d * ax;
          e1y = hy - d * ay;
          e1z = hz - d * az;
          const l = Math.hypot(e1x, e1y, e1z) || 1;
          e1x /= l;
          e1y /= l;
          e1z /= l;
          e2x = ay * e1z - az * e1y;
          e2y = az * e1x - ax * e1z;
          e2z = ax * e1y - ay * e1x;
        }
        const turns = sw ? sw.turns * Math.PI * 2 : 0;
        /** Interpolate point i of two packed arrays into `out`, straight or along an arc. */
        const interp = (a: Float32Array, b: Float32Array, i: number) => {
          const j = i * 3;
          const x0 = a[j], y0 = a[j + 1], z0 = a[j + 2];
          const x1 = b[j], y1 = b[j + 1], z1 = b[j + 2];
          if (!sw || a === b) {
            out[0] = x0 + (x1 - x0) * localT;
            out[1] = y0 + (y1 - y0) * localT;
            out[2] = z0 + (z1 - z0) * localT;
            return;
          }
          const h0 = x0 * ax + y0 * ay + z0 * az;
          const h1 = x1 * ax + y1 * ay + z1 * az;
          const u0 = x0 * e1x + y0 * e1y + z0 * e1z;
          const v0 = x0 * e2x + y0 * e2y + z0 * e2z;
          const u1 = x1 * e1x + y1 * e1y + z1 * e1z;
          const v1 = x1 * e2x + y1 * e2y + z1 * e2z;
          const r0 = Math.hypot(u0, v0);
          const r1 = Math.hypot(u1, v1);
          const a0 = Math.atan2(v0, u0);
          let da = Math.atan2(v1, u1) - a0;
          if (da > Math.PI) da -= Math.PI * 2;
          else if (da < -Math.PI) da += Math.PI * 2;
          da += turns;
          const ang = a0 + da * localT;
          const rr = r0 + (r1 - r0) * localT;
          const hh = h0 + (h1 - h0) * localT;
          const c = Math.cos(ang) * rr;
          const s = Math.sin(ang) * rr;
          out[0] = hh * ax + c * e1x + s * e2x;
          out[1] = hh * ay + c * e1y + s * e2y;
          out[2] = hh * az + c * e1z + s * e2z;
        };

        /*
         * Interaction follows the nodes being a readable graph: on through the
         * Galaxy and the Dive, off through the dust figures, back on for the
         * Constellation. Crossing out of it dismisses anything open.
         */
        const nowInteractive = nodeG > INTERACTIVE_AT;
        if (interactive.current !== nowInteractive) {
          interactive.current = nowInteractive;
          if (!nowInteractive) {
            setHovered(null);
            setSelected(null);
          }
          const slot = slotRef.current;
          if (slot) slot.style.pointerEvents = nowInteractive ? 'auto' : 'none';
        }

        const citeT = citeStart.current
          ? easeOutCubic(clamp01((performance.now() - citeStart.current) / CITE_FADE_MS))
          : 1;

        const fromN = figures[fromKey];
        const toN = figures[toKey];
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          interp(fromN.pos, toN.pos, i);
          const [x, y, z] = out;
          // Rotate the figure, then pan it — a dock is a statement about the screen.
          const rx = x * cosY + z * sinY;
          const rz = -x * sinY + z * cosY;
          const sx = rx * cosT - y * sinT;
          const sy = rx * sinT + y * cosT;
          n.fx = n.x = sx + panX;
          n.fy = n.y = sy;
          n.fz = n.z = rz;

          const cue = clamp01(0.5 + (sx * CAM.x + sy * CAM.y + rz * CAM.z) / (2 * half));
          const shade = 1 - (1 - nodeG) * (1 - (back + (1 - back) * cue));

          const dot = dots.current.get(n.id);
          if (!dot) continue;
          const isPerson = n.kind === 'person';
          const phase = (dot.userData.phase as number) ?? 0;
          const pulse = 1 + 0.05 * Math.sin(performance.now() * 0.0011 + phase);
          const base = n.dot * 3;
          const sculptSize = n.sculptDot;
          let scale = (sculptSize + (base * nodeS - sculptSize) * nodeG) * pulse;
          if (isPerson) scale *= 1.15 * coreS;
          let opacity = 0.94 * shade;
          if (isPerson) opacity *= coreA;

          // Colour: the node's own kind colour as a graph, the figure's as dust.
          const kind = dot.userData.kindColor as THREE.Color | undefined;
          if (kind && !isPerson) {
            const fcFrom = fromN.col;
            const fcTo = toN.col;
            const j = i * 3;
            tmpColor.setRGB(
              fcFrom[j] + (fcTo[j] - fcFrom[j]) * localT,
              fcFrom[j + 1] + (fcTo[j + 1] - fcFrom[j + 1]) * localT,
              fcFrom[j + 2] + (fcTo[j + 2] - fcFrom[j + 2]) * localT,
            );
            tmpColor.lerp(kind, nodeG);
            (dot.material as THREE.SpriteMaterial).color.copy(tmpColor);
          }

          if (highlightIds) {
            const t = citing ? citeT : 1;
            if (highlightIds.has(n.id)) {
              const target = n.id === activeId ? 1.55 : citing ? 1.5 : 1.25;
              scale *= 1 + (target - 1) * t;
            } else if (!isPerson) {
              opacity *= 1 - (1 - 0.18) * t;
              scale *= 1 - (1 - 0.85) * t;
            }
          }
          dot.scale.set(scale, scale, 1);
          (dot.material as THREE.SpriteMaterial).opacity = opacity;
        }

        /* The dust: same interpolation, same rotation, same pan, its own colours. */
        const cloud = dust.current;
        if (cloud) {
          cloud.begin(1, back);
          // Gas on paper needs more ink than light on black to read at the same strength.
          const inkBoost = theme === 'light' ? 1.45 : 1;
          const dF = dustFigures[fromKey];
          const dT = dustFigures[toKey];
          for (let i = 0; i < shaped; i++) {
            interp(dF.pos, dT.pos, i);
            const [x, y, z] = out;
            const rx = x * cosY + z * sinY;
            const rz = -x * sinY + z * cosY;
            const fx = rx * cosT - y * sinT;
            const fy = rx * sinT + y * cosT;
            const cue = clamp01(0.5 + (fx * CAM.x + fy * CAM.y + rz * CAM.z) / (2 * half));
            const w = dF.w[i] + (dT.w[i] - dF.w[i]) * localT;
            cloud.set(i, fx + panX, fy, rz, cue, Math.min(1, w * dustA * inkBoost));
            const j = i * 3;
            cloud.tint(
              i,
              dF.col[j] + (dT.col[j] - dF.col[j]) * localT,
              dF.col[j + 1] + (dT.col[j + 1] - dF.col[j + 1]) * localT,
              dF.col[j + 2] + (dT.col[j + 2] - dF.col[j + 2]) * localT,
            );
          }
          // The graph's own background star slab is off: the page sky
          // (SkyBackdrop) is the one star layer, so the Hero never shows two.
          for (let i = 0; i < FIELD_COUNT; i++) cloud.set(shaped + i, 0, 0, 0, 0, 0);
          cloud.end();
        }

        /*
         * The black hole is a ray tracer, so it is mounted only once the
         * reader is a few screens from it, and then left mounted so scrolling
         * back and forth never recompiles it.
         */
        if (!holeMounted && segF > SEG_COUNT - 2.2) {
          holeMounted = true;
          setHoleOn(true);
        }

        // Labels: only what is hovered, selected or cited.
        for (const [id, label] of labels.current) {
          const a = highlightIds?.has(id) ? 1 : 0;
          label.visible = a > 0;
          (label.material as THREE.SpriteMaterial).opacity = a;
        }

        // Metrics and Proof are full-width copy over a centred cloud: dim it there.
        const dim = 1 - 0.55 * clamp01(Math.min(segF - 1.45, 3.85 - segF) / 0.45);
        const slot = slotRef.current;
        if (slot) {
          /*
           * On the last screen the whole layer scrolls up with the name
           * instead of staying pinned — pinned, the figure sat still while
           * the black hole screen slid up and sliced through it. One screen
           * of scroll moves it exactly one screen, so it leaves in step with
           * the heading, and the black hole screen rising below covers the
           * space it vacates.
           */
          const up = clamp01(segF - (SEG_COUNT - 1)) * window.innerHeight;
          const lifted = up.toFixed(1);
          if (slot.dataset.up !== lifted) {
            slot.style.transform = up > 0 ? `translate3d(0, ${-up}px, 0)` : '';
            slot.dataset.up = lifted;
          }
          const shown = dim.toFixed(2);
          if (slot.dataset.dim !== shown) {
            slot.style.opacity = shown;
            slot.dataset.dim = shown;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    visible,
    nodes,
    figures,
    dustFigures,
    sky,
    shaped,
    theme,
    highlightIds,
    activeId,
    citing,
    size.w,
    size.h,
  ]);

  return (
    <section ref={outerRef} id="graph" className={`relative scroll-mt-[24px] ${className}`}>
      {/*
        The graph, sticky. Its horizontal position is scroll-driven — it starts
        on the right (Hero on the left), slides left (Ask AI on the right),
        then continues swapping sides for each captioned stage.

        The canvas is the entire viewport. It used to be a 46vw box slid around
        with translateX, which framed the graph correctly and cropped
        everything else: a canvas is exactly as large as its element, so the
        dust ended in a hard rectangle with four corners in it. Invisible on
        black, unmissable on paper.

        Docking moved into world space instead (see DOCK_POS), so this element
        never moves and never clips. What it costs is that the graph now sits
        under the entire page rather than under one column — which is fine,
        because it is z-[5] beneath a z-[10] content layer, and everything in
        that layer which wants a click re-enables pointer events for itself.
        Empty space still falls through to the nodes.
      */}
      <div className="pointer-events-none sticky top-0 z-[5] h-screen w-full">
        <div
          ref={slotRef}
          /*
            No `transition-opacity` here any more. The dim is written from the
            frame loop as a function of scroll position, and a 700ms CSS
            transition on top of a per-frame write is two animations arguing
            over one property: the transition restarts on every frame it
            changes, so it never finishes and the value lags the scroll by a
            variable amount. Scrub-driven properties are set, not tweened.
          */
          className="graph-slot pointer-events-auto relative h-full w-full"
        >
          {size.w > 0 && (
            <ForceGraph3D
              ref={fgRef}
              width={size.w}
              height={size.h}
              graphData={{ nodes: nodes as never, links: [] }}
              backgroundColor="rgba(0,0,0,0)"
              showNavInfo={false}
              numDimensions={3}
              nodeThreeObject={nodeObject as never}
              nodeLabel={(n: Node3D) => (interactive.current ? n.name : '')}
              onNodeClick={pick as never}
              onNodeHover={
                ((n: Node3D | null) => {
                  const id = interactive.current && n ? n.id : null;
                  // Functional form so re-hovering dead space while already
                  // null bails out instead of re-rendering on every frame the
                  // pointer moves across the canvas.
                  setHovered((prev) => (prev === id ? prev : id));
                }) as never
              }
              enableNodeDrag={false}
              enableNavigationControls={false}
              warmupTicks={0}
              cooldownTicks={Infinity}
              cooldownTime={Infinity}
              d3AlphaDecay={0}
              d3AlphaMin={0}
              d3VelocityDecay={1}
            />
          )}
        </div>
      </div>

      {/*
        Sits ON TOP of the sticky graph layer via a negative margin: each block
        gets one screenful of scroll distance and picks its own side/alignment
        within the .shell gutter. No column grid — that's what forced Metrics
        into 2×2 and Proof into a narrow left column in the earlier version.

        `pointer-events-none` on this whole wrapper so clicks on empty regions
        fall through to the WebGL canvas beneath — otherwise the invisible
        transparent min-h-screen blocks intercepted every hover/click and
        nodes were unreachable across the whole opening scroll. Every actual
        interactive element (h1, buttons, cards, headings) re-enables events
        for itself via `pointer-events-auto` on its own inner wrapper.
      */}
      <div className="relative z-[10] pointer-events-none" style={{ marginTop: '-100vh' }}>
        {/* Hero — left, graph on the right. */}
        <div className="shell flex min-h-screen items-center">
          <div className="w-full max-w-[520px] pointer-events-auto">
            <h1 className="t-display text-bone">
              {first}
              <br />
              {rest.join(' ')}
            </h1>
            <p className="t-body mt-[24px] max-w-[480px] text-mist">{profile.positioning}</p>
            <p className="t-caption mt-[18px] text-ash">
              {profile.title}, {profile.location.split(',')[0]}. {profile.availability}
            </p>
            <div className="mt-[30px] flex flex-wrap items-center gap-x-[30px] gap-y-[6px]">
              <button
                type="button"
                onClick={() => {
                  askBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  window.setTimeout(() => document.getElementById('ask-input')?.focus({ preventScroll: true }), 900);
                }}
                className="pill"
              >
                Ask my AI about me
              </button>
              <a href={profile.resume} download className="ghost">
                Download resume
              </a>
            </div>
            <p className="t-caption mt-[36px] text-ash">
              {selected ? 'Tap anywhere else to clear' : 'Every project, tool and domain. Tap a node.'}
            </p>
          </div>
        </div>

        {/*
          Ask AI — on the RIGHT, graph on the LEFT. The stage is a full screen
          tall so the orb has room to fly from the pill to the middle; it is
          pointer-events-none itself (the graph to its left stays hoverable)
          and only the pill, the answer and its button take clicks.
        */}
        <div ref={askBlockRef} id="ask" className="shell flex min-h-screen items-center justify-end scroll-mt-[0px]">
          <div className="pointer-events-auto relative h-screen w-full max-w-[560px]">
            <AskChat
              note={citing ? `${cited.size} node${cited.size === 1 ? '' : 's'} lit in the graph` : null}
            />
          </div>
        </div>

        {/* Metrics — four across, full width, aligned to the .shell gutter (matches image 3's ask). */}
        <div className="shell flex min-h-screen items-center">
          <div className="w-full pointer-events-auto">
            <div className="grid gap-[36px] sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((m, i) => (
                <div key={m.label}>
                  <p className="t-heading-lg text-bone tabular-nums">
                    <SplitFlap value={m.value} delay={i * 120} />
                  </p>
                  <p className="t-body mt-[6px] max-w-[24ch] text-ash">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Proof — centered, full column width (image 4). */}
        <div id="proof" className="shell flex min-h-screen items-center justify-center scroll-mt-[24px]">
          <div className="mx-auto w-full max-w-[1100px] pointer-events-auto">
            <div className="text-center">
              <h2 className="t-heading-lg text-bone">Proof</h2>
              <p className="t-body mx-auto mt-[12px] max-w-[52ch] text-mist">
                Two systems, each shown as the thing that went in and the thing that came out.
              </p>
            </div>
            <div className="mt-[36px] grid gap-[36px] lg:grid-cols-2">
              <Compare
                before="/compare/ppe-before.svg"
                after="/compare/ppe-after.svg"
                beforeLabel="Raw frame"
                afterLabel="YOLOv8 output"
                caption="PPE Compliance System — five specialized detectors over a live CCTV feed."
              />
              <Compare
                before="/compare/diagram-prompt.svg"
                after="/compare/diagram-output.svg"
                beforeLabel="Plain English"
                afterLabel="Rendered diagram"
                caption="DiagramStudio — English compiles to DiagramDSL, then to an ELK layout graph."
              />
            </div>
          </div>
        </div>

        {/* "Everything, connected." — heading RIGHT, graph LEFT. */}
        <div className="shell flex min-h-screen items-center justify-end">
          <div className="w-full max-w-[520px] text-right pointer-events-auto">
            <h2 className="t-display text-bone">Everything,<br />connected.</h2>
          </div>
        </div>

        {/* "One mind behind all of it." — heading LEFT, graph RIGHT (image 6 correction). */}
        <div className="shell flex min-h-screen items-center">
          <div className="w-full max-w-[560px] pointer-events-auto">
            <h2 className="t-display text-bone">One mind<br />behind all of it.</h2>
          </div>
        </div>

        {/* "Same mind, different lens." — heading RIGHT, graph LEFT. */}
        <div className="shell flex min-h-screen items-center justify-end">
          <div className="w-full max-w-[560px] text-right pointer-events-auto">
            <h2 className="t-display text-bone">Same mind,<br />different lens.</h2>
          </div>
        </div>

        {/*
          "Ishant Shrivastava" — LEFT, mirroring Hero, with the knight docked
          right. It was centred and the graph faded to 0.15 behind it, which
          made sense when the shape underneath was an anonymous scatter and
          made no sense the moment it became a recognisable object. Opening on
          the name beside a sphere and closing on the name beside the knight is
          the same composition twice, which is what makes it read as an ending
          rather than as one more screenful.
        */}
        <div className="shell flex min-h-screen items-center">
          <div className="w-full max-w-[640px] pointer-events-auto">
            <h2 className="t-display text-bone">Ishant Shrivastava</h2>
          </div>
        </div>

        {/*
          One screenful of tail, so the knight holds fully formed for a beat
          before Work scrolls up over it. This was 200vh of nothing while three
          leftover shape transitions played out unseen; the sequence now ends
          on the knight, so all the tail has to do is let it sit.
        */}
        <div aria-hidden className="relative h-screen w-full overflow-hidden">
          {holeOn && (
            <BlackHoleHeroSection focus={[0.72, 0.46]} vignette={0.3} resolution={0.65} />
          )}
        </div>
      </div>

      {/*
        Global floating card. Renders itself absolutely-positioned inside the
        viewport, so it stays put no matter which stage of the scroll the
        selection was made at (Hero, Ask AI, Metrics, Proof, or any of the
        captioned shape stages). onDismiss clears `selected` for backdrop
        clicks, the X button and Escape — see GraphReadout for the details.
      */}
      <GraphReadout node={selected} onDismiss={() => setSelected(null)} />
    </section>
  );
}



/* ── Desktop: pinned graph column, scrolling content column ─────────────── */

/* ── Mobile / tablet: plain stack, no pinning, no scroll-jacking ─────────── */

function MobileJourney({ projects }: { projects?: Project[] }) {
  const { graph, nodes } = useNodes(projects);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [theme] = useTheme();
  // The same galaxy as desktop's Hero, without the scroll sequence.
  const shape = useMemo(() => {
    const rank: Record<NodeKind, number> = { person: 0, role: 1, project: 2, achievement: 3, domain: 4, tech: 5 };
    const order = nodes
      .map((node, i) => ({ i, r: rank[node.kind] }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((o) => o.i);
    const f = galaxyNodeFigures(order, theme === 'light').galaxy.pos;
    const core = nodes.findIndex((node) => node.kind === 'person');
    if (core >= 0) f.fill(0, core * 3, core * 3 + 3);
    return f;
  }, [nodes, theme]);

  nodes.forEach((n, i) => {
    n.x = n.fx = shape[i * 3];
    n.y = n.fy = shape[i * 3 + 1];
    n.z = n.fz = shape[i * 3 + 2];
  });

  const pick = (raw: Node3D) => {
    const node = graph.nodes.find((n) => n.id === raw.id) ?? null;
    setSelected((prev) => (prev?.id === node?.id ? null : node));
    if (node) prefillAsk(`Tell me about ${node.label}`);
  };

  const profile = useProfile();
  const [first, ...rest] = profile.name.split(' ');
  const askRef = useRef<HTMLDivElement>(null);

  return (
    <section id="graph" className="shell relative pt-[120px] scroll-mt-[96px]">
      <h1 className="t-display text-bone">
        {first}
        <br />
        {rest.join(' ')}
      </h1>
      <p className="t-body mt-[24px] max-w-[480px] text-mist">{profile.positioning}</p>
      <p className="t-caption mt-[18px] text-ash">
        {profile.title}, {profile.location.split(',')[0]}. {profile.availability}
      </p>
      <div className="mt-[30px] flex flex-wrap items-center gap-x-[30px] gap-y-[6px]">
        <button
          type="button"
          onClick={() => askRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          className="pill"
        >
          Ask my AI about me
        </button>
        <a href={profile.resume} download className="ghost">
          Download resume
        </a>
      </div>

      <div className="relative mt-[48px] aspect-square w-full">
        <StaticSphere nodes={nodes} onPick={pick} />
      </div>
      <p className="t-caption mt-[6px] text-center text-ash">
        {selected ? 'Tap the × to close' : 'Every project, tool and domain. Tap a node.'}
      </p>
      <GraphReadout node={selected} onDismiss={() => setSelected(null)} />

      <div ref={askRef} id="ask" className="relative mt-[24px] h-[min(100svh,760px)] min-h-[560px]">
        <AskChat />
      </div>

      <div className="mt-[60px] grid grid-cols-2 gap-[24px]">
        {metrics.map((m, i) => (
          <div key={m.label}>
            <p className="t-heading-lg text-bone tabular-nums">
              <SplitFlap value={m.value} delay={i * 120} />
            </p>
            <p className="t-body mt-[6px] text-ash">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-[60px]" id="proof">
        <h2 className="t-heading-lg text-bone">Proof</h2>
        <p className="t-body mt-[12px] text-mist">
          Two systems, each shown as the thing that went in and the thing that came out.
        </p>
        <div className="mt-[24px] space-y-[24px]">
          <Compare
            before="/compare/ppe-before.svg"
            after="/compare/ppe-after.svg"
            beforeLabel="Raw frame"
            afterLabel="YOLOv8 output"
            caption="PPE Compliance System — five specialized detectors over a live CCTV feed."
          />
          <Compare
            before="/compare/diagram-prompt.svg"
            after="/compare/diagram-output.svg"
            beforeLabel="Plain English"
            afterLabel="Rendered diagram"
            caption="DiagramStudio — English compiles to DiagramDSL, then to an ELK layout graph."
          />
        </div>
      </div>
    </section>
  );
}

/** A small, static, non-scroll-driven sphere for mobile — the shape sequence is a desktop-only luxury. */
function StaticSphere({ nodes, onPick }: { nodes: Node3D[]; onPick: (n: Node3D) => void }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [theme] = useTheme();
  const texture = useRef<THREE.Texture | null>(null);
  const orb = useRef<THREE.Texture | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    texture.current = makeStarTexture();
    orb.current = makeOrbTexture(theme === 'light');
    const star = texture.current;
    const body = orb.current;
    return () => {
      star?.dispose();
      body?.dispose();
    };
  }, [theme]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge', null);
    fg.d3Force('center', null);
    fg.d3Force('link', null);
    const controls = fg.controls?.();
    if (controls) {
      controls.enabled = true;
      controls.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      controls.autoRotateSpeed = 0.5;
    }
    if (size.w) fg.cameraPosition({ x: OUTER * 1.1, y: OUTER * 0.6, z: OUTER * 3.2 }, { x: 0, y: 0, z: 0 }, 0);
  }, [size.w]);

  const nodeObject = (raw: Node3D) => {
    const dot = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: (raw.kind === 'person' ? orb.current : texture.current) ?? undefined,
        color: new THREE.Color(raw.color),
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        blending: theme === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending,
      }),
    );
    const d = raw.dot * 3;
    dot.scale.set(d, d, 1);
    return dot;
  };

  return (
    <div ref={outerRef} className="h-full w-full">
      {size.w > 0 && (
        <ForceGraph3D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={{ nodes: nodes as never, links: [] }}
          backgroundColor="rgba(0,0,0,0)"
          showNavInfo={false}
          numDimensions={3}
          nodeThreeObject={nodeObject as never}
          nodeLabel={(n: Node3D) => n.name}
          onNodeClick={onPick as never}
          enableNodeDrag={false}
          warmupTicks={0}
          cooldownTicks={Infinity}
          cooldownTime={Infinity}
          d3AlphaDecay={0}
          d3AlphaMin={0}
          d3VelocityDecay={1}
        />
      )}
    </div>
  );
}