import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked } from 'marked';
import { format } from 'prettier';
import { createHighlighter } from 'shiki';

const demoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(demoRoot, '../packages/theme-ios27/docs/special-markup.md');
const outputPath = resolve(demoRoot, 'src/app/docs/docs-content.generated.ts');

const markdown = await readFile(sourcePath, 'utf8');
const markdownBody = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
const markdownWithPreviews = markdownBody.replace(
  /```html preview\r?\n([\s\S]*?)```/g,
  (_match, code) =>
    `\`\`\`html\n${code}\`\`\`\n\n<figure class="docs-example">\n<figcaption>Preview</figcaption>\n${code.trim()}\n</figure>`,
);
const highlighter = await createHighlighter({
  themes: ['github-dark'],
  langs: ['html', 'css'],
});
const highlightedBlocks = [];
const markdownWithCodePlaceholders = markdownWithPreviews.replace(/```([\w-]+)?\r?\n([\s\S]*?)```/g, (_match, language = 'text', code) => {
  const highlighted = highlighter.codeToHtml(code.replace(/\r?\n$/, ''), {
    lang: highlighter.getLoadedLanguages().includes(language) ? language : 'text',
    theme: 'github-dark',
    colorReplacements: {
      '#24292e': '#151e2c',
      '#6a737d': '#a0aab5',
    },
  });
  const index = highlightedBlocks.push(`<div class="code-block-container">${highlighted}</div>`) - 1;
  return `<div data-docs-code-block="${index}"></div>`;
});
let html = await marked.parse(markdownWithCodePlaceholders, {
  gfm: true,
  walkTokens(token) {
    if (token.type === 'link' && !/^(?:[a-z]+:|#|\/\/)/i.test(token.href)) {
      token.href = new URL(token.href, 'https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/').href;
    }
  },
});
html = html.replace(/<div data-docs-code-block="(\d+)"><\/div>/g, (_match, index) => highlightedBlocks[Number(index)]);
highlighter.dispose();
const generatedSource = await format(
  `// Generated from packages/theme-ios27/docs/special-markup.md. Do not edit directly.\nexport const docsContentHtml = ${JSON.stringify(html)};\n`,
  { parser: 'typescript', printWidth: 140 },
);

await writeFile(outputPath, generatedSource);
