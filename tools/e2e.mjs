#!/usr/bin/env node
// Headless end-to-end: login → reset → publish plan → award a few items →
// verify via the API. Usage: node tools/e2e.mjs [--seed 42] [--award 3]
// Requires the eistedglobal API on localhost:3000 (seeded: npm run seed).
import { CONFIG } from '../js/config.js';
import { PROGRAM } from '../js/core/program.js';
import { generateDayPlan } from '../js/core/roster.js';
import { prepareSandbox } from '../js/api/sandbox.js';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const seed = parseInt(arg('seed', '42'), 10);
const awardCount = parseInt(arg('award', '3'), 10);

const plan = generateDayPlan(PROGRAM, seed, { compPrefix: CONFIG.COMP_PREFIX, year: CONFIG.SIM_YEAR });
const items = plan.sessions.flatMap(s => s.items);
console.log(`plan: seed ${seed}, ${items.length} items`);

const sandbox = await prepareSandbox({
  plan, config: CONFIG,
  username: arg('user', 'admin'), password: arg('pass', 'admin1234'),
  log: m => console.log(`  ${m}`),
});

const toAward = items.filter(i => i.program.kind !== 'ceremony').slice(0, awardCount);
for (const item of toAward) {
  await sandbox.award(item);
  console.log(`  🏆 awarded ${item.compId} (${item.placements === 'desierto' ? 'desierto' : item.placements.length + ' placements'})`);
}

// Verify through the API
const comps = await sandbox.client.getCompetitions(CONFIG.SIM_YEAR);
const mine = comps.filter(c => c.id.startsWith(sandbox.prefix) && c.rank < 900); // rank 9xx = parked residue
const regs = await sandbox.client.getRegistrations({ year: CONFIG.SIM_YEAR });
let workCount = 0;
for (const item of toAward) workCount += (await sandbox.client.getWorks(item.compId)).length;

console.log(`\nVERIFY: ${mine.length} competitions (expected ${items.length}), ${regs.length} registrations, ${workCount} works in awarded comps`);
const ok = mine.length === items.length && regs.length > 0;
console.log(ok ? '✔ e2e OK' : '✘ e2e MISMATCH');
process.exit(ok ? 0 : 1);
