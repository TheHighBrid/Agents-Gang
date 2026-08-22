import { createHash } from "node:crypto";

if (process.env.VERCEL_ENV === "preview") {
  const key = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const kind = !key
    ? "missing"
    : key.startsWith("sb_secret_")
      ? "modern_secret"
      : key.startsWith("sb_publishable_")
        ? "modern_publishable"
        : "unknown";

  let checksumMatchesProject;
  if (kind === "modern_secret" && url) {
    try {
      const projectRef = new URL(url).hostname.split(".")[0] ?? "";
      const separator = key.lastIndexOf("_");
      const intermediate = key.slice(0, separator);
      const actual = key.slice(separator + 1);
      const expected = createHash("sha256")
        .update(`${projectRef}|${intermediate}`)
        .digest("base64url")
        .slice(0, 8);
      checksumMatchesProject = actual === expected;
    } catch {
      checksumMatchesProject = undefined;
    }
  }

  const result = {
    configured: Boolean(key),
    kind,
    length: key.length,
    checksumMatchesProject,
    status: 0,
    error: "not_tested",
  };

  if (key && url) {
    try {
      const response = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: key, "User-Agent": "agents-gang-vercel-build-probe" },
        cache: "no-store",
      });
      result.status = response.status;
      if (response.ok) {
        result.error = "none";
      } else {
        const text = await response.text();
        let error = text.slice(0, 120) || "empty";
        try {
          const parsed = JSON.parse(text);
          const candidate = parsed?.message ?? parsed?.error ?? parsed?.code;
          if (typeof candidate === "string") error = candidate.slice(0, 120);
        } catch {
          // Keep bounded plain text only.
        }
        result.error = error;
      }
    } catch {
      result.error = "request_failed";
    }
  }

  console.log("SUPABASE_BUILD_PROBE", JSON.stringify(result));
}
