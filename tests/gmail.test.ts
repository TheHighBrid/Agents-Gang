import { describe, expect, test, vi } from "vitest";
import { GmailRequestError, searchGmailMessages } from "../tools/gmail";

describe("Gmail read adapter", () => {
  test("rejects invalid search limits before making requests", async () => {
    const fetcher = vi.fn();
    await expect(searchGmailMessages("in:inbox", { fetcher, accessToken: "token", maxResults: 0 })).rejects.toThrow("maxResults must be an integer from 1 to 25");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("searches and normalizes message metadata without returning bodies", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "m1", threadId: "t1" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "m1",
        threadId: "t1",
        snippet: "Please review this today.",
        labelIds: ["INBOX"],
        internalDate: "1760000000000",
        payload: { headers: [
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "owner@example.com" },
          { name: "Subject", value: "Action needed" },
          { name: "Date", value: "Tue, 14 Oct 2025 10:00:00 +0000" },
        ], body: { data: "should-not-be-returned" } },
      }), { status: 200 }));

    await expect(searchGmailMessages("in:inbox", { fetcher, accessToken: "token", maxResults: 3 })).resolves.toEqual([{
      id: "m1",
      threadId: "t1",
      from: "sender@example.com",
      to: "owner@example.com",
      subject: "Action needed",
      snippet: "Please review this today.",
      receivedAt: "2025-10-14T10:00:00.000Z",
      labelIds: ["INBOX"],
    }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { Authorization: "Bearer token" } });
  });

  test("reports missing configuration and upstream failures safely", async () => {
    await expect(searchGmailMessages("in:inbox", { fetcher: vi.fn() })).rejects.toThrow("Gmail access token is not configured");
    const fetcher = vi.fn().mockResolvedValue(new Response("bad gateway", { status: 503 }));
    await expect(searchGmailMessages("in:inbox", { fetcher, accessToken: "token" })).rejects.toBeInstanceOf(GmailRequestError);
  });
});
