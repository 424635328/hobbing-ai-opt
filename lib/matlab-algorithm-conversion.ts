import {
  SUPPORTED_ALGORITHMS,
  type ConvertMatlabAlgorithmRequest,
  type ConvertMatlabAlgorithmResponse,
  type MatlabAlgorithmConfidence,
  type OptimizationAlgorithm,
} from "@/lib/optimization-types";

type AlgorithmFeature = {
  token: string;
  weight: number;
};

const FEATURE_LIBRARY: Record<OptimizationAlgorithm, AlgorithmFeature[]> = {
  mofata: [
    { token: "mofata", weight: 8 },
    { token: "levy", weight: 5 },
    { token: "cumtrapz", weight: 5 },
    { token: "surrogate_fit", weight: 5 },
    { token: "elite_position", weight: 4 },
    { token: "bestinte", weight: 3 },
    { token: "worstinte", weight: 3 },
    { token: "arf", weight: 2 },
    { token: "populationnew", weight: 2 },
  ],
  mogwo: [
    { token: "mogwo", weight: 8 },
    { token: "greywolves", weight: 5 },
    { token: "alpha_pos", weight: 5 },
    { token: "beta_pos", weight: 5 },
    { token: "delta_pos", weight: 5 },
    { token: "d_alpha", weight: 3 },
    { token: "d_beta", weight: 3 },
    { token: "d_delta", weight: 3 },
  ],
  mopso: [
    { token: "mopso", weight: 8 },
    { token: "particles_vel", weight: 5 },
    { token: "particles_pos", weight: 4 },
    { token: "pbest", weight: 5 },
    { token: "gbest", weight: 5 },
    { token: "vmax", weight: 4 },
    { token: "vmin", weight: 4 },
    { token: "c1", weight: 1 },
    { token: "c2", weight: 1 },
  ],
};

const FILE_NAME_HINTS: Record<OptimizationAlgorithm, string[]> = {
  mofata: ["mofata", "fata"],
  mogwo: ["mogwo", "gwo", "greywolf", "graywolf"],
  mopso: ["mopso", "pso", "particle"],
};

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");
}

function clipExcerpt(value: string): string {
  const maxChars = 20000;

  if (value.length <= maxChars) {
    return value;
  }

  const head = value.slice(0, 14000);
  const tail = value.slice(-6000);
  return `${head}\n\n% ... file truncated for analysis ...\n\n${tail}`;
}

function buildNormalizedFormat(algorithm: OptimizationAlgorithm) {
  return {
    algorithm,
    supportedRuntime: "browser-worker" as const,
    inputKind: "matlab-algorithm-file" as const,
  };
}

function inferConfidence(bestScore: number, secondScore: number): MatlabAlgorithmConfidence {
  if (bestScore >= 12 && bestScore - secondScore >= 4) {
    return "high";
  }

  if (bestScore >= 6 && bestScore - secondScore >= 2) {
    return "medium";
  }

  return "low";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function scoreAlgorithm(
  algorithm: OptimizationAlgorithm,
  fileName: string,
  normalizedContent: string,
) {
  const hits: string[] = [];
  let score = 0;
  const normalizedFileName = normalizeToken(fileName);

  for (const hint of FILE_NAME_HINTS[algorithm]) {
    if (normalizedFileName.includes(hint)) {
      score += 6;
      hits.push(`文件名命中 ${hint}`);
    }
  }

  for (const feature of FEATURE_LIBRARY[algorithm]) {
    if (normalizedContent.includes(feature.token)) {
      score += feature.weight;
      hits.push(feature.token);
    }
  }

  return { algorithm, score, hits: uniqueStrings(hits) };
}

export function buildFallbackMatlabConversion(
  input: ConvertMatlabAlgorithmRequest,
): ConvertMatlabAlgorithmResponse {
  const normalizedContent = normalizeToken(input.fileContent);
  const scored = (
    Object.keys(SUPPORTED_ALGORITHMS) as OptimizationAlgorithm[]
  ).map((algorithm) =>
    scoreAlgorithm(algorithm, input.fileName, normalizedContent),
  );

  scored.sort((left, right) => right.score - left.score);

  const best = scored[0];
  const second = scored[1];
  const confidence = inferConfidence(best?.score ?? 0, second?.score ?? 0);
  const algorithm = best?.algorithm ?? "mofata";
  const metadata = SUPPORTED_ALGORITHMS[algorithm];
  const notes = [
    best && best.hits.length > 0
      ? `规则识别到 ${best.hits.slice(0, 4).join(" / ")}，更接近 ${metadata.label}。`
      : `未命中明确 MATLAB 特征，已临时映射为 ${metadata.label}，建议人工复核。`,
    `已转换为系统支持的浏览器 Worker 算法标识：${algorithm}。`,
  ];

  if ((best?.score ?? 0) > 0 && (second?.score ?? 0) > 0) {
    notes.push(
      `主候选得分 ${best.score}，次候选得分 ${second.score}，当前置信度为 ${confidence}。`,
    );
  }

  return {
    success: true,
    algorithm,
    source: "fallback",
    confidence,
    normalizedFormat: buildNormalizedFormat(algorithm),
    notes,
  };
}

export function validateMatlabConversionResponse(
  candidate: unknown,
): Omit<
  Extract<ConvertMatlabAlgorithmResponse, { success: true }>,
  "success" | "source" | "normalizedFormat"
> | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const algorithm = record.algorithm;
  const confidence = record.confidence;
  const notes = Array.isArray(record.notes)
    ? record.notes.filter((item): item is string => typeof item === "string")
    : [];

  if (
    algorithm !== "mofata" &&
    algorithm !== "mogwo" &&
    algorithm !== "mopso"
  ) {
    return null;
  }

  if (
    confidence !== "high" &&
    confidence !== "medium" &&
    confidence !== "low"
  ) {
    return null;
  }

  return {
    algorithm,
    confidence,
    notes: uniqueStrings(notes).slice(0, 6),
  };
}

export function buildMatlabConversionPrompt(
  input: ConvertMatlabAlgorithmRequest,
): string {
  const excerpt = clipExcerpt(input.fileContent);

  return `
你将收到一个 MATLAB .m 算法文件。请判断它最接近以下哪一种已支持算法：
- mofata
- mogwo
- mopso

请输出严格 JSON，不要输出 Markdown，不要解释：
{
  "algorithm": "mofata | mogwo | mopso",
  "confidence": "high | medium | low",
  "notes": ["两到四条简短中文说明"]
}

判定时请重点观察：
- MOFATA: Levy, surrogate_fit, cumtrapz, Elite_position, arf
- MOGWO: GreyWolves, Alpha_pos, Beta_pos, Delta_pos
- MOPSO: Particles_Vel, PBest, GBest, Vmax

要求：
1. 只能在上述三种算法中选一个最接近的结果。
2. notes 要说明识别依据，不要编造不存在的函数。
3. 如果文件不完整，也要给出最接近的映射结果。

文件名：${input.fileName}
文件内容摘录：
${excerpt}
  `.trim();
}
