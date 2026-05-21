/**
 * 反向地理编码 API
 * POST /api/geo/reverse
 *
 * 将经纬度转换为省份信息
 * 使用省会城市距离计算（离线方案，无需外部API）
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const RequestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// 中国各省会/直辖市中心坐标
const PROVINCE_CENTERS: Array<{ name: string; lat: number; lng: number }> = [
  // 直辖市（优先匹配）
  { name: "北京", lat: 39.9042, lng: 116.4074 },
  { name: "上海", lat: 31.2304, lng: 121.4737 },
  { name: "天津", lat: 39.1256, lng: 117.1907 },
  { name: "重庆", lat: 29.5630, lng: 106.5516 },
  // 特别行政区
  { name: "香港", lat: 22.3193, lng: 114.1694 },
  { name: "澳门", lat: 22.1987, lng: 113.5439 },
  // 省会城市
  { name: "广东", lat: 23.1291, lng: 113.2644 }, // 广州
  { name: "浙江", lat: 30.2741, lng: 120.1551 }, // 杭州
  { name: "江苏", lat: 32.0603, lng: 118.7969 }, // 南京
  { name: "福建", lat: 26.0745, lng: 119.2965 }, // 福州
  { name: "山东", lat: 36.6512, lng: 117.1201 }, // 济南
  { name: "河南", lat: 34.7466, lng: 113.6253 }, // 郑州
  { name: "湖北", lat: 30.5928, lng: 114.3055 }, // 武汉
  { name: "湖南", lat: 28.2282, lng: 112.9388 }, // 长沙
  { name: "四川", lat: 30.5728, lng: 104.0668 }, // 成都
  { name: "河北", lat: 38.0428, lng: 114.5149 }, // 石家庄
  { name: "辽宁", lat: 41.8057, lng: 123.4315 }, // 沈阳
  { name: "安徽", lat: 31.8206, lng: 117.2272 }, // 合肥
  { name: "江西", lat: 28.6820, lng: 115.8579 }, // 南昌
  { name: "陕西", lat: 34.3416, lng: 108.9398 }, // 西安
  { name: "广西", lat: 22.8170, lng: 108.3665 }, // 南宁
  { name: "云南", lat: 25.0406, lng: 102.7123 }, // 昆明
  { name: "贵州", lat: 26.6470, lng: 106.6302 }, // 贵阳
  { name: "山西", lat: 37.8706, lng: 112.5489 }, // 太原
  { name: "吉林", lat: 43.8171, lng: 125.3235 }, // 长春
  { name: "黑龙江", lat: 45.8038, lng: 126.5340 }, // 哈尔滨
  { name: "海南", lat: 20.0200, lng: 110.3490 }, // 海口
  { name: "甘肃", lat: 36.0611, lng: 103.8343 }, // 兰州
  { name: "宁夏", lat: 38.4872, lng: 106.2309 }, // 银川
  { name: "青海", lat: 36.6171, lng: 101.7782 }, // 西宁
  { name: "内蒙古", lat: 40.8414, lng: 111.7500 }, // 呼和浩特
  { name: "新疆", lat: 43.7930, lng: 87.6271 }, // 乌鲁木齐
  { name: "西藏", lat: 29.6500, lng: 91.1000 }, // 拉萨
  { name: "台湾", lat: 25.0330, lng: 121.5654 }, // 台北
];

/**
 * 计算两点间的距离（使用 Haversine 公式）
 */
function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // 地球半径（公里）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 根据经纬度找到最近的省份
 */
function getProvinceByCoords(lat: number, lng: number): string | null {
  // 首先检查是否在中国大致范围内
  if (lat < 18 || lat > 54 || lng < 73 || lng > 136) {
    return null; // 不在中国范围内
  }

  let nearestProvince = "";
  let minDistance = Infinity;

  for (const province of PROVINCE_CENTERS) {
    const distance = getDistance(lat, lng, province.lat, province.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearestProvince = province.name;
    }
  }

  // 如果距离超过 500 公里，可能不太准确，但仍然返回最近的
  return nearestProvince || null;
}

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = RequestSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { message: "参数错误" } },
        { status: 400 }
      );
    }

    const { latitude, longitude } = result.data;

    // 使用本地经纬度范围匹配
    const province = getProvinceByCoords(latitude, longitude);

    if (province) {
      return NextResponse.json({
        success: true,
        data: {
          province,
          city: null, // 简化版不返回城市
          source: "local",
        },
      });
    }

    return NextResponse.json({
      success: false,
      error: { message: "无法识别您的位置，请手动选择" },
    });
  } catch (error) {
    apiConsole.error("Reverse geocoding error:", error);
    return NextResponse.json(
      { success: false, error: { message: "地理编码失败" } },
      { status: 500 }
    );
  }
}

