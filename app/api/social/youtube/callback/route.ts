import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/security/crypto";
import { verifyYouTubeOAuthState } from "@/lib/social/oauth-state";

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
        `${appUrl}/settings?youtube=cancelled`
      );
    }

    if (!code || !stateValue) {
      throw new Error("YOUTUBE_OAUTH_RESPONSE_INVALID");
    }

    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

    if (!clientId) throw new Error("YOUTUBE_CLIENT_ID_MISSING");
    if (!clientSecret) throw new Error("YOUTUBE_CLIENT_SECRET_MISSING");

    const state = verifyYouTubeOAuthState(stateValue);

    // Normal users must belong to the workspace.
    // Super Admin may connect any workspace.
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
      throw new Error("YOUTUBE_WORKSPACE_FORBIDDEN");
    }

    const redirectUri =
      `${appUrl}/api/social/youtube/callback`;

    const tokenRes = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
        cache: "no-store",
      }
    );

    const tokenResult = await tokenRes.json();

    if (!tokenRes.ok || !tokenResult.access_token) {
      throw new Error(
        `YOUTUBE_TOKEN_EXCHANGE_FAILED: ${
          tokenResult.error_description ||
          tokenResult.error ||
          JSON.stringify(tokenResult)
        }`
      );
    }

    const accessToken = String(tokenResult.access_token);

    // Identify the authorized YouTube channel.
    const channelUrl = new URL(
      "https://www.googleapis.com/youtube/v3/channels"
    );
    channelUrl.searchParams.set("part", "snippet");
    channelUrl.searchParams.set("mine", "true");

    const channelRes = await fetch(channelUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const channelResult = await channelRes.json();
    const channel = channelResult.items?.[0];

    if (!channelRes.ok || !channel?.id) {
      throw new Error(
        `YOUTUBE_CHANNEL_FAILED: ${JSON.stringify(channelResult)}`
      );
    }

    const tokenBundle = JSON.stringify({
      accessToken,
      refreshToken: tokenResult.refresh_token || null,
      expiresIn: tokenResult.expires_in || null,
      expiresAt: tokenResult.expires_in
        ? Date.now() + Number(tokenResult.expires_in) * 1000
        : null,
      scope: tokenResult.scope || null,
      tokenType: tokenResult.token_type || "Bearer",
    });

    const encryptedToken = encryptSecret(tokenBundle);

    const existing = await prisma.socialConnection.findFirst({
      where: {
        organizationId: state.organizationId,
        provider: "youtube",
      },
    });

    if (existing) {
      await prisma.socialConnection.update({
        where: { id: existing.id },
        data: {
          accountName: channel.snippet?.title || "YouTube",
          externalId: String(channel.id),
          status: "connected",
          encryptedToken,
        },
      });
    } else {
      await prisma.socialConnection.create({
        data: {
          organizationId: state.organizationId,
          provider: "youtube",
          accountName: channel.snippet?.title || "YouTube",
          externalId: String(channel.id),
          status: "connected",
          encryptedToken,
        },
      });
    }

    return NextResponse.redirect(
      `${appUrl}/settings?youtube=connected`
    );
  } catch (error) {
    console.error("YouTube OAuth callback failed", error);

    const message =
      error instanceof Error ? error.message : "UNKNOWN_ERROR";

    const reason = message.startsWith("YOUTUBE_TOKEN_EXCHANGE_FAILED")
      ? "token_exchange"
      : message.startsWith("YOUTUBE_CHANNEL_FAILED")
      ? "channel"
      : message.startsWith("YOUTUBE_WORKSPACE_FORBIDDEN")
      ? "workspace"
      : message.includes("TOKEN_ENCRYPTION_KEY_MISSING")
      ? "encryption_key_missing"
      : "callback";

    return NextResponse.redirect(
      `${appUrl}/settings?youtube=error&reason=${reason}`
    );
  }
}
