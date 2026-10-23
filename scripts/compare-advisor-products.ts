/**
 * 主站产品目录 vs 测肤子站推荐产品库 · 只读盘点
 *
 * 用法：
 *   npx tsx scripts/compare-advisor-products.ts
 *
 * 输出：
 *   reports/advisor-product-diff-<timestamp>.csv
 *
 * 说明：
 * - 读取主站 Prisma Product + 子站内部快照接口
 * - 按归一化产品名（必要时叠加容量）匹配
 * - 只读，不写任何数据库
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

const useProductionEnv = process.argv.includes("--production");

// 默认只加载本地环境，避免误连生产数据库。
// 需要盘点生产数据时显式加 --production（脚本只读，不写库）。
// dotenv 默认不覆盖已注入的变量：--production 时生产文件先加载，优先于 .env.local。
if (useProductionEnv) {
    dotenv.config({ path: ".env.production.local" });
    dotenv.config({ path: ".env.production" });
}
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// 本地联调：主站与子站 INTERNAL_API_KEYS 不一致但 ADVISOR_INTERNAL_SECRET 相同时，
// 可加 --legacy-bearer 强制走旧版 Bearer（生产不要使用）。
if (process.argv.includes("--legacy-bearer")) {
    delete process.env.INTERNAL_API_KEYS;
    console.warn("已启用 legacy Bearer（仅限本地联调）");
}

const SNAPSHOT_PATH = "/api/internal/admin/product-snapshot";
const SNAPSHOT_TIMEOUT_MS = 20_000;

interface MainProduct {
    id: string;
    name: string;
    nameEn: string | null;
    price: unknown;
    capacity: string | null;
    description: string;
    ingredients: string | null;
    benefits: string[];
    origin: string | null;
    published: boolean;
    updatedAt: Date;
    images: Array<{ url: string }>;
    purchaseLinks: Array<{
        platform: string;
        platformKey: string | null;
        url: string;
        miniProgramShortLink: string | null;
        miniProgramPath: string | null;
    }>;
}

interface SubsiteProduct {
    id: string;
    name: string;
    category: string;
    price: string;
    capacity: string | null;
    image: string;
    images: unknown;
    description: string;
    keyIngredients: unknown;
    benefits: unknown;
    suitableSkinTypes: unknown;
    negativeFor: unknown;
    recommendReasons: unknown;
    purchaseLinks: unknown;
    affiliateLinks: unknown;
    active: boolean;
    featured: boolean;
    updatedAt: string;
}

interface LinkSnapshot {
    url: string;
    short: string;
    path: string;
}

interface DiffRow {
    status: "matched" | "main_only" | "subsite_only";
    matchNote: string;
    diffFields: string[];
    main?: MainProduct;
    subsite?: SubsiteProduct;
    linkDiff: string[];
}

function normalize(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[（）()【】[\]·,，.。/\\\-—_]/g, "");
}

function toNumber(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    // Prisma Decimal 等对象：走 toString 再解析
    if (value && typeof value === "object") {
        const parsed = Number.parseFloat(String(value));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function firstImage(value: unknown, fallback = ""): string {
    if (Array.isArray(value) && value.length > 0) {
        const first = value[0];
        if (typeof first === "string") return first;
        if (first && typeof first === "object") {
            const record = first as Record<string, unknown>;
            if (typeof record.url === "string") return record.url;
            if (typeof record.src === "string") return record.src;
        }
    }
    return fallback;
}

function imageKey(url: string): string {
    if (!url) return "";
    try {
        const pathname = new URL(url).pathname;
        return pathname.split("/").filter(Boolean).pop()?.toLowerCase() ?? url.toLowerCase();
    } catch {
        return url.split("/").filter(Boolean).pop()?.toLowerCase() ?? url.toLowerCase();
    }
}

function mainLinks(product: MainProduct): Map<string, LinkSnapshot> {
    const map = new Map<string, LinkSnapshot>();
    for (const link of product.purchaseLinks) {
        const key = link.platformKey || normalize(link.platform);
        map.set(key, {
            url: link.url || "",
            short: link.miniProgramShortLink || "",
            path: link.miniProgramPath || "",
        });
    }
    return map;
}

function readString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeSubsiteLinks(product: SubsiteProduct): Map<string, LinkSnapshot> {
    const map = new Map<string, LinkSnapshot>();
    if (Array.isArray(product.purchaseLinks)) {
        for (const item of product.purchaseLinks) {
            if (!item || typeof item !== "object") continue;
            const record = item as Record<string, unknown>;
            const platformKey =
                typeof record.platformKey === "string"
                    ? record.platformKey
                    : typeof record.platform === "string"
                      ? normalize(record.platform)
                      : "";
            if (!platformKey || map.has(platformKey)) continue;
            map.set(platformKey, {
                url: readString(record.url),
                short: readString(record.miniProgramShortLink),
                path: readString(record.miniProgramPath),
            });
        }
    }

    // 兼容旧 affiliateLinks：taobao → tmall，仅补齐新结构缺失的渠道
    if (product.affiliateLinks && typeof product.affiliateLinks === "object" && !Array.isArray(product.affiliateLinks)) {
        const legacy = product.affiliateLinks as Record<string, unknown>;
        const aliases: Array<[string, string]> = [
            ["taobao", "tmall"],
            ["xiaohongshu", "xiaohongshu"],
            ["douyin", "douyin"],
        ];
        for (const [legacyKey, platformKey] of aliases) {
            if (map.has(platformKey)) continue;
            const url = readString(legacy[legacyKey]);
            if (url) map.set(platformKey, { url, short: "", path: "" });
        }
    }

    return map;
}

function compareLinks(
    main: Map<string, LinkSnapshot>,
    subsite: Map<string, LinkSnapshot>
): string[] {
    const diffs: string[] = [];
    const keys = new Set([...main.keys(), ...subsite.keys()]);
    for (const key of keys) {
        const a = main.get(key) ?? { url: "", short: "", path: "" };
        const b = subsite.get(key) ?? { url: "", short: "", path: "" };
        const fields: string[] = [];
        if (a.url !== b.url) fields.push("url");
        if (a.short !== b.short) fields.push("short");
        if (a.path !== b.path) fields.push("path");
        if (fields.length > 0) diffs.push(`${key}:${fields.join("+")}`);
    }
    return diffs;
}

function csvEscape(value: unknown): string {
    const text = value === null || value === undefined ? "" : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

function rowToCsv(row: DiffRow): string {
    const main = row.main;
    const subsite = row.subsite;
    return [
        row.status,
        row.matchNote,
        row.diffFields.join("|"),
        main?.id,
        main?.name,
        main?.nameEn,
        main ? toNumber(main.price) : "",
        main?.capacity,
        main ? imageKey(main.images[0]?.url ?? "") : "",
        main?.published,
        main?.updatedAt.toISOString(),
        main?.description.length,
        subsite?.id,
        subsite?.name,
        subsite?.category,
        subsite?.price,
        subsite?.capacity,
        subsite ? imageKey(firstImage(subsite.images, subsite.image)) : "",
        subsite?.active,
        subsite?.featured,
        subsite?.updatedAt,
        subsite?.description.length,
        row.linkDiff.join("|"),
    ]
        .map(csvEscape)
        .join(",");
}

async function main(): Promise<void> {
    const [{ prisma }, { advisorRequest }] = await Promise.all([
        import("@/lib/prisma"),
        import("@/lib/advisor-internal"),
    ]);

    try {
        const mainProducts = (await prisma.product.findMany({
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                name: true,
                nameEn: true,
                price: true,
                capacity: true,
                description: true,
                ingredients: true,
                benefits: true,
                origin: true,
                published: true,
                updatedAt: true,
                images: { orderBy: { order: "asc" }, select: { url: true } },
                purchaseLinks: {
                    orderBy: { order: "asc" },
                    select: {
                        platform: true,
                        platformKey: true,
                        url: true,
                        miniProgramShortLink: true,
                        miniProgramPath: true,
                    },
                },
            },
        })) as unknown as MainProduct[];

        const result = await advisorRequest<{
            success?: boolean;
            data?: {
                products?: SubsiteProduct[];
                truncated?: boolean;
                generatedAt?: string;
            };
        }>(SNAPSHOT_PATH, { timeoutMs: SNAPSHOT_TIMEOUT_MS });

        if (!result.ok) {
            throw new Error(`子站产品快照获取失败：${result.code} ${result.message}`);
        }
        const snapshot = result.data?.data;
        if (!snapshot || !Array.isArray(snapshot.products)) {
            throw new Error("子站产品快照返回结构异常");
        }

        const mainByName = new Map<string, MainProduct[]>();
        for (const product of mainProducts) {
            const key = normalize(product.name);
            const list = mainByName.get(key) ?? [];
            list.push(product);
            mainByName.set(key, list);
        }

        const rows: DiffRow[] = [];
        const matchedMainIds = new Set<string>();

        for (const subsite of snapshot.products) {
            const candidates = mainByName.get(normalize(subsite.name)) ?? [];
            let mainProduct: MainProduct | undefined;
            let matchNote = "";

            if (candidates.length === 1) {
                [mainProduct] = candidates;
            } else if (candidates.length > 1) {
                const capacityKey = normalize(subsite.capacity ?? "");
                mainProduct =
                    candidates.find((candidate) => normalize(candidate.capacity ?? "") === capacityKey) ??
                    candidates[0];
                matchNote = "duplicate_name";
            }

            if (!mainProduct) {
                rows.push({
                    status: "subsite_only",
                    matchNote: "",
                    diffFields: [],
                    subsite,
                    linkDiff: [],
                });
                continue;
            }

            matchedMainIds.add(mainProduct.id);

            const diffFields: string[] = [];
            const mainPrice = toNumber(mainProduct.price);
            const subsitePrice = toNumber(subsite.price);
            if (
                mainPrice !== null &&
                subsitePrice !== null &&
                Math.abs(mainPrice - subsitePrice) > 0.009
            ) {
                diffFields.push("price");
            } else if (
                (mainPrice === null) !== (subsitePrice === null) ||
                (mainPrice === null && mainProduct.price !== subsite.price)
            ) {
                diffFields.push("price");
            }

            if (normalize(mainProduct.capacity ?? "") !== normalize(subsite.capacity ?? "")) {
                diffFields.push("capacity");
            }

            const mainImage = imageKey(mainProduct.images[0]?.url ?? "");
            const subsiteImage = imageKey(firstImage(subsite.images, subsite.image));
            if (mainImage !== subsiteImage) {
                diffFields.push("image");
            }

            if (mainProduct.published !== subsite.active) {
                diffFields.push("published");
            }

            const linkDiff = compareLinks(mainLinks(mainProduct), normalizeSubsiteLinks(subsite));
            if (linkDiff.length > 0) {
                diffFields.push("links");
            }

            rows.push({
                status: "matched",
                matchNote,
                diffFields,
                main: mainProduct,
                subsite,
                linkDiff,
            });
        }

        for (const mainProduct of mainProducts) {
            if (matchedMainIds.has(mainProduct.id)) continue;
            rows.push({
                status: "main_only",
                matchNote: "",
                diffFields: [],
                main: mainProduct,
                linkDiff: [],
            });
        }

        const matched = rows.filter((row) => row.status === "matched");
        const diffCounts = new Map<string, number>();
        for (const row of matched) {
            for (const field of row.diffFields) {
                diffCounts.set(field, (diffCounts.get(field) ?? 0) + 1);
            }
        }

        const outDir = path.resolve(process.cwd(), "reports");
        fs.mkdirSync(outDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const outFile = path.join(outDir, `advisor-product-diff-${stamp}.csv`);
        const headers = [
            "status",
            "match_note",
            "diff_fields",
            "main_id",
            "main_name",
            "main_name_en",
            "main_price",
            "main_capacity",
            "main_image",
            "main_published",
            "main_updated_at",
            "main_description_length",
            "subsite_id",
            "subsite_name",
            "subsite_category",
            "subsite_price",
            "subsite_capacity",
            "subsite_image",
            "subsite_active",
            "subsite_featured",
            "subsite_updated_at",
            "subsite_description_length",
            "link_diff",
        ];
        fs.writeFileSync(
            outFile,
            [headers.join(","), ...rows.map(rowToCsv)].join("\n"),
            "utf8"
        );

        console.log("测肤产品数据盘点完成（只读）");
        console.log(`- 主站产品：${mainProducts.length}`);
        console.log(`- 子站产品：${snapshot.products.length}`);
        console.log(`- 已匹配：${matched.length}`);
        console.log(`- 仅主站：${rows.filter((row) => row.status === "main_only").length}`);
        console.log(`- 仅子站：${rows.filter((row) => row.status === "subsite_only").length}`);
        console.log(
            `- 存在差异的匹配产品：${matched.filter((row) => row.diffFields.length > 0).length}`
        );
        for (const [field, count] of [...diffCounts.entries()].sort((a, b) => b[1] - a[1])) {
            console.log(`  - ${field}: ${count}`);
        }
        if (snapshot.truncated) {
            console.log("- 注意：子站产品快照达到上限，结果可能不完整");
        }
        console.log(`- 报告：${outFile}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error("产品盘点失败：", error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
