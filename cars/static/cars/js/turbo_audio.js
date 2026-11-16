// Web Audio API Engine & Turbo Sound Synthesizer with 5 Car Profiles

const CAR_AUDIO_PROFILES = {
  sedan: {
    key: "sedan",
    engineTitle: "3.0L Twin-Scroll I6",
    badgeLabel: "I6 TURBO",
    idleRpm: 750,
    maxRpm: 6800,
    baseFreq: 33,
    freqMult: 135,
    osc1Type: "sawtooth",
    osc2Type: "triangle",
    filterFreqBase: 210,
    filterFreqMult: 750,
    filterQ: 2.4,
    turboStartRpm: 2300,
    turboFreqBase: 900,
    turboFreqMult: 2300,
    turboMaxGain: 0.15,
    bovFreq: 2200,
    bovDuration: 0.35,
    revRate: 0.075,
    decayRate: 0.045,
  },
  sports_sedan: {
    key: "sports_sedan",
    engineTitle: "4.4L Twin-Turbo V8",
    badgeLabel: "V8 TWIN-TURBO",
    idleRpm: 850,
    maxRpm: 7400,
    baseFreq: 28, // Deep rumbling V8 base
    freqMult: 160,
    osc1Type: "sawtooth",
    osc2Type: "square", // Adds rich throaty muscle growl
    filterFreqBase: 190,
    filterFreqMult: 1050,
    filterQ: 3.6,
    turboStartRpm: 2000,
    turboFreqBase: 1100,
    turboFreqMult: 2700,
    turboMaxGain: 0.22,
    bovFreq: 2800,
    bovDuration: 0.42,
    revRate: 0.088,
    decayRate: 0.05,
  },
  suv: {
    key: "suv",
    engineTitle: "5.0L Supercharged V8",
    badgeLabel: "V8 SUPERCHARGED",
    idleRpm: 650, // Heavy low-end diesel/truck chug
    maxRpm: 5600, // Low-end torque redline
    baseFreq: 24, // Very heavy bass rumble
    freqMult: 110,
    osc1Type: "triangle",
    osc2Type: "sawtooth",
    filterFreqBase: 150,
    filterFreqMult: 580,
    filterQ: 2.1,
    turboStartRpm: 1800,
    turboFreqBase: 680,
    turboFreqMult: 1900,
    turboMaxGain: 0.17,
    bovFreq: 1600,
    bovDuration: 0.48,
    revRate: 0.06, // Heavier engine flywheel
    decayRate: 0.038,
  },
  sports_hatchback: {
    key: "sports_hatchback",
    engineTitle: "2.0L High-Boost Rally I4",
    badgeLabel: "RALLY 2.0T",
    idleRpm: 980, // Peppy high idle
    maxRpm: 8400, // Screaming rally redline
    baseFreq: 42, // Raspy high pitch
    freqMult: 195,
    osc1Type: "sawtooth",
    osc2Type: "sawtooth", // Double sawtooth for raspy tuner note
    filterFreqBase: 260,
    filterFreqMult: 1400,
    filterQ: 4.2, // Resonant exhaust snap
    turboStartRpm: 2500,
    turboFreqBase: 1300,
    turboFreqMult: 3400,
    turboMaxGain: 0.28, // Loudest turbo spool
    bovFreq: 3400, // High-pitched aggressive blow-off flutter
    bovDuration: 0.28,
    revRate: 0.115, // Ultra-fast throttle response
    decayRate: 0.065,
  },
  future_racer: {
    key: "future_racer",
    engineTitle: "Dual-Flux Electric Warp Drive",
    badgeLabel: "ELECTRIC WARP",
    idleRpm: 1000,
    maxRpm: 15000, // Hyper EV RPM
    baseFreq: 115, // Electric power inverter whine
    freqMult: 480,
    osc1Type: "sine",
    osc2Type: "triangle", // Pure futuristic turbine tone
    filterFreqBase: 650,
    filterFreqMult: 3400,
    filterQ: 1.6,
    turboStartRpm: 1200, // Immediate electric spool
    turboFreqBase: 1400,
    turboFreqMult: 5800, // Supersonic jet scream
    turboMaxGain: 0.32,
    bovFreq: 4800, // Energy discharge chirp
    bovDuration: 0.22,
    revRate: 0.14, // Instant electric torque
    decayRate: 0.08,
  },
};

function getProfileForCar(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("future") || n.includes("racer") || n.includes("electric")) {
    return CAR_AUDIO_PROFILES.future_racer;
  }
  if (n.includes("hatchback")) {
    return CAR_AUDIO_PROFILES.sports_hatchback;
  }
  if (n.includes("suv")) {
    return CAR_AUDIO_PROFILES.suv;
  }
  if (n.includes("sports sedan")) {
    return CAR_AUDIO_PROFILES.sports_sedan;
  }
  return CAR_AUDIO_PROFILES.sedan;
}

class TurboAudioEngine {
  constructor(carName = "") {
    this.profile = getProfileForCar(carName);
    this.ctx = null;
    this.isRunning = false;
    this.rpm = this.profile.idleRpm;
    this.targetRpm = this.profile.idleRpm;
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
    const p = this.profile;
    this.osc1 = this.ctx.createOscillator();
    this.osc1.type = p.osc1Type;
    this.osc1.frequency.setValueAtTime(p.baseFreq, this.ctx.currentTime);

    this.osc2 = this.ctx.createOscillator();
    this.osc2.type = p.osc2Type;
    this.osc2.frequency.setValueAtTime(p.baseFreq * 1.5, this.ctx.currentTime);

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.setValueAtTime(p.filterFreqBase, this.ctx.currentTime);
    this.filter.Q.setValueAtTime(p.filterQ, this.ctx.currentTime);

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
    const p = this.profile;
    this.turboOsc = this.ctx.createOscillator();
    this.turboOsc.type = "sine";
    this.turboOsc.frequency.setValueAtTime(p.turboFreqBase, this.ctx.currentTime);

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
    this.targetRpm = this.profile.idleRpm;
    this.rpm = this.profile.idleRpm;

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
    this.targetRpm = this.profile.maxRpm * 0.92;
  }

  releaseRev() {
    if (!this.isRunning) return;
    if (this.isRevving && this.rpm > this.profile.turboStartRpm) {
      this.triggerBlowOffValve();
    }
    this.isRevving = false;
    this.targetRpm = this.profile.idleRpm;
  }

  triggerBlowOffValve() {
    if (!this.ctx) return;
    const p = this.profile;
    try {
      const duration = p.bovDuration;
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.42));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const bovFilter = this.ctx.createBiquadFilter();
      bovFilter.type = "bandpass";
      bovFilter.frequency.setValueAtTime(p.bovFreq, this.ctx.currentTime);
      bovFilter.Q.setValueAtTime(2.4, this.ctx.currentTime);

      const bovGain = this.ctx.createGain();
      const t = this.ctx.currentTime;
      bovGain.gain.setValueAtTime(0.3, t);
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
    const p = this.profile;
    const ratio = Math.min(1, Math.max(0, (this.rpm - p.idleRpm) / (p.maxRpm - p.idleRpm)));

    const baseFreq = p.baseFreq + ratio * p.freqMult;
    this.osc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.04);
    this.osc2.frequency.setTargetAtTime(baseFreq * 1.5, this.ctx.currentTime, 0.04);

    const filterFreq = p.filterFreqBase + ratio * p.filterFreqMult;
    this.filter.frequency.setTargetAtTime(filterFreq, this.ctx.currentTime, 0.04);

    if (this.rpm > p.turboStartRpm) {
      const turboRatio = Math.min(1, (this.rpm - p.turboStartRpm) / (p.maxRpm - p.turboStartRpm));
      const turboFreq = p.turboFreqBase + turboRatio * p.turboFreqMult;
      this.turboOsc.frequency.setTargetAtTime(turboFreq, this.ctx.currentTime, 0.05);
      this.turboGain.gain.setTargetAtTime(turboRatio * p.turboMaxGain, this.ctx.currentTime, 0.05);
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
      const rate = this.isRevving ? this.profile.revRate : this.profile.decayRate;
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

export { TurboAudioEngine, CAR_AUDIO_PROFILES, getProfileForCar };
