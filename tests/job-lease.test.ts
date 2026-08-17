import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";

describe("scheduled job leases", () => {
  test("allows one owner to acquire and blocks a competing owner", async () => {
    const repository = createInMemoryExecutionRepository({
      clock: () => new Date("2026-08-17T12:00:00.000Z"),
      idFactory: (() => {
        let count = 0;
        return () => `lease-${++count}`;
      })(),
    });

    const first = await repository.acquireJobLease({
      leaseKey: "daily-audit",
      ownerId: "worker-a",
      leaseDurationMs: 30_000,
    });
    const competing = await repository.acquireJobLease({
      leaseKey: "daily-audit",
      ownerId: "worker-b",
      leaseDurationMs: 30_000,
    });

    expect(first).toMatchObject({ leaseKey: "daily-audit", ownerId: "worker-a" });
    expect(competing).toBeUndefined();
  });

  test("allows takeover after expiry and only the current owner can release", async () => {
    let now = new Date("2026-08-17T12:00:00.000Z");
    const repository = createInMemoryExecutionRepository({
      clock: () => now,
      idFactory: () => "lease-1",
    });

    await repository.acquireJobLease({ leaseKey: "weekly-radar", ownerId: "worker-a", leaseDurationMs: 10_000 });
    now = new Date("2026-08-17T12:00:11.000Z");
    const takeover = await repository.acquireJobLease({
      leaseKey: "weekly-radar",
      ownerId: "worker-b",
      leaseDurationMs: 10_000,
    });

    expect(takeover).toMatchObject({ ownerId: "worker-b" });
    await expect(repository.releaseJobLease({ leaseKey: "weekly-radar", ownerId: "worker-a" })).resolves.toBe(false);
    await expect(repository.releaseJobLease({ leaseKey: "weekly-radar", ownerId: "worker-b" })).resolves.toBe(true);
  });
});
