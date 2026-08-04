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

/** The selectable beeps, most familiar first (`chirp` is the original two-tone). */
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
