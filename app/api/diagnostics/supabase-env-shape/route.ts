// Preview-only Supabase server-key diagnostic. Never returns credential material.
// Fresh deployment trigger after regenerating the Supabase secret key.
function classify(value: string | undefined) {
  const raw = (value ?? "").trim();
  return {
    configured: Boolean(raw),
    kind: !raw ? "missing" : raw.startsWith("sb_secret_") ? "modern_secret" : raw.startsWith("sb_publishable_") ? "modern_publishable" : raw.startsWith("eyJ") && raw.split(".").length === 3 ? "legacy_jwt" : "unknown",
    length: raw.length,
  };
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") return Response.json({ error: "Not found" }, { status: 404 });

  const key = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  let probe: { status: number; error?: string } | undefined;

  if (key && url) {
    try {
      const response = await fetch(`${url}/rest/v1/`, { headers: { apikey: key }, cache: "no-store" });
      if (response.ok) {
        probe = { status: response.status };
      } else {
        const text = await response.text();
        let error = text.slice(0, 240);
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          const candidate = parsed.message ?? parsed.error ?? parsed.code;
          if (typeof candidate === "string") error = candidate.slice(0, 240);
        } catch {
          // Keep bounded plain-text error only.
        }
        probe = { status: response.status, error };
      }
    } catch {
      probe = { status: 0, error: "request_failed" };
    }
  }

  return Response.json({
    legacyName: classify(process.env.SUPABASE_SERVICE_ROLE_KEY),
    modernName: classify(process.env.SUPABASE_SECRET_KEY),
    probe,
  }, { headers: { "Cache-Control": "no-store" } });
}
