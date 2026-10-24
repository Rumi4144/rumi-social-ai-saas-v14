"use client";
import {useState} from "react";
import styles from "./gallery.module.css";

export const PRESENTER_NAMES = ["Alex", "Morgan", "Jamie", "Taylor", "Jordan", "Casey", "Avery", "Riley", "Cameron", "Quinn", "Skyler", "Reese", "Rowan", "Parker", "Sage", "Drew", "Charlie", "Finley", "Emerson", "Blair", "Dakota", "Robin", "Hayden", "Remy"] as const;

export default function PresenterGallery({disabled,selected,onChoose}:{disabled?:boolean;selected:number|null;onChoose:(file:File,index:number)=>Promise<boolean|void>}) {
  const [loading,setLoading]=useState(false),[error,setError]=useState("");
  async function choose(index:number) {
    if (disabled || loading) return;
    setLoading(true);setError("");
    try {
      const image=new Image();image.src=index===24?"/presenters/flamenco-presenter.svg":"/presenters/presenter-contact-sheet.svg";await image.decode();
      const canvas=document.createElement("canvas");canvas.width=768;canvas.height=index===24?1152:672;
      const context=canvas.getContext("2d");if(!context)throw new Error("Could not load this presenter photo.");
      if(index===24)context.drawImage(image,0,0,image.naturalWidth,image.naturalHeight,0,0,canvas.width,canvas.height);
      else {const width=image.naturalWidth/6,height=image.naturalHeight/4;context.drawImage(image,(index%6)*width+3,Math.floor(index/6)*height+2,width-6,height*.86,0,0,canvas.width,canvas.height);}
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error("Could not prepare this presenter photo.")),"image/jpeg",.9));
      await onChoose(new File([blob],`${index===24?"Lucia":PRESENTER_NAMES[index]}-presenter.jpg`,{type:"image/jpeg"}),index);
    } catch {setError("Could not load this presenter. Please try again or upload a photo.");}
    finally {setLoading(false);}
  }
  return <fieldset className={styles.gallery} disabled={disabled||loading}>
    <legend>Choose an included presenter</legend>
    <p>25 fictional presenters, including Lucia. Selecting a presenter does not start a paid image or video generation. You can also upload your own photo below.</p>
    <div className={styles.portraits}>
      {PRESENTER_NAMES.map((name,index)=><button key={name} type="button" aria-label={`Select ${name}`} aria-pressed={selected===index} onClick={()=>choose(index)}><svg aria-hidden="true" viewBox={`${(index%6)*256+3} ${Math.floor(index/6)*256+2} 250 220`}><image href="/presenters/presenter-contact-sheet.svg" width="1536" height="1024"/></svg><span>{name}</span></button>)}
      <button type="button" aria-label="Select Lucia, flamenco guitarist" aria-pressed={selected===24} onClick={()=>choose(24)}><img alt="Fictional flamenco guitarist Lucia" src="/presenters/flamenco-presenter.svg"/><span>Lucia · Flamenco</span></button>
    </div>
    {loading&&<p role="status">Preparing your presenter photo…</p>}{error&&<p role="alert">{error}</p>}
  </fieldset>;
}
