const UTF8_FILENAME_RE = /filename\*=UTF-8''([^;]+)/i;
const FILENAME_RE = /filename="?([^";]+)"?/i;

/**
 * 从 Content-Disposition 解析下载文件名。支持 RFC 5987 的 filename* 与普通 filename。
 * 仅用于浏览器 download 属性，因此去掉路径分隔符，避免被解释为路径。
 */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = header.match(UTF8_FILENAME_RE);
  const plainMatch = header.match(FILENAME_RE);
  let decoded = utf8Match?.[1]?.trim() ?? plainMatch?.[1]?.trim();
  if (!decoded) return null;

  if (utf8Match) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // filename* 非法时回退到普通 filename，避免丢失服务端文件名
      decoded = plainMatch?.[1]?.trim();
      if (!decoded) return null;
    }
  }
  decoded = decoded.replace(/^["']|["']$/g, "").replace(/[\\/]/g, "_").trim();
  return decoded || null;
}

async function readDownloadError(response: Response): Promise<string> {
  let fallback = `下载失败（HTTP ${response.status}）`;
  if (response.status === 401) fallback = "登录已过期，请重新登录";
  else if (response.status === 403) fallback = "没有下载权限";
  const text = await response.text().catch(() => "");
  if (!text) return fallback;
  if ((response.headers.get("Content-Type") || "").includes("text/html")) return fallback;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return parsed.error?.message || parsed.message || fallback;
  } catch {
    return text.slice(0, 200).trim() || fallback;
  }
}

/**
 * 通过 fetch 携带同源 Cookie 下载文件，再以 blob 触发保存。
 *
 * 相比 window.open：能捕获 401/403/500，前台可提示具体错误；不新开空白标签页；
 * 响应头缺失时也能使用调用方提供的 fallback 文件名。
 */
export async function downloadFromUrl(
  url: string,
  fallbackFilename: string,
  options: { signal?: AbortSignal } = {}
): Promise<void> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readDownloadError(response));
  }

  const blob = await response.blob();
  const filename =
    parseContentDispositionFilename(response.headers.get("Content-Disposition")) ??
    fallbackFilename;
  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // 给浏览器留出启动下载的时间；立即 revoke 在部分 Safari/旧内核上会取消下载。
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
