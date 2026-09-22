import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/security/crypto";
import { verifyInstagramOAuthState } from "@/lib/social/oauth-state";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const code = url.searchParams.get("code");
    const stateValue = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (oauthError) {
      return NextResponse.redirect(
        `${appUrl}/settings?instagram=cancelled`
      );
    }

    if (!code || !stateValue) {
      throw new Error("INSTAGRAM_OAUTH_RESPONSE_INVALID");
    }

    if (!appId) throw new Error("INSTAGRAM_APP_ID_MISSING");
    if (!appSecret) throw new Error("INSTAGRAM_APP_SECRET_MISSING");
    if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL_MISSING");

    const state = verifyInstagramOAuthState(stateValue);

    const redirectUri =
      "https://rumi-social-ai-saas-v14.vercel.app/api/social/instagram/callback";

    // Exchange authorization code for short-lived token.
    const tokenBody = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch(
      "https://api.instagram.com/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenBody,
        cache: "no-store",
      }
    );

    const tokenResult = await tokenRes.json();

    if (!tokenRes.ok || !tokenResult.access_token) {
      throw new Error(
        `INSTAGRAM_TOKEN_EXCHANGE_FAILED: ${
          tokenResult.error_message ||
          tokenResult.error?.message ||
          JSON.stringify(tokenResult)
        }`
      );
    }

    const shortToken = String(tokenResult.access_token);

    // Exchange short-lived token for long-lived token.
    const longTokenUrl = new URL(
      "https://graph.instagram.com/access_token"
    );

    longTokenUrl.searchParams.set(
      "grant_type",
      "ig_exchange_token"
    );
    longTokenUrl.searchParams.set(
      "client_secret",
      appSecret
    );
    longTokenUrl.searchParams.set(
      "access_token",
      shortToken
    );

    const longTokenRes = await fetch(longTokenUrl, {
      cache: "no-store",
    });

    const longTokenResult = await longTokenRes.json();

    if (!longTokenRes.ok || !longTokenResult.access_token) {
      throw new Error(
        `INSTAGRAM_LONG_TOKEN_FAILED: ${
          longTokenResult.error?.message ||
          JSON.stringify(longTokenResult)
        }`
      );
    }

    const accessToken = String(
      longTokenResult.access_token
    );

    // Get connected Instagram identity.
    const profileUrl = new URL(
      "https://graph.instagram.com/me"
    );

    profileUrl.searchParams.set(
      "fields",
      "id,username,account_type"
    );
    profileUrl.searchParams.set(
      "access_token",
      accessToken
    );

    const profileRes = await fetch(profileUrl, {
      cache: "no-store",
    });

    const profile = await profileRes.json();

    if (!profileRes.ok || !profile.id) {
      throw new Error(
        `INSTAGRAM_PROFILE_FAILED: ${
          profile.error?.message ||
          JSON.stringify(profile)
        }`
      );
    }

    // Confirm the OAuth state still belongs to a real
    // membership before saving the provider connection.
    const membership = await prisma.membership.findFirst({
      where: {
        userId: state.userId,
        organizationId: state.organizationId,
      },
    });

    if (!membership) {
      throw new Error("INSTAGRAM_WORKSPACE_FORBIDDEN");
    }

    const encryptedToken = encryptSecret(accessToken);

    // Reuse an existing Instagram connection when possible.
    const existing =
      await prisma.socialConnection.findFirst({
        where: {
          organizationId: state.organizationId,
          provider: "instagram",
          externalId: String(profile.id),
        },
      });

    if (existing) {
      await prisma.socialConnection.update({
        where: { id: existing.id },
        data: {
          accountName:
            profile.username || "Instagram",
          status: "connected",
          encryptedToken,
        },
      });
    } else {
      await prisma.socialConnection.create({
        data: {
          organizationId: state.organizationId,
          provider: "instagram",
          accountName:
            profile.username || "Instagram",
          externalId: String(profile.id),
          status: "connected",
          encryptedToken,
        },
      });
    }

    return NextResponse.redirect(
      `${appUrl}/settings?instagram=connected`
    );
  } catch (error) {
    console.error("Instagram OAuth callback failed", error);

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "/";

    return NextResponse.redirect(
      `${appUrl}/settings?instagram=error`
    );
  }
}
