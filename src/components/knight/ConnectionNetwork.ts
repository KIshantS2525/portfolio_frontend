// src/components/knight/ConnectionNetwork.ts
import * as THREE from 'three';
import type { KnightConfig } from './config.ts';

/**
 * The sparse web between bright nodes.
 *
 * The naive version of this — test every particle against every other — is
 * 16,000² = 256 million distance checks, which locks the tab for several
 * seconds on load. Two things bring it down to a few milliseconds:
 *
 *   only bright nodes are eligible. Roughly 6% of particles are promoted to
 *     bright nodes, and `connectionSubsample` thins that further, so the
 *     candidate set is a few hundred rather than sixteen thousand. This is
 *     also what makes the web read as sparse: a network drawn between every
 *     particle is not a constellation, it is a solid.
 *
 *   a spatial hash grid sized to the connection distance. Each node only
 *     tests the 27 cells in its own neighbourhood, so the cost is linear in
 *     node count instead of quadratic.
 *
 * Edges are built once from the home positions and then held. They are drawn
 * with the same breathing scale as the particle cloud so the web inflates with
 * it, but they deliberately do NOT follow the per-particle noise drift: the
 * lines are computed on the CPU, and re-deriving 16,000 drifting positions
 * every frame to keep a few thousand line ends attached would cost more than
 * the entire rest of the render. At the drift amplitudes here (a millimetre or
 * two) the join is not perceptible.
 */

export type ConnectionNetwork = {
  lines: THREE.LineSegments;
  update(breath: number): void;
  dispose(): void;
  edgeCount: number;
};

export function createConnectionNetwork(
  nodePositions: Float32Array,
  config: KnightConfig,
): ConnectionNetwork {
  const stride = Math.max(1, config.connectionSubsample);
  const candidates: number[] = [];
  for (let i = 0; i < nodePositions.length / 3; i += stride) candidates.push(i);

  const radius = config.connectionDistance;
  const cell = radius;
  const key = (x: number, y: number, z: number) =>
    `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;

  const grid = new Map<string, number[]>();
  for (const i of candidates) {
    const k = key(nodePositions[i * 3], nodePositions[i * 3 + 1], nodePositions[i * 3 + 2]);
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  }

  const verts: number[] = [];
  const seen = new Set<number>();
  const radiusSq = radius * radius;

  outer: for (const i of candidates) {
    const xi = nodePositions[i * 3];
    const yi = nodePositions[i * 3 + 1];
    const zi = nodePositions[i * 3 + 2];
    const cx = Math.floor(xi / cell);
    const cy = Math.floor(yi / cell);
    const cz = Math.floor(zi / cell);
    for (let gx = -1; gx <= 1; gx++) {
      for (let gy = -1; gy <= 1; gy++) {
        for (let gz = -1; gz <= 1; gz++) {
          const bucket = grid.get(`${cx + gx},${cy + gy},${cz + gz}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue; // each pair once
            const dx = xi - nodePositions[j * 3];
            const dy = yi - nodePositions[j * 3 + 1];
            const dz = zi - nodePositions[j * 3 + 2];
            if (dx * dx + dy * dy + dz * dz > radiusSq) continue;
            // Pair key packed into one number — a Set of strings here is a
            // measurable chunk of the build time at this edge count.
            const pair = i * 100000 + j;
            if (seen.has(pair)) continue;
            seen.add(pair);
            verts.push(
              xi,
              yi,
              zi,
              nodePositions[j * 3],
              nodePositions[j * 3 + 1],
              nodePositions[j * 3 + 2],
            );
            if (verts.length / 6 >= config.maxConnections) break outer;
          }
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));

  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(config.palette.electric.color),
    transparent: true,
    opacity: config.connectionOpacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;

  return {
    lines,
    edgeCount: verts.length / 6,
    update(breath) {
      lines.scale.setScalar(breath);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}