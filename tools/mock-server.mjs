#!/usr/bin/env node
/**
 * Runs the mock eistedglobal API.
 *
 *   npm run mock                                 empty schema on :3000
 *   npm run mock -- --seed demo                  a browsable festival
 *   npm run mock -- --seed bythfod --plan-seed 42   populated by the sim itself
 *   npm run mock -- --jwt-expires 5              short tokens, to exercise re-login
 *
 * With `--seed bythfod` this boots the mock and then runs the ordinary
 * prepareSandbox against it over real HTTP — the same populator that writes to
 * a real instance, aimed by base URL alone.
 */
import { createMockServer, schemaChecksum } from '../src/mock/index.ts';
import { CREDENTIALS } from '../src/mock/seed.ts';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};

const seedArg = arg('seed', 'basic');
const planSeed = parseInt(arg('plan-seed', '42'), 10);
const port = parseInt(arg('port', '3000'), 10);
const jwtExpires = parseInt(arg('jwt-expires', String(8 * 3600)), 10);

const mock = await createMockServer({
  port,
  seed: seedArg === 'bythfod' ? 'basic' : seedArg,
  jwtExpiresSeconds: jwtExpires,
});

console.log(`\nmock eistedglobal on ${mock.url}`);
console.log(`  schema   contract/schema.sql (sha256 ${schemaChecksum()})`);
console.log(`  login    ${CREDENTIALS.username} / ${CREDENTIALS.password}`);
console.log(`  seed     ${seedArg}`);

if (seedArg === 'bythfod') {
  const { CONFIG } = await import('../src/config.ts');
  const { PROGRAM } = await import('../src/core/program.ts');
  const { generateDayPlan } = await import('../src/core/roster.ts');
  const { prepareSandbox } = await import('../src/api/sandbox.ts');

  const plan = generateDayPlan(PROGRAM, planSeed, {
    compPrefix: CONFIG.COMP_PREFIX, year: CONFIG.SIM_YEAR,
  });
  await prepareSandbox({
    plan,
    config: { ...CONFIG, API_BASE: mock.url },
    username: CREDENTIALS.username,
    password: CREDENTIALS.password,
    log: m => console.log(`  ${m}`),
  });
  console.log(`  populated by the sim: plan seed ${planSeed}\n`);
}

console.log('Press Ctrl+C to stop\n');
process.on('SIGINT', async () => { await mock.close(); process.exit(0); });
