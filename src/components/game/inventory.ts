// src/components/game/inventory.ts
import { Block } from '@/components/game/blocks';

/**
 * A real slot inventory, replacing the fixed eight-type hotbar.
 *
 * The old version pre-declared one slot per block type and kept a count on
 * each, which meant the bar always looked full even when every count was
 * zero — nothing you picked up ever *arrived* anywhere, because its slot had
 * been sitting there since page load. Slots now start empty and fill as you
 * mine, so the bar shows what you actually have.
 *
 * Still deliberately session-only: this lives in React state in Game.tsx and
 * dies with the route, so leaving and coming back resets both the island and
 * your pockets.
 */

export const SLOT_COUNT = 9;
export const STACK_MAX = 64;

export type Slot = { block: Block; count: number } | null;
export type Inventory = Slot[];

export function emptyInventory(): Inventory {
  return Array.from({ length: SLOT_COUNT }, () => null);
}

/** Total of one block type across every stack. */
export function totalOf(inv: Inventory, block: Block): number {
  return inv.reduce((n, s) => (s && s.block === block ? n + s.count : n), 0);
}

/**
 * Tops up an existing stack first, then takes the first empty slot.
 * Returns a new array; returns the original if there was nowhere to put it.
 */
export function addItem(inv: Inventory, block: Block, count = 1): Inventory {
  const next = inv.slice();
  let left = count;
  for (let i = 0; i < next.length && left > 0; i++) {
    const s = next[i];
    if (s && s.block === block && s.count < STACK_MAX) {
      const room = Math.min(STACK_MAX - s.count, left);
      next[i] = { block, count: s.count + room };
      left -= room;
    }
  }
  for (let i = 0; i < next.length && left > 0; i++) {
    if (!next[i]) {
      const room = Math.min(STACK_MAX, left);
      next[i] = { block, count: room };
      left -= room;
    }
  }
  return left === count ? inv : next;
}

/** Takes one item out of a specific slot, emptying the slot when it runs out. */
export function takeFromSlot(inv: Inventory, index: number, count = 1): Inventory {
  const s = inv[index];
  if (!s || s.count < count) return inv;
  const next = inv.slice();
  next[index] = s.count === count ? null : { block: s.block, count: s.count - count };
  return next;
}

/** Removes `count` of a block type from wherever it's stacked. */
export function consume(inv: Inventory, block: Block, count: number): Inventory {
  if (totalOf(inv, block) < count) return inv;
  const next = inv.slice();
  let left = count;
  for (let i = 0; i < next.length && left > 0; i++) {
    const s = next[i];
    if (!s || s.block !== block) continue;
    const take = Math.min(s.count, left);
    next[i] = s.count === take ? null : { block, count: s.count - take };
    left -= take;
  }
  return next;
}

export type Recipe = {
  id: string;
  label: string;
  inputs: { block: Block; count: number }[];
  output: { block: Block; count: number };
};

export const RECIPES: Recipe[] = [
  {
    id: 'planks',
    label: 'Log → 4 Planks',
    inputs: [{ block: Block.LOG, count: 1 }],
    output: { block: Block.PLANK, count: 4 },
  },
  {
    id: 'glass',
    label: '4 Sand → Glass',
    inputs: [{ block: Block.SAND, count: 4 }],
    output: { block: Block.GLASS, count: 1 },
  },
  {
    id: 'cobble',
    label: '4 Dirt → Cobblestone',
    inputs: [{ block: Block.DIRT, count: 4 }],
    output: { block: Block.COBBLE, count: 1 },
  },
  {
    id: 'table',
    label: '4 Planks → Crafting Table',
    inputs: [{ block: Block.PLANK, count: 4 }],
    output: { block: Block.CRAFT, count: 1 },
  },
];

export function canCraft(inv: Inventory, recipe: Recipe): boolean {
  return recipe.inputs.every((i) => totalOf(inv, i.block) >= i.count);
}

export function craft(inv: Inventory, recipe: Recipe): Inventory {
  if (!canCraft(inv, recipe)) return inv;
  let next = inv;
  for (const i of recipe.inputs) next = consume(next, i.block, i.count);
  return addItem(next, recipe.output.block, recipe.output.count);
}