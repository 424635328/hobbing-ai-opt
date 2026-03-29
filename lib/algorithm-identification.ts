import type { AlgorithmIdentificationResult } from "./algorithm-processing-types";

type AlgorithmPattern = {
  name: string;
  patterns: RegExp[];
  keywords: string[];
  confidence: number;
};

const ALGORITHM_PATTERNS: AlgorithmPattern[] = [
  {
    name: "MOFATA",
    patterns: [
      /MOFATA/i,
      /surrogate_fit/i,
      /Elite_position/i,
      /cumtrapz/i,
      /bestInte/i,
      /worstInte/i,
      /arf\s*=/i,
    ],
    keywords: ["mofata", "surrogate", "elite", "cumtrapz", "arf"],
    confidence: 0.9,
  },
  {
    name: "MOGWO",
    patterns: [
      /MOGWO/i,
      /GreyWolves/i,
      /Alpha_pos/i,
      /Beta_pos/i,
      /Delta_pos/i,
      /D_alpha/i,
      /D_beta/i,
      /D_delta/i,
    ],
    keywords: ["mogwo", "gwo", "greywolf", "graywolf", "alpha", "beta", "delta"],
    confidence: 0.9,
  },
  {
    name: "MOPSO",
    patterns: [
      /MOPSO/i,
      /Particles_Vel/i,
      /Particles_Pos/i,
      /PBest/i,
      /GBest/i,
      /Vmax/i,
      /Vmin/i,
      /C1\s*=/i,
      /C2\s*=/i,
    ],
    keywords: ["mopso", "pso", "particle", "pbest", "gbest", "velocity"],
    confidence: 0.9,
  },
  {
    name: "NSGA-II",
    patterns: [/NSGA[-_]?II/i, /non-dominated/i, /crowding/i, /fast-non-dominated/i],
    keywords: ["nsga", "non-dominated", "crowding", "pareto"],
    confidence: 0.85,
  },
  {
    name: "NSGA-III",
    patterns: [/NSGA[-_]?III/i, /reference\s+point/i, /niching/i],
    keywords: ["nsga-iii", "reference point", "niching"],
    confidence: 0.85,
  },
  {
    name: "MOEA/D",
    patterns: [/MOEA[-_]?D/i, /decomposition/i, /weight\s+vector/i, /Tchebycheff/i],
    keywords: ["moea/d", "decomposition", "weight vector", "tchebycheff"],
    confidence: 0.85,
  },
  {
    name: "Generic Multi-Objective Algorithm",
    patterns: [
      /function.*Run_/i,
      /Archive_X/i,
      /Archive_F/i,
      /UpdateArchive/i,
      /Hobbing_Obj/i,
      /Apply_Engineering_Constraints/i,
    ],
    keywords: ["archive", "pareto", "multi-objective", "optimization"],
    confidence: 0.7,
  },
];

const FUNCTION_PATTERNS = {
  mainFunction: /function\s*\[\s*Archive_X\s*,\s*Archive_F\s*(?:,\s*\w+)*\s*\]\s*=\s*(\w+)/i,
  functionName: /function\s+(\w+)\s*\(/i,
  comments: /%+\s*(.+)/g,
  docstring: /\{[\s\S]*?\}/,
};

function extractComments(content: string): string[] {
  const comments: string[] = [];
  let match;
  const commentRegex = /%+\s*(.+)/g;
  while ((match = commentRegex.exec(content)) !== null) {
    const comment = match[1].trim();
    if (comment.length > 0 && !comment.startsWith("=")) {
      comments.push(comment);
    }
  }
  return comments;
}

function extractFunctionName(content: string): string | null {
  const mainMatch = content.match(FUNCTION_PATTERNS.mainFunction);
  if (mainMatch) {
    return mainMatch[1];
  }
  const funcMatch = content.match(FUNCTION_PATTERNS.functionName);
  return funcMatch ? funcMatch[1] : null;
}

function calculatePatternScore(content: string, pattern: AlgorithmPattern): number {
  let score = 0;
  const normalizedContent = content.toLowerCase();

  for (const regex of pattern.patterns) {
    if (regex.test(content)) {
      score += 1;
    }
  }

  for (const keyword of pattern.keywords) {
    if (normalizedContent.includes(keyword.toLowerCase())) {
      score += 0.5;
    }
  }

  return score * pattern.confidence;
}

function identifyFromFileName(fileName: string): string | null {
  const normalizedName = fileName.toLowerCase().replace(/\.m$/, "");

  for (const pattern of ALGORITHM_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (normalizedName.includes(keyword.toLowerCase())) {
        return pattern.name;
      }
    }
  }

  return null;
}

function extractStructuralFeatures(content: string): string[] {
  const features: string[] = [];

  if (content.includes("Archive_X") && content.includes("Archive_F")) {
    features.push("Uses archive storage for Pareto solutions");
  }

  if (content.includes("UpdateArchive")) {
    features.push("Implements archive update mechanism");
  }

  if (content.includes("Hobbing_Obj")) {
    features.push("Compatible with hobbing objective function");
  }

  if (content.includes("Apply_Engineering_Constraints")) {
    features.push("Applies engineering constraints");
  }

  if (content.includes("RankingProcess")) {
    features.push("Uses Pareto ranking");
  }

  if (content.includes("dominates")) {
    features.push("Implements dominance check");
  }

  return features;
}

function generateSuggestions(content: string, identifiedName: string | null): string[] {
  const suggestions: string[] = [];

  if (!content.includes("function")) {
    suggestions.push("Consider wrapping your algorithm in a function for better integration");
  }

  if (!content.includes("Archive_X") || !content.includes("Archive_F")) {
    suggestions.push("Standard archive format (Archive_X, Archive_F) recommended for consistency");
  }

  if (!content.includes("UpdateArchive")) {
    suggestions.push("Using UpdateArchive function ensures proper Pareto archive management");
  }

  if (!identifiedName) {
    suggestions.push("Add descriptive comments at the top of your file to help with identification");
  }

  return suggestions;
}

function extractAlgorithmNameFromContent(content: string): string | null {
  const fileNameMatch = content.match(/Artemisinin\s+Optimization|ArtemisininOpt|AO\s+Algorithm/i);
  if (fileNameMatch) {
    return "Artemisinin Optimization (AO)";
  }
  
  const headerCommentMatch = content.match(/^%+\s*(.+?)\s*$/m);
  if (headerCommentMatch && !headerCommentMatch[1].startsWith("=")) {
    const commentText = headerCommentMatch[1].trim();
    if (commentText.length > 0 && commentText.length < 100) {
      return commentText;
    }
  }
  
  return null;
}

export function identifyAlgorithm(
  fileName: string,
  fileContent: string,
  suggestedName?: string,
): AlgorithmIdentificationResult {
  const identifiedFeatures: string[] = [];
  const warnings: string[] = [];

  if (!fileContent || fileContent.trim().length === 0) {
    return {
      success: false,
      confidence: 0,
      identifiedFeatures: [],
      suggestions: ["File content is empty"],
    };
  }

  const comments = extractComments(fileContent);
  const functionName = extractFunctionName(fileContent);
  const structuralFeatures = extractStructuralFeatures(fileContent);
  const contentAlgorithmName = extractAlgorithmNameFromContent(fileContent);

  identifiedFeatures.push(...structuralFeatures);

  if (functionName) {
    identifiedFeatures.push(`Main function: ${functionName}`);
  }

  if (comments.length > 0) {
    identifiedFeatures.push(`Found ${comments.length} comment(s)`);
  }

  let bestMatch: { name: string; score: number } | null = null;
  const scores: Array<{ name: string; score: number }> = [];

  for (const pattern of ALGORITHM_PATTERNS) {
    const score = calculatePatternScore(fileContent, pattern);
    scores.push({ name: pattern.name, score });

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { name: pattern.name, score };
    }
  }

  const fileNameMatch = identifyFromFileName(fileName);
  let finalName: string | null = null;
  let confidence = 0;
  let isStandardAlgorithm = false;

  const HIGH_CONFIDENCE_THRESHOLD = 2.0;

  if (suggestedName) {
    finalName = suggestedName;
    confidence = 0.95;
    identifiedFeatures.push(`Using suggested name: ${suggestedName}`);
  } else if (contentAlgorithmName) {
    finalName = contentAlgorithmName;
    confidence = 0.85;
    identifiedFeatures.push(`Extracted algorithm name from content: ${contentAlgorithmName}`);
    if (bestMatch && bestMatch.score < HIGH_CONFIDENCE_THRESHOLD) {
      identifiedFeatures.push(`Low similarity to standard algorithms, treating as custom algorithm`);
    }
  } else if (fileNameMatch && bestMatch && fileNameMatch === bestMatch.name && bestMatch.score >= HIGH_CONFIDENCE_THRESHOLD) {
    finalName = fileNameMatch;
    confidence = Math.min(0.95, (bestMatch.score + 1) * 0.15);
    identifiedFeatures.push(`Name confirmed from both file name and content: ${fileNameMatch}`);
    isStandardAlgorithm = true;
  } else if (bestMatch && bestMatch.score >= HIGH_CONFIDENCE_THRESHOLD) {
    finalName = bestMatch.name;
    confidence = Math.min(0.9, bestMatch.score * 0.15);
    identifiedFeatures.push(`Identified from content patterns: ${bestMatch.name}`);
    isStandardAlgorithm = true;
  } else if (bestMatch && bestMatch.score > 0.5 && bestMatch.score < HIGH_CONFIDENCE_THRESHOLD) {
    finalName = functionName || "Custom Algorithm";
    confidence = 0.5;
    identifiedFeatures.push(`Low similarity to ${bestMatch.name}, treating as custom algorithm`);
    warnings.push(`Algorithm has some similarities to ${bestMatch.name} but is not a standard implementation`);
  } else if (fileNameMatch && bestMatch && bestMatch.score >= HIGH_CONFIDENCE_THRESHOLD) {
    finalName = fileNameMatch;
    confidence = 0.6;
    identifiedFeatures.push(`Identified from file name: ${fileNameMatch}`);
    warnings.push("Content patterns not strongly matched, using file name as primary identifier");
    isStandardAlgorithm = true;
  } else if (functionName) {
    finalName = functionName;
    confidence = 0.5;
    identifiedFeatures.push(`Using function name: ${functionName}`);
  } else {
    finalName = "Custom Algorithm";
    confidence = 0.3;
    warnings.push("Could not identify specific algorithm type");
  }

  if (!isStandardAlgorithm) {
    identifiedFeatures.push("Treated as independent custom algorithm (not mapped to standard library)");
  }

  const suggestions = generateSuggestions(fileContent, finalName);

  return {
    success: finalName !== null,
    name: finalName || undefined,
    confidence,
    identifiedFeatures,
    suggestions: [...warnings, ...suggestions],
  };
}
