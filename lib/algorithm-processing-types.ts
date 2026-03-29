

export type AlgorithmSource = "builtin" | "uploaded";
export type StandardizationStatus = "pending" | "in_progress" | "completed" | "failed" | "pending_review";

export interface AlgorithmMetadata {
  id: string;
  name: string;
  description: string;
  source: AlgorithmSource;
  version: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
  inputSpec?: AlgorithmInputSpec;
  outputSpec?: AlgorithmOutputSpec;
  tags?: string[];
  standardizationStatus?: StandardizationStatus;
  isIntegrated?: boolean;
}

export interface AlgorithmInputSpec {
  parameters: AlgorithmParameter[];
}

export interface AlgorithmParameter {
  name: string;
  type: "number" | "string" | "boolean" | "array" | "object";
  defaultValue?: unknown;
  description?: string;
  required?: boolean;
  min?: number;
  max?: number;
  enum?: string[];
  example?: unknown;
}

export interface AlgorithmOutputSpec {
  fields: AlgorithmOutputField[];
  errorHandling?: ErrorHandlingSpec;
}

export interface AlgorithmOutputField {
  name: string;
  type: "number" | "string" | "array" | "object";
  description?: string;
  format?: string;
}

export interface ErrorHandlingSpec {
  commonErrors: CommonError[];
  retryStrategy?: RetryStrategy;
}

export interface CommonError {
  code: string;
  message: string;
  description: string;
  recoverySuggestion?: string;
}

export interface RetryStrategy {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
}

export interface ProcessedAlgorithm {
  metadata: AlgorithmMetadata;
  code: string;
  originalCode: string;
  standardizedCode?: string;
  conversionNotes: string[];
  standardizationNotes?: string[];
  validationResult: AlgorithmValidationResult;
}

export interface AlgorithmValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  testResult?: AlgorithmTestResult;
}

export interface AlgorithmTestResult {
  passed: boolean;
  executionTime?: number;
  outputPreview?: unknown;
  error?: string;
}

export interface AlgorithmIdentificationResult {
  success: boolean;
  name?: string;
  confidence: number;
  identifiedFeatures: string[];
  suggestions: string[];
}

export interface UploadAlgorithmRequest {
  fileName: string;
  fileContent: string;
  suggestedName?: string;
}

export interface UploadAlgorithmResponse {
  success: boolean;
  processedAlgorithm?: ProcessedAlgorithm;
  error?: string;
  warnings?: string[];
}

export interface AlgorithmStorage {
  save(algorithm: ProcessedAlgorithm): Promise<void>;
  load(id: string): Promise<ProcessedAlgorithm | null>;
  list(): Promise<AlgorithmMetadata[]>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}
