import type { DayPlan } from '../core/types.ts';
import type { EngineState, positionState } from '../core/engine.ts';
// HUD: transport controls, program drawer, setup overlay, pane scaling.
// Pure DOM glue — all decisions live in main.js via the handlers object.
/** Everything the HUD can ask the app to do. */
export interface HudHandlers {
  onPlayPause(): void;
  onSpeed(): void;
  onJump(ordinal: number): void;
  onVolume(v: number): void;
  onTheme(t: string): void;
  onStart(values: SetupValues): void;
  onConnect(values: SetupValues): void;
}

/** What the setup panel collects. Credentials are absent in the static build. */
export interface SetupValues {
  seed: number;
  username: string | undefined;
  password: string | undefined;
}

export class Hud {
  private readonly h: HudHandlers;
  private readonly $: (id: string) => HTMLElement;
  private readonly $opt: (id: string) => HTMLElement | null;
  private _soundOn = true;
  private _prevOrd: number | null = null;

  constructor(handlers: HudHandlers) {
    this.h = handlers;
    // Two lookups, because the static build omits the API panel: $ is for
    // elements index.html always has, $opt for the ones it may not.
    const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
    const $opt = (id: string): HTMLElement | null => document.getElementById(id);
    this.$ = $;
    this.$opt = $opt;

    $('bPlay').onclick = () => this.h.onPlayPause();
    $('bSpeed').onclick = () => this.h.onSpeed();
    $('bProgram').onclick = () => this.toggleDrawer();
    ($('bTheme') as HTMLSelectElement).onchange = e =>
      this.h.onTheme((e.target as HTMLSelectElement).value);
    // The static build ships without the API panel, so these may not exist.
    const connect = $opt('bConnect');
    if (connect) connect.onclick = () => this.h.onConnect(this.setupValues());
    $('bStartOffline').onclick = () => this.h.onStart(this.setupValues());

    this._soundOn = true;
    $('bVol').onclick = () => {
      this._soundOn = !this._soundOn;
      $('bVol').textContent = this._soundOn ? '🔊 SONIDO' : '🔇 SILENCIO';
      this.h.onVolume(this._soundOn ? 0.22 : 0);
    };

    document.addEventListener('keydown', e => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === ' ') { e.preventDefault(); this.h.onPlayPause(); }
    });

    addEventListener('resize', () => this.fit());
    this.fit();
  }

  setupValues(): SetupValues {
    return {
      seed: parseInt((this.$('inSeed') as HTMLInputElement).value, 10) || 42,
      // Credentials belong to the caller, not the HUD; absent in the static build.
      username: (this.$opt('inUser') as HTMLInputElement | null)?.value || undefined,
      password: (this.$opt('inPass') as HTMLInputElement | null)?.value || undefined,
    };
  }

  showSetup(): void { this.$('setup-overlay').hidden = false; }
  hideSetup(): void { this.$('setup-overlay').hidden = true; }
  log(msg: string): void {
    const el = this.$('setupLog');
    if (!el) return; // static build ships no setup log
    el.textContent += `${msg}\n`;
    el.scrollTop = el.scrollHeight;
  }

  buildProgram(plan: DayPlan): void {
    const drawer = this.$('progList');
    drawer.innerHTML = plan.sessions.map(s =>
      `<div class="prog-session">${s.label}</div>` +
      s.items.map(item => {
        const tag = item.program.kind === 'ceremony' ? '✦' : `C.${item.program.comp}`;
        return `<div class="prog-item" data-ord="${item.ordinal}">` +
          `<span class="prog-state"></span><span class="prog-tag">${tag}</span> ${item.program.label}</div>`;
      }).join('')
    ).join('');
    drawer.querySelectorAll<HTMLElement>('.prog-item').forEach(el => {
      el.onclick = () => this.h.onJump(Number(el.dataset.ord));
    });
  }

  toggleDrawer(): void { this.$('drawer').hidden = !this.$('drawer').hidden; }

  markAwarded(ordinal: number, desierto = false): void {
    const el = this.$('progList').querySelector(`[data-ord="${ordinal}"] .prog-state`);
    if (el) { el.textContent = desierto ? '∅' : '🏆'; el.classList.add('done'); }
  }

  update(pos: ReturnType<typeof positionState>, engineSt: EngineState): void {
    this.$('bPlay').textContent = !engineSt.started ? '▶ COMENZAR'
      : engineSt.paused ? '▶ SEGUIR' : '⏸ PAUSA';
    this.$('bSpeed').textContent = `⏩ ×${engineSt.speed}`;
    if (pos.itemOrdinal !== this._prevOrd) {
      this._prevOrd = pos.itemOrdinal;
      this.$('progList').querySelectorAll('.prog-item.now').forEach(el => el.classList.remove('now'));
      const row = this.$('progList').querySelector(`[data-ord="${pos.itemOrdinal}"]`);
      if (row) { row.classList.add('now'); row.scrollIntoView({ block: 'nearest' }); }
    }
  }

  setName(t: string): void { this.$('actName').textContent = t; }
  setSub(t: string): void { this.$('subtitle').textContent = t; }

  fit(): void {
    const scale = Math.min(1, (innerWidth - 24) / 1170, (innerHeight - 130) / 676);
    this.$('viewport').style.setProperty('--app-scale', scale.toFixed(3));
  }
}
