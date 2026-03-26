import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";

import MarkdownDocument from "@/components/MarkdownDocument";

export const metadata: Metadata = {
  title: "参数说明文档",
  description: "滚齿工艺参数优化系统的材料、功率约束与算法说明文档。",
};

async function loadDeclareMarkdown(): Promise<string> {
  const filePath = path.join(process.cwd(), "public", "docs", "declare.md");
  return readFile(filePath, "utf8");
}

export default async function DeclareDocPage() {
  const content = await loadDeclareMarkdown();

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 md:px-8 lg:py-10">
      <div className="rounded-[32px] border border-border bg-surface p-6 shadow-[var(--shadow)] backdrop-blur md:p-8">
        <div className="flex flex-col gap-4 border-b border-border/80 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
              Markdown Doc
            </p>
            <p className="mt-3 text-sm leading-7 text-muted md:text-base">
              当前页面会读取 `public/docs/declare.md` 的内容，并以 TSX 页面形式进行渲染。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-full border border-border bg-white/80 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
            >
              返回主页
            </Link>
            <a
              href="/docs/declare.md"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-border bg-white/80 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
            >
              查看原始 Markdown
            </a>
          </div>
        </div>

        <div className="mt-8 rounded-[28px] border border-border/80 bg-[#fffdf7] p-6 md:p-8">
          <MarkdownDocument content={content} />
        </div>
      </div>
    </main>
  );
}
