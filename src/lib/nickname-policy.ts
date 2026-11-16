/**
 * 昵称内容合规校验（本地实现，无外部 API / 无网络调用）。
 *
 * 处理策略：
 * - 归一化：NFKC（全角→半角、兼容字符折叠）→ 小写 → 去组合附加符 →
 *   仅保留 Unicode 字母/数字，去掉空格、标点、符号、零宽字符。
 *   因此「色 情」「色*情」「色\u200b情」「ｐｏｒｎ」等变体都能命中词表。
 * - 匹配：基于词表构建 Trie，对归一化后的昵称做子串匹配。
 * - 字符集：拒绝控制字符、格式字符（零宽/双向覆盖等，组合 emoji 的 ZWJ 除外）、
 *   代理项、私有区、行/段分隔符；允许中英文、数字、emoji、常规标点。
 * - 空昵称（或纯空白）表示「清除昵称」，放行。
 *
 * 限制：不做拼音/同音字/繁体自动转换，繁体变体在词表中显式登记。
 */
import { NICKNAME_BANNED_WORDS, type NicknameBanCategory } from "@/config/nickname-banned-words";

export type { NicknameBanCategory };

export type NicknameCheckFailureReason = "banned" | "invalid_chars";

export type NicknameCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: NicknameCheckFailureReason;
      category?: NicknameBanCategory;
    };

export const NICKNAME_BANNED_MESSAGE = "昵称包含违规内容，请修改后重试";
export const NICKNAME_INVALID_CHARS_MESSAGE = "昵称包含不可用字符，请修改后重试";
export const NICKNAME_REJECTED_MESSAGE = "昵称包含违规内容或不可用字符，请修改后重试";

// 使用 RegExp 构造器而非字面量：tsconfig target=ES2017 不允许直接书写 \p{...} 字面量。
const COMBINING_MARKS_RE = new RegExp("\\p{M}+", "gu");
const NON_LETTER_OR_NUMBER_RE = new RegExp("[^\\p{L}\\p{N}]+", "gu");
// Cc 控制符 / Cs 代理项 / Co 私有区 / Zl/Zp 行段分隔符
const DISALLOWED_CHAR_RE = new RegExp("[\\p{Cc}\\p{Cs}\\p{Co}\\p{Zl}\\p{Zp}]", "u");
// Cf 格式符：零宽、双向覆盖、BOM 等不可见字符
const FORMAT_CHAR_RE = new RegExp("\\p{Cf}", "gu");
// ZWJ（U+200D）是组合 emoji 的合法连接符（如 👨‍👩‍👧），单独放行；
// 匹配前仍会被归一化剥离，无法用于绕过违规词。
const ALLOWED_FORMAT_CHARS = new Set(["\u200D"]);

function hasDisallowedChar(raw: string): boolean {
  if (DISALLOWED_CHAR_RE.test(raw)) return true;
  const formatChars = raw.match(FORMAT_CHAR_RE);
  if (!formatChars) return false;
  return formatChars.some((char) => !ALLOWED_FORMAT_CHARS.has(char));
}

/** 归一化为仅含字母/数字的小写串，用于违规词匹配 */
export function normalizeNicknameForMatching(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(COMBINING_MARKS_RE, "")
    .replace(NON_LETTER_OR_NUMBER_RE, "");
}

interface TrieEntry {
  word: string;
  category: NicknameBanCategory;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  entry?: TrieEntry;
}

const TRIE_ROOT: TrieNode = { children: new Map() };

for (const item of NICKNAME_BANNED_WORDS) {
  const normalized = normalizeNicknameForMatching(item.word);
  // 单字词误伤面过大，统一不收；词表中的双字及以上词条正常构建。
  if (normalized.length < 2) continue;
  let node = TRIE_ROOT;
  for (const char of normalized) {
    let next = node.children.get(char);
    if (!next) {
      next = { children: new Map() };
      node.children.set(char, next);
    }
    node = next;
  }
  if (!node.entry) {
    node.entry = { word: item.word, category: item.category };
  }
}

function findBannedMatch(normalized: string): TrieEntry | null {
  const chars = Array.from(normalized);
  for (let start = 0; start < chars.length; start += 1) {
    let node: TrieNode | undefined = TRIE_ROOT;
    for (let index = start; index < chars.length; index += 1) {
      node = node.children.get(chars[index]);
      if (!node) break;
      if (node.entry) return node.entry;
    }
  }
  return null;
}

/**
 * 校验昵称内容。
 * 入参应当是原始昵称（未 trim 也可）；空串或纯空白视为清除昵称，放行。
 */
export function checkNicknameContent(raw: string): NicknameCheckResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true };

  if (hasDisallowedChar(trimmed)) {
    return { ok: false, reason: "invalid_chars" };
  }

  const normalized = normalizeNicknameForMatching(trimmed);
  if (!normalized) return { ok: true };

  const match = findBannedMatch(normalized);
  if (match) {
    return { ok: false, reason: "banned", category: match.category };
  }
  return { ok: true };
}

export interface ProviderNicknameResult {
  /** 可落库/可下发的昵称；命中违规时为 null（调用方回退默认昵称） */
  nickname: string | null;
  blocked: boolean;
  reason?: NicknameCheckFailureReason;
  category?: NicknameBanCategory;
}

/**
 * 第三方平台昵称兜底：命中违规/不可用字符时返回 null，调用方回退
 * `用户_${手机号后四位}`，不得阻断第三方登录。
 */
export function sanitizeProviderNickname(raw: string | null | undefined): ProviderNicknameResult {
  if (raw === null || raw === undefined) return { nickname: null, blocked: false };
  const trimmed = raw.trim();
  if (!trimmed) return { nickname: null, blocked: false };

  const result = checkNicknameContent(trimmed);
  if (!result.ok) {
    return {
      nickname: null,
      blocked: true,
      reason: result.reason,
      category: result.category,
    };
  }
  return { nickname: trimmed, blocked: false };
}

/** 与微信绑定流程既有口径一致的默认昵称 */
export function defaultNicknameForPhone(phone: string): string {
  return `用户_${phone.slice(-4)}`;
}

/** 供扫描脚本/运维展示使用的词表规模 */
export function getNicknameBannedWordCount(): number {
  return NICKNAME_BANNED_WORDS.length;
}
