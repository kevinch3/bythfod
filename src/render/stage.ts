// Vendored from bythfod rend-html.js — DOM stage renderer (StageRend), renamed StageRend, ES module.
// Coordinate space 256×224 × S=3. Contract: render({actType, phase, overlay, banner, spotMode, n, actT}).
// ─────────────────────────────────────────────
//  HTML/CSS RENDERER  — replaces canvas Rend
//  Stage coordinate space: 256×224 (×3 → 768×672 CSS)
// ─────────────────────────────────────────────
/** What the engine asks the stage to draw. */
export interface StageState {
  actType: string;
  phase: string;
  overlay: number;
  n: number;
  spotMode: string;
  actT: number;
  banner?: string | null;
}

/** A per-frame updater: given the frame counter and current state, mutate DOM. */
type Anim = (f: number, state: StageState) => void;

export class StageRend {
  static S     = 3;
  static SKINS = ['#eec8a0','#deb07c','#bc7440','#8a5028','#663018','#eed4b8'];
  static ROBES = ['#1c3288','#142472','#223694','#182a82','#28389e'];

  private readonly stage: HTMLElement;
  private f: number;
  private _prevType: string | null;
  private _prevPhase: string | null;
  private _anims: Anim[];
  private _sparkling: boolean;
  private _prevBanner: string | null | undefined;
  /** The stage's fixed layers, by id suffix. */
  private readonly L: Record<string, HTMLElement>;

  constructor(stageEl: HTMLElement) {
    this.stage = stageEl;
    this.f     = 0;
    this._prevType   = null;
    this._prevPhase  = null;
    this._anims      = [];   // [(f, state) => void]  per-frame updaters
    this._sparkling  = false;
    this._prevBanner = undefined;

    this.L = {};
    ['bg','floor','risers','curtains','performers','spots','audience','overlay','banner','sparkles']
      .forEach(id => { this.L[id] = stageEl.querySelector(`#l-${id}`) as HTMLElement; });

    this._buildFootlights();
    this._buildAudience();
  }

  // ── PUBLIC API ───────────────────────────────────────────────────────

  render(state: StageState): void {
    const f = ++this.f;

    // Rebuild performer DOM only when act or phase changes
    if (state.actType !== this._prevType || state.phase !== this._prevPhase) {
      this._prevType  = state.actType;
      this._prevPhase = state.phase;
      this._buildPerfs(state);
      this.L.spots.dataset.spot = state.spotMode || 'center';
      this.L.risers.style.display = state.actType === 'ceremoni' ? 'none' : '';
    }

    // Per-frame animations
    this._anims.forEach(fn => fn(f, state));

    // Overlay fade
    this.L.overlay.style.opacity = String(state.overlay ?? 0);

    // Banner (only update on change)
    if (state.banner !== this._prevBanner) {
      this._prevBanner = state.banner;
      this.L.banner.hidden = !state.banner;
      if (state.banner) this.L.banner.textContent = state.banner;
    }

    // Sparkles
    const wantSpark = state.phase === 'applause';
    if (wantSpark !== this._sparkling) {
      this._sparkling = wantSpark;
      this._setSparkles(wantSpark);
    }

    // Audience applause hands
    this.L.audience.classList.toggle('applause', state.phase === 'applause');
  }

  setTheme(name: string): void { this.stage.dataset.theme = name; }

  // ── SCENE ────────────────────────────────────────────────────────────

  _buildFootlights(): void {
    const S = StageRend.S;
    for (let i = 0; i < 8; i++) {
      const d = this._el('div', 'footlight');
      d.style.left = `${(14 + i * 32) * S}px`;
      d.style.animationDelay = `${-(i * 0.9).toFixed(2)}s`;
      this.L.floor.appendChild(d);
    }
  }

  // ── AUDIENCE ─────────────────────────────────────────────────────────

  _buildAudience(): void {
    const S = StageRend.S, au = this.L.audience;
    let s = 7919;
    const rn = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 4294967295; };
    const HC = ['#0a0314','#14061e','#080a12','#04030c','#1c0a04','#120800'];
    const BC = ['#040208','#07030c','#050506','#020204'];
    const SK = StageRend.SKINS;

    for (const {y, n, sp} of [{y:195,n:22,sp:11.6},{y:204,n:20,sp:12.8},{y:213,n:18,sp:14.2}]) {
      for (let i = 0; i < n; i++) {
        const x  = Math.floor(i * sp + rn() * 3 + 4);
        const w  = 7 + Math.floor(rn() * 4);
        const bc = BC[Math.floor(rn() * 4)];
        const hc = HC[Math.floor(rn() * 6)];

        au.appendChild(this._el('div', 'a-seat',
          `left:${x*S}px;top:${(y+4)*S}px;width:${w*S}px;height:${9*S}px;background:${bc}`));
        au.appendChild(this._el('div', 'a-head',
          `left:${x*S}px;top:${y*S}px;width:${(w-1)*S}px;height:${5*S}px;background:${hc}`));

        if (rn() > .55) {
          au.appendChild(this._el('div', 'a-face',
            `left:${(x+1)*S}px;top:${(y+1)*S}px;width:${Math.max(3,(w-3)*S)}px;height:${3*S}px;background:${SK[Math.floor(rn()*4)]}`));
        } else { rn(); }

        const hand = this._el('div', 'a-hand',
          `left:${(x+1)*S}px;top:${(y-8)*S}px;width:${(w-2)*S}px;--hc:${SK[0]};animation-delay:${(rn()*1.2).toFixed(2)}s`);
        au.appendChild(hand);
      }
    }
  }

  // ── PERFORMERS ───────────────────────────────────────────────────────

  _buildPerfs(state: StageState): void {
    this.L.performers.innerHTML = '';
    this._anims = [];
    const {actType, n, phase} = state;
    const anim = phase === 'performing' || phase === 'applause';

    switch (actType) {
      case 'choir':     this._choir(n || 12, anim); break;
      case 'solo':      this._soloist(anim);         break;
      case 'duo':       this._duo(anim);             break;
      case 'violin':    this._violinist(anim);       break;
      case 'trumpet':   this._trumpeter(anim);       break;
      case 'reciter':   this._reciter(anim);         break;
      case 'trio':      this._trio(anim);            break;
      case 'dancer':    this._dancer(n || 1, anim);  break;
      case 'longways':  this._longways(anim);        break;
      case 'ceremoni':  this._ceremoni(anim);        break;
      case 'announcer': this._announcer();           break;
      case 'empty':     /* bare dim stage while the jury speaks */ break;
    }

    if (['choir','solo','duo','violin','trumpet','trio'].includes(actType)) {
      this._pianist();
    }

    // Entrance/exit transitions: performers walk in from the wings at the
    // start of a performance and walk off during the applause. Longways and
    // ceremoni keep their own choreography; the pianist stays seated.
    if (['choir', 'solo', 'duo', 'violin', 'trumpet', 'reciter', 'trio', 'dancer'].includes(actType)) {
      if (phase === 'performing') this._walkIn();
      else if (phase === 'applause') this._walkOff();
    }
  }

  _walkers(): HTMLElement[] {
    return ([...this.L.performers.children] as HTMLElement[]).filter(el =>
      el.classList.contains('person') && !el.classList.contains('facing-back'));
  }

  _walkIn(): void {
    const S = StageRend.S;
    this._walkers().forEach((el, i) => {
      const targetX = parseInt(el.style.left, 10) / S;
      const startDx = (targetX < 128 ? -(targetX + 24) : (256 - targetX) + 24) * S;
      const T = 50, delay = i * 4;
      let f0: number | null = null;
      this._anims.push(f => {
        if (f0 === null) f0 = f;
        const t = f - f0 - delay;
        if (t < 0) { el.style.transform = `translateX(${startDx}px)`; return; }
        const p = Math.min(1, t / T);
        if (p >= 1) return; // arrived — the builder's bob anim takes over
        const ease = 1 - Math.pow(1 - p, 2);
        const dx = Math.round((startDx / S) * (1 - ease)) * S;
        const step = Math.round(Math.sin(t * 0.6) * 0.8) * S;
        el.style.transform = `translate(${dx}px, ${step}px)`;
      });
    });
  }

  _walkOff(): void {
    const S = StageRend.S;
    this._walkers().forEach((el, i) => {
      const x = parseInt(el.style.left, 10) / S;
      const endDx = (x < 128 ? -(x + 24) : (256 - x) + 24) * S;
      const T = 55, delay = 12 + i * 3; // a short bow to the applause first
      let f0: number | null = null;
      this._anims.push(f => {
        if (f0 === null) f0 = f;
        const t = f - f0 - delay;
        if (t <= 0) return;
        const p = Math.min(1, t / T);
        const ease = p * p;
        const dx = Math.round((endDx / S) * ease) * S;
        const step = p < 1 ? Math.round(Math.sin(t * 0.6) * 0.8) * S : 0;
        el.style.transform = `translate(${dx}px, ${step}px)`;
      });
    });
  }

  _choir(n: number, anim: boolean): void {
    const rows = [
      {footY: 129, count: Math.min(5, n)},
      {footY: 115, count: Math.min(4, Math.max(0, n - 5))},
      {footY: 101, count: Math.min(3, Math.max(0, n - 9))},
    ];
    let idx = 0;
    for (const row of rows) {
      if (!row.count) continue;
      const sp = 20, totalW = (row.count - 1) * sp;
      let x = Math.floor((256 - totalW) / 2);
      for (let i = 0; i < row.count; i++, idx++, x += sp) {
        const el = this._person(x, row.footY, idx * 3 + 1, idx);
        this.L.performers.appendChild(el);
        if (anim) {
          const ii = idx;
          this._anims.push(f => {
            el.style.transform = `translateY(${Math.round(Math.sin(f * .082 + ii * .95) * .6) * StageRend.S}px)`;
          });
        }
      }
    }
  }

  _soloist(anim: boolean): void {
    const mic = this._prop('mic', 127, 132);
    const p   = this._person(128, 132, 2, 0);
    this.L.performers.append(mic, p);
    if (anim) this._anims.push(f => {
      const by = Math.round(Math.sin(f * .06) * .5) * StageRend.S;
      p.style.transform = mic.style.transform = `translateY(${by}px)`;
    });
  }

  _duo(anim: boolean): void {
    const m1 = this._prop('mic', 99, 132),  p1 = this._person(100, 132, 0, 0);
    const m2 = this._prop('mic', 157, 132), p2 = this._person(158, 132, 4, 2);
    this.L.performers.append(m1, p1, m2, p2);
    if (anim) this._anims.push(f => {
      const b1 = Math.round(Math.sin(f * .06) * .5)      * StageRend.S;
      const b2 = Math.round(Math.sin(f * .065 + 1.1) * .5) * StageRend.S;
      p1.style.transform = m1.style.transform = `translateY(${b1}px)`;
      p2.style.transform = m2.style.transform = `translateY(${b2}px)`;
    });
  }

  _violinist(anim: boolean): void {
    const p  = this._person(128, 132, 1, 2);
    const vn = this._prop('violin', 128, 132);
    this.L.performers.append(p, vn);
    if (anim) this._anims.push(f => {
      const by = Math.round(Math.sin(f * .07) * .5) * StageRend.S;
      p.style.transform = vn.style.transform = `translateY(${by}px)`;
    });
  }

  _trumpeter(anim: boolean): void {
    const p  = this._person(128, 132, 4, 3);
    const tr = this._prop('trumpet', 120, 132);
    this.L.performers.append(p, tr);
    if (anim) this._anims.push(f => {
      const by = Math.round(Math.sin(f * .07) * .4) * StageRend.S;
      p.style.transform = tr.style.transform = `translateY(${by}px)`;
    });
  }

  _reciter(anim: boolean): void {
    const pod = this._prop('podium', 120, 136);
    const p   = this._person(128, 132, 0, 4);
    this.L.performers.append(pod, p);
    if (anim) this._anims.push(f => {
      p.style.transform = `translateY(${Math.round(Math.sin(f * .04) * .3) * StageRend.S}px)`;
    });
  }

  _trio(anim: boolean): void {
    [100, 128, 156].forEach((x, i) => {
      const mic = this._prop('mic', x - 1, 132);
      const p   = this._person(x, 132, i * 2 + 1, i);
      this.L.performers.append(mic, p);
      if (anim) this._anims.push(f => {
        const by = Math.round(Math.sin(f * .065 + i * 1.1) * .5) * StageRend.S;
        p.style.transform = mic.style.transform = `translateY(${by}px)`;
      });
    });
  }

  _announcer(): void {
    const p1  = this._person(29, 160, 0, 0);
    const p2  = this._person(47, 160, 5, 0);
    const pod = this._prop('atril', 38, 160);
    this.L.performers.append(p1, p2, pod);
    this._anims.push(f => {
      p1.style.transform = `translateY(${Math.round(Math.sin(f * .05) * .5)      * StageRend.S}px)`;
      p2.style.transform = `translateY(${Math.round(Math.sin(f * .055 + 0.8) * .5) * StageRend.S}px)`;
    });
  }

  _pianist(): void {
    const piano = this._prop('piano', 200, 110);
    const p     = this._personBack(203, 132, 0, 4);
    this.L.performers.append(piano, p);
  }

  _dancer(n: number, anim: boolean): void {
    if (n <= 1) {
      this.L.performers.appendChild(this._folkFig(128, 132, 0, anim));
      return;
    }
    [88, 128, 168].forEach((x, i) => this.L.performers.appendChild(this._folkFig(x, 115, i + 5, anim)));
    [74, 100, 128, 156, 182].forEach((x, i) => this.L.performers.appendChild(this._folkFig(x, 130, i, anim)));
  }

  _longways(anim: boolean): void {
    const S = StageRend.S;
    const xs = [52, 86, 118, 150, 184], P = 420;
    const ease = (p: number) => p < .5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2;
    /** Eased progress of `t` through the window [s, e]. */
    const seg  = (s: number, e: number, t: number) => ease(Math.max(0, Math.min(1, (t - s) / (e - s))));
    const CROSS = 11, yA = 120, yB = 134, yMid = 127;

    const couples = xs.map((bx, i) => {
      const a = this._folkFig(bx, yA, i * 2,     anim);
      const b = this._folkFig(bx, yB, i * 2 + 1, anim);
      this.L.performers.append(a, b);
      return {a, b};
    });

    if (anim) this._anims.push(f => {
      const t    = (f % P) / P;
      const adv  = t<.15?0 : t<.38?seg(.15,.38,t) : t<.72?1 : t<.90?1-seg(.72,.90,t) : 0;
      const cr   = t<.32?0 : t<.55?seg(.32,.55,t) : t<.72?1 : t<.90?1-seg(.72,.90,t) : 0;
      const pass = Math.sin(cr * Math.PI);

      couples.forEach(({a, b}, i) => {
        const ax = Math.round(xs[i] + cr * CROSS);
        const ay = Math.round(yA + adv * (yMid - yA) - pass * 2);
        const bx = Math.round(xs[i] - cr * CROSS);
        const by = Math.round(yB - adv * (yB - yMid) + pass * 2);
        a.style.left = `${ax * S}px`; a.style.top = `${ay * S}px`;
        b.style.left = `${bx * S}px`; b.style.top = `${by * S}px`;
      });
    });
  }

  _ceremoni(anim: boolean): void {
    const S = StageRend.S;
    const throne     = this._prop('throne', 128, 148);
    const trumpeter  = this._person(80, 132, 4, 3);
    const tr         = this._prop('trumpet', 72, 132);
    const folkGroup  = [74, 100, 128, 156, 182].map((x, i) => {
      const el = this._folkFig(x, 130, i, false);
      el.style.opacity = '0';
      return el;
    });
    const poet = this._person(128, 132, 2, 0);
    poet.style.opacity = '0';

    this.L.performers.append(throne, tr, trumpeter, ...folkGroup, poet);

    this._anims.push((f, state) => {
      const t = state.actT || 0;
      trumpeter.style.opacity = t < 13 ? '1' : '0';
      tr.style.opacity        = t < 13 ? '1' : '0';
      folkGroup.forEach(el => { el.style.opacity = (t >= 7 && t < 22) ? '1' : '0'; });
      poet.style.opacity      = t >= 13 ? '1' : '0';

      if (anim) {
        trumpeter.style.transform = `translateY(${Math.round(Math.sin(f*.07)*.4)*S}px)`;
        if (t >= 13) poet.style.transform = `translateY(${Math.round(Math.sin(f*.04)*.3)*S}px)`;
      }
    });
  }

  // ── DOM BUILDERS ──────────────────────────────────────────────────────

  _person(x: number, footY: number, skinIdx: number, robeIdx: number): HTMLElement {
    const S    = StageRend.S;
    const skin = StageRend.SKINS[skinIdx % 6];
    const robe = StageRend.ROBES[robeIdx % 5];
    const el   = this._el('div', 'person',
      `left:${x*S}px;top:${footY*S}px;--skin:${skin};--robe:${robe}`);
    el.innerHTML =
      `<div class="p-shadow"></div>` +
      `<div class="p-coat"></div>` +
      `<div class="p-head"><div class="p-hair"></div><span class="p-eye l"></span><span class="p-eye r"></span></div>` +
      `<div class="p-foot l"></div><div class="p-foot r"></div>`;
    return el;
  }

  _personBack(x: number, footY: number, skinIdx: number, robeIdx: number): HTMLElement {
    const el = this._person(x, footY, skinIdx, robeIdx);
    el.classList.add('facing-back');
    return el;
  }

  _folkFig(x: number, footY: number, idx: number, anim: boolean): HTMLElement {
    const S      = StageRend.S;
    const female = !(idx & 1);
    const slot   = Math.floor(idx / 2) % 6;
    const sc     = ['#b82858','#174882','#1a5c20','#7a1818','#b86418','#1a4860'][slot];
    const el     = this._el('div', `person folk ${female ? 'female' : 'male'}`,
      `left:${x*S}px;top:${footY*S}px;--skin:${StageRend.SKINS[idx%6]};--folk-sc:${sc}`);
    el.innerHTML =
      `<div class="p-shadow"></div>` +
      `<div class="p-coat folk-body"></div>` +
      `<div class="p-head"><div class="p-hair"></div><span class="p-eye l"></span><span class="p-eye r"></span></div>` +
      `<div class="p-foot l"></div><div class="p-foot r"></div>`;

    if (anim) {
      const ph = idx * 1.3;
      this._anims.push(f => {
        const p = f * .09 + ph;
        el.style.transform = `translate(${Math.round(Math.sin(p))*S}px,${Math.round(Math.sin(p*.7)*.8)*S}px)`;
      });
    }
    return el;
  }

  _prop(type: string, x: number, footY: number): HTMLElement {
    const S  = StageRend.S;
    const el = this._el('div', `prop prop-${type}`,
      `left:${x*S}px;top:${footY*S}px`);
    return el;
  }

  // ── SPARKLES ──────────────────────────────────────────────────────────

  _setSparkles(on: boolean): void {
    const l = this.L.sparkles;
    if (!on) { l.innerHTML = ''; return; }
    const cols = ['#ffdd44','#ff88cc','#88ffcc','#aaddff','#ffaa44'];
    for (let i = 0; i < 16; i++) {
      l.appendChild(this._el('div', 'sparkle',
        `left:${Math.floor(Math.random()*234+8)*StageRend.S}px;` +
        `top:${Math.floor(Math.random()*180+8)*StageRend.S}px;` +
        `background:${cols[i%5]};animation-delay:${(Math.random()*.8).toFixed(2)}s`));
    }
  }

  // ── UTIL ──────────────────────────────────────────────────────────────

  _el(tag: string, cls: string, css = ''): HTMLElement {
    const el = document.createElement(tag);
    el.className = cls;
    if (css) el.style.cssText = css;
    return el;
  }
}
