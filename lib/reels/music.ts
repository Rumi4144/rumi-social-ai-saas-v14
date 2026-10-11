export const MUSIC_STYLES = [
  { value: "ambient", label: "Soft ambient", description: "Warm, slow chords for a calm background." },
  { value: "flamenco", label: "Flamenco", description: "Spanish-style guitar plucks, rhythmic strums and light hand percussion." },
  { value: "classical", label: "Classical", description: "Gentle fingerpicked arpeggios with a flowing melody." },
  { value: "jazz", label: "Jazz", description: "Relaxed swing with mellow keys, walking bass and soft brushes." },
  { value: "country", label: "Country", description: "Bright picking, alternating bass and a steady country rhythm." },
] as const;
export type MusicStyle = typeof MUSIC_STYLES[number]["value"];
export type MusicChoice = MusicStyle | "custom";
export type MusicSettings = { music: boolean; musicStyle?: MusicChoice; musicVolume?: number; musicFile?: File };
export const DEFAULT_MUSIC_VOLUME = 35;

export function musicSettings(input: MusicSettings) {
  const style = input.musicStyle === "custom" || MUSIC_STYLES.some(style => style.value === input.musicStyle)
    ? input.musicStyle! : input.musicFile ? "custom" : "ambient";
  return {
    // Older drafts played an uploaded soundtrack independently of the music checkbox.
    music: input.musicStyle === undefined && input.musicFile ? true : input.music,
    musicStyle: style,
    musicVolume: typeof input.musicVolume === "number" && Number.isFinite(input.musicVolume)
      ? Math.min(100, Math.max(0, input.musicVolume)) : DEFAULT_MUSIC_VOLUME,
  };
}

type Instrument = "guitar" | "bright" | "keys" | "bass" | "pad" | "tap" | "brush";
type Note = { at: number; length: number; midi: number; instrument: Instrument; level: number };

// Short original arrangements, synthesized locally without songs, samples or external services.
export function musicScore(style: MusicStyle, duration: number): Note[] {
  const notes: Note[] = [];
  const bpm = { ambient: 72, flamenco: 112, classical: 84, jazz: 94, country: 108 }[style];
  const beat = 60 / bpm, beatsPerBar = style === "flamenco" ? 6 : 4, barLength = beat * beatsPerBar;
  const add = (at: number, midi: number, length: number, instrument: Instrument, level = 1) => {
    if (at < duration) notes.push({ at, midi, length: Math.min(length, duration - at), instrument, level });
  };
  const progressions: Record<MusicStyle, number[][]> = {
    ambient: [[48, 55, 64], [45, 52, 60], [41, 48, 57], [43, 50, 59]],
    flamenco: [[45, 52, 57, 60, 64], [43, 50, 55, 59, 62], [41, 48, 53, 57, 60], [40, 47, 52, 56, 59]],
    classical: [[40, 52, 55, 59, 64], [36, 48, 55, 60, 64], [43, 50, 55, 59, 62], [38, 50, 54, 57, 62]],
    jazz: [[36, 55, 58, 62, 65], [41, 57, 63, 67, 72], [34, 53, 57, 60, 62], [39, 55, 58, 62, 65]],
    country: [[43, 55, 59, 62, 67], [36, 55, 60, 64, 67], [38, 54, 57, 62, 66], [43, 55, 59, 62, 67]],
  };
  for (let bar = 0; bar * barLength < duration; bar++) {
    const start = bar * barLength, chord = progressions[style][bar % 4];
    if (style === "ambient") {
      chord.forEach(midi => add(start, midi, barLength + .4, "pad", .4));
      add(start + beat * 2, chord[2] + 12, beat * 1.8, "keys", .28);
    } else if (style === "flamenco") {
      add(start, chord[0], beat * 2, "guitar", 1.1);
      add(start + beat * 3, chord[0] + 7, beat * 1.5, "guitar", .9);
      [0, 1.5, 3, 4, 5].forEach((pulse, index) => chord.slice(1).forEach((midi, string) =>
        add(start + pulse * beat + string * .018, midi, beat * .85, "guitar", index === 0 || index === 2 ? .48 : .32)));
      [0, 1, 2, 3, 4, 5].forEach(pulse => add(start + pulse * beat, 0, .09, "tap", pulse % 3 === 0 ? .28 : .12));
      [2.5, 4.5, 5.5].forEach((pulse, index) => add(start + pulse * beat, [chord[4] + 5, chord[4] + 1, chord[4]][index], beat * .5, "guitar", .65));
    } else if (style === "classical") {
      [0, 2, 3, 4, 1, 3, 2, 4].forEach((string, pulse) => add(start + pulse * beat / 2, chord[string], beat * 1.8, "guitar", string === 0 ? 1 : .75));
      [0, 1.5, 3].forEach((pulse, index) => add(start + pulse * beat, chord[4] + [0, 2, 0][index], beat * 1.2, "guitar", .5));
    } else if (style === "jazz") {
      [0, 4, 7, 9].forEach((interval, pulse) => add(start + pulse * beat, chord[0] + interval, beat * .8, "bass", .8));
      [.66, 2, 3.66].forEach(pulse => chord.slice(1).forEach(midi => add(start + pulse * beat, midi, beat * 1.1, "keys", .35)));
      [0, .66, 1, 1.66, 2, 2.66, 3, 3.66].forEach(pulse => add(start + pulse * beat, 0, .12, "brush", Number.isInteger(pulse) ? .13 : .07));
      add(start + beat, chord[3] + 12, beat * .6, "keys", .42);
      add(start + beat * 2.66, chord[2] + 12, beat, "keys", .4);
    } else {
      [0, 2].forEach((pulse, index) => add(start + pulse * beat, chord[0] + index * 7, beat * .9, "bass", .8));
      [1, 3].forEach(pulse => chord.slice(1).forEach((midi, string) => add(start + pulse * beat + string * .015, midi, beat * .5, "bright", .3)));
      [2, 4, 3, 2, 1, 3, 4, 3].forEach((string, pulse) => add(start + pulse * beat / 2, chord[string] + (bar % 2 ? 0 : 12), beat * .7, "bright", .5));
      [0, .5, 1, 1.5, 2, 2.5, 3, 3.5].forEach(pulse => add(start + pulse * beat, 0, .075, "brush", Number.isInteger(pulse) ? .08 : .04));
    }
  }
  return notes;
}

export function musicSamples(style: MusicStyle, duration: number, sampleRate = 22050): Float32Array {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 180) throw new Error("Choose a reel length between 1 and 180 seconds.");
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000) throw new Error("Unsupported audio sample rate.");
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  for (const [index, note] of musicScore(style, duration).entries()) {
    const offset = Math.round(note.at * sampleRate), length = Math.min(Math.ceil(note.length * sampleRate), samples.length - offset);
    const frequency = 440 * 2 ** ((note.midi - 69) / 12);
    let seed = (index + 1) * 7919, priorNoise = 0;
    const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 2147483648 - 1; };
    // A damped vibrating string provides a plucked timbre instead of a plain tone.
    const string = new Float32Array(Math.max(2, Math.round(sampleRate / frequency)));
    if (note.instrument === "guitar" || note.instrument === "bright") {
      for (let i = 0; i < string.length; i++) { priorNoise = priorNoise * .3 + noise() * .7; string[i] = priorNoise; }
      const mean = string.reduce((sum, value) => sum + value, 0) / string.length;
      for (let i = 0; i < string.length; i++) string[i] -= mean;
    }
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate, endFade = Math.min(1, (length - 1 - i) / (sampleRate * .06));
      const phase = 2 * Math.PI * frequency * t;
      let value = 0;
      if (note.instrument === "guitar" || note.instrument === "bright") {
        const position = i % string.length;
        value = string[position];
        const damping = note.instrument === "bright" ? .995 : .997;
        string[position] = damping * (string[position] + string[(position + 1) % string.length]) * .5;
        value *= 1.6 * Math.min(1, t / .003);
      } else if (note.instrument === "keys") {
        value = (Math.sin(phase) + .3 * Math.sin(phase * 2) * Math.exp(-t * 4) + .14 * Math.sin(phase * 3) * Math.exp(-t * 7)) * Math.exp(-t * 2) * Math.min(1, t / .008) * .28;
      } else if (note.instrument === "bass") {
        value = (Math.sin(phase) + .18 * Math.sin(phase * 2)) * Math.exp(-t * 3) * Math.min(1, t / .012) * .32;
      } else if (note.instrument === "pad") {
        value = (Math.sin(phase) + .12 * Math.sin(phase * 2.003)) * Math.sin(Math.PI * i / length) * .2;
      } else if (note.instrument === "tap") {
        value = (noise() * .45 + Math.sin(2 * Math.PI * 180 * t) * .55) * Math.exp(-t * 55) * .3;
      } else {
        const currentNoise = noise(); value = (currentNoise - priorNoise) * Math.exp(-t * 38) * .2; priorNoise = currentNoise;
      }
      samples[offset + i] += value * note.level * Math.max(0, endFade);
    }
  }
  let peak = 0, energy = 0;
  for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; }
  const scale = Math.min(.8 / (peak || 1), .14 / (Math.sqrt(energy / samples.length) || 1));
  const fadeIn = Math.min(.08, duration / 4) * sampleRate, fadeOut = Math.min(.7, duration / 4) * sampleRate;
  for (let i = 0; i < samples.length; i++) samples[i] *= scale * Math.min(1, i / fadeIn, (samples.length - 1 - i) / fadeOut);
  return samples;
}

export async function prepareMusic(context: AudioContext, destination: AudioNode, settings: MusicSettings, duration: number, signal?: AbortSignal): Promise<() => () => void> {
  const selected = musicSettings(settings);
  if (!selected.music || selected.musicVolume === 0 || signal?.aborted) return () => () => {};
  let buffer: AudioBuffer;
  if (selected.musicStyle === "custom") {
    if (!settings.musicFile) throw new Error("Choose your music file, or select a built-in music style.");
    buffer = await context.decodeAudioData(await settings.musicFile.arrayBuffer());
  } else {
    const samples = musicSamples(selected.musicStyle, duration);
    buffer = context.createBuffer(1, samples.length, 22050); buffer.getChannelData(0).set(samples);
  }
  return () => {
  if (signal?.aborted || context.state === "closed") return () => {};
  const source = context.createBufferSource(), volume = context.createGain(), start = context.currentTime;
  source.buffer = buffer; source.loop = selected.musicStyle === "custom";
  source.connect(volume).connect(destination);
  const level = selected.musicVolume / 100;
  volume.gain.setValueAtTime(0, start); volume.gain.linearRampToValueAtTime(level, start + .03);
  volume.gain.setValueAtTime(level, start + Math.max(.03, duration - .5)); volume.gain.linearRampToValueAtTime(0, start + duration);
  let stopped = false;
  const stop = () => {
    if (stopped) return; stopped = true;
    signal?.removeEventListener("abort", stop);
    try { source.stop(); } catch {} source.disconnect(); volume.disconnect();
  };
  source.onended = stop; signal?.addEventListener("abort", stop, { once: true });
  source.start(start); source.stop(start + duration);
  return stop;
  };
}

export async function startMusic(context: AudioContext, destination: AudioNode, settings: MusicSettings, duration: number, signal?: AbortSignal): Promise<() => void> {
  return (await prepareMusic(context, destination, settings, duration, signal))();
}
