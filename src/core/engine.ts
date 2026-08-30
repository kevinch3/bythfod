import type { ItemPlan, Placement, PlacementDraw } from './types.ts';
import type { Segment } from './timeline.ts';
// Show engine: steps a Segment[] with bythfod's rhythm (fades wrap ITEMS, not
// segments). Pure module — no DOM/audio/network. step() mutates the state
// object and returns effects (data) for main.js to interpret:
//   {type:'music', piece} {type:'silence'} {type:'noise'} {type:'fanfare'}
//   {type:'award', itemOrdinal} {type:'speak', itemOrdinal}
const FADE_IN = 1.4, FADE_IN_VISUAL = 1.1, FADE_OUT = 1.1, FADE_OUT_VISUAL = 0.9;

/** A data effect: the engine describes what should happen, main.ts does it. */
export type Effect =
  | { type: 'music'; piece: string | undefined }
  | { type: 'silence' }
  | { type: 'noise' }
  | { type: 'fanfare' }
  /** Record this item's results — main.ts calls sandbox.award(). */
  | { type: 'award'; itemOrdinal: number }
  /** Ask for jury lines for this item; they arrive via setJuryLines(). */
  | { type: 'speak'; itemOrdinal: number };

/** The show's mutable state. Advanced only through step() and the verbs below. */
export interface EngineState {
  segments: Segment[];
  itemsByOrdinal: Record<number, ItemPlan>;
  cursor: number;
  phase: 'idle' | 'fade-in' | 'segment' | 'fade-out' | 'done';
  timer: number;
  speed: number;
  paused: boolean;
  started: boolean;
  overlay: number;
  lines: string[];
  lineIdx: number;
  lineClock: number;
}

export const PLACE_LABELS = {
  mencion: 'Mención', 3: '3ydd · Tercer premio', 2: '2il · Segundo premio', 1: '1af · Primer premio',
};
const AWARD_ORDER: Placement[] = ['mencion', '3', '2', '1']; // ascending drama

function awardOrderFor(item: ItemPlan): Placement[] {
  if (!item) return [];
  const { placements } = item;
  if (placements === 'desierto') return [];
  return AWARD_ORDER.filter(pl => placements.some(p => p.placement === pl));
}

export function createEngine(
  segments: Segment[],
  { itemsByOrdinal = {} }: { itemsByOrdinal?: Record<number, ItemPlan> } = {},
): EngineState {
  return {
    segments, itemsByOrdinal,
    cursor: 0, phase: 'idle', timer: 0,
    speed: 1, paused: false, started: false, overlay: 1,
    lines: [], lineIdx: 0, lineClock: 0,
  };
}

/** The current segment. Callers only reach this while the cursor is in range. */
const seg = (st: EngineState): Segment => st.segments[st.cursor] as Segment;

function enterSegment(st: EngineState): Effect[] {
  st.timer = 0;
  st.lines = []; st.lineIdx = 0; st.lineClock = 0;
  const s = seg(st);
  switch (s.kind) {
    case 'intro': return [{ type: 'silence' }];
    case 'perform': return [{ type: 'music', piece: s.music }];
    case 'applause': return [{ type: 'silence' }, { type: 'noise' }];
    case 'adjudicate': return [{ type: 'silence' }, { type: 'speak', itemOrdinal: s.itemOrdinal }];
    case 'award':
      st.lines = awardLines(st.itemsByOrdinal[s.itemOrdinal]);
      return [{ type: 'award', itemOrdinal: s.itemOrdinal }];
    case 'ceremony':
      return [{ type: 'music', piece: s.music }, { type: 'award', itemOrdinal: s.itemOrdinal }];
    default: return [];
  }
}

function awardLines(item: ItemPlan): string[] {
  if (!item) return [];
  if (item.placements === 'desierto') {
    return ['El jurado declara el premio DESIERTO — neb yn deilwng.'];
  }
  const byKey = Object.fromEntries(item.entrants.map(e => [e.key, e.displayName]));
  const drawn: PlacementDraw[] = item.placements;
  return AWARD_ORDER
    .map(place => drawn.find(p => p.placement === place))
    .filter((p): p is PlacementDraw => p !== undefined)
    .map(p => `${PLACE_LABELS[p.placement]}: ${byKey[p.entrantKey]}`);
}

export function start(st: EngineState): Effect[] {
  st.started = true; st.phase = 'fade-in'; st.cursor = 0;
  st.timer = 0; st.overlay = 1;
  return [{ type: 'fanfare' }];
}

export function pause(st: EngineState): Effect[] { st.paused = true; return [{ type: 'silence' }]; }
export function play(st: EngineState): Effect[] { st.paused = false; return []; }
export function setSpeed(st: EngineState, speed: number): Effect[] { st.speed = speed; return []; }

export function step(st: EngineState, dtReal: number): Effect[] {
  if (!st.started || st.paused || st.phase === 'done' || st.phase === 'idle') return [];
  const dt = dtReal * st.speed;
  st.timer += dt;

  if (st.phase === 'fade-in') {
    st.overlay = Math.max(0, 1 - st.timer / FADE_IN_VISUAL);
    if (st.timer > FADE_IN) { st.phase = 'segment'; return enterSegment(st); }
    return [];
  }

  if (st.phase === 'segment') {
    st.overlay = 0;
    tickJuryLines(st, dt);
    const s = seg(st);
    if (st.timer > s.dur) {
      const next = st.segments[st.cursor + 1];
      if (next && next.itemOrdinal === s.itemOrdinal) {
        st.cursor += 1;
        return enterSegment(st);
      }
      st.phase = 'fade-out'; st.timer = 0;
      return [{ type: 'silence' }];
    }
    return [];
  }

  if (st.phase === 'fade-out') {
    st.overlay = Math.min(1, st.timer / FADE_OUT_VISUAL);
    if (st.timer > FADE_OUT) {
      if (st.cursor + 1 >= st.segments.length) {
        st.phase = 'done'; st.overlay = 1;
        return [{ type: 'silence' }];
      }
      st.cursor += 1; st.phase = 'fade-in'; st.timer = 0; st.overlay = 1;
      return [{ type: 'fanfare' }];
    }
    return [];
  }
  return [];
}

function tickJuryLines(st: EngineState, dt: number): Effect[] {
  const s = seg(st);
  if ((s.kind !== 'adjudicate' && s.kind !== 'award') || st.lines.length === 0) return [];
  st.lineClock += dt;
  const perLine = s.dur / Math.max(1, st.lines.length);
  if (st.lineClock > perLine && st.lineIdx < st.lines.length - 1) {
    st.lineIdx += 1; st.lineClock = 0;
  }
  return [];
}

/** Feed adjudication lines (from a FeedbackGenerator) into the current segment. */
export function setJuryLines(st: EngineState, lines: string[]): Effect[] {
  if (seg(st)?.kind === 'adjudicate') { st.lines = lines; st.lineIdx = 0; st.lineClock = 0; }
  return [];
}

export function skipItem(st: EngineState): Effect[] {
  if (!st.started || st.phase === 'done') return [];
  const ord = seg(st).itemOrdinal;
  let i = st.cursor;
  while (i + 1 < st.segments.length && st.segments[i + 1].itemOrdinal === ord) i += 1;
  st.cursor = i;
  st.phase = 'fade-out'; st.timer = 0;
  return [{ type: 'silence' }];
}

export function skipSegment(st: EngineState): Effect[] {
  if (st.phase !== 'segment') return [];
  st.timer = seg(st).dur + 0.001;
  return [{ type: 'silence' }];
}

export function jumpTo(st: EngineState, ordinal: number): Effect[] {
  const idx = st.segments.findIndex(s => s.itemOrdinal === ordinal);
  if (idx < 0) return [];
  st.started = true;
  st.cursor = idx; st.phase = 'fade-in'; st.timer = 0; st.overlay = 1;
  return [{ type: 'silence' }, { type: 'fanfare' }];
}

// ── Derived render states ──────────────────────────────────────────────────

/**
 * What the stage renderer needs for the current frame. Declared explicitly
 * because the award fields exist only on the award segment, and inference
 * would otherwise produce a union the caller cannot read them from.
 */
export interface StageView {
  actType: string;
  phase: string;
  overlay: number;
  n: number;
  spotMode: string;
  actT: number;
  banner?: string | null;
  awardOrder?: Placement[];
  awardLineIdx?: number;
}

export function stageState(st: EngineState): StageView {
  const s = seg(st);
  const base = { actType: '', phase: 'idle', overlay: st.overlay, banner: null, spotMode: 'center', n: 1, actT: 0 };
  if (!st.started || st.phase === 'done' || st.phase === 'idle') return { ...base, overlay: 1 };
  if (st.phase === 'fade-in' || st.phase === 'fade-out' || !s) return base;

  const stage = s.stage;
  switch (s.kind) {
    case 'intro':
      return { ...base, actType: stage.actType, n: stage.n, spotMode: stage.spotMode, phase: 'announcing', overlay: 0 };
    case 'perform':
    case 'ceremony':
      return { ...base, actType: stage.actType, n: stage.n, spotMode: stage.spotMode, phase: 'performing', banner: s.banner, overlay: 0, actT: st.timer };
    case 'applause':
      return { ...base, actType: stage.actType, n: stage.n, spotMode: stage.spotMode, phase: 'applause', overlay: 0, actT: st.timer };
    case 'adjudicate':
      // Empty, darkened stage — the house lights go down while the jury speaks
      // (eases to 0.6 over the first half-second of the segment).
      return { ...base, actType: 'empty', n: 0, spotMode: 'center', phase: 'performing', overlay: Math.min(0.6, st.timer * 1.2) };
    case 'award':
      // The jury reads results from the table: the stage stays shut (dark,
      // empty, no action). awardOrder/awardLineIdx drive the caption that
      // names each winner as they are announced (mención → 3 → 2 → 1).
      return {
        ...base, actType: 'empty', n: 0, spotMode: 'center', phase: 'performing',
        banner: s.banner, overlay: 0.6, actT: st.timer,
        awardOrder: awardOrderFor(st.itemsByOrdinal[s.itemOrdinal]),
        awardLineIdx: st.lineIdx,
      };
    default:
      return base;
  }
}

export function juryState(st: EngineState) {
  const off = { mode: 'off', line: '', lineT: 0 };
  if (!st.started || st.phase !== 'segment') return off;
  const s = seg(st);
  const line = st.lines[st.lineIdx] ?? '';
  switch (s.kind) {
    case 'intro': case 'perform': case 'applause':
      return { mode: 'listening', line: '', lineT: 0 };
    case 'adjudicate':
      return { mode: 'speaking', line, lineT: st.lineClock };
    case 'award':
      return { mode: 'announcing', line, lineT: st.lineClock };
    default: return off;
  }
}

export function positionState(st: EngineState) {
  const s = seg(st);
  if (!s) return { itemOrdinal: null, nextItemOrdinal: null, segKind: null, sessionId: null, done: st.phase === 'done' };
  let next = null;
  for (let i = st.cursor + 1; i < st.segments.length; i++) {
    if (st.segments[i].itemOrdinal !== s.itemOrdinal) { next = st.segments[i].itemOrdinal; break; }
  }
  return { itemOrdinal: s.itemOrdinal, nextItemOrdinal: next, segKind: s.kind, sessionId: s.sessionId, done: st.phase === 'done' };
}
