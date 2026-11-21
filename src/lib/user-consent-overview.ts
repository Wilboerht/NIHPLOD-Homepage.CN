import { prisma } from "@/lib/prisma";
import { advisorRequest } from "@/lib/advisor-internal";
import { baInternalRequest, type BaInternalResult } from "@/lib/ba-internal";
import { PRIVACY_POLICY_VERSION, TERMS_OF_SERVICE_VERSION } from "@/lib/privacy-consent";
import {
  getConsentPolicySnapshot,
  type ConsentDocumentPolicy,
  type ConsentPolicySnapshot,
} from "@/lib/consent-policy";
import { apiConsole } from "@/lib/logger";
import type {
  ConsentDocumentKey,
  ConsentDocumentState,
  ConsentDocumentStatus,
  ConsentEventSummary,
  ConsentOverallState,
  ConsentProjectKey,
  ConsentProjectStatus,
  UserConsentOverview,
} from "@/types/user-consent";

type MainConsentRow = {
  document: "PRIVACY" | "TERMS" | "MARKETING";
  version: string;
  documentVersion: number | null;
  channel: string;
  grantedAt: Date;
  revokedAt: Date | null;
  contentHash: string | null;
};

type MainConsentEventRow = {
  project: "MAIN" | "POINTS" | "SKIN" | "KF" | "BA" | "RECRUIT" | "UNKNOWN";
  document: "PRIVACY" | "TERMS" | "MARKETING";
  version: string;
  action: "GRANTED" | "REVOKED";
  channel: string;
  occurredAt: Date;
};

type SkinConsentData = {
  currentVersion: string;
  records: Array<{
    scope: string;
    version: string;
    grantedAt: string;
    revokedAt: string | null;
  }>;
  events: Array<{
    action: "GRANTED" | "REVOKED";
    document: string;
    version: string;
    channel: string;
    occurredAt: string;
  }>;
};

type BaConsentData = {
  count: number;
  latest: {
    consentAt: string | null;
    consentVersion: string | null;
    createdAt: string;
  } | null;
};

type JobConsentRow = {
  consentAt: Date | null;
};

const MAIN_DOCUMENTS: ConsentDocumentKey[] = ["privacy", "terms", "marketing"];
const REQUIRED_MAIN_DOCUMENTS: ConsentDocumentKey[] = ["privacy", "terms"];
const SKIN_DOCUMENTS: ConsentDocumentKey[] = ["privacy", "terms", "face", "health", "ai"];
const REQUIRED_SKIN_DOCUMENTS: ConsentDocumentKey[] = ["privacy", "terms"];

const MAIN_DOCUMENT_MAP: Record<MainConsentRow["document"], ConsentDocumentKey> = {
  PRIVACY: "privacy",
  TERMS: "terms",
  MARKETING: "marketing",
};

const SKIN_DOCUMENT_MAP: Record<string, ConsentDocumentKey> = {
  privacy: "privacy",
  terms: "terms",
  face: "face",
  health: "health",
  ai: "ai",
};

const EVENT_PROJECT_MAP: Record<MainConsentEventRow["project"], ConsentProjectKey> = {
  MAIN: "main",
  POINTS: "points",
  SKIN: "skin",
  KF: "kf",
  BA: "ba",
  RECRUIT: "recruit",
  UNKNOWN: "legacy",
};

const PROJECT_LABELS: Record<ConsentProjectKey, string> = {
  main: "主站 Web",
  points: "官方商城/积分小程序",
  skin: "测肤站/测肤小程序",
  kf: "企业微信 KF",
  ba: "BA 投诉（按手机号）",
  recruit: "招聘投递",
  legacy: "小程序（旧记录）",
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function latestDate(values: Array<Date | string | null | undefined>): string | null {
  let latest = 0;
  for (const value of values) {
    if (!value) continue;
    const time = (value instanceof Date ? value : new Date(value)).getTime();
    if (Number.isFinite(time) && time > latest) latest = time;
  }
  return latest > 0 ? new Date(latest).toISOString() : null;
}

function statusFromRow(
  row: MainConsentRow | undefined,
  policy: ConsentDocumentPolicy | null,
  fallbackVersion: string | null
): ConsentDocumentStatus {
  if (!row) {
    return {
      state: "missing",
      version: null,
      grantedAt: null,
      revokedAt: null,
      channel: null,
    };
  }

  let state: ConsentDocumentState = "current";
  if (row.revokedAt) {
    state = "revoked";
  } else if (policy?.requiredVersion != null) {
    state =
      row.documentVersion != null && row.documentVersion >= policy.requiredVersion
        ? "current"
        : "outdated";
  } else if (policy?.publishedVersion == null) {
    state = fallbackVersion && row.version !== fallbackVersion ? "outdated" : "current";
  }

  return {
    state,
    version: row.version,
    documentVersion: row.documentVersion,
    grantedAt: iso(row.grantedAt),
    revokedAt: iso(row.revokedAt),
    channel: row.channel,
  };
}

function overallFromDocuments(
  documents: Partial<Record<ConsentDocumentKey, ConsentDocumentStatus>>,
  required: ConsentDocumentKey[]
): ConsentOverallState {
  const states = required
    .map((key) => documents[key]?.state)
    .filter((state): state is ConsentDocumentState => Boolean(state));

  if (states.length === 0) return "missing";
  if (states.includes("revoked")) return "revoked";
  if (states.includes("missing")) return "missing";
  if (states.includes("outdated")) return "outdated";
  if (states.includes("unversioned")) return "unversioned";
  if (states.every((state) => state === "not_applicable")) return "not_applicable";
  return "current";
}

function buildMainProject(
  key: "main" | "points" | "legacy",
  rows: MainConsentRow[],
  events: ConsentEventSummary[],
  policy: ConsentPolicySnapshot,
  note?: string
): ConsentProjectStatus {
  const latestByDocument = new Map<ConsentDocumentKey, MainConsentRow>();
  for (const row of rows) {
    const document = MAIN_DOCUMENT_MAP[row.document];
    const current = latestByDocument.get(document);
    if (!current || row.grantedAt.getTime() > current.grantedAt.getTime()) {
      latestByDocument.set(document, row);
    }
  }

  const documents: Partial<Record<ConsentDocumentKey, ConsentDocumentStatus>> = {};
  for (const document of MAIN_DOCUMENTS) {
    const documentPolicy =
      document === "privacy" ? policy.privacy : document === "terms" ? policy.terms : null;
    const fallbackVersion =
      document === "privacy"
        ? PRIVACY_POLICY_VERSION
        : document === "terms"
          ? TERMS_OF_SERVICE_VERSION
          : null;
    documents[document] = statusFromRow(
      latestByDocument.get(document),
      documentPolicy,
      fallbackVersion
    );
  }

  return {
    key,
    label: PROJECT_LABELS[key],
    state: "ok",
    overall: overallFromDocuments(documents, REQUIRED_MAIN_DOCUMENTS),
    documents,
    lastUpdatedAt: latestDate(
      Array.from(latestByDocument.values()).flatMap((row) => [row.grantedAt, row.revokedAt])
    ),
    note,
    events: events.slice(0, 10),
  };
}

function buildSkinProject(
  skinData: SkinConsentData | null,
  mainSkinRows: MainConsentRow[],
  skinError: { code: string; message: string } | null,
  mainSkinEvents: ConsentEventSummary[]
): ConsentProjectStatus {
  if (!skinData) {
    const notConfigured = skinError?.code === "NOT_CONFIGURED";
    return {
      key: "skin",
      label: PROJECT_LABELS.skin,
      state: notConfigured ? "not_linked" : "degraded",
      overall: notConfigured ? "not_linked" : "degraded",
      documents: {},
      lastUpdatedAt: null,
      note: notConfigured
        ? "未配置测肤站内部接口密钥，无法查询"
        : skinError?.message || "测肤站暂时无法查询",
      events: [],
    };
  }

  type SkinRow = {
    version: string;
    grantedAt: Date;
    revokedAt: Date | null;
    channel: string;
  };

  const latestByDocument = new Map<ConsentDocumentKey, SkinRow>();

  const addRow = (document: ConsentDocumentKey, row: SkinRow) => {
    const current = latestByDocument.get(document);
    if (!current || row.grantedAt.getTime() > current.grantedAt.getTime()) {
      latestByDocument.set(document, row);
    }
  };

  for (const row of mainSkinRows) {
    if (row.document === "PRIVACY") {
      addRow("privacy", row);
    } else if (row.document === "TERMS") {
      addRow("terms", row);
    }
  }

  for (const record of skinData.records) {
    const document = SKIN_DOCUMENT_MAP[record.scope];
    if (!document) continue;
    addRow(document, {
      version: record.version,
      grantedAt: new Date(record.grantedAt),
      revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
      channel: "skin",
    });
  }

  const documents: Partial<Record<ConsentDocumentKey, ConsentDocumentStatus>> = {};
  for (const document of SKIN_DOCUMENTS) {
    const row = latestByDocument.get(document);
    if (!row) {
      documents[document] = {
        state: "missing",
        version: null,
        grantedAt: null,
        revokedAt: null,
        channel: null,
      };
      continue;
    }

    let state: ConsentDocumentState;
    if (row.revokedAt) state = "revoked";
    else if (row.version !== skinData.currentVersion) state = "outdated";
    else state = "current";

    documents[document] = {
      state,
      version: row.version,
      grantedAt: row.grantedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      channel: row.channel,
    };
  }

  const events = [
    ...skinData.events.map<ConsentEventSummary>((event) => ({
      action: event.action,
      document: event.document.toLowerCase(),
      version: event.version,
      channel: event.channel,
      occurredAt: event.occurredAt,
    })),
    ...mainSkinEvents,
  ]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 10);

  return {
    key: "skin",
    label: PROJECT_LABELS.skin,
    state: "ok",
    overall: overallFromDocuments(documents, REQUIRED_SKIN_DOCUMENTS),
    documents,
    lastUpdatedAt: latestDate(
      Array.from(latestByDocument.values()).flatMap((row) => [row.grantedAt, row.revokedAt])
    ),
    events,
  };
}

function buildBaProject(
  result: BaInternalResult<BaConsentData> | null,
  phone: string | null
): ConsentProjectStatus {
  if (!phone) {
    return {
      key: "ba",
      label: PROJECT_LABELS.ba,
      state: "not_linked",
      overall: "not_linked",
      documents: {},
      lastUpdatedAt: null,
      note: "用户没有手机号，无法按手机号匹配 BA 投诉",
      events: [],
    };
  }

  if (!result?.ok) {
    const notConfigured = result?.code === "NOT_CONFIGURED";
    return {
      key: "ba",
      label: PROJECT_LABELS.ba,
      state: notConfigured ? "not_linked" : "degraded",
      overall: notConfigured ? "not_linked" : "degraded",
      documents: {},
      lastUpdatedAt: null,
      note: notConfigured
        ? "未配置 BA 内部接口密钥，无法查询"
        : result?.message || "BA 投诉暂时无法查询",
      events: [],
    };
  }

  const data = result.data;
  if (data.count === 0 || !data.latest) {
    return {
      key: "ba",
      label: PROJECT_LABELS.ba,
      state: "ok",
      overall: "not_applicable",
      documents: {
        privacy: {
          state: "not_applicable",
          version: null,
          grantedAt: null,
          revokedAt: null,
          channel: null,
        },
        terms: {
          state: "not_applicable",
          version: null,
          grantedAt: null,
          revokedAt: null,
          channel: null,
        },
      },
      lastUpdatedAt: null,
      note: "没有按手机号匹配到的投诉记录",
      events: [],
    };
  }

  const latest = data.latest;
  let privacyState: ConsentDocumentState;
  if (!latest.consentAt) privacyState = "missing";
  else if (!latest.consentVersion) privacyState = "unversioned";
  else if (latest.consentVersion !== PRIVACY_POLICY_VERSION) privacyState = "outdated";
  else privacyState = "current";

  const documents: Partial<Record<ConsentDocumentKey, ConsentDocumentStatus>> = {
    privacy: {
      state: privacyState,
      version: latest.consentVersion,
      grantedAt: latest.consentAt,
      revokedAt: null,
      channel: "ba",
    },
    terms: {
      state: "not_applicable",
      version: null,
      grantedAt: null,
      revokedAt: null,
      channel: null,
    },
  };

  return {
    key: "ba",
    label: PROJECT_LABELS.ba,
    state: "ok",
    overall: privacyState,
    documents,
    lastUpdatedAt: latest.createdAt,
    note: `共 ${data.count} 条投诉，展示最近一条`,
    events: [],
  };
}

function buildRestrictedProject(key: "skin" | "ba", note: string): ConsentProjectStatus {
  return {
    key,
    label: PROJECT_LABELS[key],
    state: "not_linked",
    overall: "not_linked",
    documents: {},
    lastUpdatedAt: null,
    note,
    events: [],
  };
}

function buildKfProject(
  link: {
    openKfid: string;
    externalUserId: string;
    linkedAt: Date;
  } | null,
  events: ConsentEventSummary[],
  currentVersion: string
): ConsentProjectStatus {
  if (!link) {
    return {
      key: "kf",
      label: PROJECT_LABELS.kf,
      state: "not_linked",
      overall: "not_linked",
      documents: {},
      lastUpdatedAt: null,
      note: "企业微信 KF 使用外部用户 ID，尚未与主站账号建立映射",
      events: [],
    };
  }

  const latest = events.find((event) => event.document === "privacy") ?? null;
  if (!latest) {
    return {
      key: "kf",
      label: PROJECT_LABELS.kf,
      state: "ok",
      overall: "missing",
      documents: {
        privacy: {
          state: "missing",
          version: null,
          grantedAt: null,
          revokedAt: null,
          channel: "wecom-kf",
        },
      },
      lastUpdatedAt: link.linkedAt.toISOString(),
      note: "已关联企业微信 KF 外部身份，但没有持久化同意事件",
      events: [],
    };
  }

  let state: ConsentDocumentState;
  if (latest.action === "REVOKED") state = "revoked";
  else if (latest.version !== currentVersion) state = "outdated";
  else state = "current";

  return {
    key: "kf",
    label: PROJECT_LABELS.kf,
    state: "ok",
    overall: state,
    documents: {
      privacy: {
        state,
        version: latest.version,
        grantedAt: latest.action === "GRANTED" ? latest.occurredAt : null,
        revokedAt: latest.action === "REVOKED" ? latest.occurredAt : null,
        channel: "wecom-kf",
      },
      terms: {
        state: "not_applicable",
        version: null,
        grantedAt: null,
        revokedAt: null,
        channel: null,
      },
    },
    lastUpdatedAt: latest.occurredAt,
    note: "已关联企业微信 KF 外部身份",
    events: events.slice(0, 10),
  };
}

function buildRecruitProject(job: JobConsentRow | null): ConsentProjectStatus {
  if (!job?.consentAt) {
    return {
      key: "recruit",
      label: PROJECT_LABELS.recruit,
      state: "ok",
      overall: "not_applicable",
      documents: {
        privacy: {
          state: "not_applicable",
          version: null,
          grantedAt: null,
          revokedAt: null,
          channel: null,
        },
      },
      lastUpdatedAt: null,
      note: "没有招聘投递记录",
      events: [],
    };
  }

  return {
    key: "recruit",
    label: PROJECT_LABELS.recruit,
    state: "ok",
    overall: "unversioned",
    documents: {
      privacy: {
        state: "unversioned",
        version: null,
        grantedAt: iso(job.consentAt),
        revokedAt: null,
        channel: "recruit",
      },
    },
    lastUpdatedAt: iso(job.consentAt),
    note: "招聘投递时的隐私同意，无版本号",
    events: [],
  };
}

export async function buildUserConsentOverview(input: {
  userId: string;
  phone: string | null;
  canReadSkin?: boolean;
  canReadBa?: boolean;
}): Promise<UserConsentOverview> {
  const skinPromise =
    input.canReadSkin === false
      ? Promise.resolve(null)
      : advisorRequest<{ success?: boolean; data?: SkinConsentData }>(
          "/api/internal/admin/user-consent",
          {
            query: { userId: input.userId },
            signQuery: true,
            timeoutMs: 3000,
          }
        );

  const matchPhone = input.phone && /^1[3-9]\d{9}$/.test(input.phone) ? input.phone : null;
  const baPromise: Promise<BaInternalResult<BaConsentData> | null> =
    input.canReadBa !== false && matchPhone
      ? baInternalRequest<BaConsentData>("/api/internal/admin/complaints/consent", {
          query: { phone: matchPhone },
          timeoutMs: 3000,
        })
      : Promise.resolve(null);

  const [mainRows, mainStateRows, mainEvents, job, kfLink, skinResult, baResult, consentPolicy] =
    await Promise.all([
      prisma.privacyConsent.findMany({
        where: { userId: input.userId },
        orderBy: { grantedAt: "desc" },
        select: {
          document: true,
          version: true,
          documentVersion: true,
          channel: true,
          grantedAt: true,
          revokedAt: true,
          contentHash: true,
        },
      }),
      prisma.userConsentState.findMany({
        where: { userId: input.userId },
        select: {
          document: true,
          channel: true,
          status: true,
          grantedAt: true,
          revokedAt: true,
          contentHash: true,
          legalDocumentVersion: { select: { version: true } },
        },
      }),
      prisma.consentEvent.findMany({
        where: { userId: input.userId },
        orderBy: { occurredAt: "desc" },
        take: 100,
        select: {
          project: true,
          document: true,
          version: true,
          action: true,
          channel: true,
          occurredAt: true,
        },
      }),
      prisma.jobApplication.findFirst({
        where: { userId: input.userId, consentAt: { not: null } },
        orderBy: { consentAt: "desc" },
        select: { consentAt: true },
      }),
      prisma.kfIdentityLink.findFirst({
        where: { userId: input.userId },
        select: {
          openKfid: true,
          externalUserId: true,
          linkedAt: true,
        },
      }),
      skinPromise,
      baPromise,
      getConsentPolicySnapshot(),
    ]);

  const skinData = skinResult?.ok && skinResult.data?.data ? skinResult.data.data : null;
  const skinError = skinResult
    ? skinResult.ok
      ? skinResult.data?.data
        ? null
        : { code: "UPSTREAM_INVALID", message: "测肤站返回结构异常" }
      : { code: skinResult.code, message: skinResult.message }
    : null;

  if (skinResult && !skinResult.ok) {
    apiConsole.warn("[UserConsentOverview] 测肤站查询失败", {
      userId: input.userId,
      code: skinResult.code,
      status: skinResult.status,
    });
  }
  if (baResult && !baResult.ok) {
    apiConsole.warn("[UserConsentOverview] BA 查询失败", {
      userId: input.userId,
      code: baResult.code,
      status: baResult.status,
    });
  }

  const legacyByKey = new Map(
    mainRows.map((row) => [`${row.document}:${row.channel}`, row] as const)
  );
  const stateKeys = new Set(mainStateRows.map((row) => `${row.document}:${row.channel}`));
  const mainRowsWithState: MainConsentRow[] = [
    ...mainStateRows.map((row) => {
      const legacy = legacyByKey.get(`${row.document}:${row.channel}`);
      return {
        document: row.document,
        version:
          legacy?.version ??
          (row.legalDocumentVersion ? `v${row.legalDocumentVersion.version}` : "unknown"),
        documentVersion: row.legalDocumentVersion?.version ?? legacy?.documentVersion ?? null,
        channel: row.channel,
        grantedAt: row.grantedAt,
        revokedAt: row.revokedAt ?? (row.status === "REVOKED" ? row.grantedAt : null),
        contentHash: row.contentHash,
      };
    }),
    ...mainRows.filter((row) => !stateKeys.has(`${row.document}:${row.channel}`)),
  ];

  const mainRowsFor = (channel: string) =>
    mainRowsWithState.filter((row) => row.channel === channel) as MainConsentRow[];

  const eventsFor = (project: ConsentProjectKey) =>
    mainEvents
      .filter((event) => EVENT_PROJECT_MAP[event.project] === project)
      .map<ConsentEventSummary>((event) => ({
        action: event.action,
        document: event.document.toLowerCase(),
        version: event.version,
        channel: event.channel,
        occurredAt: event.occurredAt.toISOString(),
      }));

  const mainSkinRows = mainRowsWithState.filter(
    (row) => row.channel === "wechat-mp-skin" || row.channel === "q6n4aitms0wgn2sz1nj96au5"
  ) as MainConsentRow[];
  const legacyRows = mainRowsWithState.filter(
    (row) => row.channel === "miniprogram"
  ) as MainConsentRow[];

  const projects: ConsentProjectStatus[] = [
    buildMainProject("main", mainRowsFor("web"), eventsFor("main"), consentPolicy),
    buildMainProject("points", mainRowsFor("wechat-mp-points"), eventsFor("points"), consentPolicy),
    input.canReadSkin === false
      ? buildRestrictedProject("skin", "无测肤查看权限")
      : buildSkinProject(skinData, mainSkinRows, skinError, eventsFor("skin")),
    buildKfProject(kfLink, eventsFor("kf"), PRIVACY_POLICY_VERSION),
    input.canReadBa === false
      ? buildRestrictedProject("ba", "无 BA 投诉查看权限")
      : buildBaProject(baResult, matchPhone),
    buildRecruitProject(job as JobConsentRow | null),
  ];

  if (legacyRows.length > 0) {
    projects.push(
      buildMainProject(
        "legacy",
        legacyRows,
        eventsFor("legacy"),
        consentPolicy,
        "旧版小程序同意记录未区分具体小程序"
      )
    );
  }

  const summary: UserConsentOverview["summary"] = {
    current: 0,
    outdated: 0,
    missing: 0,
    revoked: 0,
    unversioned: 0,
    notApplicable: 0,
    notLinked: 0,
    degraded: 0,
  };
  for (const project of projects) {
    switch (project.overall) {
      case "current":
        summary.current += 1;
        break;
      case "outdated":
        summary.outdated += 1;
        break;
      case "missing":
        summary.missing += 1;
        break;
      case "revoked":
        summary.revoked += 1;
        break;
      case "unversioned":
        summary.unversioned += 1;
        break;
      case "not_applicable":
        summary.notApplicable += 1;
        break;
      case "not_linked":
        summary.notLinked += 1;
        break;
      case "degraded":
        summary.degraded += 1;
        break;
    }
  }

  const warnings: string[] = [];
  for (const key of ["main", "points", "skin"] as const) {
    const project = projects.find((item) => item.key === key);
    if (!project) continue;
    for (const document of ["privacy", "terms"] as const) {
      const status = project.documents[document];
      if (!status) continue;
      if (status.state === "outdated") {
        warnings.push(
          `${project.label}：${document === "privacy" ? "隐私政策" : "服务条款"}仍是旧版本`
        );
      } else if (status.state === "missing") {
        warnings.push(
          `${project.label}：未同意${document === "privacy" ? "隐私政策" : "服务条款"}`
        );
      } else if (status.state === "revoked") {
        warnings.push(
          `${project.label}：${document === "privacy" ? "隐私政策" : "服务条款"}已撤回`
        );
      }
    }
  }
  if (skinError) {
    warnings.push(`测肤站授权状态暂不可用：${skinError.message}`);
  }
  if (baResult && !baResult.ok) {
    warnings.push(`BA 投诉授权状态暂不可用：${baResult.message}`);
  }

  return {
    fetchedAt: new Date().toISOString(),
    currentVersions: {
      main: { privacy: PRIVACY_POLICY_VERSION, terms: TERMS_OF_SERVICE_VERSION },
      skin:
        input.canReadSkin === false
          ? null
          : skinData
            ? { privacy: skinData.currentVersion, terms: skinData.currentVersion }
            : null,
    },
    summary,
    projects,
    warnings,
  };
}
