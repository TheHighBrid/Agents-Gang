import { describe, expect, test, vi } from "vitest";
import { createGmailDraft } from "../tools/gmail-draft-tool";

describe("Gmail draft adapter", () => {
  test("creates a draft without calling the send endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "d1", message: { id: "m1", threadId: "t1" } }), { status: 200 }));
    const result = await createGmailDraft({ messageId: "m1", threadId: "t1", to: "sender@example.com", subject: "Re: Action", body: "Thanks." }, { accessToken: "token", fetcher });
    expect(result).toEqual({ id: "d1", messageId: "m1", threadId: "t1" });
    expect(fetcher).toHaveBeenCalledWith("https://gmail.googleapis.com/gmail/v1/users/me/drafts", expect.objectContaining({ method: "POST" }));
    expect(fetcher.mock.calls[0][0]).not.toContain("send");
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload.message.threadId).toBe("t1");
    expect(Buffer.from(payload.message.raw, "base64url").toString("utf8")).toContain("Thanks.");
  });

  test("requires server-side Gmail configuration", async () => {
    await expect(createGmailDraft({ messageId: "m1", threadId: "t1", to: "sender@example.com", subject: "Re: Action", body: "Thanks." }, { fetcher: vi.fn() })).rejects.toThrow("Gmail access token is not configured");
  });
});
