import { createHmac, timingSafeEqual } from "node:crypto";

export type FounderRole = "founder" | "operator" | "viewer";

export type FounderSessionClaims = {
  subject: string;
  role: FounderRole;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
};

export type FounderIdentity = Pick<FounderSessionClaims, "subject" | "role" | "sessionId" | "expiresAt">;

type IdentityFailure = { ok: false; reason: "unauthorized" | "forbidden" };
type IdentitySuccess = { ok: true; identity: FounderIdentity };
export type IdentityResolution = IdentityFailure | IdentitySuccess;

const TOKEN_VERSION = "v1";

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function normalizeSigningKey(secret: string | undefined) {
  const normalized = secret?.trim();
  return normalized ? normalized : null;
}

function signaturesMatch(supplied: string, expected: string) {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function createFounderSessionToken(claims: FounderSessionClaims, secret: string) {
  const signingKey = normalizeSigningKey(secret);
  if (!signingKey) throw new Error("Founder auth secret is required");
  const payload = encode(JSON.stringify(claims));
  return `${TOKEN_VERSION}.${payload}.${sign(`${TOKEN_VERSION}.${payload}`, signingKey)}`;
}

function resolveSignedIdentity(
  request: Request,
  secret: string | undefined,
  options: { now?: number; revokedSessionIds?: ReadonlySet<string> } = {},
): IdentityResolution {
  const signingKey = normalizeSigningKey(secret);
  if (!signingKey) return { ok: false, reason: "unauthorized" };
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return { ok: false, reason: "unauthorized" };

  const token = authorization.slice("Bearer ".length).trim();
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return { ok: false, reason: "unauthorized" };
  const [version, encodedClaims, suppliedSignature] = parts;
  const signedPayload = `${version}.${encodedClaims}`;
  if (!signaturesMatch(suppliedSignature, sign(signedPayload, signingKey))) return { ok: false, reason: "unauthorized" };

  let claims: FounderSessionClaims;
  try {
    claims = JSON.parse(decode(encodedClaims)) as FounderSessionClaims;
  } catch {
    return { ok: false, reason: "unauthorized" };
  }
  if (!isValidClaims(claims)) return { ok: false, reason: "unauthorized" };
  if (claims.expiresAt <= (options.now ?? Math.floor(Date.now() / 1000))) return { ok: false, reason: "unauthorized" };
  if (options.revokedSessionIds?.has(claims.sessionId)) return { ok: false, reason: "unauthorized" };

  return {
    ok: true,
    identity: {
      subject: claims.subject,
      role: claims.role,
      sessionId: claims.sessionId,
      expiresAt: claims.expiresAt,
    },
  };
}

export function resolveFounderIdentity(
  request: Request,
  secret: string | undefined,
  options: { now?: number; revokedSessionIds?: ReadonlySet<string> } = {},
): IdentityResolution {
  const result = resolveSignedIdentity(request, secret, options);
  if (!result.ok) return result;
  if (result.identity.role !== "founder") return { ok: false, reason: "forbidden" };
  return result;
}

export function resolveOperatorIdentity(
  request: Request,
  secret: string | undefined,
  options: { now?: number; revokedSessionIds?: ReadonlySet<string> } = {},
): IdentityResolution {
  const result = resolveSignedIdentity(request, secret, options);
  if (!result.ok) return result;
  if (result.identity.role !== "founder" && result.identity.role !== "operator") {
    return { ok: false, reason: "forbidden" };
  }
  return result;
}

function isValidClaims(value: FounderSessionClaims): value is FounderSessionClaims {
  return Boolean(
    value &&
      typeof value.subject === "string" &&
      value.subject.length > 0 &&
      (value.role === "founder" || value.role === "operator" || value.role === "viewer") &&
      typeof value.sessionId === "string" &&
      value.sessionId.length > 0 &&
      Number.isSafeInteger(value.issuedAt) &&
      Number.isSafeInteger(value.expiresAt) &&
      value.expiresAt > value.issuedAt,
  );
}

function revokedSessionIds(environment: Readonly<Record<string, string | undefined>>) {
  return new Set(
    (environment.FOUNDER_REVOKED_SESSION_IDS ?? "")
      .split(",")
      .map((sessionId) => sessionId.trim())
      .filter(Boolean),
  );
}

export function isApprovalApiAuthorized(request: Request, expectedToken: string | undefined) {
  return resolveFounderIdentity(request, expectedToken).ok;
}

export function authorizeFounderRequest(
  request: Request,
  environment: Readonly<Record<string, string | undefined>>,
): IdentityResolution {
  return resolveFounderIdentity(request, environment.FOUNDER_AUTH_SECRET, {
    revokedSessionIds: revokedSessionIds(environment),
  });
}

export function authorizeOperatorRequest(
  request: Request,
  environment: Readonly<Record<string, string | undefined>>,
): IdentityResolution {
  return resolveOperatorIdentity(request, environment.FOUNDER_AUTH_SECRET, {
    revokedSessionIds: revokedSessionIds(environment),
  });
}

export function founderAuthorizationResponse(result: IdentityResolution) {
  if (result.ok) return null;
  return Response.json(
    { error: result.reason === "forbidden" ? "Founder authorization required" : "Founder authentication required" },
    {
      status: result.reason === "forbidden" ? 403 : 401,
      headers: result.reason === "forbidden" ? undefined : { "WWW-Authenticate": "Bearer" },
    },
  );
}

export function operatorAuthorizationResponse(result: IdentityResolution) {
  if (result.ok) return null;
  return Response.json(
    { error: result.reason === "forbidden" ? "Operator authorization required" : "Operator authentication required" },
    {
      status: result.reason === "forbidden" ? 403 : 401,
      headers: result.reason === "forbidden" ? undefined : { "WWW-Authenticate": "Bearer" },
    },
  );
}
