import { describe, expect, test } from "vitest";
import { createSupabaseExecutionRepository } from "../lib/execution/supabase-repository";

describe("Supabase scheduler repository", () => {
  test("claims a scheduled job atomically through the idempotency and lease RPC", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const repository = createSupabaseExecutionRepository({
      url: "https://project.supabase.co",
      serviceRoleKey: "service-role-secret",
      request: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(JSON.stringify([{
          claimed: true,
          id: "job-1",
          job_name: "inbox_triage",
          idempotency_key: "inbox_triage:2026-08-18T09:00:00.000Z",
          agent_name: "inbox_triage_agent",
          status: "running",
          attempt_count: 1,
          max_attempts: 3,
          lease_expires_at: "2026-08-18T09:05:00.000Z",
          created_at: "2026-08-18T09:00:00.000Z",
          updated_at: "2026-08-18T09:00:00.000Z",
        }]), { status: 200 });
      },
    });

    const claim = await repository.claimScheduledJob({
      jobName: "inbox_triage",
      idempotencyKey: "inbox_triage:2026-08-18T09:00:00.000Z",
      agentName: "inbox_triage_agent",
      maxAttempts: 3,
      leaseSeconds: 300,
    });

    expect(requests[0].url).toBe("https://project.supabase.co/rest/v1/rpc/claim_scheduled_job");
    expect(JSON.parse(requests[0].init?.body as string)).toEqual({
      p_job_name: "inbox_triage",
      p_idempotency_key: "inbox_triage:2026-08-18T09:00:00.000Z",
      p_agent_name: "inbox_triage_agent",
      p_max_attempts: 3,
      p_lease_seconds: 300,
    });
    expect(claim).toMatchObject({ claimed: true, job: { id: "job-1", status: "running", attemptCount: 1 } });
  });

  test("returns a concurrency block when another delivery holds the active job lease", async () => {
    const repository = createSupabaseExecutionRepository({
      url: "https://project.supabase.co",
      serviceRoleKey: "service-role-secret",
      request: async () => new Response(JSON.stringify([{
        claimed: false,
        claim_reason: "concurrency_limited",
        id: "job-1",
        job_name: "inbox_triage",
        idempotency_key: "inbox_triage:2026-08-18T09:00:00.000Z",
        agent_name: "inbox_triage_agent",
        status: "running",
        attempt_count: 1,
        max_attempts: 3,
        retryable: false,
        lease_expires_at: "2026-08-18T09:05:00.000Z",
        created_at: "2026-08-18T09:00:00.000Z",
        updated_at: "2026-08-18T09:00:00.000Z",
      }]), { status: 200 }),
    });

    await expect(repository.claimScheduledJob({
      jobName: "inbox_triage",
      idempotencyKey: "inbox_triage:2026-08-18T09:05:00.000Z",
      agentName: "inbox_triage_agent",
      maxAttempts: 3,
      leaseSeconds: 300,
    })).resolves.toMatchObject({ claimed: false, reason: "concurrency_limited", job: { id: "job-1" } });
  });

  test("completes a claimed scheduler job through the compare-and-set completion RPC", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const repository = createSupabaseExecutionRepository({
      url: "https://project.supabase.co",
      serviceRoleKey: "service-role-secret",
      request: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(JSON.stringify([{
          id: "job-1",
          job_name: "inbox_triage",
          idempotency_key: "inbox_triage:2026-08-18T09:00:00.000Z",
          agent_name: "inbox_triage_agent",
          status: "retry_scheduled",
          attempt_count: 1,
          max_attempts: 3,
          retryable: true,
          last_error_code: "gmail_rate_limited",
          next_retry_at: "2026-08-18T09:00:01.000Z",
          created_at: "2026-08-18T09:00:00.000Z",
          updated_at: "2026-08-18T09:00:00.000Z",
        }]), { status: 200 });
      },
    });

    const job = await repository.completeScheduledJob({
      jobId: "job-1",
      status: "retry_scheduled",
      retryable: true,
      lastErrorCode: "gmail_rate_limited",
      nextRetryAt: "2026-08-18T09:00:01.000Z",
    });

    expect(requests[0].url).toBe("https://project.supabase.co/rest/v1/rpc/complete_scheduled_job");
    expect(JSON.parse(requests[0].init?.body as string)).toEqual({
      p_job_id: "job-1",
      p_status: "retry_scheduled",
      p_retryable: true,
      p_last_error_code: "gmail_rate_limited",
      p_next_retry_at: "2026-08-18T09:00:01.000Z",
    });
    expect(job).toMatchObject({ id: "job-1", status: "retry_scheduled", retryable: true, lastErrorCode: "gmail_rate_limited" });
  });
});
