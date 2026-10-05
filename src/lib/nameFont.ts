/**
 * Which typeface sets your name (hero + the closing name of the scroll
 * journey). Change this one word to switch:
 *
 *   'fraunces'  — soft, slightly quirky serif (the archive's face, full axes)
 *   'unbounded' — wide, rounded geometric sans
 *
 * Size, weight and tracking for each live in index.css.
 */
export const NAME_FONT: 'fraunces' | 'unbounded' = 'fraunces';

// Spelled out in full (not built with a template string) so Tailwind's
// scanner sees both class names and generates them.
const CLASSES = {
  fraunces: 't-name-fraunces',
  unbounded: 't-name-unbounded',
} as const;

export const nameClass = CLASSES[NAME_FONT];
