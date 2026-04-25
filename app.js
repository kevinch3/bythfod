'use strict';

// ─────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────
function hz(name) {
  if (!name || name === 'R') return 0;
  const m = {C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11};
  const mt = name.match(/^([A-G]#?)(\d)$/);
  if (!mt) return 0;
  return 440 * Math.pow(2, (m[mt[1]] + (parseInt(mt[2]) - 4) * 12 - 9) / 12);
}

// ─────────────────────────────────────────────
//  NES AUDIO ENGINE
// ─────────────────────────────────────────────
class Synth {
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

// ─────────────────────────────────────────────
//  MUSIC PIECES
// ─────────────────────────────────────────────
const M = {
  fanfare(s) {
    s.track([['C5',.35],['E5',.35],['G5',.35],['C6',.8],['R',.2],['B5',.3],['C6',1.1]], 200,'pulse',.14,.5);
  },
  choir(s) {
    const bpm=78;
    s.track([
      ['G4',1],['A4',.5],['B4',.5],['G4',1],['G4',1],
      ['A4',1],['B4',1],['A4',.5],['G4',.5],
      ['D5',1],['C5',1],['B4',2],
      ['G4',2],['A4',1],['G4',3],
      ['C5',1],['B4',.5],['A4',.5],['G4',1],['A4',1],
      ['B4',1],['A4',1],['G4',1],['F#4',1],
      ['A4',1.5],['G4',.5],['F#4',1],['E4',1],
      ['G4',3.5],['R',.5],
    ], bpm,'pulse',.09,.5);
    s.track([
      ['E4',1],['F#4',.5],['G4',.5],['E4',1],['E4',1],
      ['F#4',1],['G4',1],['F#4',.5],['E4',.5],
      ['B4',1],['A4',1],['G4',2],
      ['E4',2],['F#4',1],['E4',3],
      ['A4',1],['G4',.5],['F#4',.5],['E4',1],['F#4',1],
      ['G4',1],['F#4',1],['E4',1],['D4',1],
      ['F#4',1.5],['E4',.5],['D4',1],['C4',1],
      ['E4',3.5],['R',.5],
    ], bpm,'pulse',.065,.125);
    s.track([
      ['G2',2],['D3',2],['A2',2],['D3',2],
      ['D3',2],['A3',2],['G2',4],
      ['C3',2],['F3',2],['G2',2],['D3',2],
      ['G2',4],['R',0],
    ], bpm,'triangle',.085);
  },
  solo(s) {
    const bpm=70;
    s.track([
      ['E5',1.5],['D5',.5],['C5',1],['D5',1],
      ['E5',1],['E5',1],['E5',2],
      ['D5',1],['D5',1],['D5',2],
      ['E5',1],['G5',1],['G5',2],
      ['E5',1.5],['D5',.5],['C5',1],['D5',1],
      ['E5',1],['E5',1],['E5',1],['D5',1],
      ['D5',1],['E5',1],['D5',1],['C5',1],
      ['C5',4],
    ], bpm,'pulse',.13,.5);
    s.track([
      ['C3',2],['G3',2],['C3',4],
      ['G2',2],['G3',2],['C3',2],['E3',2],
      ['C3',2],['G3',2],['C3',4],
      ['G2',4],['C3',4],
    ], bpm,'triangle',.08);
  },
  duo(s) {
    const bpm=96;
    s.track([
      ['G5',1],['E5',1],['F5',1],['D5',1],
      ['E5',1],['C5',1],['D5',2],
      ['G5',1],['A5',1],['B5',1],['G5',1],
      ['A5',2],['G5',2],
      ['F5',1],['G5',1],['A5',2],
      ['G5',2],['E5',2],
      ['D5',1],['E5',1],['F5',1],['G5',1],
      ['C5',4],
    ], bpm,'pulse',.10,.5);
    s.track([
      ['E5',1],['C5',1],['D5',1],['B4',1],
      ['C5',1],['A4',1],['B4',2],
      ['E5',1],['F5',1],['G5',1],['E5',1],
      ['F5',2],['E5',2],
      ['D5',1],['E5',1],['F5',2],
      ['E5',2],['C5',2],
      ['B4',1],['C5',1],['D5',1],['E5',1],
      ['A4',4],
    ], bpm,'pulse',.085,.125);
    s.track([
      ['C3',2],['G2',2],['C3',2],['G3',2],
      ['C3',2],['D3',2],['G2',4],
      ['F3',2],['C3',2],['G2',2],['C3',2],
      ['G2',4],['C3',4],
    ], bpm,'triangle',.08);
  },
  violin(s) {
    const bpm=62;
    const mel=[
      ['A5',2],['G5',1],['F#5',1],
      ['E5',1.5],['D5',.5],['E5',2],
      ['F#5',1],['E5',1],['D5',1],['C#5',1],
      ['D5',4],
      ['A5',2],['B5',1],['C#6',1],
      ['D6',2],['C#6',2],
      ['B5',1.5],['A5',.5],['G5',1],['F#5',1],
      ['A5',4],
    ];
    s.track(mel, bpm,'triangle',.12);
    s.track(mel, bpm,'pulse',.055,.5);
    s.track([
      ['D3',2],['A3',2],['A2',4],
      ['D3',2],['A2',2],['D3',4],
      ['G3',2],['D3',2],['A2',4],
      ['D3',4],['A2',4],
    ], bpm,'triangle',.085);
  },
  trumpet(s) {
    const bpm=110;
    s.track([
      ['C5',.5],['E5',.5],['G5',.5],['C6',.5],
      ['B5',1],['G5',.5],['A5',.5],
      ['G5',1],['E5',.5],['F5',.5],
      ['E5',2],['R',.5],
      ['G5',.5],['A5',.5],['B5',.5],['C6',.5],
      ['D6',1],['C6',.5],['B5',.5],
      ['A5',1],['G5',.5],['A5',.5],
      ['G5',2.5],['R',.5],
      ['C6',1],['B5',.5],['A5',.5],
      ['G5',1],['F5',.5],['E5',.5],
      ['D5',1],['C5',.5],['D5',.5],
      ['C5',2.5],['R',.5],
    ], bpm,'square',.15);
    s.track([
      ['C3',1],['G3',1],['C3',1],['G3',1],
      ['G2',2],['D3',2],['C3',2],['G2',2],
      ['C3',2.5],['R',.5],
      ['C3',2],['G3',2],['G2',2],['G3',2],
      ['D3',2],['G2',2],['C3',2.5],['R',.5],
      ['F3',2],['C3',2],['G2',2],['G3',2],
      ['C3',2.5],['R',.5],
    ], bpm,'triangle',.085);
  },
  recitation(s) {
    s.track([
      ['G4',5],['R',1],['F4',3],['G4',1],['R',1],
      ['A4',5],['R',1],['G4',5],['R',1],
    ], 48,'triangle',.055);
  },
  folk(s) {
    const bpm = 84;
    s.track([
      ['G4',1],['A4',1],['B4',1],
      ['C5',2],['B4',1],
      ['A4',1],['G4',1],['A4',1],
      ['G4',3],
      ['D5',1],['D5',1],['C5',1],
      ['B4',2],['A4',1],
      ['G4',1],['A4',1],['B4',1],
      ['G4',3],
      ['E5',1],['E5',1],['D5',1],
      ['C5',2],['B4',1],
      ['A4',1],['B4',1],['C5',1],
      ['D5',3],
      ['G4',1],['A4',1],['B4',1],
      ['C5',1],['B4',1],['A4',1],
      ['G4',1],['A4',1],['G4',1],
      ['G4',3],
    ], bpm,'pulse',.12,.5);
    s.track([
      ['G3',3],['C3',3],['D3',3],['G2',3],
      ['G3',3],['G3',3],['G2',3],['G2',3],
      ['C3',3],['G3',3],['F3',3],['G3',3],
      ['G2',3],['C3',3],['G2',3],['G2',3],
    ], bpm,'triangle',.07);
  },
  dance(s) {
    const bpm = 138;
    s.track([
      ['E5',.5],['D5',.5],['C5',.5],['D5',.5],
      ['E5',.5],['E5',.5],['E5',1],
      ['D5',.5],['D5',.5],['D5',1],
      ['E5',.5],['G5',.5],['G5',1],
      ['E5',.5],['D5',.5],['C5',.5],['D5',.5],
      ['E5',.5],['E5',.5],['E5',.5],['E5',.5],
      ['D5',.5],['E5',.5],['D5',.5],['C5',.5],
      ['C5',2],
      ['G4',.5],['A4',.5],['B4',.5],['C5',.5],
      ['D5',.5],['E5',.5],['F5',.5],['G5',.5],
      ['A5',1],['G5',.5],['F5',.5],
      ['E5',1],['D5',1],
      ['C5',.5],['D5',.5],['E5',.5],['F5',.5],
      ['E5',.5],['D5',.5],['C5',.5],['B4',.5],
      ['A4',.5],['B4',.5],['C5',.5],['D5',.5],
      ['C5',2],
    ], bpm,'square',.10);
    s.track([
      ['C3',1],['G2',1],['C3',1],['G2',1],
      ['G2',1],['G3',1],['C3',2],
      ['C3',1],['G2',1],['C3',1],['G2',1],
      ['C3',2],['G2',2],
      ['F3',1],['C3',1],['F3',1],['C3',1],
      ['G2',2],['G3',2],
      ['C3',1],['G2',1],['G3',1],['G2',1],
      ['C3',4],
    ], bpm,'triangle',.08);
  },
  hymn(s) {
    const bpm = 60;
    s.track([
      ['G4',2],['G4',1],['A4',2],['G4',1],
      ['F4',2],['E4',1],['D4',3],
      ['D4',2],['E4',1],['F4',2],['E4',1],
      ['D4',2],['C4',1],['D4',3],
      ['G4',2],['A4',1],['B4',2],['A4',1],
      ['C5',2],['B4',1],['A4',3],
      ['A4',2],['G4',1],['F4',2],['G4',1],
      ['E4',2],['D4',1],['C4',3],
    ], bpm,'pulse',.11,.5);
    s.track([
      ['E4',3],['F4',3],
      ['C4',3],['B3',3],
      ['B3',3],['C4',3],
      ['A3',3],['B3',3],
      ['C4',3],['F4',3],
      ['E4',3],['F4',3],
      ['F4',3],['D4',3],
      ['C4',3],['G3',3],
    ], bpm,'pulse',.07,.125);
    s.track([
      ['C3',3],['F2',3],
      ['G2',3],['G3',3],
      ['G2',3],['C3',3],
      ['D3',3],['G2',3],
      ['C3',3],['F3',3],
      ['A2',3],['D3',3],
      ['D3',3],['G2',3],
      ['C3',3],['G2',3],
    ], bpm,'triangle',.085);
  },
};

// ─────────────────────────────────────────────
//  PIXEL RENDERER  (canvas 256×224)
// ─────────────────────────────────────────────
class Rend {
  constructor(cv) {
    this.cv = cv; this.cx = cv.getContext('2d'); this.f = 0;
  }
  px(x,y,w,h,c) { this.cx.fillStyle=c; this.cx.fillRect(x,y,w,h); }
  lit(hex, a) {
    if (!hex||hex[0]!=='#') return hex;
    const p=(v)=>Math.min(255,parseInt(hex.slice(v,v+2),16)+a);
    return `rgb(${p(1)},${p(3)},${p(5)})`;
  }

  drawScene() {
    this.f++;
    const cx = this.cx;
    this.px(0,0,256,224,'#06000e');
    for (let y=0;y<126;y++) {
      const lum = Math.round(14 + y*0.06);
      this.px(0,y,256,1,`rgb(${lum},${Math.round(lum*.4)},${lum+6})`);
    }
    for (let x=38;x<218;x+=44)
      this.px(x,0,2,126,`rgba(255,220,120,0.04)`);

    const pk=['#58360a','#683e0e','#784812','#603c0c'];
    for (let x=0;x<256;x+=4) this.px(x,126,4,62,pk[(x/4)%4]);
    this.px(0,126,256,1,'#986018');
    for (let x=0;x<256;x+=12)
      this.px(x,127,2,60,`rgba(255,200,80,0.04)`);

    this.px(0,185,256,4,'#301808');
    this.px(0,188,256,3,'#1a0c04');

    for (let i=0;i<8;i++) {
      const lx=14+i*32;
      const fl=0.5+0.5*Math.sin(this.f*.09+i*.9);
      this.px(lx-1,183,3,2,`rgba(255,215,90,${fl*.7})`);
      this.px(lx-3,182,7,2,`rgba(255,200,70,${fl*.18})`);
    }

    this.px(0,191,256,33,'#02000a');
  }

  drawRisers() {
    this.px(36,116,192,3,'#7a5016');
    this.px(36,119,192,10,'#3c2008');
    this.px(50,102,164,3,'#6a4012');
    this.px(50,105,164,11,'#2c1606');
    this.px(64,88,136,3,'#5a3410');
    this.px(64,91,136,11,'#1e1004');
  }

  drawCurtains() {
    const sh=['#480e1a','#5a1622','#68182a','#480e1a'];
    for (let i=0;i<36;i++) {
      const sway=Math.abs(Math.sin(i*.36+this.f*.002))*8;
      this.px(i,0,1,122+sway,sh[i%4]);
      this.px(220+i,0,1,122+sway,sh[i%4]);
    }
    this.px(0,0,256,7,'#5a1622');
    this.px(0,0,256,2,'#7e2030');
    this.px(0,6,256,2,'#a07828');
    for (let x=36;x<220;x+=10) { this.px(x,7,4,6,'#58101e'); this.px(x+1,12,2,2,'#441020'); }
    this.px(20,11,220,2,'#1e1e2e');
    for (let x=44;x<216;x+=38) {
      this.px(x,11,5,6,'#28283c');
      this.px(x+1,17,3,4,`rgba(255,238,150,${0.6+0.15*Math.sin(this.f*.05+x)})`);
    }
  }

  drawSpots(mode) {
    const cx = this.cx, f = this.f;
    for (let lx=44;lx<216;lx+=38) {
      const g = cx.createLinearGradient(lx,18,lx,126);
      g.addColorStop(0,`rgba(255,240,150,0.07)`);
      g.addColorStop(1,'rgba(255,240,150,0)');
      cx.fillStyle=g; cx.fillRect(lx-18,18,36,108);
    }
    if (mode==='choir') {
      const g = cx.createRadialGradient(128,140,4,128,140,88);
      g.addColorStop(0,'rgba(255,240,170,0.15)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      cx.fillStyle=g; cx.fillRect(42,90,172,100);
    } else if (mode==='duo') {
      for (const sx of [100,158]) {
        const g = cx.createRadialGradient(sx,150,3,sx,150,30);
        g.addColorStop(0,`rgba(255,248,200,${.2+.04*Math.sin(f*.03)})`);
        g.addColorStop(1,'rgba(0,0,0,0)');
        cx.fillStyle=g; cx.fillRect(sx-30,120,60,60);
      }
    } else {
      const g = cx.createRadialGradient(128,152,3,128,152,34);
      g.addColorStop(0,`rgba(255,252,200,${.22+.04*Math.sin(f*.04)})`);
      g.addColorStop(0.6,'rgba(255,235,170,0.06)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      cx.fillStyle=g; cx.fillRect(96,118,66,68);
    }
  }

  drawBanner(text) {
    const cx=this.cx, W=178, x=(256-W)/2, y=18;
    cx.fillStyle='#8855dd'; cx.fillRect(x,y,W,14);
    cx.fillStyle='rgba(255,255,255,.26)'; cx.fillRect(x,y,W,2);
    cx.fillStyle='#6633bb'; cx.fillRect(x,y+12,W,2);
    cx.fillStyle='#7744cc';
    cx.fillRect(x-9,y+1,11,12); cx.fillRect(x+W-2,y+1,11,12);
    cx.fillStyle='#ddc8ff'; cx.font='7px monospace'; cx.textAlign='left';
    cx.fillText('♪',x+4,y+10); cx.fillText('♪',x+W-10,y+10);
    cx.fillStyle='#fffcff'; cx.textAlign='center'; cx.font='bold 7px monospace';
    cx.fillText(text,128,y+10);
  }

  person(x, footY, skin, body) {
    this.px(x-4,footY,10,2,'rgba(0,0,0,.4)');
    this.px(x-3,footY-13,8,13,body);
    this.px(x-2,footY-12,2,10,this.lit(body,20));
    this.px(x-1,footY-14,4,2,'rgba(255,255,255,0.15)');
    this.px(x-2,footY-19,5,5,skin);
    this.px(x-2,footY-20,5,2,'#160800');
    this.px(x-1,footY-18,1,1,'#080808');
    this.px(x+1,footY-18,1,1,'#080808');
    this.px(x-2,footY-2,2,2,'#180a00');
    this.px(x+1,footY-2,2,2,'#180a00');
  }

  mic(x, y) {
    this.px(x,y-16,2,14,'#787878');
    this.px(x-1,y-18,4,3,'#a0a0a0');
    this.px(x,y-17,2,2,'#c8c8c8');
  }
  podium(x, y) {
    this.px(x-7,y-2,16,12,'#44220a');
    this.px(x-6,y-5,14,4,'#5e3212');
    this.px(x-6,y-2,14,1,'#7e4e1e');
    this.px(x-4,y-4,10,3,'rgba(255,255,220,0.2)');
  }
  violin(x, y) {
    this.px(x+5,y-16,4,10,'#6e2808');
    this.px(x+5,y-12,4,6,'#8e3e16');
    this.px(x+6,y-15,2,1,'#c8804a');
    this.px(x+9,y-18,1,12,'#b89040');
  }
  trumpet(x, y) {
    this.px(x+3,y-8,13,3,'#ccaa00');
    this.px(x+3,y-9,11,2,'#f4cc00');
    this.px(x+15,y-10,4,6,'#ccaa00');
    this.px(x+3,y-10,4,2,'#887000');
    this.px(x+5,y-11,1,2,'#cc2200');
    this.px(x+8,y-11,1,2,'#cc2200');
  }
  piano() {
    const px=186, py=110;
    this.px(px,py,35,24,'#101010');
    this.px(px-2,py-4,39,5,'#060606');
    this.px(px,py,35,2,'#222');
    this.px(px+2,py+15,30,7,'#e4e4e4');
    for (let i=0;i<4;i++) this.px(px+4+i*7,py+15,5,4,'#141414');
    this.px(px,py+22,4,7,'#0e0e0e');
    this.px(px+29,py+22,4,7,'#0e0e0e');
  }

  SKINS = ['#eec8a0','#deb07c','#bc7440','#8a5028','#663018','#eed4b8'];
  ROBES = ['#1c3288','#142472','#223694','#182a82','#28389e'];
  sk=(i)=>this.SKINS[i%6]; rb=(i)=>this.ROBES[i%5];

  drawChoir(n=12, anim=false) {
    const rows=[
      {footY:129, n:Math.min(5,n)},
      {footY:115, n:Math.min(4,Math.max(0,n-5))},
      {footY:101, n:Math.min(3,Math.max(0,n-9))},
    ];
    let idx=0;
    for (const row of rows) {
      if (!row.n) continue;
      const sp=20, totalW=(row.n-1)*sp;
      let x = Math.floor((256-totalW)/2);
      for (let i=0;i<row.n;i++) {
        const by = anim ? Math.round(Math.sin(this.f*.082+idx*.95)*.6) : 0;
        this.person(x, row.footY+by, this.sk(idx*3+1), this.rb(idx));
        idx++; x+=sp;
      }
    }
  }

  drawSoloist(anim=false) {
    const by=anim?Math.round(Math.sin(this.f*.06)*.5):0;
    this.mic(127,132+by); this.person(128,132+by,this.sk(2),'#142670');
  }

  drawDuo(anim=false) {
    const b1=anim?Math.round(Math.sin(this.f*.06)*.5):0;
    const b2=anim?Math.round(Math.sin(this.f*.065+1.1)*.5):0;
    this.mic(99,132+b1); this.person(100,132+b1,this.sk(0),'#142670');
    this.mic(157,132+b2); this.person(158,132+b2,this.sk(4),'#1c2e88');
  }

  drawViolinist(anim=false) {
    const by=anim?Math.round(Math.sin(this.f*.07)*.5):0;
    this.violin(120,132+by); this.person(128,132+by,this.sk(1),'#1e3880');
  }

  drawTrumpeter(anim=false) {
    const by=anim?Math.round(Math.sin(this.f*.07)*.4):0;
    this.person(128,132+by,this.sk(4),'#301458');
    this.trumpet(120,132+by);
  }

  drawReciter(anim=false) {
    const by=anim?Math.round(Math.sin(this.f*.04)*.3):0;
    this.podium(120,136+by); this.person(128,132+by,this.sk(0),'#122a5c');
  }

  drawAnnouncer() {
    const by=Math.round(Math.sin(this.f*.05)*.5);
    this.mic(127,132+by); this.person(128,132+by,this.sk(5),'#202020');
  }

  drawPianist() {
    this.piano();
    this.person(203,132,this.sk(0),'#161630');
  }

  drawTrio(anim=false) {
    [100, 128, 156].forEach((x, i) => {
      const by = anim ? Math.round(Math.sin(this.f*.065 + i*1.1)*.5) : 0;
      this.mic(x-1, 132+by);
      this.person(x, 132+by, this.sk(i*2+1), this.rb(i));
    });
  }

  drawFolkFigure(x, footY, idx, anim) {
    const phase  = this.f * .09 + idx * 1.3;
    const sway   = anim ? Math.round(Math.sin(phase) * 1) : 0;
    const bob    = anim ? Math.round(Math.sin(phase * .7) * .8) : 0;
    const ox = x + sway, fy = footY + bob;
    const skin   = this.SKINS[idx % 6];
    const female = !(idx & 1);
    const slot   = Math.floor(idx / 2) % 6;
    const sc = ['#b82858','#174882','#1a5c20','#7a1818','#b86418','#1a4860'][slot];
    const vc = ['#5a2e08','#1e4c10','#6a1414','#163660','#4a2808','#3a1060'][slot];
    const ac = ['#1a5c20','#7a1818','#174882','#c89420','#1a3c6c','#5c1a1a'][slot];
    const bl = '#e8e0c8'; // blouse/shirt
    const lift = anim ? Math.max(0, Math.round(Math.sin(phase + (idx & 1) * Math.PI) * 4)) : 0;
    const hc = ['#1a0c00','#3a1c00','#8a5820','#0a0a18','#5a3010','#c8a050'][idx % 6];

    this.px(ox-5, fy+1, 11, 2, 'rgba(0,0,0,.32)');

    if (female) {
      this.px(ox-6, fy-9,  14, 9, sc);
      this.px(ox-5, fy-12, 12, 4, sc);
      this.px(ox-6, fy-4,  14, 1, this.lit(sc, -20));
      this.px(ox-3, fy-9,   7, 8, ac);
      this.px(ox-3, fy-9,   7, 1, this.lit(ac, 30));
    } else {
      this.px(ox-3, fy-11, 3, 11, '#262626');
      this.px(ox+1, fy-11, 3, 11, '#262626');
    }

    this.px(ox-3, fy-15, 7, 5, bl);
    this.px(ox-2, fy-15, 5, 5, vc);
    this.px(ox-1, fy-15, 2, 4, this.lit(vc, 28));
    this.px(ox-3, fy-14, 1, 3, bl);
    this.px(ox+2, fy-14, 1, 3, bl);

    this.px(ox-2, fy-21, 5, 5, skin);
    this.px(ox-2, fy-22, 5, 3, hc);
    if (female) this.px(ox-3, fy-22, 7, 2, hc);
    this.px(ox-1, fy-19, 1, 1, '#080808');
    this.px(ox+1, fy-19, 1, 1, '#080808');

    this.px(ox-3, fy-1, 3, 2, '#18100a');
    this.px(ox+1, fy-1-lift, 3, 2, '#18100a');

    this.px(ox-10, fy-13, 8, 2, bl);
    this.px(ox+3,  fy-13, 8, 2, bl);
    this.px(ox-11, fy-13, 2, 2, skin);
    this.px(ox+10, fy-13, 2, 2, skin);
  }

  drawDancer(n=1, anim=false) {
    if (n <= 1) {
      this.drawFolkFigure(128, 132, 0, anim);
      return;
    }
    const front = [74, 100, 128, 156, 182];
    const back  = [88, 128, 168];

    // Celtic floor rings
    const cx = this.cx;
    for (let r = 10; r < 58; r += 11) {
      cx.strokeStyle = `rgba(180,115,38,${Math.max(0, .10 - r * .0014)})`;
      cx.lineWidth = 1;
      cx.beginPath();
      cx.ellipse(128, 136, r, Math.round(r * .34), 0, 0, Math.PI * 2);
      cx.stroke();
    }

    // Back arc — hand connections then figures
    for (let i = 0; i < back.length - 1; i++) {
      const x1 = back[i] + 10, x2 = back[i+1] - 11;
      if (x2 > x1) this.px(x1, 102, x2-x1, 1, 'rgba(220,185,155,.45)');
    }
    back.forEach((x, i) => this.drawFolkFigure(x, 115, i + 5, anim));

    // Front arc — hand connections then figures
    for (let i = 0; i < front.length - 1; i++) {
      const x1 = front[i] + 10, x2 = front[i+1] - 11;
      if (x2 > x1) this.px(x1, 117, x2-x1, 1, 'rgba(220,185,155,.55)');
    }
    front.forEach((x, i) => this.drawFolkFigure(x, 130, i, anim));
  }

  drawAudience(applause=false) {
    const HC=['#0a0314','#14061e','#080a12','#04030c','#1c0a04','#120800'];
    const BC=['#040208','#07030c','#050506','#020204'];
    let s=7919;
    const rn=()=>{ s=(s*1664525+1013904223)&0xffffffff; return(s>>>0)/4294967295; };
    const rowDefs=[
      {y:195, n:22, sp:11.6},
      {y:204, n:20, sp:12.8},
      {y:213, n:18, sp:14.2},
    ];
    for (const row of rowDefs) {
      for (let i=0;i<row.n;i++) {
        const x = Math.floor(i*row.sp + rn()*3 + 4);
        const w = 7+Math.floor(rn()*4);
        this.px(x,row.y+4,w,9,BC[Math.floor(rn()*4)]);
        this.px(x,row.y,w-1,5,HC[Math.floor(rn()*6)]);
        if (rn()>.55) this.px(x+1,row.y+1,w-3,3,this.sk(Math.floor(rn()*4)));
      }
    }
    if (applause) {
      let hs=999;
      const hr=()=>{ hs=(hs*1103515245+12345)&0xffff; return hs/65535; };
      for (let i=0;i<28;i++) {
        const hx=Math.floor(hr()*234+10);
        const hy=191+Math.floor(hr()*18);
        const phase=this.f*.16+i*.7;
        const lift=Math.round(Math.sin(phase)*7+7);
        if (lift>2) this.px(hx,hy-lift,2,lift,this.sk(Math.floor(hr()*4)));
      }
    }
  }

  drawOverlay(alpha) {
    if (alpha<=0) return;
    this.cx.fillStyle=`rgba(0,0,0,${Math.min(1,alpha)})`;
    this.cx.fillRect(0,0,256,224);
  }

  drawSparkles() {
    let ss=this.f*7+17;
    const sr=()=>{ ss=(ss*48271+0)%2147483647; return ss/2147483647; };
    const cols=['#ffdd44','#ff88cc','#88ffcc','#aaddff','#ffaa44'];
    for (let i=0;i<16;i++) {
      const x=Math.floor(sr()*240+8);
      const y=Math.floor(sr()*180+8);
      const phase=(this.f*.08+i*.4)%(Math.PI*2);
      const size=Math.round(Math.sin(phase)*1.5+1.5);
      if (size>0) this.px(x,y,size,size,cols[i%5]);
    }
  }

  render(state) {
    this.drawScene();
    this.drawRisers();
    this.drawCurtains();
    this.drawSpots(state.spotMode||'center');
    this.piano(); this.drawPianist();

    const a = state.phase==='performing';
    switch(state.actType) {
      case 'choir':     this.drawChoir(state.n||12, a); break;
      case 'solo':      this.drawSoloist(a); break;
      case 'duo':       this.drawDuo(a); break;
      case 'violin':    this.drawViolinist(a); break;
      case 'trumpet':   this.drawTrumpeter(a); break;
      case 'reciter':   this.drawReciter(a); break;
      case 'trio':      this.drawTrio(a); break;
      case 'dancer':    this.drawDancer(state.n||1, a); break;
      case 'announcer': this.drawAnnouncer(); break;
    }

    this.drawAudience(state.phase==='applause');
    if (state.banner) this.drawBanner(state.banner);
    if (state.phase==='applause') this.drawSparkles();
    this.drawOverlay(state.overlay||0);
  }
}

// ─────────────────────────────────────────────
//  ACT DEFINITIONS
// ─────────────────────────────────────────────
const ACTS = [
  {
    type:'choir', n:12, spotMode:'choir', music:'choir',
    name:'♪ Côr Meibion Caernarfon ♪',
    banner:'L.CHORUS: GLORY S.',
    announce:"Croeso cynnes — Côr Meibion o deuddeg llais, yn perfformio gerbron y gynulleidfa.",
  },
  {
    type:'reciter', spotMode:'center', music:'recitation',
    name:'✦ Adroddiad: "Y Ddraig Goch" ✦',
    banner:'RECITATION',
    announce:"Ac yn awr — adroddiad gan Branwen Evans, gwobr yr Eisteddfod Genedlaethol.",
  },
  {
    type:'solo', spotMode:'center', music:'solo',
    name:'♫ Unawdydd: Eirlys Thomas ♫',
    banner:'SOPRANO SOLO',
    announce:"Soprano enwog Cymru — Eirlys Thomas, yn canu â chalon agored.",
  },
  {
    type:'violin', spotMode:'center', music:'violin',
    name:'🎻 Ffidil: Rhys Gwyndaf 🎻',
    banner:'VIOLIN SOLO',
    announce:"Nawr, unawdydd ffidil rhagorol — Rhys Gwyndaf, o Lanberis.",
  },
  {
    type:'duo', spotMode:'duo', music:'duo',
    name:'♪ Deuawd: Mair & Siôn ♪',
    banner:'DUO VOCALS',
    announce:"Y ddeuawd adnabyddus — Mair a Siôn, lleisiau'r mynyddoedd.",
  },
  {
    type:'trumpet', spotMode:'center', music:'trumpet',
    name:'🎺 Utgorn: Geraint Jones 🎺',
    banner:'TRUMPET SOLO',
    announce:"I gloi — Geraint Jones ar yr utgorn, meistr y Brenhinol Filwrol.",
  },
  // ── LLENYDDIAETH ───────────────────────────────
  {
    type:'reciter', spotMode:'center', music:'folk',
    name:'✦ Cadair yr Eisteddfod: "Yr Alwad" ✦',
    banner:'CADAIR',
    announce:"Gwobr Cadair yr Eisteddfod — cerdd ar y testun 'Yr Alwad'. Y gystadleuaeth fwyaf bwysig.",
  },
  // ── ADRODD ─────────────────────────────────────
  {
    type:'reciter', spotMode:'center', music:'recitation',
    name:'✦ Prif-adroddiad: "Hon" ✦',
    banner:'PRIF-ADRODDIAD',
    announce:"Prif-adroddiad yr Eisteddfod — 'Hon' gan T. H. Parry-Williams. Eiliad dawel ar y llwyfan.",
  },
  {
    type:'choir', n:5, spotMode:'choir', music:'recitation',
    name:"♪ Cyd-adrodd: Noson Loergan Patagonia ♪",
    banner:'CYD-ADRODD',
    announce:"Cyd-adrodd agored — 'Noson Loergan Patagonia' gan Arel Hughes de Sarda.",
  },
  // ── CERDDORIAETH: POBL IFANC ───────────────────
  {
    type:'choir', n:7, spotMode:'choir', music:'folk',
    name:"♪ Côr Plant: Y teimlad hapus ♪",
    banner:'CÔR PLANT',
    announce:"Côr Plant Ysgol Feithrin — 'Y teimlad hapus'. Lleisiau bach yr Eisteddfod.",
  },
  {
    type:'choir', n:10, spotMode:'choir', music:'choir',
    name:"♪ Parti hyd at 18: Y Pererin a'r Iesu ♪",
    banner:'PARTI IFANC',
    announce:"Parti cerdd hyd at ddeunaw oed — 'Y Pererin a'r Iesu'. Cenhedlaeth newydd yr Eisteddfod.",
  },
  // ── CERDDORIAETH: OEDOLION ─────────────────────
  {
    type:'solo', spotMode:'center', music:'folk',
    name:"♫ Unawd i Ferched: O! Seren wen ♫",
    banner:'UNAWD MERCHED',
    announce:"Unawd i ferched — 'O! Seren wen'. Cân draddodiadol o galon y Wladfa.",
  },
  {
    type:'solo', spotMode:'center', music:'hymn',
    name:"♫ Unawd i Ddynion: Cwm Pennant ♫",
    banner:'UNAWD DYNION',
    announce:"Unawd i ddynion — 'Cwm Pennant'. Emyn mynyddoedd a hiraeth mawr.",
  },
  {
    type:'trio', spotMode:'center', music:'folk',
    name:"♪ Triawd i Ferched: Beth yw'r haf i mi ♪",
    banner:'TRIAWD',
    announce:"Triawd i ferched — 'Beth yw'r haf i mi'. Tair llais yn uno'n un gân.",
  },
  {
    type:'choir', n:4, spotMode:'duo', music:'hymn',
    name:"♪ Pedwarawd: Ar hyd y nos ♪",
    banner:'PEDWARAWD',
    announce:"Pedwarawd — 'Ar hyd y nos'. Cân nos enwocaf Cymru.",
  },
  // ── DAWNS WERIN ────────────────────────────────
  {
    type:'dancer', n:1, spotMode:'center', music:'dance',
    name:"💃 Dawns 12–15 oed: Hoffedd ap Hywel 💃",
    banner:'DAWNS WERIN',
    announce:"Dawns werin i blant 12 i 15 oed — 'Hoffedd ap Hywel'. Y traddodiad dawns yn fyw!",
  },
  {
    type:'dancer', n:2, spotMode:'duo', music:'dance',
    name:"💃 Dawns Lefel Uwch: Sawdl y fuwch 💃",
    banner:'DAWNS UWCH',
    announce:"Dawns lefel uwch — 'Sawdl y fuwch'. Y dawnswyr gorau yn perfformio.",
  },
  // ── GRAND FINALE ───────────────────────────────
  {
    type:'choir', n:12, spotMode:'choir', music:'choir',
    name:'♪ ♪  FINALE — PAWB AR Y LLWYFAN  ♪ ♪',
    banner:'GRAND FINALE',
    announce:"Ac i gloi'r Eisteddfod — pawb ar y llwyfan gyda'i gilydd! Diolch yn fawr!",
  },
];

// ─────────────────────────────────────────────
//  SHOW MANAGER (state machine)
// ─────────────────────────────────────────────
class Show {
  constructor(synth, rend) {
    this.sy = synth; this.rend = rend;
    this.idx = -1; this.phase = 'idle'; this.timer = 0;
    this.state = {actType:'choir',phase:'idle',overlay:1,banner:'EISTEDDFOD',spotMode:'choir',n:12};
    this.started = false;
    this.$name   = document.getElementById('actName');
    this.$sub    = document.getElementById('subtitle');
    this.$dots   = document.getElementById('dots');
    this.updateDots();
  }
  name(t){ this.$name.textContent = t; }
  sub(t) { this.$sub.textContent  = t; }
  updateDots() {
    this.$dots.innerHTML = ACTS.map((a,i)=>
      `<div class="dot${i<this.idx?' past':i===this.idx?' now':''}" title="${a.name}" data-i="${i}"></div>`
    ).join('');
    this.$dots.querySelectorAll('.dot').forEach(d => {
      d.onclick = () => this.jumpToAct(+d.dataset.i);
    });
  }
  jumpToAct(i) {
    if (!this.started) { this.sy.boot(); this.started = true; }
    this.sy.silence();
    this.idx = i;
    this.phase = 'fade-in'; this.timer = 0;
    this.state.overlay = 1;
    this.updateDots();
    this.name('♪ ♪  EISTEDDFOD  ♪ ♪');
    this.sub('...');
    setTimeout(() => { if (this.sy.ready) M.fanfare(this.sy); }, 500);
  }
  start() { this.sy.boot(); this.started=true; this.nextAct(); }
  skip()  {
    if (!this.started) { this.start(); return; }
    this.sy.silence();
    this.phase='fade-out'; this.timer=0;
  }
  nextAct() {
    this.idx = (this.idx+1) % ACTS.length;
    this.phase='fade-in'; this.timer=0;
    this.state.overlay=1;
    this.updateDots();
    this.name('♪ ♪  EISTEDDFOD  ♪ ♪');
    this.sub('...');
    setTimeout(()=>{ if(this.sy.ready) M.fanfare(this.sy); }, 500);
  }
  update(dt) {
    if (!this.started) return;
    this.timer += dt;
    const act = ACTS[this.idx];

    if (this.phase==='fade-in') {
      this.state.overlay = Math.max(0, 1 - this.timer/1.1);
      if (this.timer>1.4) {
        this.phase='announcing'; this.timer=0;
        this.state.actType='announcer'; this.state.banner=null; this.state.spotMode='center';
        this.state.phase='announcing';
        this.name('♪ ♪  EISTEDDFOD  ♪ ♪');
        this.sub(act.announce);
      }
    }
    else if (this.phase==='announcing') {
      this.state.overlay=0;
      if (this.timer>4.0) {
        this.phase='performing'; this.timer=0;
        this.state.actType=act.type;
        this.state.n=act.n||1;
        this.state.banner=act.banner;
        this.state.spotMode=act.spotMode;
        this.state.phase='performing';
        this.name(act.name); this.sub('');
        M[act.music]?.(this.sy);
      }
    }
    else if (this.phase==='performing') {
      this.state.overlay=0;
      if (this.timer>20) {
        this.phase='applause'; this.timer=0;
        this.state.phase='applause';
        this.state.banner=null;
        this.sub('👏  Cymeradwyaeth  ·  Aplausos  ·  Applause  👏');
        this.sy.silence();
        this.sy.noise(5.5, 0.15);
      }
    }
    else if (this.phase==='applause') {
      if (this.timer>5.8) { this.phase='fade-out'; this.timer=0; }
    }
    else if (this.phase==='fade-out') {
      this.state.overlay = Math.min(1, this.timer/.9);
      if (this.timer>1.1) { this.sy.silence(); this.nextAct(); }
    }
  }
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────
const cv    = document.getElementById('c');
const synth = new Synth();
const rend  = new Rend(cv);
const show  = new Show(synth, rend);

rend.render(show.state);

let last = performance.now();
function loop(now) {
  const dt = Math.min((now-last)/1000, 0.1);
  last = now;
  show.update(dt);
  rend.render(show.state);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.getElementById('bPlay').onclick = () => show.start();
document.getElementById('bSkip').onclick = () => show.skip();
cv.onclick = () => { if (!show.started) show.start(); else show.skip(); };

const VOLS = [
  {v:.22, label:'🔊 MED'},
  {v:.05, label:'🔈 LOW'},
  {v:.5,  label:'📢 HIGH'},
  {v:0,   label:'🔇 MUTE'},
];
let vi=0;
document.getElementById('bVol').onclick = function() {
  vi=(vi+1)%VOLS.length;
  synth.setVol(VOLS[vi].v);
  this.textContent=VOLS[vi].label;
};
document.addEventListener('keydown', e => {
  if (e.key===' '||e.key==='Enter') { e.preventDefault(); show.skip(); }
});
