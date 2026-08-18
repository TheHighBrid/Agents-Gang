import { describe, expect, test } from "vitest";
import { scanContentForSecrets } from "../scripts/scan-secrets.mjs";

describe("committed secret scanner", () => {
  test("detects high-confidence credential signatures without returning the secret value", () => {
    const secret = `sk-ant-${"A".repeat(32)}`;
    const findings = scanContentForSecrets("fixture.ts", `const key = "${secret}";`);

    expect(findings).toEqual([
      expect.objectContaining({ path: "fixture.ts", rule: "anthropic_api_key", line: 1 }),
    ]);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("detects private keys and live-looking Shopify/GitHub/AWS credentials", () => {
    const content = [
      `shopify=${`shpat_${"B".repeat(32)}`}`,
      `github=${`ghp_${"C".repeat(36)}`}`,
      `aws=AKIA${"D".repeat(16)}`,
      "-----BEGIN PRIVATE KEY-----",
    ].join("\n");
    const findings = scanContentForSecrets("fixture.env", content);
    expect(findings.map((finding) => finding.rule)).toEqual([
      "shopify_admin_token",
      "github_token",
      "aws_access_key",
      "private_key",
    ]);
  });

  test("does not flag documented placeholders", () => {
    const content = [
      "ANTHROPIC_API_KEY=your_anthropic_api_key",
      "SHOPIFY_ADMIN_ACCESS_TOKEN=your_shopify_admin_token",
      "DATABASE_URL=postgresql://db_user:db_password@db.example.com:5432/agents_gang",
    ].join("\n");
    expect(scanContentForSecrets(".env.example", content)).toEqual([]);
  });
});
