# 算法代码标准化转换指南

## 概述

本文档定义了将 MATLAB 格式的算法代码转换为当前项目 TypeScript 格式所需的规范和转换规则。

## 现有算法文件分析

### 文件结构

现有算法文件位于 `algorithm/` 目录下，包括：
- `mofata.ts` - MOFATA 算法
- `mogwo.ts` - MOGWO 算法
- `mopso.ts` - MOPSO 算法
- `runtime-types.ts` - 类型定义
- `index.ts` - 算法加载器

### 统一编码规范

#### 1. 文件结构

每个算法文件的统一结构：

```typescript
import type { AlgorithmRunner } from "./runtime-types";

// 算法常量（如果有）
const CONSTANT_NAME = value;

// 主算法函数
const runAlgorithmName: AlgorithmRunner = (context, runtime) => {
  // 1. 初始化变量
  // 2. 主优化循环
  // 3. 使用 runtime 提供的工具函数
  // 4. 更新 context.feCount
  // 5. 调用 runtime.maybeReportProgress()
};

export default runAlgorithmName;
```

#### 2. 命名约定

| 元素类型 | 约定 | 示例 |
|---------|------|------|
| **文件名** | 小写，kebab-case | `mofata.ts`, `mogwo.ts` |
| **函数名** | camelCase，前缀 `run` | `runMOFATA`, `runMOGWO` |
| **变量名** | camelCase | `population`, `greyWolves`, `velocities` |
| **常量名** | UPPER_SNAKE_CASE | `ARF`, `INERTIA_WEIGHT` |
| **参数名** | camelCase | `context`, `runtime`, `i`, `j` |
| **类型名** | PascalCase | `AlgorithmRunner`, `OptimizationContext` |

#### 3. 代码风格

- **缩进**: 2 个空格
- **分号**: 必须使用分号
- **引号**: 使用双引号 `"`
- **数组/对象**: 多行时最后一个元素允许有逗号
- **行长度**: 建议不超过 120 字符

#### 4. 注释风格

- 现有算法中**几乎没有注释**
- 鼓励添加清晰的注释，但不是强制要求
- 如有注释，使用 `//` 单行注释

#### 5. 变量声明

- 使用 `const` 声明不变的变量
- 使用 `let` 声明可变的变量
- 避免使用 `var`

```typescript
const fixedValue = 0.5;
let changingValue = 0;
```

### 核心概念

#### 1. AlgorithmRunner 类型

```typescript
type AlgorithmRunner = (
  context: OptimizationContext,
  runtime: AlgorithmRuntime,
) => void;
```

每个算法都是一个接收 `context` 和 `runtime` 两个参数的函数，不返回任何值。

#### 2. OptimizationContext (context)

提供的上下文信息：

| 属性 | 类型 | 说明 |
|------|------|------|
| `context.feCount` | `number` | 函数评估计数器，**必须在每次评估后递增** |
| `context.settings.N` | `number` | 种群规模 |
| `context.settings.Max_FEs` | `number` | 最大函数评估次数 |
| `context.settings.ArchiveMaxSize` | `number` | 档案最大规模 |
| `context.lowerBounds` | `number[]` | 决策变量下界 |
| `context.upperBounds` | `number[]` | 决策变量上界 |
| `context.archive` | `ArchiveState` | Pareto 档案状态 |
| `context.config` | `ModelConfig` | 工艺模型配置 |

#### 3. AlgorithmRuntime (runtime)

可用的工具函数：

| 函数 | 说明 |
|------|------|
| `runtime.initializationPWLCM(count, dim, upper, lower)` | 使用 PWLCM 混沌映射初始化种群 |
| `runtime.evaluatePopulation(population, context)` | 评估整个种群，**会自动递增 feCount** |
| `runtime.maybeReportProgress(context)` | 报告进度（如果需要） |
| `runtime.clamp(value, lower, upper)` | 将值限制在范围内 |
| `runtime.chooseArchiveLeader(...)` | 从档案中选择一个领导者 |
| `runtime.chooseArchiveLeaders(...)` | 从档案中选择三个领导者（α, β, δ） |
| `runtime.updateArchive(archive, x, f, maxSize)` | 更新 Pareto 档案 |
| `runtime.randomDecision(lower, upper)` | 生成随机决策向量 |
| `runtime.levy(dim)` | 生成 Lévy 飞行步长 |
| `runtime.applyEngineeringConstraints(x, lower, upper)` | 应用工程约束 |
| `runtime.hobbingObjective(x, config)` | 计算目标函数值 |
| `runtime.computeSurrogateFitness(objectives)` | 计算代理适应度 |
| `runtime.cumulativeTrapezoid(values)` | 累积梯形积分 |
| `runtime.dimension` | `number` - 决策变量维度 |
| `runtime.epsilon` | `number` - 极小值（用于除零保护） |

## 转换规则

### 规则 1: MATLAB 到 TypeScript 语法转换

| MATLAB | TypeScript | 说明 |
|--------|------------|------|
| `% 注释` | `// 注释` | 注释符号 |
| `for i = 1:N` | `for (let i = 0; i < N; i += 1)` | 循环（注意索引从 0 开始） |
| `end` | `}` | 代码块结束 |
| `x(i)` | `x[i]` | 数组索引 |
| `function result = f(x)` | `const f = (x) => { ...; return result; }` | 函数定义 |
| `[a, b] = f(x)` | `const [a, b] = f(x)` | 多返回值 |
| `rand()` | `Math.random()` | 随机数生成 |
| `inf` | `Infinity` | 无穷大 |
| `eps` | `runtime.epsilon` | 极小值 |
| `min(a, b)` | `Math.min(a, b)` | 最小值 |
| `max(a, b)` | `Math.max(a, b)` | 最大值 |
| `abs(x)` | `Math.abs(x)` | 绝对值 |
| `tan(x)` | `Math.tan(x)` | 正切 |

### 规则 2: 变量命名转换

| MATLAB 风格 | TypeScript 风格 |
|-------------|----------------|
| `Archive_X` | `archiveX` (使用 runtime 提供的) |
| `Archive_F` | `archiveF` (使用 runtime 提供的) |
| `pop` | `population` |
| `vel` | `velocities` |
| `pbest` | `personalBestPositions` |
| `gbest` | `globalBest` (从 runtime 获取) |
| `alpha`, `beta`, `delta` | `alphaPos`, `betaPos`, `deltaPos` |

### 规则 3: 使用 Runtime 工具函数

**重要**: 不要重新实现以下功能，直接使用 `runtime` 提供的函数：

1. **种群初始化**: 使用 `runtime.initializationPWLCM()`
2. **目标函数评估**: 使用 `runtime.evaluatePopulation()`
3. **Pareto 档案管理**: 使用 `runtime.updateArchive()`
4. **领导者选择**: 使用 `runtime.chooseArchiveLeader()` 或 `runtime.chooseArchiveLeaders()`
5. **边界约束**: 使用 `runtime.clamp()`
6. **进度报告**: 使用 `runtime.maybeReportProgress()`
7. **约束应用**: 使用 `runtime.applyEngineeringConstraints()`
8. **随机决策**: 使用 `runtime.randomDecision()`
9. **Lévy 飞行**: 使用 `runtime.levy()`

### 规则 4: 主循环结构

所有算法都应该遵循以下主循环结构：

```typescript
const runAlgorithmName: AlgorithmRunner = (context, runtime) => {
  // 1. 初始化阶段
  const population = runtime.initializationPWLCM(
    context.settings.N,
    runtime.dimension,
    context.upperBounds,
    context.lowerBounds,
  );
  // 其他初始化...

  // 2. 主优化循环
  while (context.feCount < context.settings.Max_FEs) {
    // 评估种群（会自动递增 feCount）
    const evaluation = runtime.evaluatePopulation(population, context);
    
    // 报告进度
    runtime.maybeReportProgress(context);
    
    // 检查终止条件
    if (context.feCount >= context.settings.Max_FEs || 
        evaluation.positions.length === 0) {
      break;
    }
    
    // 算法核心逻辑...
    
    // 更新种群...
  }
};
```

### 规则 5: feCount 管理

- **不要手动递增** `context.feCount`，除非是单独评估单个解
- `runtime.evaluatePopulation()` 会自动处理 `feCount` 递增
- 如果单独评估某个解，记得递增 `context.feCount += 1`

### 规则 6: 档案访问

通过 `context.archive` 访问 Pareto 档案：
- `context.archive.archiveX` - 决策向量档案
- `context.archive.archiveF` - 目标向量档案

## 转换示例

### 示例 1: 简单粒子群算法 (PSO)

**MATLAB 原始代码**:
```matlab
function pso_algorithm()
    N = 100;
    Max_FEs = 10000;
    dim = 3;
    
    % 初始化
    pop = initialization(N, dim);
    vel = zeros(N, dim);
    pbest = pop;
    pbest_f = evaluate_population(pop);
    
    % 主循环
    fe_count = 0;
    while fe_count < Max_FEs
        % 选择全局最佳
        gbest = select_gbest(pbest, pbest_f);
        
        % 更新速度和位置
        for i = 1:N
            for j = 1:dim
                vel(i,j) = ...;
                pop(i,j) = ...;
            end
        end
        
        % 评估
        [new_f, fe_count] = evaluate_population(pop, fe_count);
        
        % 更新个人最佳
        for i = 1:N
            if new_f(i) < pbest_f(i)
                pbest(i,:) = pop(i,:);
                pbest_f(i) = new_f(i);
            end
        end
    end
end
```

**转换后的 TypeScript 代码**:
```typescript
import type { AlgorithmRunner } from "./runtime-types";

const runPSO: AlgorithmRunner = (context, runtime) => {
  // 初始化
  const velocities = Array.from({ length: context.settings.N }, () =>
    Array(runtime.dimension).fill(0),
  );
  const positions = runtime.initializationPWLCM(
    context.settings.N,
    runtime.dimension,
    context.upperBounds,
    context.lowerBounds,
  );
  const personalBestPositions = positions.map((position) =>
    runtime.applyEngineeringConstraints(
      position,
      context.lowerBounds,
      context.upperBounds,
    ),
  );
  const personalBestObjectives = Array.from(
    { length: context.settings.N },
    () => [Infinity, Infinity, Infinity],
  );
  const inertiaWeight = 0.5;
  const c1 = 1.5;
  const c2 = 1.5;
  const vmax = context.upperBounds.map(
    (upper, index) => 0.1 * (upper - context.lowerBounds[index]),
  );
  const vmin = vmax.map((value) => -value);

  // 主循环
  while (context.feCount < context.settings.Max_FEs) {
    const evaluation = runtime.evaluatePopulation(positions, context);

    // 更新个人最佳
    for (let i = 0; i < evaluation.positions.length; i += 1) {
      if (
        runtime.shouldReplacePersonalBest(
          evaluation.objectives[i],
          personalBestObjectives[i],
        )
      ) {
        personalBestPositions[i] = runtime.cloneDecisionVector(
          evaluation.positions[i],
        );
        personalBestObjectives[i] = [...evaluation.objectives[i]];
      }
    }

    runtime.maybeReportProgress(context);

    if (
      context.feCount >= context.settings.Max_FEs ||
      evaluation.positions.length === 0
    ) {
      break;
    }

    // 更新粒子
    for (let i = 0; i < context.settings.N; i += 1) {
      const globalBest = runtime.chooseArchiveLeader(
        context.archive,
        evaluation.positions,
        evaluation.objectives,
        context.lowerBounds,
        context.upperBounds,
      );

      for (let j = 0; j < runtime.dimension; j += 1) {
        velocities[i][j] = runtime.clamp(
          inertiaWeight * velocities[i][j] +
            c1 * Math.random() * (personalBestPositions[i][j] - positions[i][j]) +
            c2 * Math.random() * (globalBest[j] - positions[i][j]),
          vmin[j],
          vmax[j],
        );
        positions[i][j] = runtime.clamp(
          positions[i][j] + velocities[i][j],
          context.lowerBounds[j],
          context.upperBounds[j],
        );
      }
    }
  }
};

export default runPSO;
```

## 验证检查清单

转换完成后，请检查以下项目：

- [ ] 文件命名为小写 kebab-case（如 `new-algorithm.ts`）
- [ ] 导入了 `AlgorithmRunner` 类型
- [ ] 函数命名为 `runAlgorithmName`（camelCase）
- [ ] 使用 `runtime.initializationPWLCM()` 初始化种群
- [ ] 使用 `runtime.evaluatePopulation()` 评估种群
- [ ] 使用 `runtime.maybeReportProgress()` 报告进度
- [ ] 主循环检查 `context.feCount < context.settings.Max_FEs`
- [ ] 使用 `runtime.clamp()` 限制边界
- [ ] 使用 `runtime.chooseArchiveLeader()` 选择领导者
- [ ] 使用 `runtime.updateArchive()` 更新档案
- [ ] 导出为默认导出：`export default runAlgorithmName;`
- [ ] 没有使用 `Archive_X` 或 `Archive_F`，而是使用 `context.archive`
- [ ] 没有使用 `eval()` 或 `Function()` 等危险函数
- [ ] 所有数组索引从 0 开始，而不是 1

## 常见问题

### Q: 如何使用档案中的解？

A: 通过 `context.archive.archiveX` 和 `context.archive.archiveF` 访问，但更推荐使用 `runtime.chooseArchiveLeader()` 或 `runtime.chooseArchiveLeaders()`。

### Q: feCount 需要手动管理吗？

A: 大多数情况下不需要。`runtime.evaluatePopulation()` 会自动管理。只有单独评估某个解时才需要手动递增。

### Q: 如何添加算法特定的常量？

A: 在文件顶部声明为 `const`，如：
```typescript
const INERTIA_WEIGHT = 0.5;
const C1 = 1.5;
const C2 = 1.5;
```

### Q: 算法需要三个领导者（α, β, δ）怎么办？

A: 使用 `runtime.chooseArchiveLeaders()`，它返回三个决策向量的数组。

---

**最后更新**: 2026-03-29
**项目**: hobbing-ai-opt
