// HUD: transport controls, program drawer, setup overlay, pane scaling.
// Pure DOM glue — all decisions live in main.js via the handlers object.
export class Hud {
  constructor(handlers) {
    this.h = handlers;
    const $ = id => document.getElementById(id);
    this.$ = $;

    $('bPlay').onclick = () => this.h.onPlayPause();
    $('bSpeed').onclick = () => this.h.onSpeed();
    $('bProgram').onclick = () => this.toggleDrawer();
    $('bTheme').onchange = e => this.h.onTheme(e.target.value);
    // The static build ships without the API panel, so these may not exist.
    const connect = $('bConnect');
    if (connect) connect.onclick = () => this.h.onConnect(this.setupValues());
    $('bStartOffline').onclick = () => this.h.onStart(this.setupValues());

    this._soundOn = true;
    $('bVol').onclick = () => {
      this._soundOn = !this._soundOn;
      $('bVol').textContent = this._soundOn ? '🔊 SONIDO' : '🔇 SILENCIO';
      this.h.onVolume(this._soundOn ? 0.22 : 0);
    };

    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === ' ') { e.preventDefault(); this.h.onPlayPause(); }
    });

    addEventListener('resize', () => this.fit());
    this.fit();
  }

  setupValues() {
    return {
      seed: parseInt(this.$('inSeed').value, 10) || 42,
      // Credentials belong to the caller, not the HUD; absent in the static build.
      username: this.$('inUser')?.value || undefined,
      password: this.$('inPass')?.value || undefined,
    };
  }

  showSetup() { this.$('setup-overlay').hidden = false; }
  hideSetup() { this.$('setup-overlay').hidden = true; }
  log(msg) {
    const el = this.$('setupLog');
    if (!el) return; // static build ships no setup log
    el.textContent += `${msg}\n`;
    el.scrollTop = el.scrollHeight;
  }

  buildProgram(plan) {
    const drawer = this.$('progList');
    drawer.innerHTML = plan.sessions.map(s =>
      `<div class="prog-session">${s.label}</div>` +
      s.items.map(item => {
        const tag = item.program.kind === 'ceremony' ? '✦' : `C.${item.program.comp}`;
        return `<div class="prog-item" data-ord="${item.ordinal}">` +
          `<span class="prog-state"></span><span class="prog-tag">${tag}</span> ${item.program.label}</div>`;
      }).join('')
    ).join('');
    drawer.querySelectorAll('.prog-item').forEach(el => {
      el.onclick = () => this.h.onJump(+el.dataset.ord);
    });
  }

  toggleDrawer() { this.$('drawer').hidden = !this.$('drawer').hidden; }

  markAwarded(ordinal, desierto = false) {
    const el = this.$('progList').querySelector(`[data-ord="${ordinal}"] .prog-state`);
    if (el) { el.textContent = desierto ? '∅' : '🏆'; el.classList.add('done'); }
  }

  update(pos, engineSt) {
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

  setName(t) { this.$('actName').textContent = t; }
  setSub(t) { this.$('subtitle').textContent = t; }

  fit() {
    const scale = Math.min(1, (innerWidth - 24) / 1170, (innerHeight - 130) / 676);
    document.getElementById('viewport').style.setProperty('--app-scale', scale.toFixed(3));
  }
}
