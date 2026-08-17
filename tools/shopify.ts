type ShopifyVariables = Record<string, unknown>;
type ShopifyEnvironment = Readonly<Record<string, string | undefined>>;
type ShopifyFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ShopifyErrorCode =
  | "shopify_auth_failed"
  | "shopify_rate_limited"
  | "shopify_timeout"
  | "shopify_upstream_failed"
  | "shopify_transport_failed"
  | "shopify_graphql_failed"
  | "shopify_user_error"
  | "shopify_malformed_response";

export class ShopifyAdapterError extends Error {
  constructor(
    message: string,
    public readonly code: ShopifyErrorCode,
    public readonly status: number | undefined,
    public readonly retriable: boolean,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ShopifyAdapterError";
  }
}

function requireShopifyConfiguration(environment: ShopifyEnvironment) {
  const domain = environment.SHOPIFY_STORE_DOMAIN?.trim();
  const token = environment.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  const mode = environment.SHOPIFY_STORE_MODE?.trim();
  if (!domain || !token || (mode !== "test" && mode !== "production")) {
    throw new Error("Shopify adapter is not configured");
  }
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(domain)) {
    throw new Error("Shopify store domain is invalid");
  }
  if (mode === "test" && environment.SHOPIFY_TEST_STORE_DOMAIN?.trim() !== domain) {
    throw new Error("Shopify test store domain does not match the configured store");
  }
  const configuredTimeout = environment.SHOPIFY_REQUEST_TIMEOUT_MS?.trim();
  const timeoutMs = configuredTimeout ? Number(configuredTimeout) : 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error("Shopify request timeout must be an integer between 1000 and 30000 milliseconds");
  }
  return { domain, token, timeoutMs };
}

function hasMutationUserErrors(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasMutationUserErrors);
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.userErrors) && record.userErrors.length > 0) return true;
  return Object.values(record).some(hasMutationUserErrors);
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

export function createShopifyGraphQLAdapter(
  environment: ShopifyEnvironment = process.env,
  fetcher: ShopifyFetcher = fetch,
) {
  const { domain, token, timeoutMs } = requireShopifyConfiguration(environment);
  const endpoint = `https://${domain}/admin/api/2026-04/graphql.json`;

  return {
    async graphql(query: string, variables: ShopifyVariables = {}) {
      let response: Response;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await fetcher(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token,
          },
          body: JSON.stringify({ query, variables }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new ShopifyAdapterError("Shopify request timed out", "shopify_timeout", undefined, true);
        }
        throw new ShopifyAdapterError("Shopify transport request failed", "shopify_transport_failed", undefined, true);
      } finally {
        clearTimeout(timeout);
      }

      if (response.status === 401 || response.status === 403) {
        throw new ShopifyAdapterError("Shopify authentication failed", "shopify_auth_failed", response.status, false);
      }
      if (response.status === 429) {
        throw new ShopifyAdapterError("Shopify request was rate limited", "shopify_rate_limited", response.status, true, retryAfterSeconds(response));
      }
      if (!response.ok) {
        throw new ShopifyAdapterError("Shopify upstream request failed", "shopify_upstream_failed", response.status, response.status >= 500);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ShopifyAdapterError("Shopify returned a malformed response", "shopify_malformed_response", response.status, true);
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new ShopifyAdapterError("Shopify returned a malformed response", "shopify_malformed_response", response.status, true);
      }
      const record = payload as { data?: unknown; errors?: unknown };
      if (Array.isArray(record.errors) && record.errors.length > 0) {
        throw new ShopifyAdapterError("Shopify GraphQL request failed", "shopify_graphql_failed", response.status, false);
      }
      if (hasMutationUserErrors(record.data)) {
        throw new ShopifyAdapterError("Shopify rejected the requested mutation", "shopify_user_error", response.status, false);
      }
      return payload;
    },
  };
}

export async function shopifyGraphQL(query: string, variables: ShopifyVariables = {}) {
  return createShopifyGraphQLAdapter().graphql(query, variables);
}

export async function getShopifyCustomers(input: { first: number; query?: string }) {
  const query = `
    query GetCustomers($first: Int!, $query: String) {
      customers(first: $first, query: $query) {
        nodes {
          id
          firstName
          lastName
          defaultEmailAddress {
            emailAddress
            marketingState
          }
          defaultPhoneNumber {
            phoneNumber
            marketingState
          }
          tags
          state
          createdAt
          updatedAt
          numberOfOrders
          amountSpent {
            amount
            currencyCode
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
  return shopifyGraphQL(query, input);
}

export async function createShopifyCustomer(input: Record<string, unknown>) {
  const query = `
    mutation CreateCustomer($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer {
          id
          firstName
          lastName
          defaultEmailAddress {
            emailAddress
          }
          defaultPhoneNumber {
            phoneNumber
          }
          tags
          taxExempt
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  return shopifyGraphQL(query, { input });
}

export async function updateShopifyCustomer(input: { customerId: string; [key: string]: unknown }) {
  const { customerId, ...customer } = input;
  const query = `
    mutation UpdateCustomer($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer {
          id
          firstName
          lastName
          defaultEmailAddress {
            emailAddress
          }
          defaultPhoneNumber {
            phoneNumber
          }
          tags
          taxExempt
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  return shopifyGraphQL(query, { input: { id: customerId, ...customer } });
}

export async function adjustShopifyInventory(input: {
  inventoryItemId: string;
  locationId: string;
  delta: number;
  reason: string;
  idempotencyKey: string;
  referenceDocumentUri?: string;
}) {
  const { inventoryItemId, locationId, delta, reason, idempotencyKey, referenceDocumentUri } = input;
  const query = `
    mutation AdjustInventory($input: InventoryAdjustQuantitiesInput!, $idempotencyKey: String!) {
      inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {
        inventoryAdjustmentGroup {
          createdAt
          reason
          referenceDocumentUri
          changes {
            name
            delta
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  return shopifyGraphQL(query, {
    input: {
      name: "available",
      reason,
      ...(referenceDocumentUri ? { referenceDocumentUri } : {}),
      changes: [{ inventoryItemId, locationId, delta }],
    },
    idempotencyKey,
  });
}

export async function createShopifyVariants(input: {
  productId: string;
  variants: Record<string, unknown>[];
}) {
  const query = `
    mutation CreateProductVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants) {
        productVariants {
          id
          title
          selectedOptions {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  return shopifyGraphQL(query, input);
}

export async function updateShopifyVariants(input: {
  productId: string;
  variants: Record<string, unknown>[];
  allowPartialUpdates?: boolean;
}) {
  const { productId, variants, allowPartialUpdates } = input;
  const query = `
    mutation UpdateProductVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $allowPartialUpdates: Boolean) {
      productVariantsBulkUpdate(
        productId: $productId
        variants: $variants
        allowPartialUpdates: $allowPartialUpdates
      ) {
        product {
          id
        }
        productVariants {
          id
          title
          selectedOptions {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  return shopifyGraphQL(query, { productId, variants, allowPartialUpdates });
}

export async function createShopifyProduct(input: Record<string, unknown>) {
  const query = `
    mutation CreateProduct($input: ProductCreateInput!) {
      productCreate(product: $input) {
        product {
          id
          title
          handle
          status
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;
  return shopifyGraphQL(query, { input });
}

export async function updateShopifyProduct(input: { productId: string; [key: string]: unknown }) {
  const { productId, ...product } = input;
  const query = `
    mutation UpdateProduct($input: ProductUpdateInput!) {
      productUpdate(product: $input) {
        product {
          id
          title
          handle
          status
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;
  return shopifyGraphQL(query, { input: { id: productId, ...product } });
}

export async function getShopifyProductByHandle(handle: string) {
  const query = `
    query GetProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
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
        seo {
          title
          description
        }
        images(first: 10) {
          edges {
            node {
              id
              url
              altText
            }
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, { handle });
}

export async function getShopifyCollections(first = 20) {
  const query = `
    query GetCollections($first: Int!) {
      collections(first: $first) {
        edges {
          node {
            id
            title
            handle
            descriptionHtml
            productsCount {
              count
            }
            updatedAt
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, { first });
}

export async function getShopifyProducts(first = 20) {
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
            seo {
              title
              description
            }
            images(first: 10) {
              edges {
                node {
                  id
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  `;

  return shopifyGraphQL(query, { first });
}
