import { createDeepSeekClient, getDeepSeekApiKey } from "./deepseek";

export type CodeIssueType = 
  | "formatting"
  | "naming"
  | "structure"
  | "performance"
  | "readability"
  | "best_practice"
  | "security";

export type CodeIssueSeverity = "low" | "medium" | "high" | "critical";

export interface CodeIssue {
  type: CodeIssueType;
  severity: CodeIssueSeverity;
  line: number;
  column: number;
  message: string;
  suggestion: string;
  autoFixable: boolean;
  originalCode?: string;
  suggestedCode?: string;
}

export interface CodeAnalysisResult {
  issues: CodeIssue[];
  summary: {
    totalIssues: number;
    bySeverity: Record<CodeIssueSeverity, number>;
    byType: Record<CodeIssueType, number>;
  };
  codeMetrics: {
    linesOfCode: number;
    commentRatio: number;
    complexityEstimate: number;
  };
}

export interface StandardizationSuggestion {
  type: "replace" | "insert" | "delete" | "reformat";
  description: string;
  original: string;
  standardized: string;
  lineStart: number;
  lineEnd: number;
  confidence: number;
}

export interface AICodeStandardizationResult {
  success: boolean;
  originalCode: string;
  standardizedCode: string;
  suggestions: StandardizationSuggestion[];
  analysis: CodeAnalysisResult;
  report: {
    changesMade: number;
    issuesFixed: number;
    improvements: string[];
    warnings: string[];
  };
  requiresReview: boolean;
}

export async function analyzeCodeWithAI(
  code: string,
  language: "matlab" | "typescript" = "matlab"
): Promise<CodeAnalysisResult> {
  const apiKey = getDeepSeekApiKey();

  if (!apiKey) {
    return performFallbackAnalysis(code, language);
  }

  try {
    const client = createDeepSeekClient(apiKey);
    const prompt = buildAnalysisPrompt(code, language);

    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "你是专业的代码质量分析专家。分析代码并返回JSON格式的分析结果。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      let cleanContent = content.trim();
      
      // 尝试多种方式清理和提取JSON
      // 方式1: 移除Markdown代码块
      if (cleanContent.includes('```json')) {
        const start = cleanContent.indexOf('```json') + 7;
        const end = cleanContent.lastIndexOf('```');
        if (end > start) {
          cleanContent = cleanContent.substring(start, end).trim();
        }
      } else if (cleanContent.includes('```')) {
        const start = cleanContent.indexOf('```') + 3;
        const end = cleanContent.lastIndexOf('```');
        if (end > start) {
          cleanContent = cleanContent.substring(start, end).trim();
        }
      }
      
      // 方式2: 尝试找到第一个 { 和最后一个 }
      const firstBrace = cleanContent.indexOf('{');
      const lastBrace = cleanContent.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanContent = cleanContent.substring(firstBrace, lastBrace + 1).trim();
      }
      
      const parsed = JSON.parse(cleanContent);
      return parseAIAnalysisResponse(parsed, code);
    }
  } catch (error) {
    console.warn("AI分析失败，使用回退分析:", error);
  }

  return performFallbackAnalysis(code, language);
}

function buildAnalysisPrompt(code: string, language: string): string {
  return `
请分析以下${language === "matlab" ? "MATLAB" : "TypeScript"}代码，识别所有代码质量问题。

代码内容：
\`\`\`${language}
${code}
\`\`\`

请返回严格的JSON格式，包含以下结构：
{
  "issues": [
    {
      "type": "formatting|naming|structure|performance|readability|best_practice|security",
      "severity": "low|medium|high|critical",
      "line": 行号,
      "column": 列号,
      "message": "问题描述",
      "suggestion": "修复建议",
      "autoFixable": true|false
    }
  ],
  "metrics": {
    "linesOfCode": 总行数,
    "commentRatio": 注释比例,
    "complexityEstimate": 复杂度估计(1-10)
  }
}

问题类型说明：
- formatting: 格式不一致（缩进、空格、换行等）
- naming: 命名约定违反
- structure: 代码结构问题
- performance: 潜在性能问题
- readability: 可读性问题
- best_practice: 最佳实践违反
- security: 安全问题

仅返回JSON，不要其他内容。
`.trim();
}

function isCodeIssueType(value: unknown): value is CodeIssueType {
  return (
    value === "formatting" ||
    value === "naming" ||
    value === "structure" ||
    value === "performance" ||
    value === "readability" ||
    value === "best_practice" ||
    value === "security"
  );
}

function isCodeIssueSeverity(value: unknown): value is CodeIssueSeverity {
  return (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAIAnalysisResponse(parsed: unknown, code: string): CodeAnalysisResult {
  const lines = code.split("\n");
  const issues: CodeIssue[] = [];
  const parsedRecord = asRecord(parsed);
  const rawIssues = Array.isArray(parsedRecord.issues) ? parsedRecord.issues : [];

  for (const rawIssue of rawIssues) {
    const issue = asRecord(rawIssue);

    issues.push({
      type: isCodeIssueType(issue.type) ? issue.type : "best_practice",
      severity: isCodeIssueSeverity(issue.severity) ? issue.severity : "medium",
      line: Math.max(1, asFiniteNumber(issue.line, 1)),
      column: Math.max(1, asFiniteNumber(issue.column, 1)),
      message:
        typeof issue.message === "string" && issue.message.trim()
          ? issue.message
          : "代码质量问题",
      suggestion:
        typeof issue.suggestion === "string" && issue.suggestion.trim()
          ? issue.suggestion
          : "请检查代码",
      autoFixable: Boolean(issue.autoFixable),
    });
  }

  const metrics = asRecord(parsedRecord.metrics);

  return {
    issues,
    summary: {
      totalIssues: issues.length,
      bySeverity: {
        low: issues.filter(i => i.severity === "low").length,
        medium: issues.filter(i => i.severity === "medium").length,
        high: issues.filter(i => i.severity === "high").length,
        critical: issues.filter(i => i.severity === "critical").length,
      },
      byType: issues.reduce((acc, issue) => {
        acc[issue.type] = (acc[issue.type] || 0) + 1;
        return acc;
      }, {} as Record<CodeIssueType, number>),
    },
    codeMetrics: {
      linesOfCode: lines.length,
      commentRatio: asFiniteNumber(metrics.commentRatio, 0),
      complexityEstimate: asFiniteNumber(metrics.complexityEstimate, 5),
    },
  };
}

function performFallbackAnalysis(code: string, language: string): CodeAnalysisResult {
  const lines = code.split("\n");
  const issues: CodeIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (language === "matlab") {
      if (/^\s*Archive_X\b/.test(line)) {
        issues.push({
          type: "naming",
          severity: "low",
          line: lineNum,
          column: line.indexOf("Archive_X") + 1,
          message: "使用Archive_X而非标准的archiveX",
          suggestion: "建议使用camelCase命名: archiveX",
          autoFixable: true,
        });
      }

      if (/^\s*Archive_F\b/.test(line)) {
        issues.push({
          type: "naming",
          severity: "low",
          line: lineNum,
          column: line.indexOf("Archive_F") + 1,
          message: "使用Archive_F而非标准的archiveF",
          suggestion: "建议使用camelCase命名: archiveF",
          autoFixable: true,
        });
      }

      if (/^\s*%+\s*$/.test(line)) {
        issues.push({
          type: "formatting",
          severity: "low",
          line: lineNum,
          column: 1,
          message: "空注释行",
          suggestion: "删除或添加有意义的注释内容",
          autoFixable: false,
        });
      }
    }

    if (line.includes("eval(")) {
      issues.push({
        type: "security",
        severity: "high",
        line: lineNum,
        column: line.indexOf("eval(") + 1,
        message: "使用eval()可能存在安全风险",
        suggestion: "考虑使用更安全的替代方案",
        autoFixable: false,
      });
    }
  }

  const commentLines = lines.filter(l => l.trim().startsWith("%") || l.trim().startsWith("//")).length;

  return {
    issues,
    summary: {
      totalIssues: issues.length,
      bySeverity: {
        low: issues.filter(i => i.severity === "low").length,
        medium: issues.filter(i => i.severity === "medium").length,
        high: issues.filter(i => i.severity === "high").length,
        critical: issues.filter(i => i.severity === "critical").length,
      },
      byType: issues.reduce((acc, issue) => {
        acc[issue.type] = (acc[issue.type] || 0) + 1;
        return acc;
      }, {} as Record<CodeIssueType, number>),
    },
    codeMetrics: {
      linesOfCode: lines.length,
      commentRatio: lines.length > 0 ? commentLines / lines.length : 0,
      complexityEstimate: Math.min(10, Math.max(1, Math.floor(lines.length / 20))),
    },
  };
}

export async function standardizeCodeWithAI(
  code: string,
  language: "matlab" | "typescript" = "matlab",
  autoApply: boolean = true
): Promise<AICodeStandardizationResult> {
  const apiKey = getDeepSeekApiKey();
  const analysis = await analyzeCodeWithAI(code, language);

  let standardizedCode = code;
  const suggestions: StandardizationSuggestion[] = [];

  if (apiKey) {
    try {
      const client = createDeepSeekClient(apiKey);
      const prompt = buildStandardizationPrompt(code, language, analysis);

      const response = await client.chat.completions.create({
        model: "deepseek-chat",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "你是专业的代码标准化专家。保持算法逻辑不变，只改进代码格式和结构。返回JSON格式。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        try {
          // 尝试提取JSON对象 - 更健壮的方法
          let cleanContent = content.trim();
          
          // 尝试多种方式清理和提取JSON
          // 方式1: 移除Markdown代码块
          if (cleanContent.includes('```json')) {
            const start = cleanContent.indexOf('```json') + 7;
            const end = cleanContent.lastIndexOf('```');
            if (end > start) {
              cleanContent = cleanContent.substring(start, end).trim();
            }
          } else if (cleanContent.includes('```')) {
            const start = cleanContent.indexOf('```') + 3;
            const end = cleanContent.lastIndexOf('```');
            if (end > start) {
              cleanContent = cleanContent.substring(start, end).trim();
            }
          }
          
          // 方式2: 尝试找到第一个 { 和最后一个 }
          const firstBrace = cleanContent.indexOf('{');
          const lastBrace = cleanContent.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanContent = cleanContent.substring(firstBrace, lastBrace + 1).trim();
          }
          
          // 尝试解析
          const parsed = JSON.parse(cleanContent);
          if (parsed.standardizedCode) {
            standardizedCode = parsed.standardizedCode;
          }
          if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
            suggestions.push(...parsed.suggestions);
          }
        } catch (parseError) {
          console.warn("AI JSON解析失败，使用回退标准化:", parseError);
        }
      }
    } catch (error) {
      console.warn("AI标准化失败，使用回退标准化:", error);
    }
  }

  if (suggestions.length === 0) {
    const fallbackResult = performFallbackStandardization(code, language);
    standardizedCode = autoApply ? fallbackResult.code : code;
    suggestions.push(...fallbackResult.suggestions);
  }

  if (!autoApply) {
    standardizedCode = code;
  }

  const changesMade = suggestions.length;
  const issuesFixed = analysis.issues.filter(i => i.autoFixable).length;

  const improvements: string[] = [];
  if (analysis.summary.byType.formatting > 0) improvements.push("格式化改进");
  if (analysis.summary.byType.naming > 0) improvements.push("命名标准化");
  if (analysis.summary.byType.readability > 0) improvements.push("可读性提升");

  const warnings: string[] = [];
  if (analysis.summary.bySeverity.high > 0) {
    warnings.push(`存在 ${analysis.summary.bySeverity.high} 个高严重度问题需要人工检查`);
  }
  if (analysis.summary.bySeverity.critical > 0) {
    warnings.push(`存在 ${analysis.summary.bySeverity.critical} 个严重问题必须修复`);
  }

  const requiresReview = analysis.summary.bySeverity.high > 0 || analysis.summary.bySeverity.critical > 0;

  return {
    success: true,
    originalCode: code,
    standardizedCode,
    suggestions,
    analysis,
    report: {
      changesMade,
      issuesFixed,
      improvements,
      warnings,
    },
    requiresReview,
  };
}

function buildStandardizationPrompt(
  code: string,
  language: string,
  analysis: CodeAnalysisResult
): string {
  return `
请标准化以下${language === "matlab" ? "MATLAB" : "TypeScript"}代码。

要求：
1. 保持算法逻辑和功能完全不变
2. 改进代码格式、命名和结构
3. 遵循最佳实践
4. 对于MATLAB代码，将Archive_X改为archiveX，Archive_F改为archiveF
5. 将MATLAB注释%改为//
6. 将MATLAB的end改为}
7. 添加适当的缩进（2个空格）

代码分析发现的问题：
${analysis.issues
  .slice(0, 10)
  .map((issue) => `- ${issue.message} (第${issue.line}行)`)
  .join("\n")}

原始代码：
\`\`\`${language}
${code}
\`\`\`

请返回JSON格式：
{
  "standardizedCode": "标准化后的完整代码",
  "suggestions": [
    {
      "type": "replace|insert|delete|reformat",
      "description": "变更描述",
      "original": "原始代码片段",
      "standardized": "标准化后的代码",
      "lineStart": 起始行号,
      "lineEnd": 结束行号,
      "confidence": 置信度(0-1)
    }
  ]
}
`.trim();
}

function performFallbackStandardization(
  code: string,
  language: "matlab" | "typescript"
): { code: string; suggestions: StandardizationSuggestion[] } {
  const suggestions: StandardizationSuggestion[] = [];
  let result = code;
  const lines = code.split("\n");

  if (language === "matlab") {
    if (result.includes("Archive_X")) {
      suggestions.push({
        type: "replace",
        description: "将Archive_X重命名为archiveX",
        original: "Archive_X",
        standardized: "archiveX",
        lineStart: 1,
        lineEnd: lines.length,
        confidence: 1.0,
      });
      result = result.replace(/\bArchive_X\b/g, "archiveX");
    }

    if (result.includes("Archive_F")) {
      suggestions.push({
        type: "replace",
        description: "将Archive_F重命名为archiveF",
        original: "Archive_F",
        standardized: "archiveF",
        lineStart: 1,
        lineEnd: lines.length,
        confidence: 1.0,
      });
      result = result.replace(/\bArchive_F\b/g, "archiveF");
    }

    if (result.includes("%")) {
      suggestions.push({
        type: "reformat",
        description: "将MATLAB注释转换为JavaScript风格",
        original: "%",
        standardized: "//",
        lineStart: 1,
        lineEnd: lines.length,
        confidence: 0.9,
      });
      result = result.replace(/^%+\s*/gm, "// ");
    }

    if (result.includes("end")) {
      suggestions.push({
        type: "replace",
        description: "将MATLAB的end替换为}",
        original: "end",
        standardized: "}",
        lineStart: 1,
        lineEnd: lines.length,
        confidence: 0.8,
      });
      result = result.replace(/\bend\b/g, "}");
    }
  }

  result = ensureConsistentIndentation(result);

  return { code: result, suggestions };
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

export function generateCodeDiff(
  original: string,
  standardized: string
): Array<{
  type: "added" | "removed" | "modified" | "unchanged";
  originalLine?: string;
  standardizedLine?: string;
  lineNumber: number;
}> {
  const originalLines = original.split("\n");
  const standardizedLines = standardized.split("\n");
  const diff: Array<{
    type: "added" | "removed" | "modified" | "unchanged";
    originalLine?: string;
    standardizedLine?: string;
    lineNumber: number;
  }> = [];

  const maxLines = Math.max(originalLines.length, standardizedLines.length);

  for (let i = 0; i < maxLines; i++) {
    const origLine = originalLines[i];
    const stdLine = standardizedLines[i];

    if (origLine === undefined && stdLine !== undefined) {
      diff.push({
        type: "added",
        standardizedLine: stdLine,
        lineNumber: i + 1,
      });
    } else if (origLine !== undefined && stdLine === undefined) {
      diff.push({
        type: "removed",
        originalLine: origLine,
        lineNumber: i + 1,
      });
    } else if (origLine !== stdLine) {
      diff.push({
        type: "modified",
        originalLine: origLine,
        standardizedLine: stdLine,
        lineNumber: i + 1,
      });
    } else {
      diff.push({
        type: "unchanged",
        originalLine: origLine,
        standardizedLine: stdLine,
        lineNumber: i + 1,
      });
    }
  }

  return diff;
}
