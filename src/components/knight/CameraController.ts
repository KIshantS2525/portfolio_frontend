// src/components/knight/CameraController.ts
import * as THREE from 'three';
import type { KnightConfig } from './config.ts';

/**
 * Orbit with inertia, written here rather than pulled from OrbitControls.
 *
 * OrbitControls brings pan, zoom-to-cursor, keyboard handling and its own
 * damping model, and then has to be argued out of most of it. This needs four
 * things — drag to orbit, wheel and pinch to dolly, momentum that carries and
 * decays, and an idle turntable that yields the moment you touch it — and
 * those are about eighty lines. Spherical coordinates around a fixed target,
 * so the piece can never be dragged out of frame.
 *
 * Velocity is tracked in the same units as the drag, so the flick that leaves
 * your finger and the spin that follows it are continuous rather than the
 * spin being a separate animation that starts once you let go.
 */

export type CameraController = {
  update(dt: number): void;
  /** The pointer in normalised device coords, or null when it has left. */
  pointerNDC: THREE.Vector2 | null;
  dispose(): void;
};

export function createCameraController(
  camera: THREE.PerspectiveCamera,
  element: HTMLElement,
  config: KnightConfig,
): CameraController {
  const target = new THREE.Vector3(0, config.dimensions.totalHeight * 0.45, 0);
  let azimuth = config.cameraStart.azimuth;
  let elevation = config.cameraStart.elevation;
  let distance = config.cameraStart.distance;

  let velAzimuth = 0;
  let velElevation = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  /** Pinch distance from the previous touch frame, for two-finger dolly. */
  let pinch = 0;

  const pointerNDC = new THREE.Vector2();
  let pointerInside = false;

  const [minDistance, maxDistance] = config.cameraDistanceRange;
  const [minElevation, maxElevation] = config.elevationRange;

  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    element.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    pointerNDC.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    pointerInside = true;
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    // Scaled by element width so the same physical drag turns the piece the
    // same amount whether it is in a sidebar or full-bleed.
    velAzimuth = -(dx / rect.width) * 6;
    velElevation = -(dy / rect.height) * 5;
    azimuth += velAzimuth;
    elevation += velElevation;
  };

  const endDrag = (e: PointerEvent) => {
    dragging = false;
    if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
  };

  const onPointerLeave = () => {
    pointerInside = false;
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    distance = THREE.MathUtils.clamp(distance * (1 + e.deltaY * 0.0012), minDistance, maxDistance);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const spread = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (pinch) {
      distance = THREE.MathUtils.clamp(distance * (pinch / spread), minDistance, maxDistance);
    }
    pinch = spread;
  };
  const onTouchEnd = () => {
    pinch = 0;
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', endDrag);
  element.addEventListener('pointerleave', onPointerLeave);
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('touchmove', onTouchMove, { passive: true });
  element.addEventListener('touchend', onTouchEnd);

  return {
    get pointerNDC() {
      return pointerInside ? pointerNDC : null;
    },
    update(dt) {
      if (!dragging) {
        // Momentum, then the idle turntable underneath it. The turntable is
        // scaled down while momentum is still significant so a flick does not
        // fight the ambient spin on the way to a stop.
        azimuth += velAzimuth;
        elevation += velElevation;
        velAzimuth *= config.rotationInertia;
        velElevation *= config.rotationInertia;
        const settled = 1 - Math.min(1, Math.abs(velAzimuth) * 60);
        azimuth += config.rotationSpeed * dt * settled;
      }
      elevation = THREE.MathUtils.clamp(elevation, minElevation, maxElevation);

      camera.position.set(
        target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
        target.y + distance * Math.sin(elevation),
        target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
      );
      camera.lookAt(target);
    },
    dispose() {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endDrag);
      element.removeEventListener('pointercancel', endDrag);
      element.removeEventListener('pointerleave', onPointerLeave);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
    },
  };
}