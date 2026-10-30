import { authorizeFounderRequest, founderAuthorizationResponse } from "../../../lib/approvals/auth";
import { createImprovementStore } from "../../../lib/improvement/runtime";

export async function GET(request: Request) {
  const denied = founderAuthorizationResponse(authorizeFounderRequest(request, process.env));
  if (denied) return denied;
  try {
    const store = createImprovementStore(process.env);
    if (!store) return Response.json({ error: "Self-improvement is disabled" }, { status: 503 });
    const state = await store.read();
    return Response.json({ paused: state.paused, champion: state.champion, previous: state.previous,
      attempts: state.runs.slice(-50), defects: state.defects, decisions: state.ledger.slice(-10) },
    { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Improvement storage unavailable" }, { status: 503 }); }
}

export async function POST(request: Request) {
  const denied = founderAuthorizationResponse(authorizeFounderRequest(request, process.env));
  if (denied) return denied;
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return Response.json({ error: "Request too large" }, { status: 413 });
    body = JSON.parse(raw) as Record<string, unknown>;
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error();
  } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  try {
    const store = createImprovementStore(process.env);
    if (!store) return Response.json({ error: "Self-improvement is disabled" }, { status: 503 });
    switch (body.action) {
      case "feedback":
        if (typeof body.attemptId !== "string" || typeof body.expectedAgent !== "string") break;
        return Response.json(await store.feedback(body.attemptId, body.expectedAgent));
      case "pause": return Response.json(await store.setPaused(true));
      case "resume": return Response.json(await store.setPaused(false));
      case "rollback": return Response.json(await store.rollback());
    }
    return Response.json({ error: "Invalid improvement action" }, { status: 400 });
  } catch {
    return Response.json({ error: "Action could not be applied; inspect improvement state" }, { status: 409 });
  }
}
