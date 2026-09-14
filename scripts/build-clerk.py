"""
Turn the Character Creator 'Jake' OBJ into a web-ready clerk GLB.

Four problems to solve:
  1. It's 9.1 MB / 60k tris. Way too heavy to ship on a portfolio page.
  2. It's in a T-pose. A clerk standing with arms straight out is a scarecrow.
  3. The textures it references aren't in the archive, so it has to be
     re-materialised with flat per-part colours.
  4. It's in centimetres with the feet ~6cm off the floor.
"""
import numpy as np
import trimesh
import fast_simplification

SRC = 'Obj/Jake.obj'
OUT = 'clerk.glb'

# Which material groups survive, what colour they become, and how hard to
# decimate them. Teeth/tongue/eyes/eyelashes/nails are dropped outright — the
# figure is seen from behind, in the dark, at three metres.
KEEP = {
    'CC_Base_BodySG':  ('skin',  0.72),
    'CC_Base_BodySG1': ('skin',  0.72),
    'CC_Base_BodySG2': ('skin',  0.72),
    'CC_Base_BodySG3': ('skin',  0.80),
    'RL_HairMeshSG':   ('hair',  0.80),
    'RL_HairMeshSG1':  ('hair',  0.82),
    'TrendyLongSleevesShirt_v01_7902_ShapeSG': ('shirt', 0.70),
    'Pants_14249_ShapeSG':  ('pants', 0.86),
    'Pants_14249_ShapeSG1': ('pants', 0.86),
    'hnsshoes_6176_ShapeSG':  ('shoe', 0.90),
    'hnsshoes_6176_ShapeSG1': ('shoe', 0.90),
    'hnsshoes_6176_ShapeSG2': ('shoe', 0.90),
    'hnsshoes_6176_ShapeSG3': ('shoe', 0.90),
}

COLOR = {
    'skin':  (176, 135, 101),
    'hair':  (17, 16, 16),   # black. Reads as very dark brown under a warm lamp.
    'shirt': (58, 74, 94),
    'pants': (43, 48, 58),
    'shoe':  (30, 31, 34),
}

# ── parse ────────────────────────────────────────────────────────────────
verts = []
faces_by_mat = {}
cur = None
for line in open(SRC):
    if line.startswith('v '):
        p = line.split()
        verts.append((float(p[1]), float(p[2]), float(p[3])))
    elif line.startswith('usemtl'):
        cur = line.split()[1]
    elif line.startswith('f '):
        if cur not in KEEP:
            continue
        idx = [int(t.split('/')[0]) - 1 for t in line.split()[1:]]
        tris = [(idx[0], idx[i], idx[i + 1]) for i in range(1, len(idx) - 1)]
        faces_by_mat.setdefault(cur, []).extend(tris)

V = np.array(verts, dtype=np.float64)
print(f'parsed {len(V)} verts, {sum(len(f) for f in faces_by_mat.values())} tris kept')

# ── pose: bring the arms down to the sides ───────────────────────────────
# The source is an A-pose, not a T-pose, which matters: the shoulder joint is
# at ~137cm but the hands already hang at ~112cm, so the arm axis is already
# ~26 deg below horizontal. Measuring the pivot off the far-out vertices (the
# obvious move) lands it at *hand* height and well inside the ribcage, and
# rotating about that point swings the whole arm out into a bodybuilder's
# lat spread while leaving a hole where the deltoid should be.
#
# So the pivot is the actual shoulder joint, found by looking at where the
# silhouette steps out from ribcage width to shoulder width.
torso = V[(np.abs(V[:, 0]) < 25) & (V[:, 1] > 120) & (V[:, 1] < 145)]
PY = float(np.median(torso[torso[:, 0] > 18][:, 1]))   # shoulder height
PX = 18.0            # where the deltoid ends and the arm begins
BLEND = 8.0          # cm over which the bend is spread, so the armpit doesn't tear
# Only the remainder of the 90 deg, since the arm starts 26 deg down already.
# A couple past vertical so the hands rest against the thighs rather than
# hanging free — that last couple of degrees is the whole difference between
# "arms down" and "at attention".
ANGLE = np.radians(66)


def drop_arms(P):
    out = P.copy()
    full = np.zeros(len(P), dtype=bool)
    for side in (+1, -1):
        d = side * (P[:, 0] - side * PX)
        m = d > 0
        t = np.clip(d[m] / BLEND, 0, 1)
        t = t * t * (3 - 2 * t)            # ease, so the shoulder rounds over
        th = -side * ANGLE * t
        x = P[m, 0] - side * PX
        y = P[m, 1] - PY
        c, s = np.cos(th), np.sin(th)
        out[m, 0] = x * c - y * s + side * PX
        out[m, 1] = x * s + y * c + PY
        full[m] |= t > 0.999          # past the blend: the arm proper
    return out, full


def straighten_arms(P, full):
    """Shear each arm back onto a straight vertical axis.

    Rotating an A-pose arm about the shoulder gets it pointing down but does
    not make it *straight*: the source has a natural carrying angle and a few
    degrees of elbow flex, and the eased shoulder blend adds a bow of its own
    on top. The result reads as crooked, and on a figure cropped at the waist
    by a counter the upper arm is most of what is visible, so the bow is the
    first thing the eye lands on.

    Fixing it by hand-tuning the rotation cannot work, because the problem is
    a curve rather than an angle. Instead: slice each arm into horizontal
    bands, measure where the centre of each band actually sits, and slide the
    whole band sideways so every centre lines up under the shoulder. Slices
    move rigidly, so cross-sections keep their shape and only the axis is
    corrected — a shear, not a squash. The topmost band defines the target and
    therefore moves by zero, which is what keeps the shoulder join seamless.
    """
    out = P.copy()
    for side in (+1, -1):
        m = full & (np.sign(P[:, 0]) == side)
        if m.sum() < 50:
            continue
        y = P[m, 1]
        lo, hi = y.min(), y.max()
        edges = np.linspace(lo, hi, 26)
        idx = np.clip(np.digitize(y, edges) - 1, 0, len(edges) - 2)
        ax, az = P[m, 0], P[m, 2]
        cx = np.array([ax[idx == b].mean() if (idx == b).any() else np.nan
                       for b in range(len(edges) - 1)])
        cz = np.array([az[idx == b].mean() if (idx == b).any() else np.nan
                       for b in range(len(edges) - 1)])
        # Fill any empty band from its neighbours so the shear stays smooth.
        for arr in (cx, cz):
            ok = ~np.isnan(arr)
            arr[~ok] = np.interp(np.flatnonzero(~ok), np.flatnonzero(ok), arr[ok])
        # Smooth the measured centreline before using it. Band means are
        # noisy where a band happens to straddle a cuff or a hand, and feeding
        # that noise straight into the shear makes the arm lumpy instead of
        # straight.
        k = np.ones(5) / 5
        for arr in (cx, cz):
            arr[:] = np.convolve(np.pad(arr, 2, mode='edge'), k, mode='valid')
        tx, tz = cx[-1], cz[-1]          # top band = under the shoulder
        # Fade the correction in over the top few bands. Without this the
        # deltoid (which is inside the blend zone and so never shears) meets
        # fully-sheared upper arm at a step, and the shoulder gets a notch
        # cut out of it.
        w = np.clip(np.linspace(0, 1, len(cx))[::-1] / 0.28, 0, 1)[::-1]
        w = w * w * (3 - 2 * w)
        out[m, 0] = ax + (tx - cx[idx]) * w[idx]
        out[m, 2] = az + (tz - cz[idx]) * w[idx]
    return out


full = np.zeros(len(V), dtype=bool)
V, full = drop_arms(V)
V = straighten_arms(V, full)

# ── to metres, feet on the floor, facing away from the viewer ────────────
V *= 0.01
V[:, 1] -= V[:, 1].min()
print(f'height {V[:,1].max():.3f} m, span {np.ptp(V[:,0]):.3f} m')

# ── decimate per part, give each a real material, export ─────────────────
# Vertex colours were the first attempt and produced a pure white figure: the
# exporter wrote COLOR_0 as raw unsigned bytes with no `normalized` flag, so
# three read 255 as 255 and every channel blew out. Real glTF materials with a
# baseColorFactor avoid the whole class of problem and cost nothing here,
# since each part is a single flat colour anyway.
scene = trimesh.Scene()
for i, (mat, tris) in enumerate(faces_by_mat.items()):
    part, reduction = KEEP[mat]
    F = np.array(tris, dtype=np.int64)
    used, F2 = np.unique(F, return_inverse=True)
    P = V[used]
    F2 = F2.reshape(-1, 3).astype(np.int32)
    P2, F3 = fast_simplification.simplify(
        P.astype(np.float32), F2, target_reduction=reduction,
    )
    # process=True welds duplicate vertices, which is what lets trimesh derive
    # *smooth* vertex normals. Without the weld every triangle keeps its own
    # corners, normals come out per-face, and the mesh shades like crumpled
    # paper — which is exactly what shipped last time.
    mesh = trimesh.Trimesh(vertices=P2, faces=F3, process=True)
    mesh.fix_normals()
    if part == 'skin':
        # Decimation shrinks the clothing a hair and the shoulder bend moves
        # skin and sleeve by slightly different amounts, so without this the
        # deltoids and knees poke through as orange speckles. Push the body
        # in behind whatever is covering it.
        mesh.vertices -= mesh.vertex_normals * 0.012
    r, g, b = COLOR[part]
    mesh.visual = trimesh.visual.TextureVisuals(
        material=trimesh.visual.material.PBRMaterial(
            name=part,
            baseColorFactor=[r / 255, g / 255, b / 255, 1.0],
            metallicFactor=0.0,
            roughnessFactor=0.88 if part != 'shoe' else 0.6,
        )
    )
    scene.add_geometry(mesh, node_name=f'{part}_{i}')
    print(f'  {mat:45s} {len(F2):6d} -> {len(F3):6d} tris  ({part})')

glb = trimesh.exchange.gltf.export_glb(scene, include_normals=True)
open(OUT, 'wb').write(glb)
print(f'\n{OUT}: {sum(len(g.faces) for g in scene.geometry.values())} tris, '
      f'{len(glb)/1024:.0f} KB')