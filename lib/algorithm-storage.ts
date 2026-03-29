import type {
  AlgorithmMetadata,
  ProcessedAlgorithm,
  AlgorithmStorage as IAlgorithmStorage,
} from "./algorithm-processing-types";

const STORAGE_KEY = "hobbing_uploaded_algorithms";
const CODE_STORAGE_PREFIX = "hobbing_algorithm_code_";

function generateId(): string {
  return `alg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export class AlgorithmStorage implements IAlgorithmStorage {
  private inMemoryCache: Map<string, ProcessedAlgorithm> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const metadataList = JSON.parse(stored) as AlgorithmMetadata[];
        for (const metadata of metadataList) {
          const code = localStorage.getItem(`${CODE_STORAGE_PREFIX}${metadata.id}`);
          const originalCode = localStorage.getItem(
            `${CODE_STORAGE_PREFIX}${metadata.id}_original`,
          );
          const conversionNotes = localStorage.getItem(
            `${CODE_STORAGE_PREFIX}${metadata.id}_notes`,
          );
          const validationStr = localStorage.getItem(
            `${CODE_STORAGE_PREFIX}${metadata.id}_validation`,
          );

          if (code && originalCode) {
            this.inMemoryCache.set(metadata.id, {
              metadata,
              code,
              originalCode,
              conversionNotes: conversionNotes ? JSON.parse(conversionNotes) : [],
              validationResult: validationStr
                ? JSON.parse(validationStr)
                : { success: true, errors: [], warnings: [] },
            });
          }
        }
      }
    } catch (error) {
      console.error("Failed to load algorithms from storage:", error);
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const metadataList = Array.from(this.inMemoryCache.values()).map(
        (alg) => alg.metadata,
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(metadataList));

      for (const [id, algorithm] of this.inMemoryCache) {
        localStorage.setItem(`${CODE_STORAGE_PREFIX}${id}`, algorithm.code);
        localStorage.setItem(`${CODE_STORAGE_PREFIX}${id}_original`, algorithm.originalCode);
        localStorage.setItem(
          `${CODE_STORAGE_PREFIX}${id}_notes`,
          JSON.stringify(algorithm.conversionNotes),
        );
        localStorage.setItem(
          `${CODE_STORAGE_PREFIX}${id}_validation`,
          JSON.stringify(algorithm.validationResult),
        );
      }
    } catch (error) {
      console.error("Failed to save algorithms to storage:", error);
    }
  }

  async save(algorithm: ProcessedAlgorithm): Promise<void> {
    this.inMemoryCache.set(algorithm.metadata.id, algorithm);
    this.saveToStorage();
  }

  async load(id: string): Promise<ProcessedAlgorithm | null> {
    return this.inMemoryCache.get(id) || null;
  }

  async list(): Promise<AlgorithmMetadata[]> {
    return Array.from(this.inMemoryCache.values()).map((alg) => alg.metadata);
  }

  async delete(id: string): Promise<void> {
    this.inMemoryCache.delete(id);

    if (typeof window !== "undefined") {
      localStorage.removeItem(`${CODE_STORAGE_PREFIX}${id}`);
      localStorage.removeItem(`${CODE_STORAGE_PREFIX}${id}_original`);
      localStorage.removeItem(`${CODE_STORAGE_PREFIX}${id}_notes`);
      localStorage.removeItem(`${CODE_STORAGE_PREFIX}${id}_validation`);
    }

    this.saveToStorage();
  }

  async exists(id: string): Promise<boolean> {
    return this.inMemoryCache.has(id);
  }

  clearAll(): void {
    this.inMemoryCache.clear();
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CODE_STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    }
  }
}

let storageInstance: AlgorithmStorage | null = null;

export function getAlgorithmStorage(): AlgorithmStorage {
  if (!storageInstance) {
    storageInstance = new AlgorithmStorage();
  }
  return storageInstance;
}

export function generateAlgorithmId(): string {
  return generateId();
}
