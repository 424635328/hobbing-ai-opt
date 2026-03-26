import { NextResponse } from "next/server";
import OpenAI from "openai";

import type {
  BuildModelRequest,
  BuildModelResponse,
} from "@/lib/hobbing-model";
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

请根据经典切削加工手册，给出适配当前工况的滚齿经验参数，并严格输出 JSON。
必须返回如下结构，不要包含 Markdown，不要包含解释：
{
  "bounds": { "lb":[80, 1, 400, 1.0], "ub":[100, 3, 1000, 4.0] },
  "constants": {
    "P_idle": 3.5,
    "M_cost": 2.0,
    "Tool_cost": 1500,
    "t_c_constant": 104.5,
    "tool_life_coeff": <40000 到 80000 之间的数字>,
    "power_coeff": <0.03 到 0.08 之间的数字>
  },
  "constraints": {
    "max_power": ${input.maxPower},
    "max_ra": 3.2
  }
}

注意：
1. tool_life_coeff 必须在 40000 到 80000 之间。
2. power_coeff 必须在 0.03 到 0.08 之间。
3. bounds 固定返回题目要求的上下界，不要自行扩展。
4. 仅输出合法 JSON。
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

  if (!material || !tool || !Number.isFinite(maxPower) || maxPower <= 0) {
    return null;
  }

  return { material, tool, maxPower };
}

export async function POST(req: Request) {
  let payload: BuildModelRequest | null = null;

  try {
    payload = parseRequestPayload(await req.json());
  } catch {
    payload = null;
  }

  if (!payload) {
    return NextResponse.json<BuildModelResponse>(
      {
        success: false,
        error: "请求体无效，请提供 material、tool 和合法的 maxPower。",
      },
      { status: 400 },
    );
  }

  const fallback = buildFallbackModelConfig(payload);
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json<BuildModelResponse>({
      success: true,
      config: fallback.config,
      source: "fallback",
      notes: [
        "未检测到 DEEPSEEK_API_KEY，已自动切换为本地规则库。",
        ...fallback.notes,
      ],
    });
  }

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com",
    });

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
    const config = validateDeepSeekConfig(parsed, payload.maxPower);

    if (!config) {
      throw new Error("DeepSeek 返回的模型结构不完整或系数超出允许范围。");
    }

    return NextResponse.json<BuildModelResponse>({
      success: true,
      config,
      source: "deepseek",
      notes: [
        "已通过 DeepSeek 生成当前工况模型。",
        `机床最大功率约束已锁定为 ${payload.maxPower.toFixed(1)} kW。`,
      ],
    });
  } catch (error) {
    return NextResponse.json<BuildModelResponse>({
      success: true,
      config: fallback.config,
      source: "fallback",
      notes: [
        `DeepSeek 调用失败，已自动切换为本地规则库。原因：${getErrorMessage(error)}`,
        ...fallback.notes,
      ],
    });
  }
}
