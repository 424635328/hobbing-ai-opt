import type { ObjectiveVector } from "@/lib/hobbing-model";
import type { AlgorithmRunner } from "./runtime-types";

const runMOPSO: AlgorithmRunner = (context, runtime) => {
  const velocities = Array.from({ length: context.settings.N }, () =>
    Array(runtime.dimension).fill(0),
  );
  const positions = runtime.initializationPWLCM(
    context.settings.N,
    runtime.dimension,
    context.upperBounds,
    context.lowerBounds,
  );
  const personalBestPositions = positions.map((position) =>
    runtime.applyEngineeringConstraints(
      position,
      context.lowerBounds,
      context.upperBounds,
    ),
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
    const evaluation = runtime.evaluatePopulation(positions, context);

    for (let i = 0; i < evaluation.positions.length; i += 1) {
      if (
        runtime.shouldReplacePersonalBest(
          evaluation.objectives[i],
          personalBestObjectives[i],
        )
      ) {
        personalBestPositions[i] = runtime.cloneDecisionVector(
          evaluation.positions[i],
        );
        personalBestObjectives[i] = [...evaluation.objectives[i]];
      }
    }

    runtime.maybeReportProgress(context);

    if (
      context.feCount >= context.settings.Max_FEs ||
      evaluation.positions.length === 0
    ) {
      break;
    }

    for (let i = 0; i < context.settings.N; i += 1) {
      const globalBest = runtime.chooseArchiveLeader(
        context.archive,
        evaluation.positions,
        evaluation.objectives,
        context.lowerBounds,
        context.upperBounds,
      );

      for (let j = 0; j < runtime.dimension; j += 1) {
        velocities[i][j] = runtime.clamp(
          inertiaWeight * velocities[i][j] +
            c1 * Math.random() * (personalBestPositions[i][j] - positions[i][j]) +
            c2 * Math.random() * (globalBest[j] - positions[i][j]),
          vmin[j],
          vmax[j],
        );
        positions[i][j] = runtime.clamp(
          positions[i][j] + velocities[i][j],
          context.lowerBounds[j],
          context.upperBounds[j],
        );
      }
    }
  }
};

export default runMOPSO;

