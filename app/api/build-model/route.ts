import { NextResponse } from "next/server";

import type {
  BuildModelRequest,
  BuildModelResponse,
} from "@/lib/hobbing-model";
import { createDeepSeekClient, getDeepSeekApiKey } from "@/lib/deepseek";
import {
  buildFallbackModelConfig,
  validateDeepSeekConfig,
} from "@/lib/material-knowledge";

export const runtime = "nodejs";

function buildPrompt(input: BuildModelRequest): string {
  return `
用户当前的滚齿加工条件如下：
- 工件材料: ${input.material}
- 刀具材料: ${input.tool}
- 机床最大允许功率: ${input.maxPower} kW
- 齿轮模数: ${input.module} mm
- 齿轮齿数: ${input.teeth}
- 齿宽: ${input.faceWidth} mm
- 齿轮精度等级: ${input.accuracyGrade}
- 工件硬度: ${input.hardness} HB
- 机床工时费: ${input.machineRate} 元/min
- 滚刀采购单价: ${input.toolPrice} 元
- 滚刀刃磨费用: ${input.toolSharpeningCost} 元/次
- 滚刀刃磨寿命: ${input.toolSharpeningLife} 件/次
- 电价: ${input.electricityRate} 元/kWh
- 换刀辅助时间: ${input.toolChangeTime} min

请根据滚齿加工工程经验，给出适配当前工况的滚齿建模参数，并严格输出 JSON。
必须返回如下结构，不要包含 Markdown，不要包含解释：
{
  "constants": {
    "P_idle": <1 到 8 之间>,
    "machine_efficiency": <0.65 到 0.95 之间>,
    "auxiliary_time": <0.5 到 5 之间>,
    "travel_clearance_coeff": <1.5 到 4.5 之间>,
    "material_removal_factor": <0.2 到 0.65 之间>,
    "tool_life_constant": <100 到 300 之间>,
    "tool_life_exponent": <0.12 到 0.35 之间>,
    "specific_cutting_force": <2000 到 4000 之间的数字>,
    "roughness_feed_coeff": <4 到 12 之间>,
    "roughness_speed_coeff": <0.01 到 0.08 之间>
  },
  "constraints": {
    "max_cutting_speed": <30 到 80 之间的数字>,
    "min_tool_life_ratio": <5 到 30 之间的数字>
  }
}

注意：
1. tool_life_constant 必须使用泰勒寿命常数 C 的数量级，范围 100-300，不要返回几万。
2. specific_cutting_force 必须使用钢件滚齿常见的单位切削力数量级 2000-4000 N/mm²。
3. max_cutting_speed 对于 W18Cr4V 高速钢加工 40Cr 钢，应在 30-80 m/min 范围。
4. 你不需要返回 bounds，系统会根据刀具材料、模数和推荐切削速度自动生成决策变量边界。
5. 仅输出合法 JSON。
`.trim();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "未知错误";
}

function parseRequestPayload(payload: unknown): BuildModelRequest | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const material =
    typeof record.material === "string" ? record.material.trim() : "";
  const tool = typeof record.tool === "string" ? record.tool.trim() : "";
  const maxPower =
    typeof record.maxPower === "number" ? record.maxPower : Number.NaN;
  const moduleValue =
    typeof record.module === "number" ? record.module : Number.NaN;
  const teeth = typeof record.teeth === "number" ? record.teeth : Number.NaN;
  const faceWidth =
    typeof record.faceWidth === "number" ? record.faceWidth : Number.NaN;
  const accuracyGrade =
    typeof record.accuracyGrade === "number"
      ? record.accuracyGrade
      : Number.NaN;
  const hardness =
    typeof record.hardness === "number" ? record.hardness : Number.NaN;
  const machineRate =
    typeof record.machineRate === "number" ? record.machineRate : Number.NaN;
  const toolPrice =
    typeof record.toolPrice === "number" ? record.toolPrice : Number.NaN;
  const electricityRate =
    typeof record.electricityRate === "number"
      ? record.electricityRate
      : Number.NaN;
  const toolChangeTime =
    typeof record.toolChangeTime === "number"
      ? record.toolChangeTime
      : Number.NaN;
  const toolSharpeningCost =
    typeof record.toolSharpeningCost === "number"
      ? record.toolSharpeningCost
      : 80;
  const toolSharpeningLife =
    typeof record.toolSharpeningLife === "number"
      ? record.toolSharpeningLife
      : 50;
  const aiModel =
    typeof record.aiModel === "string"
      ? (record.aiModel as "deepseek" | "local_rules")
      : undefined;

  if (
    !material ||
    !tool ||
    !Number.isFinite(maxPower) ||
    maxPower <= 0 ||
    !Number.isFinite(moduleValue) ||
    moduleValue <= 0 ||
    !Number.isFinite(teeth) ||
    teeth <= 0 ||
    !Number.isFinite(faceWidth) ||
    faceWidth <= 0 ||
    !Number.isFinite(accuracyGrade) ||
    !Number.isFinite(hardness) ||
    hardness <= 0 ||
    !Number.isFinite(machineRate) ||
    machineRate <= 0 ||
    !Number.isFinite(toolPrice) ||
    toolPrice <= 0 ||
    !Number.isFinite(electricityRate) ||
    electricityRate <= 0 ||
    !Number.isFinite(toolChangeTime) ||
    toolChangeTime <= 0
  ) {
    return null;
  }

  return {
    material,
    tool,
    maxPower,
    module: moduleValue,
    teeth,
    faceWidth,
    accuracyGrade,
    hardness,
    machineRate,
    toolPrice,
    electricityRate,
    toolChangeTime,
    toolSharpeningCost,
    toolSharpeningLife,
    aiModel,
  };
}

export async function POST(req: Request) {
  let payload: BuildModelRequest | null = null;

  try {
    payload = parseRequestPayload(await req.json());
  } catch (error) {
    console.error("Failed to parse request payload:", error);
    payload = null;
  }

  if (!payload) {
    return NextResponse.json<BuildModelResponse>(
      {
        success: false,
        error:
          "请求体无效，请提供材料、机床功率、齿轮参数、硬度与成本基础参数。",
      },
      { 
        status: 400,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  }

  const fallback = buildFallbackModelConfig(payload);
  const apiKey = getDeepSeekApiKey();
  const requestedModel = payload.aiModel || "deepseek";

  if (requestedModel === "local_rules") {
    return NextResponse.json<BuildModelResponse>(
      {
        success: true,
        config: fallback.config,
        source: "fallback",
        notes: [
          "已使用本地规则库生成当前工况模型。",
          ...fallback.notes,
        ],
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  }

  if (!apiKey) {
    return NextResponse.json<BuildModelResponse>(
      {
        success: true,
        config: fallback.config,
        source: "fallback",
        notes: [
          "未检测到 DEEPSEEK_API_KEY，已自动切换为本地规则库。",
          ...fallback.notes,
        ],
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
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
            "你是机械加工工艺专家。你必须且只能返回合法 JSON，不要输出 Markdown、注释或解释。",
        },
        {
          role: "user",
          content: buildPrompt(payload),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("DeepSeek 未返回有效内容。");
    }

    const parsed = JSON.parse(content) as unknown;
    const config = validateDeepSeekConfig(parsed, payload);

    if (!config) {
      throw new Error("DeepSeek 返回的模型结构不完整或系数超出允许范围。");
    }

    return NextResponse.json<BuildModelResponse>(
      {
        success: true,
        config,
        source: "deepseek",
        notes: [
          "已通过 DeepSeek 生成当前工况模型。",
          `机床最大功率约束已锁定为 ${payload.maxPower.toFixed(1)} kW。`,
          `粗糙度约束将按精度等级 ${payload.accuracyGrade} 自动绑定。`,
        ],
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  } catch (error) {
    console.error("DeepSeek API error:", error);
    return NextResponse.json<BuildModelResponse>(
      {
        success: true,
        config: fallback.config,
        source: "fallback",
        notes: [
          `DeepSeek 调用失败，已自动切换为本地规则库。原因：${getErrorMessage(error)}`,
          ...fallback.notes,
        ],
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  }
}
