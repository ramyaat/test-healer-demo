/**
 * HTML Generator - converts markdown to styled HTML reports
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface Section {
  content: string;
  header?: string;
  type: "iteration" | "normal";
}

function parseSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const lines = markdown.split("\n");
  let currentSection: Section | null = null;

  for (const line of lines) {
    const isIterationHeader = /^## .*?Iteration/i.test(line);

    if (isIterationHeader) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        type: "iteration",
        header: line.replace(/^## /, "").trim(),
        content: "",
      };
    } else if (/^## /.test(line) && currentSection?.type === "iteration") {
      sections.push(currentSection);
      currentSection = {
        type: "normal",
        content: line + "\n",
      };
    } else {
      if (!currentSection) {
        currentSection = { type: "normal", content: "" };
      }
      currentSection.content += line + "\n";
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

function renderSections(sections: Section[]): string {
  let html = "";
  for (const section of sections) {
    if (section.type === "iteration") {
      const processedContent = processMarkdown(section.content);
      html += `<details><summary>${escapeHtml(section.header || "")}</summary>${processedContent}</details>`;
    } else {
      html += processMarkdown(section.content);
    }
  }
  return html;
}

export function markdownToHtml(markdown: string): string {
  if (!markdown) return "";

  const sections = parseSections(markdown);
  return renderSections(sections);
}

function processMarkdown(markdown: string): string {
  let html = escapeHtml(markdown);

  // Handle code blocks first (before converting newlines)
  html = html.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_match: string, _lang: string | undefined, code: string) =>
      `<pre><code>${code.trim()}</code></pre>`,
  );

  // Handle inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Handle headers
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // Handle bold
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // Handle horizontal rules
  html = html.replace(/^---$/gim, "<hr>");

  // Handle lists
  html = html.replace(/^- (.*$)/gim, "<li>$1</li>");
  html = html.replace(/(<li>.*?<\/li>(?:\s*<li>.*?<\/li>)*)/gs, "<ul>$1</ul>");

  // Handle emojis and icons (preserve them as-is)
  // Convert newlines to breaks (but not inside code blocks or other special elements)
  html = html.replace(/\n/g, "<br>\n");

  return html;
}

export function generateHtmlReport(
  markdown: string,
  reportTitle: string,
  startTime: number,
  totalInputTokens: number,
  totalOutputTokens: number,
  totalCostUsd: number,
): string {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const costDurationInfo = `\n\n**Cost:** $${totalCostUsd.toFixed(4)} (SDK reported) | **Duration:** ${duration}s\n\n`;

  const markdownWithCost = markdown + costDurationInfo;
  const html = markdownToHtml(markdownWithCost);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(reportTitle)}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1.6;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f9fafb;
        }
        
        h1 { color: #1a1a1a; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        h2 { color: #374151; margin-top: 20px; }
        h3 { color: #6b7280; }
        
        pre {
            background: #1f2937;
            color: #f3f4f6;
            padding: 15px;
            overflow-x: auto;
            border-radius: 6px;
            margin: 10px 0;
        }
        
        code {
            background: #e5e7eb;
            color: #1f2937;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
        }
        
        pre code {
            background: none;
            color: #f3f4f6;
            padding: 0;
            font-size: 0.85em;
        }
        
        details {
            margin: 15px 0;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            background: white;
        }
        
        summary {
            padding: 12px;
            cursor: pointer;
            font-weight: 600;
            color: #1f2937;
            background: #f3f4f6;
            border-radius: 6px;
            user-select: none;
        }
        
        summary:hover {
            background: #e5e7eb;
        }
        
        details[open] summary {
            border-bottom: 1px solid #d1d5db;
            border-radius: 6px 6px 0 0;
        }
        
        details > *:not(summary) {
            padding: 15px;
        }
        
        hr {
            border: none;
            border-top: 1px solid #e5e7eb;
            margin: 20px 0;
        }
        
        ul {
            padding-left: 20px;
        }
        
        li {
            margin: 5px 0;
        }
        
        strong {
            color: #1f2937;
            font-weight: 600;
        }
        
        /* Improve emoji rendering */
        body {
            font-feature-settings: "kern" 1;
            text-rendering: optimizeLegibility;
        }
    </style>
</head>
<body>
    <h1>${escapeHtml(reportTitle)}</h1>
    ${html}
</body>
</html>`;
}
