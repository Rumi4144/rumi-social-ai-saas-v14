export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "60px 24px", lineHeight: 1.7 }}>
      <h1>Rumi Social AI Privacy Policy</h1>
      <p><strong>Effective date:</strong> October 2, 2026</p>

      <p>
        This Privacy Policy explains how Rumi Social AI handles information when
        users create accounts, create content, and connect third-party social
        media and business services.
      </p>

      <h2>1. Information We Process</h2>
      <p>
        We may process account information, workspace and organization
        information, content created or uploaded by users, publishing
        information, usage information, and information made available by
        third-party services that users explicitly connect.
      </p>

      <h2>2. Social Media Connections</h2>
      <p>
        When you connect services such as Instagram, YouTube, TikTok, Facebook,
        or other supported platforms, Rumi Social AI receives authorization
        credentials and account information necessary to provide the requested
        integration.
      </p>

      <h2>3. How We Use Information</h2>
      <p>
        Information is used to provide the service, identify connected accounts,
        create and organize content, publish or schedule content at the user's
        direction, maintain account security, troubleshoot problems, and improve
        the service.
      </p>

      <h2>4. Authorization Credentials</h2>
      <p>
        Third-party authorization credentials are used only to provide requested
        integrations. Where supported by the service, authorization tokens are
        stored in encrypted form.
      </p>

      <h2>5. TikTok Data</h2>
      <p>
        When a user connects TikTok, Rumi Social AI may process TikTok account
        information and authorization credentials permitted by the scopes the
        user approves. TikTok information is used to identify the connected
        account and to support user-requested content publishing or upload
        functionality.
      </p>

      <h2>6. YouTube API Services and Data</h2>
      <p>
        Rumi Social AI uses YouTube API Services. When you authorize YouTube,
        we receive your channel ID and channel name and store encrypted access
        and refresh tokens. We use these to identify the channel you authorized
        and upload videos only when you select a file, review its metadata and
        visibility, and confirm the upload. We do not collect your Google password.
      </p>
      <p>
        We send your selected video, title, description, visibility and content
        declarations to Google/YouTube. Video chunks pass through our hosting
        service to YouTube; the uploader does not save a copy of your video file
        in our database. We store upload metadata and the returned video ID,
        visibility and processing status in your workspace for up to 30 days.
        Workspace members authorized by you can view that upload history.
        We do not use YouTube API data to train AI models or sell it to advertisers.
      </p>
      <p>
        Google handles information under the <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.
        Our hosting and database providers process information as necessary to
        operate the integration. We use session cookies to sign you in and
        browser session storage to resume an upload; this stores file metadata
        and upload details, not your Google password or authorization tokens.
      </p>
      <p>
        In Settings, choose “Disconnect YouTube and delete data” to revoke access
        and immediately delete the connected channel information, stored tokens
        and upload history from Rumi Social AI. This does not delete videos
        already uploaded to YouTube. Manage those videos in YouTube Studio.
        You can also revoke access through <a href="https://security.google.com/settings/security/permissions">Google security settings</a>.
        We periodically check authorization and delete stored YouTube data when
        Google reports that the authorization is invalid. You can contact
        <a href="mailto:rumi@rumiguitars.com">rumi@rumiguitars.com</a> for privacy
        questions or deletion requests.
      </p>

      <h2>7. Sharing of Information</h2>
      <p>
        We do not sell users' personal information. Information may be
        transmitted to connected third-party services when necessary to perform
        actions requested by the user.
      </p>

      <p>
        When you request AI video generation, we send your selected image and
        motion prompt to Runway. We retain the prompt, generation status and
        completed video in your workspace. Completed videos are stored in
        private Vercel Blob storage and require workspace access to view or
        download. You can contact rumi@rumiguitars.com to request deletion.
      </p>

      <h2>8. Data Retention and Account Disconnection</h2>
      <p>
        Information is retained as reasonably necessary to provide the service,
        maintain security, comply with applicable obligations, and resolve
        technical issues. Users may revoke access through the applicable
        third-party service. Rumi Social AI may also provide connection
        management or disconnection controls.
      </p>

      <h2>9. Security</h2>
      <p>
        We use reasonable technical and organizational safeguards designed to
        protect account and authorization information. No online service can
        guarantee absolute security.
      </p>

      <h2>10. Third-Party Services</h2>
      <p>
        Third-party platforms maintain their own privacy policies and practices.
        Rumi Social AI does not control those independent services.
      </p>

      <h2>11. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy as the service, integrations, or
        applicable requirements change.
      </p>

      <h2>12. Contact</h2>
      <p>
        Privacy questions or deletion requests may be sent to
        <a href="mailto:rumi@rumiguitars.com">rumi@rumiguitars.com</a>.
      </p>
    </main>
  );
}
