// Sim configuration. API-layer knobs live in js/api/config.js so the offline
// build never carries them — see tools/assert-public-build.mjs.
export const CONFIG = {
  SIM_YEAR: 2099,
  COMP_PREFIX: 'BY',
  DEFAULT_SEED: 42,
  SPEEDS: [0.5, 1, 2, 4],
  FEEDBACK_TIMEOUT_MS: 1500,
  OFFLINE: false,
};
