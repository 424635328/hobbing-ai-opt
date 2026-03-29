import type { AlgorithmRunner } from "./runtime-types";

type RunnerModule = {
  default?: unknown;
  runAlgorithm?: unknown;
};

const VALID_ENTRY = /^[a-zA-Z0-9_-]+$/;

function resolveRunner(module: RunnerModule): AlgorithmRunner | null {
  if (typeof module.default === "function") {
    return module.default as AlgorithmRunner;
  }

  if (typeof module.runAlgorithm === "function") {
    return module.runAlgorithm as AlgorithmRunner;
  }

  return null;
}

export async function getAlgorithmRunner(
  entry: string,
): Promise<AlgorithmRunner | null> {
  const normalizedEntry = entry.trim();

  if (!VALID_ENTRY.test(normalizedEntry)) {
    return null;
  }

  try {
    // Dynamic import allows new algorithm files to be picked up
    // without editing this index file.
    const loadedModule = (await import(`./${normalizedEntry}`)) as RunnerModule;
    return resolveRunner(loadedModule);
  } catch {
    return null;
  }
}
