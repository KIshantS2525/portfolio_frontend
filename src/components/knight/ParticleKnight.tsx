// src/components/knight/ParticleKnight.tsx
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { defaultConfig, mobileProfile, type KnightConfig } from './config.ts';
import { sampleKnight } from './sampleKnight.ts';
import { createParticleSystem } from './ParticleSystem.ts';
import { createConnectionNetwork } from './ConnectionNetwork';
import { createDustField } from './DustField.ts';
import { createCameraController } from './CameraController.ts';

/**
 * The whole piece, assembled.
 *
 * Plain three.js inside a React ref rather than react-three-fiber: the project
 * already has three as a dependency, R3F would be a new one, and there is no
 * React state in here worth reconciling — the render loop owns everything and
 * runs at 60fps, which is exactly the case R3F's declarative model buys you
 * the least on. React's job here is mount, unmount and one loading flag.
 *
 * Scene graph, back to front:
 *   floor        — a soft radial pool, so the piece is standing on something
 *   reflection   — the same clouds mirrored under it, dimmed
 *   dust         — the atmosphere
 *   connections  — the sparse web
 *   particles    — the piece itself
 *
 * Everything is disposed on unmount. A WebGL context that outlives its
 * component is a leak the browser will not collect for you, and with a
 * composer, two render targets and a 16k-point buffer attached to it, it is
 * not a small one.
 */
export function ParticleKnight({
  config: overrides,
  className,
  respectDeviceProfile = true,
}: {
  config?: Partial<KnightConfig>;
  className?: string;
  respectDeviceProfile?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported'>('loading');

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;

    const isCoarse = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 820;
    const base: KnightConfig = { ...defaultConfig, ...overrides };
    const config = respectDeviceProfile && isCoarse ? mobileProfile(base) : base;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !isCoarse, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setStatus('unsupported');
      return;
    }

    let disposed = false;
    let raf = 0;
    const cleanups: Array<() => void> = [];

    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    // Capped at 2: beyond that the bloom pass is rendering four times the
    // pixels for a difference nobody can see on a display that dense.
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    renderer.setSize(width, height);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(new THREE.Color(config.background), 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'pan-y';

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(new THREE.Color(config.background), 0.0016);

    const camera = new THREE.PerspectiveCamera(38, width / height, 1, 4000);

    const controller = createCameraController(camera, renderer.domElement, config);
    cleanups.push(controller.dispose);

    /* ── Floor ─────────────────────────────────────────────────────────── */
    // A canvas radial gradient rather than a texture file or a shader: it is
    // four lines, it needs no network request, and a soft pool of light is all
    // the floor has to be.
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = floorCanvas.height = 256;
    const ctx = floorCanvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(60,140,255,0.30)');
    gradient.addColorStop(0.45, 'rgba(30,70,150,0.10)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(config.dimensions.totalHeight * 3.2, config.dimensions.totalHeight * 3.2),
      new THREE.MeshBasicMaterial({
        map: floorTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    /* ── Composer ──────────────────────────────────────────────────────── */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      config.bloomStrength,
      config.bloomRadius,
      config.bloomThreshold,
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    /* ── Build ─────────────────────────────────────────────────────────── */
    // The pointer is projected onto a plane through the piece that always
    // faces the camera, so repulsion follows the cursor in screen space no
    // matter how the piece has been turned.
    const pointerPlane = new THREE.Plane();
    const raycaster = new THREE.Raycaster();
    const pointerWorld = new THREE.Vector3();
    const centre = new THREE.Vector3(0, config.dimensions.totalHeight * 0.45, 0);
    const clock = new THREE.Clock();

    sampleKnight(config)
      .then(({ positions, normals }) => {
        if (disposed) return;

        const particles = createParticleSystem(positions, config, pixelRatio);
        const network = createConnectionNetwork(particles.nodePositions, config);
        const dust = createDustField(positions, normals, particles.material, config);

        const piece = new THREE.Group();
        piece.add(particles.points, network.lines, dust.points);
        scene.add(piece);

        // Reflection: the same three objects mirrored through y = 0 and dimmed.
        // Re-using the geometries means this costs three extra draw calls and
        // no extra memory, where a render-target mirror would cost a whole
        // second pass over the scene.
        let reflection: THREE.Group | null = null;
        if (config.floorReflection) {
          reflection = new THREE.Group();
          const mirroredParticles = new THREE.Points(particles.points.geometry, particles.material.clone());
          const mirroredDust = new THREE.Points(dust.points.geometry, dust.material.clone());
          const mirroredLines = new THREE.LineSegments(
            network.lines.geometry,
            (network.lines.material as THREE.LineBasicMaterial).clone(),
          );
          for (const child of [mirroredParticles, mirroredDust]) {
            const m = child.material as THREE.ShaderMaterial;
            m.uniforms = THREE.UniformsUtils.clone(m.uniforms);
            m.uniforms.uOpacity.value *= config.floorOpacity;
          }
          (mirroredLines.material as THREE.LineBasicMaterial).opacity *= config.floorOpacity;
          reflection.add(mirroredParticles, mirroredDust, mirroredLines);
          reflection.scale.y = -1;
          scene.add(reflection);
        }

        cleanups.push(() => {
          scene.remove(piece);
          if (reflection) scene.remove(reflection);
          particles.dispose();
          network.dispose();
          dust.dispose();
        });

        setStatus('ready');

        const tick = () => {
          if (disposed) return;
          raf = requestAnimationFrame(tick);
          const dt = Math.min(clock.getDelta(), 0.05);
          const elapsed = clock.getElapsedTime();

          controller.update(dt);

          // Project the pointer onto the camera-facing plane through the piece.
          let pointer: THREE.Vector3 | null = null;
          const ndc = controller.pointerNDC;
          if (ndc) {
            pointerPlane.setFromNormalAndCoplanarPoint(
              camera.getWorldDirection(new THREE.Vector3()).negate(),
              centre,
            );
            raycaster.setFromCamera(ndc, camera);
            if (raycaster.ray.intersectPlane(pointerPlane, pointerWorld)) pointer = pointerWorld;
          }

          particles.update(elapsed, pointer);
          const breath = particles.material.uniforms.uBreath.value as number;
          network.update(breath);
          dust.material.uniforms.uTime.value = elapsed;
          dust.material.uniforms.uBreath.value = breath;
          dust.material.uniforms.uPointer.value.copy(particles.material.uniforms.uPointer.value);
          dust.material.uniforms.uPointerActive.value =
            particles.material.uniforms.uPointerActive.value;

          if (reflection) {
            for (const child of reflection.children) {
              const m = (child as THREE.Points).material as THREE.ShaderMaterial;
              if (m.uniforms) {
                m.uniforms.uTime.value = elapsed;
                m.uniforms.uBreath.value = breath;
              }
            }
          }

          composer.render();
        };
        raf = requestAnimationFrame(tick);
      })
      .catch((error) => {
        console.error('[ParticleKnight]', error);
        if (!disposed) setStatus('unsupported');
      });

    /* ── Resize ────────────────────────────────────────────────────────── */
    const observer = new ResizeObserver(() => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      bloom.setSize(w, h);
    });
    observer.observe(mount);
    cleanups.push(() => observer.disconnect());

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanups.forEach((fn) => fn());
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      floorTexture.dispose();
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      // forceContextLoss is what actually frees the GPU-side context; without
      // it a page that mounts this a few times will hit the browser's context
      // limit and start killing the oldest ones.
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // Rebuilt only when the caller hands over a different config object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides, respectDeviceProfile]);

  return (
    <div
      ref={host}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', background: defaultConfig.background }}
    >
      {status === 'unsupported' && (
        <p
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            margin: 0,
            color: '#6f7a90',
            font: '400 14px/1.5 system-ui, sans-serif',
          }}
        >
          This view needs WebGL.
        </p>
      )}
    </div>
  );
}

export default ParticleKnight;