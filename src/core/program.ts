// Programa del Día FICTICIO — Eisteddfod Bythfod, Porth Awel (edición sandbox).
// Estructura inspirada en los programas reales de los eisteddfodau patagónicos
// (sesiones, Comp.NN, ceremonias a hora fija), pero festival, sede, piezas,
// autores y lugares son todos inventados. Data pura, sin lógica.
// kind → casting/música/escena; language → competition.language de eistedglobal
// ('cy' → Cymraeg, 'es' → Castellano).
import type { Kind, Program } from './types.ts';

export const KINDS: readonly Kind[] = [
  'solo', 'recitacion', 'cydadrodd', 'coro', 'conjunto', 'parti',
  'deuawd', 'dawns', 'instrumental', 'ceremony',
];

export const PROGRAM: Program = {
  festival: 'Eisteddfod Bythfod',
  edition: 'Eisteddfod Bythfod — Porth Awel (edición ficticia)',
  venue: 'Neuadd y Dyffryn, Porth Awel',
  sessions: [
    {
      id: 'vie-apertura',
      label: 'Viernes · Sesión de apertura · 18:30',
      items: [
        { comp: 31, kind: 'solo', label: 'Solo 13 a 17 años', piece: 'El faro y la ballena', author: 'Marta Coirón', language: 'es', entrantType: 'IND' },
        { comp: 54, kind: 'recitacion', label: 'Recitación 12 a 14 años', piece: 'Barco de papel', author: 'Silvina Meseta', language: 'es', entrantType: 'IND' },
        { comp: 22, kind: 'conjunto', label: 'Conjunto Vocal Instrumental nivel secundario', piece: 'Canción del viento oeste', author: 'Bruno Calafate', language: 'es', entrantType: 'GRU' },
        { comp: 48, kind: 'recitacion', label: 'Adrodd 13 tan 18 oed', piece: 'Y Gwynt Teg', author: 'Elin Prysor', language: 'cy', entrantType: 'IND' },
        { comp: 39, kind: 'coro', label: 'Coro Juvenil hasta 25 años', piece: 'Zamba de la marea', author: 'Aurelio Brisas', language: 'es', entrantType: 'GRU' },
        { comp: 63, kind: 'dawns', label: 'Dawns werin i brofiadwyr', piece: 'Twmpath y Lloer', language: 'cy', entrantType: 'GRU' },
        { comp: 28, kind: 'solo', label: 'Solo 18 a 25 años (canción popular)', piece: 'Ciudad de sal', author: 'Lila Ñanco', language: 'es', entrantType: 'IND' },
        { comp: 45, kind: 'instrumental', label: 'Dúo instrumental', piece: 'Obra a libre elección', language: 'es', entrantType: 'GRU' },
        { comp: 16, kind: 'solo', label: 'Unawd hyd 25 oed', piece: 'Seren y Bore', author: 'Gwenno Llechwedd', language: 'cy', entrantType: 'IND' },
        { comp: 66, kind: 'dawns', label: 'Danza folklórica (una pareja)', piece: 'Chacarera del puerto', language: 'es', entrantType: 'GRU' },
        { comp: 51, kind: 'recitacion', label: 'Recitación 15 a 18 años', piece: 'Romance de la meseta', author: 'Aurelio Brisas', language: 'es', entrantType: 'IND' },
        { comp: 42, kind: 'coro', label: 'Coro hasta 30 años con movimiento escénico', piece: 'Obra vocal a libre elección', language: 'es', entrantType: 'GRU' },
      ],
    },
    {
      id: 'sab-infantil',
      label: 'Sábado · Sesión infantil · 14:00',
      items: [
        { comp: 10, kind: 'conjunto', label: 'Conjunto Vocal nivel inicial', piece: 'El chubasco chiquito', author: 'Marta Coirón', language: 'es', entrantType: 'GRU' },
        { comp: 11, kind: 'recitacion', label: 'Adrodd hyd 6 oed', piece: 'Y Morfil Bach', author: 'Nanw Petral', language: 'cy', entrantType: 'IND' },
        { comp: 12, kind: 'solo', label: 'Solo hasta 6 años', piece: 'Semillita del valle', author: 'Lila Ñanco', language: 'es', entrantType: 'IND' },
        { comp: 13, kind: 'parti', label: 'Parti hyd 8 oed', piece: "Curo'r Drwm", language: 'cy', entrantType: 'GRU' },
        { comp: 14, kind: 'recitacion', label: 'Recitación hasta 5 años', piece: 'La tortuga viajera', author: 'Silvina Meseta', language: 'es', entrantType: 'IND' },
        { comp: 15, kind: 'solo', label: 'Solo 7 a 8 años', piece: 'Ronda del faro', author: 'Bruno Calafate', language: 'es', entrantType: 'IND' },
        { comp: 17, kind: 'dawns', label: 'Dawns hyd oed 12', piece: 'Dawns y Dail', language: 'cy', entrantType: 'GRU' },
        { comp: 18, kind: 'solo', label: 'Unawd hyd 8 oed', piece: 'Ji Binc y Bore', language: 'cy', entrantType: 'IND' },
        { comp: 19, kind: 'recitacion', label: 'Recitación 6 a 7 años', piece: 'El espejo del charco', author: 'Rosa Amancay', language: 'es', entrantType: 'IND' },
        { comp: 20, kind: 'solo', label: 'Solo 9 a 11 años', piece: 'Cometa de agosto', author: 'Marta Coirón', language: 'es', entrantType: 'IND' },
        { comp: 21, kind: 'recitacion', label: 'Adrodd 7 tan 9 oed', piece: 'Glaw ar y To', author: 'Heledd Môr', language: 'cy', entrantType: 'IND' },
        { comp: 23, kind: 'conjunto', label: 'Conjunto Vocal Instrumental primer ciclo', piece: 'El acordeón del abuelo', author: 'Aurelio Brisas', language: 'es', entrantType: 'GRU' },
        { comp: 24, kind: 'dawns', label: 'Dawns hyd oed 7', piece: 'Cylch y Sêr', language: 'cy', entrantType: 'GRU' },
        { comp: 25, kind: 'recitacion', label: 'Recitación 8 a 9 años', piece: 'Mariposa de sal', author: 'Lila Ñanco', language: 'es', entrantType: 'IND' },
        { comp: 26, kind: 'parti', label: 'Parti hyd 12 oed', piece: 'Sŵn y Môr', author: 'Ceri Nant Aur', language: 'cy', entrantType: 'GRU' },
        { comp: 27, kind: 'coro', label: 'Coro hasta 12 años (2 voces a capella)', piece: 'Canon de la lluvia', author: 'L. Bethel-Cruz', language: 'es', entrantType: 'GRU' },
        { comp: 29, kind: 'solo', label: 'Unawd 9 i 11 oed', piece: "Cadw'r Gân", language: 'cy', entrantType: 'IND' },
        { comp: 30, kind: 'coro', label: 'Coro escolar (nivel primario)', piece: 'El pañuelo celeste', author: 'Rosa Amancay', language: 'es', entrantType: 'GRU' },
      ],
    },
    {
      id: 'sab-gala',
      label: 'Sábado · Sesión de gala · 19:30',
      items: [
        { comp: 60, kind: 'dawns', label: 'Dawns y teuluoedd (danza familiar)', piece: 'Dawns y Teulu Mawr', language: 'cy', entrantType: 'GRU' },
        { comp: 33, kind: 'conjunto', label: 'Conjunto familiar', piece: 'Obra en castellano a libre elección', language: 'es', entrantType: 'GRU' },
        { comp: 71, kind: 'recitacion', label: 'Recitación voz femenina', piece: 'Cartografía de la costa', author: 'Rosa Amancay', language: 'es', entrantType: 'IND' },
        { comp: 35, kind: 'solo', label: 'Unawd werin (solo folklórico)', piece: 'Hunanddewisiad o gân werin', language: 'cy', entrantType: 'IND' },
        { comp: 55, kind: 'instrumental', label: 'Ensamble instrumental de formación libre', piece: 'Obra y estilo a libre elección', language: 'es', entrantType: 'GRU' },
        { ceremony: 'delyn', fixedSlot: 6, time: '20:15', kind: 'ceremony', label: 'Gwobr y Delyn Arian — Premio Arpa de Plata', piece: 'Agored: cerdd ar destun rhydd', language: 'cy', entrantType: 'IND' },
        { comp: 36, kind: 'coro', label: 'Cuarteto mixto', piece: 'Himno del valle escondido', author: 'L. Bethel-Cruz', language: 'es', entrantType: 'GRU' },
        { comp: 68, kind: 'cydadrodd', label: 'Agored: Cydadrodd (recitación coral)', piece: "Lleisiau'r Glannau", author: 'Heledd Môr', language: 'cy', entrantType: 'GRU' },
        { comp: 37, kind: 'coro', label: 'Conjunto o coro femenino', piece: 'Aire de calandria', author: 'Marta Coirón', language: 'es', entrantType: 'GRU' },
        { comp: 72, kind: 'recitacion', label: 'Recitación voz masculina', piece: 'Carta al vendaval', author: 'Bruno Calafate', language: 'es', entrantType: 'IND' },
        { comp: 34, kind: 'deuawd', label: 'Deuawd agored', piece: 'Deuawd y Ddwy Afon', author: 'Ceri Nant Aur', language: 'cy', entrantType: 'GRU' },
        { ceremony: 'bythfod', fixedSlot: 12, time: '21:15', kind: 'ceremony', label: 'Premio Bythfod — Competencia Principal', piece: 'Poema inédito, tema y estilo libres', language: 'es', entrantType: 'IND' },
        { comp: 38, kind: 'coro', label: 'Côr Cymysg', piece: 'Bugail y Mynydd Glas', author: 'Tomos y Waun', language: 'cy', entrantType: 'GRU' },
        { comp: 70, kind: 'recitacion', label: 'Adrodd Oedolion', piece: "Goleudy'r Nos", author: 'Elin Prysor', language: 'cy', entrantType: 'IND' },
        { comp: 40, kind: 'coro', label: 'COMPETENCIA PRINCIPAL — Coro mixto', piece: 'Cantata del Golfo Escondido', author: 'L. Bethel-Cruz', language: 'es', entrantType: 'GRU' },
        { comp: 41, kind: 'solo', label: 'Unawd agored (cân ysgafn)', piece: 'Hunanddewisiad o gân ysgafn', language: 'cy', entrantType: 'IND' },
      ],
    },
  ],
};
