export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const raw = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return Response.json({
    configured: Boolean(raw),
    kind: !raw ? "missing" : raw.startsWith("sb_secret_") ? "modern_secret" : raw.startsWith("sb_publishable_") ? "modern_publishable" : raw.startsWith("eyJ") && raw.split(".").length === 3 ? "legacy_jwt" : "unknown",
    length: raw.length,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
