/**
 * 产品图片 alt 文案。
 *
 * 后台 alt 可能为空、过于笼统，或直接等于产品名；
 * 这里统一补上产品名，同时避免出现「产品名 - 产品名」的重复。
 */
export function productImageAlt(
  productName: string,
  alt: string | null | undefined,
  index = 0
): string {
  const name = productName.trim();
  const text = alt?.trim();

  if (!text) return `${name} 产品图 ${index + 1}`;
  if (text.includes(name)) return text;
  return `${name} - ${text}`;
}
