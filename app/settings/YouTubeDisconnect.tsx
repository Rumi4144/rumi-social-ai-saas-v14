"use client";
export default function YouTubeDisconnect({ connectionId }: { connectionId: string }) {
  return <form action="/api/social/youtube/disconnect" method="POST" onSubmit={event => {
    if (!confirm("Disconnect YouTube and permanently delete its stored channel information, credentials and upload history from Rumi Social AI? Videos already on YouTube will remain on YouTube.")) event.preventDefault();
    else { try { sessionStorage.removeItem(`rumi-youtube-upload:${connectionId}`); } catch {} }
  }}>
    <input type="hidden" name="confirm" value="yes" />
    <button type="submit">Disconnect YouTube and delete data</button>
  </form>;
}
