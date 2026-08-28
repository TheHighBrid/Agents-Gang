export type CalendarFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  status: string;
  htmlLink: string | null;
};

export type CalendarOptions = {
  accessToken?: string;
  calendarId?: string;
  fetcher?: CalendarFetcher;
  timeoutMs?: number;
};

export type CalendarErrorCode =
  | "calendar_auth_failed"
  | "calendar_rate_limited"
  | "calendar_upstream_failed"
  | "calendar_transport_failed"
  | "calendar_timeout"
  | "calendar_malformed_response";

export class CalendarRequestError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
    public readonly code: CalendarErrorCode = "calendar_upstream_failed",
    public readonly retriable = true,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "CalendarRequestError";
  }
}

function assertEnabled() {
  if (process.env.CALENDAR_ENABLED?.trim() === "false") throw new Error("Calendar integration is disabled");
}

function configuration(options: CalendarOptions) {
  assertEnabled();
  const accessToken = options.accessToken ?? process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Google Calendar access token is not configured");
  return {
    accessToken,
    calendarId: options.calendarId ?? process.env.GOOGLE_CALENDAR_ID ?? "primary",
    fetcher: options.fetcher ?? fetch,
  };
}

function resolveTimeout(timeoutMs?: number) {
  const timeout = timeoutMs ?? Number(process.env.CALENDAR_REQUEST_TIMEOUT_MS ?? "10000");
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 30_000) {
    throw new Error("Calendar request timeout must be an integer between 1000 and 30000 milliseconds");
  }
  return timeout;
}

async function request(fetcher: CalendarFetcher, url: RequestInfo | URL, init: RequestInit, timeoutMs?: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), resolveTimeout(timeoutMs));
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CalendarRequestError("Calendar request timed out", 502, "calendar_timeout", true);
    }
    throw new CalendarRequestError("Calendar transport request failed", 502, "calendar_transport_failed", true);
  } finally {
    clearTimeout(timer);
  }
}

function responseError(response: Response) {
  if (response.status === 401 || response.status === 403) {
    return new CalendarRequestError("Calendar authentication failed", response.status, "calendar_auth_failed", false);
  }
  if (response.status === 429) {
    const value = response.headers.get("retry-after");
    return new CalendarRequestError("Calendar request was rate limited", 429, "calendar_rate_limited", true,
      value && /^\d+$/.test(value) ? Number(value) : undefined);
  }
  return new CalendarRequestError("Calendar upstream request failed", response.status, "calendar_upstream_failed", response.status >= 500);
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw responseError(response);
  try {
    return await response.json() as T;
  } catch {
    throw new CalendarRequestError("Calendar returned a malformed response", response.status, "calendar_malformed_response", true);
  }
}

function iso(value: string | Date, field: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date`);
  return date.toISOString();
}

type ApiEvent = { id?: string; summary?: string; status?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };
function normalizeEvent(event: ApiEvent): CalendarEvent | null {
  const start = event.start?.dateTime ?? event.start?.date;
  const end = event.end?.dateTime ?? event.end?.date;
  if (!event.id || !start || !end) return null;
  return { id: event.id, summary: event.summary ?? "", start, end, status: event.status ?? "confirmed", htmlLink: event.htmlLink ?? null };
}

export async function listCalendarEvents(start: string | Date, end: string | Date, options: CalendarOptions = {}) {
  const timeMin = iso(start, "start");
  const timeMax = iso(end, "end");
  if (timeMin >= timeMax) throw new Error("end must be after start");
  const config = configuration(options);
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`);
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  const result = await json<{ items?: ApiEvent[] }>(await request(config.fetcher, url, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  }, options.timeoutMs));
  if (result.items !== undefined && !Array.isArray(result.items)) throw new CalendarRequestError("Calendar returned a malformed response", 502, "calendar_malformed_response", true);
  return (result.items ?? []).map(normalizeEvent).filter((event): event is CalendarEvent => event !== null);
}

export async function getTodayEvents(options: CalendarOptions & { now?: Date; timeZone?: string } = {}) {
  const now = options.now ?? new Date();
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  return listCalendarEvents(start, end, options);
}

export type FocusBlockInput = { summary: string; start: string; end: string; description?: string; timeZone?: string; idempotencyKey: string };

export function prepareFocusBlock(input: FocusBlockInput): FocusBlockInput {
  if (!input || typeof input !== "object") throw new Error("focus block input is required");
  const summary = input.summary?.trim();
  const idempotencyKey = input.idempotencyKey?.trim();
  if (!summary) throw new Error("summary is required");
  if (!idempotencyKey || !/^[a-z0-9_-]{8,64}$/i.test(idempotencyKey)) throw new Error("idempotencyKey must be 8-64 safe characters");
  const start = iso(input.start, "start"); const end = iso(input.end, "end");
  if (start >= end) throw new Error("end must be after start");
  return { summary, start, end, idempotencyKey, ...(input.description ? { description: input.description } : {}), ...(input.timeZone ? { timeZone: input.timeZone } : {}) };
}

export async function createFocusBlock(input: FocusBlockInput, options: CalendarOptions = {}) {
  const block = prepareFocusBlock(input);
  const config = configuration(options);
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`);
  const lookupUrl = new URL(url);
  lookupUrl.searchParams.set("privateExtendedProperty", `agentsGangIdempotencyKey=${block.idempotencyKey}`);
  lookupUrl.searchParams.set("maxResults", "1");
  lookupUrl.searchParams.set("singleEvents", "true");
  const existing = await json<{ items?: ApiEvent[] }>(await request(config.fetcher, lookupUrl, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  }, options.timeoutMs));
  const existingEvent = existing.items?.[0] ? normalizeEvent(existing.items[0]) : null;
  if (existingEvent) return existingEvent;
  url.searchParams.set("conferenceDataVersion", "0");
  const result = await json<ApiEvent>(await request(config.fetcher, url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": block.idempotencyKey },
    body: JSON.stringify({ summary: block.summary, description: block.description, start: { dateTime: block.start, timeZone: block.timeZone }, end: { dateTime: block.end, timeZone: block.timeZone }, extendedProperties: { private: { agentsGangIdempotencyKey: block.idempotencyKey } } }),
  }, options.timeoutMs));
  const event = normalizeEvent(result);
  if (!event) throw new CalendarRequestError("Calendar API returned an incomplete event", 502, "calendar_malformed_response", true);
  return event;
}

export async function findFreeTime(start: string | Date, end: string | Date, durationMinutes: number, options: CalendarOptions = {}) {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) throw new Error("durationMinutes must be an integer from 15 to 480");
  const rangeStart = new Date(iso(start, "start")); const rangeEnd = new Date(iso(end, "end"));
  const events = await listCalendarEvents(rangeStart, rangeEnd, options);
  let cursor = rangeStart.getTime(); const duration = durationMinutes * 60_000;
  const slots: Array<{ start: string; end: string }> = [];
  for (const event of events.filter((item) => item.status !== "cancelled").sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
    const busyStart = Math.max(rangeStart.getTime(), Date.parse(event.start));
    const busyEnd = Math.min(rangeEnd.getTime(), Date.parse(event.end));
    if (busyStart - cursor >= duration) slots.push({ start: new Date(cursor).toISOString(), end: new Date(busyStart).toISOString() });
    cursor = Math.max(cursor, busyEnd);
  }
  if (rangeEnd.getTime() - cursor >= duration) slots.push({ start: new Date(cursor).toISOString(), end: rangeEnd.toISOString() });
  return slots;
}
