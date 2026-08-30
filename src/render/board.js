// Results board renderer — venue-screen. Re-renders only on change.
const PLACE_TAG = { 1: '1af', 2: '2il', 3: '3ydd', mencion: 'Mención' };

export class BoardRend {
  constructor(root) {
    this.$ = sel => root.querySelector(sel);
    this._nowKey = '';
  }

  setHeader(text) { this.$('#b-header').textContent = text; }
  setStatus(text) { this.$('#b-status').textContent = text; }

  buildOrder(plan) {
    const items = plan.sessions.flatMap(s => s.items).sort((a, b) => a.rank - b.rank);
    this.$('#b-order').innerHTML = items.map(i =>
      `<div class="b-row" data-ord="${i.ordinal}">${i.program.kind === 'ceremony' ? '✦' : `C.${i.program.comp}`} ${i.program.label}</div>`
    ).join('');
    this.$('#b-winner-rows').innerHTML = '';
  }

  setNow(nowItem, nextItem) {
    const key = `${nowItem?.ordinal}:${nextItem?.ordinal}`;
    if (key === this._nowKey) return;
    this._nowKey = key;
    const label = i => i ? `${i.program.kind === 'ceremony' ? '✦' : 'C.' + i.program.comp} ${i.program.label}` : '—';
    this.$('#b-now-text').textContent = label(nowItem);
    this.$('#b-next-text').textContent = label(nextItem);
    this.$('#b-order').querySelectorAll('.b-row.now').forEach(el => el.classList.remove('now'));
    if (nowItem) {
      const row = this.$(`#b-order [data-ord="${nowItem.ordinal}"]`);
      if (row) { row.classList.add('now'); row.scrollIntoView({ block: 'nearest' }); }
    }
  }

  markDone(ordinal) {
    this.$(`#b-order [data-ord="${ordinal}"]`)?.classList.add('done');
  }

  addWinner({ workId, placement, displayName, item }) {
    const id = `bw-${workId}`;
    if (this.$(`#${id}`)) return;
    const el = document.createElement('div');
    el.id = id;
    el.className = `b-winner p${placement}`;
    const tag = PLACE_TAG[placement] ?? placement ?? '·';
    const comp = item.program.kind === 'ceremony' ? '✦' : `C.${item.program.comp}`;
    el.innerHTML = `<span class="place">${tag}</span> ${displayName} <span style="opacity:.6">· ${comp}</span>`;
    const rows = this.$('#b-winner-rows');
    rows.prepend(el);
  }
}
