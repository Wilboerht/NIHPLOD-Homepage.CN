/**
 * IP 地理位置解析工具
 * 使用 MaxMind GeoLite2 本地数据库
 * 
 * 使用前需要下载数据库文件到 data/GeoLite2-City.mmdb
 * 下载地址: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
 */

import { Reader, CityResponse } from "maxmind";
import { readFileSync, existsSync } from "fs";
import path from "path";

// 数据库读取器（单例）
let reader: Reader<CityResponse> | null = null;
let readerError: string | null = null;

// 数据库文件路径
const DB_PATH = path.join(process.cwd(), "data", "GeoLite2-City.mmdb");

/**
 * 初始化 GeoIP 数据库
 */
function initReader(): Reader<CityResponse> | null {
  if (reader) return reader;
  if (readerError) return null;

  try {
    if (!existsSync(DB_PATH)) {
      readerError = `GeoLite2 数据库文件不存在: ${DB_PATH}`;
      console.warn(readerError);
      console.warn("请从 https://dev.maxmind.com/geoip/geolite2-free-geolocation-data 下载 GeoLite2-City.mmdb");
      return null;
    }

    const buffer = readFileSync(DB_PATH);
    reader = new Reader<CityResponse>(buffer);
    console.log("GeoLite2 数据库加载成功");
    return reader;
  } catch (error) {
    readerError = `GeoLite2 数据库加载失败: ${error}`;
    console.error(readerError);
    return null;
  }
}

/**
 * 省份名称映射（英文 -> 中文）
 */
const PROVINCE_NAME_MAP: Record<string, string> = {
  "Beijing": "北京",
  "Tianjin": "天津",
  "Hebei": "河北",
  "Shanxi": "山西",
  "Inner Mongolia": "内蒙古",
  "Liaoning": "辽宁",
  "Jilin": "吉林",
  "Heilongjiang": "黑龙江",
  "Shanghai": "上海",
  "Jiangsu": "江苏",
  "Zhejiang": "浙江",
  "Anhui": "安徽",
  "Fujian": "福建",
  "Jiangxi": "江西",
  "Shandong": "山东",
  "Henan": "河南",
  "Hubei": "湖北",
  "Hunan": "湖南",
  "Guangdong": "广东",
  "Guangxi": "广西",
  "Hainan": "海南",
  "Chongqing": "重庆",
  "Sichuan": "四川",
  "Guizhou": "贵州",
  "Yunnan": "云南",
  "Tibet": "西藏",
  "Shaanxi": "陕西",
  "Gansu": "甘肃",
  "Qinghai": "青海",
  "Ningxia": "宁夏",
  "Xinjiang": "新疆",
  "Taiwan": "台湾",
  "Hong Kong": "香港",
  "Macao": "澳门",
};

export interface GeoLocation {
  province: string | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

/**
 * 解析 IP 地理位置
 * @param ip IP 地址
 * @returns 地理位置信息
 */
export function resolveIPLocation(ip: string): GeoLocation {
  const emptyResult: GeoLocation = { province: null, city: null, country: null, countryCode: null };
  
  // 跳过本地/无效 IP
  if (!ip || ip === "unknown" || ip === "::1") {
    return emptyResult;
  }
  
  // 跳过私有 IP 段
  if (ip.startsWith("127.") || ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.16.")) {
    return emptyResult;
  }

  const db = initReader();
  if (!db) return emptyResult;

  try {
    const result = db.get(ip);
    if (!result) return emptyResult;

    // 获取国家信息
    const countryCode = result.country?.iso_code || null;
    const country = result.country?.names?.["zh-CN"] || result.country?.names?.en || null;

    // 获取省份（subdivisions[0] 是省/州级别）
    let province: string | null = null;
    if (result.subdivisions && result.subdivisions.length > 0) {
      const subdivision = result.subdivisions[0];
      // 优先使用中文名，否则使用映射
      province = subdivision.names?.["zh-CN"] 
        || PROVINCE_NAME_MAP[subdivision.names?.en || ""] 
        || subdivision.names?.en 
        || null;
    }

    // 获取城市
    const city = result.city?.names?.["zh-CN"] || result.city?.names?.en || null;

    return { province, city, country, countryCode };
  } catch (error) {
    console.debug("IP 解析失败:", ip, error);
    return emptyResult;
  }
}

/**
 * 检查 GeoIP 数据库是否可用
 */
export function isGeoIPAvailable(): boolean {
  return initReader() !== null;
}

