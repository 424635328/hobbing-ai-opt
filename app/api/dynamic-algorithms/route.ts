import { NextResponse } from "next/server";
import { getDynamicAlgorithmManager } from "@/lib/dynamic-algorithm-manager";
import { generateStandardInputSpec, generateStandardOutputSpec } from "@/lib/algorithm-standardizer";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { metadata, code } = body;

    if (!code || code.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Algorithm code is required" },
        { status: 400 },
      );
    }

    const fullMetadata = {
      ...metadata,
      inputSpec: metadata.inputSpec || generateStandardInputSpec(),
      outputSpec: metadata.outputSpec || generateStandardOutputSpec(),
    };

    const manager = getDynamicAlgorithmManager();
    const result = await manager.registerAlgorithm(fullMetadata, code);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      metadata: result.metadata,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to register algorithm",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const source = searchParams.get("source") || undefined;
    const category = searchParams.get("category") || undefined;
    const tag = searchParams.get("tag") || undefined;

    const manager = getDynamicAlgorithmManager();
    const algorithms = manager.listAlgorithms({
      status,
      source,
      category,
      tag,
    });

    return NextResponse.json({
      success: true,
      algorithms,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list algorithms",
      },
      { status: 500 },
    );
  }
}
