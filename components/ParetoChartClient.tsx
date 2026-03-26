"use client";

import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import "echarts-gl";

import type { ObjectiveVector } from "@/lib/hobbing-model";

interface ParetoChartClientProps {
  data: ObjectiveVector[];
  highlightedPoint: ObjectiveVector | null;
}

export default function ParetoChartClient({
  data,
  highlightedPoint,
}: ParetoChartClientProps) {
  const roughnessValues = data.map((item) => item[2]);
  const minRa = roughnessValues.length > 0 ? Math.min(...roughnessValues) : 0;
  const maxRa = roughnessValues.length > 0 ? Math.max(...roughnessValues) : 4;

  const option = {
    backgroundColor: "transparent",
    title: {
      show: false,
    },
    tooltip: {
      backgroundColor: "rgba(18, 31, 29, 0.96)",
      borderWidth: 2,
      borderColor: "#f1c27d",
      textStyle: { color: "#fff8ef", fontSize: 13 },
      padding: [14, 18],
      formatter: (params: { value: number[]; seriesName: string }) =>
        [
          `<div style="font-weight:700;font-size:15px;margin-bottom:10px;color:#f1c27d;border-bottom:1px solid rgba(241,194,125,0.3);padding-bottom:6px">${params.seriesName}</div>`,
          `<div style="display:flex;justify-content:space-between;gap:16px;margin:6px 0;">`,
          `<span style="color:#9f9f9f">能耗 E:</span>`,
          `<span style="font-family:monospace;font-weight:600">${params.value[0].toFixed(4)} kWh</span>`,
          `</div>`,
          `<div style="display:flex;justify-content:space-between;gap:16px;margin:6px 0;">`,
          `<span style="color:#9f9f9f">成本 C:</span>`,
          `<span style="font-family:monospace;font-weight:600">${params.value[1].toFixed(4)} 元</span>`,
          `</div>`,
          `<div style="display:flex;justify-content:space-between;gap:16px;margin:6px 0;">`,
          `<span style="color:#9f9f9f">粗糙度 Ra:</span>`,
          `<span style="font-family:monospace;font-weight:600">${params.value[2].toFixed(4)} μm</span>`,
          `</div>`,
        ].join(""),
    },
    legend: {
      show: true,
      top: 12,
      right: 24,
      textStyle: {
        color: "#38403d",
        fontSize: 14,
        fontWeight: 600,
      },
      itemGap: 24,
      itemWidth: 14,
      itemHeight: 14,
    },
    visualMap: {
      show: true,
      dimension: 2,
      min: minRa,
      max: maxRa,
      text: ["Ra 高", "Ra 低"],
      textStyle: { 
        color: "#38403d", 
        fontSize: 13,
        fontWeight: 600,
      },
      calculable: true,
      realtime: true,
      inRange: {
        color: [
          "#d9480f",
          "#e67700",
          "#f59f00",
          "#f1c27d",
          "#57a597",
          "#377d71",
          "#0f5f55",
        ],
      },
      outOfRange: {
        color: "#999",
      },
      controller: {
        inRange: {
          color: ["#0f5f55", "#d9480f"],
        },
      },
    },
    xAxis3D: {
      name: "单件能耗 E (kWh)",
      type: "value",
      nameTextStyle: { 
        color: "#38403d", 
        fontSize: 15,
        fontWeight: 700,
        padding: [0, 0, 15, 0],
      },
      axisLabel: { 
        color: "#4f5a56",
        fontSize: 12,
        margin: 10,
        formatter: (value: number) => value.toFixed(2),
      },
      axisLine: {
        lineStyle: {
          color: "#38403d",
          width: 3,
        },
      },
      axisTick: {
        lineStyle: {
          color: "#6a7571",
          width: 2,
        },
        length: 6,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: "#d0d7d4",
          width: 1,
          type: "dashed",
        },
      },
    },
    yAxis3D: {
      name: "生产成本 C (元)",
      type: "value",
      nameTextStyle: { 
        color: "#38403d", 
        fontSize: 15,
        fontWeight: 700,
        padding: [0, 0, 15, 0],
      },
      axisLabel: { 
        color: "#4f5a56",
        fontSize: 12,
        margin: 10,
        formatter: (value: number) => value.toFixed(1),
      },
      axisLine: {
        lineStyle: {
          color: "#38403d",
          width: 3,
        },
      },
      axisTick: {
        lineStyle: {
          color: "#6a7571",
          width: 2,
        },
        length: 6,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: "#d0d7d4",
          width: 1,
          type: "dashed",
        },
      },
    },
    zAxis3D: {
      name: "粗糙度 Ra (μm)",
      type: "value",
      nameTextStyle: { 
        color: "#38403d", 
        fontSize: 15,
        fontWeight: 700,
        padding: [0, 0, 15, 0],
      },
      axisLabel: { 
        color: "#4f5a56",
        fontSize: 12,
        margin: 10,
        formatter: (value: number) => value.toFixed(2),
      },
      axisLine: {
        lineStyle: {
          color: "#38403d",
          width: 3,
        },
      },
      axisTick: {
        lineStyle: {
          color: "#6a7571",
          width: 2,
        },
        length: 6,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: "#d0d7d4",
          width: 1,
          type: "dashed",
        },
      },
    },
    grid3D: {
      boxWidth: 200,
      boxHeight: 150,
      boxDepth: 190,
      axisPointer: {
        show: true,
        lineStyle: {
          color: "#bc6c25",
          width: 3,
          type: "solid",
        },
      },
      environment: "transparent",
      viewControl: {
        projection: "perspective",
        alpha: 18,
        beta: 45,
        autoRotate: false,
        autoRotateSpeed: 8,
        distance: 320,
        minDistance: 120,
        maxDistance: 600,
        damping: 0.9,
        panSensitivity: 1,
        rotateSensitivity: 1,
        zoomSensitivity: 1.5,
      },
      light: {
        main: {
          intensity: 1.6,
          shadow: true,
          shadowQuality: "high",
          alpha: 35,
          beta: 50,
        },
        ambient: {
          intensity: 0.6,
        },
        ambientCubemap: {
          intensity: 0.25,
          texture: "",
        },
      },
      postEffect: {
        enable: false,
        SSAO: {
          enable: false,
        },
      },
    },
    series: [
      {
        name: "Pareto 前沿解",
        type: "scatter3D",
        symbolSize: 14,
        symbol: "circle",
        data,
        itemStyle: {
          opacity: 0.92,
          borderWidth: 2,
          borderColor: "#ffffff",
        },
        emphasis: {
          itemStyle: {
            opacity: 1,
            borderWidth: 4,
            borderColor: "#f1c27d",
            shadowBlur: 30,
            shadowColor: "rgba(188, 108, 37, 0.6)",
          },
          scale: true,
          scaleSize: 18,
        },
      },
      highlightedPoint
        ? {
            name: "推荐最优解",
            type: "scatter3D",
            symbol: "diamond",
            symbolSize: 28,
            data: [highlightedPoint],
            itemStyle: {
              color: "#d9480f",
              borderColor: "#fffaf1",
              borderWidth: 4,
              opacity: 1,
              shadowBlur: 35,
              shadowColor: "rgba(217, 72, 15, 0.7)",
            },
            emphasis: {
              itemStyle: {
                borderWidth: 5,
                shadowBlur: 50,
                shadowColor: "rgba(217, 72, 15, 0.9)",
              },
              scale: true,
              scaleSize: 22,
            },
            label: {
              show: true,
              formatter: "★ 推荐解",
              color: "#7c2d12",
              backgroundColor: "rgba(255,250,241,0.98)",
              borderRadius: 999,
              padding: [10, 16],
              fontSize: 13,
              fontWeight: 700,
              distance: 18,
            },
          }
        : null,
    ].filter(Boolean),
  } as unknown as EChartsOption;

  return (
    <ReactECharts
      option={option}
      notMerge
      lazyUpdate
      style={{ height: "560px", width: "100%" }}
    />
  );
}
