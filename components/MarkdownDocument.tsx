import { Fragment, type ReactNode } from "react";

type MarkdownBlock =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

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

function isOrderedListItem(line: string): boolean {
  return /^\d+\.\s+/.test(line);
}

function getOrderedListItemText(line: string): string {
  return line.replace(/^\d+\.\s+/, "").trim();
}

function splitTableRow(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let inCodeSpan = false;

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    const previousCharacter = index > 0 ? trimmed[index - 1] : "";

    if (character === "`" && previousCharacter !== "\\") {
      inCodeSpan = !inCodeSpan;
      current += character;
      continue;
    }

    if (character === "|" && !inCodeSpan && previousCharacter !== "\\") {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);

  return (
    cells.length > 0 &&
    cells.every((cell) => {
      const normalized = cell.replace(/\s+/g, "");
      return /^:?-{3,}:?$/.test(normalized);
    })
  );
}

function isTableHeaderRow(line: string, nextLine: string | undefined): boolean {
  if (!line.includes("|") || !nextLine) {
    return false;
  }

  const headerCells = splitTableRow(line);
  return headerCells.length > 1 && isTableSeparator(nextLine);
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    const nextLine = lines[index + 1]?.trim();

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

    if (isTableHeaderRow(line, nextLine)) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];

      index += 2;

      while (index < lines.length) {
        const current = lines[index].trim();

        if (!current || !current.includes("|") || isTableSeparator(current)) {
          break;
        }

        rows.push(splitTableRow(current));
        index += 1;
      }

      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];

      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().slice(2).trim());
        index += 1;
      }

      blocks.push({ type: "unordered-list", items });
      continue;
    }

    if (isOrderedListItem(line)) {
      const items: string[] = [];

      while (index < lines.length && isOrderedListItem(lines[index].trim())) {
        items.push(getOrderedListItemText(lines[index].trim()));
        index += 1;
      }

      blocks.push({ type: "ordered-list", items });
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
        current.startsWith("- ") ||
        isOrderedListItem(current) ||
        isTableHeaderRow(current, lines[index + 1]?.trim())
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

        if (block.type === "unordered-list") {
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

        if (block.type === "ordered-list") {
          return (
            <ol
              key={`${block.type}-${index}`}
              className="grid gap-3 rounded-[24px] border border-border/80 bg-white/70 p-5 text-sm leading-7 text-muted"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${index}-${itemIndex}`} className="grid grid-cols-[auto_1fr] gap-3">
                  <span className="font-semibold text-accent">{itemIndex + 1}.</span>
                  <span>{renderInline(item)}</span>
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === "table") {
          return (
            <div
              key={`${block.type}-${index}`}
              className="overflow-x-auto rounded-[24px] border border-border/80 bg-white/80"
            >
              <table className="min-w-full border-collapse text-sm leading-7 md:text-base">
                <thead className="bg-[#f4efe0]/80 text-foreground">
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th
                        key={`${header}-${headerIndex}`}
                        className="border-b border-border/80 px-4 py-3 text-left font-semibold align-top"
                      >
                        {renderInline(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr
                      key={`${row.join("|")}-${rowIndex}`}
                      className={rowIndex % 2 === 0 ? "bg-white/60" : "bg-[#fffaf0]/80"}
                    >
                      {block.headers.map((_, cellIndex) => (
                        <td
                          key={`${rowIndex}-${cellIndex}`}
                          className="border-t border-border/60 px-4 py-3 align-top text-muted"
                        >
                          {renderInline(row[cellIndex] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
