"use client";

import dynamic from "next/dynamic";

import type { ObjectiveVector } from "@/lib/hobbing-model";

interface ParetoChartProps {
  data: ObjectiveVector[];
  highlightedPoint: ObjectiveVector | null;
}

const ParetoChartClient = dynamic(() => import("./ParetoChartClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center rounded-[28px] border border-dashed border-border bg-surface/70 text-sm text-muted">
      3D 图表组件正在加载...
    </div>
  ),
});

export default function ParetoChart(props: ParetoChartProps) {
  return <ParetoChartClient {...props} />;
}
