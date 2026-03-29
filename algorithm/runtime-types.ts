import type {
  DecisionVector,
  ModelConfig,
  ObjectiveVector,
} from "@/lib/hobbing-model";
import type {
  OptimizationAlgorithm,
  OptimizationProfileConfig,
} from "@/lib/optimization-types";

export type ArchiveState = {
  archiveX: DecisionVector[];
  archiveF: ObjectiveVector[];
};

export type PopulationEvaluation = {
  positions: DecisionVector[];
  objectives: ObjectiveVector[];
  feCount: number;
};

export type OptimizationContext = {
  jobId: string;
  algorithm: OptimizationAlgorithm;
  config: ModelConfig;
  settings: OptimizationProfileConfig;
  lowerBounds: number[];
  upperBounds: number[];
  archive: ArchiveState;
  startTime: number;
  feCount: number;
  lastReport: number;
};

export interface AlgorithmRuntime {
  dimension: number;
  epsilon: number;
  clamp: (value: number, lower: number, upper: number) => number;
  initializationPWLCM: (
    count: number,
    dim: number,
    upper: number[],
    lower: number[],
  ) => number[][];
  evaluatePopulation: (
    population: number[][],
    context: OptimizationContext,
  ) => PopulationEvaluation;
  maybeReportProgress: (context: OptimizationContext) => void;
  computeSurrogateFitness: (objectives: ObjectiveVector[]) => number[];
  cumulativeTrapezoid: (values: number[]) => number[];
  chooseArchiveLeader: (
    archive: ArchiveState,
    fallbackPopulation: DecisionVector[],
    fallbackObjectives: ObjectiveVector[],
    lowerBounds: number[],
    upperBounds: number[],
  ) => DecisionVector;
  chooseArchiveLeaders: (
    archive: ArchiveState,
    fallbackPopulation: DecisionVector[],
    fallbackObjectives: ObjectiveVector[],
    lowerBounds: number[],
    upperBounds: number[],
  ) => [DecisionVector, DecisionVector, DecisionVector];
  randomDecision: (lowerBounds: number[], upperBounds: number[]) => number[];
  levy: (dim: number) => number[];
  applyEngineeringConstraints: (
    x: number[],
    lowerBounds: number[],
    upperBounds: number[],
  ) => DecisionVector;
  hobbingObjective: (
    x: DecisionVector,
    config: ModelConfig,
  ) => ObjectiveVector;
  updateArchive: (
    archive: ArchiveState,
    candidateX: DecisionVector,
    candidateF: ObjectiveVector,
    maxSize: number,
  ) => void;
  shouldReplacePersonalBest: (
    currentObjective: ObjectiveVector,
    personalBestObjective: ObjectiveVector,
  ) => boolean;
  cloneDecisionVector: (vector: number[]) => DecisionVector;
}

export type AlgorithmRunner = (
  context: OptimizationContext,
  runtime: AlgorithmRuntime,
) => void;

