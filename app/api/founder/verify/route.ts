import {
  authorizeFounderRequest,
  authorizeOperatorRequest,
  founderAuthorizationResponse,
  operatorAuthorizationResponse,
} from "../../../../lib/approvals/auth";

function noStore(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function GET(request: Request) {
  const operatorScope = new URL(request.url).searchParams.get("role") === "operator";
  const authorization = operatorScope
    ? authorizeOperatorRequest(request, process.env)
    : authorizeFounderRequest(request, process.env);

  if (!authorization.ok) {
    const denied = operatorScope
      ? operatorAuthorizationResponse(authorization)
      : founderAuthorizationResponse(authorization);
    if (!denied) throw new Error("Authorization failure did not produce a response");
    return noStore(denied);
  }

  return Response.json(
    {
      ok: true,
      role: authorization.identity.role,
      subject: authorization.identity.subject,
      expiresAt: authorization.identity.expiresAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
