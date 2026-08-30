// The entire online path, in one module the static build omits wholesale.
//
// main.js reaches this by a single dynamic import(), so the offline build carries
// no API base, no populator and no polling loop — a structural guarantee rather
// than "the button that would call it isn't rendered". See tools/build-static.mjs
// and tools/assert-public-build.mjs.
import { prepareSandbox } from './sandbox.js';
import { startPolling } from './poller.js';
import { API_CONFIG } from './config.js';

/**
 * Log in, publish the day plan, and start polling results onto the board.
 * Returns the sandbox handle main.js needs for awards, or throws with a message
 * fit to show the operator.
 */
export async function connect({ values, config, plan, board, log, setStatus, getPosition }) {
  const cfg = { ...config, ...API_CONFIG };
  log(`→ conectando a ${cfg.API_BASE} …`);

  const sandbox = await prepareSandbox({ ...values, plan, config: cfg, log });
  log('✔ sandbox listo — pulsá COMENZAR (offline queda atrás)');
  setStatus(`conectado · edición ${cfg.SIM_YEAR}`);

  startPolling({ sandbox, config: cfg, plan, board, getPosition });
  return sandbox;
}
