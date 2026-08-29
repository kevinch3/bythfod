// Sandbox lifecycle against the eistedglobal API. Every step is idempotent so
// the sim can re-run on the same DB: categories are ensured by name (no blind
// POSTs — no unique constraint), the edition row is reused (409 = fine),
// and reset REUSES competitions (a competition that ever had a registration
// can never be hard-deleted: FKs are on and registrations only soft-drop).
import { ApiClient, ApiError } from './client.js';

export const CATEGORY_BY_KIND = {
  solo: 'Canto Individual',
  coro: 'Canto Grupal', conjunto: 'Canto Grupal', parti: 'Canto Grupal', deuawd: 'Canto Grupal',
  recitacion: 'Recitado', cydadrodd: 'Recitado',
  dawns: 'Danza',
  instrumental: 'Instrumental',
  ceremony: 'Composición',
};

const WELSH_NAMES = {
  'Canto Individual': 'Canu Unigol', 'Canto Grupal': 'Canu Grŵp', Recitado: 'Adrodd',
  Danza: 'Dawns', Instrumental: 'Offerynnol', 'Composición': 'Cyfansoddi',
};

const LANGUAGE = { es: 'Castellano', cy: 'Cymraeg' };

const PSEUDONYMS = ['Awen', 'Morfa', 'Alarch', 'Seren y De', 'Gwlithyn', 'Hedydd', 'Craig yr Aur'];

const flat = plan => plan.sessions.flatMap(s => s.items);

export async function prepareSandbox({ plan, config, username, password, log = () => {}, client }) {
  if (!client && (!username || !password)) {
    throw new Error('faltan credenciales del API (las crea `npm run seed` en eistedglobal)');
  }
  const api = client ?? new ApiClient({ baseUrl: config.API_BASE });
  const year = config.SIM_YEAR;
  const prefix = `${config.COMP_PREFIX}${year}`;
  const SIM_PREFIX = 'SIM-'; // marks participants this sim created (document_id)

  await api.login(username, password);
  log('✔ login ok');

  // 1. Categories by name
  const existing = await api.getCategories();
  const byName = new Map(existing.map(c => [c.name, c.id]));
  for (const name of new Set(Object.values(CATEGORY_BY_KIND))) {
    if (!byName.has(name)) {
      const created = await api.createCategory({ name, name_welsh: WELSH_NAMES[name] ?? name });
      byName.set(name, created.id);
      log(`✔ categoría creada: ${name}`);
    }
  }
  log(`✔ categorías listas (${byName.size})`);

  // 2. Edition (reuse on 409)
  try {
    await api.createEdition({ year });
    log(`✔ edición ${year} creada`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) log(`✔ edición ${year} ya existía — se reutiliza`);
    else throw err;
  }
  await api.updateEdition(year, {
    committee: 'Comisión Simulada Bythfod — Pwyllgor Rhithwir',
    presenters: 'Gwilym Heulog a Elena Zorzal',
  });

  // 3. Reset previous sandbox data (works → registrations → participants)
  const comps = await api.getCompetitions(year);
  const sandboxComps = comps.filter(c => String(c.id).startsWith(prefix));
  for (const comp of sandboxComps) {
    for (const w of await api.getWorks(comp.id)) await api.deleteWork(w.id);
    for (const r of await api.getRegistrations({ year, comp: comp.id })) await api.dropRegistration(r.id);
  }
  // The API's ?q= is a LIKE '%…%' over name/surname/document_id, so it can match
  // rows we never created. Delete only what is provably ours: our document_id marker.
  const found = await api.getParticipants(SIM_PREFIX);
  let dropped = 0;
  for (const p of found) {
    // id is an autoincrement rowid; our marker lives in document_id.
    if (!String(p.document_id ?? '').startsWith(SIM_PREFIX)) continue;
    await api.deleteParticipant(p.id);
    dropped++;
  }
  log(`✔ sandbox reseteado (${sandboxComps.length} competencias previas, ${dropped}/${found.length} participantes)`);

  // 4. Publish the plan: upsert competitions, create participants + registrations
  const haveComp = new Set(sandboxComps.map(c => c.id));
  const participantIds = new Map(); // entrantKey → participant id
  const items = flat(plan);
  for (const item of items) {
    const p = item.program;
    const body = {
      category_id: byName.get(CATEGORY_BY_KIND[p.kind]),
      description: `${p.kind === 'ceremony' ? '✦' : `Comp.${p.comp}`} — ${p.label}${p.piece ? ` · "${p.piece}"` : ''}`,
      language: LANGUAGE[p.language] ?? 'Otro',
      year,
      type: p.entrantType,
      rank: item.rank,
      extra_text: p.author ?? null,
    };
    if (haveComp.has(item.compId)) await api.updateCompetition(item.compId, body);
    else await api.createCompetition({ id: item.compId, ...body });

    for (const [i, entrant] of item.entrants.entries()) {
      const created = await api.createParticipant({
        name: entrant.person?.name ?? entrant.displayName,
        surname: entrant.person?.surname ?? null,
        type: p.entrantType,
        document_id: `SIM-${plan.seed}-${item.ordinal}-${i + 1}`,
        nationality: 'Argentina',
        residence: 'Chubut',
      });
      participantIds.set(entrant.key, created.id);
      await api.createRegistration({
        participant_id: created.id,
        competition_id: item.compId,
        year,
        pseudonym: p.kind === 'ceremony' ? PSEUDONYMS[item.ordinal % PSEUDONYMS.length] : undefined,
      });
    }
  }
  log(`✔ programa publicado: ${items.length} competencias, ${participantIds.size} participantes`);

  // 5. Park stale sandbox comps (a shrunken plan leaves undeletable rows —
  // FK + soft-drop — so neutralize their content and sort them last).
  const planIds = new Set(items.map(i => i.compId));
  const stale = sandboxComps.filter(c => !planIds.has(c.id));
  for (const c of stale) {
    await api.updateCompetition(c.id, {
      category_id: c.category_id,
      description: '· (vacante — residuo sandbox)',
      language: c.language,
      type: c.type,
      extra_text: null,
      rank: 900 + Number(String(c.id).slice(-2)),
    });
  }
  if (stale.length) log(`✔ ${stale.length} competencias residuales neutralizadas (vacante, rank 9xx)`);

  async function award(item) {
    if (item.placements === 'desierto') return [];
    return Promise.all(item.placements.map(pl => {
      const entrant = item.entrants.find(e => e.key === pl.entrantKey);
      return api.enqueue(() => api.createWork({
        participant_id: participantIds.get(pl.entrantKey),
        competition_id: item.compId,
        title: item.program.piece ?? item.program.label,
        display_name: entrant?.displayName ?? '',
        placement: pl.placement,
      }));
    }));
  }

  async function redraw(item) {
    const works = await api.getWorks(item.compId);
    for (const w of works) await api.deleteWork(w.id);
    return award(item);
  }

  return { client: api, award, redraw, participantIds, year, prefix };
}
