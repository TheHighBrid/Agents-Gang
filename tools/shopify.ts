type ShopifyVariables = Record<string, unknown>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ShopifyClientOptions = {
  storeDomain: string;
  accessToken: string;
  request?: FetchLike;
};

type ShopifyResponse = {
  data?: unknown;
  errors?: Array<{ message?: unknown }>;
};

type ShopifyErrorCode =
  | "configuration_missing"
  | "network_error"
  | "rate_limited"
  | "authentication_failed"
  | "http_error"
  | "malformed_response"
  | "graphql_error";

export class ShopifyAdapterError extends Error {
  readonly code: ShopifyErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    options: {
      code: ShopifyErrorCode;
      retryable: boolean;
      status?: number;
      retryAfterSeconds?: number;
    },
  ) {
    super(message);
    this.name = "ShopifyAdapterError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function getDefaultClient() {
  return createShopifyClient({
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN ?? "",
    accessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? "",
  });
}

export function createShopifyClient({ storeDomain, accessToken, request = fetch }: ShopifyClientOptions) {
  const normalizedDomain = storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");

  async function graphQL(query: string, variables: ShopifyVariables = {}) {
    if (!normalizedDomain || !accessToken) {
      throw new ShopifyAdapterError("Shopify credentials are not configured", {
        code: "configuration_missing",
        retryable: false,
      });
    }

    const response = await request(`https://${normalizedDomain}/admin/api/2026-04/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }).catch(() => {
      throw new ShopifyAdapterError("Shopify request could not be reached", {
        code: "network_error",
        retryable: true,
      });
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new ShopifyAdapterError("Shopify rate limit exceeded", {
          code: "rate_limited",
          retryable: true,
          status: response.status,
          retryAfterSeconds: parseRetryAfter(response.headers.get("Retry-After")),
        });
      }
      if (response.status === 401 || response.status === 403) {
        throw new ShopifyAdapterError("Shopify authentication failed", {
          code: "authentication_failed",
          retryable: false,
          status: response.status,
        });
      }
      throw new ShopifyAdapterError(`Shopify request failed with status ${response.status}`, {
        code: "http_error",
        retryable: response.status >= 500,
        status: response.status,
      });
    }

    let payload: ShopifyResponse;
    try {
      payload = (await response.json()) as ShopifyResponse;
    } catch {
      throw new ShopifyAdapterError("Shopify returned malformed JSON", {
        code: "malformed_response",
        retryable: false,
      });
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ShopifyAdapterError("Shopify returned a malformed response", {
        code: "malformed_response",
        retryable: false,
      });
    }
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      throw new ShopifyAdapterError("Shopify GraphQL request failed", {
        code: "graphql_error",
        retryable: false,
      });
    }
    if (!("data" in payload)) {
      throw new ShopifyAdapterError("Shopify response did not include data", {
        code: "malformed_response",
        retryable: false,
      });
    }

    return payload;
  }

  async function getProducts(first = 20) {
    const query = `
      query GetProducts($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id
              title
              handle
              descriptionHtml
              productType
              vendor
              tags
              status
              totalInventory
              onlineStoreUrl
              variants(first: 20) {
                edges {
                  node {
                    id
                    title
                    price
                    compareAtPrice
                    inventoryQuantity
                  }
                }
              }
              seo { title description }
              images(first: 10) {
                edges { node { id url altText } }
              }
            }
          }
        }
      }
    `;
    return graphQL(query, { first });
  }

  return { graphQL, getProducts };
}

export async function shopifyGraphQL(query: string, variables: ShopifyVariables = {}) {
  return getDefaultClient().graphQL(query, variables);
}

export async function getShopifyProducts(first = 20) {
  return getDefaultClient().getProducts(first);
}
