// Results poller: the board shows a winner only after the API says so — the
// live loop is a genuine round-trip (POST /works → GET /works → board row).
// Polls a rolling window (current comp + the 3 before it in running order).
import { TodoError } from '../core/roster.ts';
import type { DayPlan, ItemPlan } from '../core/types.ts';
import type { positionState } from '../core/engine.ts';
import type { BoardRend } from '../render/board.ts';
import type { Sandbox } from './sandbox.ts';

/** What nextPollDelay decides from. */
export interface PollerState {
  /** True while the show is running and results are expected. */
  active: boolean;
  /** Consecutive failed polls. */
  errorCount: number;
}

export interface PollTimings {
  POLL_ACTIVE_MS: number;
  POLL_IDLE_MS: number;
}

/** Ordinals worth polling: the current one plus up to 3 already-played ones. */
export function pollWindow(runningOrder: number[], currentOrdinal: number, size = 4): number[] {
  const i = runningOrder.indexOf(currentOrdinal);
  if (i < 0) return [];
  return runningOrder.slice(Math.max(0, i - (size - 1)), i + 1);
}

/**
 * TODO(you) — Learning contribution #4 (optional, ~5 lines).
 *
 * Adaptive polling delay in ms from {active, errorCount}:
 * active & healthy → 3000; idle → 15000; consecutive errors → grow the delay
 * (linear? doubling?) but cap it (≤60000) so recovery is ever possible.
 * Trade-off: aggressive retry finds recovery sooner but hammers a dying API.
 */
export function nextPollDelay(pollerState: PollerState): number {
  throw new TodoError('nextPollDelay: TODO(you) — see the docblock in src/api/poller.ts');
}

function delayOrFallback(state: PollerState, config: Partial<PollTimings> = {}): number {
  try { return nextPollDelay(state); }
  catch (e) {
    if (e instanceof TodoError) {
      return state.active ? (config.POLL_ACTIVE_MS ?? 3000) : (config.POLL_IDLE_MS ?? 15000);
    }
    throw e;
  }
}

export function startPolling({ sandbox, config, plan, board, getPosition }: {
  sandbox: Sandbox;
  config: PollTimings;
  plan: DayPlan;
  board: BoardRend;
  getPosition: () => ReturnType<typeof positionState>;
}): { stop(): void } {
  const items = plan.sessions.flatMap(s => s.items);
  const byOrdinal = Object.fromEntries(items.map(i => [i.ordinal, i]));
  const runningOrder = items.slice().sort((a, b) => a.rank - b.rank).map(i => i.ordinal);
  const seenWorks = new Set();
  let errorCount = 0;
  let stopped = false;

  async function tick() {
    if (stopped) return;
    const pos = getPosition();
    const active = !!pos.itemOrdinal && !pos.done;
    try {
      for (const ordinal of pollWindow(runningOrder, pos.itemOrdinal ?? -1)) {
        const item = byOrdinal[ordinal] as ItemPlan;
        const works = await sandbox.client.getWorks(item.compId);
        for (const w of works) {
          if (seenWorks.has(w.id)) continue;
          seenWorks.add(w.id);
          board.addWinner({
            workId: w.id,
            placement: w.placement ?? '',
            displayName: w.display_name || `${w.name ?? ''} ${w.surname ?? ''}`.trim(),
            item,
          });
        }
        if (works.length) board.markDone(ordinal);
      }
      errorCount = 0;
      board.setStatus(`en vivo · ${new Date().toLocaleTimeString()} · sondeo ${Math.round(delayOrFallback({ active, errorCount }, config) / 1000)}s`);
    } catch (err) {
      errorCount += 1;
      board.setStatus(`⚠ sin respuesta del API (${errorCount})`);
    }
    setTimeout(tick, delayOrFallback({ active, errorCount }, config));
  }

  tick();
  return { stop() { stopped = true; } };
}
