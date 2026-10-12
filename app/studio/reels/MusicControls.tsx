"use client";
import { useEffect, useRef, useState } from "react";
import { MUSIC_STYLES, recordedMusic, isNatureSound, startMusic, type MusicChoice } from "@/lib/reels/music";
import styles from "./ReelEditor.module.css";

export default function MusicControls({ music, musicStyle, musicVolume, musicFile, disabled, onMusic, onStyle, onVolume, onFile }: {
  music: boolean; musicStyle: MusicChoice; musicVolume: number; musicFile?: File; disabled: boolean;
  onMusic: (value: boolean) => void; onStyle: (value: MusicChoice) => void; onVolume: (value: number) => void; onFile: (value?: File) => void;
}) {
  const [listening, setListening] = useState(false), [message, setMessage] = useState("");
  const recording = recordedMusic(musicStyle);
  const playback = useRef<{ controller: AbortController; context: AudioContext; timer?: ReturnType<typeof setTimeout> } | undefined>(undefined);
  function stop() {
    const active = playback.current; playback.current = undefined;
    if (active) { active.controller.abort(); clearTimeout(active.timer); void active.context.close().catch(() => {}); }
    setListening(false);
  }
  useEffect(() => { stop(); setMessage(""); }, [music, musicStyle, musicVolume, musicFile, disabled]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("visibilitychange", hidden); stop(); };
  }, []);
  async function listen() {
    if (playback.current) { stop(); return; }
    setMessage("");
    try {
      const active = { controller: new AbortController(), context: new AudioContext(), timer: undefined as ReturnType<typeof setTimeout> | undefined };
      playback.current = active; setListening(true);
      await active.context.resume();
      if (active.controller.signal.aborted) return;
      await startMusic(active.context, active.context.destination, { music, musicStyle, musicVolume, musicFile }, 12, active.controller.signal);
      if (playback.current === active) active.timer = setTimeout(stop, 12000);
    } catch (error) { stop(); setMessage(error instanceof Error ? error.message : "Could not play this music. Choose another style or file."); }
  }
  return <div>
    <label><input type="checkbox" checked={music} onChange={event => onMusic(event.target.checked)} /> Add background music or nature sounds</label>
    {music && <>
      <label>Music style<select value={musicStyle} onChange={event => onStyle(event.target.value as MusicChoice)}>
        <optgroup label="Nature sounds for hypnosis">{MUSIC_STYLES.filter(style => isNatureSound(style.value)).map(style => <option key={style.value} value={style.value}>{style.label}</option>)}</optgroup>
        <optgroup label="Recorded music">{MUSIC_STYLES.filter(style => recordedMusic(style.value) && !isNatureSound(style.value)).map(style => <option key={style.value} value={style.value}>{style.label}</option>)}</optgroup>
        <optgroup label="Generated instrumental styles">{MUSIC_STYLES.filter(style => !recordedMusic(style.value)).map(style => <option key={style.value} value={style.value}>{style.label}</option>)}</optgroup>
        <option value="custom">Upload my music</option>
      </select></label>
      <p className={styles.hint}>{MUSIC_STYLES.find(style => style.value === musicStyle)?.description || "Use your own music file as the soundtrack."}</p>
      {isNatureSound(musicStyle) && <p className={styles.hint}>For spoken hypnosis, start around 10–20% volume and preview it beneath your narration.</p>}
      {musicStyle === "custom" && <>
        <label>Your music<input type="file" accept="audio/*" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (!file) return;
          if (file.size > 20_000_000) { setMessage("Choose an audio file under 20 MB."); return; }
          setMessage(""); onFile(file);
        }} /></label>
        {musicFile && <><p>{musicFile.name}</p><button type="button" onClick={() => onFile(undefined)}>Remove music</button></>}
      </>}
      <label>Music volume: {musicVolume}%<input type="range" min="0" max="100" step="5" value={musicVolume} onChange={event => onVolume(Number(event.target.value))} /></label>
      <button type="button" disabled={disabled || musicVolume === 0 || (musicStyle === "custom" && !musicFile)} onClick={listen}>{listening ? "Stop music preview" : "Listen to music"}</button>
      <p className={styles.hint}>Listen to a 12-second sample. Your selected music is included when you export.</p>
      {recording && <p className={styles.hint}>{recording.title} · {recording.artist}. <a href={recording.source} target="_blank" rel="noopener noreferrer">Recording and source</a> · Public domain; attribution is optional.</p>}
    </>}
    {message && <p role="status">{message}</p>}
  </div>;
}
