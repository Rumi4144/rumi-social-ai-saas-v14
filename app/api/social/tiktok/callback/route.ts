import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/security/crypto";
import { verifyTikTokOAuthState } from "@/lib/social/oauth-state";

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
        `${appUrl}/settings?tiktok=cancelled`
      );
    }

    if (!code || !stateValue) {
      throw new Error("TIKTOK_OAUTH_RESPONSE_INVALID");
    }

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

    if (!clientKey) {
      throw new Error("TIKTOK_CLIENT_KEY_MISSING");
    }

    if (!clientSecret) {
      throw new Error("TIKTOK_CLIENT_SECRET_MISSING");
    }

    const state = verifyTikTokOAuthState(stateValue);

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
      throw new Error("TIKTOK_WORKSPACE_FORBIDDEN");
    }

    const redirectUri =
      `${appUrl}/api/social/tiktok/callback/`;

    // Exchange authorization code for TikTok tokens.
    const tokenRes = await fetch(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
        cache: "no-store",
      }
    );

    const tokenResult = await tokenRes.json();

    if (!tokenRes.ok || !tokenResult.access_token) {
      throw new Error(
        `TIKTOK_TOKEN_EXCHANGE_FAILED: ${
          tokenResult.error_description ||
          tokenResult.error ||
          JSON.stringify(tokenResult)
        }`
      );
    }

    const accessToken = String(tokenResult.access_token);
    const openId = String(tokenResult.open_id || "");

    if (!openId) {
      throw new Error("TIKTOK_OPEN_ID_MISSING");
    }

    // Retrieve the connected TikTok account's basic profile.
    const userInfoUrl =
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url";

    const userRes = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const userResult = await userRes.json();
    const tikTokUser = userResult?.data?.user;

    if (!userRes.ok || !tikTokUser?.open_id) {
      throw new Error(
        `TIKTOK_USER_INFO_FAILED: ${JSON.stringify(userResult)}`
      );
    }

    const tokenBundle = JSON.stringify({
      accessToken,
      refreshToken: tokenResult.refresh_token || null,
      expiresIn: tokenResult.expires_in || null,
      expiresAt: tokenResult.expires_in
        ? Date.now() + Number(tokenResult.expires_in) * 1000
        : null,
      refreshExpiresIn: tokenResult.refresh_expires_in || null,
      scope: tokenResult.scope || "user.info.basic",
      tokenType: tokenResult.token_type || "Bearer",
      openId,
    });

    const encryptedToken = encryptSecret(tokenBundle);

    const existing = await prisma.socialConnection.findFirst({
      where: {
        organizationId: state.organizationId,
        provider: "tiktok",
      },
    });

    const accountName =
      tikTokUser.display_name || "TikTok";

    if (existing) {
      await prisma.socialConnection.update({
        where: { id: existing.id },
        data: {
          accountName,
          externalId: openId,
          status: "connected",
          encryptedToken,
        },
      });
    } else {
      await prisma.socialConnection.create({
        data: {
          organizationId: state.organizationId,
          provider: "tiktok",
          accountName,
          externalId: openId,
          status: "connected",
          encryptedToken,
        },
      });
    }

    return NextResponse.redirect(
      `${appUrl}/settings?tiktok=connected`
    );
  } catch (error) {
    console.error("TikTok OAuth callback failed", error);

    const message =
      error instanceof Error ? error.message : "UNKNOWN_ERROR";

    const reason = message.startsWith("TIKTOK_TOKEN_EXCHANGE_FAILED")
      ? "token_exchange"
      : message.startsWith("TIKTOK_USER_INFO_FAILED")
      ? "user_info"
      : message.startsWith("TIKTOK_WORKSPACE_FORBIDDEN")
      ? "workspace"
      : message.includes("TOKEN_ENCRYPTION_KEY_MISSING")
      ? "encryption_key_missing"
      : "callback";

    return NextResponse.redirect(
      `${appUrl}/settings?tiktok=error&reason=${reason}`
    );
  }
}
