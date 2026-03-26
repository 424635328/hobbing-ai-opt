import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["echarts", "zrender", "echarts-gl"],
};

export default nextConfig;
