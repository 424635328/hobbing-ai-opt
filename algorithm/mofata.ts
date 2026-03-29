import type { AlgorithmRunner } from "./runtime-types";

const ARF = 0.2;

const runMOFATA: AlgorithmRunner = (context, runtime) => {
  let population = runtime.initializationPWLCM(
    context.settings.N,
    runtime.dimension,
    context.upperBounds,
    context.lowerBounds,
  );
  let bestIntegral = Number.POSITIVE_INFINITY;
  let worstIntegral = 0;

  while (context.feCount < context.settings.Max_FEs) {
    const evaluation = runtime.evaluatePopulation(population, context);
    runtime.maybeReportProgress(context);

    if (
      context.feCount >= context.settings.Max_FEs ||
      evaluation.positions.length === 0
    ) {
      break;
    }

    const surrogateFitness = runtime.computeSurrogateFitness(evaluation.objectives);
    const ordered = surrogateFitness
      .map((value, index) => ({ value, index }))
      .sort((left, right) => left.value - right.value);
    const orderedValues = ordered.map((item) => item.value);
    const orderedIndices = ordered.map((item) => item.index);
    const bestPopulationIndex = orderedIndices[0] ?? 0;
    const worstPopulationIndex =
      orderedIndices[orderedIndices.length - 1] ?? bestPopulationIndex;
    const worstFitness = orderedValues[orderedValues.length - 1] ?? 0;
    const integral = runtime.cumulativeTrapezoid(orderedValues);
    const currentIntegral = integral[integral.length - 1] ?? 0;

    if (currentIntegral > worstIntegral) {
      worstIntegral = currentIntegral;
    }

    if (currentIntegral < bestIntegral) {
      bestIntegral = currentIntegral;
    }

    const denominator = bestIntegral - worstIntegral;
    const ip =
      Math.abs(denominator) < runtime.epsilon
        ? 0
        : runtime.clamp((currentIntegral - worstIntegral) / denominator, 0, 1);

    const elitePosition = runtime.chooseArchiveLeader(
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
      surrogateFitness[bestPopulationIndex] - worstFitness || runtime.epsilon;

    for (let i = 0; i < context.settings.N; i += 1) {
      const para1 = Array.from(
        { length: runtime.dimension },
        () => a * Math.random() - a * Math.random(),
      );
      const para2 = Array.from(
        { length: runtime.dimension },
        () => b * Math.random() - b * Math.random(),
      );
      const probability = runtime.clamp(
        (surrogateFitness[i] - worstFitness) / bestDenominator,
        0,
        1,
      );

      if (Math.random() > ip) {
        nextPopulation[i] = runtime.randomDecision(
          context.lowerBounds,
          context.upperBounds,
        );
        continue;
      }

      for (let j = 0; j < runtime.dimension; j += 1) {
        const randomIndex = Math.floor(Math.random() * context.settings.N);

        if (Math.random() < probability) {
          if (i === bestPopulationIndex) {
            nextPopulation[i][j] = elitePosition[j] + population[i][j] * para1[j];
          } else {
            nextPopulation[i][j] =
              elitePosition[j] +
              (elitePosition[j] - population[i][j]) * para1[j] * 2;
          }
        } else {
          let mutated = population[randomIndex][j] + para2[j] * population[i][j];
          mutated =
            0.5 * (ARF + 1) * (context.lowerBounds[j] + context.upperBounds[j]) -
            ARF * mutated;
          nextPopulation[i][j] = mutated;
        }

        nextPopulation[i][j] = runtime.clamp(
          nextPopulation[i][j],
          context.lowerBounds[j],
          context.upperBounds[j],
        );
      }
    }

    population = nextPopulation;

    if (Math.random() < 0.2 && context.feCount < context.settings.Max_FEs) {
      const levyStep = runtime.levy(runtime.dimension);
      const candidate = elitePosition.map(
        (value, index) =>
          value +
          0.01 *
            levyStep[index] *
            (context.upperBounds[index] - context.lowerBounds[index]),
      );
      const constrained = runtime.applyEngineeringConstraints(
        candidate,
        context.lowerBounds,
        context.upperBounds,
      );
      const objective = runtime.hobbingObjective(constrained, context.config);

      runtime.updateArchive(
        context.archive,
        constrained,
        objective,
        context.settings.ArchiveMaxSize,
      );

      context.feCount += 1;
      population[worstPopulationIndex] = candidate.map((value, index) =>
        runtime.clamp(value, context.lowerBounds[index], context.upperBounds[index]),
      );
      runtime.maybeReportProgress(context);
    }
  }
};

export default runMOFATA;

