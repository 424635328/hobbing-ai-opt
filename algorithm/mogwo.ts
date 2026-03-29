import type { AlgorithmRunner } from "./runtime-types";

const runMOGWO: AlgorithmRunner = (context, runtime) => {
  const greyWolves = runtime.initializationPWLCM(
    context.settings.N,
    runtime.dimension,
    context.upperBounds,
    context.lowerBounds,
  );

  while (context.feCount < context.settings.Max_FEs) {
    const evaluation = runtime.evaluatePopulation(greyWolves, context);
    runtime.maybeReportProgress(context);

    if (
      context.feCount >= context.settings.Max_FEs ||
      evaluation.positions.length === 0
    ) {
      break;
    }

    const a = 2 - context.feCount * (2 / context.settings.Max_FEs);
    const [alphaPos, betaPos, deltaPos] = runtime.chooseArchiveLeaders(
      context.archive,
      evaluation.positions,
      evaluation.objectives,
      context.lowerBounds,
      context.upperBounds,
    );

    for (let i = 0; i < context.settings.N; i += 1) {
      for (let j = 0; j < runtime.dimension; j += 1) {
        let r1 = Math.random();
        let r2 = Math.random();
        const A1 = 2 * a * r1 - a;
        const C1 = 2 * r2;
        const dAlpha = Math.abs(C1 * alphaPos[j] - greyWolves[i][j]);
        const x1 = alphaPos[j] - A1 * dAlpha;

        r1 = Math.random();
        r2 = Math.random();
        const A2 = 2 * a * r1 - a;
        const C2 = 2 * r2;
        const dBeta = Math.abs(C2 * betaPos[j] - greyWolves[i][j]);
        const x2 = betaPos[j] - A2 * dBeta;

        r1 = Math.random();
        r2 = Math.random();
        const A3 = 2 * a * r1 - a;
        const C3 = 2 * r2;
        const dDelta = Math.abs(C3 * deltaPos[j] - greyWolves[i][j]);
        const x3 = deltaPos[j] - A3 * dDelta;

        greyWolves[i][j] = runtime.clamp(
          (x1 + x2 + x3) / 3,
          context.lowerBounds[j],
          context.upperBounds[j],
        );
      }
    }
  }
};

export default runMOGWO;

