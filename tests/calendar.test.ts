import { describe, expect, test, vi } from "vitest";
import { CalendarRequestError, createFocusBlock, findFreeTime, listCalendarEvents } from "../tools/calendar";

describe("Google Calendar adapter", () => {
  test("reads normalized events with a bounded query", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: "e1", summary: "Busy", start: { dateTime: "2026-08-28T10:00:00Z" }, end: { dateTime: "2026-08-28T11:00:00Z" } }] }), { status: 200 }));
    const events = await listCalendarEvents("2026-08-28T09:00:00Z", "2026-08-28T17:00:00Z", { accessToken: "secret", fetcher });
    expect(events).toMatchObject([{ id: "e1", summary: "Busy" }]);
    expect(String(fetcher.mock.calls[0][0])).toContain("singleEvents=true");
  });

  test("creates an event with an idempotency marker", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "e1", summary: "Focus", start: { dateTime: "2026-08-28T13:00:00.000Z" }, end: { dateTime: "2026-08-28T14:00:00.000Z" } }), { status: 200 }));
    await createFocusBlock({ summary: "Focus", start: "2026-08-28T13:00:00Z", end: "2026-08-28T14:00:00Z", idempotencyKey: "focus-key-1" }, { accessToken: "secret", fetcher });
    expect(fetcher).toHaveBeenNthCalledWith(2, expect.any(URL), expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-Idempotency-Key": "focus-key-1" }) }));
  });

  test("returns an existing event for a repeated idempotency key", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: "existing", summary: "Focus", start: { dateTime: "2026-08-28T13:00:00Z" }, end: { dateTime: "2026-08-28T14:00:00Z" } }] }), { status: 200 }));
    await expect(createFocusBlock({ summary: "Focus", start: "2026-08-28T13:00:00Z", end: "2026-08-28T14:00:00Z", idempotencyKey: "focus-key-1" }, { accessToken: "secret", fetcher })).resolves.toMatchObject({ id: "existing" });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0][0])).toContain("privateExtendedProperty=agentsGangIdempotencyKey%3Dfocus-key-1");
  });

  test("finds gaps and normalizes authentication failures", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "e1", start: { dateTime: "2026-08-28T10:00:00Z" }, end: { dateTime: "2026-08-28T11:00:00Z" } }] }), { status: 200 }));
    await expect(findFreeTime("2026-08-28T09:00:00Z", "2026-08-28T12:00:00Z", 30, { accessToken: "secret", fetcher })).resolves.toHaveLength(2);
    await expect(listCalendarEvents("2026-08-28T09:00:00Z", "2026-08-28T12:00:00Z", { accessToken: "secret", fetcher: vi.fn().mockResolvedValue(new Response("", { status: 401 })) })).rejects.toMatchObject({ code: "calendar_auth_failed", retriable: false } satisfies Partial<CalendarRequestError>);
  });
});
