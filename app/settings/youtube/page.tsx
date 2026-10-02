import { tenantContext } from "@/lib/auth/context";
export default async function YouTubeConsent() {
  await tenantContext();
  return <div className="card">
    <h1>Connect your YouTube channel</h1>
    <p>Rumi Social AI uses YouTube API Services to identify your channel and upload videos you select and approve. You can disconnect and delete the stored YouTube data in Settings.</p>
    <form action="/api/social/youtube/connect" method="POST">
      <label><input type="checkbox" name="consent" value="yes" required /> I agree to the <a href="/privacy" target="_blank">Privacy Policy</a> and <a href="/terms" target="_blank">Terms of Service</a>, including the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>.</label>
      <p><button type="submit">Continue to Google</button></p>
    </form>
  </div>;
}
