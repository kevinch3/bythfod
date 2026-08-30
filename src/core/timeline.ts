// DayPlan → flat Segment[] the engine steps through. Pure module.
// Segment: { kind, itemOrdinal, sessionId, entrantIdx?, dur, stage, music?, banner? }
import { makeRng } from './rng.ts';
import type { DayPlan, Entrant, Kind } from './types.ts';
import { MUSIC_BY_KIND } from '../render/music.ts';

// Act types the vendored StageRend knows how to build ('empty'/'award' added in M3).
export const STAGE_ACTS = [
  'choir', 'solo', 'duo', 'violin', 'trumpet', 'reciter', 'trio',
  'dancer', 'longways', 'ceremoni', 'announcer', 'empty', 'award',
];

/** What the stage renderer should draw for a segment. */
export interface StageDirection {
  actType: string;
  n: number;
  spotMode: string;
}

/** One beat of the show. `dur` is seconds at speed 1. */
export interface Segment {
  kind: 'intro' | 'perform' | 'applause' | 'adjudicate' | 'award' | 'ceremony';
  itemOrdinal: number;
  sessionId: string;
  dur: number;
  stage: StageDirection;
  entrantIdx?: number;
  music?: string;
  banner?: string;
}

const INSTRUMENTAL_ACT = { violin: 'violin', trumpet: 'trumpet', duo: 'duo' };

function stageFor(kind: Kind, entrant: Entrant, music: string): StageDirection {
  switch (kind) {
    case 'solo': return { actType: 'solo', n: 1, spotMode: 'center' };
    case 'recitacion': return { actType: 'reciter', n: 1, spotMode: 'center' };
    case 'cydadrodd': return { actType: 'choir', n: entrant.members || 4, spotMode: 'choir' };
    case 'coro':
    case 'conjunto':
    case 'parti': return { actType: 'choir', n: entrant.members || 8, spotMode: 'choir' };
    case 'deuawd': return { actType: 'duo', n: 2, spotMode: 'duo' };
    case 'dawns': {
      // Group entrants carry `members`; the sibling branches above default the
      // same way, so a dance entrant without one is drawn as a couple.
      const dancers = entrant.members ?? 2;
      return dancers <= 2
        ? { actType: 'dancer', n: dancers, spotMode: dancers === 2 ? 'duo' : 'center' }
        : { actType: 'longways', n: dancers, spotMode: 'choir' };
    }
    case 'instrumental':
      return { actType: INSTRUMENTAL_ACT[music as keyof typeof INSTRUMENTAL_ACT] ?? 'duo', n: 2, spotMode: 'center' };
    case 'ceremony': return { actType: 'ceremoni', n: 1, spotMode: 'center' };
    default: return { actType: 'solo', n: 1, spotMode: 'center' };
  }
}

export function buildTimeline(dayPlan: DayPlan): Segment[] {
  const timelineRng = makeRng(dayPlan.seed).split('timeline');
  const segments: Segment[] = [];

  for (const session of dayPlan.sessions) {
    for (const item of session.items) {
      const rng = timelineRng.split(`item${item.ordinal}`);
      const { kind } = item.program;
      const base = { itemOrdinal: item.ordinal, sessionId: session.id };
      const compNo = item.program.comp;
      const banner = kind === 'ceremony'
        ? item.program.label.toUpperCase()
        : `COMP.${compNo} · ${item.program.label.toUpperCase()}`;

      if (kind === 'ceremony') {
        segments.push({ ...base, kind: 'intro', dur: 6, banner, stage: { actType: 'announcer', n: 2, spotMode: 'announcer' } });
        segments.push({ ...base, kind: 'ceremony', dur: 30, banner, music: 'ceremoni', stage: stageFor(kind, item.entrants[0], 'ceremoni') });
        segments.push({ ...base, kind: 'applause', dur: 5.8, stage: { actType: 'ceremoni', n: 1, spotMode: 'center' } });
        continue;
      }

      segments.push({ ...base, kind: 'intro', dur: 4, banner, stage: { actType: 'announcer', n: 2, spotMode: 'announcer' } });

      item.entrants.forEach((entrant: Entrant, entrantIdx: number) => {
        const music = rng.pick(MUSIC_BY_KIND[kind as keyof typeof MUSIC_BY_KIND] ?? MUSIC_BY_KIND.solo);
        const stage = stageFor(kind, entrant, music);
        segments.push({ ...base, kind: 'perform', entrantIdx, dur: rng.int(8, 14), banner, music, stage });
        segments.push({ ...base, kind: 'applause', entrantIdx, dur: 3, stage });
      });

      const places = item.placements === 'desierto' ? 0 : item.placements.length;
      segments.push({ ...base, kind: 'adjudicate', dur: rng.int(10, 16), stage: { actType: 'empty', n: 0, spotMode: 'center' } });
      segments.push({ ...base, kind: 'award', dur: 4 + 3.5 * places, banner, stage: { actType: 'award', n: places, spotMode: 'center' } });
      // Ovation for the winners: lights back up, crowd claps, stage stays clear.
      segments.push({ ...base, kind: 'applause', dur: 4, stage: { actType: 'empty', n: 0, spotMode: 'center' } });
    }
  }
  return segments;
}
