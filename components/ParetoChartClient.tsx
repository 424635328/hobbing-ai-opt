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
    tooltip: {
      backgroundColor: "rgba(18, 31, 29, 0.92)",
      borderWidth: 0,
      textStyle: { color: "#fff8ef" },
      formatter: (params: { value: number[]; seriesName: string }) =>
        [
          `<strong>${params.seriesName}</strong>`,
          `能耗 E: ${params.value[0].toFixed(4)} kWh`,
          `成本 C: ${params.value[1].toFixed(4)} 元`,
          `粗糙度 Ra: ${params.value[2].toFixed(4)} μm`,
        ].join("<br/>"),
    },
    visualMap: {
      show: true,
      dimension: 2,
      min: minRa,
      max: maxRa,
      text: ["Ra 高", "Ra 低"],
      textStyle: { color: "#38403d" },
      calculable: true,
      inRange: {
        color: ["#0f5f55", "#57a597", "#f1c27d", "#bc6c25"],
      },
    },
    xAxis3D: {
      name: "单件能耗 E (kWh)",
      type: "value",
      nameTextStyle: { color: "#38403d" },
      axisLabel: { color: "#4f5a56" },
    },
    yAxis3D: {
      name: "生产成本 C (元)",
      type: "value",
      nameTextStyle: { color: "#38403d" },
      axisLabel: { color: "#4f5a56" },
    },
    zAxis3D: {
      name: "粗糙度 Ra (μm)",
      type: "value",
      nameTextStyle: { color: "#38403d" },
      axisLabel: { color: "#4f5a56" },
    },
    grid3D: {
      boxWidth: 160,
      boxHeight: 110,
      boxDepth: 150,
      axisPointer: {
        show: true,
        lineStyle: {
          color: "#bc6c25",
        },
      },
      environment: "transparent",
      viewControl: {
        projection: "perspective",
        alpha: 24,
        beta: 38,
        autoRotate: false,
        distance: 235,
      },
      light: {
        main: {
          intensity: 1.2,
          shadow: true,
        },
        ambient: {
          intensity: 0.45,
        },
      },
    },
    series: [
      {
        name: "Pareto Front",
        type: "scatter3D",
        symbolSize: 10,
        data,
        itemStyle: {
          opacity: 0.92,
        },
      },
      highlightedPoint
        ? {
            name: "推荐解",
            type: "scatter3D",
            symbol: "diamond",
            symbolSize: 20,
            data: [highlightedPoint],
            itemStyle: {
              color: "#d9480f",
              borderColor: "#fffaf1",
              borderWidth: 2,
            },
            label: {
              show: true,
              formatter: "推荐解",
              color: "#7c2d12",
              backgroundColor: "rgba(255,250,241,0.92)",
              borderRadius: 999,
              padding: [6, 10],
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
      style={{ height: "520px", width: "100%" }}
    />
  );
}
