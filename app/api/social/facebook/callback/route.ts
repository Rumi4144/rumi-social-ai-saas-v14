import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/security/crypto";
import { verifyFacebookOAuthState } from "@/lib/social/oauth-state";

export async function GET(req: Request) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://rumi-social-ai-saas-v14.vercel.app";

  try {
    const url = new URL(req.url);

    const code = url.searchParams.get("code");
    const stateValue = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError) {
      return NextResponse.redirect(
        `${appUrl}/settings?facebook=cancelled`
      );
    }

    if (!code || !stateValue) {
      throw new Error("FACEBOOK_OAUTH_RESPONSE_INVALID");
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    if (!appId) throw new Error("FACEBOOK_APP_ID_MISSING");
    if (!appSecret) throw new Error("FACEBOOK_APP_SECRET_MISSING");

    const state = verifyFacebookOAuthState(stateValue);

    // Confirm the OAuth state belongs to a user allowed in this workspace.
    const [membership, oauthUser] = await Promise.all([
      prisma.membership.findFirst({
        where: {
          userId: state.userId,
          organizationId: state.organizationId,
        },
      }),
      prisma.user.findUnique({
        where: { id: state.userId },
        select: { isSuperAdmin: true },
      }),
    ]);

    if (!membership && !oauthUser?.isSuperAdmin) {
      throw new Error("FACEBOOK_WORKSPACE_FORBIDDEN");
    }

    const redirectUri =
      `${appUrl}/api/social/facebook/callback`;

    // Exchange authorization code for a user access token.
    const tokenUrl = new URL(
      "https://graph.facebook.com/v23.0/oauth/access_token"
    );

    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl, {
      cache: "no-store",
    });

    const tokenResult = await tokenRes.json();

    if (!tokenRes.ok || !tokenResult.access_token) {
      throw new Error(
        `FACEBOOK_TOKEN_EXCHANGE_FAILED: ${JSON.stringify(tokenResult)}`
      );
    }

    const userAccessToken = String(tokenResult.access_token);

    // Get Pages this Facebook user can manage.
    const pagesUrl = new URL(
      "https://graph.facebook.com/v23.0/me/accounts"
    );

    pagesUrl.searchParams.set(
      "fields",
      "id,name,access_token,tasks"
    );
    pagesUrl.searchParams.set(
      "access_token",
      userAccessToken
    );

    const pagesRes = await fetch(pagesUrl, {
      cache: "no-store",
    });

    const pagesResult = await pagesRes.json();

    if (!pagesRes.ok) {
      throw new Error(
        `FACEBOOK_PAGES_FAILED: ${JSON.stringify(pagesResult)}`
      );
    }

    const pages = Array.isArray(pagesResult.data)
      ? pagesResult.data
      : [];

    if (pages.length === 0) {
      throw new Error("FACEBOOK_NO_PAGES");
    }

    // If multiple Pages are available, securely store the choices
    // and let the user explicitly select the correct Page.
    if (pages.length > 1) {
      const encryptedPages = encryptSecret(
        JSON.stringify(
          pages.map((page: any) => ({
            id: String(page.id),
            name: page.name || "Facebook Page",
            accessToken: String(page.access_token || ""),
            tasks: page.tasks || [],
          }))
        )
      );

      const selectionJob = await prisma.job.create({
        data: {
          organizationId: state.organizationId,
          type: "facebook_page_selection",
          status: "pending",
          progress: 0,
          payload: {
            userId: state.userId,
            encryptedPages,
          },
        },
      });

      return NextResponse.redirect(
        `${appUrl}/settings/facebook/select?job=${selectionJob.id}`
      );
    }

    const page = pages[0];

    if (!page.id || !page.access_token) {
      throw new Error("FACEBOOK_PAGE_DATA_INVALID");
    }

    const encryptedToken = encryptSecret(
      JSON.stringify({
        pageAccessToken: String(page.access_token),
        userAccessToken,
        pageId: String(page.id),
        tasks: page.tasks || [],
      })
    );

    const existing =
      await prisma.socialConnection.findFirst({
        where: {
          organizationId: state.organizationId,
          provider: "facebook",
        },
      });

    if (existing) {
      await prisma.socialConnection.update({
        where: { id: existing.id },
        data: {
          accountName: page.name || "Facebook Page",
          externalId: String(page.id),
          status: "connected",
          encryptedToken,
        },
      });
    } else {
      await prisma.socialConnection.create({
        data: {
          organizationId: state.organizationId,
          provider: "facebook",
          accountName: page.name || "Facebook Page",
          externalId: String(page.id),
          status: "connected",
          encryptedToken,
        },
      });
    }

    return NextResponse.redirect(
      `${appUrl}/settings?facebook=connected`
    );
  } catch (error) {
    console.error("Facebook OAuth callback failed", error);

    const message =
      error instanceof Error ? error.message : "UNKNOWN_ERROR";

    const reason =
      message.startsWith("FACEBOOK_TOKEN_EXCHANGE_FAILED")
        ? "token_exchange"
        : message.startsWith("FACEBOOK_PAGES_FAILED")
        ? "pages"
        : message === "FACEBOOK_NO_PAGES"
        ? "no_pages"
        : message === "FACEBOOK_WORKSPACE_FORBIDDEN"
        ? "workspace"
        : message.includes("TOKEN_ENCRYPTION_KEY_MISSING")
        ? "encryption_key_missing"
        : "callback";

    return NextResponse.redirect(
      `${appUrl}/settings?facebook=error&reason=${reason}`
    );
  }
}
