import type { Kind } from '../core/types.ts';
// Jury-cam renderer: dark close-up of the adjudicator at their table
// (mic, papers, water bottle), modeled on real eisteddfod adjudication
// footage. DOM built once; render() only swaps mode classes and advances the
// typewriter caption. juryState: { mode: off|listening|speaking|announcing,
// line, lineT }.
const CHARS_PER_SEC = 28;

// One adjudicator per discipline — panel of four (all fictional).
/** One adjudicator's identity and appearance. */
export interface Judge {
  name: string;
  role: string;
  skin: string;
  hair: string;
  coat: string;
  glasses: boolean;
}

export const JUDGES: Record<string, Judge> = {
  cerdd: { name: 'Alwena Sain', role: 'Beirniad Cerdd', skin: '#d9a878', hair: '#17090b', coat: '#241626', glasses: true },
  llen: { name: 'Mabon Bethel', role: 'Beirniad Llên', skin: '#c08a58', hair: '#4a4a54', coat: '#1e2c20', glasses: true },
  dawns: { name: 'Tegwen Enfys', role: 'Beirniad Dawns', skin: '#e8c098', hair: '#6a2c10', coat: '#3a1630', glasses: false },
  offer: { name: 'Osian Zorzal', role: 'Beirniad Offerynnol', skin: '#b87848', hair: '#0e0e14', coat: '#142038', glasses: false },
};

export function judgeFor(kind: Kind): Judge {
  if (['recitacion', 'cydadrodd', 'ceremony'].includes(kind)) return JUDGES.llen;
  if (kind === 'dawns') return JUDGES.dawns;
  if (kind === 'instrumental') return JUDGES.offer;
  return JUDGES.cerdd; // solo, coro, conjunto, parti, deuawd
}

export class JuryRend {
  private readonly root: HTMLElement;
  private readonly $caption: HTMLElement;
  private _mode: string | null;
  private _shown: string;
  /** The current judge's NAME, used to skip redundant re-renders. */
  private _judge: string | null;
  private _noGlasses = false;

  constructor(rootEl: HTMLElement) {
    this.root = rootEl;
    this.root.innerHTML =
      `<div class="j-spot"></div>` +
      `<div class="j-fig">` +
        `<div class="j-hair"></div>` +
        `<div class="j-head"><div class="j-glasses"></div><div class="j-eye l"></div><div class="j-eye r"></div><div class="j-mouth"></div></div>` +
        `<div class="j-torso"></div>` +
        `<div class="j-arm"></div>` +
      `</div>` +
      `<div class="j-table"></div>` +
      `<div class="j-papers"></div>` +
      `<div class="j-pencil"></div>` +
      `<div class="j-mic"></div>` +
      `<div class="j-bottle"></div>` +
      `<div class="j-envelope"></div>` +
      `<div class="j-vignette"></div>` +
      `<div class="j-label">BEIRNIAD · JURY CAM</div>` +
      `<div class="j-caption" hidden></div>`;
    this.$caption = this.root.querySelector('.j-caption') as HTMLElement;
    this._mode = null;
    this._shown = '';
    this._judge = null;
    this.setJudge(JUDGES.cerdd);
  }

  setJudge(judge: Judge): void {
    if (this._judge === judge.name) return;
    this._judge = judge.name;
    this._noGlasses = !judge.glasses;
    this.root.style.setProperty('--j-skin', judge.skin);
    this.root.style.setProperty('--j-hair', judge.hair);
    this.root.style.setProperty('--j-coat', judge.coat);
    (this.root.querySelector('.j-label') as HTMLElement).textContent =
      `${judge.role.toUpperCase()} · ${judge.name.toUpperCase()}`;
    this._applyClass();
  }

  setTheme(name: string): void { this.root.dataset.theme = name; }

  _applyClass(): void {
    this.root.className = `jury mode-${this._mode ?? 'off'}${this._noGlasses ? ' no-glasses' : ''}`;
  }

  render({ mode, line, lineT = 0 }: { mode: string; line?: string; lineT?: number }): void {
    if (mode !== this._mode) {
      this._mode = mode;
      this._applyClass();
    }
    const visible = (mode === 'speaking' || mode === 'announcing') && line
      ? line.slice(0, Math.floor(lineT * CHARS_PER_SEC))
      : '';
    if (visible !== this._shown) {
      this._shown = visible;
      this.$caption.hidden = !visible;
      this.$caption.textContent = visible;
    }
  }
}
