import { authorizeFounderRequest, founderAuthorizationResponse } from "../../../../lib/approvals/auth";

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
  const authorization = authorizeFounderRequest(request, process.env);
  const denied = founderAuthorizationResponse(authorization);
  if (denied) return noStore(denied);

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
