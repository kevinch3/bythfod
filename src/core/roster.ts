// Randomizer: PROGRAM + seed → DayPlan (shuffled running order, entrants,
// pre-drawn placements). Pure module.
//
// Stream design: every concern gets its own rng stream split from the seed
// (order / names / cast / placements), and item-level streams are keyed by the
// item's printed ordinal — so a different running order, or re-drawing one
// item's winners, never changes anyone's name or a neighbouring item's cast.
import { makeRng } from './rng.ts';
import type {
  DayPlan, Entrant, ItemPlan, Placement, PlacementDraw, PlacementResult, Program, ProgramItem, Rng,
} from './types.ts';
import { makeNameGen } from './names.ts';

const GROUP_SIZES = {
  coro: [6, 12], conjunto: [3, 6], parti: [4, 8], dawns: [2, 10],
  deuawd: [2, 2], cydadrodd: [3, 5], instrumental: [2, 4],
};

export class TodoError extends Error {}

/**
 * TODO(you) — Learning contribution #1 (~8 lines).
 *
 * Decide who wins. Given the entrant keys of ONE item (1-5 of them) and an
 * rng ({next, int, pick, chance, shuffle}), return either the string
 * 'desierto' (award withheld — only sensible for a lone weak entrant) or an
 * array of {entrantKey, placement} with placement in '1'|'2'|'3'|'mencion'.
 *
 * The contract the tests in test/roster.test.js encode:
 *   - 1 entrant  → 'desierto' sometimes (~20% feels right), else 1st.
 *   - 2 entrants → 1st always; 2nd sometimes; never 3rd/mención.
 *   - 3-4        → podium up to 1-2-3 (you choose whether 2nd/3rd can be withheld).
 *   - 5          → full podium 1-2-3, plus at most one mención.
 *   - Never place the same entrant twice.
 *
 * Trade-offs to consider: shuffle the keys first so position in the entry
 * list carries no luck? Should mención require ≥4 entrants (real eisteddfod
 * juries differ on this)? A flat rng.chance per extra award, or a decaying
 * probability? Your call — the tests only pin the outer contract.
 */
export function drawPlacements(entrantKeys: string[], rng: Rng): PlacementResult {
  throw new TodoError('drawPlacements: TODO(you) — see the docblock in js/core/roster.ts');
}

/**
 * TODO(you) — Learning contribution #2 (~7 lines).
 *
 * Fisher-Yates over the NON-fixed positions only: return a new array, same
 * length and members as `items`, where every index i with isFixed(items[i])
 * still holds its original element, and the rest are shuffled with `rng`.
 *
 * Trade-offs: extract-shuffle-reinsert (simple, but be careful to reinsert at
 * the original fixed indexes) vs an in-place index-mapped Fisher-Yates
 * (no second pass, trickier bounds). Both can be unbiased — the classic bug
 * is using rng on a range that includes already-placed elements.
 */
export function shuffleKeepingFixed<T>(items: T[], isFixed: (item: T) => boolean, rng: Rng): T[] {
  throw new TodoError('shuffleKeepingFixed: TODO(you) — see the docblock in js/core/roster.ts');
}

// Provisional fallbacks so the whole sim stays runnable before the TODOs are
// implemented: entry order wins, printed order stands. Replaced automatically
// the moment the real functions stop throwing TodoError.
function fallbackPlacements(entrantKeys: string[]): PlacementDraw[] {
  const P: Placement[] = ['1', '2', '3'];
  return entrantKeys.slice(0, 3).map((key, i) => ({ entrantKey: key, placement: P[i] as Placement }));
}

function orTodoFallback<T>(fn: () => T, fallback: () => T): T {
  try { return fn(); }
  catch (e) { if (e instanceof TodoError) return fallback(); throw e; }
}

export function generateDayPlan(
  program: Program,
  seed: number,
  { compPrefix = 'BY', year = 2099 }: { compPrefix?: string; year?: number } = {},
): DayPlan {
  const root = makeRng(seed);
  const orderRng = root.split('order');
  const namesRng = root.split('names');
  const castRng = root.split('cast');
  const placeRng = root.split('placements');

  let nextOrdinal = 0;
  const sessions = program.sessions.map((session, si) => {
    const withOrdinal = session.items.map(item => ({ item, ordinal: ++nextOrdinal }));
    const arranged = orTodoFallback(
      () => shuffleKeepingFixed(withOrdinal, x => x.item.kind === 'ceremony', orderRng.split(session.id)),
      () => withOrdinal,
    );
    return {
      id: session.id,
      label: session.label,
      items: arranged.map((x, slot) => buildItemPlan(x.item, x.ordinal, si, slot)),
    };
  });

  function buildItemPlan(item: ProgramItem, ordinal: number, si: number, slot: number): ItemPlan {
    const cast = castRng.split(`item${ordinal}`);
    const gen = makeNameGen(namesRng.split(`item${ordinal}`));
    const count = item.kind === 'ceremony' ? 1 : cast.int(1, 5);

    const entrants: Entrant[] = Array.from({ length: count }, (_, i): Entrant => {
      const key = `e${ordinal}-${i + 1}`;
      if (item.entrantType === 'IND') {
        const person = gen.person();
        return { key, displayName: `${person.name} ${person.surname}`, person };
      }
      // Not every group kind declares a size range; 3-6 is the general default.
      const [lo, hi] = GROUP_SIZES[item.kind as keyof typeof GROUP_SIZES] ?? [3, 6];
      return { key, displayName: gen.group(item.kind), members: cast.int(lo, hi) };
    });

    const placements: PlacementResult = item.kind === 'ceremony'
      ? [{ entrantKey: entrants[0]!.key, placement: '1' }]
      : orTodoFallback(
          () => drawPlacements(entrants.map(e => e.key), placeRng.split(`item${ordinal}`)),
          () => fallbackPlacements(entrants.map(e => e.key)),
        );

    return {
      ordinal,
      compId: `${compPrefix}${year}${String(ordinal).padStart(2, '0')}`,
      rank: si * 100 + slot,
      program: item,
      entrants,
      placements,
    };
  }

  return { seed, sessions };
}

/** Re-roll one item's winners with a fresh stream (nonce bumps per redraw). */
export function redrawPlacements(item: ItemPlan, seed: number, nonce: number): PlacementResult {
  if (item.program.kind === 'ceremony') return item.placements;
  const rng = makeRng(seed).split('placements').split(`item${item.ordinal}`).split(`redraw${nonce}`);
  return orTodoFallback(
    () => drawPlacements(item.entrants.map(e => e.key), rng),
    () => fallbackPlacements(item.entrants.map(e => e.key)),
  );
}
