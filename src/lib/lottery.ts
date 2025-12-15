/**
 * 抽奖裂变功能工具库
 */

import crypto from "crypto";

// ============================================
// 手机号处理
// ============================================

/**
 * 手机号哈希（用于去重和查询）
 */
export function hashPhone(phone: string): string {
  const salt = process.env.PHONE_HASH_SALT || "nihplod_lottery_2024";
  return crypto.createHash("sha256").update(phone + salt).digest("hex");
}

/**
 * 手机号加密存储
 */
export function encryptPhone(phone: string): string {
  const key = process.env.PHONE_ENCRYPT_KEY || "nihplod_encrypt_key_32bytes!!";
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key.padEnd(32).slice(0, 32)), iv);
  let encrypted = cipher.update(phone, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

/**
 * 手机号解密
 */
export function decryptPhone(encrypted: string): string {
  const key = process.env.PHONE_ENCRYPT_KEY || "nihplod_encrypt_key_32bytes!!";
  const [ivHex, encryptedData] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key.padEnd(32).slice(0, 32)), iv);
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * 手机号格式校验
 */
export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

/**
 * 手机号脱敏显示
 */
export function maskPhone(phone: string): string {
  if (phone.length !== 11) return phone;
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}

// ============================================
// 风控评分
// ============================================

// 虚拟运营商号段
const VIRTUAL_CARRIER_PREFIXES = [
  "170", "171", "165", "167", "172",  // 虚拟运营商
  "162", "166", "174",                 // 部分虚拟号段
];

export interface RiskFactors {
  phone: string;
  ip: string;
  deviceId: string;
  signatureComplexity: number;
  signatureStrokeCount: number;
  signatureDuration: number;
  // 需要查询数据库的数据
  ipEntryCount?: number;    // 同 IP 今日参与次数
  deviceEntryCount?: number; // 同设备参与次数
}

export interface RiskResult {
  score: number;           // 0-100 风险分
  factors: string[];       // 风险因素列表
  passed: boolean;         // 是否通过（score < 60）
}

/**
 * 计算风险评分
 */
export function calculateRiskScore(factors: RiskFactors): RiskResult {
  let score = 0;
  const riskFactors: string[] = [];

  // 1. 虚拟运营商号段 +20
  const phonePrefix = factors.phone.slice(0, 3);
  if (VIRTUAL_CARRIER_PREFIXES.includes(phonePrefix)) {
    score += 20;
    riskFactors.push("虚拟运营商号段");
  }

  // 2. 连号/规律号检测 +15
  if (isPatternPhone(factors.phone)) {
    score += 15;
    riskFactors.push("规律手机号");
  }

  // 3. 同 IP 多次参与 +30
  if (factors.ipEntryCount && factors.ipEntryCount > 3) {
    score += 30;
    riskFactors.push(`同IP今日${factors.ipEntryCount}次`);
  } else if (factors.ipEntryCount && factors.ipEntryCount > 1) {
    score += 10;
    riskFactors.push(`同IP今日${factors.ipEntryCount}次`);
  }

  // 4. 同设备多次参与 +40
  if (factors.deviceEntryCount && factors.deviceEntryCount > 0) {
    score += 40;
    riskFactors.push("同设备重复参与");
  }

  // 5. 签名过于简单 +25
  if (factors.signatureStrokeCount < 3) {
    score += 25;
    riskFactors.push("签名笔画过少");
  } else if (factors.signatureComplexity < 20) {
    score += 15;
    riskFactors.push("签名过于简单");
  }

  // 6. 签名绘制时间过短 +20
  if (factors.signatureDuration < 1000) {
    score += 20;
    riskFactors.push("签名绘制过快");
  }

  return {
    score: Math.min(100, score),
    factors: riskFactors,
    passed: score < 60,
  };
}

/**
 * 检测规律手机号（连号、重复号等）
 */
function isPatternPhone(phone: string): boolean {
  // 去掉前缀，检查后8位
  const suffix = phone.slice(3);
  
  // 全部相同 (如 11111111)
  if (/^(\d)\1{7}$/.test(suffix)) return true;
  
  // 连续递增/递减 (如 12345678, 87654321)
  const digits = suffix.split("").map(Number);
  let isIncreasing = true;
  let isDecreasing = true;
  for (let i = 1; i < digits.length; i++) {
    if (digits[i] !== digits[i - 1] + 1) isIncreasing = false;
    if (digits[i] !== digits[i - 1] - 1) isDecreasing = false;
  }
  if (isIncreasing || isDecreasing) return true;

  // AABB 模式 (如 11223344)
  if (/^(\d)\1(\d)\2(\d)\3(\d)\4$/.test(suffix)) return true;

  return false;
}

// ============================================
// 验证码生成
// ============================================

/**
 * 生成6位数字验证码
 */
export function generateVerifyCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 验证码加密存储
 */
export function hashVerifyCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * 验证验证码
 */
export function verifyCode(input: string, hashedCode: string): boolean {
  return hashVerifyCode(input) === hashedCode;
}

// ============================================
// 开奖算法
// ============================================

export interface DrawOptions {
  totalWinners: number;      // 中奖名额
  excludeHighRisk?: boolean; // 是否排除高风险（score >= 60）
  weightByRisk?: boolean;    // 是否按风险分加权（低风险更容易中奖）
}

/**
 * 执行抽奖（加权随机）
 * @param entries 参与记录（包含 riskScore 和 bonusWeight）
 * @param options 抽奖选项
 * @returns 中奖记录ID列表
 */
export function drawWinners<T extends { id: string; riskScore: number; bonusWeight?: number }>(
  entries: T[],
  options: DrawOptions
): string[] {
  let pool = [...entries];

  // 1. 过滤高风险
  if (options.excludeHighRisk) {
    pool = pool.filter((e) => e.riskScore < 60);
  }

  if (pool.length === 0) return [];

  // 2. 计算权重
  // 基础权重 = 100 - 风险分（风险分越低，权重越高）
  // 最终权重 = 基础权重 + 邀请加成（bonusWeight）
  const weights = pool.map((e) => {
    let weight = 50; // 基础权重

    if (options.weightByRisk) {
      // 风险分 0 -> +50, 风险分 60 -> +0
      weight += Math.max(0, 50 - Math.floor(e.riskScore * 0.83));
    }

    // 加上邀请加成
    const bonus = (e as T & { bonusWeight?: number }).bonusWeight || 0;
    weight += bonus;

    return Math.max(10, weight); // 最低权重 10
  });

  let totalWeight = weights.reduce((a, b) => a + b, 0);
  const winners: string[] = [];

  // 3. 加权随机抽取
  while (winners.length < options.totalWinners && pool.length > 0) {
    let random = Math.random() * totalWeight;
    let cumulative = 0;

    for (let i = 0; i < pool.length; i++) {
      cumulative += weights[i];
      if (random <= cumulative) {
        winners.push(pool[i].id);
        // 更新总权重并移除已中奖的
        totalWeight -= weights[i];
        pool.splice(i, 1);
        weights.splice(i, 1);
        break;
      }
    }
  }

  return winners;
}

