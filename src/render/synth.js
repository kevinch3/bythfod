// Vendored from bythfod app.js — NES audio engine (hz + Synth), ported to ES module.
// ─────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────
export function hz(name) {
  if (!name || name === 'R') return 0;
  const m = {C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11};
  const mt = name.match(/^([A-G]#?)(\d)$/);
  if (!mt) return 0;
  return 440 * Math.pow(2, (m[mt[1]] + (parseInt(mt[2]) - 4) * 12 - 9) / 12);
}

// ─────────────────────────────────────────────
//  NES AUDIO ENGINE
// ─────────────────────────────────────────────
export class Synth {
  constructor() {
    this.ac = null; this.out = null;
    this.nodes = []; this.vol = 0.22; this.ready = false;
  }
  boot() {
    if (this.ready) return;
    this.ac = new (window.AudioContext || window.webkitAudioContext)();
    this.out = this.ac.createGain(); this.out.gain.value = this.vol;
    this.out.connect(this.ac.destination); this.ready = true;
  }
  silence() {
    this.nodes.forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch(e){} });
    this.nodes = [];
  }
  pulseWave(duty) {
    const R = new Float32Array(64), I = new Float32Array(64);
    for (let n=1;n<64;n++) I[n] = 2/(n*Math.PI) * Math.sin(n*Math.PI*duty);
    return this.ac.createPeriodicWave(R, I, {disableNormalization:true});
  }
  track(seq, bpm, type='square', vol=0.1, duty=0.5, delay=0) {
    if (!this.ready) return 0;
    const o = this.ac.createOscillator();
    if (type==='pulse') o.setPeriodicWave(this.pulseWave(duty));
    else o.type = type;
    const g = this.ac.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(this.out); o.start();
    this.nodes.push(o, g);
    const spb = 60/bpm;
    let t = this.ac.currentTime + delay + 0.05;
    for (const [note, dur] of seq) {
      const f = hz(note), d = dur*spb;
      if (f) {
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(vol, t);
        g.gain.linearRampToValueAtTime(vol*.6, t + d*.72);
        g.gain.setValueAtTime(0, t + d*.9);
      } else { g.gain.setValueAtTime(0, t); }
      t += d;
    }
    o.stop(t + 0.1);
    return t - this.ac.currentTime;
  }
  noise(dur, vol=0.13) {
    if (!this.ready) return;
    const sr = this.ac.sampleRate;
    const buf = this.ac.createBuffer(1, Math.ceil(sr*dur), sr);
    const d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) {
      const t = i/sr;
      const env = t<0.5 ? t/0.5 : t>dur-1.2 ? (dur-t)/1.2 : 1;
      const pulse = Math.sin(t*16)>0.15 ? 1 : 0.22;
      d[i] = (Math.random()*2-1)*env*pulse;
    }
    const src = this.ac.createBufferSource(); src.buffer = buf;
    const flt = this.ac.createBiquadFilter();
    flt.type='bandpass'; flt.frequency.value=1200; flt.Q.value=0.7;
    const g = this.ac.createGain(); g.gain.value = vol;
    src.connect(flt); flt.connect(g); g.connect(this.out);
    src.start(); src.stop(this.ac.currentTime+dur);
    this.nodes.push(src, flt, g);
  }
  setVol(v) { this.vol=v; if(this.out) this.out.gain.linearRampToValueAtTime(v, this.ac.currentTime+0.05); }
}
