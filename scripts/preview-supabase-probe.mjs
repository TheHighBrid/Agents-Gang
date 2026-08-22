if (process.env.VERCEL_ENV === "preview") {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const secret = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  const vercelPublishable = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();

  // Public by design. Used only as a control to prove whether this project's
  // hosted API gateway accepts its currently active modern publishable key.
  const projectPublishable = "sb_publishable_DjGaNL1kjDyeQ1ydWV2wSw_rJ80O5b_";

  function classify(value) {
    const allowedCharset = /^[A-Za-z0-9_-]+$/.test(value);
    const containsMaskChars = /[*•·…\.]/u.test(value);
    const containsWhitespace = /\s/u.test(value);
    const secretParts = value.startsWith("sb_secret_") ? value.split("_") : [];
    return {
      configured: Boolean(value),
      kind: !value
        ? "missing"
        : value.startsWith("sb_secret_")
          ? "modern_secret"
          : value.startsWith("sb_publishable_")
            ? "modern_publishable"
            : value.startsWith("eyJ") && value.split(".").length === 3
              ? "legacy_jwt"
              : "unknown",
      length: value.length,
      allowedCharset,
      containsMaskChars,
      containsWhitespace,
      secretShapeValid:
        value.startsWith("sb_secret_") &&
        secretParts.length === 4 &&
        secretParts[2]?.length === 22 &&
        secretParts[3]?.length === 8 &&
        allowedCharset,
    };
  }

  async function probe(key, includeMatchingAuthorization = false) {
    if (!key || !url) return { status: 0, error: "not_configured" };

    try {
      const headers = {
        apikey: key,
        "User-Agent": "agents-gang-vercel-build-probe",
      };
      if (includeMatchingAuthorization) {
        headers.Authorization = `Bearer ${key}`;
      }

      const response = await fetch(`${url}/rest/v1/`, {
        headers,
        cache: "no-store",
      });

      if (response.ok) return { status: response.status, error: "none" };

      const text = await response.text();
      let error = text.slice(0, 120) || "empty";
      try {
        const parsed = JSON.parse(text);
        const candidate = parsed?.message ?? parsed?.error ?? parsed?.code;
        if (typeof candidate === "string") error = candidate.slice(0, 120);
      } catch {
        // Keep bounded plain text only.
      }
      return { status: response.status, error };
    } catch {
      return { status: 0, error: "request_failed" };
    }
  }

  async function compareToSupabaseInventory() {
    if (!secret || !url) return { status: 0, error: "not_configured" };
    try {
      const response = await fetch(`${url}/functions/v1/c5-04-key-fingerprint`, {
        headers: {
          "x-candidate-key": secret,
          "User-Agent": "agents-gang-vercel-build-probe",
        },
        cache: "no-store",
      });
      const body = await response.json();
      return {
        status: response.status,
        candidateKind: body?.candidateKind,
        candidateLength: body?.candidateLength,
        activeNames: Array.isArray(body?.activeNames) ? body.activeNames : [],
        matchedNames: Array.isArray(body?.matchedNames) ? body.matchedNames : [],
        matchedModernSecret: Boolean(body?.matchedModernSecret),
        matchedLegacyServiceRole: Boolean(body?.matchedLegacyServiceRole),
      };
    } catch {
      return { status: 0, error: "request_failed" };
    }
  }

  const result = {
    secret: classify(secret),
    vercelPublishable: classify(vercelPublishable),
    tests: {
      secretApikeyOnly: await probe(secret, false),
      secretWithMatchingAuthorization: await probe(secret, true),
      vercelPublishableApikeyOnly: await probe(vercelPublishable, false),
      projectPublishableControl: await probe(projectPublishable, false),
      activeInventoryComparison: await compareToSupabaseInventory(),
    },
  };

  console.log("SUPABASE_BUILD_PROBE_MATRIX", JSON.stringify(result));
}
