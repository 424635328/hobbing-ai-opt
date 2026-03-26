export type BoundsTuple = [number, number, number, number];
export type DecisionVector = [number, number, number, number];
export type ObjectiveVector = [number, number, number];

export interface ModelConfig {
  bounds: { lb: BoundsTuple; ub: BoundsTuple };
  constants: {
    P_idle: number;
    M_cost: number;
    Tool_cost: number;
    t_c_constant: number;
    tool_life_coeff: number;
    power_coeff: number;
  };
  constraints: {
    max_power: number;
    max_ra: number;
  };
}

export interface BuildModelRequest {
  material: string;
  tool: string;
  maxPower: number;
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

export const DEFAULT_BOUNDS: ModelConfig["bounds"] = {
  lb: [80, 1, 400, 1],
  ub: [100, 3, 1000, 4],
};

export const DEFAULT_CONSTANTS: ModelConfig["constants"] = {
  P_idle: 3.5,
  M_cost: 2.0,
  Tool_cost: 1500,
  t_c_constant: 104.5,
  tool_life_coeff: 60000,
  power_coeff: 0.05,
};

export const DEFAULT_CONSTRAINTS: ModelConfig["constraints"] = {
  max_power: 12.0,
  max_ra: 3.2,
};

export const PENALTY_THRESHOLD = 5000;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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
  const [d_a0, z_0, n, f] = x as DecisionVector;
  const { constants } = config;

  const v_c = (Math.PI * d_a0 * n) / 1000;
  const T_tool =
    constants.tool_life_coeff /
    (Math.pow(v_c, 1.5) * Math.pow(f, 0.8));
  const P_cut =
    constants.power_coeff *
    Math.pow(v_c, 0.85) *
    Math.pow(f, 0.75) *
    Math.pow(d_a0, 0.2);
  const t_c = constants.t_c_constant / (z_0 * n * f);
  const T_total = t_c + 1.5;

  return { v_c, T_tool, P_cut, t_c, T_total };
}

export function hobbingObjective(
  x: number[],
  config: ModelConfig,
): ObjectiveVector {
  const constrained = applyEngineeringConstraints(
    x,
    config.bounds.lb,
    config.bounds.ub,
  );
  const { constants, constraints } = config;
  const { T_tool, P_cut, t_c, T_total } = computeProcessMetrics(
    constrained,
    config,
  );
  const [d_a0, z_0, n, f] = constrained;

  let energy = (constants.P_idle * T_total) / 60 + (P_cut * t_c) / 60;
  let cost = constants.M_cost * T_total + constants.Tool_cost * (t_c / T_tool);
  let roughness =
    25.5 * ((f * f) / d_a0) * Math.pow(z_0, 0.8) + 0.002 * n;

  let penalty = 0;
  const penaltyFactor = 1e5;

  if (P_cut > constraints.max_power) {
    penalty += penaltyFactor * (P_cut - constraints.max_power) ** 2;
  }
  if (T_tool < 10 * t_c) {
    penalty += penaltyFactor * (10 * t_c - T_tool) ** 2;
  }
  if (roughness > constraints.max_ra) {
    penalty += penaltyFactor * (roughness - constraints.max_ra) ** 2;
  }

  energy += penalty;
  cost += penalty;
  roughness += penalty;

  return [energy, cost, roughness];
}

export function serializeDecisionVector(vector: number[]): string {
  return vector.map((value) => roundTo(value, 2).toFixed(2)).join("|");
}

export function isPenaltySolution(objectives: number[]): boolean {
  return objectives[0] >= PENALTY_THRESHOLD;
}
