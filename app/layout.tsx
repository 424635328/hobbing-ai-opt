import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 驱动滚齿工艺优化系统",
  description: "面向滚齿加工参数优化的 AI 动态建模与多目标寻优演示系统。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
