export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.crowdGain = null;
    this.muted = localStorage.getItem('neon-muted') === '1';
    this.ready = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this._buildCrowd();
    this.ready = true;
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem('neon-muted', muted ? '1' : '0');
    if (this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.7, this.ctx.currentTime + 0.15);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  _noiseBuffer(seconds = 2) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buf;
  }

  _buildCrowd() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(4);
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 480;
    filter.Q.value = 0.55;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.045;
    src.connect(filter);
    filter.connect(this.crowdGain);
    this.crowdGain.connect(this.master);
    src.start();

    const src2 = this.ctx.createBufferSource();
    src2.buffer = this._noiseBuffer(3);
    src2.loop = true;
    const filter2 = this.ctx.createBiquadFilter();
    filter2.type = 'lowpass';
    filter2.frequency.value = 180;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.05;
    src2.connect(filter2);
    filter2.connect(g2);
    g2.connect(this.master);
    src2.start();
  }

  _tone({ type = 'sine', freq = 440, freqEnd, gain = 0.2, dur = 0.2, delay = 0, attack = 0.006, detune = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    if (detune) osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  _noiseHit({ gain = 0.2, dur = 0.12, type = 'bandpass', freq = 900, q = 1, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(Math.max(0.2, dur + 0.1));
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  kick(power = 1) {
    this._tone({ type: 'sine', freq: 150 + power * 40, freqEnd: 45, gain: 0.32 + power * 0.2, dur: 0.16 });
    this._noiseHit({ gain: 0.14, dur: 0.06, freq: 1800, q: 0.9 });
    this._noiseHit({ gain: 0.1, dur: 0.18, freq: 350, type: 'lowpass', delay: 0.01 });
  }

  pass() {
    this._tone({ type: 'sine', freq: 190, freqEnd: 90, gain: 0.14, dur: 0.1 });
    this._noiseHit({ gain: 0.05, dur: 0.05, freq: 2400 });
  }

  shot(power = 1, perfect = false) {
    this.kick(power);
    this._noiseHit({ gain: 0.13, dur: 0.24, freq: 1100, type: 'bandpass', q: 0.7 });
    if (perfect) this.perfect();
  }

  perfect() {
    this._tone({ type: 'triangle', freq: 1046, gain: 0.15, dur: 0.32, delay: 0.02 });
    this._tone({ type: 'triangle', freq: 1568, gain: 0.11, dur: 0.38, delay: 0.1 });
    this._tone({ type: 'sine', freq: 2093, gain: 0.06, dur: 0.4, delay: 0.18 });
  }

  save() {
    this._noiseHit({ gain: 0.3, dur: 0.22, freq: 600, type: 'lowpass' });
    this._tone({ type: 'sine', freq: 240, freqEnd: 80, gain: 0.2, dur: 0.18 });
  }

  post() {
    this._tone({ type: 'triangle', freq: 1170, freqEnd: 980, gain: 0.26, dur: 0.55 });
    this._tone({ type: 'sine', freq: 2350, freqEnd: 1900, gain: 0.09, dur: 0.38 });
    this._noiseHit({ gain: 0.08, dur: 0.08, freq: 3000 });
  }

  tackle() {
    this._noiseHit({ gain: 0.26, dur: 0.24, freq: 300, type: 'lowpass' });
    this._tone({ type: 'sine', freq: 130, freqEnd: 52, gain: 0.17, dur: 0.22 });
  }

  whistle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 2250;
    lfo.frequency.value = 26;
    lfoGain.gain.value = 65;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    g.gain.setValueAtTime(0.18, t + 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.6);
    lfo.stop(t + 0.6);
    this._tone({ type: 'sine', freq: 2680, gain: 0.06, dur: 0.4 });
  }

  goal() {
    this._crowdCheer(1);
    const notes = [220, 277.18, 329.63, 440];
    notes.forEach((f, i) => {
      this._tone({ type: 'triangle', freq: f, gain: 0.08, dur: 0.9, delay: i * 0.05, attack: 0.03 });
      this._tone({ type: 'sawtooth', freq: f / 2, gain: 0.03, dur: 0.7, delay: i * 0.05 });
    });
    this._noiseHit({ gain: 0.22, dur: 1.4, freq: 900, type: 'bandpass', q: 0.4 });
  }

  _crowdCheer(level = 0.8) {
    if (!this.crowdGain) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.cancelScheduledValues(t);
    this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, t);
    this.crowdGain.gain.linearRampToValueAtTime(0.02 + 0.17 * level, t + 0.18);
    this.crowdGain.gain.exponentialRampToValueAtTime(0.045, t + 2.8);
  }

  saveCheer() {
    this._crowdCheer(0.35);
  }

  skillMove() {
    this._noiseHit({ gain: 0.12, dur: 0.18, freq: 1400, type: 'bandpass', q: 0.8 });
    this._tone({ type: 'triangle', freq: 320, freqEnd: 620, gain: 0.08, dur: 0.16 });
  }

  slide() {
    this._noiseHit({ gain: 0.12, dur: 0.3, freq: 420, type: 'lowpass' });
  }

  touch() {
    this._tone({ type: 'sine', freq: 220, freqEnd: 160, gain: 0.055, dur: 0.06 });
  }

  block() {
    this._noiseHit({ gain: 0.16, dur: 0.12, freq: 520, type: 'lowpass' });
  }

  wall() {
    this._noiseHit({ gain: 0.09, dur: 0.1, freq: 260, type: 'lowpass' });
  }

  catch() {
    this._noiseHit({ gain: 0.12, dur: 0.12, freq: 800, type: 'bandpass' });
    this._tone({ type: 'sine', freq: 170, freqEnd: 120, gain: 0.07, dur: 0.1 });
  }

  keeperThrow() {
    this._tone({ type: 'sine', freq: 240, freqEnd: 160, gain: 0.1, dur: 0.14 });
    this._noiseHit({ gain: 0.05, dur: 0.1, freq: 900 });
  }

  ui() {
    this._tone({ type: 'sine', freq: 660, freqEnd: 880, gain: 0.055, dur: 0.08 });
  }

  select() {
    this._tone({ type: 'triangle', freq: 440, freqEnd: 660, gain: 0.06, dur: 0.11 });
    this._tone({ type: 'sine', freq: 990, gain: 0.03, dur: 0.12, delay: 0.03 });
  }
}
