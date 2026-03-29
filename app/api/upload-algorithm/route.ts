import { processUploadedAlgorithm } from "@/lib/algorithm-processor";
import type { UploadAlgorithmRequest, UploadAlgorithmResponse } from "@/lib/algorithm-processing-types";

const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const ALLOWED_FILE_EXTENSIONS = [".m"];

function validateRequest(body: unknown): { valid: true; data: UploadAlgorithmRequest } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "请求体必须是有效的 JSON 对象" };
  }

  const request = body as Record<string, unknown>;

  if (typeof request.fileName !== "string" || request.fileName.trim().length === 0) {
    return { valid: false, error: "请提供有效的文件名" };
  }

  const fileName = request.fileName.toLowerCase();
  const hasValidExtension = ALLOWED_FILE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
  if (!hasValidExtension) {
    return { valid: false, error: `仅支持以下文件格式：${ALLOWED_FILE_EXTENSIONS.join(", ")}` };
  }

  if (typeof request.fileContent !== "string") {
    return { valid: false, error: "文件内容必须是字符串格式" };
  }

  if (request.fileContent.trim().length === 0) {
    return { valid: false, error: "文件内容不能为空" };
  }

  if (request.fileContent.length > MAX_FILE_SIZE) {
    return { valid: false, error: `文件大小不能超过 ${(MAX_FILE_SIZE / 1024).toFixed(0)} KB` };
  }

  return {
    valid: true,
    data: {
      fileName: request.fileName,
      fileContent: request.fileContent,
      suggestedName: typeof request.suggestedName === "string" ? request.suggestedName : undefined,
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = validateRequest(body);

    if (!validation.valid) {
      return Response.json(
        {
          success: false,
          error: validation.error,
          warnings: ["请检查您的输入并重试"],
        } as UploadAlgorithmResponse,
        { status: 400 },
      );
    }

    const result = await processUploadedAlgorithm(validation.data);

    if (!result.success) {
      return Response.json(result, { status: 400 });
    }

    return Response.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (error) {
    console.error("Upload algorithm error:", error);
    const errorMessage = error instanceof Error ? error.message : "处理请求时发生意外错误";
    
    return Response.json(
      {
        success: false,
        error: errorMessage,
        warnings: ["如果问题持续存在，请联系技术支持"],
      } as UploadAlgorithmResponse,
      { 
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  }
}
