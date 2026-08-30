#!/usr/bin/env node
// Prints a summary of the sandbox edition straight from the API.
// Usage: EISTED_USER=… EISTED_PASS=… node tools/verify.mjs
import { CONFIG as SIM_CONFIG } from '../js/config.js';
import { API_CONFIG } from '../js/api/config.js';
const CONFIG = { ...SIM_CONFIG, ...API_CONFIG };
import { ApiClient } from '../js/api/client.js';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
// Credentials come from the environment (or --user/--pass); never hardcoded.
const user = arg('user', process.env.EISTED_USER);
const pass = arg('pass', process.env.EISTED_PASS);
if (!user || !pass) {
  console.error('Faltan credenciales. Exportá EISTED_USER y EISTED_PASS, o pasá --user/--pass.');
  process.exit(2);
}

const client = new ApiClient({ baseUrl: CONFIG.API_BASE });
await client.login(user, pass);

const prefix = `${CONFIG.COMP_PREFIX}${CONFIG.SIM_YEAR}`;
const all = (await client.getCompetitions(CONFIG.SIM_YEAR)).filter(c => c.id.startsWith(prefix));
const comps = all.filter(c => c.rank < 900);
const parked = all.length - comps.length;
const regs = await client.getRegistrations({ year: CONFIG.SIM_YEAR });
const regByComp = {};
for (const r of regs) regByComp[r.competition_id] = (regByComp[r.competition_id] ?? 0) + 1;

console.log(`Sandbox ${CONFIG.SIM_YEAR}: ${comps.length} competitions (+${parked} vacantes residuales), ${regs.length} active registrations\n`);
console.log('rank  id         regs  works  placements            description');
let totalWorks = 0;
for (const c of comps) {
  const works = await client.getWorks(c.id);
  totalWorks += works.length;
  const places = works.map(w => w.placement ?? '·').join(',');
  console.log(
    `${String(c.rank).padStart(4)}  ${c.id}  ${String(regByComp[c.id] ?? 0).padStart(4)}  ${String(works.length).padStart(5)}  ${places.padEnd(20)}  ${(c.description ?? '').slice(0, 48)}`
  );
}
console.log(`\nTotal works (prizes) written: ${totalWorks}`);
