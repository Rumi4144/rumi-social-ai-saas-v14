import { createHmac, timingSafeEqual } from "crypto";

type OAuthState = {
  userId: string;
  organizationId: string;
  provider: "instagram";
  expiresAt: number;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET_MISSING");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
}

export function createInstagramOAuthState(input: {
  userId: string;
  organizationId: string;
}) {
  const state: OAuthState = {
    userId: input.userId,
    organizationId: input.organizationId,
    provider: "instagram",
    expiresAt: Date.now() + 10 * 60 * 1000,
  };

  const payload = Buffer.from(
    JSON.stringify(state),
    "utf8"
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifyInstagramOAuthState(value: string): OAuthState {
  const [payload, signature] = value.split(".");

  if (!payload || !signature) {
    throw new Error("INVALID_OAUTH_STATE");
  }

  const expected = sign(payload);
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new Error("INVALID_OAUTH_STATE");
  }

  const state = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8")
  ) as OAuthState;

  if (
    state.provider !== "instagram" ||
    !state.userId ||
    !state.organizationId ||
    state.expiresAt < Date.now()
  ) {
    throw new Error("INVALID_OAUTH_STATE");
  }

  return state;
}
