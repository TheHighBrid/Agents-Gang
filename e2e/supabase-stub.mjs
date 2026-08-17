import http from "node:http";

const records = {
  agent_runs: [
    {
      id: "e2e-run-1",
      agent_name: "product_page_agent",
      provider: "anthropic",
      model: "claude-test",
      route_agent: "product_page_agent",
      risk_level: 1,
      status: "completed",
      created_at: "2026-08-17T12:00:00.000Z",
      completed_at: "2026-08-17T12:00:02.000Z",
      input_summary: "Audit the OVUM product page.",
      output_summary: "Product page audit completed.",
      duration_ms: 2000,
    },
  ],
  routing_decisions: [
    {
      id: "e2e-route-1",
      run_id: "e2e-run-1",
      selected_agent: "product_page_agent",
      risk_level: 1,
      reason: "The request asks for a product-page audit.",
      needed_tools: ["shopify.products.read"],
      approval_required: false,
      created_at: "2026-08-17T12:00:00.000Z",
    },
  ],
  audit_events: [
    {
      id: "e2e-audit-1",
      run_id: "e2e-run-1",
      agent_name: "product_page_agent",
      event_type: "agent.run.completed",
      outcome: "succeeded",
      metadata: { source: "e2e" },
      created_at: "2026-08-17T12:00:02.000Z",
    },
  ],
  approval_requests: [],
};

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  const resource = request.url?.split("?")[0]?.replace(/^\/rest\/v1\//, "");
  if (resource && request.headers.authorization !== "Bearer e2e-service-role-key") {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Missing service-role authorization" }));
    return;
  }

  if (request.method === "GET" && resource && resource in records) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(records[resource]));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(54321, "127.0.0.1");
