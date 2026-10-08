"use client";
/**
 * alertSounds.ts — the cast-alert beeps, synthesized with Web Audio so nothing has to be
 * bundled or fetched. Shared by the alert overlay (plays on a real alert) and Settings (the
 * preview button), so what you preview is exactly what fires.
 *
 * Each preset is a little score of tones; `playAlertSound` schedules them on one reused
 * AudioContext. Any failure (no audio device) is swallowed — the banner is the real alert,
 * the sound is a bonus.
 */

interface Tone {
  /** Hz. */
  freq: number;
  /** Seconds after the sound starts. */
  at: number;
  /** Seconds the tone lasts. */
  dur: number;
  type?: OscillatorType;
  /** Peak gain (0–1); defaults to a modest 0.2. */
  gain?: number;
}

export interface AlertSound {
  name: string;
  label: string;
  tones: Tone[];
}

/** The selectable beeps: attention-getters first (`chirp` is the original two-tone), then the celebratory ones. */
export const ALERT_SOUNDS: readonly AlertSound[] = [
  { name: "chirp", label: "Chirp", tones: [{ freq: 880, at: 0, dur: 0.12 }, { freq: 660, at: 0.12, dur: 0.2 }] },
  { name: "double", label: "Double beep", tones: [{ freq: 880, at: 0, dur: 0.08 }, { freq: 880, at: 0.15, dur: 0.1 }] },
  {
    name: "rising",
    label: "Rising",
    tones: [{ freq: 520, at: 0, dur: 0.1 }, { freq: 760, at: 0.1, dur: 0.1 }, { freq: 1040, at: 0.2, dur: 0.16 }],
  },
  {
    name: "alarm",
    label: "Alarm",
    tones: [
      { freq: 990, at: 0, dur: 0.1, type: "sawtooth" },
      { freq: 740, at: 0.13, dur: 0.1, type: "sawtooth" },
      { freq: 990, at: 0.26, dur: 0.1, type: "sawtooth" },
      { freq: 740, at: 0.39, dur: 0.12, type: "sawtooth" },
    ],
  },
  {
    name: "chime",
    label: "Chime",
    tones: [
      { freq: 659, at: 0, dur: 0.55, type: "sine", gain: 0.18 },
      { freq: 988, at: 0.07, dur: 0.55, type: "sine", gain: 0.18 },
      { freq: 1319, at: 0.14, dur: 0.5, type: "sine", gain: 0.18 },
    ],
  },
  { name: "buzz", label: "Low buzz", tones: [{ freq: 150, at: 0, dur: 0.35, type: "square", gain: 0.22 }] },

  /* The good-news end of the list. A record falling or a rare drop landing deserves better than an
     alarm, and what makes a sound read as congratulation rather than "look here" is the shape: these
     all climb and then hold, where the warnings above fall or repeat. Chorded entries keep each voice
     quiet, so a three-note hit doesn't land much louder than a one-note beep. */
  {
    name: "fanfare",
    label: "Fanfare",
    tones: [
      { freq: 523, at: 0, dur: 0.1, type: "sawtooth", gain: 0.14 },
      { freq: 523, at: 0.13, dur: 0.09, type: "sawtooth", gain: 0.14 },
      { freq: 523, at: 0.24, dur: 0.09, type: "sawtooth", gain: 0.14 },
      { freq: 784, at: 0.35, dur: 0.45, type: "sawtooth", gain: 0.15 },
      { freq: 1047, at: 0.35, dur: 0.45, type: "triangle", gain: 0.09 }, // an octave of shine on the landing
    ],
  },
  {
    name: "charge",
    label: "Charge!",
    tones: [
      { freq: 392, at: 0, dur: 0.09, type: "sawtooth", gain: 0.15 },
      { freq: 523, at: 0.1, dur: 0.09, type: "sawtooth", gain: 0.15 },
      { freq: 659, at: 0.2, dur: 0.09, type: "sawtooth", gain: 0.15 },
      { freq: 784, at: 0.3, dur: 0.1, type: "sawtooth", gain: 0.16 },
      { freq: 659, at: 0.44, dur: 0.08, type: "sawtooth", gain: 0.14 },
      { freq: 784, at: 0.54, dur: 0.4, type: "sawtooth", gain: 0.16 },
    ],
  },
  {
    name: "levelup",
    label: "Level up",
    tones: [
      { freq: 523, at: 0, dur: 0.07, type: "square", gain: 0.15 },
      { freq: 659, at: 0.07, dur: 0.07, type: "square", gain: 0.15 },
      { freq: 784, at: 0.14, dur: 0.07, type: "square", gain: 0.15 },
      { freq: 1047, at: 0.21, dur: 0.07, type: "square", gain: 0.15 },
      { freq: 1319, at: 0.28, dur: 0.4, type: "square", gain: 0.14 },
    ],
  },
  {
    name: "triumph",
    label: "Triumph",
    tones: [
      // Fifths climbing in harmony — slower than the arpeggios, so it reads as ceremony not a jingle.
      { freq: 523, at: 0, dur: 0.2, type: "triangle", gain: 0.15 },
      { freq: 659, at: 0, dur: 0.2, type: "triangle", gain: 0.1 },
      { freq: 659, at: 0.2, dur: 0.2, type: "triangle", gain: 0.15 },
      { freq: 784, at: 0.2, dur: 0.2, type: "triangle", gain: 0.1 },
      { freq: 784, at: 0.4, dur: 0.6, type: "triangle", gain: 0.15 },
      { freq: 1047, at: 0.4, dur: 0.6, type: "triangle", gain: 0.11 },
    ],
  },
  {
    name: "tada",
    label: "Ta-da!",
    tones: [
      { freq: 587, at: 0, dur: 0.12, type: "triangle", gain: 0.16 }, // the "ta"
      { freq: 587, at: 0.14, dur: 0.6, type: "triangle", gain: 0.12 }, // the "da" — one chord, three voices
      { freq: 740, at: 0.14, dur: 0.6, type: "triangle", gain: 0.1 },
      { freq: 880, at: 0.14, dur: 0.6, type: "triangle", gain: 0.1 },
    ],
  },
  {
    name: "hurrah",
    label: "Hurrah",
    tones: [
      // Three cheers: the same two-note whoop three times, each a step higher than the last.
      { freq: 587, at: 0, dur: 0.08, type: "triangle", gain: 0.15 },
      { freq: 880, at: 0.08, dur: 0.14, type: "triangle", gain: 0.15 },
      { freq: 659, at: 0.26, dur: 0.08, type: "triangle", gain: 0.15 },
      { freq: 988, at: 0.34, dur: 0.14, type: "triangle", gain: 0.15 },
      { freq: 784, at: 0.52, dur: 0.08, type: "triangle", gain: 0.15 },
      { freq: 1175, at: 0.6, dur: 0.4, type: "triangle", gain: 0.16 },
    ],
  },
  {
    name: "coin",
    label: "Coin",
    tones: [
      { freq: 988, at: 0, dur: 0.07, type: "square", gain: 0.16 },
      { freq: 1319, at: 0.07, dur: 0.4, type: "square", gain: 0.14 },
    ],
  },
  {
    name: "sparkle",
    label: "Sparkle",
    tones: [
      { freq: 1568, at: 0, dur: 0.12, type: "sine", gain: 0.18 },
      { freq: 2093, at: 0.08, dur: 0.12, type: "sine", gain: 0.16 },
      { freq: 1760, at: 0.16, dur: 0.14, type: "sine", gain: 0.16 },
      { freq: 2637, at: 0.24, dur: 0.32, type: "sine", gain: 0.15 },
    ],
  },
];

/** The default when a stored name doesn't match (renamed/removed preset). */
export const DEFAULT_ALERT_SOUND = "chirp";

let ctx: AudioContext | null = null;

/** Play a preset by name (falls back to the default). No-ops silently if audio is unavailable. */
export function playAlertSound(name: string): void {
  const sound = ALERT_SOUNDS.find((s) => s.name === name) ?? ALERT_SOUNDS[0];
  try {
    ctx ??= new AudioContext();
    const audio = ctx;
    void audio.resume?.(); // a never-focused window can leave it suspended; nudge it
    const t0 = audio.currentTime;
    for (const tone of sound.tones) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const start = t0 + tone.at;
      const peak = tone.gain ?? 0.2;
      osc.type = tone.type ?? "square";
      osc.frequency.setValueAtTime(tone.freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + tone.dur + 0.03);
    }
  } catch {
    /* no audio device — the banner still fires */
  }
}
