// Deterministic PRNG (mulberry32) + helpers. Pure module, no DOM.
// Streams: makeRng(seed).split('label') derives an independent deterministic
// stream per concern (order / names / placements) so consuming one never
// shifts another — re-drawing winners must not change who the entrants are.
/** A deterministic random stream. `split` derives an independent one. */
export interface Rng {
  seed: number;
  next(): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(arr: readonly T[]): T[];
  split(label: string): Rng;
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashLabel(label: string): number {
  let h = 5381;
  for (let i = 0; i < label.length; i++) h = ((h * 33) ^ label.charCodeAt(i)) >>> 0;
  return h;
}

export function makeRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    seed,
    next,
    int(min: number, max: number) { return min + Math.floor(next() * (max - min + 1)); },
    pick<T>(arr: readonly T[]): T { return arr[Math.floor(next() * arr.length)] as T; },
    chance(p: number) { return next() < p; },
    shuffle<T>(arr: readonly T[]): T[] {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    },
    split(label: string) { return makeRng((seed ^ hashLabel(label)) >>> 0); },
  };
}
