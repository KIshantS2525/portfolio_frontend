// src/components/knight/config.ts

/**
 * Every tunable in one place.
 *
 * The unit throughout this module is one millimetre of the specified piece.
 * The model is normalised to `dimensions.totalHeight` on load, whatever scale
 * the source GLB happens to be authored at, so every number below can be read
 * straight off the dimension table rather than being a magic multiplier —
 * `dustSpread: [5, 35]` really is five to thirty-five millimetres off the
 * surface. The camera works in the same units.
 */

export type KnightConfig = typeof defaultConfig;

export const defaultConfig = {
  /** Where the GLB lives, relative to the site root. See README.md in this folder. */
  modelUrl: '/models/knight.glb',

  /* ── Geometry ─────────────────────────────────────────────────────────── */
  dimensions: {
    /** The model is uniformly scaled so its bounding box is this tall. */
    totalHeight: 160,
    /** Base sits on y = 0 so the floor reflection has something to sit on. */
    seatOnFloor: true,
  },

  /* ── Particles ────────────────────────────────────────────────────────── */
  /** Core particles sampled from the mesh surface. 10k–20k is the sweet spot. */
  particleCount: 16000,
  /** Free-floating dust around the piece. */
  floatingDustCount: 2200,
  /** Millimetres off the surface that dust occupies. */
  dustSpread: [5, 35] as [number, number],
  /**
   * Base point size in pixels at a reference distance. Tiny particles get
   * `particleSize`, the ~6% picked as bright nodes get up to 3x it.
   */
  particleSize: 1.15,
  particleOpacity: 0.92,
  /** Fraction promoted to "bright node" — larger, fully opaque, the ones the network hangs off. */
  brightNodeRatio: 0.06,

  /* ── Connection network ───────────────────────────────────────────────── */
  /**
   * Millimetres. Two bright nodes closer than this may be joined. Raising it
   * grows the edge count roughly cubically, so it is paired with maxConnections
   * below as a hard ceiling.
   */
  connectionDistance: 11,
  /** Hard cap on drawn edges. The build stops here however many candidates exist. */
  maxConnections: 7000,
  /** Only every Nth bright node is eligible, which is what keeps the web sparse. */
  connectionSubsample: 2,
  connectionOpacity: 0.22,

  /* ── Motion ───────────────────────────────────────────────────────────── */
  /** Amplitude of the procedural drift, in millimetres. */
  noiseStrength: 1.6,
  noiseSpeed: 0.18,
  /** Breathing: fractional scale swing and its period in seconds. */
  breathAmount: 0.022,
  breathPeriod: 7.5,
  /** Idle turntable speed, radians/second. Stops while the pointer is down. */
  rotationSpeed: 0.055,
  /** Pointer repulsion radius (mm) and strength (mm of displacement). */
  mouseRepulsion: 26,
  mouseRepulsionStrength: 9,
  /** How fast the camera's inertia bleeds off. 0 = instant stop, 1 = never. */
  rotationInertia: 0.94,

  /* ── Look ─────────────────────────────────────────────────────────────── */
  /** Shares must sum to 1. Gold is deliberately rare — it reads as an accent. */
  palette: {
    electric: { color: '#2b8cff', share: 0.6 },
    cyan: { color: '#43e6ff', share: 0.2 },
    white: { color: '#ffffff', share: 0.08 },
    violet: { color: '#8052ff', share: 0.06 },
    teal: { color: '#15c8a0', share: 0.04 },
    gold: { color: '#ffb829', share: 0.02 },
  },
  background: '#02040a',
  bloomStrength: 0.85,
  bloomRadius: 0.5,
  bloomThreshold: 0.12,
  /** Mirrored copy of the cloud under the floor. First thing to drop on weak hardware. */
  floorReflection: true,
  floorOpacity: 0.18,

  /* ── Camera ───────────────────────────────────────────────────────────── */
  /** Cinematic 3/4 opening view: azimuth and elevation in radians, distance in mm. */
  cameraStart: { azimuth: -0.78, elevation: 0.22, distance: 330 },
  cameraDistanceRange: [180, 620] as [number, number],
  /** Elevation is clamped so the piece is never viewed from directly above or below. */
  elevationRange: [-0.5, 0.95] as [number, number],
};

/**
 * Mobile trim. Bloom at full resolution and 16k points is a lot to ask of a
 * phone, so the count drops, the network thins and the reflection goes. Applied
 * automatically by ParticleKnight unless `respectDeviceProfile` is turned off.
 */
export function mobileProfile(config: KnightConfig): KnightConfig {
  return {
    ...config,
    particleCount: Math.round(config.particleCount * 0.4),
    floatingDustCount: Math.round(config.floatingDustCount * 0.4),
    maxConnections: Math.round(config.maxConnections * 0.35),
    connectionSubsample: config.connectionSubsample * 2,
    bloomStrength: config.bloomStrength * 0.8,
    floorReflection: false,
  };
}