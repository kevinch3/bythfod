// Deterministic PRNG (mulberry32) + helpers. Pure module, no DOM.
// Streams: makeRng(seed).split('label') derives an independent deterministic
// stream per concern (order / names / placements) so consuming one never
// shifts another — re-drawing winners must not change who the entrants are.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashLabel(label) {
  let h = 5381;
  for (let i = 0; i < label.length; i++) h = ((h * 33) ^ label.charCodeAt(i)) >>> 0;
  return h;
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    seed,
    next,
    int(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    chance(p) { return next() < p; },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    split(label) { return makeRng((seed ^ hashLabel(label)) >>> 0); },
  };
}
