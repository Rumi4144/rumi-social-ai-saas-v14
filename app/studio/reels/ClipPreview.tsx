"use client";
import {useState} from 'react';

export default function ClipPreview({src, label}: {src: string; label: string}) {
  const [failed, setFailed] = useState(false);
  return <div>
    <video src={src} controls muted playsInline preload="metadata" aria-label={label}
      onLoadStart={()=>setFailed(false)} onError={()=>setFailed(true)}
      onLoadedMetadata={event=>{
        // Safari may show an empty box until the video is played or seeks to a frame.
        const video = event.currentTarget;
        if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2);
      }}/>
    {failed ? <p role="status">Video preview could not load. <a href={src} target="_blank" rel="noreferrer">Open saved video</a></p> : <p>Press play to preview this clip.</p>}
  </div>;
}
