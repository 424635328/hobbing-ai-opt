export interface AlgorithmConfigItem {
  id: string;
  entry: string;
  label: string;
  description: string;
  matlabHints?: string[];
  features?: string[];
  useCases?: string[];
  strengths?: string[];
}

export interface AlgorithmConfigFile {
  defaultAlgorithm?: string;
  algorithms: AlgorithmConfigItem[];
}

