import { beforeEach, describe, expect, test, vi } from "vitest";

const trigger = vi.fn();
const retry = vi.fn();
vi.mock("../lib/scheduler/protected-job-controller", () => ({
  createProtectedJobController: () => ({ trigger, retry }),
}));

import { POST } from "../app/api/jobs/route";

const originalToken = process.env.OPERATOR_CONTROL_TOKEN;

function request(body: unknown, headers: HeadersInit = {}) {
  return new Request("http://localhost/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs", () => {
  beforeEach(() => {
    process.env.OPERATOR_CONTROL_TOKEN = "operator-secret";
    trigger.mockReset();
    retry.mockReset();
  });

  test("rejects an unauthorized manual job request before invoking a job", async () => {
    const response = await POST(request({
      action: "trigger",
      jobName: "daily-melato-audit",
      idempotencyKey: "manual:daily-audit:001",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Operator authorization is required", code: "unauthorized_operator" });
    expect(trigger).not.toHaveBeenCalled();
  });

  test("runs a validated authorized manual trigger with a safe correlation ID", async () => {
    trigger.mockResolvedValue({ jobName: "daily-melato-audit", runId: "run-1", duplicate: false });
    const response = await POST(request({
      action: "trigger",
      jobName: "daily-melato-audit",
      idempotencyKey: "manual:daily-audit:002",
    }, {
      authorization: "Bearer operator-secret",
      "x-operator-role": "operator",
      "x-operator-id": "founder-1",
      "x-correlation-id": "control-route-001",
    }));

    expect(response.status).toBe(202);
    expect(trigger).toHaveBeenCalledWith(expect.objectContaining({
      jobName: "daily-melato-audit",
      idempotencyKey: "manual:daily-audit:002",
      operatorId: "founder-1",
      correlationId: "control-route-001",
    }));
    expect(response.headers.get("x-correlation-id")).toBe("control-route-001");
    await expect(response.json()).resolves.toMatchObject({
      job: { jobName: "daily-melato-audit", runId: "run-1", duplicate: false },
      correlationId: "control-route-001",
    });
  });

  test("validates retry requests before invoking the controller", async () => {
    const response = await POST(request({
      action: "retry",
      jobName: "daily-melato-audit",
      idempotencyKey: "manual:daily-audit:003",
    }, {
      authorization: "Bearer operator-secret",
      "x-operator-role": "operator",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "failedRunId is required for retry requests", code: "invalid_request" });
    expect(retry).not.toHaveBeenCalled();
  });
});


test("records a payload-safe audit log for rejected operator requests", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const response = await POST(request({
    action: "trigger",
    jobName: "daily-melato-audit",
    idempotencyKey: "manual:daily-audit:004",
    protectedPayload: "must-not-appear",
  }));

  expect(response.status).toBe(403);
  expect(log).toHaveBeenCalledOnce();
  expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({
    event: "operator_control.rejected",
    outcome: "blocked",
    correlationId: expect.any(String),
  });
  expect(log.mock.calls[0][0]).not.toContain("must-not-appear");
  log.mockRestore();
});
