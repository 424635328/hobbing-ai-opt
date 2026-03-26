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

  return (
    <div className="space-y-6 rounded-[36px] border border-border-soft bg-surface-strong p-7 shadow-xl card-hover print-card md:p-10">
      <div className="flex flex-col gap-5 border-b border-border-soft pb-7 md:flex-row md:items-start md:justify-between">
        <div className="slide-up">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
            Process Card
          </p>
          <h2 className="mt-3 text-3xl font-bold text-foreground md:text-4xl">
            滚齿工艺参数指导卡
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-soft">
            用于记录当前工况下的模型来源、推荐工艺参数与多目标优化结果，可直接打印用于展示。
          </p>
        </div>
        <div className="fade-in rounded-2xl border border-border-soft bg-white/80 px-5 py-4 text-sm leading-relaxed text-muted shadow-sm">
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

      <div className="grid gap-7 lg:grid-cols-2">
        <section className="fade-in rounded-[28px] border border-border-soft bg-white/85 p-6 shadow-md">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <span className="text-accent font-bold text-lg">⚙</span>
            </div>
            <h3 className="text-xl font-bold text-foreground">齿轮基础参数</h3>
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-4 rounded-xl bg-accent/5 px-4 py-3">
              <dt className="text-muted-soft font-medium">齿轮模数 (m)</dt>
              <dd className="font-mono font-bold text-foreground text-lg">{request.module.toFixed(2)} mm</dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-accent/5 px-4 py-3">
              <dt className="text-muted-soft font-medium">齿数 (z)</dt>
              <dd className="font-mono font-bold text-foreground text-lg">{request.teeth}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-accent/5 px-4 py-3">
              <dt className="text-muted-soft font-medium">齿宽 (B)</dt>
              <dd className="font-mono font-bold text-foreground text-lg">{request.faceWidth.toFixed(1)} mm</dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-accent/5 px-4 py-3">
              <dt className="text-muted-soft font-medium">精度等级</dt>
              <dd className="font-bold text-foreground text-lg">GB/T 10095 级 {request.accuracyGrade}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-accent/5 px-4 py-3">
              <dt className="text-muted-soft font-medium">工件材料</dt>
              <dd className="font-bold text-foreground text-lg">{request.material}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-accent/5 px-4 py-3">
              <dt className="text-muted-soft font-medium">工件硬度</dt>
              <dd className="font-mono font-bold text-foreground text-lg">{request.hardness.toFixed(0)} HB</dd>
            </div>
          </dl>
        </section>

        <section className="fade-in rounded-[28px] border border-border-soft bg-white/85 p-6 shadow-md" style={{ animationDelay: "100ms" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-accent-warm/10 flex items-center justify-center">
              <span className="text-accent-warm font-bold text-lg">🔧</span>
            </div>
            <h3 className="text-xl font-bold text-foreground">刀具与机床</h3>
          </div>
          {config ? (
            <dl className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-4 rounded-xl bg-accent-warm/5 px-4 py-3">
                <dt className="text-muted-soft font-medium">刀具材料</dt>
                <dd className="font-bold text-foreground text-lg">{request.tool}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-accent-warm/5 px-4 py-3">
                <dt className="text-muted-soft font-medium">机床最大功率</dt>
                <dd className="font-mono font-bold text-foreground text-lg">
                  {request.maxPower.toFixed(1)} kW
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-accent-warm/5 px-4 py-3">
                <dt className="text-muted-soft font-medium">泰勒寿命系数 C</dt>
                <dd className="font-mono font-bold text-accent text-lg">
                  {config.constants.tool_life_constant.toFixed(0)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-accent-warm/5 px-4 py-3">
                <dt className="text-muted-soft font-medium">寿命指数 m</dt>
                <dd className="font-mono font-bold text-accent text-lg">
                  {config.constants.tool_life_exponent.toFixed(3)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-accent-warm/5 px-4 py-3">
                <dt className="text-muted-soft font-medium">单位切削力 Kc</dt>
                <dd className="font-mono font-bold text-accent text-lg">
                  {config.constants.specific_cutting_force.toFixed(0)} N/mm²
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-accent-warm/5 px-4 py-3">
                <dt className="text-muted-soft font-medium">表面粗糙度上限</dt>
                <dd className="font-mono font-bold text-accent-warm text-lg">
                  {config.constraints.max_ra.toFixed(1)} μm
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-base leading-relaxed text-muted-soft">
              模型尚未建立，等待 AI 或本地规则库返回工艺常数。
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-7 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="fade-in rounded-[28px] border border-border-soft bg-gradient-to-br from-[#fffdf7] to-white p-6 shadow-lg" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-accent/12 flex items-center justify-center">
              <span className="text-accent font-bold text-lg">✨</span>
            </div>
            <h3 className="text-xl font-bold text-foreground">推荐工艺参数</h3>
          </div>
          {decision ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-accent/8 p-5 border border-accent/15 hover:shadow-lg transition-all duration-300">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-soft font-semibold">
                  d_a0
                </div>
                <div className="mt-2 font-mono text-3xl font-bold text-accent">
                  {decision[0].toFixed(0)}
                </div>
                <div className="mt-2 text-sm text-muted-soft">滚刀直径 (mm)</div>
              </div>
              <div className="rounded-2xl bg-accent/8 p-5 border border-accent/15 hover:shadow-lg transition-all duration-300">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-soft font-semibold">
                  z_0
                </div>
                <div className="mt-2 font-mono text-3xl font-bold text-accent">
                  {decision[1].toFixed(0)}
                </div>
                <div className="mt-2 text-sm text-muted-soft">滚刀头数</div>
              </div>
              <div className="rounded-2xl bg-accent/8 p-5 border border-accent/15 hover:shadow-lg transition-all duration-300">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-soft font-semibold">
                  n
                </div>
                <div className="mt-2 font-mono text-3xl font-bold text-accent">
                  {decision[2].toFixed(2)}
                </div>
                <div className="mt-2 text-sm text-muted-soft">主轴转速 (rpm)</div>
              </div>
              <div className="rounded-2xl bg-accent/8 p-5 border border-accent/15 hover:shadow-lg transition-all duration-300">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-soft font-semibold">
                  f
                </div>
                <div className="mt-2 font-mono text-3xl font-bold text-accent">
                  {decision[3].toFixed(2)}
                </div>
                <div className="mt-2 text-sm text-muted-soft">轴向进给量 (mm/r)</div>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-base leading-relaxed text-muted-soft">
              尚未获得推荐解。请先完成模型建立并运行所选优化算法。
            </p>
          )}
        </section>

        <section className="fade-in rounded-[28px] border border-border-soft bg-gradient-to-br from-[#fffdf7] to-white p-6 shadow-lg" style={{ animationDelay: "300ms" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-accent-warm/12 flex items-center justify-center">
              <span className="text-accent-warm font-bold text-lg">🎯</span>
            </div>
            <h3 className="text-xl font-bold text-foreground">目标函数结果</h3>
          </div>
          <dl className="grid gap-4 text-sm">
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent-warm/8 px-5 py-4 border border-accent-warm/15">
              <dt className="text-muted-soft font-medium">单件能耗 E</dt>
              <dd className="font-mono text-xl font-bold text-accent-warm">
                {formatNumber(objectives?.[0] ?? null, 4)} kWh
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent-warm/8 px-5 py-4 border border-accent-warm/15">
              <dt className="text-muted-soft font-medium">单件成本 C</dt>
              <dd className="font-mono text-xl font-bold text-accent-warm">
                {formatNumber(objectives?.[1] ?? null, 4)} 元
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent-warm/8 px-5 py-4 border border-accent-warm/15">
              <dt className="text-muted-soft font-medium">粗糙度 Ra</dt>
              <dd className="font-mono text-xl font-bold text-accent-warm">
                {formatNumber(objectives?.[2] ?? null, 4)} μm
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {metrics && (
        <>
          <section className="fade-in rounded-[28px] border border-border-soft bg-white/90 p-6 shadow-lg" style={{ animationDelay: "400ms" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-accent/15 to-accent-warm/15 flex items-center justify-center">
                <span className="text-accent font-bold text-lg">📊</span>
              </div>
              <h3 className="text-xl font-bold text-foreground">核心工艺计算结果</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl bg-gradient-to-br from-accent/6 to-white px-5 py-4 border border-accent/10 hover:shadow-md transition-all">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-soft font-semibold">
                  切削速度 v_c
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-accent">
                  {metrics.v_c.toFixed(2)} m/min
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-accent/6 to-white px-5 py-4 border border-accent/10 hover:shadow-md transition-all">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-soft font-semibold">
                  切削力 F
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-accent">
                  {metrics.F_cut.toFixed(1)} N
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-accent/6 to-white px-5 py-4 border border-accent/10 hover:shadow-md transition-all">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-soft font-semibold">
                  切削功率 P
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-accent">
                  {metrics.P_cut.toFixed(3)} kW
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-accent/6 to-white px-5 py-4 border border-accent/10 hover:shadow-md transition-all">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-soft font-semibold">
                  刀具寿命 T
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-accent">
                  {metrics.T_tool.toFixed(1)} min
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-accent/6 to-white px-5 py-4 border border-accent/10 hover:shadow-md transition-all">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-soft font-semibold">
                  机动时间 t_c
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-accent">
                  {metrics.t_c.toFixed(2)} min
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-accent/6 to-white px-5 py-4 border border-accent/10 hover:shadow-md transition-all">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-soft font-semibold">
                  总加工时间 T_total
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-accent">
                  {metrics.T_total.toFixed(2)} min
                </div>
              </div>
            </div>
          </section>

          <section className="fade-in rounded-[28px] border border-border-soft bg-white/90 p-6 shadow-lg" style={{ animationDelay: "500ms" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <span className="text-accent font-bold text-lg">📝</span>
              </div>
              <h3 className="text-xl font-bold text-foreground">计算过程与公式来源</h3>
            </div>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-2xl bg-gradient-to-br from-[#fffdf7] to-white px-5 py-4 border border-border-soft">
                <dt className="font-bold text-foreground text-base">切削速度计算</dt>
                <dd className="mt-2 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.cuttingSpeed}</dd>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-[#fffdf7] to-white px-5 py-4 border border-border-soft">
                <dt className="font-bold text-foreground text-base">主轴转速验证</dt>
                <dd className="mt-2 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.spindleSpeed}</dd>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-[#fffdf7] to-white px-5 py-4 border border-border-soft">
                <dt className="font-bold text-foreground text-base">切削力计算</dt>
                <dd className="mt-2 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.cuttingForce}</dd>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-[#fffdf7] to-white px-5 py-4 border border-border-soft">
                <dt className="font-bold text-foreground text-base">切削功率计算</dt>
                <dd className="mt-2 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.cuttingPower}</dd>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-[#fffdf7] to-white px-5 py-4 border border-border-soft">
                <dt className="font-bold text-foreground text-base">刀具寿命计算 (泰勒公式)</dt>
                <dd className="mt-2 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.toolLife}</dd>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-[#fffdf7] to-white px-5 py-4 border border-border-soft">
                <dt className="font-bold text-foreground text-base">表面粗糙度估算</dt>
                <dd className="mt-2 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.surfaceRoughness}</dd>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-[#fffdf7] to-white px-5 py-4 border border-border-soft md:col-span-2">
                <dt className="font-bold text-foreground text-base">加工时间计算</dt>
                <dd className="mt-2 font-mono text-xs leading-relaxed text-muted">{metrics.calculationSteps.machiningTime}</dd>
              </div>
            </dl>
          </section>

          <section className="fade-in rounded-[28px] border border-border-soft bg-white/90 p-6 shadow-lg" style={{ animationDelay: "600ms" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                <span className="text-emerald-700 font-bold text-lg">✓</span>
              </div>
              <h3 className="text-xl font-bold text-foreground">工艺参数可行性评估报告</h3>
            </div>
            <div className={`mt-4 rounded-2xl px-6 py-5 border-2 ${metrics.validationReport.overall.feasible ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200'}`}>
              <div className="text-lg font-bold text-foreground flex items-center gap-3">
                {metrics.validationReport.overall.feasible ? (
                  <span className="text-2xl">✅</span>
                ) : (
                  <span className="text-2xl">⚠️</span>
                )}
                总体评估：{metrics.validationReport.overall.feasible ? '✓ 完全可行' : '✗ 需要调整'}
              </div>
              {metrics.validationReport.overall.warnings.length > 0 && (
                <div className="mt-4">
                  <div className="text-base font-semibold text-amber-700 flex items-center gap-2">
                    <span>⚠️</span> 警告：
                  </div>
                  <ul className="mt-2 text-sm text-amber-600 list-disc list-inside space-y-1">
                    {metrics.validationReport.overall.warnings.map((warning, index) => (
                      <li key={index} className="bg-amber-50/50 px-3 py-1 rounded">{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
              <div className={`rounded-2xl px-5 py-4 border ${metrics.validationReport.cuttingSpeed.valid ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                <dt className="font-bold text-foreground text-base">{metrics.validationReport.cuttingSpeed.valid ? '✓ ' : '✗ '}切削速度</dt>
                <dd className="mt-1 text-muted-soft">{metrics.validationReport.cuttingSpeed.message}</dd>
              </div>
              <div className={`rounded-2xl px-5 py-4 border ${metrics.validationReport.spindleSpeed.valid ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                <dt className="font-bold text-foreground text-base">{metrics.validationReport.spindleSpeed.valid ? '✓ ' : '✗ '}主轴转速</dt>
                <dd className="mt-1 text-muted-soft">{metrics.validationReport.spindleSpeed.message}</dd>
              </div>
              <div className={`rounded-2xl px-5 py-4 border ${metrics.validationReport.surfaceRoughness.valid ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                <dt className="font-bold text-foreground text-base">{metrics.validationReport.surfaceRoughness.valid ? '✓ ' : '✗ '}表面粗糙度</dt>
                <dd className="mt-1 text-muted-soft">{metrics.validationReport.surfaceRoughness.message}</dd>
              </div>
              <div className={`rounded-2xl px-5 py-4 border ${metrics.validationReport.toolLife.valid ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                <dt className="font-bold text-foreground text-base">{metrics.validationReport.toolLife.valid ? '✓ ' : '✗ '}刀具寿命</dt>
                <dd className="mt-1 text-muted-soft">{metrics.validationReport.toolLife.message}</dd>
              </div>
              <div className={`rounded-2xl px-5 py-4 border md:col-span-2 lg:col-span-1 ${metrics.validationReport.powerCheck.valid ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                <dt className="font-bold text-foreground text-base">{metrics.validationReport.powerCheck.valid ? '✓ ' : '✗ '}机床功率校验</dt>
                <dd className="mt-1 text-muted-soft">{metrics.validationReport.powerCheck.message}</dd>
              </div>
            </dl>
          </section>
        </>
      )}

      <section className="fade-in rounded-[28px] border border-border-soft bg-white/90 p-6 shadow-lg" style={{ animationDelay: "700ms" }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-accent-warm/10 flex items-center justify-center">
            <span className="text-accent-warm font-bold text-lg">📋</span>
          </div>
          <h3 className="text-xl font-bold text-foreground">建模备注</h3>
        </div>
        {notes.length > 0 ? (
          <ul className="mt-4 grid gap-3 text-base leading-relaxed">
            {notes.map((note, index) => (
              <li key={index} className="rounded-2xl bg-accent-warm/6 px-5 py-4 border border-accent-warm/10 flex items-start gap-3">
                <span className="text-accent-warm font-bold mt-1">•</span>
                <span className="text-muted">{note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-base leading-relaxed text-muted-soft">
            建模备注将在 AI 或本地规则库返回后显示。
          </p>
        )}
      </section>
    </div>
  );
}
