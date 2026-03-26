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
    <div className="space-y-6 rounded-[32px] border border-border bg-surface-strong p-6 shadow-[var(--shadow)] md:p-8">
      <div className="flex flex-col gap-4 border-b border-border/80 pb-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            Process Card
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground md:text-3xl">
            滚齿工艺参数指导卡
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            用于记录当前工况下的模型来源、推荐工艺参数与多目标优化结果，可直接打印用于展示。
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm leading-6 text-muted">
          <div>生成时间：{formatDateTime(generatedAt)}</div>
          <div>运行档位：{profileLabel}</div>
          <div>求解算法：{algorithmLabel}</div>
          <div>算法来源：{algorithmDescriptor}</div>
          <div>
            模型来源：
            {source === "deepseek"
              ? "DeepSeek"
              : source === "fallback"
                ? "本地规则库"
                : "待建立"}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-[24px] border border-border/80 bg-white/70 p-5">
          <h3 className="text-lg font-semibold text-foreground">齿轮基础参数</h3>
          <dl className="mt-4 grid gap-3 text-sm text-muted">
            <div className="flex items-center justify-between gap-4">
              <dt>齿轮模数 (m)</dt>
              <dd className="font-medium text-foreground">{request.module.toFixed(2)} mm</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>齿数 (z)</dt>
              <dd className="font-medium text-foreground">{request.teeth}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>齿宽 (B)</dt>
              <dd className="font-medium text-foreground">{request.faceWidth.toFixed(1)} mm</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>精度等级</dt>
              <dd className="font-medium text-foreground">GB/T 10095 级 {request.accuracyGrade}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>工件材料</dt>
              <dd className="font-medium text-foreground">{request.material}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>工件硬度</dt>
              <dd className="font-medium text-foreground">{request.hardness.toFixed(0)} HB</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-[24px] border border-border/80 bg-white/70 p-5">
          <h3 className="text-lg font-semibold text-foreground">刀具与机床</h3>
          {config ? (
            <dl className="mt-4 grid gap-3 text-sm text-muted">
              <div className="flex items-center justify-between gap-4">
                <dt>刀具材料</dt>
                <dd className="font-medium text-foreground">{request.tool}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>机床最大功率</dt>
                <dd className="font-medium text-foreground">
                  {request.maxPower.toFixed(1)} kW
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>泰勒寿命系数 C</dt>
                <dd className="font-mono font-semibold text-foreground">
                  {config.constants.tool_life_constant.toFixed(0)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>寿命指数 m</dt>
                <dd className="font-mono font-semibold text-foreground">
                  {config.constants.tool_life_exponent.toFixed(3)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>单位切削力 Kc</dt>
                <dd className="font-mono font-semibold text-foreground">
                  {config.constants.specific_cutting_force.toFixed(0)} N/mm²
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>表面粗糙度上限</dt>
                <dd className="font-semibold text-foreground">
                  {config.constraints.max_ra.toFixed(1)} μm
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted">
              模型尚未建立，等待 AI 或本地规则库返回工艺常数。
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[24px] border border-border/80 bg-[#fffdf7] p-5">
          <h3 className="text-lg font-semibold text-foreground">推荐工艺参数</h3>
          {decision ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-accent/8 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted">
                  d_a0
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold text-foreground">
                  {decision[0].toFixed(0)}
                </div>
                <div className="mt-1 text-sm text-muted">滚刀直径 (mm)</div>
              </div>
              <div className="rounded-2xl bg-accent/8 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted">
                  z_0
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold text-foreground">
                  {decision[1].toFixed(0)}
                </div>
                <div className="mt-1 text-sm text-muted">滚刀头数</div>
              </div>
              <div className="rounded-2xl bg-accent/8 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted">
                  n
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold text-foreground">
                  {decision[2].toFixed(2)}
                </div>
                <div className="mt-1 text-sm text-muted">主轴转速 (rpm)</div>
              </div>
              <div className="rounded-2xl bg-accent/8 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted">
                  f
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold text-foreground">
                  {decision[3].toFixed(2)}
                </div>
                <div className="mt-1 text-sm text-muted">轴向进给量 (mm/r)</div>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted">
              尚未获得推荐解。请先完成模型建立并运行所选优化算法。
            </p>
          )}
        </section>

        <section className="rounded-[24px] border border-border/80 bg-[#fffdf7] p-5">
          <h3 className="text-lg font-semibold text-foreground">目标函数结果</h3>
          <dl className="mt-4 grid gap-3 text-sm text-muted">
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent/8 px-4 py-3">
              <dt>单件能耗 E</dt>
              <dd className="font-mono text-lg font-semibold text-foreground">
                {formatNumber(objectives?.[0] ?? null, 4)} kWh
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent/8 px-4 py-3">
              <dt>单件成本 C</dt>
              <dd className="font-mono text-lg font-semibold text-foreground">
                {formatNumber(objectives?.[1] ?? null, 4)} 元
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent/8 px-4 py-3">
              <dt>粗糙度 Ra</dt>
              <dd className="font-mono text-lg font-semibold text-foreground">
                {formatNumber(objectives?.[2] ?? null, 4)} μm
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {metrics && (
        <>
          <section className="rounded-[24px] border border-border/80 bg-white/70 p-5">
            <h3 className="text-lg font-semibold text-foreground">核心工艺计算结果</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl bg-accent/6 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted">
                  切削速度 v_c
                </div>
                <div className="mt-1 font-mono text-xl font-semibold text-foreground">
                  {metrics.v_c.toFixed(2)} m/min
                </div>
              </div>
              <div className="rounded-2xl bg-accent/6 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted">
                  切削力 F
                </div>
                <div className="mt-1 font-mono text-xl font-semibold text-foreground">
                  {metrics.F_cut.toFixed(1)} N
                </div>
              </div>
              <div className="rounded-2xl bg-accent/6 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted">
                  切削功率 P
                </div>
                <div className="mt-1 font-mono text-xl font-semibold text-foreground">
                  {metrics.P_cut.toFixed(3)} kW
                </div>
              </div>
              <div className="rounded-2xl bg-accent/6 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted">
                  刀具寿命 T
                </div>
                <div className="mt-1 font-mono text-xl font-semibold text-foreground">
                  {metrics.T_tool.toFixed(1)} min
                </div>
              </div>
              <div className="rounded-2xl bg-accent/6 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted">
                  机动时间 t_c
                </div>
                <div className="mt-1 font-mono text-xl font-semibold text-foreground">
                  {metrics.t_c.toFixed(2)} min
                </div>
              </div>
              <div className="rounded-2xl bg-accent/6 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted">
                  总加工时间 T_total
                </div>
                <div className="mt-1 font-mono text-xl font-semibold text-foreground">
                  {metrics.T_total.toFixed(2)} min
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-border/80 bg-white/70 p-5">
            <h3 className="text-lg font-semibold text-foreground">计算过程与公式来源</h3>
            <dl className="mt-4 grid gap-3 text-sm text-muted">
              <div className="rounded-2xl bg-[#fffdf7] px-4 py-3">
                <dt className="font-semibold text-foreground">切削速度计算</dt>
                <dd className="mt-1 font-mono text-xs leading-6">{metrics.calculationSteps.cuttingSpeed}</dd>
              </div>
              <div className="rounded-2xl bg-[#fffdf7] px-4 py-3">
                <dt className="font-semibold text-foreground">主轴转速验证</dt>
                <dd className="mt-1 font-mono text-xs leading-6">{metrics.calculationSteps.spindleSpeed}</dd>
              </div>
              <div className="rounded-2xl bg-[#fffdf7] px-4 py-3">
                <dt className="font-semibold text-foreground">切削力计算</dt>
                <dd className="mt-1 font-mono text-xs leading-6">{metrics.calculationSteps.cuttingForce}</dd>
              </div>
              <div className="rounded-2xl bg-[#fffdf7] px-4 py-3">
                <dt className="font-semibold text-foreground">切削功率计算</dt>
                <dd className="mt-1 font-mono text-xs leading-6">{metrics.calculationSteps.cuttingPower}</dd>
              </div>
              <div className="rounded-2xl bg-[#fffdf7] px-4 py-3">
                <dt className="font-semibold text-foreground">刀具寿命计算 (泰勒公式)</dt>
                <dd className="mt-1 font-mono text-xs leading-6">{metrics.calculationSteps.toolLife}</dd>
              </div>
              <div className="rounded-2xl bg-[#fffdf7] px-4 py-3">
                <dt className="font-semibold text-foreground">表面粗糙度估算</dt>
                <dd className="mt-1 font-mono text-xs leading-6">{metrics.calculationSteps.surfaceRoughness}</dd>
              </div>
              <div className="rounded-2xl bg-[#fffdf7] px-4 py-3">
                <dt className="font-semibold text-foreground">加工时间计算</dt>
                <dd className="mt-1 font-mono text-xs leading-6">{metrics.calculationSteps.machiningTime}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-[24px] border border-border/80 bg-white/70 p-5">
            <h3 className="text-lg font-semibold text-foreground">工艺参数可行性评估报告</h3>
            <div className={`mt-4 rounded-2xl px-4 py-3 ${metrics.validationReport.overall.feasible ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="font-semibold text-foreground">
                总体评估：{metrics.validationReport.overall.feasible ? '✓ 可行' : '✗ 需调整'}
              </div>
              {metrics.validationReport.overall.warnings.length > 0 && (
                <div className="mt-2">
                  <div className="text-sm font-medium text-amber-700">警告：</div>
                  <ul className="mt-1 text-sm text-amber-600 list-disc list-inside">
                    {metrics.validationReport.overall.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className={`rounded-2xl px-4 py-3 ${metrics.validationReport.cuttingSpeed.valid ? 'bg-green-50' : 'bg-red-50'}`}>
                <dt className="font-semibold text-foreground">切削速度</dt>
                <dd className="mt-1 text-muted">{metrics.validationReport.cuttingSpeed.message}</dd>
              </div>
              <div className={`rounded-2xl px-4 py-3 ${metrics.validationReport.spindleSpeed.valid ? 'bg-green-50' : 'bg-red-50'}`}>
                <dt className="font-semibold text-foreground">主轴转速</dt>
                <dd className="mt-1 text-muted">{metrics.validationReport.spindleSpeed.message}</dd>
              </div>
              <div className={`rounded-2xl px-4 py-3 ${metrics.validationReport.surfaceRoughness.valid ? 'bg-green-50' : 'bg-red-50'}`}>
                <dt className="font-semibold text-foreground">表面粗糙度</dt>
                <dd className="mt-1 text-muted">{metrics.validationReport.surfaceRoughness.message}</dd>
              </div>
              <div className={`rounded-2xl px-4 py-3 ${metrics.validationReport.toolLife.valid ? 'bg-green-50' : 'bg-red-50'}`}>
                <dt className="font-semibold text-foreground">刀具寿命</dt>
                <dd className="mt-1 text-muted">{metrics.validationReport.toolLife.message}</dd>
              </div>
              <div className={`rounded-2xl px-4 py-3 ${metrics.validationReport.powerCheck.valid ? 'bg-green-50' : 'bg-red-50'}`}>
                <dt className="font-semibold text-foreground">机床功率校验</dt>
                <dd className="mt-1 text-muted">{metrics.validationReport.powerCheck.message}</dd>
              </div>
            </dl>
          </section>
        </>
      )}

      <section className="rounded-[24px] border border-border/80 bg-white/70 p-5">
        <h3 className="text-lg font-semibold text-foreground">建模备注</h3>
        {notes.length > 0 ? (
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-muted">
            {notes.map((note) => (
              <li key={note} className="rounded-2xl bg-accent/6 px-4 py-3">
                {note}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm leading-6 text-muted">
            建模备注将在 AI 或本地规则库返回后显示。
          </p>
        )}
      </section>
    </div>
  );
}
