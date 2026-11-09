export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.crowdGain = null;
    this.muted = false;
    this.started = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.72;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 20;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.24;
    this.master.connect(comp).connect(this.ctx.destination);
    this.startCrowd();
    this.started = true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.72, now, 0.06);
    }
  }

  toggle() {
    this.init();
    this.setMuted(!this.muted);
    return this.muted;
  }

  startCrowd() {
    const ctx = this.ctx;
    const seconds = 3;
    const buffer = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = last * 0.72 + white * 0.28;
        data[i] = last * 0.7;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 560;
    bp.Q.value = 0.32;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1900;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.025;
    src.connect(bp).connect(lp).connect(this.crowdGain).connect(this.master);
    src.start();
    this.crowdBand = bp;
  }

  crowdSwell(amount = 0.07, length = 2.4) {
    if (!this.ctx || !this.crowdGain) return;
    const now = this.ctx.currentTime;
    this.crowdGain.gain.cancelScheduledValues(now);
    this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, now);
    this.crowdGain.gain.linearRampToValueAtTime(amount, now + 0.12);
    this.crowdGain.gain.exponentialRampToValueAtTime(0.025, now + length);
    if (this.crowdBand) {
      this.crowdBand.frequency.cancelScheduledValues(now);
      this.crowdBand.frequency.setValueAtTime(700, now);
      this.crowdBand.frequency.exponentialRampToValueAtTime(460, now + length);
    }
  }

  tone({ freq = 220, endFreq = freq, dur = 0.15, type = "sine", gain = 0.16, delay = 0, attack = 0.004 }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise({ dur = 0.12, gain = 0.12, type = "lowpass", freq = 900, freqEnd = freq, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (freqEnd !== freq) filter.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
  }

  kick(power = 1) {
    this.noise({ dur: 0.07 + power * 0.04, gain: 0.22, freq: 750 + power * 500, freqEnd: 180 });
    this.tone({ freq: 150 - power * 20, endFreq: 52, dur: 0.12, type: "triangle", gain: 0.24 });
  }

  pass() {
    this.noise({ dur: 0.055, gain: 0.12, freq: 1100, freqEnd: 300 });
    this.tone({ freq: 260, endFreq: 150, dur: 0.075, type: "sine", gain: 0.1 });
  }

  tackle() {
    this.noise({ dur: 0.18, gain: 0.17, freq: 480, freqEnd: 120 });
    this.tone({ freq: 90, endFreq: 45, dur: 0.2, type: "triangle", gain: 0.16 });
  }

  bounce(strength = 0.5) {
    const v = Math.max(0.1, Math.min(1, strength));
    this.tone({ freq: 170 + v * 50, endFreq: 90, dur: 0.08, type: "sine", gain: 0.035 + v * 0.05 });
  }

  skill() {
    this.noise({ dur: 0.24, gain: 0.1, type: "bandpass", freq: 500, freqEnd: 2400 });
    this.tone({ freq: 320, endFreq: 760, dur: 0.17, type: "sine", gain: 0.07 });
  }

  whistle(long = false) {
    if (!this.ctx) return;
    const dur = long ? 0.9 : 0.32;
    this.tone({ freq: 2280, endFreq: 2450, dur, type: "sine", gain: 0.11 });
    this.tone({ freq: 2340, endFreq: 2510, dur, type: "sine", gain: 0.07, delay: 0.01 });
    if (long) {
      this.tone({ freq: 2180, endFreq: 2360, dur: 0.2, type: "sine", gain: 0.08, delay: 0.68 });
    }
  }

  goal() {
    this.crowdSwell(0.2, 3.4);
    const notes = [261.6, 329.6, 392, 523.2, 659.2];
    notes.forEach((f, i) => {
      this.tone({ freq: f, endFreq: f, dur: 0.6, type: "sawtooth", gain: 0.035, delay: i * 0.055 });
      this.tone({ freq: f * 2, endFreq: f * 2, dur: 0.4, type: "triangle", gain: 0.025, delay: i * 0.055 });
    });
    this.noise({ dur: 0.9, gain: 0.09, type: "highpass", freq: 1800, freqEnd: 3600 });
  }

  ui() {
    this.tone({ freq: 520, endFreq: 700, dur: 0.055, type: "sine", gain: 0.055 });
  }

  start() {
    this.whistle(false);
    this.crowdSwell(0.1, 1.5);
  }

  fail() {
    this.tone({ freq: 180, endFreq: 110, dur: 0.22, type: "triangle", gain: 0.1 });
  }
}
