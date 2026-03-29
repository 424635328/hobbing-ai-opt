import { identifyAlgorithm } from "./algorithm-identification";
import { convertMatlabToTypescript } from "./algorithm-code-converter";
import { 
  standardizeAlgorithmCode, 
  generateStandardInputSpec, 
  generateStandardOutputSpec 
} from "./algorithm-standardizer";
import {
  standardizeCodeWithAI,
  generateCodeDiff,
  type AICodeStandardizationResult,
} from "./ai-code-analyzer";
import type {
  ProcessedAlgorithm,
  UploadAlgorithmRequest,
  UploadAlgorithmResponse,
  AlgorithmMetadata,
} from "./algorithm-processing-types";

const inMemoryStorage: Map<string, ProcessedAlgorithm> = new Map();

function generateId(): string {
  return `alg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function sanitizeAlgorithmName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function processUploadedAlgorithm(
  request: UploadAlgorithmRequest,
): Promise<UploadAlgorithmResponse & { 
  aiStandardizationResult?: AICodeStandardizationResult;
  codeDiff?: ReturnType<typeof generateCodeDiff>;
}> {
  const warnings: string[] = [];

  if (!request.fileContent || request.fileContent.trim().length === 0) {
    return {
      success: false,
      error: "File content is empty",
      warnings: ["Please provide a valid algorithm file"],
    };
  }

  const identificationResult = identifyAlgorithm(
    request.fileName,
    request.fileContent,
    request.suggestedName,
  );

  warnings.push(...identificationResult.suggestions);

  const algorithmName = sanitizeAlgorithmName(
    identificationResult.name || "Custom Algorithm",
  );

  const aiStandardizationResult = await standardizeCodeWithAI(
    request.fileContent,
    "matlab",
    true,
  );

  warnings.push(
    ...aiStandardizationResult.analysis.issues.map(
      (w) => `[${w.severity.toUpperCase()}] ${w.message} - ${w.suggestion}`,
    ),
  );

  warnings.push(...aiStandardizationResult.report.improvements.map((i) => `✓ ${i}`));
  warnings.push(...aiStandardizationResult.report.warnings.map((w) => `⚠️ ${w}`));

  const standardizationResult = standardizeAlgorithmCode(
    aiStandardizationResult.standardizedCode,
    algorithmName,
  );

  warnings.push(
    ...standardizationResult.warnings.map((w) => `${w.message} - ${w.suggestion}`),
  );

  const conversionResult = convertMatlabToTypescript(
    standardizationResult.standardizedCode,
    algorithmName,
  );

  warnings.push(...conversionResult.validation.warnings);

  if (!conversionResult.validation.success) {
    return {
      success: false,
      error: "Code conversion failed",
      warnings: [...warnings, ...conversionResult.validation.errors],
    };
  }

  const algorithmId = generateId();
  const now = new Date().toISOString();

  const inputSpec = generateStandardInputSpec();
  const outputSpec = generateStandardOutputSpec();

  const codeDiff = generateCodeDiff(
    request.fileContent,
    aiStandardizationResult.standardizedCode,
  );

  const processedAlgorithm: ProcessedAlgorithm = {
    metadata: {
      id: algorithmId,
      name: algorithmName,
      description: `Uploaded and standardized algorithm from ${request.fileName}. AI-assisted standardization applied. ${aiStandardizationResult.report.changesMade} changes made.`,
      source: "uploaded",
      version: "1.0.0",
      createdAt: now,
      updatedAt: now,
      inputSpec,
      outputSpec,
      tags: [
        ...identificationResult.identifiedFeatures,
        "standardized",
        "ai-assisted",
        "ready-to-integrate"
      ],
      standardizationStatus: aiStandardizationResult.requiresReview ? "pending_review" : "completed",
      isIntegrated: true,
    },
    code: conversionResult.code,
    originalCode: request.fileContent,
    standardizedCode: aiStandardizationResult.standardizedCode,
    conversionNotes: conversionResult.notes,
    standardizationNotes: [
      ...standardizationResult.notes,
      ...aiStandardizationResult.suggestions.map(s => `${s.description} (confidence: ${(s.confidence * 100).toFixed(0)}%)`),
    ],
    validationResult: {
      ...conversionResult.validation,
      warnings: [
        ...conversionResult.validation.warnings,
        ...standardizationResult.warnings.map((w) => `${w.message} - ${w.suggestion}`),
      ],
    },
  };

  inMemoryStorage.set(algorithmId, processedAlgorithm);

  return {
    success: true,
    processedAlgorithm,
    warnings,
    aiStandardizationResult,
    codeDiff,
  };
}

export async function deleteAlgorithm(id: string): Promise<boolean> {
  if (!inMemoryStorage.has(id)) {
    return false;
  }
  inMemoryStorage.delete(id);
  return true;
}

export async function listAlgorithms(): Promise<AlgorithmMetadata[]> {
  return Array.from(inMemoryStorage.values()).map((alg) => alg.metadata);
}

export async function getAlgorithm(id: string): Promise<ProcessedAlgorithm | null> {
  return inMemoryStorage.get(id) || null;
}
