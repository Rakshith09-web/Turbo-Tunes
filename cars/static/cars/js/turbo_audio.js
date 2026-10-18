// Web Audio API Engine & Turbo Sound Synthesizer for Turbo Tunes

class TurboAudioEngine {
  constructor() {
    this.ctx = null;
    this.isRunning = false;
    this.rpm = 800;
    this.targetRpm = 800;
    this.masterGain = null;
    this.engineGain = null;
    this.turboGain = null;
    this.filter = null;
    this.osc1 = null;
    this.osc2 = null;
    this.turboOsc = null;
    this.isRevving = false;
    this.loopId = null;
    this.onRpmChange = null;
  }

  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.setupEngineNodes();
    this.setupTurboNodes();
  }

  setupEngineNodes() {
    // Primary engine rumble (sawtooth for rich harmonic exhaust content)
    this.osc1 = this.ctx.createOscillator();
    this.osc1.type = "sawtooth";
    this.osc1.frequency.setValueAtTime(38, this.ctx.currentTime);

    // Secondary lower roar
    this.osc2 = this.ctx.createOscillator();
    this.osc2.type = "triangle";
    this.osc2.frequency.setValueAtTime(76, this.ctx.currentTime);

    // Lowpass filter to shape the raw wave into an exhaust burble
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.setValueAtTime(220, this.ctx.currentTime);
    this.filter.Q.setValueAtTime(2.8, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.osc1.connect(this.filter);
    this.osc2.connect(this.filter);
    this.filter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.osc1.start();
    this.osc2.start();
  }

  setupTurboNodes() {
    // High-frequency spool whine
    this.turboOsc = this.ctx.createOscillator();
    this.turboOsc.type = "sine";
    this.turboOsc.frequency.setValueAtTime(800, this.ctx.currentTime);

    this.turboGain = this.ctx.createGain();
    this.turboGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.turboOsc.connect(this.turboGain);
    this.turboGain.connect(this.masterGain);

    this.turboOsc.start();
  }

  startEngine() {
    this.init();
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    this.isRunning = true;
    this.targetRpm = 850;
    this.rpm = 850;

    const t = this.ctx.currentTime;
    this.engineGain.gain.cancelScheduledValues(t);
    this.engineGain.gain.linearRampToValueAtTime(0.42, t + 0.35);

    this.updatePitch();
    this.startUpdateLoop();
  }

  stopEngine() {
    if (!this.isRunning || !this.ctx) return;
    this.isRunning = false;
    this.isRevving = false;
    this.targetRpm = 0;
    const t = this.ctx.currentTime;
    this.engineGain.gain.cancelScheduledValues(t);
    this.engineGain.gain.linearRampToValueAtTime(0, t + 0.3);
    this.turboGain.gain.cancelScheduledValues(t);
    this.turboGain.gain.linearRampToValueAtTime(0, t + 0.2);
    if (this.loopId) cancelAnimationFrame(this.loopId);
  }

  toggleEngine() {
    if (this.isRunning) {
      this.stopEngine();
    } else {
      this.startEngine();
    }
    return this.isRunning;
  }

  startRev() {
    if (!this.isRunning) {
      this.startEngine();
    }
    this.isRevving = true;
    this.targetRpm = 6800;
  }

  releaseRev() {
    if (!this.isRunning) return;
    if (this.isRevving && this.rpm > 3200) {
      this.triggerBlowOffValve();
    }
    this.isRevving = false;
    this.targetRpm = 850;
  }

  triggerBlowOffValve() {
    if (!this.ctx) return;
    try {
      const duration = 0.38;
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.45));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const bovFilter = this.ctx.createBiquadFilter();
      bovFilter.type = "bandpass";
      bovFilter.frequency.setValueAtTime(2400, this.ctx.currentTime);
      bovFilter.Q.setValueAtTime(2.2, this.ctx.currentTime);

      const bovGain = this.ctx.createGain();
      const t = this.ctx.currentTime;
      bovGain.gain.setValueAtTime(0.28, t);
      bovGain.gain.exponentialRampToValueAtTime(0.005, t + duration);

      noise.connect(bovFilter);
      bovFilter.connect(bovGain);
      bovGain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + duration);
    } catch (e) {
      console.warn("BOV synth error:", e);
    }
  }

  updatePitch() {
    if (!this.ctx || !this.isRunning) return;
    const baseFreq = 34 + (this.rpm / 7500) * 145;
    this.osc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.04);
    this.osc2.frequency.setTargetAtTime(baseFreq * 1.5, this.ctx.currentTime, 0.04);

    const filterFreq = 180 + (this.rpm / 7500) * 900;
    this.filter.frequency.setTargetAtTime(filterFreq, this.ctx.currentTime, 0.04);

    if (this.rpm > 2200) {
      const turboRatio = (this.rpm - 2200) / 5300;
      const turboFreq = 850 + turboRatio * 2500;
      this.turboOsc.frequency.setTargetAtTime(turboFreq, this.ctx.currentTime, 0.05);
      this.turboGain.gain.setTargetAtTime(turboRatio * 0.18, this.ctx.currentTime, 0.05);
    } else {
      this.turboGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  startUpdateLoop() {
    const update = () => {
      if (!this.isRunning) {
        if (this.onRpmChange) this.onRpmChange(0);
        return;
      }
      const rate = this.isRevving ? 0.08 : 0.045;
      this.rpm += (this.targetRpm - this.rpm) * rate;
      this.updatePitch();

      if (this.onRpmChange) {
        this.onRpmChange(Math.round(this.rpm));
      }
      this.loopId = requestAnimationFrame(update);
    };
    this.loopId = requestAnimationFrame(update);
  }
}

export { TurboAudioEngine };
