import type {
  DecisionVector,
  ModelConfig,
  ObjectiveVector,
} from "@/lib/hobbing-model";

export type OptimizationProfile = "preview" | "accurate";

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
}

export interface OptimizationWorkerStartedMessage {
  type: "start";
  jobId: string;
  profile: OptimizationProfile;
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
