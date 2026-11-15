import { baActorHeader, type BaCertificateAdmin } from "@/lib/ba-certificates";
import { baInternalRequest, baInternalStream } from "@/lib/ba-internal";

export interface BaActorRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  idempotencyKey?: string | null;
  timeoutMs?: number;
}

/** 所有需要确认操作人身份的 BA 内部调用统一走签名 actor header。 */
export async function baActorRequest<T>(
  admin: BaCertificateAdmin,
  path: string,
  options: BaActorRequestOptions = {}
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

export async function baActorStream(
  admin: BaCertificateAdmin,
  path: string,
  options: Pick<BaActorRequestOptions, "method" | "query" | "body" | "timeoutMs"> = {}
) {
  return baInternalStream(path, {
    method: options.method,
    query: options.query,
    body: options.body,
    timeoutMs: options.timeoutMs,
    headers: { "x-internal-actor": baActorHeader(admin) },
  });
}

export async function baCertificateRequest<T>(
  admin: BaCertificateAdmin,
  path: string,
  options: BaActorRequestOptions = {}
) {
  return baActorRequest<T>(admin, path, options);
}

export async function baCertificateStream(
  admin: BaCertificateAdmin,
  path: string,
  options: Pick<BaActorRequestOptions, "query" | "timeoutMs"> = {}
) {
  return baActorStream(admin, path, options);
}
