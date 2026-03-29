import type {
  BuildModelRequest,
  DecisionVector,
  ModelConfig,
  ModelSource,
  ObjectiveVector,
} from "@/lib/hobbing-model";

export interface ValidationWeights {
  energy: number;
  cost: number;
  roughness: number;
}

export interface RankedSolutionSnapshot {
  index: number;
  decision: DecisionVector;
  objectives: ObjectiveVector;
  score: number;
}

export interface ResultValidationRequest {
  request: BuildModelRequest;
  config: ModelConfig;
  recommended: RankedSolutionSnapshot;
  alternatives: RankedSolutionSnapshot[];
  modelSource: ModelSource | null;
  modelNotes: string[];
  algorithmLabel: string;
  profileLabel: string;
  normalizedWeights: ValidationWeights;
}

export type ValidationVerdict = "合理" | "需关注" | "不合理";

export interface ValidationBoundaryCheck {
  id: "d_a0" | "z_0" | "n" | "f";
  label: string;
  value: number;
  lower: number;
  upper: number;
  minDistanceRatio: number;
  status: "normal" | "near_boundary" | "at_boundary";
  detail: string;
}

export interface ValidationConstraintCheck {
  id: "power" | "roughness" | "tool_life" | "speed" | "objective_consistency";
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  value: number;
  unit: string;
  lowerLimit?: number;
  upperLimit?: number;
  utilization: number;
}

export interface ValidationCoreMetrics {
  cuttingSpeed: number;
  cuttingPower: number;
  roughness: number;
  toolLife: number;
  toolLifeRequired: number;
  machiningTime: number;
  totalTime: number;
}

export interface ResultValidationReport {
  source: "deepseek" | "fallback";
  generatedAt: string;
  verdict: ValidationVerdict;
  summary: string;
  boundaryChecks: ValidationBoundaryCheck[];
  constraintChecks: ValidationConstraintCheck[];
  abnormalSignals: string[];
  recommendations: string[];
  coreMetrics: ValidationCoreMetrics;
  aiReasoning?: string;
}

export type ResultValidationResponse =
  | {
      success: true;
      report: ResultValidationReport;
    }
  | {
      success: false;
      error: string;
    };
