import type { AlgorithmMetadata } from "./dynamic-algorithm-types";

export interface CodeQualityIssue {
  type: "error" | "warning" | "suggestion";
  line?: number;
  message: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface CodeFormattingResult {
  success: boolean;
  formattedCode?: string;
  issues: CodeQualityIssue[];
  suggestions: string[];
}

const CODE_QUALITY_RULES = [
  {
    pattern: /eval\s*\(/g,
    message: "eval() is not allowed for security reasons",
    type: "error" as const,
    severity: "critical" as const,
  },
  {
    pattern: /Function\s*\(/g,
    message: "Function constructor is not allowed",
    type: "error" as const,
    severity: "critical" as const,
  },
  {
    pattern: /with\s*\(/g,
    message: "with statement is not recommended",
    type: "warning" as const,
    severity: "high" as const,
  },
  {
    pattern: /debugger/g,
    message: "debugger statement should be removed",
    type: "warning" as const,
    severity: "medium" as const,
  },
  {
    pattern: /console\.(log|warn|error|info)/g,
    message: "Console statements should be removed in production",
    type: "suggestion" as const,
    severity: "low" as const,
  },
];

const NAMING_CONVENTION_RULES = [
  {
    pattern: /\bArchive_X\b/g,
    message: "Use camelCase: archiveX instead of Archive_X",
    type: "suggestion" as const,
    severity: "low" as const,
    suggestion: "archiveX",
  },
  {
    pattern: /\bArchive_F\b/g,
    message: "Use camelCase: archiveF instead of Archive_F",
    type: "suggestion" as const,
    severity: "low" as const,
    suggestion: "archiveF",
  },
  {
    pattern: /\b[A-Z][a-zA-Z0-9_]*_\w+\b/g,
    message: "Consider using camelCase naming convention",
    type: "suggestion" as const,
    severity: "low" as const,
  },
];

export class AlgorithmCodeQualityChecker {
  checkCodeQuality(code: string): CodeQualityIssue[] {
    const issues: CodeQualityIssue[] = [];

    for (const rule of CODE_QUALITY_RULES) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);

      while ((match = regex.exec(code)) !== null) {
        const lineNumber = this.getLineNumber(code, match.index);
        issues.push({
          type: rule.type,
          line: lineNumber,
          message: rule.message,
          severity: rule.severity,
        });
      }
    }

    return issues;
  }

  checkNamingConventions(code: string): CodeQualityIssue[] {
    const issues: CodeQualityIssue[] = [];

    for (const rule of NAMING_CONVENTION_RULES) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);

      while ((match = regex.exec(code)) !== null) {
        const lineNumber = this.getLineNumber(code, match.index);
        issues.push({
          type: rule.type,
          line: lineNumber,
          message: rule.message,
          severity: rule.severity,
        });
      }
    }

    return issues;
  }

  formatCode(code: string): string {
    let formatted = code;

    formatted = formatted.replace(/\bArchive_X\b/g, "archiveX");
    formatted = formatted.replace(/\bArchive_F\b/g, "archiveF");
    formatted = formatted.replace(/\bArchive_maxSize\b/g, "archiveMaxSize");
    formatted = formatted.replace(/\bPop_Size\b/g, "populationSize");
    formatted = formatted.replace(/\bMax_FEs\b/g, "maxFunctionEvaluations");

    formatted = formatted.replace(/\s*;\s*$/gm, ";");
    formatted = formatted.replace(/\bfunction\s+(\w+)\s*\(/g, "function $1(");

    formatted = formatted.replace(/^%+\s*(.+)$/gm, "// $1");

    formatted = this.fixIndentation(formatted);

    return formatted;
  }

  validateAlgorithmInterface(
    code: string,
    metadata: Partial<AlgorithmMetadata>,
  ): { valid: boolean; issues: CodeQualityIssue[]; suggestions: string[] } {
    const issues: CodeQualityIssue[] = [];
    const suggestions: string[] = [];

    const hasArchiveX = code.includes("archiveX") || code.includes("Archive_X");
    const hasArchiveF = code.includes("archiveF") || code.includes("Archive_F");

    if (!hasArchiveX) {
      issues.push({
        type: "warning",
        message: "archiveX not found - algorithm may not return Pareto solutions",
        severity: "high",
      });
    }

    if (!hasArchiveF) {
      issues.push({
        type: "warning",
        message: "archiveF not found - algorithm may not return objective values",
        severity: "high",
      });
    }

    const hasFunction = code.includes("function") || code.includes("=>");
    if (!hasFunction) {
      issues.push({
        type: "error",
        message: "No function definition found",
        severity: "critical",
      });
    }

    if (!metadata.inputSpec || metadata.inputSpec.parameters.length === 0) {
      suggestions.push("Consider adding input parameter specifications");
    }

    if (!metadata.outputSpec || metadata.outputSpec.fields.length === 0) {
      suggestions.push("Consider adding output field specifications");
    }

    return {
      valid: issues.every((i) => i.type !== "error"),
      issues,
      suggestions,
    };
  }

  analyzeAndFormat(code: string, metadata?: Partial<AlgorithmMetadata>): CodeFormattingResult {
    const qualityIssues = this.checkCodeQuality(code);
    const namingIssues = this.checkNamingConventions(code);
    const allIssues = [...qualityIssues, ...namingIssues];

    const validation = metadata
      ? this.validateAlgorithmInterface(code, metadata)
      : { valid: true, issues: [], suggestions: [] };

    allIssues.push(...validation.issues);

    const formattedCode = this.formatCode(code);

    const suggestions = [
      ...validation.suggestions,
      "Ensure the algorithm returns archiveX and archiveF",
      "Follow camelCase naming conventions",
      "Add appropriate error handling",
    ];

    return {
      success: allIssues.every((i) => i.severity !== "critical"),
      formattedCode,
      issues: allIssues,
      suggestions,
    };
  }

  private getLineNumber(code: string, index: number): number {
    return code.substring(0, index).split("\n").length;
  }

  private fixIndentation(code: string): string {
    const lines = code.split("\n");
    let indentLevel = 0;
    const indentSize = 2;
    const processedLines: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith("}") || trimmedLine.startsWith("]") || trimmedLine.startsWith(")")) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      if (trimmedLine) {
        const indent = " ".repeat(indentLevel * indentSize);
        processedLines.push(indent + trimmedLine);
      } else {
        processedLines.push("");
      }

      if (trimmedLine.endsWith("{") || trimmedLine.endsWith("[") || trimmedLine.endsWith("(")) {
        if (!trimmedLine.startsWith("}") && !trimmedLine.startsWith("]") && !trimmedLine.startsWith(")")) {
          indentLevel += 1;
        }
      }
    }

    return processedLines.join("\n");
  }
}

let qualityCheckerInstance: AlgorithmCodeQualityChecker | null = null;

export function getCodeQualityChecker(): AlgorithmCodeQualityChecker {
  if (!qualityCheckerInstance) {
    qualityCheckerInstance = new AlgorithmCodeQualityChecker();
  }
  return qualityCheckerInstance;
}
