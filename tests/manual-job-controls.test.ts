import { describe, expect, test } from "vitest";

import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import {
  ManualJobControlError,
  authorizeOperatorRequest,
  createManualJobController,
  type ManualJobDefinition,
} from "../lib/scheduler/manual-job-controls";

function createJob(): ManualJobDefinition {
  return {
    name: "daily-melato-audit",
    async run({ repository, idempotencyKey, correlationId }) {
      const run = await repository.createAgentRun({
        agentName: "shopify_ops_agent",
        provider: "system",
        model: "test-runner",
        routeAgent: "shopify_ops_agent",
        riskLevel: 1,
        idempotencyKey,
        correlationId,
      });
      await repository.completeAgentRun({ runId: run.id, status: "completed" });
      return { runId: run.id, duplicate: false };
    },
  };
}

describe("protected manual job controls", () => {
  test("rejects requests without the configured operator role and bearer credential", () => {
    try {
      authorizeOperatorRequest(
        new Request("http://localhost/api/jobs/daily-melato-audit", { method: "POST" }),
        { OPERATOR_CONTROL_TOKEN: "operator-secret" },
      );
      throw new Error("Expected operator authorization to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ManualJobControlError);
      expect(error).toMatchObject({ code: "unauthorized_operator", status: 403 });
    }
  });

  test("runs an eligible job for an authorized operator and records a safe audit event", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: (() => {
      let id = 0;
      return () => `record-${++id}`;
    })() });
    const controller = createManualJobController({ repository, jobs: [createJob()] });

    const result = await controller.trigger({
      jobName: "daily-melato-audit",
      idempotencyKey: "manual:daily-audit:001",
      operatorId: "founder-1",
      correlationId: "control-001",
    });

    expect(result).toMatchObject({ runId: "record-1", duplicate: false, jobName: "daily-melato-audit" });
    await expect(repository.listAuditEvents()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: "record-1",
          correlationId: "control-001",
          eventType: "operator_control.triggered",
          outcome: "succeeded",
          metadata: { jobName: "daily-melato-audit", action: "trigger" },
        }),
      ]),
    );
  });

  test("suppresses duplicate manual trigger keys before a second job execution", async () => {
    const repository = createInMemoryExecutionRepository();
    const controller = createManualJobController({ repository, jobs: [createJob()] });
    const input = {
      jobName: "daily-melato-audit",
      idempotencyKey: "manual:daily-audit:duplicate",
      operatorId: "founder-1",
      correlationId: "control-duplicate",
    };

    await controller.trigger(input);
    const duplicate = await controller.trigger(input);

    expect(duplicate).toMatchObject({ duplicate: true, skippedReason: "duplicate" });
    await expect(repository.listAgentRuns()).resolves.toHaveLength(1);
    await expect(repository.listAuditEvents()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "operator_control.duplicate", outcome: "blocked" }),
      ]),
    );
  });

  test("rejects retries for non-retryable failed runs", async () => {
    const repository = createInMemoryExecutionRepository();
    const run = await repository.createAgentRun({
      agentName: "shopify_ops_agent", provider: "system", model: "test-runner",
      routeAgent: "shopify_ops_agent", riskLevel: 1,
    });
    await repository.completeAgentRun({ runId: run.id, status: "failed", errorCode: "scheduled_job_failed" });
    const controller = createManualJobController({ repository, jobs: [createJob()] });

    await expect(controller.retry({
      jobName: "daily-melato-audit",
      failedRunId: run.id,
      idempotencyKey: "manual:retry:001",
      operatorId: "founder-1",
      correlationId: "control-retry",
    })).rejects.toMatchObject({ code: "retry_not_eligible", status: 409 });
  });

  test("rejects retries after the configured retry budget is exhausted", async () => {
    const repository = createInMemoryExecutionRepository();
    const failed = await repository.createAgentRun({
      agentName: "shopify_ops_agent", provider: "system", model: "test-runner",
      routeAgent: "shopify_ops_agent", riskLevel: 1,
      idempotencyKey: "original-run",
    });
    await repository.completeAgentRun({ runId: failed.id, status: "failed", errorCode: "scheduled_job_retryable" });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await repository.createAgentRun({
        agentName: "shopify_ops_agent", provider: "system", model: "test-runner",
        routeAgent: "shopify_ops_agent", riskLevel: 1,
        idempotencyKey: `retry:${failed.id}:${attempt}`,
      });
    }
    const controller = createManualJobController({ repository, jobs: [createJob()] });

    await expect(controller.retry({
      jobName: "daily-melato-audit",
      failedRunId: failed.id,
      idempotencyKey: "manual:retry:exhausted",
      operatorId: "founder-1",
      correlationId: "control-retry-exhausted",
    })).rejects.toMatchObject({ code: "retry_exhausted", status: 409 });
  });
});


test("scopes a successful retry idempotency key to the failed run", async () => {
  const repository = createInMemoryExecutionRepository({ idFactory: (() => {
    let id = 0;
    return () => `retry-record-${++id}`;
  })() });
  const failed = await repository.createAgentRun({
    agentName: "shopify_ops_agent", provider: "system", model: "test-runner",
    routeAgent: "shopify_ops_agent", riskLevel: 1,
  });
  await repository.completeAgentRun({
    runId: failed.id,
    status: "failed",
    errorCode: "scheduled_job_retryable",
  });
  const controller = createManualJobController({ repository, jobs: [createJob()] });

  await controller.retry({
    jobName: "daily-melato-audit",
    failedRunId: failed.id,
    idempotencyKey: "manual:retry:accepted",
    operatorId: "founder-1",
    correlationId: "control-retry-accepted",
  });

  await expect(repository.listAgentRuns()).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ idempotencyKey: `retry:${failed.id}:manual:retry:accepted` }),
    ]),
  );
});


test("suppresses concurrent manual triggers with the same idempotency key", async () => {
  const repository = createInMemoryExecutionRepository();
  let executions = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const job: ManualJobDefinition = {
    name: "daily-melato-audit",
    async run() {
      executions += 1;
      await pending;
      return { runId: "run-concurrent", duplicate: false };
    },
  };
  const controller = createManualJobController({ repository, jobs: [job] });
  const input = {
    jobName: "daily-melato-audit",
    idempotencyKey: "manual:daily-audit:concurrent",
    operatorId: "founder-1",
    correlationId: "control-concurrent",
  };

  const first = controller.trigger(input);
  await Promise.resolve();
  const secondPromise = controller.trigger(input);
  release();
  const second = await secondPromise;
  await first;

  expect(executions).toBe(1);
  expect(second).toMatchObject({ duplicate: true, skippedReason: "duplicate" });
});
