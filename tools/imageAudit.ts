export type ImageAuditResult = {
  url: string;
  reachable: true;
  contentType: string | null;
  contentLengthBytes: number | null;
  etag: string | null;
  isImage: boolean;
};

type ImageAuditFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ImageAuditOptions = {
  fetcher?: ImageAuditFetcher;
};

export class ImageAuditRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "ImageAuditRequestError";
    this.status = status;
  }
}

export async function auditProductImage(source: string, options: ImageAuditOptions = {}): Promise<ImageAuditResult> {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error("Image URL must be valid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Image URL must use http or https");
  }

  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(url.toString(), { method: "HEAD", redirect: "follow" });
  } catch (error) {
    throw new ImageAuditRequestError(error instanceof Error ? error.message : "Image audit request failed");
  }
  if (!response.ok) {
    throw new ImageAuditRequestError(`Image provider returned ${response.status}`, response.status >= 500 ? 502 : response.status);
  }

  const contentType = response.headers.get("content-type");
  const rawLength = response.headers.get("content-length");
  const parsedLength = rawLength === null ? null : Number(rawLength);
  return {
    url: url.toString(),
    reachable: true,
    contentType,
    contentLengthBytes: Number.isFinite(parsedLength) ? parsedLength : null,
    etag: response.headers.get("etag"),
    isImage: Boolean(contentType?.toLowerCase().startsWith("image/")),
  };
}
