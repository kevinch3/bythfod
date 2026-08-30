// The shapes the sim passes between its modules. Kept here so the learning
// stubs in roster.ts and feedback.ts can state their contracts in types rather
// than only in prose — a return type of `PlacementDraw[] | 'desierto'` is the
// same promise the docblock makes, but checkable.
//
// Deliberately no generics: these types are read by someone implementing an
// eight-line function, and should not require untangling first.

export type { Rng } from './rng.ts';

/** What is being performed — drives casting, music and staging. */
export type Kind =
  | 'solo' | 'recitacion' | 'cydadrodd' | 'coro' | 'conjunto' | 'parti'
  | 'deuawd' | 'dawns' | 'instrumental' | 'ceremony';

/** Sim language code; maps to eistedglobal's competition.language. */
export type LanguageCode = 'es' | 'cy';

/** Individual or group, shared by competitions and participants. */
export type EntrantType = 'IND' | 'GRU';

/** The placements a jury can award. Matches the API's work.placement. */
export type Placement = '1' | '2' | '3' | 'mencion';

/** One printed line of the programme. */
export interface ProgramItem {
  kind: Kind;
  label: string;
  language: LanguageCode;
  entrantType: EntrantType;
  /** Competition number as printed; absent for ceremonies. */
  comp?: number;
  piece?: string;
  author?: string;
  /** Ceremonies only: they are pinned to a printed slot and a clock time. */
  ceremony?: string;
  fixedSlot?: number;
  time?: string;
}

export interface ProgramSession {
  id: string;
  label: string;
  items: ProgramItem[];
}

export interface Program {
  festival: string;
  edition: string;
  venue: string;
  sessions: ProgramSession[];
}

/** A person, when the entrant is an individual. */
export interface Person {
  name: string;
  surname: string;
}

/** Whoever takes the stage for one item: one person, or a group of n. */
export interface Entrant {
  key: string;
  displayName: string;
  person?: Person;
  members?: number;
}

/** One entrant's result. */
export interface PlacementDraw {
  entrantKey: string;
  placement: Placement;
}

/** Either a full set of results, or nobody was worthy. */
export type PlacementResult = PlacementDraw[] | 'desierto';

/** A programme item once the draw has been made. */
export interface ItemPlan {
  /** 1-based, monotonic across the whole day. */
  ordinal: number;
  /** The API competition id this item owns, e.g. BY209901. */
  compId: string;
  /** Running (drawn) order, distinct from printed order. */
  rank: number;
  program: ProgramItem;
  entrants: Entrant[];
  placements: PlacementResult;
}

export interface PlanSession {
  id: string;
  label: string;
  items: ItemPlan[];
}

/** A whole festival day, derived deterministically from a seed. */
export interface DayPlan {
  seed: number;
  sessions: PlanSession[];
}
