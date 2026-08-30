import type { Rng } from './rng.ts';
import type { Kind } from './types.ts';
// Fictional Welsh-Patagonian name banks + generators. Pure module.
export const GROUP_KINDS = ['coro', 'conjunto', 'parti', 'dawns', 'deuawd', 'instrumental', 'cydadrodd'];

const GIVEN = [
  'Gwyn', 'Eirlys', 'Mererid', 'Llywelyn', 'Rhiannon', 'Dafydd', 'Angharad', 'Iwan',
  'Nia', 'Tegai', 'Bethan', 'Owain', 'Elen', 'Gwilym', 'Sara', 'Tomos', 'Luned',
  'Aled', 'Mari', 'Carwyn', 'Delyth', 'Bryn', 'Ffion', 'Hedd', 'Camwy', 'Elena',
  'Ricardo', 'Ana', 'Federico', 'Valentina', 'Mateo', 'Lucía', 'Alwen', 'Clydwyn',
];

const SURNAMES = [
  'Jones', 'ap Iwan', 'Roberts', 'Griffiths', 'Evans', 'Williams', 'Davies',
  'Hughes', 'Owen', 'Pugh', 'Morgan', 'Thomas', 'Rhys', 'González-Evans',
  'Pritchard', 'Freeman de Jones', 'Vaughan', 'Austin', 'Lewis', 'Matthews',
  'Humphreys', 'Berwyn', 'de la Cruz Williams', 'Zampini-Hughes',
];

// Lugares FICTICIOS con sabor galés-patagónico (ningún pueblo real).
const PLACES = [
  'Porth Awel', 'Bryn Heulog', 'Cwm Hedd', 'Dyffryn Aur', 'Traeth y Sêr',
  'Nant Enfys', 'Pant y Môr', 'Glyn Ebrill', 'Puerto Amancay', 'Valle Alazán',
  'Bahía Zorzal', 'Alto Coirón',
];

const TEMPLATES = {
  coro: ['Côr {place}', 'Coro {place}', 'Côr Merched {place}', 'Côr Meibion {place}'],
  parti: ['Parti {place}', 'Parti Ysgol {place}', 'Parti Bach {place}'],
  conjunto: ['Conjunto {place}', 'Ensamble {place}', 'Conjunto Vocal {place}'],
  dawns: ['Dawnswyr {place}', 'Grŵp Dawns {place}', 'Ballet Folklórico {place}'],
  instrumental: ['Dúo {place}', 'Trío {place}', 'Ensamble {place}'],
  cydadrodd: ['Parti Cydadrodd {place}', 'Lleisiau {place}'],
};

export function makeNameGen(rng: Rng) {
  return {
    person() {
      return { name: rng.pick(GIVEN), surname: rng.pick(SURNAMES) };
    },
    group(kind: Kind): string {
      if (kind === 'deuawd') return `${rng.pick(GIVEN)} a ${rng.pick(GIVEN)}`;
      // Not every kind has its own templates; conjunto is the general fallback.
      const templates: readonly string[] = TEMPLATES[kind as keyof typeof TEMPLATES] ?? TEMPLATES.conjunto;
      return rng.pick(templates).replace('{place}', rng.pick(PLACES));
    },
  };
}
