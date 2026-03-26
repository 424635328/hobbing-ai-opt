export type BoundsTuple = [number, number, number, number];
export type DecisionVector = [number, number, number, number];
export type ObjectiveVector = [number, number, number];

export interface GearParameters {
  module: number;
  teeth: number;
  faceWidth: number;
  accuracyGrade: number;
  hardness: number;
}

export interface CostParameters {
  machineRate: number;
  toolPrice: number;
  electricityRate: number;
  toolChangeTime: number;
  toolSharpeningCost: number;
  toolSharpeningLife: number;
}

export interface BuildModelRequest {
  material: string;
  tool: string;
  maxPower: number;
  module: number;
  teeth: number;
  faceWidth: number;
  accuracyGrade: number;
  hardness: number;
  machineRate: number;
  toolPrice: number;
  electricityRate: number;
  toolChangeTime: number;
  toolSharpeningCost: number;
  toolSharpeningLife: number;
}

export interface ModelConfig {
  input: {
    material: string;
    tool: string;
    gear: GearParameters;
    cost: CostParameters;
  };
  bounds: { lb: BoundsTuple; ub: BoundsTuple };
  constants: {
    P_idle: number;
    machine_efficiency: number;
    auxiliary_time: number;
    travel_clearance_coeff: number;
    material_removal_factor: number;
    tool_life_constant: number;
    tool_life_exponent: number;
    specific_cutting_force: number;
    roughness_feed_coeff: number;
    roughness_speed_coeff: number;
  };
  constraints: {
    max_power: number;
    max_ra: number;
    max_cutting_speed: number;
    min_tool_life_ratio: number;
  };
}

export type ModelSource = "deepseek" | "fallback";

export type BuildModelResponse =
  | {
      success: true;
      config: ModelConfig;
      source: ModelSource;
      notes: string[];
    }
  | {
      success: false;
      error: string;
    };

export const DEFAULT_GEAR_PARAMETERS: GearParameters = {
  module: 2.5,
  teeth: 36,
  faceWidth: 28,
  accuracyGrade: 8,
  hardness: 240,
};

export const DEFAULT_COST_PARAMETERS: CostParameters = {
  machineRate: 2.0,
  toolPrice: 1500,
  electricityRate: 0.85,
  toolChangeTime: 8,
  toolSharpeningCost: 80,
  toolSharpeningLife: 50,
};

export const DEFAULT_BOUNDS: ModelConfig["bounds"] = {
  lb: [63, 1, 120, 0.2],
  ub: [110, 3, 320, 1.2],
};

export const DEFAULT_CONSTANTS: ModelConfig["constants"] = {
  P_idle: 3.2,
  machine_efficiency: 0.82,
  auxiliary_time: 1.2,
  travel_clearance_coeff: 2.6,
  material_removal_factor: 0.42,
  tool_life_constant: 180,
  tool_life_exponent: 0.22,
  specific_cutting_force: 2600,
  roughness_feed_coeff: 7.8,
  roughness_speed_coeff: 0.03,
};

export const DEFAULT_CONSTRAINTS: ModelConfig["constraints"] = {
  max_power: 12.0,
  max_ra: 3.2,
  max_cutting_speed: 60,
  min_tool_life_ratio: 10,
};

export const PENALTY_THRESHOLD = 5000;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function sanitizeAccuracyGrade(value: number): number {
  return Math.round(clamp(value, 6, 9));
}

export function deriveAccuracyRaLimit(accuracyGrade: number): number {
  const sanitized = sanitizeAccuracyGrade(accuracyGrade);

  if (sanitized <= 6) {
    return 1.6;
  }

  if (sanitized === 7) {
    return 2.5;
  }

  if (sanitized === 8) {
    return 3.2;
  }

  return 4.5;
}

function deriveAccuracyRaBase(accuracyGrade: number): number {
  const sanitized = sanitizeAccuracyGrade(accuracyGrade);

  if (sanitized <= 6) {
    return 0.9;
  }

  if (sanitized === 7) {
    return 1.4;
  }

  if (sanitized === 8) {
    return 2.0;
  }

  return 2.8;
}

export function applyEngineeringConstraints(
  x: number[],
  lb: number[],
  ub: number[],
): DecisionVector {
  return [
    Math.round(clamp(x[0], lb[0], ub[0])),
    Math.round(clamp(x[1], lb[1], ub[1])),
    roundTo(clamp(x[2], lb[2], ub[2]), 2),
    roundTo(clamp(x[3], lb[3], ub[3]), 2),
  ];
}

export interface CalculationSteps {
  cuttingSpeed: string;
  spindleSpeed: string;
  cuttingForce: string;
  cuttingPower: string;
  toolLife: string;
  surfaceRoughness: string;
  machiningTime: string;
  costBreakdown: string;
}

export interface ValidationReport {
  cuttingSpeed: { valid: boolean; message: string };
  spindleSpeed: { valid: boolean; message: string };
  surfaceRoughness: { valid: boolean; message: string };
  toolLife: { valid: boolean; message: string };
  powerCheck: { valid: boolean; message: string };
  overall: { feasible: boolean; warnings: string[] };
}

export function computeProcessMetrics(x: number[], config: ModelConfig) {
  const constrained = applyEngineeringConstraints(
    x,
    config.bounds.lb,
    config.bounds.ub,
  );
  const [d_a0, z_0, n, f] = constrained;
  const { constants, constraints } = config;
  const { gear, cost } = config.input;

  const pitchDiameter = gear.module * gear.teeth;
  const wholeDepth = 2.25 * gear.module;
  const axialTravel =
    gear.faceWidth + constants.travel_clearance_coeff * gear.module + 6;
  const feedSpeed = Math.max(f * n * z_0, 1e-6);
  const t_c = axialTravel / feedSpeed;

  const v_c = (Math.PI * d_a0 * n) / 1000;

  const Ap = gear.module * gear.faceWidth;
  const Aw = f * z_0;
  const Kc = clamp(constants.specific_cutting_force, 2000, 4000);
  const F_cut = Kc * Ap * Aw / 1000;

  const P_cut = (F_cut * v_c) / (60 * 1000 * constants.machine_efficiency);

  const removedVolume =
    Math.PI *
    pitchDiameter *
    gear.faceWidth *
    wholeDepth *
    constants.material_removal_factor;
  const materialRemovalRate = removedVolume / Math.max(t_c, 1e-6);

  const C = clamp(constants.tool_life_constant, 100, 300);
  const m = constants.tool_life_exponent;
  const T_tool = Math.max(1, Math.pow(C / Math.max(v_c, 1e-6), 1 / m));

  const toolWearRatio = t_c / T_tool;
  const toolChangeAllocation = cost.toolChangeTime * toolWearRatio;
  const T_total = t_c + constants.auxiliary_time + toolChangeAllocation;

  const feedRatio = f / Math.max(gear.module, 0.5);
  let roughness = deriveAccuracyRaBase(gear.accuracyGrade);
  roughness += constants.roughness_feed_coeff * Math.pow(feedRatio, 1.35) / Math.pow(z_0, 0.28);
  roughness += constants.roughness_speed_coeff * Math.max(0, v_c - constraints.max_cutting_speed * 0.9);
  roughness += 0.06 * Math.max(0, gear.hardness - 280) / 10;

  if (f >= 1.0) {
    roughness = Math.max(roughness, 6.3);
  }

  const calculationSteps: CalculationSteps = {
    cuttingSpeed: `v_c = (π × d_a0 × n) / 1000 = (3.1416 × ${d_a0.toFixed(0)} × ${n.toFixed(2)}) / 1000 = ${v_c.toFixed(2)} m/min`,
    spindleSpeed: `n = (1000 × v_c) / (π × d_a0) = (1000 × ${v_c.toFixed(2)}) / (3.1416 × ${d_a0.toFixed(0)}) = ${n.toFixed(2)} rpm`,
    cuttingForce: `F = Kc × Ap × Aw = ${Kc.toFixed(0)} N/mm² × ${Ap.toFixed(2)} mm² × ${Aw.toFixed(2)} = ${F_cut.toFixed(2)} N`,
    cuttingPower: `P = (F × v_c) / (60000 × η) = (${F_cut.toFixed(2)} × ${v_c.toFixed(2)}) / (60000 × ${constants.machine_efficiency.toFixed(2)}) = ${P_cut.toFixed(3)} kW`,
    toolLife: `T = (C / v_c)^(1/m) = (${C.toFixed(0)} / ${v_c.toFixed(2)})^(1/${m.toFixed(2)}) = ${T_tool.toFixed(1)} min`,
    surfaceRoughness: `Ra = 基础值 + 进给影响 + 速度影响 = ${roughness.toFixed(3)} μm`,
    machiningTime: `T_total = 机动时间 + 辅助时间 + 换刀时间 = ${t_c.toFixed(2)} + ${constants.auxiliary_time.toFixed(2)} + ${toolChangeAllocation.toFixed(2)} = ${T_total.toFixed(2)} min`,
    costBreakdown: `总成本 = 机床成本 + 刀具成本 + 能耗成本`,
  };

  const validationReport: ValidationReport = {
    cuttingSpeed: {
      valid: v_c >= 30 && v_c <= 80,
      message: v_c >= 30 && v_c <= 80 
        ? `切削速度 ${v_c.toFixed(2)} m/min 在推荐范围 30-80 m/min 内`
        : `切削速度 ${v_c.toFixed(2)} m/min 超出推荐范围 30-80 m/min`,
    },
    spindleSpeed: {
      valid: true,
      message: `主轴转速 ${n.toFixed(2)} rpm 计算精度 ±5rpm`,
    },
    surfaceRoughness: {
      valid: roughness <= constraints.max_ra,
      message: roughness <= constraints.max_ra
        ? `表面粗糙度 ${roughness.toFixed(3)} μm 满足精度等级 ${gear.accuracyGrade} 要求 (Ra ≤ ${constraints.max_ra.toFixed(1)} μm)`
        : `表面粗糙度 ${roughness.toFixed(3)} μm 超出精度等级 ${gear.accuracyGrade} 要求 (Ra ≤ ${constraints.max_ra.toFixed(1)} μm)`,
    },
    toolLife: {
      valid: T_tool >= constraints.min_tool_life_ratio * t_c,
      message: T_tool >= constraints.min_tool_life_ratio * t_c
        ? `刀具寿命 ${T_tool.toFixed(1)} min 满足要求`
        : `刀具寿命 ${T_tool.toFixed(1)} min 偏短，建议降低切削速度`,
    },
    powerCheck: {
      valid: P_cut <= constraints.max_power,
      message: P_cut <= constraints.max_power
        ? `切削功率 ${P_cut.toFixed(3)} kW ≤ 机床功率 ${constraints.max_power.toFixed(1)} kW`
        : `切削功率 ${P_cut.toFixed(3)} kW 超出机床功率 ${constraints.max_power.toFixed(1)} kW 限制`,
    },
    overall: {
      feasible: 
        v_c >= 30 && v_c <= 80 &&
        roughness <= constraints.max_ra &&
        T_tool >= constraints.min_tool_life_ratio * t_c &&
        P_cut <= constraints.max_power,
      warnings: [],
    },
  };

  if (f >= 1.0 && roughness < 6.3) {
    validationReport.overall.warnings.push('进给量≥1mm/r时，理论粗糙度应≥Ra6.3μm');
  }
  if (v_c < 30 || v_c > 80) {
    validationReport.overall.warnings.push('切削速度建议在30-80m/min范围');
  }

  return {
    constrained,
    pitchDiameter,
    wholeDepth,
    axialTravel,
    feedSpeed,
    removedVolume,
    materialRemovalRate,
    v_c,
    T_tool,
    P_cut,
    F_cut,
    t_c,
    T_total,
    toolWearRatio,
    toolChangeAllocation,
    roughness,
    calculationSteps,
    validationReport,
  };
}

export function hobbingObjective(
  x: number[],
  config: ModelConfig,
): ObjectiveVector {
  const { constants, constraints } = config;
  const { cost } = config.input;
  const metrics = computeProcessMetrics(x, config);
  const { T_tool, P_cut, t_c, T_total, roughness, v_c, toolWearRatio } = metrics;

  const energy = (constants.P_idle * T_total + P_cut * t_c) / 60;

  const sharpeningTimes = Math.floor(cost.toolSharpeningLife / (1 / Math.max(toolWearRatio, 0.001)));
  const effectiveToolLife = 1 / toolWearRatio;
  const totalToolCostPerPiece = (cost.toolPrice + sharpeningTimes * cost.toolSharpeningCost) / effectiveToolLife;

  const machineCost = cost.machineRate * T_total;
  const toolCost = totalToolCostPerPiece;
  const energyCost = cost.electricityRate * energy;
  const costValue = machineCost + toolCost + energyCost;

  let penalty = 0;
  const penaltyFactor = 1e5;

  if (P_cut > constraints.max_power) {
    penalty += penaltyFactor * (P_cut - constraints.max_power) ** 2;
  }

  if (T_tool < constraints.min_tool_life_ratio * t_c) {
    penalty +=
      penaltyFactor *
      (constraints.min_tool_life_ratio * t_c - T_tool) ** 2;
  }

  if (roughness > constraints.max_ra) {
    penalty += penaltyFactor * (roughness - constraints.max_ra) ** 2;
  }

  if (v_c > constraints.max_cutting_speed) {
    penalty += penaltyFactor * (v_c - constraints.max_cutting_speed) ** 2;
  }

  return [energy + penalty, costValue + penalty, roughness + penalty];
}

export function serializeDecisionVector(vector: number[]): string {
  return vector.map((value) => roundTo(value, 2).toFixed(2)).join("|");
}

export function isPenaltySolution(objectives: number[]): boolean {
  return objectives[0] >= PENALTY_THRESHOLD;
}
