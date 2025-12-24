"use client";

/**
 * 中国地图组件 - 使用 ECharts 实现
 * 展示各省份访问量分布
 */

import { useEffect, useRef, useMemo } from "react";
import * as echarts from "echarts/core";
import { MapChart } from "echarts/charts";
import { TooltipComponent, VisualMapComponent, GeoComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

// 注册 ECharts 组件
echarts.use([MapChart, TooltipComponent, VisualMapComponent, GeoComponent, CanvasRenderer]);

// 省份名称映射（确保数据名称与地图匹配）
const PROVINCE_NAME_MAP: Record<string, string> = {
  "北京": "北京",
  "天津": "天津",
  "河北": "河北",
  "山西": "山西",
  "内蒙古": "内蒙古",
  "辽宁": "辽宁",
  "吉林": "吉林",
  "黑龙江": "黑龙江",
  "上海": "上海",
  "江苏": "江苏",
  "浙江": "浙江",
  "安徽": "安徽",
  "福建": "福建",
  "江西": "江西",
  "山东": "山东",
  "河南": "河南",
  "湖北": "湖北",
  "湖南": "湖南",
  "广东": "广东",
  "广西": "广西",
  "海南": "海南",
  "重庆": "重庆",
  "四川": "四川",
  "贵州": "贵州",
  "云南": "云南",
  "西藏": "西藏",
  "陕西": "陕西",
  "甘肃": "甘肃",
  "青海": "青海",
  "宁夏": "宁夏",
  "新疆": "新疆",
  "台湾": "台湾",
  "香港": "香港",
  "澳门": "澳门",
};

interface ProvinceData {
  province: string;
  count: number;
}

interface ChinaMapProps {
  data: ProvinceData[];
  height?: number;
}

export function ChinaMap({ data, height = 400 }: ChinaMapProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const mapRegistered = useRef(false);

  // 转换数据格式
  const mapData = useMemo(() => {
    return data.map((item) => ({
      name: PROVINCE_NAME_MAP[item.province] || item.province,
      value: item.count,
    }));
  }, [data]);

  // 计算最大值用于颜色映射
  const maxValue = useMemo(() => {
    return Math.max(...data.map((d) => d.count), 1);
  }, [data]);

  const hasData = data.length > 0;

  useEffect(() => {
    if (!chartRef.current) return;

    let isMounted = true;

    const initChart = async () => {
      try {
        // 注册地图（只需一次）
        if (!mapRegistered.current) {
          const response = await fetch(
            "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json"
          );
          const chinaJson = await response.json();
          echarts.registerMap("china", chinaJson);
          mapRegistered.current = true;
        }

        if (!isMounted || !chartRef.current) return;

        // 初始化或复用图表实例
        if (!chartInstance.current) {
          chartInstance.current = echarts.init(chartRef.current);
        }

        // 设置图表配置
        const option: echarts.EChartsCoreOption = {
          tooltip: {
            trigger: "item",
            formatter: (params: unknown) => {
              const p = params as { name: string; value?: number };
              return `${p.name}<br/>访问量: ${p.value || 0}`;
            },
          },
          visualMap: hasData
            ? {
                show: true,
                min: 0,
                max: maxValue,
                left: "left",
                top: "bottom",
                text: ["高", "低"],
                textStyle: { color: "#666", fontSize: 10 },
                inRange: {
                  color: ["#e0f3f8", "#abd9e9", "#74add1", "#4575b4", "#313695"],
                },
                calculable: true,
                itemWidth: 12,
                itemHeight: 80,
              }
            : {
                show: false,
              },
          series: [
            {
              name: "访问量",
              type: "map",
              map: "china",
              roam: true,
              zoom: 1.5, // 初始缩放比例，使地图更大
              center: [105, 35], // 中国地理中心点
              scaleLimit: { min: 1, max: 5 },
              label: {
                show: false,
              },
              emphasis: {
                label: { show: true, fontSize: 12, color: "#333" },
                itemStyle: { areaColor: "#ffd700" },
              },
              data: mapData,
              itemStyle: {
                borderColor: "#fff",
                borderWidth: 0.5,
                areaColor: "#e5e7eb",
              },
            },
          ],
        };

        chartInstance.current.setOption(option, true);
      } catch (error) {
        console.error("加载地图数据失败:", error);
      }
    };

    initChart();

    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      isMounted = false;
      window.removeEventListener("resize", handleResize);
    };
  }, [mapData, maxValue, hasData]);

  // 组件卸载时销毁
  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  return <div ref={chartRef} style={{ width: "100%", height }} />;
}

