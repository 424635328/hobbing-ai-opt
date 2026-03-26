import { NextResponse } from "next/server";

import { createDeepSeekClient, getDeepSeekApiKey } from "@/lib/deepseek";
import {
  buildFallbackMatlabConversion,
  buildMatlabConversionPrompt,
  validateMatlabConversionResponse,
} from "@/lib/matlab-algorithm-conversion";
import type {
  ConvertMatlabAlgorithmRequest,
  ConvertMatlabAlgorithmResponse,
} from "@/lib/optimization-types";

export const runtime = "nodejs";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "未知错误";
}

function parseRequestPayload(payload: unknown): ConvertMatlabAlgorithmRequest | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const fileName =
    typeof record.fileName === "string" ? record.fileName.trim() : "";
  const fileContent =
    typeof record.fileContent === "string" ? record.fileContent.trim() : "";

  if (!fileName || !fileContent) {
    return null;
  }

  return { fileName, fileContent };
}

export async function POST(req: Request) {
  let payload: ConvertMatlabAlgorithmRequest | null = null;

  try {
    payload = parseRequestPayload(await req.json());
  } catch {
    payload = null;
  }

  if (!payload) {
    return NextResponse.json<ConvertMatlabAlgorithmResponse>(
      {
        success: false,
        error: "请求体无效，请提供 fileName 和 fileContent。",
      },
      { status: 400 },
    );
  }

  const fallback = buildFallbackMatlabConversion(payload);
  const apiKey = getDeepSeekApiKey();

  if (!apiKey) {
    if (!fallback.success) {
      return NextResponse.json(fallback, { status: 500 });
    }

    return NextResponse.json<ConvertMatlabAlgorithmResponse>({
      ...fallback,
      notes: [
        "未检测到 DEEPSEEK_API_KEY，已使用本地规则识别 .m 算法文件。",
        ...fallback.notes,
      ],
    });
  }

  try {
    const client = createDeepSeekClient(apiKey);
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是 MATLAB 多目标优化算法识别专家。你必须且只能返回合法 JSON。",
        },
        {
          role: "user",
          content: buildMatlabConversionPrompt(payload),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("DeepSeek 未返回算法转换结果。");
    }

    const parsed = JSON.parse(content) as unknown;
    const validated = validateMatlabConversionResponse(parsed);

    if (!validated) {
      throw new Error("DeepSeek 返回的算法转换结构无效。");
    }

    return NextResponse.json<ConvertMatlabAlgorithmResponse>({
      success: true,
      algorithm: validated.algorithm,
      confidence: validated.confidence,
      source: "deepseek",
      normalizedFormat: {
        algorithm: validated.algorithm,
        supportedRuntime: "browser-worker",
        inputKind: "matlab-algorithm-file",
      },
      notes: validated.notes.length > 0
        ? validated.notes
        : [
            `DeepSeek 已将 ${payload.fileName} 识别为 ${validated.algorithm}。`,
            "结果已转换为系统支持的浏览器 Worker 算法标识。",
          ],
    });
  } catch (error) {
    if (!fallback.success) {
      return NextResponse.json<ConvertMatlabAlgorithmResponse>(
        {
          success: false,
          error: `算法转换失败：${getErrorMessage(error)}`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json<ConvertMatlabAlgorithmResponse>({
      ...fallback,
      notes: [
        `DeepSeek 转换失败，已切换到本地规则识别。原因：${getErrorMessage(error)}`,
        ...fallback.notes,
      ],
    });
  }
}
