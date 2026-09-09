// src/components/graph/DustCloud.ts
import * as THREE from 'three';

/**
 * The dust the sculpture is made of.
 *
 * The knight used to be drawn out of the graph's own nodes plus 190 decorative
 * ones, each of them a `THREE.Sprite` created by ForceGraph3D's
 * `nodeThreeObject`. That ceiling is not arbitrary — a sprite is an object,
 * a geometry, a material and a draw call each, so a few hundred is genuinely
 * all you can spend before the frame budget goes. And a few hundred points is
 * nowhere near enough to describe a chess piece: it gets you a dotted outline
 * with gaps, which is exactly what the piece looked like.
 *
 * So the dust stops being nodes. It is one `THREE.Points` per size bucket —
 * three buffers, three draw calls, several thousand particles — added
 * straight into the graph's scene and driven by the same keyframe
 * interpolation as everything else. The real graph nodes stay sprites,
 * because they are the ones that have to be labelled, hovered and clicked;
 * the dust has none of that and gives all of it up in exchange for being
 * twenty times more numerous.
 *
 * Three buckets rather than one because `PointsMaterial.size` is per material,
 * and a field where every mote is exactly the same size reads as a printed
 * halftone rather than as dust hanging in air.
 *
 * Per-particle alpha comes from giving the colour attribute four components,
 * which is three's own signal to compile the points shader with
 * `USE_COLOR_ALPHA`. Only that fourth float is rewritten each frame: the
 * colours never change, so the per-frame cost is one float per particle on top
 * of its position.
 */

/**
 * Sizes for the three buckets, in world units.
 *
 * Much larger than they look, because the star texture spends most of its
 * radius on halo: the bright core is 22% of the quad, where the old disc was
 * opaque out to 40%. A particle therefore has to be about twice as wide to
 * present the same visible point — and gets its glow, and its faint
 * diffraction spikes, for free in the space that buys.
 */
const BUCKET_SIZE = [7.5, 11.5, 17.5];
/** Ceiling on a particle's alpha, so the densest part of the piece still has air in it. */
const MAX_ALPHA = 0.9;

export class DustCloud {
  readonly count: number;
  readonly objects: THREE.Points[];

  private positions: Float32Array[] = [];
  private colors: Float32Array[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.PointsMaterial[] = [];
  private sculpt = 0;
  private back = 1;

  /**
   * @param count    how many particles in total
   * @param palette  ambient colours, cycled; these are the page's own
   *                 background-particle hues, so the field reads as the same
   *                 material as everything else drifting behind the content
   * @param map      the shared star texture — tight core, halo, faint spikes
   * @param additive additive blending on the dark theme, where overlapping
   *                 motes should sum into a glow; plain alpha on the light
   *                 one, where adding light to white paper does nothing
   */
  constructor(count: number, palette: string[], map: THREE.Texture, additive: boolean) {
    this.count = count;

    // Bucket i by i % 3, so each bucket is spread evenly across the index
    // range and therefore evenly across every part of every shape — the size
    // mix is the same in the knight's ears as in its base.
    const sizes = [0, 1, 2].map((b) => Math.floor((count - b + 2) / 3));
    const tint = new THREE.Color();

    this.objects = sizes.map((n, bucket) => {
      const position = new Float32Array(n * 3);
      const color = new Float32Array(n * 4);
      for (let s = 0; s < n; s++) {
        const global = s * 3 + bucket;
        tint.set(palette[global % palette.length]);
        color[s * 4] = tint.r;
        color[s * 4 + 1] = tint.g;
        color[s * 4 + 2] = tint.b;
        color[s * 4 + 3] = 0;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(color, 4));
      // The cloud is rebuilt every frame and never sits still, so a bounding
      // sphere computed from one frame's positions would cull it the next.
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

      const material = new THREE.PointsMaterial({
        size: BUCKET_SIZE[bucket],
        map,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = -1;
      // The graph raycasts the scene to find what the pointer is over. Dust is
      // scenery and must never be the answer, so it declines to be hit at all
      // rather than relying on being filtered out afterwards.
      points.raycast = () => {};
      points.userData.dust = true;

      this.positions.push(position);
      this.colors.push(color);
      this.geometries.push(geometry);
      this.materials.push(material);
      return points;
    });
  }

  /**
   * Open a frame.
   *
   * @param sculpt 0 while the graph is still a graph, 1 once it is a
   *               sculpture. At 0 nothing is drawn at all — the field does not
   *               exist during the two screens where the visitor is being
   *               invited to read the graph as data.
   * @param back   alpha multiplier for the particle furthest from the camera.
   *               This is the whole depth cue: near motes at full strength,
   *               far ones dimmed, which is what turns a flat scatter of dots
   *               into something with a front and a back.
   */
  begin(sculpt: number, back: number) {
    this.sculpt = sculpt;
    this.back = back;
    for (const points of this.objects) points.visible = sculpt > 0.002;
  }

  /**
   * Place particle `i`.
   *
   * @param cue    0 at the far side of the cloud, 1 at the near — the depth
   *               shading that gives it a front and a back.
   * @param weight a flat multiplier on top of that, for particles which belong
   *               to the scene rather than to the subject. The starfield rides
   *               at half, which is the difference between a sky behind the
   *               sculpture and a second cloud competing with it.
   */
  set(i: number, x: number, y: number, z: number, cue: number, weight = 1) {
    const bucket = i % 3;
    const slot = (i - bucket) / 3;
    const p = this.positions[bucket];
    p[slot * 3] = x;
    p[slot * 3 + 1] = y;
    p[slot * 3 + 2] = z;
    this.colors[bucket][slot * 4 + 3] =
      this.sculpt * (this.back + (1 - this.back) * cue) * weight * MAX_ALPHA;
  }

  /** Close the frame and upload. */
  end() {
    if (this.sculpt <= 0.002) return;
    for (const geometry of this.geometries) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    }
  }

  dispose() {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}