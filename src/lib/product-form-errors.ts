import type { ZodIssue } from "zod";

/**
 * 将 ProductSchema 的 Zod issue 转成表单字段错误。
 *
 * 购买链接和 GEO FAQ 都是数组字段，需要把 "purchaseLinks.0.url"
 * / "geoFaqs.0.question" 映射回表单实际行号。
 */
export function mapProductFormIssues(
  issues: ZodIssue[],
  purchaseLinkIndexes: { index: number }[]
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of issues) {
    const path = issue.path.map(String);

    if (path[0] === "purchaseLinks" && path[1] !== undefined) {
      const actualIndex = purchaseLinkIndexes[Number(path[1])]?.index;
      if (actualIndex === undefined) continue;
      const suffix = path.slice(2).join(".");
      fieldErrors[`purchaseLinks.${actualIndex}${suffix ? `.${suffix}` : ""}`] = issue.message;
      continue;
    }

    if (path[0] === "geoFaqs" && path[1] !== undefined) {
      const suffix = path.slice(2).join(".");
      fieldErrors[`geoFaqs.${path[1]}${suffix ? `.${suffix}` : ""}`] = issue.message;
      continue;
    }

    if (path[0]) {
      fieldErrors[path[0]] = issue.message;
    }
  }

  return fieldErrors;
}
