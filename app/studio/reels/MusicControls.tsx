"use client";
import { useEffect, useRef, useState } from "react";
import { MUSIC_STYLES, startMusic, type MusicChoice } from "@/lib/reels/music";
import styles from "./ReelEditor.module.css";

export default function MusicControls({ music, musicStyle, musicVolume, musicFile, disabled, onMusic, onStyle, onVolume, onFile }: {
  music: boolean; musicStyle: MusicChoice; musicVolume: number; musicFile?: File; disabled: boolean;
  onMusic: (value: boolean) => void; onStyle: (value: MusicChoice) => void; onVolume: (value: number) => void; onFile: (value?: File) => void;
}) {
  const [listening, setListening] = useState(false), [message, setMessage] = useState("");
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
    <label><input type="checkbox" checked={music} onChange={event => onMusic(event.target.checked)} /> Add background music</label>
    {music && <>
      <label>Music style<select value={musicStyle} onChange={event => onStyle(event.target.value as MusicChoice)}>
        {MUSIC_STYLES.map(style => <option key={style.value} value={style.value}>{style.label}</option>)}
        <option value="custom">Upload my music</option>
      </select></label>
      <p className={styles.hint}>{MUSIC_STYLES.find(style => style.value === musicStyle)?.description || "Use your own music file as the soundtrack."}</p>
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
      <p className={styles.hint}>Listen to a 12-second sample. Built-in styles are original instrumental backgrounds. Your selected music is included when you export.</p>
    </>}
    {message && <p role="status">{message}</p>}
  </div>;
}
