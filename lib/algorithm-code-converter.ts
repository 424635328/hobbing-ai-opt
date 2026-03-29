import type { AlgorithmValidationResult } from "./algorithm-processing-types";

type ConversionPattern = {
  matlab: RegExp;
  typescript: string;
  description: string;
};

const BASIC_CONVERSION_PATTERNS: ConversionPattern[] = [
  {
    matlab: /function\s*\[\s*Archive_X\s*,\s*Archive_F\s*(?:,\s*(\w+))?\s*\]\s*=\s*(\w+)\s*\(/g,
    typescript: "export function $2(",
    description: "Convert main function signature",
  },
  {
    matlab: /(\w+)\s*=\s*zeros\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/g,
    typescript: "const $1: number[][] = Array.from({ length: $2 }, () => Array($3).fill(0))",
    description: "Convert zeros initialization",
  },
  {
    matlab: /(\w+)\s*=\s*ones\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*\*\s*(\w+)/g,
    typescript: "const $1: number[][] = Array.from({ length: $2 }, () => Array($3).fill($4))",
    description: "Convert ones initialization with value",
  },
  {
    matlab: /for\s+(\w+)\s*=\s*(\d+):(\d+)/g,
    typescript: "for (let $1 = $2; $1 <= $3; $1 += 1)",
    description: "Convert for loops",
  },
  {
    matlab: /while\s+([^;]+)/g,
    typescript: "while ($1)",
    description: "Convert while loops",
  },
  {
    matlab: /if\s+([^;]+)/g,
    typescript: "if ($1)",
    description: "Convert if statements",
  },
  {
    matlab: /elseif\s+([^;]+)/g,
    typescript: "} else if ($1)",
    description: "Convert elseif statements",
  },
  {
    matlab: /\bend\b/g,
    typescript: "}",
    description: "Convert end statements",
  },
  {
    matlab: /%+(.*)/g,
    typescript: "//$1",
    description: "Convert comments",
  },
  {
    matlab: /(\w+)\((\w+),\s*:\)/g,
    typescript: "$1[$2]",
    description: "Convert array indexing",
  },
  {
    matlab: /(\w+)\(:,\s*(\w+)\)/g,
    typescript: "$1.map(row => row[$2])",
    description: "Convert column indexing",
  },
  {
    matlab: /(\w+)\((\w+),\s*(\w+)\)/g,
    typescript: "$1[$2][$3]",
    description: "Convert 2D array indexing",
  },
  {
    matlab: /(\w+)\s*=\s*(\w+)\s*\^\s*(\w+)/g,
    typescript: "$1 = $2 ** $3",
    description: "Convert exponentiation",
  },
  {
    matlab: /(\w+)\s*=\s*rand\s*\(\s*1\s*,\s*(\w+)\s*\)/g,
    typescript: "const $1: number[] = Array.from({ length: $2 }, () => Math.random())",
    description: "Convert rand(1, n)",
  },
  {
    matlab: /(\w+)\s*=\s*rand\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/g,
    typescript: "const $1: number[][] = Array.from({ length: $2 }, () => Array($3).fill(0).map(() => Math.random()))",
    description: "Convert rand(m, n)",
  },
  {
    matlab: /min\s*\(\s*max\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*,\s*([^)]+)\s*\)/g,
    typescript: "Math.min(Math.max($1, $2), $3)",
    description: "Convert min(max(...))",
  },
  {
    matlab: /\./g,
    typescript: "",
    description: "Remove element-wise operator dots",
  },
];

function generateWorkerWrapper(
  algorithmName: string,
  convertedCode: string,
): string {
  return `/// <reference lib="webworker" />

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

function cloneDecisionVector(x: DecisionVector): DecisionVector {
  return [...x];
}

function updateArchive(
  archive: ArchiveState,
  newPositions: DecisionVector[],
  newObjectives: ObjectiveVector[],
): ArchiveState {
  const newArchiveX = [...archive.archiveX];
  const newArchiveF = [...archive.archiveF];

  for (let i = 0; i < newPositions.length; i += 1) {
    const x = newPositions[i];
    const f = newObjectives[i];

    if (isPenaltySolution(f)) {
      continue;
    }

    let dominated = false;
    const toRemove: number[] = [];

    for (let j = 0; j < newArchiveX.length; j += 1) {
      if (dominates(newArchiveF[j], f)) {
        dominated = true;
        break;
      }
      if (dominates(f, newArchiveF[j])) {
        toRemove.push(j);
      }
    }

    if (!dominated) {
      for (let j = toRemove.length - 1; j >= 0; j -= 1) {
        newArchiveX.splice(toRemove[j], 1);
        newArchiveF.splice(toRemove[j], 1);
      }
      newArchiveX.push(cloneDecisionVector(x));
      newArchiveF.push([...f]);
    }
  }

  return { archiveX: newArchiveX, archiveF: newArchiveF };
}

function reportProgress(context: OptimizationContext): void {
  const message: OptimizationWorkerProgressMessage = {
    type: "progress",
    jobId: context.jobId,
    progress: Math.min(100, (context.feCount / context.settings.Max_FEs) * 100),
    feCount: context.feCount,
    archiveSize: context.archive.archiveX.length,
    currentPF: context.archive.archiveF.slice(0, 200),
    elapsedMs: Date.now() - context.startTime,
  };
  scope.postMessage(message);
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

${convertedCode}

function runOptimization(context: OptimizationContext): void {
  const { config, settings, lowerBounds, upperBounds } = context;
  const { N, Max_FEs, ArchiveMaxSize } = settings;

  try {
    const result = ${algorithmName}(
      DIMENSION,
      3,
      lowerBounds,
      upperBounds,
      Max_FEs,
      N,
      ArchiveMaxSize
    );

    const finalArchiveX = result[0] || [];
    const finalArchiveF = result[1] || [];

    const validX: DecisionVector[] = [];
    const validF: ObjectiveVector[] = [];

    for (let i = 0; i < finalArchiveX.length; i += 1) {
      if (!isPenaltySolution(finalArchiveF[i])) {
        validX.push(finalArchiveX[i]);
        validF.push(finalArchiveF[i]);
      }
    }

    const message: OptimizationWorkerDoneMessage = {
      type: "done",
      jobId: context.jobId,
      algorithm: context.algorithm,
      finalPF: validF,
      finalPS: validX,
      stats: {
        feCount: context.feCount,
        archiveSize: validX.length,
        elapsedMs: Date.now() - context.startTime,
      },
    };
    scope.postMessage(message);
  } catch (error) {
    const message: OptimizationWorkerErrorMessage = {
      type: "error",
      jobId: context.jobId,
      error: error instanceof Error ? error.message : String(error),
    };
    scope.postMessage(message);
  }
}

scope.onmessage = (event: MessageEvent<OptimizationWorkerCommand>) => {
  const command = event.data;

  if (command.type === "start") {
    const config = command.config;
    const settings = OPTIMIZATION_PROFILES[command.profile];
    const lowerBounds = [
      config.limits.moduleMin,
      config.limits.teethMin,
      config.limits.axialSpeedMin,
      config.limits.feedPerStrokeMin,
    ];
    const upperBounds = [
      config.limits.moduleMax,
      config.limits.teethMax,
      config.limits.axialSpeedMax,
      config.limits.feedPerStrokeMax,
    ];

    const context: OptimizationContext = {
      jobId: command.jobId,
      algorithm: command.algorithm,
      config,
      settings,
      lowerBounds,
      upperBounds,
      archive: { archiveX: [], archiveF: [] },
      startTime: Date.now(),
      feCount: 0,
      lastReport: 0,
    };

    const startedMessage: OptimizationWorkerStartedMessage = {
      type: "start",
      jobId: command.jobId,
      profile: command.profile,
      algorithm: command.algorithm,
      settings,
    };
    scope.postMessage(startedMessage);

    runOptimization(context);
  }
};
`;
}

function validateConvertedCode(code: string): AlgorithmValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!code.includes("function")) {
    warnings.push("No function definition found");
  }

  if (!code.includes("Archive") && !code.includes("archive")) {
    warnings.push("Archive storage not detected - may need manual integration");
  }

  if (code.includes("eval(")) {
    errors.push("eval() is not allowed for security reasons");
  }

  if (code.includes("require(") || code.includes("import ")) {
    warnings.push("Module imports may need adjustment");
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
}

export function convertMatlabToTypescript(
  matlabCode: string,
  algorithmName: string,
): {
  code: string;
  validation: AlgorithmValidationResult;
  notes: string[];
} {
  const notes: string[] = [];
  let convertedCode = matlabCode;

  for (const pattern of BASIC_CONVERSION_PATTERNS) {
    const matches = [...convertedCode.matchAll(pattern.matlab)];
    if (matches.length > 0) {
      convertedCode = convertedCode.replace(pattern.matlab, pattern.typescript);
      notes.push(`Applied: ${pattern.description}`);
    }
  }

  const sanitizedName = algorithmName.replace(/[^a-zA-Z0-9_]/g, "_");

  const validation = validateConvertedCode(convertedCode);
  const wrappedCode = generateWorkerWrapper(sanitizedName, convertedCode);

  return {
    code: wrappedCode,
    validation,
    notes,
  };
}
