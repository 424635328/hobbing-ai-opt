import { listAlgorithms } from "@/lib/algorithm-processor";
import type { AlgorithmMetadata } from "@/lib/algorithm-processing-types";

export async function GET() {
  try {
    const algorithms = await listAlgorithms();
    return Response.json(algorithms as AlgorithmMetadata[], { status: 200 });
  } catch (error) {
    console.error("List algorithms error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
