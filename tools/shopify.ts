const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

type ShopifyVariables = Record<string, unknown>;

export async function shopifyGraphQL(query: string, variables: ShopifyVariables = {}) {
  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
    throw new Error("Shopify credentials are not configured");
  }

  const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2026-04/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  return response.json();
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
