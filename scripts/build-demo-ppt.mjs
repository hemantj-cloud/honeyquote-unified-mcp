/**
 * Generates docs/DEMO_TOOLS_AND_WIDGETS.pptx
 * Run: npm run docs:ppt
 */
import PptxGenJS from 'pptxgenjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'docs', 'DEMO_TOOLS_AND_WIDGETS.pptx');

const ACCENT = '1B4D7A';
const MUTED = '666666';

const pptx = new PptxGenJS();
pptx.author = 'insurance-server';
pptx.title = 'Insurance MCP — Greeting widget';
pptx.layout = 'LAYOUT_16x9';

function titleSlide(title, subtitle) {
  const s = pptx.addSlide();
  s.background = { color: 'F8F9FA' };
  s.addText(title, {
    x: 0.5,
    y: 1.1,
    w: 9,
    fontSize: 32,
    bold: true,
    color: ACCENT,
    fontFace: 'Calibri',
  });
  if (subtitle) {
    s.addText(subtitle, {
      x: 0.5,
      y: 2.2,
      w: 9,
      fontSize: 14,
      color: MUTED,
      fontFace: 'Calibri',
    });
  }
  return s;
}

function bulletSlide(title, lines, opts = {}) {
  const s = pptx.addSlide();
  s.background = { color: 'F8F9FA' };
  s.addText(title, {
    x: 0.5,
    y: 0.35,
    w: 9,
    fontSize: 22,
    bold: true,
    color: ACCENT,
    fontFace: 'Calibri',
  });
  s.addText(lines.join('\n'), {
    x: 0.5,
    y: 0.95,
    w: 9,
    h: 4.5,
    fontSize: opts.fontSize ?? 12,
    color: '333333',
    fontFace: 'Calibri',
    lineSpacing: 20,
  });
  return s;
}

function addTableSlide(title, headerRow, dataRows, colW) {
  const s = pptx.addSlide();
  s.background = { color: 'F8F9FA' };
  s.addText(title, {
    x: 0.5,
    y: 0.3,
    w: 9,
    fontSize: 20,
    bold: true,
    color: ACCENT,
    fontFace: 'Calibri',
  });
  const nCol = headerRow.length;
  const defaultColW = [0.5, 3.2, 2.2, 2.0];
  const rows = [
    headerRow.map((c) => ({ text: c, options: { bold: true, fill: { color: 'D6E4F0' } } })),
    ...dataRows.map((r) => r.map((c) => ({ text: c }))),
  ];
  s.addTable(rows, {
    x: 0.4,
    y: 0.9,
    w: 9.0,
    colW: colW ?? defaultColW.slice(0, nCol),
    fontSize: 9,
    fontFace: 'Calibri',
    border: { type: 'solid', color: 'CCCCCC', pt: 0.5 },
  });
  return s;
}

titleSlide('Insurance MCP server', 'Greeting-only demo — single tool & widget\nAligned with src/insurance/insurance.controller.ts');

bulletSlide('Important disclaimer', [
  'This deck supports live demos and walkthroughs.',
  '',
  'Demo experience — not underwriting, eligibility, or a bindable insurance offer.',
]);

bulletSlide('Quick setup for a demo', [
  '1. Copy .env.example → .env (RESOURCE_URI, AUTH_SERVER_URL, optional TOKEN_AUDIENCE, TOKEN_ISSUER). See OAUTH_SETUP.md.',
  '2. From repo root: npm install && npm run dev',
  '3. Use NitroStudio or any MCP client — invoke get_insurance_greeting to load the welcome widget.',
  '4. Optional: npm --prefix src/widgets run dev — Next.js widgets on port 3001 (default route is the greeting).',
]);

bulletSlide('How tools map to widgets', [
  '@Widget("greeting") in src/insurance/insurance.controller.ts pairs tool JSON with route /greeting.',
  'Sample data: src/widgets/widget-manifest.json (examples[].data).',
  'useToolPayload (src/widgets/lib/use-tool-payload.ts) reads props or window.openai.toolOutput in embedded UIs.',
]);

addTableSlide(
  'Master reference — tools & widgets',
  ['#', 'MCP tool', 'Title', 'Widget ID'],
  [['1', 'get_insurance_greeting', 'Insurance greeting', 'greeting']],
);

bulletSlide('Suggested demo flow', [
  '1. Invoke get_insurance_greeting — empty input {}.',
  '2. The greeting widget appears immediately with journey steps and a primary action to continue the conversation.',
  '3. Root URL / in the widget app also shows the same screen (no extra navigation).',
], { fontSize: 12 });

addTableSlide(
  'Widget index (Next.js)',
  ['Route', 'Source', 'Tool'],
  [['/', 'app/page.tsx + app/greeting/GreetingHero.tsx', 'get_insurance_greeting'], ['/greeting', 'app/greeting/page.tsx', 'get_insurance_greeting']],
);

bulletSlide('Other capabilities (not MCP “tools”)', [
  'OAuth 2.1 — src/app.module.ts (OAuthModule.forRoot). Scopes: read, write, admin.',
  'System health — src/health/system.health.ts: memory, uptime (ops use).',
  '',
  'Regenerate this deck: npm run docs:ppt  →  docs/DEMO_TOOLS_AND_WIDGETS.pptx',
]);

await pptx.writeFile({ fileName: outPath });
console.log('Wrote', outPath);
