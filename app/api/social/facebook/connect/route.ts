import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { createFacebookOAuthState } from "@/lib/social/oauth-state";

export async function GET() {
  try {
    const ctx = await tenantContext();

    const appId = process.env.FACEBOOK_APP_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!appId) {
      return NextResponse.json(
        { error: "FACEBOOK_APP_ID_MISSING" },
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
      `${appUrl}/api/social/facebook/callback`;

    const state = createFacebookOAuthState({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "business_management",
      ].join(","),
      state,
    });

    return NextResponse.redirect(
      `https://www.facebook.com/dialog/oauth?${params.toString()}`
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "FACEBOOK_CONNECT_FAILED",
      },
      { status: 500 }
    );
  }
}
