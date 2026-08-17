export function isApprovalApiAuthorized(request: Request, expectedToken: string | undefined): boolean {
  if (!expectedToken?.trim()) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const suppliedToken = authorization.slice("Bearer ".length).trim();
  return suppliedToken.length > 0 && suppliedToken === expectedToken.trim();
}
