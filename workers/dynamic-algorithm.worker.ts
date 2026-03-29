/// <reference lib="webworker" />

import {
  hobbingObjective,
  type DecisionVector,
  type ModelConfig,
  type ObjectiveVector,
} from "@/lib/hobbing-model";
import {
  OPTIMIZATION_PROFILES,
  type OptimizationProfile,
  type OptimizationStats,
  type OptimizationWorkerCommand,
  type OptimizationWorkerEvent,
} from "@/lib/optimization-types";

const scope = self as DedicatedWorkerGlobalScope;

// 内置算法 - 简单的随机搜索作为示例
function builtinRandomSearch(
  config: ModelConfig,
  profile: OptimizationProfile,
  callback: (
    feCount: number,
    archiveSize: number,
    currentPF: ObjectiveVector[],
    progress: number,
  ) => void,
): {
  finalPF: ObjectiveVector[];
  finalPS: DecisionVector[];
  stats: OptimizationStats;
} {
  const startTime = performance.now();
  const evaluate = (x: DecisionVector) => hobbingObjective(x, config);

  const Max_FEs = 3000;

  const archivePS: DecisionVector[] = [];
  const archivePF: ObjectiveVector[] = [];

  function dominates(a: ObjectiveVector, b: ObjectiveVector): boolean {
    let at_least_one_better = false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] > b[i]) return false;
      if (a[i] < b[i]) at_least_one_better = true;
    }
    return at_least_one_better;
  }

  function addToArchive(x: DecisionVector, f: ObjectiveVector): void {
    const dominatedIndices: number[] = [];
    let isDominated = false;

    for (let i = 0; i < archivePF.length; i++) {
      if (dominates(archivePF[i], f)) {
        isDominated = true;
        break;
      }
      if (dominates(f, archivePF[i])) {
        dominatedIndices.push(i);
      }
    }

    if (!isDominated) {
      for (let i = dominatedIndices.length - 1; i >= 0; i--) {
        archivePS.splice(dominatedIndices[i], 1);
        archivePF.splice(dominatedIndices[i], 1);
      }
      archivePS.push(x);
      archivePF.push(f);
    }
  }

  for (let fe = 0; fe < Max_FEs; fe++) {
    const x: DecisionVector = [
      config.bounds.lb[0] + Math.random() * (config.bounds.ub[0] - config.bounds.lb[0]),
      config.bounds.lb[1] + Math.random() * (config.bounds.ub[1] - config.bounds.lb[1]),
      config.bounds.lb[2] + Math.random() * (config.bounds.ub[2] - config.bounds.lb[2]),
      config.bounds.lb[3] + Math.random() * (config.bounds.ub[3] - config.bounds.lb[3]),
    ];

    const f = evaluate(x);
    addToArchive(x, f);

    if (fe % 30 === 0 || fe === Max_FEs - 1) {
      const progress = ((fe + 1) / Max_FEs) * 100;
      callback(fe + 1, archivePF.length, archivePF, progress);
    }
  }

  const endTime = performance.now();

  return {
    finalPF: archivePF,
    finalPS: archivePS,
    stats: {
      feCount: Max_FEs,
      archiveSize: archivePF.length,
      elapsedMs: endTime - startTime,
    },
  };
}

// Worker 消息处理
scope.onmessage = (event: MessageEvent<OptimizationWorkerCommand>) => {
  const data = event.data;

  if (data.type === "start") {
    const jobId = data.jobId;
    const profileSettings = OPTIMIZATION_PROFILES[data.profile];

    scope.postMessage({
      type: "start",
      jobId,
      profile: data.profile,
      algorithm: "dynamic",
      settings: profileSettings,
    } satisfies OptimizationWorkerEvent);

    try {
      const result = builtinRandomSearch(
        data.config,
        data.profile,
        (feCount, archiveSize, currentPF, progress) => {
          scope.postMessage({
            type: "progress",
            jobId,
            feCount,
            archiveSize,
            currentPF,
            progress,
            elapsedMs: performance.now(),
          } satisfies OptimizationWorkerEvent);
        },
      );

      scope.postMessage({
        type: "done",
        jobId,
        algorithm: "dynamic",
        finalPF: result.finalPF,
        finalPS: result.finalPS,
        stats: result.stats,
      } satisfies OptimizationWorkerEvent);
    } catch (error) {
      scope.postMessage({
        type: "error",
        jobId,
        error: error instanceof Error ? error.message : String(error),
      } satisfies OptimizationWorkerEvent);
    }
  }
};
