// Results poller: the board shows a winner only after the API says so — the
// live loop is a genuine round-trip (POST /works → GET /works → board row).
// Polls a rolling window (current comp + the 3 before it in running order).
import { TodoError } from '../core/roster.js';

/** Ordinals worth polling: the current one plus up to 3 already-played ones. */
export function pollWindow(runningOrder, currentOrdinal, size = 4) {
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
export function nextPollDelay(pollerState) {
  throw new TodoError('nextPollDelay: TODO(you) — see the docblock in js/api/poller.js');
}

function delayOrFallback(state, config = {}) {
  try { return nextPollDelay(state); }
  catch (e) {
    if (e instanceof TodoError) {
      return state.active ? (config.POLL_ACTIVE_MS ?? 3000) : (config.POLL_IDLE_MS ?? 15000);
    }
    throw e;
  }
}

export function startPolling({ sandbox, config, plan, board, getPosition }) {
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
      for (const ordinal of pollWindow(runningOrder, pos.itemOrdinal)) {
        const item = byOrdinal[ordinal];
        const works = await sandbox.client.getWorks(item.compId);
        for (const w of works) {
          if (seenWorks.has(w.id)) continue;
          seenWorks.add(w.id);
          board.addWinner({
            workId: w.id,
            placement: w.placement,
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
