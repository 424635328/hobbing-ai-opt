# AI 驱动滚齿工艺优化系统

基于 `Next.js 16 + React 19 + TypeScript + Web Worker + ECharts GL` 的滚齿工艺参数智能优化演示系统。

当前工作流：

1. 输入工件材料、刀具材料、机床功率约束
2. 调用 DeepSeek 动态建模
3. 无 Key 或上游失败时自动回退到本地规则库
4. 手动选择求解算法，或上传 `.m` 文件让 AI 映射到受支持算法
5. 在浏览器端 Web Worker 中运行 MOFATA / MOGWO / MOPSO
6. 展示 3D Pareto 前沿
7. 用权重滑条通过 TOPSIS 计算推荐解
8. 生成可打印工艺卡

## 功能概览

- 动态建模 API：`app/api/build-model/route.ts`
- MATLAB 算法转换 API：`app/api/convert-matlab/route.ts`
- 共享数学模型：`lib/hobbing-model.ts`
- 本地工艺规则库：`lib/material-knowledge.ts`
- MATLAB 算法识别器：`lib/matlab-algorithm-conversion.ts`
- 多算法 Worker：`workers/mofata.worker.ts`
- 主界面：`components/HobbingOptimizerApp.tsx`
- 3D 可视化：`components/ParetoChart*.tsx`
- 工艺卡打印：`components/ProcessCard.tsx`

## 环境要求

- Node.js 20.9+
- npm 10+

## 安装依赖

```bash
npm install
```

## 环境变量

项目根目录可选创建 `.env.local`：

```env
DEEPSEEK_API_KEY=sk-xxxx
```

说明：

- 配置 `DEEPSEEK_API_KEY` 后，`/api/build-model` 会优先调用 DeepSeek
- 配置 `DEEPSEEK_API_KEY` 后，`/api/convert-matlab` 也会优先调用 DeepSeek 识别 `.m` 算法文件
- 未配置时系统不会报废，而是自动切换到本地规则库，适合课堂演示和联调
- 仓库中提供了 [.env.example](./.env.example) 作为占位模板

## 本地开发

最简单的启动方式：

```bash
npm run dev
```

打开浏览器访问：

```txt
http://localhost:3000
```

如果你需要显式指定 host / port，建议直接使用 Next CLI：

```bash
npx next dev --hostname 127.0.0.1 --port 3000
```

## 生产构建

```bash
npm run build
npm run start
```

## 界面说明

- 左侧第一块：工艺输入与 AI / fallback 建模
- 左侧第二块：算法选择、`.m` 文件转换、运行档位与优化进度
- 右侧大图：3D Pareto 前沿
- 右侧侧栏：基于 TOPSIS 的推荐解与 Top 5 候选解
- 底部：可打印工艺卡

## 文档查看

- 首页只保留文档入口按钮，不再直接内嵌全文
- 文档渲染页为 `/docs/declare`
- 原始 Markdown 文件仍保留在 `/docs/declare.md`

## 支持算法

- `MOFATA`
  - 改进海市蜃楼多目标算法
  - 适合当前滚齿工艺问题的高保真求解
- `MOGWO`
  - 多目标灰狼优化算法
  - 使用 Alpha / Beta / Delta 三层领导狼引导更新
- `MOPSO`
  - 多目标粒子群优化算法
  - 使用 PBest / GBest 与速度向量更新

## MATLAB `.m` 文件转换

- 前端允许上传 `.m` 文件并调用 `/api/convert-matlab`
- DeepSeek 可用时，优先由 AI 判断文件更接近 `MOFATA / MOGWO / MOPSO` 中哪一种
- AI 不可用或返回异常时，系统会回退到本地规则器，根据 `Levy`、`GreyWolves`、`PBest` 等特征词启发式识别
- 转换结果会被映射为浏览器 Worker 可执行的受支持算法标识，而不是直接执行原始 MATLAB 代码

## 运行档位

- `快速预览`
  - `N = 80`
  - `Max_FEs = 10000`
  - `ArchiveMaxSize = 160`
- `高精度`
  - `N = 100`
  - `Max_FEs = 30000`
  - `ArchiveMaxSize = 200`

## 验证命令

静态校验：

```bash
npm run lint
npm run build
```

当前实现已通过：

- `npm run lint`
- `npm run build`
- route handler fallback 直调验证
- 数学模型脚本验证
- 多算法与 `.m` 转换前端链路静态校验

## 已知说明

- 当前仓库已移除远程 `next/font/google` 依赖，避免在受限网络环境下构建失败
- DeepSeek 返回值会经过结构和数值区间校验，不合法时自动回退本地规则库
- 工艺卡采用浏览器打印方案，没有引入 PDF 依赖

## 后续可扩展方向

- 引入真实切削手册数据源或向量检索
- 增加 Pareto 点点击联动
- 支持导出 PDF / PNG
- 扩展 MOGWO、MOPSO 对比实验
