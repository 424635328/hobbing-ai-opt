import {
  clamp,
  DEFAULT_CONSTRAINTS,
  DEFAULT_CONSTANTS,
  deriveAccuracyRaLimit,
  sanitizeAccuracyGrade,
  type BuildModelRequest,
  type ModelConfig,
} from "@/lib/hobbing-model";

type MaterialCategory =
  | "carbon_steel"
  | "alloy_steel"
  | "carburizing_steel"
  | "stainless_steel"
  | "cast_iron"
  | "other";

type ToolCategory =
  | "hss"
  | "carbide"
  | "coated_carbide"
  | "ceramic"
  | "other";

const MATERIAL_BASE: Record<
  MaterialCategory,
  {
    label: string;
    toolLifeConstant: number;
    specificCuttingForce: number;
    maxCuttingSpeed: number;
  }
> = {
  carbon_steel: {
    label: "普通碳钢/中碳钢",
    toolLifeConstant: 190,
    specificCuttingForce: 2400,
    maxCuttingSpeed: 62,
  },
  alloy_steel: {
    label: "合金结构钢",
    toolLifeConstant: 175,
    specificCuttingForce: 2700,
    maxCuttingSpeed: 55,
  },
  carburizing_steel: {
    label: "渗碳齿轮钢",
    toolLifeConstant: 165,
    specificCuttingForce: 2900,
    maxCuttingSpeed: 50,
  },
  stainless_steel: {
    label: "不锈钢",
    toolLifeConstant: 150,
    specificCuttingForce: 3200,
    maxCuttingSpeed: 40,
  },
  cast_iron: {
    label: "铸铁",
    toolLifeConstant: 205,
    specificCuttingForce: 2150,
    maxCuttingSpeed: 70,
  },
  other: {
    label: "未知材料",
    toolLifeConstant: 175,
    specificCuttingForce: 2800,
    maxCuttingSpeed: 52,
  },
};

const TOOL_ADJUSTMENT: Record<
  ToolCategory,
  {
    label: string;
    toolLifeDelta: number;
    specificCuttingForceDelta: number;
    maxCuttingSpeedDelta: number;
    toolLifeExponent: number;
    roughnessFeedCoeff: number;
    roughnessSpeedCoeff: number;
  }
> = {
  hss: {
    label: "高速钢",
    toolLifeDelta: 0,
    specificCuttingForceDelta: 0,
    maxCuttingSpeedDelta: 0,
    toolLifeExponent: 0.22,
    roughnessFeedCoeff: 7.8,
    roughnessSpeedCoeff: 0.03,
  },
  carbide: {
    label: "硬质合金",
    toolLifeDelta: 45,
    specificCuttingForceDelta: -180,
    maxCuttingSpeedDelta: 42,
    toolLifeExponent: 0.25,
    roughnessFeedCoeff: 6.8,
    roughnessSpeedCoeff: 0.025,
  },
  coated_carbide: {
    label: "涂层硬质合金",
    toolLifeDelta: 60,
    specificCuttingForceDelta: -220,
    maxCuttingSpeedDelta: 55,
    toolLifeExponent: 0.26,
    roughnessFeedCoeff: 6.3,
    roughnessSpeedCoeff: 0.022,
  },
  ceramic: {
    label: "陶瓷刀具",
    toolLifeDelta: 70,
    specificCuttingForceDelta: -260,
    maxCuttingSpeedDelta: 75,
    toolLifeExponent: 0.28,
    roughnessFeedCoeff: 5.8,
    roughnessSpeedCoeff: 0.02,
  },
  other: {
    label: "未知刀具",
    toolLifeDelta: 10,
    specificCuttingForceDelta: -80,
    maxCuttingSpeedDelta: 12,
    toolLifeExponent: 0.23,
    roughnessFeedCoeff: 7.4,
    roughnessSpeedCoeff: 0.028,
  },
};

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[-_]/g, "");
}

export function normalizeMaterialCategory(material: string): MaterialCategory {
  const token = normalizeToken(material);

  if (
    token.includes("20crmnti") ||
    token.includes("18crnimo7") ||
    material.includes("渗碳")
  ) {
    return "carburizing_steel";
  }

  if (
    token.includes("40cr") ||
    token.includes("42crmo") ||
    token.includes("4140") ||
    material.includes("合金钢")
  ) {
    return "alloy_steel";
  }

  if (
    token.includes("45#") ||
    token.includes("45钢") ||
    token.includes("1045") ||
    token.includes("q235") ||
    material.includes("碳钢")
  ) {
    return "carbon_steel";
  }

  if (
    token.includes("304") ||
    token.includes("316") ||
    material.includes("不锈")
  ) {
    return "stainless_steel";
  }

  if (
    token.includes("ht250") ||
    token.includes("qt500") ||
    material.includes("铸铁") ||
    material.includes("球墨")
  ) {
    return "cast_iron";
  }

  return "other";
}

export function normalizeToolCategory(tool: string): ToolCategory {
  const token = normalizeToken(tool);

  if (
    token.includes("w18cr4v") ||
    token.includes("m2") ||
    token.includes("hss") ||
    tool.includes("高速钢")
  ) {
    return "hss";
  }

  if (
    token.includes("coatedcarbide") ||
    tool.includes("涂层硬质合金") ||
    token.includes("tialn")
  ) {
    return "coated_carbide";
  }

  if (
    token.includes("carbide") ||
    tool.includes("硬质合金") ||
    token.includes("yg")
  ) {
    return "carbide";
  }

  if (token.includes("ceramic") || tool.includes("陶瓷")) {
    return "ceramic";
  }

  return "other";
}

function buildBounds(
  input: BuildModelRequest,
  maxCuttingSpeed: number,
  toolCategory: ToolCategory,
): ModelConfig["bounds"] {
  const diameterLb = clamp(50 + input.module * 4, 63, 90);
  const diameterUb = clamp(88 + input.module * 8, 100, 160);
  const vcMin = Math.max(18, maxCuttingSpeed * 0.45);
  const nLb = Math.max(
    80,
    Math.floor((vcMin * 1000) / (Math.PI * diameterUb)),
  );
  const nUb = Math.min(
    950,
    Math.ceil((maxCuttingSpeed * 1000) / (Math.PI * diameterLb)),
  );

  const toolFeedFactor =
    toolCategory === "hss"
      ? 1
      : toolCategory === "carbide"
        ? 1.15
        : toolCategory === "coated_carbide"
          ? 1.2
          : toolCategory === "ceramic"
            ? 1.25
            : 1.05;

  const feedLb = clamp(input.module * 0.12, 0.18, 0.65);
  const feedUb = clamp(input.module * 0.32 * toolFeedFactor, 0.45, 1.6);

  return {
    lb: [
      Math.round(diameterLb),
      1,
      roundToSafe(nLb, 2),
      roundToSafe(feedLb, 2),
    ],
    ub: [
      Math.round(diameterUb),
      3,
      roundToSafe(Math.max(nUb, nLb + 40), 2),
      roundToSafe(Math.max(feedUb, feedLb + 0.1), 2),
    ],
  };
}

function roundToSafe(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sanitizeRequestInput(input: BuildModelRequest): BuildModelRequest {
  return {
    ...input,
    maxPower: clamp(input.maxPower, 6, 60),
    module: clamp(input.module, 1, 12),
    teeth: Math.round(clamp(input.teeth, 8, 300)),
    faceWidth: clamp(input.faceWidth, 8, 250),
    accuracyGrade: sanitizeAccuracyGrade(input.accuracyGrade),
    hardness: clamp(input.hardness, 160, 420),
    machineRate: clamp(input.machineRate, 0.5, 20),
    toolPrice: clamp(input.toolPrice, 200, 50000),
    electricityRate: clamp(input.electricityRate, 0.2, 5),
    toolChangeTime: clamp(input.toolChangeTime, 1, 60),
    toolSharpeningCost: clamp(input.toolSharpeningCost || 80, 20, 500),
    toolSharpeningLife: clamp(input.toolSharpeningLife || 50, 10, 200),
  };
}

export function buildFallbackModelConfig(input: BuildModelRequest): {
  config: ModelConfig;
  notes: string[];
} {
  const sanitized = sanitizeRequestInput(input);
  const materialCategory = normalizeMaterialCategory(sanitized.material);
  const toolCategory = normalizeToolCategory(sanitized.tool);
  const materialBase = MATERIAL_BASE[materialCategory];
  const toolAdjustment = TOOL_ADJUSTMENT[toolCategory];
  const hardnessPenalty = Math.max(0, sanitized.hardness - 220);

  const toolLifeConstant = clamp(
    materialBase.toolLifeConstant +
      toolAdjustment.toolLifeDelta -
      hardnessPenalty * 0.35,
    100,
    320,
  );
  const specificCuttingForce = clamp(
    materialBase.specificCuttingForce +
      toolAdjustment.specificCuttingForceDelta +
      hardnessPenalty * 4,
    1600,
    4200,
  );
  const maxCuttingSpeed = clamp(
    materialBase.maxCuttingSpeed +
      toolAdjustment.maxCuttingSpeedDelta -
      hardnessPenalty * 0.12,
    25,
    220,
  );
  const maxRa = deriveAccuracyRaLimit(sanitized.accuracyGrade);

  return {
    config: {
      input: {
        material: sanitized.material,
        tool: sanitized.tool,
        gear: {
          module: sanitized.module,
          teeth: sanitized.teeth,
          faceWidth: sanitized.faceWidth,
          accuracyGrade: sanitized.accuracyGrade,
          hardness: sanitized.hardness,
        },
        cost: {
          machineRate: sanitized.machineRate,
          toolPrice: sanitized.toolPrice,
          electricityRate: sanitized.electricityRate,
          toolChangeTime: sanitized.toolChangeTime,
          toolSharpeningCost: sanitized.toolSharpeningCost,
          toolSharpeningLife: sanitized.toolSharpeningLife,
        },
      },
      bounds: buildBounds(sanitized, maxCuttingSpeed, toolCategory),
      constants: {
        ...DEFAULT_CONSTANTS,
        tool_life_constant: toolLifeConstant,
        tool_life_exponent: clamp(
          toolAdjustment.toolLifeExponent -
            Math.max(0, sanitized.hardness - 280) * 0.0002,
          0.12,
          0.35,
        ),
        specific_cutting_force: specificCuttingForce,
        roughness_feed_coeff: clamp(
          toolAdjustment.roughnessFeedCoeff +
            (sanitized.accuracyGrade <= 7 ? 0.4 : 0),
          4,
          12,
        ),
        roughness_speed_coeff: clamp(
          toolAdjustment.roughnessSpeedCoeff,
          0.01,
          0.08,
        ),
      },
      constraints: {
        max_power: sanitized.maxPower,
        max_ra: maxRa,
        max_cutting_speed: maxCuttingSpeed,
        min_tool_life_ratio: DEFAULT_CONSTRAINTS.min_tool_life_ratio,
      },
    },
    notes: [
      "已启用工程化规则库建模，模型包含齿轮几何参数、硬度和成本设定。",
      `工件材料归类为：${materialBase.label}。`,
      `刀具材料归类为：${toolAdjustment.label}。`,
      `已按精度等级 ${sanitized.accuracyGrade} 设定粗糙度约束 Ra <= ${maxRa.toFixed(1)} μm。`,
      `推荐切削速度上限已约束为 ${maxCuttingSpeed.toFixed(1)} m/min。`,
    ],
  };
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function validateDeepSeekConfig(
  candidate: unknown,
  input: BuildModelRequest,
): ModelConfig | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const sanitized = sanitizeRequestInput(input);
  const record = candidate as Record<string, unknown>;
  const constants = record.constants as Record<string, unknown> | undefined;
  const constraints = record.constraints as Record<string, unknown> | undefined;

  if (!constants || !constraints) {
    return null;
  }

  const P_idle = asFiniteNumber(constants.P_idle);
  const machine_efficiency = asFiniteNumber(constants.machine_efficiency);
  const auxiliary_time = asFiniteNumber(constants.auxiliary_time);
  const travel_clearance_coeff = asFiniteNumber(constants.travel_clearance_coeff);
  const material_removal_factor = asFiniteNumber(constants.material_removal_factor);
  const tool_life_constant = asFiniteNumber(constants.tool_life_constant);
  const tool_life_exponent = asFiniteNumber(constants.tool_life_exponent);
  const specific_cutting_force = asFiniteNumber(constants.specific_cutting_force);
  const roughness_feed_coeff = asFiniteNumber(constants.roughness_feed_coeff);
  const roughness_speed_coeff = asFiniteNumber(constants.roughness_speed_coeff);
  const max_cutting_speed = asFiniteNumber(constraints.max_cutting_speed);
  const min_tool_life_ratio = asFiniteNumber(constraints.min_tool_life_ratio);

  if (
    P_idle === null ||
    machine_efficiency === null ||
    auxiliary_time === null ||
    travel_clearance_coeff === null ||
    material_removal_factor === null ||
    tool_life_constant === null ||
    tool_life_exponent === null ||
    specific_cutting_force === null ||
    roughness_feed_coeff === null ||
    roughness_speed_coeff === null ||
    max_cutting_speed === null ||
    min_tool_life_ratio === null
  ) {
    return null;
  }

  if (
    P_idle < 1 ||
    P_idle > 8 ||
    machine_efficiency < 0.65 ||
    machine_efficiency > 0.95 ||
    auxiliary_time < 0.5 ||
    auxiliary_time > 5 ||
    travel_clearance_coeff < 1.5 ||
    travel_clearance_coeff > 4.5 ||
    material_removal_factor < 0.2 ||
    material_removal_factor > 0.65 ||
    tool_life_constant < 100 ||
    tool_life_constant > 320 ||
    tool_life_exponent < 0.12 ||
    tool_life_exponent > 0.35 ||
    specific_cutting_force < 1600 ||
    specific_cutting_force > 4200 ||
    roughness_feed_coeff < 4 ||
    roughness_feed_coeff > 12 ||
    roughness_speed_coeff < 0.01 ||
    roughness_speed_coeff > 0.08 ||
    max_cutting_speed < 25 ||
    max_cutting_speed > 220 ||
    min_tool_life_ratio < 5 ||
    min_tool_life_ratio > 30
  ) {
    return null;
  }

  const toolCategory = normalizeToolCategory(sanitized.tool);

  return {
    input: {
      material: sanitized.material,
      tool: sanitized.tool,
      gear: {
        module: sanitized.module,
        teeth: sanitized.teeth,
        faceWidth: sanitized.faceWidth,
        accuracyGrade: sanitized.accuracyGrade,
        hardness: sanitized.hardness,
      },
      cost: {
        machineRate: sanitized.machineRate,
        toolPrice: sanitized.toolPrice,
        electricityRate: sanitized.electricityRate,
        toolChangeTime: sanitized.toolChangeTime,
        toolSharpeningCost: sanitized.toolSharpeningCost,
        toolSharpeningLife: sanitized.toolSharpeningLife,
      },
    },
    bounds: buildBounds(sanitized, max_cutting_speed, toolCategory),
    constants: {
      P_idle,
      machine_efficiency,
      auxiliary_time,
      travel_clearance_coeff,
      material_removal_factor,
      tool_life_constant,
      tool_life_exponent,
      specific_cutting_force,
      roughness_feed_coeff,
      roughness_speed_coeff,
    },
    constraints: {
      max_power: sanitized.maxPower,
      max_ra: deriveAccuracyRaLimit(sanitized.accuracyGrade),
      max_cutting_speed,
      min_tool_life_ratio,
    },
  };
}
