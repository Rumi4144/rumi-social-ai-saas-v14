import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { createTikTokOAuthState } from "@/lib/social/oauth-state";

export async function GET() {
  try {
    const ctx = await tenantContext();

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!clientKey) {
      return NextResponse.json(
        { error: "TIKTOK_CLIENT_KEY_MISSING" },
        { status: 500 }
      );
    }

    if (!appUrl) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_APP_URL_MISSING" },
        { status: 500 }
      );
    }

    // Must exactly match the URI registered in TikTok Sandbox.
    const redirectUri =
      `${appUrl}/api/social/tiktok/callback/`;

    const state = createTikTokOAuthState({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    const params = new URLSearchParams({
      client_key: clientKey,
      response_type: "code",
      scope: "user.info.basic",
      redirect_uri: redirectUri,
      state,
    });

    return NextResponse.redirect(
      `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "TIKTOK_CONNECT_FAILED",
      },
      { status: 500 }
    );
  }
}
