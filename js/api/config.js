// API-layer configuration. Deliberately NOT in js/config.js: the offline build
// has no business knowing an API base, and tools/assert-public-build.mjs enforces
// that js/api/ never reaches dist/. Merge with CONFIG when talking to the API.
export const API_CONFIG = {
  API_BASE: 'http://localhost:3000/api',
  POLL_ACTIVE_MS: 3000,
  POLL_IDLE_MS: 15000,
};
