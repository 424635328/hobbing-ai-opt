/** @type {import("./lib/algorithm-config-types").AlgorithmConfigFile} */
const algorithmConfig = {
  defaultAlgorithm: "mofata",
  algorithms: [
    {
      id: "mofata",
      entry: "mofata",
      label: "MOFATA",
      description: "改进海市蜃楼多目标算法，适合当前滚齿工艺问题的高保真求解。",
      matlabHints: ["Levy", "surrogate_fit", "cumtrapz", "Elite_position"],
      features: [
        "Levy飞行变异机制",
        "积分排名选择策略",
        "混沌映射初始化",
        "自适应参数调整",
        "精英存档更新",
      ],
      useCases: [
        "高精度滚齿工艺优化",
        "复杂约束多目标问题",
        "工程设计参数寻优",
        "需要高稳定性的应用",
      ],
      strengths: ["收敛速度快", "解集分布均匀", "跳出局部最优能力强", "计算效率高"],
    },
    {
      id: "mogwo",
      entry: "mogwo",
      label: "MOGWO",
      description: "多目标灰狼优化算法，使用 Alpha/Beta/Delta 领导层更新种群。",
      matlabHints: ["GreyWolves", "Alpha_pos", "Beta_pos", "Delta_pos"],
      features: ["狼群社会等级机制", "三领导搜索策略", "包围捕猎行为", "自适应收敛因子"],
      useCases: ["快速多目标优化", "实时决策系统", "资源分配问题", "组合优化任务"],
      strengths: ["实现简单", "参数少易调优", "探索能力强", "鲁棒性好"],
    },
    {
      id: "mopso",
      entry: "mopso",
      label: "MOPSO",
      description: "多目标粒子群优化算法，使用 PBest、GBest 和速度更新机制。",
      matlabHints: ["Particles_Vel", "PBest", "GBest", "Vmax"],
      features: [
        "粒子速度更新",
        "个人最优记忆",
        "全局最优引导",
        "速度限制机制",
        "外部存档维护",
      ],
      useCases: ["连续优化问题", "动态环境适应", "多模态函数优化", "大规模参数搜索"],
      strengths: ["收敛速度极快", "适合连续空间", "易于并行化", "记忆性好"],
    },
  ],
};

export default algorithmConfig;

