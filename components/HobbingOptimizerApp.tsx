"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import ParetoChart from "@/components/ParetoChart";
import ProcessCard from "@/components/ProcessCard";
import {
  DEFAULT_COST_PARAMETERS,
  DEFAULT_CONSTRAINTS,
  DEFAULT_GEAR_PARAMETERS,
  type BuildModelRequest,
  type BuildModelResponse,
  type DecisionVector,
  type ModelConfig,
  type ModelSource,
  type ObjectiveVector,
} from "@/lib/hobbing-model";
import {
  OPTIMIZATION_PROFILES,
  SUPPORTED_ALGORITHMS,
  type ConvertMatlabAlgorithmResponse,
  type MatlabAlgorithmConfidence,
  type MatlabAlgorithmConversionSource,
  type OptimizationAlgorithm,
  type OptimizationProfile,
  type OptimizationStats,
  type OptimizationWorkerCommand,
  type OptimizationWorkerEvent,
} from "@/lib/optimization-types";

type WeightState = {
  energy: number;
  cost: number;
  roughness: number;
};

type AiHealthState = {
  checking: boolean;
  status: string;
  detail: string;
};

type RankedSolution = {
  index: number;
  decision: DecisionVector;
  objectives: ObjectiveVector;
  score: number;
};

type MatlabConversionState = {
  fileName: string;
  source: MatlabAlgorithmConversionSource | null;
  confidence: MatlabAlgorithmConfidence | null;
  notes: string[];
  detail: string;
  normalizedFormat: string;
};

const DEFAULT_WEIGHTS: WeightState = {
  energy: 100,
  cost: 100,
  roughness: 100,
};

const DEFAULT_AI_HEALTH: AiHealthState = {
  checking: false,
  status: "idle",
  detail: "尚未测试 AI 连接。",
};

const DEFAULT_MATLAB_CONVERSION: MatlabConversionState = {
  fileName: "",
  source: null,
  confidence: null,
  notes: [],
  detail: "尚未上传 MATLAB 算法文件。",
  normalizedFormat: "",
};

function normalizeWeights(weights: WeightState): WeightState {
  const sum = weights.energy + weights.cost + weights.roughness;

  if (sum <= 0) {
    return {
      energy: 1 / 3,
      cost: 1 / 3,
      roughness: 1 / 3,
    };
  }

  return {
    energy: weights.energy / sum,
    cost: weights.cost / sum,
    roughness: weights.roughness / sum,
  };
}

function rankSolutions(
  pf: ObjectiveVector[],
  ps: DecisionVector[],
  weights: WeightState,
): RankedSolution[] {
  if (pf.length === 0 || ps.length !== pf.length) {
    return [];
  }

  const normalizedWeights = normalizeWeights(weights);
  const dimensions = 3;
  const normDenominators = Array.from({ length: dimensions }, (_, axis) =>
    Math.sqrt(
      pf.reduce((sum, objective) => sum + objective[axis] * objective[axis], 0),
    ),
  );
  const weightedNormalized = pf.map((objective) =>
    objective.map((value, axis) => {
      const denominator = normDenominators[axis];
      const normalized = denominator <= 0 ? 0 : value / denominator;
      const weight =
        axis === 0
          ? normalizedWeights.energy
          : axis === 1
            ? normalizedWeights.cost
            : normalizedWeights.roughness;
      return normalized * weight;
    }),
  );
  const positiveIdeal = Array.from({ length: dimensions }, (_, axis) =>
    Math.min(...weightedNormalized.map((objective) => objective[axis])),
  );
  const negativeIdeal = Array.from({ length: dimensions }, (_, axis) =>
    Math.max(...weightedNormalized.map((objective) => objective[axis])),
  );

  return pf
    .map((objective, index) => {
      const weightedObjective = weightedNormalized[index];
      const positiveDistance = Math.sqrt(
        weightedObjective.reduce(
          (sum, value, axis) => sum + (value - positiveIdeal[axis]) ** 2,
          0,
        ),
      );
      const negativeDistance = Math.sqrt(
        weightedObjective.reduce(
          (sum, value, axis) => sum + (value - negativeIdeal[axis]) ** 2,
          0,
        ),
      );
      const denominator = positiveDistance + negativeDistance;
      const score = denominator <= 0 ? 0.5 : negativeDistance / denominator;

      return {
        index,
        decision: ps[index],
        objectives: objective,
        score,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(milliseconds >= 10000 ? 1 : 2)} s`;
}

function formatConfidence(confidence: MatlabAlgorithmConfidence | null): string {
  if (confidence === "high") {
    return "高";
  }

  if (confidence === "medium") {
    return "中";
  }

  if (confidence === "low") {
    return "低";
  }

  return "待识别";
}

function safeMaxPowerValue(value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CONSTRAINTS.max_power;
  }

  return parsed;
}

function safeNumberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function makeJobId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "未知错误";
}

function buildAlgorithmDescriptor(
  conversion: MatlabConversionState,
  algorithmLabel: string,
): string {
  if (!conversion.fileName) {
    return "手动选择";
  }

  if (conversion.source === "deepseek") {
    return `DeepSeek 转换 / ${conversion.fileName}`;
  }

  if (conversion.source === "fallback") {
    return `规则转换 / ${conversion.fileName}`;
  }

  return `已上传文件 / ${conversion.fileName} / 当前算法 ${algorithmLabel}`;
}

export default function HobbingOptimizerApp() {
  const [material, setMaterial] = useState("40Cr");
  const [tool, setTool] = useState("W18Cr4V");
  const [maxPower, setMaxPower] = useState("12.0");
  const [moduleValue, setModuleValue] = useState(
    String(DEFAULT_GEAR_PARAMETERS.module),
  );
  const [teeth, setTeeth] = useState(String(DEFAULT_GEAR_PARAMETERS.teeth));
  const [faceWidth, setFaceWidth] = useState(
    String(DEFAULT_GEAR_PARAMETERS.faceWidth),
  );
  const [accuracyGrade, setAccuracyGrade] = useState(
    String(DEFAULT_GEAR_PARAMETERS.accuracyGrade),
  );
  const [hardness, setHardness] = useState(
    String(DEFAULT_GEAR_PARAMETERS.hardness),
  );
  const [machineRate, setMachineRate] = useState(
    String(DEFAULT_COST_PARAMETERS.machineRate),
  );
  const [toolPrice, setToolPrice] = useState(
    String(DEFAULT_COST_PARAMETERS.toolPrice),
  );
  const [electricityRate, setElectricityRate] = useState(
    String(DEFAULT_COST_PARAMETERS.electricityRate),
  );
  const [toolChangeTime, setToolChangeTime] = useState(
    String(DEFAULT_COST_PARAMETERS.toolChangeTime),
  );
  const [toolSharpeningCost, setToolSharpeningCost] = useState(
    String(DEFAULT_COST_PARAMETERS.toolSharpeningCost),
  );
  const [toolSharpeningLife, setToolSharpeningLife] = useState(
    String(DEFAULT_COST_PARAMETERS.toolSharpeningLife),
  );
  const [profile, setProfile] = useState<OptimizationProfile>("preview");
  const [algorithm, setAlgorithm] = useState<OptimizationAlgorithm>("mofata");
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [modelSource, setModelSource] = useState<ModelSource | null>(null);
  const [modelNotes, setModelNotes] = useState<string[]>([]);
  const [modelRequest, setModelRequest] = useState<BuildModelRequest | null>(null);
  const [status, setStatus] = useState("等待建立工艺模型。");
  const [isBuilding, setIsBuilding] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isConvertingAlgorithm, setIsConvertingAlgorithm] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pfData, setPfData] = useState<ObjectiveVector[]>([]);
  const [psData, setPsData] = useState<DecisionVector[]>([]);
  const [stats, setStats] = useState<OptimizationStats | null>(null);
  const [weights, setWeights] = useState<WeightState>(DEFAULT_WEIGHTS);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [runProfileLabel, setRunProfileLabel] = useState<string | null>(null);
  const [runAlgorithmLabel, setRunAlgorithmLabel] = useState<string | null>(null);
  const [runAlgorithmDescriptor, setRunAlgorithmDescriptor] = useState<string | null>(null);
  const [aiHealth, setAiHealth] = useState<AiHealthState>(DEFAULT_AI_HEALTH);
  const [matlabFile, setMatlabFile] = useState<File | null>(null);
  const [matlabConversion, setMatlabConversion] = useState<MatlabConversionState>(
    DEFAULT_MATLAB_CONVERSION,
  );

  const workerRef = useRef<Worker | null>(null);
  const activeJobRef = useRef<string | null>(null);
  const deferredPfData = useDeferredValue(pfData);
  const rankedSolutions = rankSolutions(pfData, psData, weights);
  const recommendedSolution = rankedSolutions[0] ?? null;
  const activeProfile = OPTIMIZATION_PROFILES[profile];
  const activeAlgorithm = SUPPORTED_ALGORITHMS[algorithm];
  const normalizedWeights = normalizeWeights(weights);
  const formSnapshot: BuildModelRequest = {
    material,
    tool,
    maxPower: safeMaxPowerValue(maxPower),
    module: safeNumberValue(moduleValue, DEFAULT_GEAR_PARAMETERS.module),
    teeth: safeNumberValue(teeth, DEFAULT_GEAR_PARAMETERS.teeth),
    faceWidth: safeNumberValue(faceWidth, DEFAULT_GEAR_PARAMETERS.faceWidth),
    accuracyGrade: safeNumberValue(
      accuracyGrade,
      DEFAULT_GEAR_PARAMETERS.accuracyGrade,
    ),
    hardness: safeNumberValue(hardness, DEFAULT_GEAR_PARAMETERS.hardness),
    machineRate: safeNumberValue(machineRate, DEFAULT_COST_PARAMETERS.machineRate),
    toolPrice: safeNumberValue(toolPrice, DEFAULT_COST_PARAMETERS.toolPrice),
    electricityRate: safeNumberValue(
      electricityRate,
      DEFAULT_COST_PARAMETERS.electricityRate,
    ),
    toolChangeTime: safeNumberValue(
      toolChangeTime,
      DEFAULT_COST_PARAMETERS.toolChangeTime,
    ),
    toolSharpeningCost: safeNumberValue(
      toolSharpeningCost,
      DEFAULT_COST_PARAMETERS.toolSharpeningCost,
    ),
    toolSharpeningLife: safeNumberValue(
      toolSharpeningLife,
      DEFAULT_COST_PARAMETERS.toolSharpeningLife,
    ),
  };
  const currentAlgorithmDescriptor = buildAlgorithmDescriptor(
    matlabConversion,
    activeAlgorithm.label,
  );

  function stopWorker() {
    workerRef.current?.terminate();
    workerRef.current = null;
    activeJobRef.current = null;
  }

  function resetOptimizationState() {
    setProgress(0);
    setPfData([]);
    setPsData([]);
    setStats(null);
    setGeneratedAt(null);
    setRunProfileLabel(null);
    setRunAlgorithmLabel(null);
    setRunAlgorithmDescriptor(null);
  }

  function buildRequestFromForm(): BuildModelRequest | null {
    const request: BuildModelRequest = {
      material: material.trim(),
      tool: tool.trim(),
      maxPower: Number(maxPower),
      module: Number(moduleValue),
      teeth: Number(teeth),
      faceWidth: Number(faceWidth),
      accuracyGrade: Number(accuracyGrade),
      hardness: Number(hardness),
      machineRate: Number(machineRate),
      toolPrice: Number(toolPrice),
      electricityRate: Number(electricityRate),
      toolChangeTime: Number(toolChangeTime),
      toolSharpeningCost: Number(toolSharpeningCost),
      toolSharpeningLife: Number(toolSharpeningLife),
    };

    const numbers = [
      request.maxPower,
      request.module,
      request.teeth,
      request.faceWidth,
      request.accuracyGrade,
      request.hardness,
      request.machineRate,
      request.toolPrice,
      request.electricityRate,
      request.toolChangeTime,
      request.toolSharpeningCost,
      request.toolSharpeningLife,
    ];

    if (
      !request.material ||
      !request.tool ||
      numbers.some((value) => !Number.isFinite(value) || value <= 0)
    ) {
      return null;
    }

    return request;
  }

  useEffect(() => {
    return () => {
      stopWorker();
    };
  }, []);

  async function handleBuildModel() {
    const parsedMaxPower = Number(maxPower);

    if (!Number.isFinite(parsedMaxPower) || parsedMaxPower <= 0) {
      setStatus("请输入合法的机床最大功率。");
      return;
    }

    stopWorker();
    setIsRunning(false);
    resetOptimizationState();
    setConfig(null);
    setModelSource(null);
    setModelNotes([]);
    setModelRequest(null);
    setIsBuilding(true);
    setStatus("AI 正在建立当前工况的滚齿数学模型...");

    try {
      const response = await fetch("/api/build-model", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formSnapshot),
      });

      const result = (await response.json()) as BuildModelResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.success ? "接口返回异常，但未提供错误信息。" : result.error,
        );
      }

      setConfig(result.config);
      setModelSource(result.source);
      setModelNotes(result.notes);
      setModelRequest(formSnapshot);
      setStatus(
        result.source === "deepseek"
          ? `DeepSeek 建模完成，可以开始运行 ${activeAlgorithm.label}。`
          : `已切换到本地规则库，当前模型可直接用于 ${activeAlgorithm.label} 演示。`,
      );
    } catch (error) {
      setStatus(`模型建立失败：${extractErrorMessage(error)}`);
    } finally {
      setIsBuilding(false);
    }
  }

  async function handleCheckAiHealth() {
    setAiHealth({
      checking: true,
      status: "checking",
      detail: "正在测试 DeepSeek 连通性...",
    });

    try {
      const response = await fetch("/api/ai-health", { method: "GET" });
      const result = (await response.json()) as {
        success: boolean;
        status: string;
        message: string;
      };

      setAiHealth({
        checking: false,
        status: result.status,
        detail: result.message,
      });
    } catch (error) {
      setAiHealth({
        checking: false,
        status: "request_failed",
        detail: `AI 连通性测试失败：${extractErrorMessage(error)}`,
      });
    }
  }

  function handleAlgorithmChange(nextAlgorithm: OptimizationAlgorithm) {
    setAlgorithm(nextAlgorithm);
    setStatus(`当前求解算法已切换为 ${SUPPORTED_ALGORITHMS[nextAlgorithm].label}。`);
  }

  function handleMatlabFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setMatlabFile(file);

    if (!file) {
      setMatlabConversion(DEFAULT_MATLAB_CONVERSION);
      return;
    }

    setMatlabConversion({
      fileName: file.name,
      source: null,
      confidence: null,
      notes: ["点击“AI 转换 .m 算法文件”后，系统会识别并映射到受支持的算法。"],
      detail: `已选择文件 ${file.name}，大小 ${(file.size / 1024).toFixed(1)} KB。`,
      normalizedFormat: "",
    });
  }

  async function handleConvertMatlabAlgorithm() {
    if (!matlabFile) {
      setStatus("请先上传一个 MATLAB .m 算法文件。");
      return;
    }

    if (!matlabFile.name.toLowerCase().endsWith(".m")) {
      setStatus("当前仅支持上传 .m 文件。");
      return;
    }

    setIsConvertingAlgorithm(true);
    setStatus("AI 正在分析 MATLAB 算法文件并转换为受支持格式...");

    try {
      const fileContent = await matlabFile.text();

      if (!fileContent.trim()) {
        throw new Error("上传的 .m 文件内容为空。");
      }

      const response = await fetch("/api/convert-matlab", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: matlabFile.name,
          fileContent,
        }),
      });

      const result = (await response.json()) as ConvertMatlabAlgorithmResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.success ? "接口返回异常，但未提供错误信息。" : result.error,
        );
      }

      const algorithmLabel = SUPPORTED_ALGORITHMS[result.algorithm].label;

      setAlgorithm(result.algorithm);
      setMatlabConversion({
        fileName: matlabFile.name,
        source: result.source,
        confidence: result.confidence,
        notes: result.notes,
        detail: `${matlabFile.name} 已映射为 ${algorithmLabel}。`,
        normalizedFormat: `${result.normalizedFormat.supportedRuntime} / ${result.normalizedFormat.algorithm}`,
      });
      setStatus(
        `${result.source === "deepseek" ? "AI" : "规则识别"} 已将 ${matlabFile.name} 转换为 ${algorithmLabel}，现在可以直接运行优化。`,
      );
    } catch (error) {
      setStatus(`算法转换失败：${extractErrorMessage(error)}`);
    } finally {
      setIsConvertingAlgorithm(false);
    }
  }

  function handleRunOptimization() {
    if (!config) {
      setStatus("请先建立工艺模型。");
      return;
    }

    stopWorker();
    resetOptimizationState();
    setIsRunning(true);

    const chosenAlgorithm = algorithm;
    const chosenAlgorithmLabel = activeAlgorithm.label;
    const chosenProfileLabel = activeProfile.label;
    const chosenAlgorithmDescriptor = currentAlgorithmDescriptor;
    const chosenMaxFEs = activeProfile.Max_FEs;

    setRunProfileLabel(chosenProfileLabel);
    setRunAlgorithmLabel(chosenAlgorithmLabel);
    setRunAlgorithmDescriptor(chosenAlgorithmDescriptor);

    const jobId = makeJobId();
    const worker = new Worker(
      new URL("../workers/mofata.worker.ts", import.meta.url),
      { type: "module" },
    );

    workerRef.current = worker;
    activeJobRef.current = jobId;
    setStatus(`${chosenAlgorithmLabel} / ${chosenProfileLabel} 已准备启动...`);

    worker.onmessage = (event: MessageEvent<OptimizationWorkerEvent>) => {
      const data = event.data;

      if (!data || data.jobId !== activeJobRef.current) {
        return;
      }

      if (data.type === "start") {
        const startedAlgorithm = SUPPORTED_ALGORITHMS[data.algorithm];

        setStatus(
          `${startedAlgorithm.label} 已启动，种群规模 ${data.settings.N}，最大评估 ${data.settings.Max_FEs}。`,
        );
        return;
      }

      if (data.type === "progress") {
        setStats({
          feCount: data.feCount,
          archiveSize: data.archiveSize,
          elapsedMs: data.elapsedMs,
        });
        setStatus(
          `${chosenAlgorithmLabel} 求解中：${data.feCount}/${chosenMaxFEs}，当前档案 ${data.archiveSize} 个。`,
        );
        startTransition(() => {
          setProgress(data.progress);
          setPfData(data.currentPF);
        });
        return;
      }

      if (data.type === "done") {
        const finishedAlgorithm = SUPPORTED_ALGORITHMS[data.algorithm];

        setIsRunning(false);
        setStats(data.stats);
        setGeneratedAt(new Date().toISOString());
        setStatus(
          `${finishedAlgorithm.label} 优化完成，已得到 ${data.stats.archiveSize} 个非支配解，可进行权重决策与打印工艺卡。`,
        );
        startTransition(() => {
          setProgress(100);
          setPfData(data.finalPF);
          setPsData(data.finalPS);
        });

        if (workerRef.current === worker) {
          worker.terminate();
          workerRef.current = null;
          activeJobRef.current = null;
        }

        return;
      }

      setIsRunning(false);
      setStatus(`优化失败：${data.error}`);

      if (workerRef.current === worker) {
        worker.terminate();
        workerRef.current = null;
        activeJobRef.current = null;
      }
    };

    worker.onerror = () => {
      if (activeJobRef.current !== jobId) {
        return;
      }

      setIsRunning(false);
      setStatus("优化 Worker 运行异常，请重新执行求解。");
      worker.terminate();
      workerRef.current = null;
      activeJobRef.current = null;
    };

    const message: OptimizationWorkerCommand = {
      type: "start",
      jobId,
      config,
      profile,
      algorithm: chosenAlgorithm,
    };

    worker.postMessage(message);
  }

  function handlePrintCard() {
    window.print();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 lg:py-8">
      <header className="no-print rounded-[32px] border border-border bg-surface p-6 shadow-[var(--shadow)] backdrop-blur md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
              AI + Web Worker + Pareto Front
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
              滚齿工艺参数优化系统
            </h1>
            <p className="mt-4 text-sm leading-7 text-muted md:text-base">
              先让 DeepSeek 或本地工艺规则库生成模型，再由浏览器端根据你选择的
              MOFATA、MOGWO 或 MOPSO 在后台完成多目标寻优，最后通过 3D Pareto
              前沿与权重推荐解输出可打印工艺卡。
            </p>
          </div>
          <div className="grid gap-3 rounded-[24px] border border-border bg-white/75 p-4 text-sm text-muted md:grid-cols-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted">
                当前档位
              </div>
              <div className="mt-1 font-semibold text-foreground">
                {activeProfile.label}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted">
                当前算法
              </div>
              <div className="mt-1 font-semibold text-foreground">
                {activeAlgorithm.label}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted">
                模型来源
              </div>
              <div className="mt-1 font-semibold text-foreground">
                {modelSource === "deepseek"
                  ? "DeepSeek"
                  : modelSource === "fallback"
                    ? "本地规则库"
                    : "待建立"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted">
                当前状态
              </div>
              <div className="mt-1 font-semibold text-foreground">{status}</div>
            </div>
          </div>
        </div>
      </header>

      <section className="no-print grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
        <div className="rounded-[32px] border border-border bg-surface p-6 shadow-[var(--shadow)] backdrop-blur md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                Step 1
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                工艺条件输入与动态建模
              </h2>
            </div>
            <span className="rounded-full bg-accent/10 px-4 py-2 text-xs font-semibold text-accent">
              AI 建模
            </span>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="rounded-[24px] border border-border/80 bg-white/60 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted mb-3">
                齿轮基础参数
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">齿轮模数 (m)</span>
                  <input
                    type="number"
                    min="0.5"
                    max="20"
                    step="0.01"
                    value={moduleValue}
                    onChange={(event) => setModuleValue(event.target.value)}
                    className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">齿数 (z)</span>
                  <input
                    type="number"
                    min="5"
                    max="500"
                    step="1"
                    value={teeth}
                    onChange={(event) => setTeeth(event.target.value)}
                    className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">齿宽 (B)</span>
                  <input
                    type="number"
                    min="5"
                    max="300"
                    step="0.1"
                    value={faceWidth}
                    onChange={(event) => setFaceWidth(event.target.value)}
                    className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">精度等级 (GB/T 10095)</span>
                  <input
                    type="number"
                    min="3"
                    max="12"
                    step="1"
                    value={accuracyGrade}
                    onChange={(event) => setAccuracyGrade(event.target.value)}
                    className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                  />
                </label>
                <label className="grid gap-2 sm:col-span-2">
                  <span className="text-sm font-medium text-foreground">工件材料及硬度</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={material}
                      onChange={(event) => setMaterial(event.target.value)}
                      className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                      placeholder="例如：40Cr调质"
                    />
                    <input
                      type="number"
                      min="100"
                      max="500"
                      step="5"
                      value={hardness}
                      onChange={(event) => setHardness(event.target.value)}
                      className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                      placeholder="硬度 HB"
                    />
                  </div>
                </label>
              </div>
            </div>

            <div className="rounded-[24px] border border-border/80 bg-white/60 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted mb-3">
                刀具与机床
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">刀具材料</span>
                  <input
                    value={tool}
                    onChange={(event) => setTool(event.target.value)}
                    className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                    placeholder="例如：W18Cr4V"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">
                    机床最大功率 (kW)
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="0.1"
                    value={maxPower}
                    onChange={(event) => setMaxPower(event.target.value)}
                    className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-[24px] border border-border/80 bg-white/60 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted mb-3">
                成本核算参数
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">机床工时费 (元/小时)</span>
                  <input
                    type="number"
                    min="0.5"
                    max="50"
                    step="0.1"
                    value={machineRate}
                    onChange={(event) => setMachineRate(event.target.value)}
                    className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">滚刀采购单价 (元/把)</span>
                  <input
                    type="number"
                    min="100"
                    max="100000"
                    step="10"
                    value={toolPrice}
                    onChange={(event) => setToolPrice(event.target.value)}
                    className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">滚刀刃磨费用 (元/次)</span>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    step="5"
                    value={toolSharpeningCost}
                    onChange={(event) => setToolSharpeningCost(event.target.value)}
                    className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">刀具刃磨寿命 (件/次)</span>
                  <input
                    type="number"
                    min="5"
                    max="500"
                    step="5"
                    value={toolSharpeningLife}
                    onChange={(event) => setToolSharpeningLife(event.target.value)}
                    className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">电费单价 (元/kWh)</span>
                  <input
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.01"
                    value={electricityRate}
                    onChange={(event) => setElectricityRate(event.target.value)}
                    className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">换刀辅助时间 (分钟/次)</span>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    step="1"
                    value={toolChangeTime}
                    onChange={(event) => setToolChangeTime(event.target.value)}
                    className="rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleBuildModel}
              disabled={isBuilding}
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-accent/50"
            >
              {isBuilding ? "模型构建中..." : "AI 一键动态建模"}
            </button>
            <div className="rounded-full border border-border bg-white/75 px-4 py-3 text-sm text-muted">
              {config
                ? `刀具寿命系数 ${config.constants.tool_life_constant.toFixed(0)}，切削力系数 ${config.constants.specific_cutting_force.toFixed(0)}`
                : "建立模型后将在这里展示核心系数。"}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleCheckAiHealth}
              disabled={aiHealth.checking}
              className="rounded-full border border-border bg-white/80 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {aiHealth.checking ? "测试中..." : "测试 AI 连接"}
            </button>
            <div className="rounded-full border border-border bg-white/75 px-4 py-3 text-sm text-muted">
              {aiHealth.detail}
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-border bg-white/70 p-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                模型状态
              </h3>
              <span className="rounded-full bg-accent/8 px-3 py-1 text-xs font-semibold text-accent">
                {modelSource === "deepseek"
                  ? "DeepSeek"
                  : modelSource === "fallback"
                    ? "Fallback"
                    : "Idle"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-foreground">{status}</p>
            {modelNotes.length > 0 && (
              <ul className="mt-4 grid gap-2 text-sm leading-6 text-muted">
                {modelNotes.map((note) => (
                  <li key={note} className="rounded-2xl bg-accent/6 px-4 py-3">
                    {note}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6 rounded-[24px] border border-border bg-white/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                  参数说明文档
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  说明材料输入、功率约束，以及多算法 `.m` 转换入口的用途。
                </p>
              </div>
              <a
                href="/docs/declare"
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-border bg-white/80 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
              >
                打开参数说明页
              </a>
            </div>
            <div className="mt-4 rounded-[20px] border border-border/80 bg-[#fffdf7] p-4 text-sm leading-7 text-muted">
              主页面不再直接内嵌文档内容。点击上方按钮后会打开独立的 TSX 文档页面，并从
              `/docs/declare.md` 读取源码后进行渲染。
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-border bg-surface p-6 shadow-[var(--shadow)] backdrop-blur md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                Step 2
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                可选算法求解与偏好设置
              </h2>
            </div>
            <span className="rounded-full bg-accent-warm/12 px-4 py-2 text-xs font-semibold text-accent-warm">
              Web Worker 后台执行
            </span>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="grid gap-2">
              <span className="text-sm font-medium text-foreground">求解算法</span>
              <div className="grid gap-3 md:grid-cols-3">
                {(
                  Object.entries(SUPPORTED_ALGORITHMS) as Array<
                    [OptimizationAlgorithm, typeof activeAlgorithm]
                  >
                ).map(([key, settings]) => (
                  <label
                    key={key}
                    className={`cursor-pointer rounded-[24px] border p-4 transition ${
                      algorithm === key
                        ? "border-accent bg-accent/8"
                        : "border-border bg-white/75"
                    }`}
                  >
                    <input
                      type="radio"
                      name="algorithm"
                      value={key}
                      checked={algorithm === key}
                      onChange={() => handleAlgorithmChange(key)}
                      className="sr-only"
                    />
                    <div className="font-semibold text-foreground">{settings.label}</div>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {settings.description}
                    </p>
                    <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-muted">
                      MATLAB Hint: {settings.matlabHints.join(" / ")}
                    </p>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-border bg-white/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                    MATLAB 算法文件转换
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    上传 `.m` 文件后，系统会优先调用 DeepSeek 识别并映射到当前支持的
                    MOFATA、MOGWO 或 MOPSO。
                  </p>
                </div>
                <span className="rounded-full bg-accent/8 px-3 py-1 text-xs font-semibold text-accent">
                  当前算法：{activeAlgorithm.label}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">
                    上传 `.m` 文件
                  </span>
                  <input
                    type="file"
                    accept=".m"
                    onChange={handleMatlabFileChange}
                    className="rounded-2xl border border-border bg-white/80 px-4 py-3 text-sm text-foreground file:mr-4 file:rounded-full file:border-0 file:bg-accent/12 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-accent"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleConvertMatlabAlgorithm}
                  disabled={isConvertingAlgorithm || !matlabFile}
                  className="self-end rounded-full border border-border bg-white/80 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isConvertingAlgorithm ? "转换中..." : "AI 转换 .m 算法文件"}
                </button>
              </div>

              <div className="mt-4 rounded-[20px] border border-border/80 bg-[#fffdf7] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="font-medium text-foreground">
                    {matlabConversion.fileName || "尚未选择文件"}
                  </div>
                  <div className="text-muted">
                    置信度：{formatConfidence(matlabConversion.confidence)}
                    {matlabConversion.source && ` / 来源：${matlabConversion.source}`}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-foreground">
                  {matlabConversion.detail}
                </p>
                <p className="mt-2 text-sm text-muted">
                  受支持格式：
                  {matlabConversion.normalizedFormat || "待转换"}
                </p>
                {matlabConversion.notes.length > 0 && (
                  <ul className="mt-4 grid gap-2 text-sm leading-6 text-muted">
                    {matlabConversion.notes.map((note) => (
                      <li key={note} className="rounded-2xl bg-accent/6 px-4 py-3">
                        {note}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium text-foreground">运行档位</span>
              <div className="grid gap-3 md:grid-cols-2">
                {(
                  Object.entries(OPTIMIZATION_PROFILES) as Array<
                    [OptimizationProfile, typeof activeProfile]
                  >
                ).map(([key, settings]) => (
                  <label
                    key={key}
                    className={`cursor-pointer rounded-[24px] border p-4 transition ${
                      profile === key
                        ? "border-accent bg-accent/8"
                        : "border-border bg-white/75"
                    }`}
                  >
                    <input
                      type="radio"
                      name="profile"
                      value={key}
                      checked={profile === key}
                      onChange={() => setProfile(key)}
                      className="sr-only"
                    />
                    <div className="font-semibold text-foreground">{settings.label}</div>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {settings.description}
                    </p>
                    <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-muted">
                      N={settings.N} / Max_FEs={settings.Max_FEs}
                    </p>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunOptimization}
              disabled={!config || isBuilding || isConvertingAlgorithm}
              className="rounded-full bg-accent-warm px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#9f5716] disabled:cursor-not-allowed disabled:bg-accent-warm/50"
            >
              {isRunning
                ? `重新运行 ${activeAlgorithm.label}`
                : `启动 ${activeAlgorithm.label} 优化`}
            </button>

            <div className="rounded-[24px] border border-border bg-white/70 p-5">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                  运行进度
                </h3>
                <span className="font-mono text-sm font-semibold text-foreground">
                  {progress.toFixed(1)}%
                </span>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#e7dfcf]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-accent-warm transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-3">
                <div className="rounded-2xl bg-accent/6 px-4 py-3">
                  评估次数
                  <div className="mt-1 font-mono text-lg font-semibold text-foreground">
                    {stats?.feCount ?? 0}
                  </div>
                </div>
                <div className="rounded-2xl bg-accent/6 px-4 py-3">
                  档案规模
                  <div className="mt-1 font-mono text-lg font-semibold text-foreground">
                    {stats?.archiveSize ?? 0}
                  </div>
                </div>
                <div className="rounded-2xl bg-accent/6 px-4 py-3">
                  耗时
                  <div className="mt-1 font-mono text-lg font-semibold text-foreground">
                    {stats ? formatSeconds(stats.elapsedMs) : "0.00 s"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-border bg-white/70 p-5">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                  多目标偏好权重
                </h3>
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  自动归一化
                </span>
              </div>
              <div className="mt-4 grid gap-4">
                {(
                  [
                    ["energy", "能耗 E", weights.energy, normalizedWeights.energy],
                    ["cost", "成本 C", weights.cost, normalizedWeights.cost],
                    [
                      "roughness",
                      "粗糙度 Ra",
                      weights.roughness,
                      normalizedWeights.roughness,
                    ],
                  ] as const
                ).map(([key, label, value, normalized]) => (
                  <label key={key} className="grid gap-2">
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="font-medium text-foreground">{label}</span>
                      <span className="font-mono text-muted">
                        {value} / {(normalized * 100).toFixed(1)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={value}
                      onChange={(event) =>
                        setWeights((current) => ({
                          ...current,
                          [key]: Number(event.target.value),
                        }))
                      }
                      className="accent-[var(--accent)]"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="no-print grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
        <div className="rounded-[32px] border border-border bg-surface p-6 shadow-[var(--shadow)] backdrop-blur md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                Step 3
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                3D Pareto 前沿分析
              </h2>
            </div>
            <span className="rounded-full bg-accent/10 px-4 py-2 text-xs font-semibold text-accent">
              E - C - Ra
            </span>
          </div>

          <div className="mt-6">
            {deferredPfData.length > 0 ? (
              <ParetoChart
                data={deferredPfData}
                highlightedPoint={recommendedSolution?.objectives ?? null}
              />
            ) : (
              <div className="flex h-[520px] items-center justify-center rounded-[28px] border border-dashed border-border bg-white/70 text-sm text-muted">
                请先建立模型并运行优化，3D Pareto 前沿会在这里展示。
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[32px] border border-border bg-surface p-6 shadow-[var(--shadow)] backdrop-blur md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                Step 4
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                推荐解与候选列表
              </h2>
            </div>
            <button
              type="button"
              onClick={handlePrintCard}
              disabled={!recommendedSolution}
              className="rounded-full border border-border bg-white/80 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              打印工艺卡
            </button>
          </div>

          {recommendedSolution ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-[24px] border border-accent/20 bg-accent/8 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  推荐解
                </p>
                <div className="mt-3 grid gap-3 text-sm text-muted">
                  <div className="flex items-center justify-between gap-4">
                    <span>算法</span>
                    <span className="font-semibold text-foreground">
                      {runAlgorithmLabel ?? activeAlgorithm.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>决策变量</span>
                    <span className="font-mono font-semibold text-foreground">
                      [{recommendedSolution.decision.map((item) => item.toFixed(2)).join(", ")}]
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>目标函数</span>
                    <span className="font-mono font-semibold text-foreground">
                      [{recommendedSolution.objectives.map((item) => item.toFixed(4)).join(", ")}]
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>TOPSIS 综合评分</span>
                    <span className="font-mono font-semibold text-foreground">
                      {recommendedSolution.score.toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                  Top 5 候选解
                </div>
                {rankedSolutions.map((solution, index) => (
                  <div
                    key={`${solution.index}-${solution.score.toFixed(5)}`}
                    className={`rounded-[24px] border p-4 text-sm ${
                      index === 0
                        ? "border-accent bg-accent/8"
                        : "border-border bg-white/75"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-foreground">
                        方案 {index + 1}
                      </span>
                      <span className="font-mono text-muted">
                        TOPSIS {solution.score.toFixed(4)}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-muted">
                      <div className="font-mono text-xs leading-6">
                        X = [{solution.decision.map((value) => value.toFixed(2)).join(", ")}]
                      </div>
                      <div className="font-mono text-xs leading-6">
                        F = [{solution.objectives.map((value) => value.toFixed(4)).join(", ")}]
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-[24px] border border-dashed border-border bg-white/70 p-6 text-sm leading-7 text-muted">
              完成优化后，系统会根据你设置的能耗、成本、粗糙度权重使用 TOPSIS 进行综合评估，并高亮最优推荐解。
            </div>
          )}
        </div>
      </section>

      <section className="print-card">
        <ProcessCard
          request={modelRequest ?? formSnapshot}
          profileLabel={runProfileLabel ?? activeProfile.label}
          algorithmLabel={runAlgorithmLabel ?? activeAlgorithm.label}
          algorithmDescriptor={runAlgorithmDescriptor ?? currentAlgorithmDescriptor}
          source={modelSource}
          notes={modelNotes}
          config={config}
          decision={recommendedSolution?.decision ?? null}
          objectives={recommendedSolution?.objectives ?? null}
          generatedAt={generatedAt}
        />
      </section>
    </main>
  );
}
