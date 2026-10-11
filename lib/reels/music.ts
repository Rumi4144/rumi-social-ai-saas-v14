export const MUSIC_STYLES = [
  { value: "ambient", label: "Soft ambient", description: "Warm, slow chords for a calm background." },
  { value: "soft-acoustic", label: "Soft acoustic guitar", description: "Slow, mellow guitar-style picking with space between notes for a peaceful background." },
  { value: "flamenco", label: "Flamenco", description: "Spanish-style guitar plucks, rhythmic strums and light hand percussion." },
  { value: "classical", label: "Classical", description: "Gentle fingerpicked arpeggios with a flowing melody." },
  { value: "fingerpicking", label: "Fingerpicking guitar", description: "Gentle acoustic-style picking with alternating bass notes and a flowing melody." },
  { value: "jazz", label: "Jazz", description: "Relaxed swing with mellow keys, walking bass and soft brushes." },
  { value: "country", label: "Country", description: "Bright picking, alternating bass and a steady country rhythm." },
  { value: "blues", label: "Blues", description: "A laid-back guitar shuffle with warm bass and bluesy fills." },
  { value: "bossa", label: "Bossa nova", description: "Gentle syncopated guitar, rounded bass and light percussion." },
  { value: "folk", label: "Acoustic folk", description: "Warm fingerpicking in a lilting three-beat rhythm." },
  { value: "piano", label: "Soft piano", description: "Delicate piano chords and a slow, spacious melody." },
  { value: "pop", label: "Upbeat pop", description: "Bright keys, a pulsing bass and a cheerful drum beat." },
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

type Instrument = "guitar" | "soft-guitar" | "bright" | "keys" | "piano" | "bass" | "pad" | "kick" | "tap" | "brush";
type Note = { at: number; length: number; midi: number; instrument: Instrument; level: number };

// Short original arrangements, synthesized locally without songs, samples or external services.
export function musicScore(style: MusicStyle, duration: number): Note[] {
  const notes: Note[] = [];
  const bpm = { ambient: 72, "soft-acoustic": 64, flamenco: 112, classical: 84, fingerpicking: 78, jazz: 94, country: 108, blues: 88, bossa: 116, folk: 96, piano: 66, pop: 120 }[style];
  const beat = 60 / bpm, beatsPerBar = style === "flamenco" ? 6 : style === "folk" ? 3 : 4, barLength = beat * beatsPerBar;
  const add = (at: number, midi: number, length: number, instrument: Instrument, level = 1) => {
    if (at < duration) notes.push({ at, midi, length: Math.min(length, duration - at), instrument, level });
  };
  const progressions: Record<MusicStyle, number[][]> = {
    ambient: [[48, 55, 64], [45, 52, 60], [41, 48, 57], [43, 50, 59]],
    "soft-acoustic": [[43, 50, 55, 59, 62], [40, 47, 52, 55, 59], [48, 55, 60, 64, 67], [38, 45, 50, 54, 57]],
    flamenco: [[45, 52, 57, 60, 64], [43, 50, 55, 59, 62], [41, 48, 53, 57, 60], [40, 47, 52, 56, 59]],
    classical: [[40, 52, 55, 59, 64], [36, 48, 55, 60, 64], [43, 50, 55, 59, 62], [38, 50, 54, 57, 62]],
    fingerpicking: [[38, 45, 50, 54, 57, 64], [43, 50, 55, 59, 62, 67], [47, 54, 59, 62, 66, 69], [45, 52, 57, 61, 64, 69]],
    jazz: [[36, 55, 58, 62, 65], [41, 57, 63, 67, 72], [34, 53, 57, 60, 62], [39, 55, 58, 62, 65]],
    country: [[43, 55, 59, 62, 67], [36, 55, 60, 64, 67], [38, 54, 57, 62, 66], [43, 55, 59, 62, 67]],
    blues: [
      [40, 52, 56, 59, 62], [40, 52, 56, 59, 62], [40, 52, 56, 59, 62], [40, 52, 56, 59, 62],
      [45, 52, 57, 61, 67], [45, 52, 57, 61, 67], [40, 52, 56, 59, 62], [40, 52, 56, 59, 62],
      [47, 54, 57, 63, 66], [45, 52, 57, 61, 67], [40, 52, 56, 59, 62], [47, 54, 57, 63, 66],
    ],
    bossa: [[38, 53, 57, 60, 64], [43, 53, 59, 62, 69], [36, 52, 55, 59, 62], [45, 55, 61, 64, 67]],
    folk: [[48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [41, 53, 57, 60, 65], [43, 55, 59, 62, 67]],
    piano: [[48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62]],
    pop: [[48, 60, 64, 67, 72], [43, 59, 62, 67, 71], [45, 57, 60, 64, 69], [41, 57, 60, 65, 69]],
  };
  for (let bar = 0; bar * barLength < duration; bar++) {
    const progression = progressions[style];
    const start = bar * barLength, chord = progression[bar % progression.length];
    if (style === "ambient") {
      chord.forEach(midi => add(start, midi, barLength + .4, "pad", .4));
      add(start + beat * 2, chord[2] + 12, beat * 1.8, "keys", .28);
    } else if (style === "soft-acoustic") {
      [0, 2].forEach((pulse, index) => add(start + pulse * beat, chord[index], beat * 2.5, "soft-guitar", .7));
      [2, 3, 4, 3].forEach((string, index) => add(start + (index + .5) * beat, chord[string], beat * 2.2, "soft-guitar", .55));
      add(start + beat * 3, chord[4], beat * 1.8, "soft-guitar", .4);
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
    } else if (style === "fingerpicking") {
      // Thumb notes alternate beneath separately picked upper strings, with occasional pinched pairs.
      [0, 1, 0, 1].forEach((string, pulse) => add(start + pulse * beat, chord[string], beat * 1.5, "guitar", .9));
      (bar % 2 ? [3, 5, 4, 2] : [4, 3, 5, 3]).forEach((string, pulse) =>
        add(start + (pulse + .5) * beat, chord[string], beat * 1.8, "guitar", .72));
      [0, 2].forEach((pulse, index) => add(start + pulse * beat + .012, chord[index ? 4 : 5], beat * 1.9, "guitar", .55));
      if (bar % 2) add(start + beat * 3.75, chord[4], beat * .65, "guitar", .4);
    } else if (style === "jazz") {
      [0, 4, 7, 9].forEach((interval, pulse) => add(start + pulse * beat, chord[0] + interval, beat * .8, "bass", .8));
      [.66, 2, 3.66].forEach(pulse => chord.slice(1).forEach(midi => add(start + pulse * beat, midi, beat * 1.1, "keys", .35)));
      [0, .66, 1, 1.66, 2, 2.66, 3, 3.66].forEach(pulse => add(start + pulse * beat, 0, .12, "brush", Number.isInteger(pulse) ? .13 : .07));
      add(start + beat, chord[3] + 12, beat * .6, "keys", .42);
      add(start + beat * 2.66, chord[2] + 12, beat, "keys", .4);
    } else if (style === "country") {
      [0, 2].forEach((pulse, index) => add(start + pulse * beat, chord[0] + index * 7, beat * .9, "bass", .8));
      [1, 3].forEach(pulse => chord.slice(1).forEach((midi, string) => add(start + pulse * beat + string * .015, midi, beat * .5, "bright", .3)));
      [2, 4, 3, 2, 1, 3, 4, 3].forEach((string, pulse) => add(start + pulse * beat / 2, chord[string] + (bar % 2 ? 0 : 12), beat * .7, "bright", .5));
      [0, .5, 1, 1.5, 2, 2.5, 3, 3.5].forEach(pulse => add(start + pulse * beat, 0, .075, "brush", Number.isInteger(pulse) ? .08 : .04));
    } else if (style === "blues") {
      [0, 7, 9, 7].forEach((interval, pulse) => {
        add(start + pulse * beat, chord[0] + interval, beat * .85, "bass", .85);
        add(start + (pulse + 2 / 3) * beat, chord[0] + interval + 12, beat * .3, "guitar", .5);
      });
      [1, 3].forEach(pulse => chord.slice(1).forEach((midi, string) => add(start + pulse * beat + string * .015, midi, beat * .6, "guitar", .3)));
      [0, 1, 2, 3].forEach(pulse => add(start + pulse * beat, 0, .13, "brush", .13));
      [0, 3, 5, 6, 7, 3].forEach((interval, index) => add(start + [0, 2 / 3, 1, 5 / 3, 2.5, 3 + 2 / 3][index] * beat, chord[0] + 24 + interval, beat * .55, "bright", .45));
    } else if (style === "bossa") {
      [0, 1.5, 2, 3.5].forEach((pulse, index) => add(start + pulse * beat, chord[0] + (index % 2 ? 7 : 0), beat * .65, "bass", .7));
      [0, .75, 1.5, 2.5, 3.25].forEach(pulse => chord.slice(1).forEach((midi, string) => add(start + pulse * beat + string * .01, midi, beat * .75, "guitar", .5)));
      [1, 2.5, 3].forEach(pulse => add(start + pulse * beat, 0, .07, "tap", .1));
      [0, .5, 1, 1.5, 2, 2.5, 3, 3.5].forEach(pulse => add(start + pulse * beat, 0, .09, "brush", .07));
    } else if (style === "folk") {
      [0, 2, 3, 1, 4, 2].forEach((string, pulse) => add(start + pulse * beat / 2, chord[string], beat * 1.7, "guitar", string === 0 ? 1.1 : .75));
      [1, 2].forEach(pulse => chord.slice(1, 4).forEach((midi, string) => add(start + pulse * beat + string * .025, midi, beat * .9, "guitar", .24)));
      add(start + beat * 2.5, chord[4], beat * 1.1, "bright", .35);
    } else if (style === "piano") {
      add(start, chord[0] - 12, beat * 3.5, "piano", .65);
      [0, 2].forEach(pulse => chord.slice(1, 4).forEach((midi, key) => add(start + pulse * beat + key * .035, midi, beat * 2.5, "piano", .38)));
      [4, 3, 2, 4].forEach((key, index) => add(start + [0, 1.5, 2.5, 3.5][index] * beat, chord[key] + 12, beat * 1.4, "piano", .65));
    } else if (style === "pop") {
      [0, 1, 2, 3].forEach(pulse => {
        add(start + pulse * beat, 0, .22, "kick", .7);
        add(start + pulse * beat, chord[0] - 12, beat * .75, "bass", .75);
        chord.slice(1, 4).forEach(midi => add(start + (pulse + .5) * beat, midi, beat * .45, "keys", .4));
      });
      [1, 3].forEach(pulse => add(start + pulse * beat, 0, .12, "tap", .6));
      [0, .5, 1, 1.5, 2, 2.5, 3, 3.5].forEach(pulse => add(start + pulse * beat, 0, .07, "brush", .13));
      [4, 3, 4, 2, 3, 4].forEach((key, index) => add(start + [0, .5, 1.5, 2, 2.5, 3.5][index] * beat, chord[key], beat * .6, "bright", .55));
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
    const plucked = note.instrument === "guitar" || note.instrument === "bright" || note.instrument === "soft-guitar";
    let seed = (index + 1) * 7919, priorNoise = 0;
    const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 2147483648 - 1; };
    // A damped vibrating string provides a plucked timbre instead of a plain tone.
    const string = new Float32Array(Math.max(2, Math.round(sampleRate / frequency)));
    if (plucked) {
      const smoothing = note.instrument === "soft-guitar" ? .75 : .3;
      for (let i = 0; i < string.length; i++) { priorNoise = priorNoise * smoothing + noise() * (1 - smoothing); string[i] = priorNoise; }
      const mean = string.reduce((sum, value) => sum + value, 0) / string.length;
      for (let i = 0; i < string.length; i++) string[i] -= mean;
    }
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate, endFade = Math.min(1, (length - 1 - i) / (sampleRate * .06));
      const phase = 2 * Math.PI * frequency * t;
      let value = 0;
      if (plucked) {
        const position = i % string.length;
        value = string[position];
        const damping = note.instrument === "bright" ? .995 : .997;
        string[position] = damping * (string[position] + string[(position + 1) % string.length]) * .5;
        value *= 1.6 * Math.min(1, t / (note.instrument === "soft-guitar" ? .018 : .003));
      } else if (note.instrument === "keys") {
        value = (Math.sin(phase) + .3 * Math.sin(phase * 2) * Math.exp(-t * 4) + .14 * Math.sin(phase * 3) * Math.exp(-t * 7)) * Math.exp(-t * 2) * Math.min(1, t / .008) * .28;
      } else if (note.instrument === "piano") {
        value = (Math.sin(phase) * Math.exp(-t * 1.3) + .45 * Math.sin(phase * 2.001) * Math.exp(-t * 2.2) + .2 * Math.sin(phase * 3.004) * Math.exp(-t * 3.5) + .08 * Math.sin(phase * 4.008) * Math.exp(-t * 5)) * Math.min(1, t / .004) * .3;
      } else if (note.instrument === "bass") {
        value = (Math.sin(phase) + .18 * Math.sin(phase * 2)) * Math.exp(-t * 3) * Math.min(1, t / .012) * .32;
      } else if (note.instrument === "pad") {
        value = (Math.sin(phase) + .12 * Math.sin(phase * 2.003)) * Math.sin(Math.PI * i / length) * .2;
      } else if (note.instrument === "kick") {
        value = Math.sin(2 * Math.PI * (48 * t + 4 * (1 - Math.exp(-t * 25)))) * Math.exp(-t * 20) * Math.min(1, t / .002) * .5;
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
  const targetLevel = style === "soft-acoustic" ? .09 : .14;
  const scale = Math.min(.8 / (peak || 1), targetLevel / (Math.sqrt(energy / samples.length) || 1));
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
