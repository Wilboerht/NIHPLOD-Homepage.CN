/**
 * 轻量行级 diff（LCS），仅用于法务文档版本对比
 *
 * 不引入额外依赖；单侧超过 MAX_DIFF_LINES 时返回 null，
 * 由 UI 降级为“章节已修改”的提示，避免在超长章节上阻塞主线程。
 */
export type DiffLineType = "same" | "add" | "remove";

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

const MAX_DIFF_LINES = 800;

export function diffLines(oldText: string, newText: string): DiffLine[] | null {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  if (oldLines.length > MAX_DIFF_LINES || newLines.length > MAX_DIFF_LINES) {
    return null;
  }

  const n = oldLines.length;
  const m = newLines.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: "same", text: oldLines[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "remove", text: oldLines[i] });
      i += 1;
    } else {
      result.push({ type: "add", text: newLines[j] });
      j += 1;
    }
  }
  while (i < n) {
    result.push({ type: "remove", text: oldLines[i] });
    i += 1;
  }
  while (j < m) {
    result.push({ type: "add", text: newLines[j] });
    j += 1;
  }
  return result;
}
