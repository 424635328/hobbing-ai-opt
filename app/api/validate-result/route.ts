import { NextResponse } from "next/server";

import { createDeepSeekClient, getDeepSeekApiKey } from "@/lib/deepseek";
import {
  computeProcessMetrics,
  hobbingObjective,
  type BuildModelRequest,
  type DecisionVector,
  type ModelConfig,
  type ModelSource,
  type ObjectiveVector,
} from "@/lib/hobbing-model";
import type {
  RankedSolutionSnapshot,
  ResultValidationReport,
  ResultValidationRequest,
  ResultValidationResponse,
  ValidationBoundaryCheck,
  ValidationConstraintCheck,
  ValidationVerdict,
  ValidationWeights,
} from "@/lib/result-validation-types";

export const runtime = "nodejs";

const DECISION_ITEMS: Array<{
  id: ValidationBoundaryCheck["id"];
  label: string;
}> = [
  { id: "d_a0", label: "滚刀直径 d_a0" },
  { id: "z_0", label: "滚刀头数 z_0" },
  { id: "n", label: "主轴转速 n" },
  { id: "f", label: "轴向进给量 f" },
];

const BOUNDARY_WARN_THRESHOLD = 0.08;
const SPEED_LOWER_BOUND = 25;
const SPEED_UPPER_BOUND = 80;

type ParsedPayload = ResultValidationRequest;

type AiValidationFeedback = {
  summary: string;
  verdict: ValidationVerdict;
  abnormalSignals: string[];
  recommendations: string[];
  reasoning: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseDecisionVector(value: unknown): DecisionVector | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null;
  }

  if (!value.every(isFiniteNumber)) {
    return null;
  }

  return [value[0], value[1], value[2], value[3]];
}

function parseObjectiveVector(value: unknown): ObjectiveVector | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }

  if (!value.every(isFiniteNumber)) {
    return null;
  }

  return [value[0], value[1], value[2]];
}

function parseRankedSolution(value: unknown): RankedSolutionSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const index = record.index;
  const decision = parseDecisionVector(record.decision);
  const objectives = parseObjectiveVector(record.objectives);
  const score = record.score;

  if (
    !isFiniteNumber(index) ||
    !Number.isInteger(index) ||
    !decision ||
    !objectives ||
    !isFiniteNumber(score)
  ) {
    return null;
  }

  return {
    index,
    decision,
    objectives,
    score,
  };
}

function parseBuildModelRequest(value: unknown): BuildModelRequest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const material =
    typeof record.material === "string" ? record.material.trim() : "";
  const tool = typeof record.tool === "string" ? record.tool.trim() : "";

  const numberKeys: Array<keyof BuildModelRequest> = [
    "maxPower",
    "module",
    "teeth",
    "faceWidth",
    "accuracyGrade",
    "hardness",
    "machineRate",
    "toolPrice",
    "electricityRate",
    "toolChangeTime",
    "toolSharpeningCost",
    "toolSharpeningLife",
  ];

  const numbers = Object.fromEntries(
    numberKeys.map((key) => [key, record[key]]),
  ) as Record<keyof BuildModelRequest, unknown>;

  if (!material || !tool) {
    return null;
  }

  if (!numberKeys.every((key) => isFiniteNumber(numbers[key]))) {
    return null;
  }

  return {
    material,
    tool,
    maxPower: numbers.maxPower as number,
    module: numbers.module as number,
    teeth: numbers.teeth as number,
    faceWidth: numbers.faceWidth as number,
    accuracyGrade: numbers.accuracyGrade as number,
    hardness: numbers.hardness as number,
    machineRate: numbers.machineRate as number,
    toolPrice: numbers.toolPrice as number,
    electricityRate: numbers.electricityRate as number,
    toolChangeTime: numbers.toolChangeTime as number,
    toolSharpeningCost: numbers.toolSharpeningCost as number,
    toolSharpeningLife: numbers.toolSharpeningLife as number,
  };
}

function parseModelConfig(value: unknown): ModelConfig | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const input = record.input as Record<string, unknown> | undefined;
  const gear = input?.gear as Record<string, unknown> | undefined;
  const cost = input?.cost as Record<string, unknown> | undefined;
  const bounds = record.bounds as Record<string, unknown> | undefined;
  const constants = record.constants as Record<string, unknown> | undefined;
  const constraints = record.constraints as Record<string, unknown> | undefined;

  if (
    !input ||
    typeof input.material !== "string" ||
    typeof input.tool !== "string" ||
    !gear ||
    !cost ||
    !bounds ||
    !constants ||
    !constraints
  ) {
    return null;
  }

  const lb = parseDecisionVector(bounds.lb);
  const ub = parseDecisionVector(bounds.ub);

  if (!lb || !ub) {
    return null;
  }

  const gearKeys = ["module", "teeth", "faceWidth", "accuracyGrade", "hardness"];
  const costKeys = [
    "machineRate",
    "toolPrice",
    "electricityRate",
    "toolChangeTime",
    "toolSharpeningCost",
    "toolSharpeningLife",
  ];
  const constantKeys = [
    "P_idle",
    "machine_efficiency",
    "auxiliary_time",
    "travel_clearance_coeff",
    "material_removal_factor",
    "tool_life_constant",
    "tool_life_exponent",
    "specific_cutting_force",
    "roughness_feed_coeff",
    "roughness_speed_coeff",
  ];
  const constraintKeys = [
    "max_power",
    "max_ra",
    "max_cutting_speed",
    "min_tool_life_ratio",
  ];

  if (
    !gearKeys.every((key) => isFiniteNumber(gear[key])) ||
    !costKeys.every((key) => isFiniteNumber(cost[key])) ||
    !constantKeys.every((key) => isFiniteNumber(constants[key])) ||
    !constraintKeys.every((key) => isFiniteNumber(constraints[key]))
  ) {
    return null;
  }

  return {
    input: {
      material: input.material,
      tool: input.tool,
      gear: {
        module: gear.module as number,
        teeth: gear.teeth as number,
        faceWidth: gear.faceWidth as number,
        accuracyGrade: gear.accuracyGrade as number,
        hardness: gear.hardness as number,
      },
      cost: {
        machineRate: cost.machineRate as number,
        toolPrice: cost.toolPrice as number,
        electricityRate: cost.electricityRate as number,
        toolChangeTime: cost.toolChangeTime as number,
        toolSharpeningCost: cost.toolSharpeningCost as number,
        toolSharpeningLife: cost.toolSharpeningLife as number,
      },
    },
    bounds: {
      lb,
      ub,
    },
    constants: {
      P_idle: constants.P_idle as number,
      machine_efficiency: constants.machine_efficiency as number,
      auxiliary_time: constants.auxiliary_time as number,
      travel_clearance_coeff: constants.travel_clearance_coeff as number,
      material_removal_factor: constants.material_removal_factor as number,
      tool_life_constant: constants.tool_life_constant as number,
      tool_life_exponent: constants.tool_life_exponent as number,
      specific_cutting_force: constants.specific_cutting_force as number,
      roughness_feed_coeff: constants.roughness_feed_coeff as number,
      roughness_speed_coeff: constants.roughness_speed_coeff as number,
    },
    constraints: {
      max_power: constraints.max_power as number,
      max_ra: constraints.max_ra as number,
      max_cutting_speed: constraints.max_cutting_speed as number,
      min_tool_life_ratio: constraints.min_tool_life_ratio as number,
    },
  };
}

function parseModelSource(value: unknown): ModelSource | null {
  if (value === "deepseek" || value === "fallback") {
    return value;
  }

  return null;
}

function parseWeights(value: unknown): ValidationWeights {
  if (!value || typeof value !== "object") {
    return { energy: 1 / 3, cost: 1 / 3, roughness: 1 / 3 };
  }

  const record = value as Record<string, unknown>;
  const energy = record.energy;
  const cost = record.cost;
  const roughness = record.roughness;

  if (!isFiniteNumber(energy) || !isFiniteNumber(cost) || !isFiniteNumber(roughness)) {
    return { energy: 1 / 3, cost: 1 / 3, roughness: 1 / 3 };
  }

  const sum = energy + cost + roughness;

  if (sum <= 0) {
    return { energy: 1 / 3, cost: 1 / 3, roughness: 1 / 3 };
  }

  return {
    energy: energy / sum,
    cost: cost / sum,
    roughness: roughness / sum,
  };
}

function parsePayload(payload: unknown): ParsedPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const request = parseBuildModelRequest(record.request);
  const config = parseModelConfig(record.config);
  const recommended = parseRankedSolution(record.recommended);
  const alternativesRaw = Array.isArray(record.alternatives)
    ? record.alternatives
    : [];
  const alternatives = alternativesRaw
    .map((item) => parseRankedSolution(item))
    .filter((item): item is RankedSolutionSnapshot => item !== null);
  const modelSource = parseModelSource(record.modelSource);
  const modelNotes = Array.isArray(record.modelNotes)
    ? record.modelNotes.filter((item): item is string => typeof item === "string")
    : [];
  const algorithmLabel =
    typeof record.algorithmLabel === "string" ? record.algorithmLabel.trim() : "";
  const profileLabel =
    typeof record.profileLabel === "string" ? record.profileLabel.trim() : "";
  const normalizedWeights = parseWeights(record.normalizedWeights);

  if (!request || !config || !recommended || !algorithmLabel || !profileLabel) {
    return null;
  }

  return {
    request,
    config,
    recommended,
    alternatives: alternatives.slice(0, 5),
    modelSource,
    modelNotes,
    algorithmLabel,
    profileLabel,
    normalizedWeights,
  };
}

function dedupeStrings(values: string[], limit: number): string[] {
  const unique = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) {
      unique.add(trimmed);
    }
  }

  return Array.from(unique).slice(0, limit);
}

function compareVerdict(left: ValidationVerdict, right: ValidationVerdict): ValidationVerdict {
  const level = (value: ValidationVerdict): number => {
    if (value === "不合理") {
      return 2;
    }
    if (value === "需关注") {
      return 1;
    }
    return 0;
  };

  return level(left) >= level(right) ? left : right;
}

function buildBoundaryChecks(
  decision: DecisionVector,
  config: ModelConfig,
): ValidationBoundaryCheck[] {
  return DECISION_ITEMS.map((item, axis) => {
    const value = decision[axis];
    const lower = config.bounds.lb[axis];
    const upper = config.bounds.ub[axis];
    const range = Math.max(upper - lower, 1e-9);
    const distanceToLower = value - lower;
    const distanceToUpper = upper - value;
    const minDistanceRatio = Math.max(
      0,
      Math.min(distanceToLower, distanceToUpper) / range,
    );
    const atBoundary =
      Math.abs(value - lower) <= 1e-6 || Math.abs(value - upper) <= 1e-6;
    const nearBoundary = !atBoundary && minDistanceRatio <= BOUNDARY_WARN_THRESHOLD;
    const status: ValidationBoundaryCheck["status"] = atBoundary
      ? "at_boundary"
      : nearBoundary
        ? "near_boundary"
        : "normal";
    const detail =
      status === "at_boundary"
        ? `${item.label} 已触及搜索边界，优化空间可能受限。`
        : status === "near_boundary"
          ? `${item.label} 距边界 ${(minDistanceRatio * 100).toFixed(1)}%，建议关注鲁棒性。`
          : `${item.label} 位于边界内部，留有优化余量。`;

    return {
      id: item.id,
      label: item.label,
      value,
      lower,
      upper,
      minDistanceRatio,
      status,
      detail,
    };
  });
}

function buildConstraintChecks(
  decision: DecisionVector,
  objectives: ObjectiveVector,
  config: ModelConfig,
): {
  checks: ValidationConstraintCheck[];
  metrics: ReturnType<typeof computeProcessMetrics>;
} {
  const metrics = computeProcessMetrics(decision, config);
  const minToolLife = config.constraints.min_tool_life_ratio * metrics.t_c;
  const speedUpper = Math.min(SPEED_UPPER_BOUND, config.constraints.max_cutting_speed);
  const expectedObjectives = hobbingObjective(decision, config);
  const objectiveRelativeErrors = expectedObjectives.map((value, axis) => {
    const denominator = Math.max(Math.abs(value), 1e-6);
    return Math.abs(value - objectives[axis]) / denominator;
  });
  const maxObjectiveRelativeError = Math.max(...objectiveRelativeErrors);

  const powerPass = metrics.P_cut <= config.constraints.max_power;
  const roughnessPass = metrics.roughness <= config.constraints.max_ra;
  const toolLifePass = metrics.T_tool >= minToolLife;
  const speedPass = metrics.v_c >= SPEED_LOWER_BOUND && metrics.v_c <= speedUpper;

  const checks: ValidationConstraintCheck[] = [
    {
      id: "power",
      label: "机床功率约束",
      status: !powerPass ? "fail" : metrics.P_cut / config.constraints.max_power > 0.92 ? "warn" : "pass",
      detail: powerPass
        ? `切削功率 ${metrics.P_cut.toFixed(3)} kW，功率裕量 ${(100 - (metrics.P_cut / config.constraints.max_power) * 100).toFixed(1)}%。`
        : `切削功率 ${metrics.P_cut.toFixed(3)} kW 超过上限 ${config.constraints.max_power.toFixed(3)} kW。`,
      value: metrics.P_cut,
      unit: "kW",
      upperLimit: config.constraints.max_power,
      utilization: metrics.P_cut / Math.max(config.constraints.max_power, 1e-6),
    },
    {
      id: "roughness",
      label: "粗糙度约束",
      status: !roughnessPass ? "fail" : metrics.roughness / config.constraints.max_ra > 0.92 ? "warn" : "pass",
      detail: roughnessPass
        ? `Ra=${metrics.roughness.toFixed(4)} μm，满足上限 ${config.constraints.max_ra.toFixed(4)} μm。`
        : `Ra=${metrics.roughness.toFixed(4)} μm，超出上限 ${config.constraints.max_ra.toFixed(4)} μm。`,
      value: metrics.roughness,
      unit: "μm",
      upperLimit: config.constraints.max_ra,
      utilization: metrics.roughness / Math.max(config.constraints.max_ra, 1e-6),
    },
    {
      id: "tool_life",
      label: "刀具寿命约束",
      status: !toolLifePass ? "fail" : minToolLife / metrics.T_tool > 0.9 ? "warn" : "pass",
      detail: toolLifePass
        ? `刀具寿命 ${metrics.T_tool.toFixed(2)} min，要求下限 ${minToolLife.toFixed(2)} min。`
        : `刀具寿命 ${metrics.T_tool.toFixed(2)} min 低于要求下限 ${minToolLife.toFixed(2)} min。`,
      value: metrics.T_tool,
      unit: "min",
      lowerLimit: minToolLife,
      utilization: minToolLife / Math.max(metrics.T_tool, 1e-6),
    },
    {
      id: "speed",
      label: "切削速度常理区间",
      status: !speedPass ? "fail" : metrics.v_c > speedUpper * 0.95 || metrics.v_c < SPEED_LOWER_BOUND + 2 ? "warn" : "pass",
      detail: speedPass
        ? `切削速度 ${metrics.v_c.toFixed(2)} m/min 位于 ${SPEED_LOWER_BOUND}-${speedUpper.toFixed(2)} m/min 区间。`
        : `切削速度 ${metrics.v_c.toFixed(2)} m/min 不在 ${SPEED_LOWER_BOUND}-${speedUpper.toFixed(2)} m/min 区间。`,
      value: metrics.v_c,
      unit: "m/min",
      lowerLimit: SPEED_LOWER_BOUND,
      upperLimit: speedUpper,
      utilization: metrics.v_c / Math.max(speedUpper, 1e-6),
    },
    {
      id: "objective_consistency",
      label: "目标函数一致性",
      status:
        maxObjectiveRelativeError > 0.03
          ? "fail"
          : maxObjectiveRelativeError > 0.01
            ? "warn"
            : "pass",
      detail: `推荐解目标与模型复算最大相对偏差 ${(maxObjectiveRelativeError * 100).toFixed(2)}%。`,
      value: maxObjectiveRelativeError * 100,
      unit: "%",
      upperLimit: 3,
      utilization: maxObjectiveRelativeError,
    },
  ];

  return { checks, metrics };
}

function buildLocalReport(payload: ParsedPayload): ResultValidationReport {
  const boundaryChecks = buildBoundaryChecks(
    payload.recommended.decision,
    payload.config,
  );
  const { checks: constraintChecks, metrics } = buildConstraintChecks(
    payload.recommended.decision,
    payload.recommended.objectives,
    payload.config,
  );

  const boundarySignals = boundaryChecks
    .filter((item) => item.status !== "normal")
    .map((item) => item.detail);
  const constraintSignals = constraintChecks
    .filter((item) => item.status !== "pass")
    .map((item) => item.detail);
  const abnormalSignals = dedupeStrings(
    [...boundarySignals, ...constraintSignals],
    8,
  );

  const failCount = constraintChecks.filter((item) => item.status === "fail").length;
  const warnCount =
    constraintChecks.filter((item) => item.status === "warn").length +
    boundaryChecks.filter((item) => item.status !== "normal").length;
  const hasBoundaryHit = boundaryChecks.some((item) => item.status === "at_boundary");

  let verdict: ValidationVerdict;

  if (failCount > 0) {
    verdict = "不合理";
  } else if (warnCount >= 2 || hasBoundaryHit) {
    verdict = "需关注";
  } else {
    verdict = "合理";
  }

  const recommendations: string[] = [];
  const powerCheck = constraintChecks.find((item) => item.id === "power");
  const roughnessCheck = constraintChecks.find((item) => item.id === "roughness");
  const toolLifeCheck = constraintChecks.find((item) => item.id === "tool_life");
  const speedCheck = constraintChecks.find((item) => item.id === "speed");

  if (powerCheck && powerCheck.status !== "pass") {
    recommendations.push("功率裕量偏紧，建议优先降低主轴转速 n 或进给量 f。");
  }

  if (roughnessCheck && roughnessCheck.status !== "pass") {
    recommendations.push("粗糙度风险偏高，建议降低 f 并复核刀具头数 z_0 的取值。");
  }

  if (toolLifeCheck && toolLifeCheck.status !== "pass") {
    recommendations.push("刀具寿命安全系数不足，建议降低切削速度或提高刀具耐磨等级。");
  }

  if (speedCheck && speedCheck.status !== "pass") {
    recommendations.push("切削速度偏离常理区间，建议将速度回调到经验工作带。");
  }

  const nearBoundaryIds = new Set(
    boundaryChecks
      .filter((item) => item.status !== "normal")
      .map((item) => item.id),
  );

  if (nearBoundaryIds.has("n") || nearBoundaryIds.has("f")) {
    recommendations.push("n 或 f 接近边界，建议在边界内回退 3%-8% 做稳态验证。");
  }

  if (nearBoundaryIds.has("z_0")) {
    recommendations.push("z_0 触边时，建议补充单头/双头滚刀方案做敏感性对比。");
  }

  if (recommendations.length === 0) {
    recommendations.push("当前结果整体合理，可进入小批量试切并记录实测偏差。");
  }

  const summary =
    verdict === "不合理"
      ? `检测到 ${failCount} 项关键约束不满足，当前推荐解不建议直接投产。`
      : verdict === "需关注"
        ? `结果整体可用，但存在 ${warnCount} 项边界或裕量风险，建议先做稳健性验证。`
        : "结果与工艺约束匹配良好，未发现明显异常。";

  return {
    source: "fallback",
    generatedAt: new Date().toISOString(),
    verdict,
    summary,
    boundaryChecks,
    constraintChecks,
    abnormalSignals,
    recommendations: dedupeStrings(recommendations, 8),
    coreMetrics: {
      cuttingSpeed: metrics.v_c,
      cuttingPower: metrics.P_cut,
      roughness: metrics.roughness,
      toolLife: metrics.T_tool,
      toolLifeRequired: payload.config.constraints.min_tool_life_ratio * metrics.t_c,
      machiningTime: metrics.t_c,
      totalTime: metrics.T_total,
    },
  };
}

function buildAiPrompt(payload: ParsedPayload, localReport: ResultValidationReport): string {
  const promptPayload = {
    processInput: payload.request,
    algorithm: payload.algorithmLabel,
    profile: payload.profileLabel,
    modelSource: payload.modelSource ?? "unknown",
    modelNotes: payload.modelNotes,
    weights: payload.normalizedWeights,
    recommended: payload.recommended,
    alternatives: payload.alternatives,
    localValidation: {
      verdict: localReport.verdict,
      summary: localReport.summary,
      boundaryChecks: localReport.boundaryChecks,
      constraintChecks: localReport.constraintChecks,
      abnormalSignals: localReport.abnormalSignals,
      recommendations: localReport.recommendations,
      coreMetrics: localReport.coreMetrics,
    },
  };

  return [
    "请作为资深滚齿工艺工程师，审查以下优化结果是否符合工程常理。",
    "重点：约束是否满足、参数是否贴边、是否存在风险组合、建议如何修正。",
    "你必须输出 JSON，结构如下：",
    "{",
    '  "summary": "一句话总结",',
    '  "verdict": "合理|需关注|不合理",',
    '  "abnormalSignals": ["信号1", "信号2"],',
    '  "recommendations": ["建议1", "建议2"],',
    '  "reasoning": "简短技术依据"',
    "}",
    "不要输出 Markdown，不要输出额外字段。",
    `输入数据：${JSON.stringify(promptPayload)}`,
  ].join("\n");
}

function parseAiFeedback(content: string): AiValidationFeedback | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const verdict = record.verdict;
  const abnormalSignals = Array.isArray(record.abnormalSignals)
    ? record.abnormalSignals.filter((item): item is string => typeof item === "string")
    : [];
  const recommendations = Array.isArray(record.recommendations)
    ? record.recommendations.filter((item): item is string => typeof item === "string")
    : [];
  const reasoning = typeof record.reasoning === "string" ? record.reasoning.trim() : "";

  if (
    !summary ||
    (verdict !== "合理" && verdict !== "需关注" && verdict !== "不合理")
  ) {
    return null;
  }

  return {
    summary,
    verdict,
    abnormalSignals: dedupeStrings(abnormalSignals, 8),
    recommendations: dedupeStrings(recommendations, 8),
    reasoning,
  };
}

function mergeWithAiFeedback(
  localReport: ResultValidationReport,
  feedback: AiValidationFeedback,
): ResultValidationReport {
  const mergedVerdict = compareVerdict(localReport.verdict, feedback.verdict);
  const mergedSummary =
    mergedVerdict === feedback.verdict
      ? feedback.summary
      : `${feedback.summary}（本地硬约束校验判定：${localReport.verdict}）`;

  return {
    ...localReport,
    source: "deepseek",
    verdict: mergedVerdict,
    summary: mergedSummary,
    abnormalSignals: dedupeStrings(
      [...feedback.abnormalSignals, ...localReport.abnormalSignals],
      8,
    ),
    recommendations: dedupeStrings(
      [...feedback.recommendations, ...localReport.recommendations],
      8,
    ),
    aiReasoning: feedback.reasoning || undefined,
  };
}

export async function POST(req: Request) {
  let parsed: ParsedPayload | null = null;

  try {
    parsed = parsePayload(await req.json());
  } catch (error) {
    console.error("Failed to parse validate-result payload:", error);
    parsed = null;
  }

  if (!parsed) {
    return NextResponse.json<ResultValidationResponse>(
      {
        success: false,
        error: "请求体无效，缺少结果校验所需字段。",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  }

  const localReport = buildLocalReport(parsed);
  const apiKey = getDeepSeekApiKey();

  if (!apiKey) {
    return NextResponse.json<ResultValidationResponse>(
      {
        success: true,
        report: localReport,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  }

  try {
    const client = createDeepSeekClient(apiKey);
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是机械加工工艺专家。必须返回合法 JSON，不要输出 Markdown、注释或多余文字。",
        },
        {
          role: "user",
          content: buildAiPrompt(parsed, localReport),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("DeepSeek 未返回有效内容。");
    }

    const aiFeedback = parseAiFeedback(content);

    if (!aiFeedback) {
      throw new Error("DeepSeek 返回内容无法解析为校验报告。");
    }

    return NextResponse.json<ResultValidationResponse>(
      {
        success: true,
        report: mergeWithAiFeedback(localReport, aiFeedback),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("validate-result DeepSeek error:", error);

    return NextResponse.json<ResultValidationResponse>(
      {
        success: true,
        report: localReport,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  }
}
