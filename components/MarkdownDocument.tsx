import { Fragment, type ReactNode } from "react";

type MarkdownBlock =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

function renderInline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${part}-${index}`}
          className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[0.95em] text-accent"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: line.slice(2).trim() });
      index += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3).trim() });
      index += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({ type: "h3", text: line.slice(4).trim() });
      index += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];

      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().slice(2).trim());
        index += 1;
      }

      blocks.push({ type: "list", items });
      continue;
    }

    const paragraphLines: string[] = [];

    while (index < lines.length) {
      const current = lines[index].trim();

      if (
        !current ||
        current.startsWith("# ") ||
        current.startsWith("## ") ||
        current.startsWith("### ") ||
        current.startsWith("- ")
      ) {
        break;
      }

      paragraphLines.push(current);
      index += 1;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.join(" "),
    });
  }

  return blocks;
}

export default function MarkdownDocument({ content }: { content: string }) {
  const blocks = parseMarkdown(content);

  return (
    <article className="space-y-6">
      {blocks.map((block, index) => {
        if (block.type === "h1") {
          return (
            <h1
              key={`${block.type}-${index}`}
              className="text-3xl font-semibold tracking-tight text-foreground md:text-5xl"
            >
              {renderInline(block.text)}
            </h1>
          );
        }

        if (block.type === "h2") {
          return (
            <section key={`${block.type}-${index}`} className="space-y-3 pt-2">
              <h2 className="text-2xl font-semibold text-foreground">
                {renderInline(block.text)}
              </h2>
            </section>
          );
        }

        if (block.type === "h3") {
          return (
            <h3
              key={`${block.type}-${index}`}
              className="text-lg font-semibold text-foreground"
            >
              {renderInline(block.text)}
            </h3>
          );
        }

        if (block.type === "list") {
          return (
            <ul
              key={`${block.type}-${index}`}
              className="grid gap-2 rounded-[24px] border border-border/80 bg-white/70 p-5 text-sm leading-7 text-muted"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${index}-${itemIndex}`} className="flex gap-3">
                  <span className="mt-[0.55rem] h-1.5 w-1.5 rounded-full bg-accent" />
                  <span>{renderInline(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p
            key={`${block.type}-${index}`}
            className="text-sm leading-8 text-muted md:text-base"
          >
            {renderInline(block.text)}
          </p>
        );
      })}
    </article>
  );
}
