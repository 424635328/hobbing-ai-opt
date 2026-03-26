import { NextResponse } from "next/server";

import { getDeepSeekApiKey, testDeepSeekConnection } from "@/lib/deepseek";

export const runtime = "nodejs";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "未知错误";
}

export async function GET() {
  const apiKey = getDeepSeekApiKey();

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      status: "missing_key",
      provider: "deepseek",
      message: "未检测到 DEEPSEEK_API_KEY。",
    });
  }

  try {
    const content = await testDeepSeekConnection(apiKey);

    return NextResponse.json({
      success: true,
      status: "connected",
      provider: "deepseek",
      message: content === "OK" ? "DeepSeek 连接正常。" : "DeepSeek 已响应。",
      responsePreview: content,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      status: "request_failed",
      provider: "deepseek",
      message: getErrorMessage(error),
    });
  }
}
