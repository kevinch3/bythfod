// Jury feedback generation. Pure module.
// The async interface is the LLM seam: a future LLMFeedbackGenerator drops in
// here, and generateWithTimeout guarantees a stalled generator can never stall
// the show (the engine gets a canned line instead).
import { TodoError } from './roster.js';

export class FeedbackGenerator {
  /**
   * @param ctx {{ item: ItemPlan, rng: Rng }}
   * @returns {Promise<string[]>} lines of jury speech, spoken in order
   */
  async generate(ctx) { throw new Error('FeedbackGenerator.generate is abstract'); }
}

export async function generateWithTimeout(generator, ctx, ms, fallbackLine) {
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), ms));
  const lines = await Promise.race([generator.generate(ctx).catch(() => null), timeout]);
  return Array.isArray(lines) && lines.length ? lines : [fallbackLine];
}

/**
 * TODO(you) — Learning contribution #3 (~6 lines).
 *
 * Anti-repetition phrase selection: pick one element of `bank` with `rng`,
 * preferring elements NOT present in `recent` (the most recently used
 * fragments). When every element of the bank is recent, still return
 * something valid rather than throwing.
 *
 * Trade-offs: filter-then-pick (simple; falls back to the full bank when the
 * filter empties) vs weight decay (recent items merely unlikely — subtler,
 * keeps variety in tiny banks). The tests only require: never pick a recent
 * fragment while a fresh one exists, and never fail on a saturated bank.
 */
export function pickFragment(bank, recent, rng) {
  throw new TodoError('pickFragment: TODO(you) — see the docblock in js/core/feedback.js');
}

// Provisional fallback until pickFragment is implemented: plain pick.
function pickFrag(bank, recent, rng) {
  try { return pickFragment(bank, recent, rng); }
  catch (e) { if (e instanceof TodoError) return rng.pick(bank); throw e; }
}

// ── Phrase banks (es/cy flavored) ──────────────────────────────────────────

const APERTURA = [
  'Diolch yn fawr iawn — gracias a todos los participantes de esta competencia.',
  'Wel, wel — qué nivel hemos escuchado esta tarde.',
  'Da iawn wir. Un certamen muy reñido, felicitaciones a todos.',
  'Llongyfarchiadau a cada uno por animarse a subir al escenario.',
  'Bendigedig! El espíritu del eisteddfod estuvo presente en cada presentación.',
  'Braint oedd gwrando — fue un privilegio escucharlos.',
];

const TECH = {
  solo: [
    'la afinación se sostuvo con seguridad en el registro agudo',
    'el fraseo respiró con naturalidad, chwarae teg',
    'la interpretación mostró un manejo del aire muy maduro',
    'hubo un color de voz cálido, llais hyfryd',
  ],
  recitacion: [
    'la dicción fue clarísima, cada palabra llegó al fondo de la sala',
    'el ritmo del poema se sintió vivo — roedd y geiriau yn dawnsio',
    'la memoria no flaqueó ni un instante',
    'los matices dramáticos estuvieron muy bien dosificados',
  ],
  cydadrodd: [
    'las voces entraron juntas con una precisión admirable',
    'el unísono respiró como una sola voz — un llais, un galon',
    'los contrastes entre voces fueron muy expresivos',
  ],
  coro: [
    'el blend de las voces fue parejo y luminoso',
    'las entradas llegaron limpias en cada frase, da iawn',
    'la afinación del acorde final quedó flotando en la sala',
    'el balance entre cuerdas mostró un trabajo serio de ensayo',
  ],
  conjunto: [
    'el ensamble entre voces e instrumentos fue muy prolijo',
    'la energía del grupo contagió a toda la sala',
    'los arreglos se escucharon claros y bien equilibrados',
  ],
  parti: [
    'el entusiasmo del parti se ganó a la audiencia, hyfryd iawn',
    'las voces jóvenes sonaron seguras y bien preparadas',
    'la coordinación del grupo fue notable para su edad',
  ],
  deuawd: [
    'el balance entre las dos voces fue delicado y justo',
    'las voces dialogaron — deuawd go iawn',
    'los unísonos y las terceras quedaron muy bien logrados',
  ],
  dawns: [
    'la figura se mantuvo firme en cada vuelta, camau glân',
    'el footwork fue preciso y liviano',
    'la pareja mantuvo la elegancia del estilo tradicional',
    'la coordinación del set fue impecable',
  ],
  instrumental: [
    'el ensamble mantuvo el tempo con firmeza',
    'la articulación fue limpia en los pasajes rápidos',
    'el diálogo entre los instrumentos se disfrutó de principio a fin',
  ],
  ceremony: [
    'la obra presentada honra la tradición literaria de la Wladfa',
  ],
};

const COLOR = [
  'Fel y dywedwn yn y Wladfa: el arte nos une.',
  'Roedd hiraeth yn y neuadd — había emoción en la sala.',
  'Así se mantiene viva la tradición, diolch o galon.',
  'La decisión no fue fácil para este jurado.',
  'Cofiwch — lo importante es la música que compartimos.',
];

const DESIERTO_LINES = [
  'Tras deliberar, este jurado considera que el nivel requerido no se alcanzó en esta ocasión.',
  'Fue una decisión difícil — anodd iawn — pero el premio quedará desierto esta vez.',
];

const ENTRANT_TEMPLATES = [
  'Sobre {name}: {tech}.',
  '{name} — {tech}.',
  'En el caso de {name}, {tech}.',
];

export class TemplateFeedbackGenerator extends FeedbackGenerator {
  constructor() {
    super();
    this.recent = [];
  }

  _remember(fragment) {
    this.recent.push(fragment);
    if (this.recent.length > 8) this.recent.shift();
  }

  async generate({ item, rng }) {
    const kind = item.program.kind;
    const tech = TECH[kind] || TECH.solo;
    const lines = [];

    const opening = pickFrag(APERTURA, this.recent, rng);
    this._remember(opening);
    lines.push(opening);

    if (item.placements === 'desierto') {
      lines.push(pickFrag(DESIERTO_LINES, this.recent, rng));
      return lines;
    }

    const byKey = Object.fromEntries(item.entrants.map(e => [e.key, e.displayName]));
    for (const p of item.placements) {
      const t = pickFrag(tech, this.recent, rng);
      this._remember(t);
      const tpl = rng.pick(ENTRANT_TEMPLATES);
      lines.push(tpl.replace('{name}', byKey[p.entrantKey]).replace('{tech}', t));
    }

    lines.push(pickFrag(COLOR, this.recent, rng));
    return lines;
  }
}
