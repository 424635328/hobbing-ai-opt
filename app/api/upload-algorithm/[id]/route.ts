import { getAlgorithm, deleteAlgorithm } from "@/lib/algorithm-processor";
import type { ProcessedAlgorithm } from "@/lib/algorithm-processing-types";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const algorithm = await getAlgorithm(params.id);
    if (algorithm) {
      return Response.json(algorithm as ProcessedAlgorithm, { status: 200 });
    }
    return Response.json({ error: "Algorithm not found" }, { status: 404 });
  } catch (error) {
    console.error("Get algorithm error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const deleted = await deleteAlgorithm(params.id);
    if (deleted) {
      return Response.json({ success: true }, { status: 200 });
    }
    return Response.json({ error: "Algorithm not found" }, { status: 404 });
  } catch (error) {
    console.error("Delete algorithm error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
