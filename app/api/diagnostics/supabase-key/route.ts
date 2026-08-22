type CredentialKind = "modern_secret" | "modern_publishable" | "legacy_jwt" | "unknown" | "missing";

function decodeLegacyJwt(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    return {
      role: typeof payload.role === "string" ? payload.role : null,
      ref: typeof payload.ref === "string" ? payload.ref : null,
    };
  } catch {
    return null;
  }
}

function projectRefFromUrl(url: string | undefined) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const raw = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  let kind: CredentialKind = "unknown";
  if (!raw) kind = "missing";
  else if (raw.startsWith("sb_secret_")) kind = "modern_secret";
  else if (raw.startsWith("sb_publishable_")) kind = "modern_publishable";
  else if (raw.split(".").length === 3) kind = "legacy_jwt";

  const decoded = kind === "legacy_jwt" ? decodeLegacyJwt(raw) : null;
  const expectedRef = projectRefFromUrl(process.env.SUPABASE_URL);

  return Response.json({
    configured: Boolean(raw),
    kind,
    legacyRole: decoded?.role ?? null,
    legacyProjectRefMatchesUrl: decoded?.ref && expectedRef ? decoded.ref === expectedRef : null,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
