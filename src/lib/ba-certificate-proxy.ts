import { baActorHeader, type BaCertificateAdmin } from "@/lib/ba-certificates";
import { baInternalRequest, baInternalStream } from "@/lib/ba-internal";

export async function baCertificateRequest<T>(
  admin: BaCertificateAdmin,
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: unknown;
    idempotencyKey?: string | null;
    timeoutMs?: number;
  } = {}
) {
  return baInternalRequest<T>(path, {
    method: options.method,
    query: options.query,
    body: options.body,
    timeoutMs: options.timeoutMs,
    headers: {
      "x-internal-actor": baActorHeader(admin),
      ...(options.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {}),
    },
  });
}

export async function baCertificateStream(
  admin: BaCertificateAdmin,
  path: string,
  options: {
    query?: Record<string, string | number | boolean | null | undefined>;
    timeoutMs?: number;
  } = {}
) {
  return baInternalStream(path, {
    query: options.query,
    timeoutMs: options.timeoutMs,
    headers: { "x-internal-actor": baActorHeader(admin) },
  });
}
