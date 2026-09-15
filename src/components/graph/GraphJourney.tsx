// src/components/graph/GraphJourney.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { buildGraph, type GraphNode, type NodeKind } from '@/lib/graph';
import { usePalette, useTheme } from '@/lib/useTheme';
import { DustCloud } from '@/components/graph/DustCloud';
import {
  OUTER,
  SHAPE_DEPTH,
  knightShape,
  mindShape,
  scatterShape,
  sphereShape,
  starFieldShape,
  type Vec3,
} from '@/components/graph/shapes';
import { useVisible } from '@/components/core/WhenVisible';
import { GraphReadout } from '@/components/graph/GraphReadout';
import { AskAI } from '@/components/chat/AskAI';
import { buildMatcher } from '@/components/archive/cite';
import { BorderGlow } from '@/components/studio/BorderGlow';
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
const ASK_AI_GRAPH_SIZE_PERCENT = 150;

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
 * The entire scroll sequence (sphere, scatter, mind, knight — every keyframe)
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
 * Sequence, in order. One keyframe per screenful of scroll, so each shape is
 * fully formed exactly when its own block is centred — see the KEYS comment
 * for why that alignment is deliberate rather than incidental:
 *   heroRight    — assembled sphere, panned right. Hero's copy sits in the
 *                  first block on the left, and nodes are clickable (tap a
 *                  node → primes Ask AI).
 *   heroLeft     — same sphere, panned left, turned partway, as the page
 *                  scrolls Hero's block away and Ask AI's block in.
 *   scatterWide → scatterHold
 *                — one real scatter transition, then a "hold" keyframe where
 *                  the point cloud is identical — the graph reads as a
 *                  constant, fully-populated backdrop while Metrics' and then
 *                  Proof's blocks scroll past beside it, rather than
 *                  something that empties and refills between sections.
 *   sphere       — reassembles, centred. "Everything, connected."
 *   mind         — the folded cortex shell. "One mind behind all of it."
 *   mindTurn     — the same points, half a turn around. "Same mind, different
 *                  lens", meant literally.
 *   knight → knightHold
 *                — resolves into a chess knight as "Ishant Shrivastava"
 *                  appears beside it, then holds for one screen.
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
 * One keyframe per screenful, and that is load-bearing.
 *
 * The sequence used to run eleven keyframes across ten screens of scroll, so
 * nothing landed anywhere in particular: shapes finished forming partway
 * through whichever block happened to be passing, and the last three
 * transitions played out over two empty screenfuls at the end with no content
 * beside them. Making KEYS.length − 1 equal the number of scrollable screens
 * (eight content blocks plus a one-screen tail, so eight segments) makes segF
 * equal the block index exactly — every shape is fully formed at the moment
 * its own heading is centred, and none of them form anywhere else.
 *
 *   heroRight   0  Hero — assembled sphere, panned right, nodes clickable.
 *   heroLeft    1  Ask AI — same sphere, panned left and turned partway.
 *   scatterWide 2  Metrics — the cloud opens out behind the numbers.
 *   scatterHold 3  Proof — identical cloud, held, so the field reads as a
 *                  constant backdrop rather than emptying and refilling.
 *   sphere      4  "Everything, connected." — reassembles, centred.
 *   mind        5  "One mind behind all of it." — the folded cortex shell.
 *   mindTurn    6  "Same mind, different lens." — the same points, half a
 *                  turn around. The line finally means what it says: it is
 *                  literally the same cloud from the other side.
 *   knight      7  "Ishant Shrivastava" — resolves into the chess piece as
 *                  the name appears.
 *   knightHold  8  One screen of the held knight before Work starts.
 */
const KEYS = [
  'heroRight',
  'heroLeft',
  'scatterWide',
  'scatterHold',
  'sphere',
  'mind',
  'mindTurn',
  'knight',
  'knightHold',
] as const;
type Key = (typeof KEYS)[number];
const SEG_COUNT = KEYS.length - 1;

/**
 * How far each keyframe pans the whole cloud sideways, as a fraction of the
 * visible width. Everything else is 0.
 *
 * This used to be a multiple of OUTER — a flat number of world units — which
 * was fine while the camera lived at one fixed distance inside a fixed-width
 * box, and stopped being fine the moment either of those moved. A world offset
 * is a smaller share of the screen the further back the camera sits, so
 * widening the canvas to the whole viewport quietly shrank the swing from
 * about 13% of the screen to about 10%: the graph went from sweeping across
 * the page to shuffling. Expressed against the visible width instead, the
 * travel is the same proportion of the screen at every distance, and pans the
 * same distance whether or not the dolly happens to be pushing in.
 *
 * On the two hero screens the values below are intentionally past any legal
 * value: they say "push it as far as it will go", and CROP decides where that
 * is. Everywhere else the pan is zero and the dock alone places the cloud.
 */
const PAN: Partial<Record<Key, number>> = {
  heroRight: 0.5,
  heroLeft: -0.5,
};

/**
 * Where the sphere is parked on the two screens where it is the subject, as
 * the distance from its centre to the near edge of the screen, measured in its
 * own radii. 1.0 would put it exactly touching.
 *
 * Two earlier attempts at this were wrong in two different ways, and both are
 * worth stating because they are easy to walk back into.
 *
 * The first expressed the offset as a fraction of the screen width. That unit
 * is simply wrong for the job: the sphere's projected radius is a fixed number
 * of *pixels*, because the camera is framed off the canvas height, not its
 * width. The same fraction therefore means a different thing on every monitor,
 * and the placement came out cropped or timid depending on where it was looked
 * at.
 *
 * The second fixed the unit and then asked the wrong question of it — how much
 * of the ball is allowed *off* the screen — so the solver pushed the sphere as
 * far as it was legally permitted to go, which is to say hard against the
 * edge, touching it. Technically "fully displayed". Visibly jammed.
 *
 * So the question here is where the sphere sits, not how far it may be shoved.
 *
 * The third pass is about how much air is enough. 1.6 radii leaves about six
 * tenths of a radius outside the ball — roughly 95px on a 1440px screen —
 * which is enough that nothing is cropped and not nearly enough for the shape
 * to read as *placed*. A sphere that close to an edge is a sphere being
 * pushed off the page, and the eye reads the gap rather than the object: it
 * stops looking round and starts looking like it is leaning on something.
 *
 * 2.3 radii on Hero and 2.0 on Ask AI put well over a radius of clear page
 * outside the silhouette, which is the point at which the ball is read as a
 * whole circle sitting in space. It also lands the sphere within a few pixels
 * of where the "One mind" dock parks it seven screens later, so the opening
 * and the payoff are framed identically rather than nearly-identically.
 *
 * It holds at any window size, because the radius it is measured in is the
 * same physical radius the visitor sees.
 */
const EDGE: Partial<Record<Key, number>> = {
  heroRight: 2.3,
  /*
   * Ask AI sits closer than anything else in the sequence, and the unit this
   * is measured in scales with it: 2.0 radii of a 590px sphere is most of the
   * page, which would shove the sphere back toward the middle and undo the
   * push-in. 1.35 keeps a third of a radius of clear page outside it and
   * still lands the near edge some 400px clear of the card's left margin.
   */
  heroLeft: 1.35,
};

/**
 * Where the cloud is parked on each of the nine screens, as a fraction of the
 * visible width either side of centre. One entry per keyframe, and the rule
 * behind them is a single sentence: **the graph sits opposite the words.**
 * Copy on the left puts it on the right, copy on the right puts it on the
 * left, full-width copy puts it dead centre and dims it.
 *
 * These used to be CSS: a 46vw box with `overflow-hidden`, slid left and right
 * with translateX. That works perfectly for the graph and is a disaster for
 * everything around it, because a canvas is only as big as its element and the
 * dust stops dead at the edge of the box. On the dark theme nobody noticed —
 * black particles thinning into black. On paper it is a rectangle of stars
 * sitting on the page with four hard corners, which is exactly what it looks
 * like: a div. So the canvas is the whole viewport now and the docking happens
 * in world space instead, as an offset added to every point right alongside
 * PAN.
 *
 * The number went from 0.229 to 0.30 for one reason: at 0.229 the cloud and
 * the heading were sharing the middle third of the page. "One mind behind all
 * of it." is set at 113px in a 560px column, and a shell parked 22.9% off
 * centre had its near edge inside the heading's own measure — legally beside
 * the text and optically on top of it. 0.30 clears the column entirely on
 * every side dock while still leaving the whole shape a comfortable distance
 * inside the frame.
 */
const DOCK_POS: number[] = [
  +0.3, // 0 Hero          — name left, graph right
  -0.3, // 1 Ask AI        — card right, graph left
  0, //    2 Metrics       — numbers full width, graph centred behind
  0, //    3 Proof         — compares full width, graph centred behind
  -0.3, // 4 Everything    — heading right, graph left
  +0.3, // 5 One mind      — heading left, graph right
  -0.3, // 6 Same mind     — heading right, graph left
  +0.3, // 7 Ishant        — heading left, graph right, mirroring Hero
  0, //    8 tail          — the knight leaves its dock and comes to rest
];

/**
 * The fraction of each screen at either end during which the dock does *not*
 * move. Everything in between is the crossing.
 *
 * This replaces an exponential ease toward a target that was picked by
 * `Math.round(-rect.top / innerHeight)`, and the difference matters more than
 * it sounds. That version had two independent clocks: the dock target flipped
 * on a scroll threshold, and the cloud then took its own ~700ms to walk there
 * on a timer nothing else in the sequence was attached to. Scroll faster than
 * the ease and the cloud is a screen behind the copy — arriving on the right
 * while the heading that wanted it on the right has already gone, then turning
 * round and chasing the next one. That is the "it jumps back and forth two or
 * three times" complaint, and it is not a tuning problem; a time-based
 * animation inside a scrub cannot be fixed by tuning, because the visitor
 * controls one clock and not the other.
 *
 * So the dock is now a pure function of scroll position, like every other
 * quantity in this loop. It holds still for the first and last 30% of each
 * screen and crosses during the middle 40% — which is exactly the window in
 * which the outgoing heading is leaving the top of the frame and the incoming
 * one has not yet arrived at the centre. The cloud is therefore always already
 * on the correct side by the time there is anything to be beside, it moves
 * once per screen and never twice, and scrubbing backwards runs it backwards
 * instead of sending it on another lap.
 */
const DOCK_HOLD = 0.3;

/**
 * Roll about the view axis, in radians, per keyframe. Interpolated between
 * keyframes exactly like PAN.
 *
 * This exists for one moment: the knight should not simply appear upright and
 * finished. It leans out of the orbit it was part of, and straightens as it
 * resolves. So the cloud picks up a tilt across the half-turn on segment 5 —
 * "Same mind, different lens" now rolls as well as turns, which reads as the
 * shape being handled rather than played back — and then segment 6 eases that
 * tilt back to zero over the same span in which the points migrate into the
 * chess piece. The result is that the knight is visibly assembling at an angle
 * and comes to rest vertical, arriving on its feet at the exact frame the
 * shape completes.
 *
 * Roll rather than pitch: a tilt about the depth axis is the one you can
 * actually see resolve on a mostly-flat point cloud. Pitching it away from
 * camera would foreshorten the silhouette instead, which is the one thing the
 * shape cannot afford to lose.
 */
const TILT: Partial<Record<Key, number>> = {
  mindTurn: 0.5, // ~29°, leaning
  knight: 0, // upright
  knightHold: 0,
};

/**
 * Camera distance per keyframe, as a multiple of the framing solved for the
 * widest shape. Everything else is 1.
 *
 * The camera has to be pulled back far enough to hold the scatter, which is
 * six times the diameter of anything else in the sequence — so the knight,
 * framed for its neighbour, sat at about half the height of its own column.
 * A shape that is the payoff of eight screens of scroll should not be the
 * smallest thing on screen. The push-in runs across the same segment the
 * points migrate into the piece, so it reads as the camera closing on
 * something rather than as a zoom control being nudged, and it carries on a
 * little further through the hold.
 *
 * It does not go as close as it can, though. The piece carries a halo standing
 * up to 30mm clear of its own surface, and framing the *knight* to the slot
 * crops the halo — the ears and the foot of the pedestal run off the top and
 * bottom edges and the object stops looking like it is sitting in space and
 * starts looking like it is jammed into a box. These numbers frame the halo
 * instead, which leaves the piece itself at about two thirds of the frame with
 * air above and below it.
 */
const ZOOM: Partial<Record<Key, number>> = {
  // Ask AI. A small push-in — about a tenth closer, not a third. The first
  // attempt took the camera to 0.62 and put a 520px sphere two thirds on
  // screen, which stops reading as "the graph has come closer" and starts
  // reading as "something has gone wrong with the zoom". The move only needs
  // to be felt, not announced: enough that the sphere has more presence beside
  // the card than it has anywhere else in the sequence, and enough crop at the
  // edge that it reads as continuing past the frame rather than sitting in it.
  /*
   * Ask AI. This was 0.9, and 0.9 was never what the visitor was actually
   * seeing: the pan-before-rotation fault above was pushing the sphere
   * another ~780 units at the camera on this exact keyframe, so the real
   * framing was somewhere near 0.35 and the moon was the biggest thing on the
   * page. That was an accident, but it was a *good* accident — a resolved,
   * textured body with a surface on it deserves one screen at a size where
   * the surface can be seen, and the whole point of drawing maria and
   * granulation is lost at forty pixels.
   *
   * So the accident is now the intent, at a value that was chosen rather than
   * fallen into. 0.55 puts the sphere at roughly 590px across — around 60% of
   * the viewport height, a clear step closer than Hero's 320px without
   * tipping into "something has gone wrong with the zoom" — and the moon at
   * its centre at about 68px, which is comfortably a disc rather than a dot.
   * The dock does the placing, so unlike before it comes closer *and* stays
   * hard left of the card instead of drifting back to the middle.
   */
  // Derived from ASK_AI_GRAPH_SIZE_PERCENT at the top of the file — that's
  // the number to change, not this one. 0.55 was the original 100% baseline;
  // a smaller value here means a closer camera, which is a bigger sphere.
  heroLeft: 0.55 * (100 / ASK_AI_GRAPH_SIZE_PERCENT),
  /*
   * The knight, with air around it.
   *
   * These were 0.86 / 0.78, framing a cloud that stands 837 units tall
   * against a viewport holding 1,190 — about 70%, which is tight but correct
   * on paper. It was not what shipped: the same rotation fault was magnifying
   * the piece 2.5× on the one keyframe with the largest dock and the most
   * unfortunate angle, so it ran off the top and bottom of the screen. With
   * the transform fixed the old numbers would work; they are opened up
   * anyway, because a shape that has just been cropped by a bug should come
   * back with visible margin rather than with a hairline of it.
   */
  knight: 0.92,
  knightHold: 0.84,
};

/**
 * Which entry in SHAPE_DEPTH each keyframe uses for its depth cue. Both the
 * range and the strength are interpolated between keyframes exactly like PAN
 * and TILT, so the piece gains its volume on the way in rather than switching
 * it on at the last frame.
 */
const DEPTH_OF: Record<Key, keyof typeof SHAPE_DEPTH> = {
  heroRight: 'sphere',
  heroLeft: 'sphere',
  scatterWide: 'scatter',
  scatterHold: 'scatter',
  sphere: 'sphere',
  mind: 'mind',
  mindTurn: 'mind',
  knight: 'knight',
  knightHold: 'knight',
};

/**
 * Cumulative yaw added per segment (radians). Index i = the segment from
 * KEYS[i] to KEYS[i+1].
 *
 * The two turns are doing real work. The half-turn on segment 5 is what makes
 * "Same mind, different lens" true rather than decorative — mind and
 * mindTurn are the identical point cloud, and the only thing that changes is
 * which side of it you are standing on. That only survives contact with a
 * viewer if the shape is roughly as wide as it is deep, which the old two-lobe
 * brain was emphatically not: turning it swung its silhouette by a third and
 * the half-turn read as the thing inflating. See mindShape.
 *
 * Segment 6 lands a touch *short* of 2π and segment 7 carries it 0.77 past —
 * so the piece finishes forming just before dead profile, swings through it,
 * and comes to rest at about 35° of three-quarter. Both ends of that are
 * chosen rather than convenient.
 *
 * Dead profile is where a knight is most recognisable and least believable: it
 * is the view every chess set is photographed from, and it is also the one
 * view in which a carved piece is indistinguishable from a flat cut-out
 * however solid the geometry underneath actually is. So it is passed through
 * rather than parked at — the shape resolves at the moment it is easiest to
 * read, and then turns, and the turning is what tells you it was never flat.
 *
 * Past about 45° it stops being worth it: the muzzle foreshortens into the
 * cheek, the mane swings across the neck, and the silhouette that did all the
 * work goes with them. 35° is the far end of the useful range, which is where
 * it stops.
 *
 * All of that happens over the same screen in which the piece slides out of
 * its side dock and settles in the middle of the frame. Turning and travelling
 * together is the point: it arrives centred, still, and having shown you every
 * side of itself on the way.
 */
const YAW_DELTA: number[] = new Array(SEG_COUNT).fill(0);
YAW_DELTA[0] = Math.PI * 0.4; // heroRight → heroLeft: "rotates a bit" while it moves
/*
 * ...and straight back again as it opens out.
 *
 * This is not decoration, it is the fix for a rectangle. The scatter is a slab
 * sized to overrun the frame — much wider than it is deep, because the depth
 * is bounded by how close a particle may come to the lens. Carrying 72° of
 * accumulated yaw into it turns that slab most of the way onto its edge, so
 * what the visitor sees is the *narrow* face: a bright band about half a
 * screen wide with two hard vertical borders, floating over Metrics and Proof.
 * Unwinding the turn as the cloud opens means the slab is presented square to
 * the camera at the exact moment it is at its widest, which is when it stops
 * being a shape at all and becomes a field. The turn itself is not lost —
 * it happens on the way in and is spent on the way out, which reads as the
 * cloud settling rather than as anything being corrected.
 */
YAW_DELTA[1] = -Math.PI * 0.4;
YAW_DELTA[5] = Math.PI; // mind → mindTurn: the other side of the same mind
/*
 * mindTurn → knight, and this number carries a correction in it.
 *
 * The total yaw at the knight keyframe is what decides which side of the
 * horse the visitor is looking at, and it is a *sum* — so adding the −0.4π
 * unwind on segment 1 to keep the scatter square to the camera silently took
 * 72° off the ending as well. The piece landed at about −80° instead of −9°:
 * muzzle pointing almost directly away from the lens, which is the one view
 * of a knight that is neither the recognisable profile nor the three-quarter,
 * and is just the back of a horse's head.
 *
 * So this segment carries the unwind back. π + 0.10 puts the knight at 2π +
 * 0.10 — square on to the camera in profile, a fraction past dead-on rather
 * than a fraction short of it, so the near cheek is already catching the
 * light as the shape resolves rather than the far one.
 */
YAW_DELTA[6] = Math.PI + 0.1;
/*
 * knight → knightHold: on through profile into three-quarter as it centres.
 *
 * 0.75 lands the piece at about 49° off profile. The old 0.77 was measured
 * from a start point 0.25 rad further back and finished at 35°; this is the
 * same move, ending a little more turned toward the camera, because the
 * complaint the whole of this segment exists to answer is "I want to see the
 * front and the side". The sequence now gives both, in that order: it forms
 * in profile, which is the view a knight is most legible from, and then turns
 * far enough that the muzzle, the near eye and the front of the chest are all
 * facing the reader when it comes to rest. Much past 50° and the muzzle
 * foreshortens into the cheek and the silhouette that did all the work goes
 * with it, so this is the far end of the useful range.
 */
YAW_DELTA[7] = 0.75;

/*
 * Per-shape captions used to be rendered by <GraphJourney> itself, as a
 * floating <p> centred over the sticky graph column. They're now real
 * headings in real content blocks in the .shell layout above, so this table
 * lives here only for reference — the same strings, in the same shape order.
 */
// const CAPTIONS: Partial<Record<Key, string>> = {
//   sphere: 'Everything, connected.',
//   mind: 'One mind behind all of it.',
//   alt: 'Same mind, different lens.',
//   icon: 'Ishant Shrivastava',
// };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (t: number) => t * t * (3 - 2 * t);
/** Fast start, slow finish — used for the citation highlight's fade-in. */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Every shape function returns positions in node-index order. But one node
 * *always* belongs at the origin — the person node (Ishant) — regardless of
 * shape, because that's the "queen bee" the rest of the graph orbits.
 * Rather than special-casing it inside every generator, we post-process:
 * find the person node's index and force its position to [0,0,0] here.
 */
function centerPerson(nodes: PNode[], positions: Vec3[]): Vec3[] {
  const i = nodes.findIndex((n) => n.kind === 'person');
  if (i < 0) return positions;
  const out = positions.slice();
  out[i] = [0, 0, 0];
  return out;
}

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
const DUST_COUNT = 28000;

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

const SCULPT_FROM = 1.25;
const SCULPT_TO = 2.0;

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

  /** Every keyframe's point cloud, indexed by node position — computed once per node set. */
  const shapes = useMemo<Record<Key, Vec3[]>>(() => {
    // Every shape passes through centerPerson so the queen-bee node sits at
    // the origin in every keyframe — sphere, scatter, brain, knight, all of
    // it. In the knight the origin lands in the upper base, just below the
    // plinth the carved head sits on.
    const cp = (positions: Vec3[]) => centerPerson(nodes, positions);
    // Shared references, not copies: a held keyframe must be the *same*
    // numbers as the one before it, or the interpolator spends a screenful
    // easing between two indistinguishable clouds and the field shimmers.
    const ball = cp(sphereShape(nodes.length));
    const wide = cp(scatterShape(nodes.length, 3.0, 44));
    const mind = cp(mindShape(nodes.length));
    const piece = cp(knightShape(nodes.length));
    return {
      heroRight: ball,
      heroLeft: ball,
      scatterWide: wide,
      scatterHold: wide,
      sphere: ball,
      mind,
      mindTurn: mind,
      knight: piece,
      knightHold: piece,
    };
  }, [nodes]);

  /**
   * The same nine keyframes for the dust, at its own far higher count. It is a
   * separate index space from the graph's, which is the point: the shapes are
   * generated from a count rather than from a node list precisely so that a
   * hundred real nodes and seven thousand motes can each be spread properly
   * over the whole of every shape, instead of the smaller set being handed one
   * contiguous slice of it.
   */
  const dustShapes = useMemo<Record<Key, Float32Array>>(() => {
    // The last slice of every keyframe is the same starfield, so those
    // particles never move: while the shape in front of them scatters,
    // reassembles and turns, the sky behind it holds still. That is most of
    // what sells them as distant rather than as more of the same cloud.
    const sky = starFieldShape(FIELD_COUNT, 907);
    const shaped = DUST_COUNT - FIELD_COUNT;
    const flatten = (points: Vec3[]) => {
      const out = new Float32Array(DUST_COUNT * 3);
      for (let i = 0; i < shaped; i++) {
        out[i * 3] = points[i][0];
        out[i * 3 + 1] = points[i][1];
        out[i * 3 + 2] = points[i][2];
      }
      for (let i = 0; i < FIELD_COUNT; i++) {
        const j = (shaped + i) * 3;
        out[j] = sky[i][0];
        out[j + 1] = sky[i][1];
        out[j + 2] = sky[i][2];
      }
      return out;
    };
    const ball = flatten(sphereShape(shaped));
    const wide = flatten(scatterShape(shaped, 3.0, 71));
    const mind = flatten(mindShape(shaped));
    const piece = flatten(knightShape(shaped));
    return {
      heroRight: ball,
      heroLeft: ball,
      scatterWide: wide,
      scatterHold: wide,
      sphere: ball,
      mind,
      mindTurn: mind,
      knight: piece,
      knightHold: piece,
    };
  }, []);

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
        blending: theme === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending,
      }),
    );
    const diameter = raw.dot * 3;
    dot.scale.set(diameter, diameter, 1);
    dot.userData.phase = raw.dot * 1.7;
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

  /** The scroll-to-shape mapping. Progress is measured across the whole outer section. */
  useEffect(() => {
    if (!visible) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
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
        const from = shapes[fromKey];
        const to = shapes[toKey];

        // The dolly is resolved first, because everything horizontal below is
        // measured against the visible width and the visible width depends on
        // where the camera is. Only written when it actually moves, so a
        // segment with no zoom change costs nothing.
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
        // World units across the frame at that distance. 0.9326 is 2·tan(25°),
        // the renderer's default 50° vertical field of view.
        const visibleWidth = 0.9326 * camDist.current * (size.w / Math.max(1, size.h));

        // Keyframe pan plus the dock offset, both fractions of that width and
        // both the same kind of thing — a sideways shift of the whole cloud —
        // so they are added and the rest of the loop never has to know there
        // were two of them.
        const panFrom = PAN[fromKey] ?? 0;
        const panTo = PAN[toKey] ?? 0;
        // The dock, read straight off the scroll position rather than eased
        // toward a target on its own timer — see DOCK_HOLD for why that
        // distinction is the whole of the side-to-side jitter fix.
        const dockT = easeInOut(
          clamp01((segF - segIdx - DOCK_HOLD) / (1 - 2 * DOCK_HOLD)),
        );
        const dockNow =
          DOCK_POS[segIdx] + (DOCK_POS[segIdx + 1] - DOCK_POS[segIdx]) * dockT;
        let panFrac = panFrom + (panTo - panFrom) * localT + dockNow;

        // Park the sphere against its own projected edge rather than at a
        // constant offset — see EDGE. 1.06 covers the silhouette, which sits a
        // little outside the true radius under perspective, plus the width of
        // a node's own sprite.
        //
        // Keyframes with no entry get 0, which puts the limit at half the
        // width and constrains nothing: their pan is zero and the dock alone
        // never reaches that far, so the scatter still overruns the screen and
        // the knight keeps its own framing.
        const edgeFrom = EDGE[fromKey] ?? 0;
        const edgeTo = EDGE[toKey] ?? 0;
        const edge = edgeFrom + (edgeTo - edgeFrom) * localT;
        const ballFrac = (OUTER * 1.06) / Math.max(1, visibleWidth);
        const limit = Math.max(0, 0.5 - ballFrac * edge);
        panFrac = Math.max(-limit, Math.min(limit, panFrac));

        const panX = panFrac * visibleWidth;

        // Roll, interpolated the same way. Zero everywhere except across the
        // lean into the knight — see TILT.
        const tiltFrom = TILT[fromKey] ?? 0;
        const tiltTo = TILT[toKey] ?? 0;
        const tilt = tiltFrom + (tiltTo - tiltFrom) * localT;
        const cosT = Math.cos(tilt);
        const sinT = Math.sin(tilt);

        // 0 while the graph is still a graph, 1 once it is a sculpture. Drives
        // the dust fade-in and the real nodes' shrink — see SCULPT_FROM.
        const sculpt = easeInOut(clamp01((segF - SCULPT_FROM) / (SCULPT_TO - SCULPT_FROM)));

        /*
         * Depth cue. `half` is roughly how far the current shape reaches along
         * the view axis and `back` is what a particle at the far end of that
         * range is dimmed to, both eased between keyframes. Everything the
         * piece has in the way of volume comes from these two numbers: without
         * them a point cloud is exactly as flat as it looks, because a
         * perspective camera 1,300 units away cannot tell you anything useful
         * about 200 units of depth on its own.
         */
        const depthFrom = SHAPE_DEPTH[DEPTH_OF[fromKey]];
        const depthTo = SHAPE_DEPTH[DEPTH_OF[toKey]];
        const half = depthFrom.half + (depthTo.half - depthFrom.half) * localT;
        const back = depthFrom.back + (depthTo.back - depthFrom.back) * localT;


        /*
         * Cross the same boundary the dust does, once, in either direction.
         * Anything open at the moment interaction closes is dismissed —
         * otherwise a readout card opened during Ask AI would hang around over
         * the metrics with no node under it any more — and the slot stops
         * taking pointer events entirely, so the canvas is not silently
         * swallowing clicks and hovers over the content beside it.
         */
        const nowInteractive = segF < SCULPT_FROM;
        if (interactive.current !== nowInteractive) {
          interactive.current = nowInteractive;
          if (!nowInteractive) {
            setHovered(null);
            setSelected(null);
          }
          const el = slotRef.current;
          if (el) el.style.pointerEvents = nowInteractive ? 'auto' : 'none';
        }

        // Cumulative yaw: every completed segment's full delta, plus the
        // current segment's partial delta — so a turn that already happened
        // stays turned instead of resetting each segment.
        let yaw = 0;
        for (let s = 0; s < segIdx; s++) yaw += YAW_DELTA[s];
        yaw += YAW_DELTA[segIdx] * localT;
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);

        /*
         * 0 → 1 over CITE_FADE_MS, from the moment the finished answer's
         * citations were set. Only used when the current highlight came from
         * an answer (`citing`) rather than a hover or a click — a visitor
         * pointing at a node wants to see it respond immediately, so that
         * path stays instant and skips this ramp entirely (see its use
         * below).
         */
        const citeT = citeStart.current
          ? easeOutCubic(clamp01((performance.now() - citeStart.current) / CITE_FADE_MS))
          : 1;

        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const [x0, y0, z0] = from[i];
          const [x1, y1, z1] = to[i];
          const x = x0 + (x1 - x0) * localT;
          const y = y0 + (y1 - y0) * localT;
          const z = z0 + (z1 - z0) * localT;
          /*
           * Yaw about the vertical axis, then roll about the depth axis, then
           * — and only then — the pan.
           *
           * The pan used to be added to `x` up at the top of this block,
           * before either rotation, and that single line was responsible for
           * three separate faults that all looked like different bugs:
           *
           *   · "Same mind, different lens" is the keyframe that sits at a
           *     half turn, where cos(yaw) is −1. A dock of −0.3 rotated
           *     through 180° is a dock of +0.3, so the one screen whose
           *     heading is right-aligned was the one screen the cloud was
           *     mirrored onto the right — sitting on top of its own heading,
           *     while every other screen obeyed the rule perfectly.
           *
           *   · The knight arrives at about −80° of yaw, where sin(yaw) is
           *     nearly −1. Nearly all of its dock was therefore being turned
           *     into a *z* offset: the piece was translated some 780 units
           *     straight at a camera sitting 1,300 away, which is a 2.5×
           *     magnification nobody asked for. That is why it stopped
           *     fitting on the screen, and why it drifted back to the middle
           *     instead of docking right — the horizontal component left over
           *     after the rotation was almost nothing.
           *
           *   · Same arithmetic, smaller angle, on Ask AI: 72° of yaw was
           *     pushing the sphere most of a screen closer and most of the
           *     way back to centre. The moon looked enormous there, which was
           *     a happy accident rather than a decision, and it is a decision
           *     now — see ZOOM.heroLeft.
           *
           * A dock is a statement about where something sits *on the screen*.
           * It cannot be expressed in a coordinate system that the shape is
           * about to be spun in. Rotate the shape, then move it sideways.
           */
          const rx = x * cosY + z * sinY;
          const rz = -x * sinY + z * cosY;
          const sx = rx * cosT - y * sinT;
          const sy = rx * sinT + y * cosT;
          n.fx = n.x = sx + panX;
          n.fy = n.y = sy;
          n.fz = n.z = rz;

          // Real nodes are shaded by depth too, once the field is a sculpture.
          // Leaving them at flat opacity put a hundred evenly-bright dots in
          // front of a cloud that had a front and a back, and they read as
          // stuck to the lens rather than as embedded in the piece.
          //
          // Measured off the un-panned position, because the cue is about
          // where a point sits inside its own shape. Feeding it the panned x
          // made the depth shading depend on which side of the page the cloud
          // happened to be docked to, so the sculpture lit differently on the
          // left than on the right.
          const cue = clamp01(
            0.5 + (sx * CAM.x + sy * CAM.y + rz * CAM.z) / (2 * half),
          );
          const shade = 1 - sculpt * (1 - (back + (1 - back) * cue));

          const dot = dots.current.get(n.id);
          if (dot) {
            const phase = (dot.userData.phase as number) ?? 0;
            const pulse = 1 + 0.05 * Math.sin(performance.now() * 0.0011 + phase);
            const base = n.dot * 3;

            // Blast-radius: dim non-neighbours, enlarge active + neighbours.
            // The person node stays bright regardless — it's the queen bee,
            // it never dims. Also enlarges by ~15% permanently so it reads
            // as the centre of the graph even before anything's hovered.
            const isPerson = n.kind === 'person';
            let scaleMul = pulse;
            let opacityMul = shade;
            if (isPerson) {
              scaleMul *= 1.15;
            }

            /*
             * The hand-off from graph to sculpture.
             *
             * For the first two screens this has to be a knowledge graph and
             * nothing else: the copy says "tap a node", every dot is a real
             * project or tool with a label and a readout behind it, and
             * padding that out with thousands of decorative motes would be
             * inventing data in the one place the visitor is being invited to
             * inspect it. So the dust does not exist at all through Hero and
             * Ask AI — not merely hidden, not scaled to zero and lurking in
             * the raycast, but a `THREE.Points` with `visible = false` that
             * is not in the graph's node list to begin with.
             *
             * After that the graph stops being a thing you read and starts
             * being a thing you watch — it has no labels, nothing is
             * clickable in practice, and its whole job is to hold a legible
             * silhouette. Two changes cross over together across that
             * boundary: the dust fades up, and the real nodes come down to
             * meet it. A project node is 20 units across against dust at
             * 3–8, so leaving them alone gives a band of fat coloured blobs
             * sitting on top of a fine mist, reading as two unrelated layers
             * rather than one field. Scaled to ~a third they land in the same
             * size band as the dust and the cloud reads as a single material.
             *
             * The person node shrinks by less than the rest: it is still the
             * origin every shape is built around, and in the knight it sits
             * at the heart of the turned pedestal, so it stays the one dot
             * that is obviously larger than everything else.
             */
            scaleMul *= 1 - sculpt * (1 - n.sculptDot / base);
            if (!isPerson) opacityMul *= 1 - sculpt * 0.1;

            if (highlightIds) {
              // Hover and selection are a direct response to the pointer and
              // stay instant (t = 1). A citation is the one case that ramps
              // in over CITE_FADE_MS instead of snapping — see citeT above.
              const t = citing ? citeT : 1;
              if (highlightIds.has(n.id)) {
                /*
                 * A cited node is the subject, not a neighbour of one, so it
                 * gets nearly the boost the hovered node gets. Using the
                 * neighbour scale would make an answer's citations look like
                 * incidental context.
                 */
                const targetScale = n.id === activeId ? 1.55 : citing ? 1.5 : 1.25;
                scaleMul *= 1 + (targetScale - 1) * t;
              } else if (!isPerson) {
                opacityMul *= 1 - (1 - 0.18) * t;
                scaleMul *= 1 - (1 - 0.85) * t;
              }
            }
            dot.scale.set(base * scaleMul, base * scaleMul, 1);
            const mat = dot.material as THREE.SpriteMaterial;
            mat.opacity = 0.94 * opacityMul;
          }
        }

        /*
         * The dust, through the same interpolation, the same pan, the same
         * yaw and the same roll — one field, one set of rules, two index
         * spaces. Skipped entirely while sculpt is zero, which is both free
         * and the thing that keeps the promise made two screens earlier: while
         * the copy says "tap a node", every point on screen is a node.
         */
        const cloud = dust.current;
        if (cloud) {
          cloud.begin(sculpt, back);
          if (sculpt > 0.002) {
            const dFrom = dustShapes[fromKey];
            const dTo = dustShapes[toKey];
            const FIELD_FROM = DUST_COUNT - FIELD_COUNT;

            // The sculpture: interpolated, panned, yawed, rolled.
            for (let i = 0; i < FIELD_FROM; i++) {
              const j = i * 3;
              const x0 = dFrom[j];
              const y0 = dFrom[j + 1];
              const z0 = dFrom[j + 2];
              const x = x0 + (dTo[j] - x0) * localT;
              const y = y0 + (dTo[j + 1] - y0) * localT;
              const z = z0 + (dTo[j + 2] - z0) * localT;
              const rx = x * cosY + z * sinY;
              const rz = -x * sinY + z * cosY;
              const fx = rx * cosT - y * sinT;
              const fy = rx * sinT + y * cosT;
              // Cue off the un-panned position, pan applied to the position
              // only — same correction as the node loop above, and it has to
              // be the same or the dust and the nodes dock to different
              // places and shade on different axes.
              const cue = clamp01(0.5 + (fx * CAM.x + fy * CAM.y + rz * CAM.z) / (2 * half));
              cloud.set(i, fx + panX, fy, rz, cue, 1);
            }

            /*
             * The sky: none of the above. Its own separate pass rather than a
             * branch inside the one above, because the whole point is that it
             * shares none of that arithmetic — no pan, no yaw, no roll, and no
             * interpolation either, since its position is identical in every
             * keyframe. It is written where it was authored and left there.
             *
             * That is what stops it turning its narrow edge to the camera and
             * printing a rectangle of stars across the middle of the page, and
             * it is also what makes it read as distance: parallax is the
             * absence of movement in the far field while the near one moves,
             * and the previous version moved both together.
             *
             * Held at 0.45 — quiet enough to sit behind the subject, present
             * enough to fill the corners the sculpture never reaches.
             */
            const SKY_HALF = OUTER * 2.2;
            for (let i = FIELD_FROM; i < cloud.count; i++) {
              const j = i * 3;
              const z = dFrom[j + 2];
              cloud.set(
                i,
                dFrom[j],
                dFrom[j + 1],
                z,
                clamp01(0.5 + (z * CAM.z) / (2 * SKY_HALF)),
                0.45,
              );
            }
          }
          cloud.end();
        }

        /*
          Labels: shown for a few different situations.
          - Always for person/role/project at the very start of scroll (hero
            state), same as before.
          - Any time a node is hovered or selected, its own label plus every
            neighbour's label — that's the "blast radius" callout.
        */
        const heroLabels = segIdx === 0 && localT < 0.1;
        for (const [id, label] of labels.current) {
          if (highlightIds?.has(id)) {
            label.visible = true;
          } else {
            label.visible = heroLabels && !highlightIds;
          }
        }

        /*
         * The only thing left for this stage to decide is how visible the
         * graph is, and there is exactly one case where the answer is "less":
         * Metrics and Proof, the two screens whose content spans the full
         * column with the cloud centred directly behind it. Everywhere else
         * the graph is docked clear of the text and runs at full strength —
         * including the knight, which the first version buried at 15% behind
         * 113px type and thereby threw away its own ending.
         *
         * Continuous, and driven by the same segF as everything else, so it
         * fades with the scroll instead of stepping on a threshold. Written
         * only when the rounded value actually changes, so a screen with no
         * fade in it costs one comparison a frame.
         */
        const dim = 1 - 0.55 * clamp01(Math.min(segF - 1.45, 3.85 - segF) / 0.45);
        const slot = slotRef.current;
        if (slot) {
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
    // `size` belongs in here now and did not use to. Everything horizontal in
    // the loop is measured against the visible width, which is derived from
    // the canvas dimensions — so the effect has to re-run when they arrive.
    // Without it the loop kept the closure from the very first render, when
    // the ResizeObserver had not reported yet and size was {0, 0}: the visible
    // width came out as zero, every pan and dock multiplied to nothing, and
    // the graph sat dead centre. It looked like it corrected itself on hover,
    // which is the tell — hovering changes highlightIds, highlightIds is a
    // dependency, and re-running the effect was rebuilding the closure with
    // the real size in it. The fix is the dependency, not the symptom.
  }, [visible, nodes, shapes, dustShapes, highlightIds, activeId, size.w, size.h]);

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
                onClick={() => askBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
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

        {/* Ask AI — card on the RIGHT, graph on the LEFT. Full "Ask about me" title kept in. */}
        <div ref={askBlockRef} id="ask" className="shell flex min-h-screen items-center justify-end scroll-mt-[24px]">
          <div className="w-full max-w-[540px] pointer-events-auto">
            <BorderGlow>
              <div className="px-[6px] pb-[36px] pt-[6px]">
                <AskAI />
              </div>
            </BorderGlow>

            {/*
              One line, and only while an answer has cited something.

              The graph lighting up beside the card is easy to miss if you are
              reading — the movement is in peripheral vision and the eye is
              busy. This says what just happened once, in the smallest voice
              available, and disappears with the next question. Without it the
              feature is invisible to the people it was built for; with a
              permanent caption it would be an instruction for a thing that
              has not happened yet.
            */}
            <p
              aria-live="polite"
              className="t-caption mt-[14px] text-center text-ash transition-opacity duration-500"
              style={{ opacity: citing ? 1 : 0 }}
            >
              {cited.size} node{cited.size === 1 ? '' : 's'} lit in the graph — everything
              this answer drew on.
            </p>
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
        <div style={{ height: '100vh' }} aria-hidden />
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
  const shape = useMemo(() => sphereShape(nodes.length), [nodes]);

  nodes.forEach((n, i) => {
    const p = shape[i];
    n.x = n.fx = p[0];
    n.y = n.fy = p[1];
    n.z = n.fz = p[2];
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
    <section id="graph" className="shell pt-[120px] scroll-mt-[96px]">
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

      <div ref={askRef} id="ask" className="mt-[60px] scroll-mt-[96px]">
        <BorderGlow>
          <div className="px-[6px] pb-[60px]">
            <AskAI />
          </div>
        </BorderGlow>
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