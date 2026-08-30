// Bootstrap + effect interpreter: the only file that touches DOM, audio,
// network AND the engine. The engine emits data effects; this file gives
// them consequences (synth pieces, API awards, jury lines).
import { CONFIG } from './config.ts';
import type { DayPlan, ItemPlan } from './core/types.ts';
import type { Segment } from './core/timeline.ts';
import type { Sandbox } from './api/sandbox.ts';
import { PROGRAM } from './core/program.ts';
import { generateDayPlan } from './core/roster.ts';
import { buildTimeline } from './core/timeline.ts';
import { makeRng } from './core/rng.ts';
import * as E from './core/engine.ts';
import { TemplateFeedbackGenerator, generateWithTimeout } from './core/feedback.ts';
import { Synth } from './render/synth.ts';
import { MUSIC } from './render/music.ts';
import { StageRend } from './render/stage.ts';
import { JuryRend, judgeFor } from './render/jury.ts';
import { BoardRend } from './render/board.ts';
import { Hud } from './render/hud.ts';

const synth = new Synth();
// index.html always provides these; assert-public-build.mjs fails the build if
// the entry page loses its structure.
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const stageRend = new StageRend($('stage'));
const juryRend = new JuryRend($('jury'));
const board = new BoardRend($('board'));
const feedbackGen = new TemplateFeedbackGenerator();
const paneJury = $('pane-jury');

let plan: DayPlan | null = null;
let itemsByOrdinal: Record<number, ItemPlan> = {};
let engine = E.createEngine([], {});
let speakNonce = 0;
let sandbox: Sandbox | null = null; // wired by Connect & Prepare (online mode)

function setupPlan(seed: number): DayPlan {
  plan = generateDayPlan(PROGRAM, seed, { compPrefix: CONFIG.COMP_PREFIX, year: CONFIG.SIM_YEAR });
  itemsByOrdinal = Object.fromEntries(plan.sessions.flatMap(s => s.items).map(i => [i.ordinal, i]));
  engine = E.createEngine(buildTimeline(plan), { itemsByOrdinal });
  hud.buildProgram(plan);
  board.setHeader(`${PROGRAM.festival.toUpperCase()} · ${CONFIG.SIM_YEAR} · SIMULACIÓN · seed ${seed}`);
  board.buildOrder(plan);
  return plan;
}

// ── Effect interpreter ─────────────────────────────────────────────────────

function interpret(effects: E.Effect[]): void {
  for (const fx of effects) {
    switch (fx.type) {
      case 'music': if (fx.piece) MUSIC[fx.piece]?.(synth); break;
      case 'silence': synth.silence(); break;
      case 'noise': synth.noise(5.5, 0.15); break;
      case 'fanfare': setTimeout(() => { if (synth.ready) MUSIC.fanfare(synth); }, 500); break;
      case 'speak': handleSpeak(fx.itemOrdinal); break;
      case 'award': handleAward(fx.itemOrdinal); break;
    }
  }
}

function handleSpeak(ordinal: number): void {
  const item = itemsByOrdinal[ordinal];
  if (!item) return;
  const rng = makeRng((plan as DayPlan).seed).split('feedback').split(`item${ordinal}`).split(`n${speakNonce++}`);
  generateWithTimeout(feedbackGen, { item, rng }, CONFIG.FEEDBACK_TIMEOUT_MS, 'Diolch yn fawr — da iawn pawb.')
    .then(lines => E.setJuryLines(engine, lines));
}

function handleAward(ordinal: number): void {
  const item = itemsByOrdinal[ordinal];
  if (!item) return;
  hud.markAwarded(ordinal, item.placements === 'desierto');
  if (sandbox) {
    // Online: the poller adds board rows only once the API confirms them.
    sandbox.award(item).catch(err => hud.setSub(`⚠ API: ${err.message}`));
  } else if (item.placements !== 'desierto') {
    for (const p of item.placements) {
      board.addWinner({
        workId: `off-${ordinal}-${p.placement}`,
        placement: p.placement,
        displayName: item.entrants.find(e => e.key === p.entrantKey)?.displayName ?? '',
        item,
      });
    }
    board.markDone(ordinal);
  }
}

// ── HUD handlers ───────────────────────────────────────────────────────────

const hud = new Hud({
  onPlayPause() {
    if (!engine.started) { boot(); interpret(E.start(engine)); }
    else if (engine.paused) interpret(E.play(engine));
    else interpret(E.pause(engine));
  },
  onSpeed() {
    const i = CONFIG.SPEEDS.indexOf(engine.speed as (typeof CONFIG.SPEEDS)[number]);
    E.setSpeed(engine, CONFIG.SPEEDS[(i + 1) % CONFIG.SPEEDS.length] as number);
  },
  onJump(ordinal: number) { boot(); interpret(E.jumpTo(engine, ordinal)); },
  onVolume(v: number) { synth.setVol(v); },
  onTheme(t) { stageRend.setTheme(t); juryRend.setTheme(t); },
  onStart({ seed }) {
    setupPlan(seed);
    hud.hideSetup();
    boot();
    interpret(E.start(engine));
  },
  async onConnect(values) {
    try {
      // Single entry point to the online path; absent from the static build.
      const { connect } = await import('./api/connect.ts');
      sandbox = await connect({
        values, config: CONFIG, plan: setupPlan(values.seed), board,
        log: m => hud.log(m),
        setStatus: (t: string) => { $('b-status').textContent = t; },
        getPosition: () => E.positionState(engine),
      });
      hud.hideSetup();
      boot();
      interpret(E.start(engine));
    } catch (err) {
      hud.log(`✘ ${err instanceof Error ? err.message : String(err)}`);
      hud.log('  ¿API corriendo en :3000? ¿CORS_ORIGIN incluye este origen?');
    }
  },
});

function boot() { if (!synth.ready) synth.boot(); }

// ── Main loop ──────────────────────────────────────────────────────────────

setupPlan(CONFIG.DEFAULT_SEED);
hud.showSetup();

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  interpret(E.step(engine, dt));

  const sSt = E.stageState(engine);
  const jSt = E.juryState(engine);
  const pos = E.positionState(engine);

  stageRend.render(sSt);
  juryRend.render(jSt);
  paneJury.classList.toggle('live', jSt.mode === 'speaking' || jSt.mode === 'announcing');
  hud.update(pos, engine);
  if (engine.started) {
    board.setNow(
      pos.itemOrdinal == null ? undefined : itemsByOrdinal[pos.itemOrdinal],
      pos.nextItemOrdinal == null ? undefined : itemsByOrdinal[pos.nextItemOrdinal],
    );
  }

  const item = pos.itemOrdinal == null ? undefined : itemsByOrdinal[pos.itemOrdinal];
  if (item && pos.segKind && engine.started) {
    updateSubtitles(pos, item);
    updateAwardCaption(pos, sSt, item);
  }
  requestAnimationFrame(loop);
}

let prevSegKey = '';
function updateSubtitles(pos: ReturnType<typeof E.positionState>, item: ItemPlan): void {
  const seg = engine.segments[engine.cursor];
  const key = `${pos.itemOrdinal}:${pos.segKind}:${seg?.entrantIdx ?? '-'}`;
  if (key === prevSegKey) return;
  prevSegKey = key;
  juryRend.setJudge(judgeFor(item.program.kind));
  updateLowerThird(pos, item, seg);
  const compTag = item.program.kind === 'ceremony' ? '✦ SEREMONI' : `COMP.${item.program.comp}`;
  hud.setName(`${compTag} — ${item.program.label}`);
  const SUBS = {
    intro: `Cyflwyniad · ${item.entrants.length} participante(s)`,
    perform: () => {
      const seg = engine.segments[engine.cursor];
      return `♪ ${item.entrants[seg?.entrantIdx ?? 0]?.displayName ?? ''} — "${item.program.piece ?? ''}"`;
    },
    applause: '👏 Cymeradwyaeth · Aplausos 👏',
    adjudicate: '⚖ El jurado delibera — beirniadaeth',
    award: '🏆 Gwobrau · Entrega de premios',
    ceremony: '✦ Seremoni fawr yr Eisteddfod ✦',
  };
  const sub = pos.segKind == null ? undefined : SUBS[pos.segKind];
  hud.setSub(typeof sub === 'function' ? sub() : sub ?? '');
}

// Broadcast-style caption on the stage naming who is performing right now.
const $lt = $('lower-third');
function updateLowerThird(
  pos: ReturnType<typeof E.positionState>,
  item: ItemPlan,
  seg: Segment | undefined,
): void {
  const show = ['perform', 'ceremony'].includes(pos.segKind ?? '');
  $lt.hidden = !show;
  if (!show) return;

  if (pos.segKind === 'ceremony') {
    const poet = item.entrants[0];
    $('lt-tag').textContent = '✦ SEREMONI · CEREMONIA';
    $('lt-name').textContent = poet?.displayName ?? '';
    $('lt-info').textContent = item.program.label;
    return;
  }

  const entrant = item.entrants[seg?.entrantIdx ?? 0];
  if (!entrant) { $lt.hidden = true; return; }
  $('lt-tag').textContent = 'EN ESCENA · AR Y LLWYFAN';
  $('lt-name').textContent = entrant.displayName;
  const parts = [];
  if (item.program.piece) parts.push(`"${item.program.piece}"`);
  if (entrant.members) parts.push(`${entrant.members} integrantes`);
  parts.push(`participante ${(seg?.entrantIdx ?? 0) + 1} de ${item.entrants.length}`);
  $('lt-info').textContent = parts.join(' · ');
}

// While the jury reads the results over a shut stage, the lower third names
// each winner in sync with the announcement (engine's awardLineIdx).
let prevAwardKey = '';
function updateAwardCaption(
  pos: ReturnType<typeof E.positionState>,
  sSt: ReturnType<typeof E.stageState>,
  item: ItemPlan,
): void {
  if (pos.segKind !== 'award' || !sSt.awardOrder?.length) return;
  const idx = Math.min(sSt.awardLineIdx ?? 0, sSt.awardOrder.length - 1);
  const key = `${pos.itemOrdinal}:aw${idx}`;
  if (key === prevAwardKey) return;
  prevAwardKey = key;
  const place = sSt.awardOrder[idx];
  const pl = Array.isArray(item.placements) && item.placements.find(p => p.placement === place);
  const entrant = pl && item.entrants.find(e => e.key === pl.entrantKey);
  if (!entrant) return;
  $lt.hidden = false;
  $('lt-tag').textContent = '🏆 GWOBR · PREMIO';
  $('lt-name').textContent = entrant.displayName;
  $('lt-info').textContent = E.PLACE_LABELS[place] ?? place;
}

requestAnimationFrame(loop);
