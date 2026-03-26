import { type NextRequest, NextResponse } from "next/server";
import supercomputerService from "@/lib/supercomputer-api-service";
import { isSupercomputerApiConfigured } from "@/lib/supercomputer-config";
import logger from "@/lib/supercomputer-logger";
import type { SupercomputerModelRequest } from "@/lib/supercomputer-api-types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    logger.info("Received request to /api/supercomputer/chat");

    if (!isSupercomputerApiConfigured()) {
      logger.error("Supercomputer API not configured");
      return NextResponse.json(
        {
          error: {
            code: "configuration_error",
            message: "Supercomputer API is not configured. Please set SUPERCOMPUTER_API_KEY in environment variables.",
          },
        },
        { status: 500 },
      );
    }

    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      logger.warn("Invalid content type", { contentType });
      return NextResponse.json(
        {
          error: {
            code: "invalid_content_type",
            message: "Content-Type must be application/json",
          },
        },
        { status: 415 },
      );
    }

    let requestBody: SupercomputerModelRequest;
    try {
      requestBody = await request.json();
    } catch (parseError) {
      logger.warn("Failed to parse request body", parseError);
      return NextResponse.json(
        {
          error: {
            code: "invalid_json",
            message: "Failed to parse request body as JSON",
          },
        },
        { status: 400 },
      );
    }

    logger.debug("Processing request", { model: requestBody.model });

    const result = await supercomputerService.callModelApi(requestBody);

    if (!result.success) {
      logger.error("API call failed", result.error);
      return NextResponse.json(result.error, { status: result.status });
    }

    logger.info("Request completed successfully", {
      model: requestBody.model,
      status: result.status,
    });

    const response = NextResponse.json(result.data, { status: result.status });

    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    return response;
  } catch (error) {
    logger.error("Unexpected error in API route", error);
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "An unexpected error occurred",
          details: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    logger.info("Health check request received");

    if (!isSupercomputerApiConfigured()) {
      return NextResponse.json(
        {
          healthy: false,
          message: "Supercomputer API not configured",
          configured: false,
        },
        { status: 503 },
      );
    }

    const healthResult = await supercomputerService.checkHealth();

    return NextResponse.json(
      {
        ...healthResult,
        configured: true,
        timestamp: new Date().toISOString(),
      },
      { status: healthResult.healthy ? 200 : 503 },
    );
  } catch (error) {
    logger.error("Health check failed", error);
    return NextResponse.json(
      {
        healthy: false,
        message: "Health check failed",
        configured: isSupercomputerApiConfigured(),
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }
}
