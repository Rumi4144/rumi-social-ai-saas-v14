"use client";
import {useState} from 'react';
import {useRouter} from 'next/navigation';

export default function PhotoReviewNotice({campaignId, contentItemId, assetId, issues}: {campaignId: string; contentItemId: string; assetId: string; issues: string[]}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function select() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/creative/select-photo', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({campaignId, contentItemId, assetId})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not select photo.');
      setMessage('Photo selected. Update the branded creative, then review and approve this post.');
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not select photo.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Photo needs your review" style={{padding: 16, marginBottom: 20, border: '1px solid #a56b21', borderRadius: 12, background: '#fff6e5', color: '#342a1b'}}>
    <h3>Photo needs your review</h3>
    <p>This photo was saved for you to inspect. It has not been selected automatically.</p>
    <ul>{issues.slice(0, 4).map((issue, index) => <li key={index}>{issue}</li>)}</ul>
    <img src={`/api/reels/media?assetId=${encodeURIComponent(assetId)}&campaignId=${encodeURIComponent(campaignId)}`} alt="Generated photo awaiting your review" style={{width: '100%', maxWidth: 300, maxHeight: 380, objectFit: 'contain', display: 'block', marginBottom: 12}} />
    <button type="button" disabled={busy} onClick={select}>{busy ? 'Selecting…' : 'Use this photo after review'}</button>
    <p>You can also choose a different photo below. Original images remain in your photo library.</p>
    {message && <p role="status">{message}</p>}
  </section>;
}
