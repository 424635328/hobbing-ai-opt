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
  const removedVolume =
    Math.PI *
    pitchDiameter *
    gear.faceWidth *
    wholeDepth *
    constants.material_removal_factor;
  const materialRemovalRate = removedVolume / Math.max(t_c, 1e-6);
  const P_cut =
    (constants.specific_cutting_force * materialRemovalRate) /
    (60 * 1e6 * constants.machine_efficiency);

  const feedRatio = f / Math.max(gear.module, 0.5);
  const hardnessFactor = 1 + Math.max(0, gear.hardness - 220) / 500;
  const wearLoad = v_c * (0.82 + 0.65 * feedRatio) * hardnessFactor;
  const T_tool = Math.max(
    1,
    Math.pow(
      constants.tool_life_constant / Math.max(wearLoad, 1e-6),
      1 / constants.tool_life_exponent,
    ),
  );

  const toolWearRatio = t_c / T_tool;
  const toolChangeAllocation = cost.toolChangeTime * toolWearRatio;
  const T_total = t_c + constants.auxiliary_time + toolChangeAllocation;
  const roughness =
    deriveAccuracyRaBase(gear.accuracyGrade) +
    constants.roughness_feed_coeff *
      Math.pow(feedRatio, 1.35) /
      Math.pow(z_0, 0.28) +
    constants.roughness_speed_coeff *
      Math.max(0, v_c - constraints.max_cutting_speed * 0.9) +
    0.06 * Math.max(0, gear.hardness - 280) / 10;

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
    t_c,
    T_total,
    toolWearRatio,
    toolChangeAllocation,
    roughness,
  };
}

export function hobbingObjective(
  x: number[],
  config: ModelConfig,
): ObjectiveVector {
  const { constants, constraints } = config;
  const { cost } = config.input;
  const { T_tool, P_cut, t_c, T_total, roughness, v_c, toolWearRatio } =
    computeProcessMetrics(x, config);

  let energy = (constants.P_idle * T_total + P_cut * t_c) / 60;
  let costValue =
    cost.machineRate * T_total +
    cost.toolPrice * toolWearRatio +
    cost.electricityRate * energy;

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

  energy += penalty;
  costValue += penalty;

  return [energy, costValue, roughness + penalty];
}

export function serializeDecisionVector(vector: number[]): string {
  return vector.map((value) => roundTo(value, 2).toFixed(2)).join("|");
}

export function isPenaltySolution(objectives: number[]): boolean {
  return objectives[0] >= PENALTY_THRESHOLD;
}
