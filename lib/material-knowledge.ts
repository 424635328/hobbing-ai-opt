import {
  clamp,
  DEFAULT_BOUNDS,
  DEFAULT_CONSTANTS,
  DEFAULT_CONSTRAINTS,
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
  { toolLife: number; powerCoeff: number; label: string }
> = {
  carbon_steel: {
    toolLife: 64000,
    powerCoeff: 0.046,
    label: "普通碳钢/中碳钢",
  },
  alloy_steel: {
    toolLife: 60000,
    powerCoeff: 0.05,
    label: "合金结构钢",
  },
  carburizing_steel: {
    toolLife: 56000,
    powerCoeff: 0.054,
    label: "渗碳齿轮钢",
  },
  stainless_steel: {
    toolLife: 50000,
    powerCoeff: 0.061,
    label: "不锈钢",
  },
  cast_iron: {
    toolLife: 68000,
    powerCoeff: 0.043,
    label: "铸铁",
  },
  other: {
    toolLife: 58000,
    powerCoeff: 0.052,
    label: "未知材料",
  },
};

const TOOL_ADJUSTMENT: Record<
  ToolCategory,
  { toolLifeDelta: number; powerCoeffDelta: number; label: string }
> = {
  hss: {
    toolLifeDelta: 0,
    powerCoeffDelta: 0,
    label: "高速钢",
  },
  carbide: {
    toolLifeDelta: 12000,
    powerCoeffDelta: -0.006,
    label: "硬质合金",
  },
  coated_carbide: {
    toolLifeDelta: 16000,
    powerCoeffDelta: -0.008,
    label: "涂层硬质合金",
  },
  ceramic: {
    toolLifeDelta: 18000,
    powerCoeffDelta: -0.01,
    label: "陶瓷刀具",
  },
  other: {
    toolLifeDelta: 4000,
    powerCoeffDelta: -0.002,
    label: "未知刀具",
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
  if (token.includes("carbide") || tool.includes("硬质合金") || token.includes("yg")) {
    return "carbide";
  }
  if (token.includes("ceramic") || tool.includes("陶瓷")) {
    return "ceramic";
  }

  return "other";
}

export function buildFallbackModelConfig(input: BuildModelRequest): {
  config: ModelConfig;
  notes: string[];
} {
  const materialCategory = normalizeMaterialCategory(input.material);
  const toolCategory = normalizeToolCategory(input.tool);

  const materialBase = MATERIAL_BASE[materialCategory];
  const toolAdjustment = TOOL_ADJUSTMENT[toolCategory];
  const maxPower = Number.isFinite(input.maxPower)
    ? clamp(input.maxPower, 6, 30)
    : DEFAULT_CONSTRAINTS.max_power;

  const config: ModelConfig = {
    bounds: {
      lb: [...DEFAULT_BOUNDS.lb] as typeof DEFAULT_BOUNDS.lb,
      ub: [...DEFAULT_BOUNDS.ub] as typeof DEFAULT_BOUNDS.ub,
    },
    constants: {
      ...DEFAULT_CONSTANTS,
      tool_life_coeff: clamp(
        materialBase.toolLife + toolAdjustment.toolLifeDelta,
        40000,
        80000,
      ),
      power_coeff: clamp(
        materialBase.powerCoeff + toolAdjustment.powerCoeffDelta,
        0.03,
        0.08,
      ),
    },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      max_power: maxPower,
    },
  };

  return {
    config,
    notes: [
      `已启用本地工艺规则库兜底。`,
      `工件材料归类为：${materialBase.label}。`,
      `刀具材料归类为：${toolAdjustment.label}。`,
      `返回系数已按经验区间自动钳制，适合演示与联调。`,
    ],
  };
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function validateDeepSeekConfig(
  candidate: unknown,
  requestedMaxPower: number,
): ModelConfig | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const constants = record.constants as Record<string, unknown> | undefined;
  const constraints = record.constraints as Record<string, unknown> | undefined;

  if (!constants || !constraints) {
    return null;
  }

  const P_idle = asFiniteNumber(constants.P_idle);
  const M_cost = asFiniteNumber(constants.M_cost);
  const Tool_cost = asFiniteNumber(constants.Tool_cost);
  const t_c_constant = asFiniteNumber(constants.t_c_constant);
  const tool_life_coeff = asFiniteNumber(constants.tool_life_coeff);
  const power_coeff = asFiniteNumber(constants.power_coeff);
  const max_ra = asFiniteNumber(constraints.max_ra);

  if (
    P_idle === null ||
    M_cost === null ||
    Tool_cost === null ||
    t_c_constant === null ||
    tool_life_coeff === null ||
    power_coeff === null ||
    max_ra === null
  ) {
    return null;
  }

  if (
    tool_life_coeff < 40000 ||
    tool_life_coeff > 80000 ||
    power_coeff < 0.03 ||
    power_coeff > 0.08 ||
    max_ra <= 0
  ) {
    return null;
  }

  return {
    bounds: {
      lb: [...DEFAULT_BOUNDS.lb] as typeof DEFAULT_BOUNDS.lb,
      ub: [...DEFAULT_BOUNDS.ub] as typeof DEFAULT_BOUNDS.ub,
    },
    constants: {
      P_idle,
      M_cost,
      Tool_cost,
      t_c_constant,
      tool_life_coeff,
      power_coeff,
    },
    constraints: {
      max_power: clamp(requestedMaxPower, 6, 30),
      max_ra,
    },
  };
}
