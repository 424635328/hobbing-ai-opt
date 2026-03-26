import type {
  BuildModelRequest,
  DecisionVector,
  ModelConfig,
  ModelSource,
  ObjectiveVector,
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
          <h3 className="text-lg font-semibold text-foreground">工况输入</h3>
          <dl className="mt-4 grid gap-3 text-sm text-muted">
            <div className="flex items-center justify-between gap-4">
              <dt>工件材料</dt>
              <dd className="font-medium text-foreground">{request.material}</dd>
            </div>
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
          </dl>
        </section>

        <section className="rounded-[24px] border border-border/80 bg-white/70 p-5">
          <h3 className="text-lg font-semibold text-foreground">模型系数</h3>
          {config ? (
            <dl className="mt-4 grid gap-3 text-sm text-muted">
              <div className="flex items-center justify-between gap-4">
                <dt>刀具寿命系数</dt>
                <dd className="font-mono font-semibold text-foreground">
                  {config.constants.tool_life_coeff.toFixed(0)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>切削力系数</dt>
                <dd className="font-mono font-semibold text-foreground">
                  {config.constants.power_coeff.toFixed(4)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>表面粗糙度上限</dt>
                <dd className="font-semibold text-foreground">
                  {config.constraints.max_ra.toFixed(1)} μm
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>功率约束</dt>
                <dd className="font-semibold text-foreground">
                  {config.constraints.max_power.toFixed(1)} kW
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
                <div className="mt-1 text-sm text-muted">滚刀直径</div>
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
                <div className="mt-1 text-sm text-muted">主轴转速</div>
              </div>
              <div className="rounded-2xl bg-accent/8 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted">
                  f
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold text-foreground">
                  {decision[3].toFixed(2)}
                </div>
                <div className="mt-1 text-sm text-muted">轴向进给量</div>
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
