// src/components/game/noticeBoard.ts
import * as THREE from 'three';

/**
 * Paints a title + one line of body copy into a small canvas, the same trick
 * the archive uses for locker doors and the wall chart: the geometry is a
 * plain plank, the text is a texture on it. It never touches the DOM, so
 * there's nothing here for a screen reader to find — the accessible copy of
 * every board lives in the sr-only project list rendered by Game.tsx instead.
 */
export function paintSign(title: string, body: string, hero = false): THREE.CanvasTexture {
  const W = 512;
  const H = 320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e8d2a0';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#8a6a3e';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);

  ctx.fillStyle = '#3a2a15';
  ctx.textBaseline = 'top';
  ctx.font = hero ? 'bold 46px Georgia, serif' : 'bold 40px Georgia, serif';
  wrapText(ctx, title, 30, 34, W - 60, hero ? 52 : 46);

  ctx.font = '26px Georgia, serif';
  ctx.fillStyle = '#5a4526';
  wrapText(ctx, body, 30, hero ? 120 : 108, W - 60, 32, 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2,
) {
  const words = text.split(/\s+/);
  let line = '';
  let cy = y;
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
      lines += 1;
      if (lines >= maxLines) {
        ctx.fillText(line + '…', x, cy);
        return;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}
