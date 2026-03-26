/// <reference lib="webworker" />

import {
  applyEngineeringConstraints,
  clamp,
  hobbingObjective,
  isPenaltySolution,
  serializeDecisionVector,
  type DecisionVector,
  type ModelConfig,
  type ObjectiveVector,
} from "@/lib/hobbing-model";
import {
  OPTIMIZATION_PROFILES,
  type OptimizationAlgorithm,
  type OptimizationProfileConfig,
  type OptimizationWorkerCommand,
  type OptimizationWorkerDoneMessage,
  type OptimizationWorkerErrorMessage,
  type OptimizationWorkerEvent,
  type OptimizationWorkerProgressMessage,
  type OptimizationWorkerStartedMessage,
} from "@/lib/optimization-types";

const scope = self as DedicatedWorkerGlobalScope;
const REPORT_INTERVAL = 800;
const DIMENSION = 4;
const EPSILON = 1e-12;

type ArchiveState = {
  archiveX: DecisionVector[];
  archiveF: ObjectiveVector[];
};

type PopulationEvaluation = {
  positions: DecisionVector[];
  objectives: ObjectiveVector[];
  feCount: number;
};

type OptimizationContext = {
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

function dominates(a: number[], b: number[]): boolean {
  return (
    a[0] <= b[0] &&
    a[1] <= b[1] &&
    a[2] <= b[2] &&
    (a[0] < b[0] || a[1] < b[1] || a[2] < b[2])
  );
}

function initializationPWLCM(
  count: number,
  dim: number,
  upper: number[],
  lower: number[],
): number[][] {
  const positions = Array.from({ length: count }, () => Array(dim).fill(0));
  const p = 0.4;
  let x = Math.random();

  for (let j = 0; j < dim; j += 1) {
    for (let i = 0; i < count; i += 1) {
      if (x >= 0 && x < p) {
        x /= p;
      } else if (x >= p && x < 0.5) {
        x = (x - p) / (0.5 - p);
      } else if (x >= 0.5 && x < 1 - p) {
        x = (1 - p - x) / (0.5 - p);
      } else {
        x = (1 - x) / p;
      }

      positions[i][j] = lower[j] + x * (upper[j] - lower[j]);
    }
  }

  return positions;
}

function gamma(z: number): number {
  const g = 7;
  const p = [
    0.9999999999998099,
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  }

  let x = p[0];

  for (let i = 1; i < p.length; i += 1) {
    x += p[i] / (z + i - 1);
  }

  const t = z + g - 0.5;
  return Math.sqrt(2 * Math.PI) * t ** (z - 0.5) * Math.exp(-t) * x;
}

function gaussianRandom(): number {
  let u = 0;
  let v = 0;

  while (u === 0) {
    u = Math.random();
  }

  while (v === 0) {
    v = Math.random();
  }

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function levy(dim: number): number[] {
  const beta = 1.5;
  const sigma =
    (gamma(1 + beta) * Math.sin((Math.PI * beta) / 2)) /
    (gamma((1 + beta) / 2) * beta * 2 ** ((beta - 1) / 2));
  const sigmaRoot = sigma ** (1 / beta);

  return Array.from({ length: dim }, () => {
    const u = gaussianRandom() * sigmaRoot;
    const v = gaussianRandom();
    return u / Math.abs(v) ** (1 / beta);
  });
}

function cumulativeTrapezoid(values: number[]): number[] {
  const result = Array(values.length).fill(0);

  for (let i = 1; i < values.length; i += 1) {
    result[i] = result[i - 1] + (values[i - 1] + values[i]) / 2;
  }

  return result;
}

function computeSurrogateFitness(objectives: ObjectiveVector[]): number[] {
  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];

  for (const objective of objectives) {
    for (let i = 0; i < 3; i += 1) {
      mins[i] = Math.min(mins[i], objective[i]);
      maxs[i] = Math.max(maxs[i], objective[i]);
    }
  }

  return objectives.map((objective) => {
    let total = 0;

    for (let i = 0; i < 3; i += 1) {
      const span = maxs[i] - mins[i];
      total += span < EPSILON ? 0 : (objective[i] - mins[i]) / span;
    }

    return total;
  });
}

function normalizedPoints(points: ObjectiveVector[]): number[][] {
  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];

  for (const point of points) {
    for (let i = 0; i < 3; i += 1) {
      mins[i] = Math.min(mins[i], point[i]);
      maxs[i] = Math.max(maxs[i], point[i]);
    }
  }

  return points.map((point) =>
    point.map((value, index) => {
      const span = maxs[index] - mins[index];
      return span < EPSILON ? 0.5 : (value - mins[index]) / span;
    }),
  );
}

function nearestNeighborDistances(points: ObjectiveVector[]): number[] {
  if (points.length <= 1) {
    return points.map(() => 1);
  }

  const normalized = normalizedPoints(points);

  return normalized.map((point, index) => {
    let nearest = Infinity;

    for (let otherIndex = 0; otherIndex < normalized.length; otherIndex += 1) {
      if (otherIndex === index) {
        continue;
      }

      const other = normalized[otherIndex];
      const distance = Math.sqrt(
        (point[0] - other[0]) ** 2 +
          (point[1] - other[1]) ** 2 +
          (point[2] - other[2]) ** 2,
      );

      nearest = Math.min(nearest, distance);
    }

    return Number.isFinite(nearest) ? nearest : 1;
  });
}

function rouletteWheelSelection(weights: number[]): number {
  const safeWeights = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 0,
  );
  const total = safeWeights.reduce((sum, weight) => sum + weight, 0);

  if (total <= EPSILON) {
    return Math.floor(Math.random() * Math.max(safeWeights.length, 1));
  }

  let threshold = Math.random() * total;

  for (let i = 0; i < safeWeights.length; i += 1) {
    threshold -= safeWeights[i];
    if (threshold <= 0) {
      return i;
    }
  }

  return safeWeights.length - 1;
}

function cloneDecisionVector(vector: number[]): DecisionVector {
  return [vector[0], vector[1], vector[2], vector[3]];
}

function sortArchive(archive: ArchiveState): ArchiveState {
  const paired = archive.archiveX.map((decision, index) => ({
    decision,
    objective: archive.archiveF[index],
  }));

  paired.sort((a, b) => {
    if (a.objective[0] !== b.objective[0]) {
      return a.objective[0] - b.objective[0];
    }

    if (a.objective[1] !== b.objective[1]) {
      return a.objective[1] - b.objective[1];
    }

    return a.objective[2] - b.objective[2];
  });

  return {
    archiveX: paired.map((item) => item.decision),
    archiveF: paired.map((item) => item.objective),
  };
}

function pruneArchive(archive: ArchiveState, maxSize: number): void {
  while (archive.archiveF.length > maxSize) {
    const distances = nearestNeighborDistances(archive.archiveF);
    let crowdedIndex = 0;

    for (let i = 1; i < distances.length; i += 1) {
      if (distances[i] < distances[crowdedIndex]) {
        crowdedIndex = i;
      }
    }

    archive.archiveX.splice(crowdedIndex, 1);
    archive.archiveF.splice(crowdedIndex, 1);
  }
}

function updateArchive(
  archive: ArchiveState,
  candidateX: DecisionVector,
  candidateF: ObjectiveVector,
  maxSize: number,
): void {
  if (
    !candidateF.every((value) => Number.isFinite(value)) ||
    isPenaltySolution(candidateF)
  ) {
    return;
  }

  const candidateKey = serializeDecisionVector(candidateX);
  const duplicateIndex = archive.archiveX.findIndex(
    (vector) => serializeDecisionVector(vector) === candidateKey,
  );

  if (duplicateIndex >= 0) {
    return;
  }

  const removable: number[] = [];

  for (let i = 0; i < archive.archiveF.length; i += 1) {
    const existing = archive.archiveF[i];

    if (
      existing[0] === candidateF[0] &&
      existing[1] === candidateF[1] &&
      existing[2] === candidateF[2]
    ) {
      return;
    }

    if (dominates(existing, candidateF)) {
      return;
    }

    if (dominates(candidateF, existing)) {
      removable.push(i);
    }
  }

  for (let i = removable.length - 1; i >= 0; i -= 1) {
    const index = removable[i];
    archive.archiveX.splice(index, 1);
    archive.archiveF.splice(index, 1);
  }

  archive.archiveX.push(candidateX);
  archive.archiveF.push(candidateF);
  pruneArchive(archive, maxSize);
}

function emitEvent(message: OptimizationWorkerEvent) {
  scope.postMessage(message);
}

function reportProgress(context: OptimizationContext): void {
  const sorted = sortArchive(context.archive);
  const event: OptimizationWorkerProgressMessage = {
    type: "progress",
    jobId: context.jobId,
    progress: Math.min(
      100,
      (context.feCount / context.settings.Max_FEs) * 100,
    ),
    feCount: context.feCount,
    archiveSize: sorted.archiveF.length,
    currentPF: sorted.archiveF,
    elapsedMs: Date.now() - context.startTime,
  };

  emitEvent(event);
}

function maybeReportProgress(context: OptimizationContext): void {
  if (
    context.feCount - context.lastReport >= REPORT_INTERVAL ||
    context.feCount >= context.settings.Max_FEs
  ) {
    reportProgress(context);
    context.lastReport = context.feCount;
  }
}

function randomDecision(lowerBounds: number[], upperBounds: number[]): number[] {
  return lowerBounds.map(
    (lower, index) => lower + Math.random() * (upperBounds[index] - lower),
  );
}

function scalarObjective(objective: ObjectiveVector): number {
  return objective[0] + objective[1] + objective[2];
}

function shouldReplacePersonalBest(
  currentObjective: ObjectiveVector,
  personalBestObjective: ObjectiveVector,
): boolean {
  if (isPenaltySolution(personalBestObjective) && !isPenaltySolution(currentObjective)) {
    return true;
  }

  if (dominates(currentObjective, personalBestObjective)) {
    return true;
  }

  if (dominates(personalBestObjective, currentObjective)) {
    return false;
  }

  return scalarObjective(currentObjective) < scalarObjective(personalBestObjective);
}

function chooseFallbackLeader(
  population: DecisionVector[],
  objectives: ObjectiveVector[],
  lowerBounds: number[],
  upperBounds: number[],
): DecisionVector {
  if (population.length === 0) {
    return applyEngineeringConstraints(
      randomDecision(lowerBounds, upperBounds),
      lowerBounds,
      upperBounds,
    );
  }

  const surrogateFitness = computeSurrogateFitness(objectives);
  let bestIndex = 0;

  for (let i = 1; i < surrogateFitness.length; i += 1) {
    if (surrogateFitness[i] < surrogateFitness[bestIndex]) {
      bestIndex = i;
    }
  }

  return cloneDecisionVector(population[bestIndex]);
}

function chooseArchiveLeader(
  archive: ArchiveState,
  fallbackPopulation: DecisionVector[],
  fallbackObjectives: ObjectiveVector[],
  lowerBounds: number[],
  upperBounds: number[],
): DecisionVector {
  if (archive.archiveX.length === 0) {
    return chooseFallbackLeader(
      fallbackPopulation,
      fallbackObjectives,
      lowerBounds,
      upperBounds,
    );
  }

  const weights = nearestNeighborDistances(archive.archiveF).map(
    (distance) => distance + 1e-6,
  );
  const index = rouletteWheelSelection(weights);
  return cloneDecisionVector(archive.archiveX[index]);
}

function chooseArchiveLeaders(
  archive: ArchiveState,
  fallbackPopulation: DecisionVector[],
  fallbackObjectives: ObjectiveVector[],
  lowerBounds: number[],
  upperBounds: number[],
): [DecisionVector, DecisionVector, DecisionVector] {
  return [
    chooseArchiveLeader(
      archive,
      fallbackPopulation,
      fallbackObjectives,
      lowerBounds,
      upperBounds,
    ),
    chooseArchiveLeader(
      archive,
      fallbackPopulation,
      fallbackObjectives,
      lowerBounds,
      upperBounds,
    ),
    chooseArchiveLeader(
      archive,
      fallbackPopulation,
      fallbackObjectives,
      lowerBounds,
      upperBounds,
    ),
  ];
}

function evaluatePopulation(
  population: number[][],
  context: OptimizationContext,
): PopulationEvaluation {
  const positions: DecisionVector[] = [];
  const objectives: ObjectiveVector[] = [];

  for (
    let i = 0;
    i < population.length && context.feCount < context.settings.Max_FEs;
    i += 1
  ) {
    const constrained = applyEngineeringConstraints(
      population[i],
      context.lowerBounds,
      context.upperBounds,
    );
    const objective = hobbingObjective(constrained, context.config);

    positions.push(constrained);
    objectives.push(objective);
    updateArchive(
      context.archive,
      constrained,
      objective,
      context.settings.ArchiveMaxSize,
    );

    context.feCount += 1;
  }

  return {
    positions,
    objectives,
    feCount: positions.length,
  };
}

function finalizeOptimization(context: OptimizationContext): void {
  const sorted = sortArchive(context.archive);
  const doneEvent: OptimizationWorkerDoneMessage = {
    type: "done",
    jobId: context.jobId,
    algorithm: context.algorithm,
    finalPF: sorted.archiveF,
    finalPS: sorted.archiveX,
    stats: {
      feCount: context.feCount,
      archiveSize: sorted.archiveF.length,
      elapsedMs: Date.now() - context.startTime,
    },
  };

  emitEvent(doneEvent);
}

function createContext(command: OptimizationWorkerCommand): OptimizationContext {
  const settings = OPTIMIZATION_PROFILES[command.profile];

  const startedEvent: OptimizationWorkerStartedMessage = {
    type: "start",
    jobId: command.jobId,
    profile: command.profile,
    algorithm: command.algorithm,
    settings,
  };

  emitEvent(startedEvent);

  return {
    jobId: command.jobId,
    algorithm: command.algorithm,
    config: command.config,
    settings,
    lowerBounds: command.config.bounds.lb,
    upperBounds: command.config.bounds.ub,
    archive: {
      archiveX: [],
      archiveF: [],
    },
    startTime: Date.now(),
    feCount: 0,
    lastReport: 0,
  };
}

function runMOFATA(context: OptimizationContext): void {
  let population = initializationPWLCM(
    context.settings.N,
    DIMENSION,
    context.upperBounds,
    context.lowerBounds,
  );
  let bestIntegral = Infinity;
  let worstIntegral = 0;
  const arf = 0.2;

  while (context.feCount < context.settings.Max_FEs) {
    const evaluation = evaluatePopulation(population, context);
    maybeReportProgress(context);

    if (
      context.feCount >= context.settings.Max_FEs ||
      evaluation.positions.length === 0
    ) {
      break;
    }

    const surrogateFitness = computeSurrogateFitness(evaluation.objectives);
    const ordered = surrogateFitness
      .map((value, index) => ({ value, index }))
      .sort((left, right) => left.value - right.value);
    const orderedValues = ordered.map((item) => item.value);
    const orderedIndices = ordered.map((item) => item.index);
    const bestPopulationIndex = orderedIndices[0] ?? 0;
    const worstPopulationIndex =
      orderedIndices[orderedIndices.length - 1] ?? bestPopulationIndex;
    const worstFitness = orderedValues[orderedValues.length - 1] ?? 0;
    const integral = cumulativeTrapezoid(orderedValues);
    const currentIntegral = integral[integral.length - 1] ?? 0;

    if (currentIntegral > worstIntegral) {
      worstIntegral = currentIntegral;
    }

    if (currentIntegral < bestIntegral) {
      bestIntegral = currentIntegral;
    }

    const denominator = bestIntegral - worstIntegral;
    const ip =
      Math.abs(denominator) < EPSILON
        ? 0
        : clamp((currentIntegral - worstIntegral) / denominator, 0, 1);

    const elitePosition = chooseArchiveLeader(
      context.archive,
      evaluation.positions,
      evaluation.objectives,
      context.lowerBounds,
      context.upperBounds,
    );
    const progress = context.feCount / context.settings.Max_FEs;
    const tangent = Math.tan(-progress + 1);
    const safeTangent =
      Math.abs(tangent) < 1e-6 ? (tangent < 0 ? -1e-6 : 1e-6) : tangent;
    const a = safeTangent;
    const b = 1 / safeTangent;
    const nextPopulation = population.map((particle) => [...particle]);
    const bestDenominator =
      surrogateFitness[bestPopulationIndex] - worstFitness || EPSILON;

    for (let i = 0; i < context.settings.N; i += 1) {
      const para1 = Array.from(
        { length: DIMENSION },
        () => a * Math.random() - a * Math.random(),
      );
      const para2 = Array.from(
        { length: DIMENSION },
        () => b * Math.random() - b * Math.random(),
      );
      const probability = clamp(
        (surrogateFitness[i] - worstFitness) / bestDenominator,
        0,
        1,
      );

      if (Math.random() > ip) {
        nextPopulation[i] = randomDecision(context.lowerBounds, context.upperBounds);
        continue;
      }

      for (let j = 0; j < DIMENSION; j += 1) {
        const randomIndex = Math.floor(Math.random() * context.settings.N);

        if (Math.random() < probability) {
          if (i === bestPopulationIndex) {
            nextPopulation[i][j] =
              elitePosition[j] + population[i][j] * para1[j];
          } else {
            nextPopulation[i][j] =
              elitePosition[j] +
              (elitePosition[j] - population[i][j]) * para1[j] * 2;
          }
        } else {
          let mutated =
            population[randomIndex][j] + para2[j] * population[i][j];
          mutated =
            0.5 * (arf + 1) * (context.lowerBounds[j] + context.upperBounds[j]) -
            arf * mutated;
          nextPopulation[i][j] = mutated;
        }

        nextPopulation[i][j] = clamp(
          nextPopulation[i][j],
          context.lowerBounds[j],
          context.upperBounds[j],
        );
      }
    }

    population = nextPopulation;

    if (Math.random() < 0.2 && context.feCount < context.settings.Max_FEs) {
      const levyStep = levy(DIMENSION);
      const candidate = elitePosition.map(
        (value, index) =>
          value +
          0.01 * levyStep[index] * (context.upperBounds[index] - context.lowerBounds[index]),
      );
      const constrained = applyEngineeringConstraints(
        candidate,
        context.lowerBounds,
        context.upperBounds,
      );
      const objective = hobbingObjective(constrained, context.config);

      updateArchive(
        context.archive,
        constrained,
        objective,
        context.settings.ArchiveMaxSize,
      );

      context.feCount += 1;
      population[worstPopulationIndex] = candidate.map((value, index) =>
        clamp(value, context.lowerBounds[index], context.upperBounds[index]),
      );
      maybeReportProgress(context);
    }
  }
}

function runMOGWO(context: OptimizationContext): void {
  const greyWolves = initializationPWLCM(
    context.settings.N,
    DIMENSION,
    context.upperBounds,
    context.lowerBounds,
  );

  while (context.feCount < context.settings.Max_FEs) {
    const evaluation = evaluatePopulation(greyWolves, context);
    maybeReportProgress(context);

    if (
      context.feCount >= context.settings.Max_FEs ||
      evaluation.positions.length === 0
    ) {
      break;
    }

    const a = 2 - context.feCount * (2 / context.settings.Max_FEs);
    const [alphaPos, betaPos, deltaPos] = chooseArchiveLeaders(
      context.archive,
      evaluation.positions,
      evaluation.objectives,
      context.lowerBounds,
      context.upperBounds,
    );

    for (let i = 0; i < context.settings.N; i += 1) {
      for (let j = 0; j < DIMENSION; j += 1) {
        let r1 = Math.random();
        let r2 = Math.random();
        const A1 = 2 * a * r1 - a;
        const C1 = 2 * r2;
        const DAlpha = Math.abs(C1 * alphaPos[j] - greyWolves[i][j]);
        const X1 = alphaPos[j] - A1 * DAlpha;

        r1 = Math.random();
        r2 = Math.random();
        const A2 = 2 * a * r1 - a;
        const C2 = 2 * r2;
        const DBeta = Math.abs(C2 * betaPos[j] - greyWolves[i][j]);
        const X2 = betaPos[j] - A2 * DBeta;

        r1 = Math.random();
        r2 = Math.random();
        const A3 = 2 * a * r1 - a;
        const C3 = 2 * r2;
        const DDelta = Math.abs(C3 * deltaPos[j] - greyWolves[i][j]);
        const X3 = deltaPos[j] - A3 * DDelta;

        greyWolves[i][j] = clamp(
          (X1 + X2 + X3) / 3,
          context.lowerBounds[j],
          context.upperBounds[j],
        );
      }
    }
  }
}

function runMOPSO(context: OptimizationContext): void {
  const velocities = Array.from({ length: context.settings.N }, () =>
    Array(DIMENSION).fill(0),
  );
  const positions = initializationPWLCM(
    context.settings.N,
    DIMENSION,
    context.upperBounds,
    context.lowerBounds,
  );
  const personalBestPositions = positions.map((position) =>
    applyEngineeringConstraints(position, context.lowerBounds, context.upperBounds),
  );
  const personalBestObjectives = Array.from(
    { length: context.settings.N },
    () => [Infinity, Infinity, Infinity] as ObjectiveVector,
  );
  const inertiaWeight = 0.5;
  const c1 = 1.5;
  const c2 = 1.5;
  const vmax = context.upperBounds.map(
    (upper, index) => 0.1 * (upper - context.lowerBounds[index]),
  );
  const vmin = vmax.map((value) => -value);

  while (context.feCount < context.settings.Max_FEs) {
    const evaluation = evaluatePopulation(positions, context);

    for (let i = 0; i < evaluation.positions.length; i += 1) {
      if (
        shouldReplacePersonalBest(
          evaluation.objectives[i],
          personalBestObjectives[i],
        )
      ) {
        personalBestPositions[i] = cloneDecisionVector(evaluation.positions[i]);
        personalBestObjectives[i] = [...evaluation.objectives[i]];
      }
    }

    maybeReportProgress(context);

    if (
      context.feCount >= context.settings.Max_FEs ||
      evaluation.positions.length === 0
    ) {
      break;
    }

    for (let i = 0; i < context.settings.N; i += 1) {
      const globalBest = chooseArchiveLeader(
        context.archive,
        evaluation.positions,
        evaluation.objectives,
        context.lowerBounds,
        context.upperBounds,
      );

      for (let j = 0; j < DIMENSION; j += 1) {
        velocities[i][j] = clamp(
          inertiaWeight * velocities[i][j] +
            c1 * Math.random() * (personalBestPositions[i][j] - positions[i][j]) +
            c2 * Math.random() * (globalBest[j] - positions[i][j]),
          vmin[j],
          vmax[j],
        );
        positions[i][j] = clamp(
          positions[i][j] + velocities[i][j],
          context.lowerBounds[j],
          context.upperBounds[j],
        );
      }
    }
  }
}

function runOptimization(command: OptimizationWorkerCommand): void {
  const context = createContext(command);

  if (command.algorithm === "mofata") {
    runMOFATA(context);
  } else if (command.algorithm === "mogwo") {
    runMOGWO(context);
  } else {
    runMOPSO(context);
  }

  finalizeOptimization(context);
}

scope.onmessage = (event: MessageEvent<OptimizationWorkerCommand>) => {
  const command = event.data;

  if (!command || command.type !== "start") {
    return;
  }

  try {
    runOptimization(command);
  } catch (error) {
    const message: OptimizationWorkerErrorMessage = {
      type: "error",
      jobId: command.jobId,
      error:
        error instanceof Error && error.message
          ? error.message
          : "Worker 内部发生未知错误。",
    };

    emitEvent(message);
  }
};

export {};
