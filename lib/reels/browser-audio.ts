// Embedded browsers can leave resume() pending when audio is blocked. Stop
// before any paid request, and let the user pause instead of waiting forever.
export async function resumeReelAudio(audio: AudioContext, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const abort = () => finish(new Error("Reel preparation paused."));
    const timer = setTimeout(() => finish(new Error("Your browser could not start reel audio. Open Rumi Social AI directly in Chrome or Safari, then try Finish reel again.")), 8000);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error); else resolve();
    };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    try { audio.resume().then(() => finish(), () => finish(new Error("Your browser blocked reel audio. Open Rumi Social AI directly in Chrome or Safari, then try again."))); }
    catch { finish(new Error("Your browser could not start reel audio. Try again in Chrome or Safari.")); }
  });
}
