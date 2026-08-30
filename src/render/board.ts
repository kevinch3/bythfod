import type { DayPlan, ItemPlan } from '../core/types.ts';
// Results board renderer — venue-screen. Re-renders only on change.
const PLACE_TAG = { 1: '1af', 2: '2il', 3: '3ydd', mencion: 'Mención' };

/** A confirmed result, as the poller reads it back from the API. */
export interface WinnerRow {
  workId: string | number;
  placement: string;
  displayName: string;
  item: ItemPlan;
}

export class BoardRend {
  /** Scoped query. Every id below is present in index.html. */
  private readonly $: (sel: string) => HTMLElement;
  private _nowKey: string;

  constructor(root: HTMLElement) {
    this.$ = sel => root.querySelector(sel) as HTMLElement;
    this._nowKey = '';
  }

  setHeader(text: string): void { this.$('#b-header').textContent = text; }
  setStatus(text: string): void { this.$('#b-status').textContent = text; }

  buildOrder(plan: DayPlan): void {
    const items = plan.sessions.flatMap(s => s.items).sort((a, b) => a.rank - b.rank);
    this.$('#b-order').innerHTML = items.map(i =>
      `<div class="b-row" data-ord="${i.ordinal}">${i.program.kind === 'ceremony' ? '✦' : `C.${i.program.comp}`} ${i.program.label}</div>`
    ).join('');
    this.$('#b-winner-rows').innerHTML = '';
  }

  setNow(nowItem: ItemPlan | undefined, nextItem: ItemPlan | undefined): void {
    const key = `${nowItem?.ordinal}:${nextItem?.ordinal}`;
    if (key === this._nowKey) return;
    this._nowKey = key;
    const label = (i: ItemPlan | undefined) => i ? `${i.program.kind === 'ceremony' ? '✦' : 'C.' + i.program.comp} ${i.program.label}` : '—';
    this.$('#b-now-text').textContent = label(nowItem);
    this.$('#b-next-text').textContent = label(nextItem);
    this.$('#b-order').querySelectorAll('.b-row.now').forEach(el => el.classList.remove('now'));
    if (nowItem) {
      const row = this.$(`#b-order [data-ord="${nowItem.ordinal}"]`);
      if (row) { row.classList.add('now'); row.scrollIntoView({ block: 'nearest' }); }
    }
  }

  markDone(ordinal: number): void {
    this.$(`#b-order [data-ord="${ordinal}"]`)?.classList.add('done');
  }

  addWinner({ workId, placement, displayName, item }: WinnerRow): void {
    const id = `bw-${workId}`;
    if (this.$(`#${id}`)) return;
    const el = document.createElement('div');
    el.id = id;
    el.className = `b-winner p${placement}`;
    const tag = PLACE_TAG[placement as keyof typeof PLACE_TAG] ?? placement ?? '·';
    const comp = item.program.kind === 'ceremony' ? '✦' : `C.${item.program.comp}`;
    el.innerHTML = `<span class="place">${tag}</span> ${displayName} <span style="opacity:.6">· ${comp}</span>`;
    const rows = this.$('#b-winner-rows');
    rows.prepend(el);
  }
}
