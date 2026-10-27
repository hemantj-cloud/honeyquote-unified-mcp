/**
 * After `next build` + static export, HTML references `/_next/static/...` which does not
 * resolve when the document is embedded (MCP iframe / blob / srcdoc). Inline CSS + JS so the
 * greeting widget (and other routes) hydrate offline — same approach as @nitrostack/core's
 * inlineHtmlWithAssets().
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const widgetsOut = path.resolve(__dirname, '../src/widgets/out');

function inlineHtmlWithAssets(htmlPath, outDir) {
  let html = fs.readFileSync(htmlPath, 'utf8');

  html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/g, (_m, href) => {
    try {
      const cleanHref = href.startsWith('/') ? href.slice(1) : href;
      const cssPath = path.join(outDir, cleanHref);
      const css = fs.readFileSync(cssPath, 'utf8');
      return `<style>${css}</style>`;
    } catch {
      console.error(`[inline-widget-html] skip CSS (missing?): ${href}`);
      return '';
    }
  });

  html = html.replace(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/g, (_m, src) => {
    try {
      const cleanSrc = src.startsWith('/') ? src.slice(1) : src;
      const jsPath = path.join(outDir, cleanSrc);
      const js = fs.readFileSync(jsPath, 'utf8');
      return `<script>${js}</script>`;
    } catch {
      console.error(`[inline-widget-html] skip script (missing?): ${src}`);
      return '';
    }
  });

  html = html.replace(/<link[^>]*rel=["']preload["'][^>]*>/g, '');
  return html;
}

function main() {
  if (!fs.existsSync(widgetsOut)) {
    console.error('[inline-widget-html] missing:', widgetsOut);
    process.exit(1);
  }

  const entries = fs.readdirSync(widgetsOut, { withFileTypes: true });
  const htmlFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.html')).map((e) => e.name);

  if (htmlFiles.length === 0) {
    console.error('[inline-widget-html] no .html files in', widgetsOut);
    process.exit(1);
  }

  const outDir = widgetsOut;
  for (const name of htmlFiles) {
    const htmlPath = path.join(widgetsOut, name);
    const inlined = inlineHtmlWithAssets(htmlPath, outDir);
    fs.writeFileSync(htmlPath, inlined, 'utf8');
    console.error(`[inline-widget-html] inlined assets → src/widgets/out/${name}`);
  }
}

main();
