import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { createInstagramOAuthState } from "@/lib/social/oauth-state";

export async function GET() {
  try {
    const ctx = await tenantContext();

    const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!appId) {
      return NextResponse.json(
        { error: "INSTAGRAM_APP_ID_MISSING" },
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
      "https://rumi-social-ai-saas-v14.vercel.app/api/social/instagram/callback";

    const state = createInstagramOAuthState({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "instagram_business_basic",
        "instagram_business_content_publish",
      ].join(","),
      state,
    });

    return NextResponse.redirect(
      `https://www.instagram.com/oauth/authorize?${params.toString()}`
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "INSTAGRAM_CONNECT_FAILED",
      },
      { status: 500 }
    );
  }
}
