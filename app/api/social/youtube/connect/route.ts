import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { createYouTubeOAuthState } from "@/lib/social/oauth-state";

export async function GET() {
  try {
    const ctx = await tenantContext();

    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!clientId) {
      return NextResponse.json(
        { error: "YOUTUBE_CLIENT_ID_MISSING" },
        { status: 500 }
      );
    }

    if (!appUrl) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_APP_URL_MISSING" },
        { status: 500 }
      );
    }

    const redirectUri =
      `${appUrl}/api/social/youtube/callback`;

    const state = createYouTubeOAuthState({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.upload",
      ].join(" "),
      state,
    });

    return NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "YOUTUBE_CONNECT_FAILED",
      },
      { status: 500 }
    );
  }
}
