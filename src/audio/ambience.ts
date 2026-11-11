import type { CollisionWorld } from '../world/collision';

const MASTER_VOLUME = 0.8;
const RIVER_MAX_VOLUME = 0.55;
const MURMUR_VOLUME = 0.16;
const MUSIC_VOLUME = 0.2;
const WATER_SAMPLE_INTERVAL = 0.3;
const WATER_SAMPLE_SPACING = 8;
const WATER_SAMPLE_STEPS = 4;
const WATER_FULL_VOLUME_WEIGHT = 6;
const MURMUR_VOICES = 5;
const MURMUR_SYLLABLE_MS = 130;
// 都節音階（D、E♭、G、A、B♭），用嚟砌似箏嘅旋律
const MUSIC_NOTES = [146.83, 196, 220, 233.08, 293.66, 311.13, 392, 440, 466.16, 587.33];
const MUSIC_NOTE_SECONDS = 3.5;
const MUSIC_STEPS = [0.6, 0.6, 0.9, 1.2, 1.8];
const MUSIC_LOOKAHEAD = 0.3;

export interface Ambience {
  /** 每 frame 叫，按玩家位置調河水聲 */
  update(x: number, z: number, nowSeconds: number): void;
  /** 開關聲音，回傳開咗未 */
  toggle(): boolean;
  readonly enabled: boolean;
}

function noiseBuffer(context: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

function loopedNoise(context: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.start();
  return source;
}

/** Karplus-Strong 撥弦，聲音似箏 */
function pluckBuffer(context: AudioContext, frequency: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * MUSIC_NOTE_SECONDS);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  const period = Math.round(context.sampleRate / frequency);
  for (let i = 0; i < length; i += 1) {
    if (i < period) data[i] = Math.random() * 2 - 1;
    else data[i] = 0.497 * (data[i - period]! + data[i - period - 1 >= 0 ? i - period - 1 : 0]!);
  }
  return buffer;
}

function reverbImpulse(context: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
  }
  return buffer;
}

class AmbienceEngine {
  private readonly context = new AudioContext();
  private readonly master = this.context.createGain();
  private readonly river = this.context.createGain();
  private nextNoteTime = 0;
  private noteIndex = 4;
  private readonly plucks: AudioBuffer[];
  private readonly musicBus = this.context.createGain();

  constructor() {
    const { context } = this;
    this.master.gain.value = MASTER_VOLUME;
    this.master.connect(context.destination);

    // 河水：低沉嘅布朗噪音加少少高頻水花
    const brown = loopedNoise(context, noiseBuffer(context, 4, true));
    const body = context.createBiquadFilter();
    body.type = 'bandpass';
    body.frequency.value = 650;
    body.Q.value = 0.6;
    const white = loopedNoise(context, noiseBuffer(context, 3, false));
    const sparkle = context.createBiquadFilter();
    sparkle.type = 'bandpass';
    sparkle.frequency.value = 2600;
    sparkle.Q.value = 1.2;
    const sparkleGain = context.createGain();
    sparkleGain.gain.value = 0.12;
    brown.connect(body).connect(this.river);
    white.connect(sparkle).connect(sparkleGain).connect(this.river);
    this.river.gain.value = 0;
    this.river.connect(this.master);

    // 遠處人聲：幾組窄頻噪音，按音節節奏隨機開合
    const murmurBus = context.createGain();
    murmurBus.gain.value = MURMUR_VOLUME;
    const murmurTone = context.createBiquadFilter();
    murmurTone.type = 'lowpass';
    murmurTone.frequency.value = 1800;
    murmurBus.connect(murmurTone).connect(this.master);
    const voiceNoise = loopedNoise(context, noiseBuffer(context, 3, false));
    const voices = Array.from({ length: MURMUR_VOICES }, () => {
      const formant = context.createBiquadFilter();
      formant.type = 'bandpass';
      formant.Q.value = 5;
      formant.frequency.value = 350 + Math.random() * 850;
      const gain = context.createGain();
      gain.gain.value = 0;
      voiceNoise.connect(formant).connect(gain).connect(murmurBus);
      return { formant, gain };
    });
    window.setInterval(() => {
      const now = context.currentTime;
      for (const { formant, gain } of voices) {
        const talking = Math.random() < 0.55;
        gain.gain.setTargetAtTime(talking ? 0.3 + Math.random() * 0.7 : 0, now, 0.04);
        formant.frequency.setTargetAtTime(350 + Math.random() * 850, now, 0.08);
      }
    }, MURMUR_SYLLABLE_MS);

    // 背景音樂：撥弦加殘響
    this.plucks = MUSIC_NOTES.map((frequency) => pluckBuffer(context, frequency));
    const reverb = context.createConvolver();
    reverb.buffer = reverbImpulse(context, 2.8);
    const wet = context.createGain();
    wet.gain.value = 0.5;
    this.musicBus.gain.value = MUSIC_VOLUME;
    this.musicBus.connect(this.master);
    this.musicBus.connect(reverb).connect(wet).connect(this.master);
    this.nextNoteTime = context.currentTime + 1;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void context.suspend();
      else if (this.master.gain.value > 0) void context.resume();
    });
  }

  setEnabled(enabled: boolean): void {
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(enabled ? MASTER_VOLUME : 0, now, 0.1);
    if (enabled) void this.context.resume();
  }

  setRiver(level: number): void {
    this.river.gain.setTargetAtTime(level * RIVER_MAX_VOLUME, this.context.currentTime, 0.4);
  }

  scheduleMusic(): void {
    const { context } = this;
    while (this.nextNoteTime < context.currentTime + MUSIC_LOOKAHEAD) {
      if (Math.random() > 0.2) {
        this.playNote(this.noteIndex, this.nextNoteTime, 0.8 + Math.random() * 0.2);
        if (Math.random() < 0.15) this.playNote(this.noteIndex - 3, this.nextNoteTime, 0.5);
      }
      const leap = Math.round((Math.random() - 0.5) * 4);
      this.noteIndex = Math.min(MUSIC_NOTES.length - 1, Math.max(0, this.noteIndex + leap));
      this.nextNoteTime += MUSIC_STEPS[Math.floor(Math.random() * MUSIC_STEPS.length)]!;
    }
  }

  private playNote(index: number, time: number, velocity: number): void {
    const buffer = this.plucks[index];
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const gain = this.context.createGain();
    gain.gain.value = velocity;
    source.connect(gain).connect(this.musicBus);
    source.start(time);
  }
}

/** 瀏覽器要用戶撳過先可以出聲，所以第一次撳畫面或者按掣先開始 */
export function createAmbience(collision: CollisionWorld): Ambience {
  let engine: AmbienceEngine | null = null;
  let enabled = true;
  let nextSample = 0;

  const start = (): void => {
    if (engine || !enabled) return;
    engine = new AmbienceEngine();
    engine.setEnabled(true);
  };
  window.addEventListener('pointerdown', start);
  window.addEventListener('keydown', start);

  const waterNearby = (x: number, z: number): number => {
    let weight = 0;
    for (let i = -WATER_SAMPLE_STEPS; i <= WATER_SAMPLE_STEPS; i += 1) {
      for (let j = -WATER_SAMPLE_STEPS; j <= WATER_SAMPLE_STEPS; j += 1) {
        const dx = i * WATER_SAMPLE_SPACING;
        const dz = j * WATER_SAMPLE_SPACING;
        if (collision.isWater(x + dx, z + dz)) weight += 1 / (1 + Math.hypot(dx, dz) / 10);
      }
    }
    return Math.min(1, weight / WATER_FULL_VOLUME_WEIGHT);
  };

  return {
    get enabled() {
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      if (enabled) start();
      engine?.setEnabled(enabled);
      return enabled;
    },
    update(x, z, nowSeconds) {
      if (!engine || !enabled) return;
      engine.scheduleMusic();
      if (nowSeconds >= nextSample) {
        nextSample = nowSeconds + WATER_SAMPLE_INTERVAL;
        engine.setRiver(waterNearby(x, z));
      }
    },
  };
}
