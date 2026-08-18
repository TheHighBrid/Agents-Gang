export type StructuredLogEvent = {
  event: string;
  correlationId?: string;
  runId?: string;
  agent?: string;
  route?: string;
  provider?: string;
  tool?: string;
  riskLevel?: number;
  approvalId?: string;
  durationMs?: number;
  outcome: "succeeded" | "failed" | "blocked";
  payload?: unknown;
};

type StructuredLoggerOptions = {
  write?: (event: Omit<StructuredLogEvent, "payload">) => void;
};

export function createStructuredLogger({
  write = (event) => console.info(JSON.stringify(event)),
}: StructuredLoggerOptions = {}) {
  return {
    record({ payload, ...event }: StructuredLogEvent) {
      void payload;
      write(event);
    },
  };
}
