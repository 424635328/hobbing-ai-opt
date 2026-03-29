import type {
  AlgorithmInputSpec,
  AlgorithmOutputSpec,
} from "./algorithm-processing-types";

type StandardizationPattern = {
  matlab: RegExp;
  replacement: string;
  description: string;
  priority: number;
  autoFixable: boolean;
};

const NAMING_CONVENTION_PATTERNS: StandardizationPattern[] = [
  {
    matlab: /\bArchive_X\b/g,
    replacement: "archiveX",
    description: "将 Archive_X 重命名为 archiveX (camelCase)",
    priority: 1,
    autoFixable: true,
  },
  {
    matlab: /\bArchive_F\b/g,
    replacement: "archiveF",
    description: "将 Archive_F 重命名为 archiveF (camelCase)",
    priority: 1,
    autoFixable: true,
  },
  {
    matlab: /\bArchive_maxSize\b/g,
    replacement: "archiveMaxSize",
    description: "将 Archive_maxSize 重命名为 archiveMaxSize (camelCase)",
    priority: 1,
    autoFixable: true,
  },
  {
    matlab: /\bPop_Size\b/g,
    replacement: "populationSize",
    description: "将 Pop_Size 重命名为 populationSize (camelCase)",
    priority: 1,
    autoFixable: true,
  },
  {
    matlab: /\bMax_FEs\b/g,
    replacement: "maxFunctionEvaluations",
    description: "将 Max_FEs 重命名为 maxFunctionEvaluations (camelCase)",
    priority: 1,
    autoFixable: true,
  },
];

const COMMENT_STANDARDIZATION_PATTERNS: StandardizationPattern[] = [
  {
    matlab: /^%+\s*(.+)$/gm,
    replacement: "// $1",
    description: "将 MATLAB 注释转换为 JavaScript 风格",
    priority: 2,
    autoFixable: true,
  },
  {
    matlab: /^%\s*={3,}\s*$/gm,
    replacement: "// ========================================",
    description: "标准化章节分隔注释",
    priority: 3,
    autoFixable: true,
  },
];

const CODE_STYLE_PATTERNS: StandardizationPattern[] = [
  {
    matlab: /\s*;\s*$/gm,
    replacement: ";",
    description: "删除分号前不必要的空白",
    priority: 4,
    autoFixable: true,
  },
  {
    matlab: /\bfor\s+(\w+)\s*=\s*(\d+):(\d+)\b/g,
    replacement: "for (let $1 = $2; $1 <= $3; $1 += 1)",
    description: "标准化 for 循环语法",
    priority: 2,
    autoFixable: true,
  },
  {
    matlab: /\bif\s+([^;]+?)\s*$/gm,
    replacement: "if ($1)",
    description: "为 if 语句添加括号",
    priority: 2,
    autoFixable: true,
  },
  {
    matlab: /\bwhile\s+([^;]+?)\s*$/gm,
    replacement: "while ($1)",
    description: "为 while 语句添加括号",
    priority: 2,
    autoFixable: true,
  },
  {
    matlab: /\bend\b/g,
    replacement: "}",
    description: "将 MATLAB 'end' 替换为右大括号",
    priority: 2,
    autoFixable: true,
  },
];

const FUNCTION_SIGNATURE_PATTERNS: StandardizationPattern[] = [
  {
    matlab: /function\s*\[\s*Archive_X\s*,\s*Archive_F\s*(?:,\s*(\w+))?\s*\]\s*=\s*(\w+)\s*\(/g,
    replacement: "export function $2(",
    description: "标准化主函数签名",
    priority: 1,
    autoFixable: true,
  },
];

export interface StandardizationResult {
  success: boolean;
  standardizedCode: string;
  notes: string[];
  warnings: Array<{
    message: string;
    suggestion: string;
    severity: "low" | "medium" | "high";
    autoFixable: boolean;
  }>;
  errors: string[];
  fixesApplied: string[];
}

export function standardizeAlgorithmCode(
  matlabCode: string,
  algorithmName: string,
): StandardizationResult {
  const notes: string[] = [];
  const warnings: Array<{
    message: string;
    suggestion: string;
    severity: "low" | "medium" | "high";
    autoFixable: boolean;
  }> = [];
  const errors: string[] = [];
  const fixesApplied: string[] = [];
  let standardizedCode = matlabCode;

  const allPatterns = [
    ...FUNCTION_SIGNATURE_PATTERNS,
    ...NAMING_CONVENTION_PATTERNS,
    ...COMMENT_STANDARDIZATION_PATTERNS,
    ...CODE_STYLE_PATTERNS,
  ].sort((a, b) => a.priority - b.priority);

  for (const pattern of allPatterns) {
    const matches = [...standardizedCode.matchAll(pattern.matlab)];
    if (matches.length > 0) {
      standardizedCode = standardizedCode.replace(pattern.matlab, pattern.replacement);
      const note = `标准化: ${pattern.description} (${matches.length} 处)`;
      notes.push(note);
      if (pattern.autoFixable) {
        fixesApplied.push(note);
      }
    }
  }

  standardizedCode = addStandardHeader(standardizedCode, algorithmName);
  standardizedCode = ensureConsistentIndentation(standardizedCode);

  const validation = validateStandardizedCode(standardizedCode);
  warnings.push(...validation.warnings);
  errors.push(...validation.errors);

  return {
    success: errors.length === 0,
    standardizedCode,
    notes,
    warnings,
    errors,
    fixesApplied,
  };
}

function addStandardHeader(code: string, algorithmName: string): string {
  const header = `/**
 * ${algorithmName}
 * 
 * 自动标准化的滚齿优化算法。
 * 由算法标准化器生成。
 * 
 * @module ${algorithmName}
 */

`;
  return header + code;
}

function ensureConsistentIndentation(code: string): string {
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

function validateStandardizedCode(code: string): { 
  warnings: Array<{
    message: string;
    suggestion: string;
    severity: "low" | "medium" | "high";
    autoFixable: boolean;
  }>; 
  errors: string[]; 
} {
  const warnings: Array<{
    message: string;
    suggestion: string;
    severity: "low" | "medium" | "high";
    autoFixable: boolean;
  }> = [];
  const errors: string[] = [];

  if (!code.includes("function") && !code.includes("export")) {
    warnings.push({
      message: "未找到可导出的函数 - 可能需要手动导出",
      suggestion: "请确保算法包含一个主函数，例如：function [archiveX, archiveF] = myAlgorithm(...)",
      severity: "high",
      autoFixable: false,
    });
  }

  if (!code.includes("archiveX") && !code.includes("archiveF")) {
    warnings.push({
      message: "未检测到标准存档变量 (archiveX, archiveF)",
      suggestion: "建议使用标准的存档变量名 archiveX 和 archiveF，系统可自动修复 Archive_X/Archive_F",
      severity: "medium",
      autoFixable: true,
    });
  } else if (code.includes("Archive_X") || code.includes("Archive_F")) {
    warnings.push({
      message: "建议使用标准存档格式 (archiveX, archiveF) 以保持一致性",
      suggestion: "系统已自动将 Archive_X/Archive_F 转换为 archiveX/archiveF",
      severity: "low",
      autoFixable: true,
    });
  }

  if (!code.includes("UpdateArchive")) {
    warnings.push({
      message: "使用 UpdateArchive 函数可确保正确的帕累托存档管理",
      suggestion: "建议实现或使用标准的 UpdateArchive 函数来维护非支配解集",
      severity: "low",
      autoFixable: false,
    });
  }

  if (code.includes("eval(")) {
    warnings.push({
      message: "检测到 eval() 函数 - 这可能存在安全风险",
      suggestion: "建议避免使用 eval()，考虑使用其他更安全的替代方案",
      severity: "high",
      autoFixable: false,
    });
  }

  if (code.includes("Function(")) {
    warnings.push({
      message: "检测到 Function() 构造函数 - 这可能存在安全风险",
      suggestion: "建议避免使用 Function() 构造函数，考虑使用其他更安全的替代方案",
      severity: "high",
      autoFixable: false,
    });
  }

  return { warnings, errors };
}

export function generateStandardInputSpec(): AlgorithmInputSpec {
  return {
    parameters: [
      {
        name: "dimensions",
        type: "number",
        description: "决策变量的数量（维度）",
        required: true,
        min: 1,
        example: 4,
      },
      {
        name: "objectives",
        type: "number",
        description: "目标函数的数量",
        required: true,
        min: 1,
        example: 3,
      },
      {
        name: "lowerBounds",
        type: "array",
        description: "每个决策变量的下界",
        required: true,
        example: [0.5, 10, 100, 0.01],
      },
      {
        name: "upperBounds",
        type: "array",
        description: "每个决策变量的上界",
        required: true,
        example: [8, 100, 500, 0.1],
      },
      {
        name: "maxFunctionEvaluations",
        type: "number",
        description: "最大函数评估次数",
        required: true,
        min: 100,
        example: 10000,
      },
      {
        name: "populationSize",
        type: "number",
        description: "种群规模",
        required: true,
        min: 5,
        example: 50,
      },
      {
        name: "archiveMaxSize",
        type: "number",
        description: "帕累托存档的最大规模",
        required: true,
        min: 1,
        example: 100,
      },
    ],
  };
}

export function generateStandardOutputSpec(): AlgorithmOutputSpec {
  return {
    fields: [
      {
        name: "archiveX",
        type: "array",
        description: "帕累托最优决策向量（解）",
        format: "二维数字数组",
      },
      {
        name: "archiveF",
        type: "array",
        description: "帕累托最优解的目标函数值",
        format: "二维数字数组",
      },
    ],
    errorHandling: {
      commonErrors: [
        {
          code: "INVALID_BOUNDS",
          message: "无效的边界配置",
          description: "所有维度的下界必须小于上界",
          recoverySuggestion: "检查并更正边界配置",
        },
        {
          code: "POPULATION_SIZE_ERROR",
          message: "种群规模过小",
          description: "种群规模必须至少为 5",
          recoverySuggestion: "增加种群规模参数",
        },
        {
          code: "MAX_EVALUATIONS_ERROR",
          message: "最大评估次数过低",
          description: "最大函数评估次数必须至少为 100",
          recoverySuggestion: "增加 maxFunctionEvaluations 参数",
        },
      ],
      retryStrategy: {
        maxRetries: 3,
        retryDelay: 1000,
        backoffMultiplier: 2,
      },
    },
  };
}
