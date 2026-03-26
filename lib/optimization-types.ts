import type {
  DecisionVector,
  ModelConfig,
  ObjectiveVector,
} from "@/lib/hobbing-model";

export type OptimizationProfile = "preview" | "accurate";
export type OptimizationAlgorithm = "mofata" | "mogwo" | "mopso";

export interface OptimizationAlgorithmConfig {
  label: string;
  description: string;
  matlabHints: string[];
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

export const SUPPORTED_ALGORITHMS: Record<
  OptimizationAlgorithm,
  OptimizationAlgorithmConfig
> = {
  mofata: {
    label: "MOFATA",
    description: "改进海市蜃楼多目标算法，适合当前滚齿工艺问题的高保真求解。",
    matlabHints: ["Levy", "surrogate_fit", "cumtrapz", "Elite_position"],
  },
  mogwo: {
    label: "MOGWO",
    description: "多目标灰狼优化算法，使用 Alpha/Beta/Delta 领导层更新种群。",
    matlabHints: ["GreyWolves", "Alpha_pos", "Beta_pos", "Delta_pos"],
  },
  mopso: {
    label: "MOPSO",
    description: "多目标粒子群优化算法，使用 PBest、GBest 和速度更新机制。",
    matlabHints: ["Particles_Vel", "PBest", "GBest", "Vmax"],
  },
};

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

export type MatlabAlgorithmConversionSource = "deepseek" | "fallback";
export type MatlabAlgorithmConfidence = "high" | "medium" | "low";

export interface MatlabAlgorithmNormalizedFormat {
  algorithm: OptimizationAlgorithm;
  supportedRuntime: "browser-worker";
  inputKind: "matlab-algorithm-file";
}

export interface ConvertMatlabAlgorithmRequest {
  fileName: string;
  fileContent: string;
}

export type ConvertMatlabAlgorithmResponse =
  | {
      success: true;
      algorithm: OptimizationAlgorithm;
      source: MatlabAlgorithmConversionSource;
      confidence: MatlabAlgorithmConfidence;
      normalizedFormat: MatlabAlgorithmNormalizedFormat;
      notes: string[];
    }
  | {
      success: false;
      error: string;
      notes?: string[];
    };
