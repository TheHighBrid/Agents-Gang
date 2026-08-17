import { describe, expect, test, vi } from "vitest";
import { auditProductImage, ImageAuditRequestError } from "../tools/imageAudit";

describe("product image audit", () => {
  test("rejects non-http image sources before making a request", async () => {
    const fetcher = vi.fn();
    await expect(auditProductImage("javascript:alert(1)", { fetcher })).rejects.toThrow("Image URL must use http or https");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("normalizes reachable image metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
      headers: {
        "content-type": "image/avif",
        "content-length": "4821",
        etag: "\"image-v1\"",
      },
    }));

    await expect(auditProductImage("https://cdn.example.test/look.avif", { fetcher })).resolves.toEqual({
      url: "https://cdn.example.test/look.avif",
      reachable: true,
      contentType: "image/avif",
      contentLengthBytes: 4821,
      etag: "\"image-v1\"",
      isImage: true,
    });
    expect(fetcher).toHaveBeenCalledWith("https://cdn.example.test/look.avif", expect.objectContaining({ method: "HEAD" }));
  });

  test("flags a reachable non-image response without throwing", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
      headers: { "content-type": "text/html" },
    }));
    await expect(auditProductImage("https://cdn.example.test/look", { fetcher })).resolves.toMatchObject({
      reachable: true,
      isImage: false,
      contentType: "text/html",
    });
  });

  test("returns a typed error for upstream failures", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(auditProductImage("https://cdn.example.test/missing.jpg", { fetcher })).rejects.toBeInstanceOf(ImageAuditRequestError);
  });
});
