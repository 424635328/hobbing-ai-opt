import {
  computeProcessMetrics,
  type BuildModelRequest,
  type DecisionVector,
  type ModelConfig,
  type ModelSource,
  type ObjectiveVector,
} from "@/lib/hobbing-model";

interface ProcessCardProps {
  request: BuildModelRequest;
  profileLabel: string;
  algorithmLabel: string;
  algorithmDescriptor: string;
  source: ModelSource | null;
  notes: string[];
  config: ModelConfig | null;
  decision: DecisionVector | null;
  objectives: ObjectiveVector | null;
  generatedAt: string | null;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "等待优化完成";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number | null, digits: number): string {
  if (value === null) {
    return "待生成";
  }

  return value.toFixed(digits);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

type FeasibilityRiskLevel = "低风险" | "中风险" | "高风险";

function riskStyle(level: FeasibilityRiskLevel): string {
  if (level === "低风险") {
    return "text-emerald-700 bg-emerald-50 border-emerald-200";
  }

  if (level === "中风险") {
    return "text-amber-700 bg-amber-50 border-amber-200";
  }

  return "text-rose-700 bg-rose-50 border-rose-200";
}

function buildFeasibilityDiagnostics(
  metrics: ReturnType<typeof computeProcessMetrics>,
  config: ModelConfig,
) {
  const speedMin = 25;
  const speedMax = 80;
  const speedMid = (speedMin + speedMax) / 2;
  const speedHalfRange = (speedMax - speedMin) / 2;
  const speedOffset = Math.abs(metrics.v_c - speedMid) / speedHalfRange;

  const speedScore =
    metrics.v_c >= speedMin && metrics.v_c <= speedMax
      ? clamp01(1 - speedOffset * 0.25)
      : clamp01(1 - speedOffset * 0.9);

  const powerUtilization = metrics.P_cut / Math.max(config.constraints.max_power, 1e-6);
  const powerScore =
    powerUtilization <= 0.85
      ? 1
      : powerUtilization <= 1
        ? clamp01(1 - ((powerUtilization - 0.85) / 0.15) * 0.45)
        : clamp01(0.55 - (powerUtilization - 1) * 1.2);

  const roughnessUtilization = metrics.roughness / Math.max(config.constraints.max_ra, 1e-6);
  const roughnessScore =
    roughnessUtilization <= 0.9
      ? 1
      : roughnessUtilization <= 1
        ? clamp01(1 - ((roughnessUtilization - 0.9) / 0.1) * 0.55)
        : clamp01(0.45 - (roughnessUtilization - 1) * 1.4);

  const minLifeRequirement = config.constraints.min_tool_life_ratio * metrics.t_c;
  const toolLifeSafetyFactor = metrics.T_tool / Math.max(minLifeRequirement, 1e-6);
  const toolLifeScore =
    toolLifeSafetyFactor >= 1.35
      ? 1
      : toolLifeSafetyFactor >= 1
        ? clamp01(0.7 + ((toolLifeSafetyFactor - 1) / 0.35) * 0.3)
        : clamp01(toolLifeSafetyFactor * 0.7);

  const weightedIndex =
    speedScore * 0.22 +
    powerScore * 0.28 +
    roughnessScore * 0.3 +
    toolLifeScore * 0.2;
  const feasibilityIndex = metrics.validationReport.overall.feasible
    ? weightedIndex
    : Math.min(weightedIndex, 0.64);

  const feasibilityGrade =
    feasibilityIndex >= 0.9 ? "A" : feasibilityIndex >= 0.8 ? "B" : feasibilityIndex >= 0.68 ? "C" : "D";

  const invalidCount = [
    metrics.validationReport.cuttingSpeed.valid,
    metrics.validationReport.surfaceRoughness.valid,
    metrics.validationReport.toolLife.valid,
    metrics.validationReport.powerCheck.valid,
  ].filter((item) => !item).length;

  const nearLimitCount = [
    powerUtilization > 0.92,
    roughnessUtilization > 0.92,
    toolLifeSafetyFactor < 1.15,
    speedOffset > 0.8,
  ].filter(Boolean).length;

  const riskLevel: FeasibilityRiskLevel =
    invalidCount > 0 || feasibilityIndex < 0.65
      ? "高风险"
      : nearLimitCount >= 2
        ? "中风险"
        : "低风险";

  const recommendations: string[] = [];

  if (!metrics.validationReport.cuttingSpeed.valid || speedOffset > 0.85) {
    recommendations.push("切削速度接近或超出推荐区间，建议优先微调主轴转速 n 至中位工作带。");
  }

  if (!metrics.validationReport.powerCheck.valid || powerUtilization > 0.95) {
    recommendations.push("功率裕量不足，建议降低 n 或 f，必要时降低滚刀头数以避免功率峰值。");
  }

  if (!metrics.validationReport.surfaceRoughness.valid || roughnessUtilization > 0.92) {
    recommendations.push("粗糙度接近约束上限，建议减小进给量 f，并优先采用单头/双头滚刀策略。");
  }

  if (!metrics.validationReport.toolLife.valid || toolLifeSafetyFactor < 1.15) {
    recommendations.push("刀具寿命安全系数偏低，建议降低切削速度或切换更高耐磨刀具材料。");
  }

  if (recommendations.length === 0) {
    recommendations.push("当前参数组合具备较好安全裕量，可进入试切验证与批量稳定性确认阶段。");
  }

  return {
    feasibilityIndex,
    feasibilityGrade,
    riskLevel,
    powerUtilization,
    roughnessUtilization,
    toolLifeSafetyFactor,
    speedOffset,
    recommendations,
    minLifeRequirement,
  };
}

function buildModelingConfidence(
  source: ModelSource | null,
  notes: string[],
): { score: number; level: "高" | "中" | "谨慎" } {
  let score = source === "deepseek" ? 0.86 : source === "fallback" ? 0.74 : 0.6;

  for (const note of notes) {
    if (/失败|异常|切换|fallback|降级|未检测|未获取/i.test(note)) {
      score -= 0.04;
    }
    if (/已通过|已启用|已按|推荐|生成|约束/i.test(note)) {
      score += 0.02;
    }
  }

  const normalized = Math.min(0.95, Math.max(0.45, score));
  const level = normalized >= 0.85 ? "高" : normalized >= 0.72 ? "中" : "谨慎";

  return { score: normalized, level };
}

function classifyModelNote(note: string): {
  tag: "约束校准" | "材料知识" | "降级路径" | "建模说明";
  className: string;
} {
  if (/失败|切换|fallback|降级|未检测|未获取/i.test(note)) {
    return {
      tag: "降级路径",
      className: "bg-amber-50 border-amber-200 text-amber-700",
    };
  }

  if (/材料|刀具|硬度|钢/i.test(note)) {
    return {
      tag: "材料知识",
      className: "bg-blue-50 border-blue-200 text-blue-700",
    };
  }

  if (/约束|功率|粗糙度|Ra|速度|寿命/i.test(note)) {
    return {
      tag: "约束校准",
      className: "bg-emerald-50 border-emerald-200 text-emerald-700",
    };
  }

  return {
    tag: "建模说明",
    className: "bg-accent/8 border-accent/20 text-accent",
  };
}

export default function ProcessCard({
  request,
  profileLabel,
  algorithmLabel,
  algorithmDescriptor,
  source,
  notes,
  config,
  decision,
  objectives,
  generatedAt,
}: ProcessCardProps) {
  const metrics = decision && config ? computeProcessMetrics(decision, config) : null;
  const feasibility = metrics && config ? buildFeasibilityDiagnostics(metrics, config) : null;
  const modelingConfidence = buildModelingConfidence(source, notes);
  const classifiedNotes = notes.map((note) => ({
    note,
    meta: classifyModelNote(note),
  }));

  return (
    <div className="space-y-4 rounded-[28px] border border-border-soft bg-surface-strong p-5 shadow-xl card-hover print-card md:p-7">
      <div className="flex flex-col gap-4 border-b border-border-soft pb-5 md:flex-row md:items-start md:justify-between">
        <div className="slide-up">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
            Process Card
          </p>
          <h2 className="mt-2 text-2xl font-bold text-foreground md:text-3xl">
            滚齿工艺参数指导卡
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-soft">
            用于记录当前工况下的模型来源、推荐工艺参数与多目标优化结果，可直接打印用于展示。
          </p>
        </div>
        <div className="fade-in rounded-xl border border-border-soft bg-white/80 px-4 py-3 text-sm leading-relaxed text-muted shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-soft">生成时间：</span>
            <span className="font-medium text-foreground">{formatDateTime(generatedAt)}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-muted-soft">运行档位：</span>
            <span className="font-medium text-accent">{profileLabel}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-muted-soft">求解算法：</span>
            <span className="font-medium text-foreground">{algorithmLabel}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-muted-soft">算法来源：</span>
            <span className="font-medium text-foreground">{algorithmDescriptor}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-muted-soft">模型来源：</span>
            <span className={`font-medium ${source === "deepseek" ? "text-accent" : "text-accent-warm"}`}>
              {source === "deepseek"
                ? "DeepSeek"
                : source === "fallback"
                  ? "本地规则库"
                  : "待建立"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="fade-in rounded-[20px] border border-border-soft bg-white/85 p-4 shadow-md">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <span className="text-accent font-bold">⚙</span>
            </div>
            <h3 className="text-lg font-bold text-foreground">齿轮基础参数</h3>
          </div>
          <dl className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-accent/5 px-3 py-2">
              <dt className="text-muted-soft font-medium">齿轮模数 (m)</dt>
              <dd className="font-mono font-bold text-foreground">{request.module.toFixed(2)} mm</dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-accent/5 px-3 py-2">
              <dt className="text-muted-soft font-medium">齿数 (z)</dt>
              <dd className="font-mono font-bold text-foreground">{request.teeth}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-accent/5 px-3 py-2">
              <dt className="text-muted-soft font-medium">齿宽 (B)</dt>
              <dd className="font-mono font-bold text-foreground">{request.faceWidth.toFixed(1)} mm</dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-accent/5 px-3 py-2">
              <dt className="text-muted-soft font-medium">精度等级</dt>
              <dd className="font-bold text-foreground">GB/T 10095 级 {request.accuracyGrade}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-accent/5 px-3 py-2">
              <dt className="text-muted-soft font-medium">工件材料</dt>
              <dd className="font-bold text-foreground">{request.material}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-accent/5 px-3 py-2">
              <dt className="text-muted-soft font-medium">工件硬度</dt>
              <dd className="font-mono font-bold text-foreground">{request.hardness.toFixed(0)} HB</dd>
            </div>
          </dl>
        </section>

        <section className="fade-in rounded-[20px] border border-border-soft bg-white/85 p-4 shadow-md" style={{ animationDelay: "100ms" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-accent-warm/10 flex items-center justify-center">
              <span className="text-accent-warm font-bold">🔧</span>
            </div>
            <h3 className="text-lg font-bold text-foreground">刀具与机床</h3>
          </div>
          {config ? (
            <dl className="grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-accent-warm/5 px-3 py-2">
                <dt className="text-muted-soft font-medium">刀具材料</dt>
                <dd className="font-bold text-foreground">{request.tool}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-accent-warm/5 px-3 py-2">
                <dt className="text-muted-soft font-medium">机床最大功率</dt>
                <dd className="font-mono font-bold text-foreground">
                  {request.maxPower.toFixed(1)} kW
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-accent-warm/5 px-3 py-2">
                <dt className="text-muted-soft font-medium">泰勒寿命系数 C</dt>
                <dd className="font-mono font-bold text-accent">
                  {config.constants.tool_life_constant.toFixed(0)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-accent-warm/5 px-3 py-2">
                <dt className="text-muted-soft font-medium">寿命指数 m</dt>
                <dd className="font-mono font-bold text-accent">
                  {config.constants.tool_life_exponent.toFixed(3)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-accent-warm/5 px-3 py-2">
                <dt className="text-muted-soft font-medium">单位切削力 Kc</dt>
                <dd className="font-mono font-bold text-accent">
                  {config.constants.specific_cutting_force.toFixed(0)} N/mm²
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-accent-warm/5 px-3 py-2">
                <dt className="text-muted-soft font-medium">表面粗糙度上限</dt>
                <dd className="font-mono font-bold text-accent-warm">
                  {config.constraints.max_ra.toFixed(1)} μm
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-muted-soft">
              模型尚未建立，等待 AI 或本地规则库返回工艺常数。
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="fade-in rounded-[20px] border border-border-soft bg-gradient-to-br from-[#fffdf7] to-white p-4 shadow-lg" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-accent/12 flex items-center justify-center">
              <span className="text-accent font-bold">✨</span>
            </div>
            <h3 className="text-lg font-bold text-foreground">推荐工艺参数</h3>
          </div>
          {decision ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-accent/8 p-4 border border-accent/15 hover:shadow-md transition-all duration-300">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-soft font-semibold">
                  d_a0
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-accent">
                  {decision[0].toFixed(0)}
                </div>
                <div className="mt-1 text-xs text-muted-soft">滚刀直径 (mm)</div>
              </div>
              <div className="rounded-xl bg-accent/8 p-4 border border-accent/15 hover:shadow-md transition-all duration-300">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-soft font-semibold">
                  z_0
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-accent">
                  {decision[1].toFixed(0)}
                </div>
                <div className="mt-1 text-xs text-muted-soft">滚刀头数</div>
              </div>
              <div className="rounded-xl bg-accent/8 p-4 border border-accent/15 hover:shadow-md transition-all duration-300">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-soft font-semibold">
                  n
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-accent">
                  {decision[2].toFixed(2)}
                </div>
                <div className="mt-1 text-xs text-muted-soft">主轴转速 (rpm)</div>
              </div>
              <div className="rounded-xl bg-accent/8 p-4 border border-accent/15 hover:shadow-md transition-all duration-300">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-soft font-semibold">
                  f
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-accent">
                  {decision[3].toFixed(2)}
                </div>
                <div className="mt-1 text-xs text-muted-soft">轴向进给量 (mm/r)</div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-muted-soft">
              尚未获得推荐解。请先完成模型建立并运行所选优化算法。
            </p>
          )}
        </section>

        <section className="fade-in rounded-[20px] border border-border-soft bg-gradient-to-br from-[#fffdf7] to-white p-4 shadow-lg" style={{ animationDelay: "300ms" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-accent-warm/12 flex items-center justify-center">
              <span className="text-accent-warm font-bold">🎯</span>
            </div>
            <h3 className="text-lg font-bold text-foreground">目标函数结果</h3>
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-warm/8 px-4 py-3 border border-accent-warm/15">
              <dt className="text-muted-soft font-medium">单件能耗 E</dt>
              <dd className="font-mono text-lg font-bold text-accent-warm">
                {formatNumber(objectives?.[0] ?? null, 4)} kWh
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-warm/8 px-4 py-3 border border-accent-warm/15">
              <dt className="text-muted-soft font-medium">单件成本 C</dt>
              <dd className="font-mono text-lg font-bold text-accent-warm">
                {formatNumber(objectives?.[1] ?? null, 4)} 元
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-warm/8 px-4 py-3 border border-accent-warm/15">
              <dt className="text-muted-soft font-medium">粗糙度 Ra</dt>
              <dd className="font-mono text-lg font-bold text-accent-warm">
                {formatNumber(objectives?.[2] ?? null, 4)} μm
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {metrics && (
        <>
          <section className="fade-in rounded-[20px] border border-border-soft bg-white/90 p-4 shadow-lg" style={{ animationDelay: "400ms" }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-accent/15 to-accent-warm/15 flex items-center justify-center">
                <span className="text-accent font-bold">📊</span>
              </div>
              <h3 className="text-lg font-bold text-foreground">核心工艺计算结果</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl bg-gradient-to-br from-accent/6 to-white px-4 py-3 border border-accent/10 hover:shadow-sm transition-all">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-soft font-semibold">
                  切削速度 v_c
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-accent">
                  {metrics.v_c.toFixed(2)} m/min
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-accent/6 to-white px-4 py-3 border border-accent/10 hover:shadow-sm transition-all">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-soft font-semibold">
                  切削力 F
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-accent">
                  {metrics.F_cut.toFixed(1)} N
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-accent/6 to-white px-4 py-3 border border-accent/10 hover:shadow-sm transition-all">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-soft font-semibold">
                  切削功率 P
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-accent">
                  {metrics.P_cut.toFixed(3)} kW
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-accent/6 to-white px-4 py-3 border border-accent/10 hover:shadow-sm transition-all">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-soft font-semibold">
                  刀具寿命 T
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-accent">
                  {metrics.T_tool.toFixed(1)} min
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-accent/6 to-white px-4 py-3 border border-accent/10 hover:shadow-sm transition-all">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-soft font-semibold">
                  机动时间 t_c
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-accent">
                  {metrics.t_c.toFixed(2)} min
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-accent/6 to-white px-4 py-3 border border-accent/10 hover:shadow-sm transition-all">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-soft font-semibold">
                  总加工时间 T_total
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-accent">
                  {metrics.T_total.toFixed(2)} min
                </div>
              </div>
            </div>
          </section>

          <section className="fade-in rounded-[20px] border border-border-soft bg-white/90 p-4 shadow-lg" style={{ animationDelay: "500ms" }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <span className="text-accent font-bold">📝</span>
              </div>
              <h3 className="text-lg font-bold text-foreground">计算过程与公式来源</h3>
            </div>
            <dl className="grid gap-2 text-sm md:grid-cols-2">
              <div className="rounded-xl bg-gradient-to-br from-[#fffdf7] to-white px-4 py-3 border border-border-soft">
                <dt className="font-bold text-foreground">切削速度计算</dt>
                <dd className="mt-1 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.cuttingSpeed}</dd>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-[#fffdf7] to-white px-4 py-3 border border-border-soft">
                <dt className="font-bold text-foreground">主轴转速验证</dt>
                <dd className="mt-1 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.spindleSpeed}</dd>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-[#fffdf7] to-white px-4 py-3 border border-border-soft">
                <dt className="font-bold text-foreground">切削力计算</dt>
                <dd className="mt-1 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.cuttingForce}</dd>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-[#fffdf7] to-white px-4 py-3 border border-border-soft">
                <dt className="font-bold text-foreground">切削功率计算</dt>
                <dd className="mt-1 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.cuttingPower}</dd>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-[#fffdf7] to-white px-4 py-3 border border-border-soft">
                <dt className="font-bold text-foreground">刀具寿命计算 (泰勒公式)</dt>
                <dd className="mt-1 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.toolLife}</dd>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-[#fffdf7] to-white px-4 py-3 border border-border-soft">
                <dt className="font-bold text-foreground">表面粗糙度估算</dt>
                <dd className="mt-1 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.surfaceRoughness}</dd>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-[#fffdf7] to-white px-4 py-3 border border-border-soft md:col-span-2">
                <dt className="font-bold text-foreground">加工时间计算</dt>
                <dd className="mt-1 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.machiningTime}</dd>
              </div>
            </dl>
          </section>

          <section className="fade-in rounded-[20px] border border-border-soft bg-white/90 p-4 shadow-lg" style={{ animationDelay: "600ms" }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                <span className="text-emerald-700 font-bold">✓</span>
              </div>
              <h3 className="text-lg font-bold text-foreground">工艺参数可行性评估报告</h3>
            </div>
            {feasibility && (
              <>
                <div className={`mt-3 rounded-xl px-5 py-4 border-2 ${metrics.validationReport.overall.feasible ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-base font-bold text-foreground flex items-center gap-2">
                      {metrics.validationReport.overall.feasible ? (
                        <span className="text-xl">✅</span>
                      ) : (
                        <span className="text-xl">⚠️</span>
                      )}
                      总体评估：{metrics.validationReport.overall.feasible ? '✓ 可直接试切' : '✗ 建议先调参'}
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskStyle(feasibility.riskLevel)}`}>
                      {feasibility.riskLevel}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-green-200 bg-white/80 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-soft">可行性指数</div>
                      <div className="mt-1 font-mono text-xl font-bold text-foreground">
                        {(feasibility.feasibilityIndex * 100).toFixed(1)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-green-200 bg-white/80 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-soft">评级</div>
                      <div className="mt-1 font-mono text-xl font-bold text-foreground">
                        {feasibility.feasibilityGrade}
                      </div>
                    </div>
                    <div className="rounded-lg border border-green-200 bg-white/80 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-soft">寿命安全系数</div>
                      <div className="mt-1 font-mono text-xl font-bold text-foreground">
                        {feasibility.toolLifeSafetyFactor.toFixed(2)}x
                      </div>
                    </div>
                  </div>
                  {metrics.validationReport.overall.warnings.length > 0 && (
                    <div className="mt-3">
                      <div className="text-sm font-semibold text-amber-700 flex items-center gap-2">
                        <span>⚠️</span> 工程警告：
                      </div>
                      <ul className="mt-2 text-sm text-amber-700 list-disc list-inside space-y-1">
                        {metrics.validationReport.overall.warnings.map((warning, index) => (
                          <li key={index} className="bg-amber-50/60 px-2 py-1 rounded">{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="mt-4 grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-border-soft bg-white/90 px-3 py-2.5">
                    <div className="text-xs text-muted-soft">功率利用率</div>
                    <div className="mt-1 font-mono font-bold text-foreground">
                      {(feasibility.powerUtilization * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-xl border border-border-soft bg-white/90 px-3 py-2.5">
                    <div className="text-xs text-muted-soft">粗糙度利用率</div>
                    <div className="mt-1 font-mono font-bold text-foreground">
                      {(feasibility.roughnessUtilization * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-xl border border-border-soft bg-white/90 px-3 py-2.5">
                    <div className="text-xs text-muted-soft">寿命下限需求</div>
                    <div className="mt-1 font-mono font-bold text-foreground">
                      {feasibility.minLifeRequirement.toFixed(2)} min
                    </div>
                  </div>
                  <div className="rounded-xl border border-border-soft bg-white/90 px-3 py-2.5">
                    <div className="text-xs text-muted-soft">速度偏移度</div>
                    <div className="mt-1 font-mono font-bold text-foreground">
                      {(feasibility.speedOffset * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-3">
                  <div className={`rounded-xl px-4 py-3 border ${metrics.validationReport.cuttingSpeed.valid ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <dt className="font-bold text-foreground">{metrics.validationReport.cuttingSpeed.valid ? '✓ ' : '✗ '}切削速度</dt>
                    <dd className="mt-1 text-xs text-muted-soft">{metrics.validationReport.cuttingSpeed.message}</dd>
                  </div>
                  <div className={`rounded-xl px-4 py-3 border ${metrics.validationReport.spindleSpeed.valid ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <dt className="font-bold text-foreground">{metrics.validationReport.spindleSpeed.valid ? '✓ ' : '✗ '}主轴转速</dt>
                    <dd className="mt-1 text-xs text-muted-soft">{metrics.validationReport.spindleSpeed.message}</dd>
                  </div>
                  <div className={`rounded-xl px-4 py-3 border ${metrics.validationReport.surfaceRoughness.valid ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <dt className="font-bold text-foreground">{metrics.validationReport.surfaceRoughness.valid ? '✓ ' : '✗ '}表面粗糙度</dt>
                    <dd className="mt-1 text-xs text-muted-soft">{metrics.validationReport.surfaceRoughness.message}</dd>
                  </div>
                  <div className={`rounded-xl px-4 py-3 border ${metrics.validationReport.toolLife.valid ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <dt className="font-bold text-foreground">{metrics.validationReport.toolLife.valid ? '✓ ' : '✗ '}刀具寿命</dt>
                    <dd className="mt-1 text-xs text-muted-soft">{metrics.validationReport.toolLife.message}</dd>
                  </div>
                  <div className={`rounded-xl px-4 py-3 border md:col-span-2 lg:col-span-1 ${metrics.validationReport.powerCheck.valid ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <dt className="font-bold text-foreground">{metrics.validationReport.powerCheck.valid ? '✓ ' : '✗ '}机床功率校验</dt>
                    <dd className="mt-1 text-xs text-muted-soft">{metrics.validationReport.powerCheck.message}</dd>
                  </div>
                </dl>

                <div className="mt-4 rounded-xl border border-border-soft bg-[#fffdf7] px-4 py-3">
                  <div className="text-sm font-semibold text-foreground">智能调参建议</div>
                  <ul className="mt-2 space-y-1.5 text-xs text-muted">
                    {feasibility.recommendations.map((item, index) => (
                      <li key={index} className="rounded-lg bg-white px-2.5 py-1.5 border border-border-soft">
                        {index + 1}. {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </section>
        </>
      )}

      <section className="fade-in rounded-[20px] border border-border-soft bg-white/90 p-4 shadow-lg" style={{ animationDelay: "700ms" }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-lg bg-accent-warm/10 flex items-center justify-center">
            <span className="text-accent-warm font-bold">📋</span>
          </div>
          <h3 className="text-lg font-bold text-foreground">建模备注</h3>
        </div>
        <div className="rounded-xl border border-border-soft bg-[#fffdf7] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-muted-soft">模型可信度评估</div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {modelingConfidence.level}（{(modelingConfidence.score * 100).toFixed(1)} / 100）
              </div>
            </div>
            <div className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-semibold text-muted">
              来源：
              {source === "deepseek"
                ? "DeepSeek 智能建模"
                : source === "fallback"
                  ? "本地规则库建模"
                  : "待建立"}
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent-warm"
              style={{ width: `${(modelingConfidence.score * 100).toFixed(1)}%` }}
            />
          </div>
        </div>

        {config && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-border-soft bg-white px-3 py-2.5">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-soft">
                决策变量边界快照
              </div>
              <div className="mt-1.5 text-xs text-muted space-y-1">
                <div className="font-mono">d_a0: [{config.bounds.lb[0]}, {config.bounds.ub[0]}] mm</div>
                <div className="font-mono">z_0: [{config.bounds.lb[1]}, {config.bounds.ub[1]}]</div>
                <div className="font-mono">n: [{config.bounds.lb[2]}, {config.bounds.ub[2]}] rpm</div>
                <div className="font-mono">f: [{config.bounds.lb[3]}, {config.bounds.ub[3]}] mm/r</div>
              </div>
            </div>
            <div className="rounded-xl border border-border-soft bg-white px-3 py-2.5">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-soft">
                关键约束与系数快照
              </div>
              <div className="mt-1.5 text-xs text-muted space-y-1">
                <div className="font-mono">P_max: {config.constraints.max_power.toFixed(1)} kW</div>
                <div className="font-mono">Ra_max: {config.constraints.max_ra.toFixed(1)} μm</div>
                <div className="font-mono">V_c_max: {config.constraints.max_cutting_speed.toFixed(1)} m/min</div>
                <div className="font-mono">C / m: {config.constants.tool_life_constant.toFixed(0)} / {config.constants.tool_life_exponent.toFixed(3)}</div>
              </div>
            </div>
          </div>
        )}

        {notes.length > 0 ? (
          <ul className="mt-3 grid gap-2 text-sm leading-relaxed">
            {classifiedNotes.map(({ note, meta }, index) => (
              <li key={index} className="rounded-xl px-4 py-3 border flex items-start gap-2 bg-white">
                <span className={`mt-0.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}>
                  {meta.tag}
                </span>
                <span className="text-muted flex-1">{note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted-soft">
            建模备注将在 AI 或本地规则库返回后显示。
          </p>
        )}
      </section>
    </div>
  );
}
