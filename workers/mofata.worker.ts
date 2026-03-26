/// <reference lib="webworker" />

import {
  applyEngineeringConstraints,
  clamp,
  hobbingObjective,
  isPenaltySolution,
  serializeDecisionVector,
  type DecisionVector,
  type ObjectiveVector,
} from "@/lib/hobbing-model";
import {
  OPTIMIZATION_PROFILES,
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

  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
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

function sortArchive(
  archiveX: DecisionVector[],
  archiveF: ObjectiveVector[],
): { archiveX: DecisionVector[]; archiveF: ObjectiveVector[] } {
  const paired = archiveX.map((decision, index) => ({
    decision,
    objective: archiveF[index],
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

function pruneArchive(
  archiveX: DecisionVector[],
  archiveF: ObjectiveVector[],
  maxSize: number,
) {
  while (archiveF.length > maxSize) {
    const distances = nearestNeighborDistances(archiveF);
    let crowdedIndex = 0;

    for (let i = 1; i < distances.length; i += 1) {
      if (distances[i] < distances[crowdedIndex]) {
        crowdedIndex = i;
      }
    }

    archiveX.splice(crowdedIndex, 1);
    archiveF.splice(crowdedIndex, 1);
  }
}

function updateArchive(
  archiveX: DecisionVector[],
  archiveF: ObjectiveVector[],
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
  const duplicateIndex = archiveX.findIndex(
    (vector) => serializeDecisionVector(vector) === candidateKey,
  );

  if (duplicateIndex >= 0) {
    return;
  }

  const removable: number[] = [];

  for (let i = 0; i < archiveF.length; i += 1) {
    const existing = archiveF[i];

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
    archiveX.splice(index, 1);
    archiveF.splice(index, 1);
  }

  archiveX.push(candidateX);
  archiveF.push(candidateF);
  pruneArchive(archiveX, archiveF, maxSize);
}

function postMessage(message: OptimizationWorkerEvent) {
  scope.postMessage(message);
}

function reportProgress(
  jobId: string,
  feCount: number,
  maxFEs: number,
  startTime: number,
  archiveX: DecisionVector[],
  archiveF: ObjectiveVector[],
): void {
  const sorted = sortArchive(archiveX, archiveF);
  const event: OptimizationWorkerProgressMessage = {
    type: "progress",
    jobId,
    progress: Math.min(100, (feCount / maxFEs) * 100),
    feCount,
    archiveSize: archiveF.length,
    currentPF: sorted.archiveF,
    elapsedMs: Date.now() - startTime,
  };

  postMessage(event);
}

function runOptimization(command: OptimizationWorkerCommand): void {
  const { jobId, config, profile } = command;
  const settings = OPTIMIZATION_PROFILES[profile];
  const startedEvent: OptimizationWorkerStartedMessage = {
    type: "start",
    jobId,
    profile,
    settings,
  };

  postMessage(startedEvent);

  const lowerBounds = config.bounds.lb;
  const upperBounds = config.bounds.ub;
  const archiveX: DecisionVector[] = [];
  const archiveF: ObjectiveVector[] = [];
  let population = initializationPWLCM(
    settings.N,
    DIMENSION,
    upperBounds,
    lowerBounds,
  );
  let feCount = 0;
  let bestIntegral = Infinity;
  let worstIntegral = 0;
  let lastReport = 0;
  const arf = 0.2;
  const startTime = Date.now();

  while (feCount < settings.Max_FEs) {
    const evaluatedPopulation: DecisionVector[] = [];
    const objectivePopulation: ObjectiveVector[] = [];

    for (let i = 0; i < settings.N && feCount < settings.Max_FEs; i += 1) {
      const constrained = applyEngineeringConstraints(
        population[i],
        lowerBounds,
        upperBounds,
      );
      const objective = hobbingObjective(constrained, config);

      evaluatedPopulation.push(constrained);
      objectivePopulation.push(objective);
      updateArchive(
        archiveX,
        archiveF,
        constrained,
        objective,
        settings.ArchiveMaxSize,
      );

      feCount += 1;
    }

    if (
      feCount - lastReport >= REPORT_INTERVAL ||
      feCount >= settings.Max_FEs
    ) {
      reportProgress(
        jobId,
        feCount,
        settings.Max_FEs,
        startTime,
        archiveX,
        archiveF,
      );
      lastReport = feCount;
    }

    if (feCount >= settings.Max_FEs || evaluatedPopulation.length === 0) {
      break;
    }

    const surrogateFitness = computeSurrogateFitness(objectivePopulation);
    const ordered = surrogateFitness
      .map((value, index) => ({ value, index }))
      .sort((left, right) => left.value - right.value);
    const orderedValues = ordered.map((item) => item.value);
    const orderedIndices = ordered.map((item) => item.index);
    const bestPopulationIndex = orderedIndices[0] ?? 0;
    const worstFitness = orderedValues[orderedValues.length - 1] ?? 0;
    const integral = cumulativeTrapezoid(orderedValues);
    const currentIntegral = integral[integral.length - 1] ?? 0;

    if (currentIntegral > worstIntegral) {
      worstIntegral = currentIntegral;
    }
    if (currentIntegral < bestIntegral) {
      bestIntegral = currentIntegral;
    }

    const integralDenominator = bestIntegral - worstIntegral;
    const ip =
      Math.abs(integralDenominator) < EPSILON
        ? 0
        : clamp(
            (currentIntegral - worstIntegral) / integralDenominator,
            0,
            1,
          );

    const sparsityWeights = nearestNeighborDistances(archiveF).map(
      (distance) => distance + 1e-6,
    );
    const eliteIndex =
      archiveX.length > 0 ? rouletteWheelSelection(sparsityWeights) : -1;
    const elitePosition =
      eliteIndex >= 0
        ? archiveX[eliteIndex]
        : evaluatedPopulation[bestPopulationIndex];

    const progress = feCount / settings.Max_FEs;
    const tangent = Math.tan(-progress + 1);
    const safeTangent =
      Math.abs(tangent) < 1e-6 ? (tangent < 0 ? -1e-6 : 1e-6) : tangent;
    const a = safeTangent;
    const b = 1 / safeTangent;
    const nextPopulation = population.map((particle) => [...particle]);
    const bestDenominator =
      surrogateFitness[bestPopulationIndex] - worstFitness || EPSILON;

    for (let i = 0; i < settings.N; i += 1) {
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
        nextPopulation[i] = lowerBounds.map(
          (lower, index) =>
            lower + Math.random() * (upperBounds[index] - lower),
        );
        continue;
      }

      for (let j = 0; j < DIMENSION; j += 1) {
        const randomIndex = Math.floor(Math.random() * settings.N);

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
            0.5 * (arf + 1) * (lowerBounds[j] + upperBounds[j]) - arf * mutated;
          nextPopulation[i][j] = mutated;
        }

        nextPopulation[i][j] = clamp(
          nextPopulation[i][j],
          lowerBounds[j],
          upperBounds[j],
        );
      }
    }

    population = nextPopulation;

    if (Math.random() < 0.2 && feCount < settings.Max_FEs) {
      const levyStep = levy(DIMENSION);
      const candidate = elitePosition.map(
        (value, index) =>
          value + 0.01 * levyStep[index] * (upperBounds[index] - lowerBounds[index]),
      );
      const constrained = applyEngineeringConstraints(
        candidate,
        lowerBounds,
        upperBounds,
      );
      const objective = hobbingObjective(constrained, config);

      updateArchive(
        archiveX,
        archiveF,
        constrained,
        objective,
        settings.ArchiveMaxSize,
      );

      feCount += 1;
      population[orderedIndices[orderedIndices.length - 1] ?? 0] = candidate.map(
        (value, index) => clamp(value, lowerBounds[index], upperBounds[index]),
      );
    }
  }

  const sorted = sortArchive(archiveX, archiveF);
  const doneEvent: OptimizationWorkerDoneMessage = {
    type: "done",
    jobId,
    finalPF: sorted.archiveF,
    finalPS: sorted.archiveX,
    stats: {
      feCount,
      archiveSize: sorted.archiveF.length,
      elapsedMs: Date.now() - startTime,
    },
  };

  postMessage(doneEvent);
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
    postMessage(message);
  }
};

export {};
