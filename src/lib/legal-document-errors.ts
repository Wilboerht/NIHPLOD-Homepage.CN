/**
 * 法务文档领域错误
 *
 * API 路由统一把该错误映射为对应 HTTP 状态码；服务层不直接依赖 NextResponse。
 */
export type LegalDocumentErrorCode =
  "NOT_FOUND" | "STALE_UPDATE" | "NO_CHANGES" | "NO_DRAFT" | "INVALID_CONTENT";

export class LegalDocumentError extends Error {
  constructor(
    public readonly code: LegalDocumentErrorCode,
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "LegalDocumentError";
  }
}
