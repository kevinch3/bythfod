// The entire online path, in one module the static build omits wholesale.
//
// main.js reaches this by a single dynamic import(), so the offline build carries
// no API base, no populator and no polling loop — a structural guarantee rather
// than "the button that would call it isn't rendered". See tools/build-static.mjs
// and tools/assert-public-build.mjs.
import { prepareSandbox } from './sandbox.ts';
import { startPolling } from './poller.ts';
import { API_CONFIG } from './config.ts';
import type { CONFIG } from '../config.ts';
import type { DayPlan } from '../core/types.ts';
import type { positionState } from '../core/engine.ts';
import type { BoardRend } from '../render/board.ts';
import type { SetupValues } from '../render/hud.ts';
import type { Sandbox } from './sandbox.ts';

/**
 * Log in, publish the day plan, and start polling results onto the board.
 * Returns the sandbox handle main.js needs for awards, or throws with a message
 * fit to show the operator.
 */
export async function connect({ values, config, plan, board, log, setStatus, getPosition }: {
  values: SetupValues;
  config: typeof CONFIG;
  plan: DayPlan;
  board: BoardRend;
  log: (msg: string) => void;
  setStatus: (text: string) => void;
  getPosition: () => ReturnType<typeof positionState>;
}): Promise<Sandbox> {
  const cfg = { ...config, ...API_CONFIG };
  log(`→ conectando a ${cfg.API_BASE} …`);

  const sandbox = await prepareSandbox({ ...values, plan, config: cfg, log });
  log('✔ sandbox listo — pulsá COMENZAR (offline queda atrás)');
  setStatus(`conectado · edición ${cfg.SIM_YEAR}`);

  startPolling({ sandbox, config: cfg, plan, board, getPosition });
  return sandbox;
}
