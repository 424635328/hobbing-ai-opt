import algorithmConfig from "@/algorithm-config";
import type {
  DecisionVector,
  ModelConfig,
  ObjectiveVector,
} from "@/lib/hobbing-model";
import type {
  AlgorithmConfigFile,
  AlgorithmConfigItem,
} from "./algorithm-config-types";

export type OptimizationProfile = "preview" | "accurate";
export type OptimizationAlgorithm = string;

export interface OptimizationAlgorithmConfig {
  id: string;
  entry: string;
  label: string;
  description: string;
  matlabHints: string[];
  features: string[];
  useCases: string[];
  strengths: string[];
}

export interface OptimizationProfileConfig {
  label: string;
  description: string;
  N: number;
  Max_FEs: number;
  ArchiveMaxSize: number;
}

export interface OptimizationStats {
  feCount: number;
  archiveSize: number;
  elapsedMs: number;
}

export interface OptimizationResult {
  finalPF: ObjectiveVector[];
  finalPS: DecisionVector[];
  stats: OptimizationStats;
}

function asArray(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeAlgorithmItem(
  item: AlgorithmConfigItem,
): OptimizationAlgorithmConfig | null {
  const id = item.id?.trim();
  const entry = item.entry?.trim();
  const label = item.label?.trim();
  const description = item.description?.trim();

  if (!id || !entry || !label || !description) {
    return null;
  }

  return {
    id,
    entry,
    label,
    description,
    matlabHints: asArray(item.matlabHints),
    features: asArray(item.features),
    useCases: asArray(item.useCases),
    strengths: asArray(item.strengths),
  };
}

function loadAlgorithmsFromConfig(config: AlgorithmConfigFile): OptimizationAlgorithmConfig[] {
  const normalized: OptimizationAlgorithmConfig[] = [];
  const seen = new Set<string>();

  for (const item of config.algorithms ?? []) {
    const entry = normalizeAlgorithmItem(item);
    if (!entry) {
      continue;
    }

    if (seen.has(entry.id)) {
      continue;
    }

    normalized.push(entry);
    seen.add(entry.id);
  }

  return normalized;
}

const loadedAlgorithmConfig = algorithmConfig as AlgorithmConfigFile;

export const OPTIMIZATION_ALGORITHMS = loadAlgorithmsFromConfig(
  loadedAlgorithmConfig,
);

if (OPTIMIZATION_ALGORITHMS.length === 0) {
  throw new Error(
    "algorithm-config.js 未配置任何可用算法，请至少提供一个 algorithms 条目。",
  );
}

const supportedAlgorithmMap: Record<string, OptimizationAlgorithmConfig> =
  Object.create(null) as Record<string, OptimizationAlgorithmConfig>;

for (const item of OPTIMIZATION_ALGORITHMS) {
  supportedAlgorithmMap[item.id] = item;
}

export const SUPPORTED_ALGORITHMS =
  supportedAlgorithmMap as Record<
    OptimizationAlgorithm,
    OptimizationAlgorithmConfig
  >;

const configuredDefaultAlgorithmId =
  loadedAlgorithmConfig.defaultAlgorithm?.trim() ?? "";

export const DEFAULT_OPTIMIZATION_ALGORITHM =
  configuredDefaultAlgorithmId &&
  supportedAlgorithmMap[configuredDefaultAlgorithmId]
    ? configuredDefaultAlgorithmId
    : OPTIMIZATION_ALGORITHMS[0].id;

export function getOptimizationAlgorithmConfig(
  algorithmId: OptimizationAlgorithm,
): OptimizationAlgorithmConfig | null {
  return supportedAlgorithmMap[algorithmId] ?? null;
}

export const OPTIMIZATION_PROFILES: Record<
  OptimizationProfile,
  OptimizationProfileConfig
> = {
  preview: {
    label: "快速预览",
    description: "适合课堂演示与参数调试，能更快给出可用帕累托前沿。",
    N: 80,
    Max_FEs: 10000,
    ArchiveMaxSize: 160,
  },
  accurate: {
    label: "高精度",
    description: "更贴近 MATLAB 实验规模，适合展示完整优化过程。",
    N: 100,
    Max_FEs: 30000,
    ArchiveMaxSize: 200,
  },
};

export interface OptimizationWorkerStartMessage {
  type: "start";
  jobId: string;
  config: ModelConfig;
  profile: OptimizationProfile;
  algorithm: OptimizationAlgorithm;
}

export interface OptimizationWorkerStartedMessage {
  type: "start";
  jobId: string;
  profile: OptimizationProfile;
  algorithm: OptimizationAlgorithm;
  settings: OptimizationProfileConfig;
}

export interface OptimizationWorkerProgressMessage {
  type: "progress";
  jobId: string;
  progress: number;
  feCount: number;
  archiveSize: number;
  currentPF: ObjectiveVector[];
  elapsedMs: number;
}

export interface OptimizationWorkerDoneMessage extends OptimizationResult {
  type: "done";
  jobId: string;
  algorithm: OptimizationAlgorithm;
}

export interface OptimizationWorkerErrorMessage {
  type: "error";
  jobId: string;
  error: string;
}

export type OptimizationWorkerCommand = OptimizationWorkerStartMessage;

export type OptimizationWorkerEvent =
  | OptimizationWorkerStartedMessage
  | OptimizationWorkerProgressMessage
  | OptimizationWorkerDoneMessage
  | OptimizationWorkerErrorMessage;

