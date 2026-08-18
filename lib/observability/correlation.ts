const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value);
}

export function createCorrelationId(supplied?: string | null): string {
  const candidate = supplied?.trim();
  return candidate && isValidCorrelationId(candidate)
    ? candidate
    : crypto.randomUUID();
}

export function resolveCorrelationId(request: Request): string {
  return createCorrelationId(request.headers.get("x-correlation-id"));
}
