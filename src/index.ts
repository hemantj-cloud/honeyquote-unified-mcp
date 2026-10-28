/**
 * HoneyQuote Unified Clean MCP Server
 *
 * Single-process, high-performance MCP server built on the NitroStack TypeScript SDK.
 * Consolidates customer quoting, zero-trust servicing inspection, Stripe payments,
 * and HITL underwriting reviews with zero child processes and zero inter-process HTTP hops.
 */

import 'dotenv/config';
import { DIContainer, McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from './app.module.js';
import { SigningService, signingReturnHtml } from './modules/servicing/signing.service.js';
import { ServicingService } from './modules/servicing/servicing.service.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  // Prevent EOF on process.stdin from terminating the dual-mode HTTP/SSE daemon
  process.stdin.resume();
  setInterval(() => {}, 60000);

  // Create and start the unified MCP server
  const server = (await McpApplicationFactory.create(AppModule)) as any;
  await server.start();

  // Attach static widget serving to the underlying Express app
  if (server._httpTransport && typeof server._httpTransport.getApp === 'function') {
    const app = server._httpTransport.getApp();
    const candidateDirs = [
      path.resolve(__dirname, '../src/widgets/out'),
      path.resolve(__dirname, './widgets/out'),
      path.resolve(process.cwd(), 'src/widgets/out'),
      path.resolve(process.cwd(), 'widgets/out'),
    ];
    const widgetsDir = candidateDirs.find((dir) => fs.existsSync(dir));

    if (widgetsDir) {
      // Serve /widgets/:file
      app.get('/widgets/:file', (req: any, res: any, next: any) => {
        const fileName = req.params.file.endsWith('.html') ? req.params.file : `${req.params.file}.html`;
        const filePath = path.join(widgetsDir, fileName);
        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.sendFile(filePath);
        }
        next();
      });

      // Serve /widgets/stripe-payment-widget or root-level fallback
      app.get('/stripe-payment-widget.html', (_req: any, res: any) => {
        const p = path.join(widgetsDir, 'stripe-payment-widget.html');
        if (fs.existsSync(p)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.sendFile(p);
        }
        res.status(404).send('Not Found');
      });

      console.log(`[widgets] Serving static widget HTML from: ${widgetsDir}`);
    }

    const container = DIContainer.getInstance();
    registerSigningRoutes(app, container.resolve(SigningService));
    registerDocumentUploadRoutes(app, container.resolve(ServicingService));
  }
}

function registerSigningRoutes(app: any, signing: SigningService) {
  const noStore = (res: any) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
  };

  app.get('/signing/start', async (req: any, res: any) => {
    noStore(res);
    try {
      res.redirect(303, await signing.recipientViewUrl(req.query.token));
    } catch (err: any) {
      console.warn('[signing] start failed:', err?.message || err);
      res.status(400).type('text').send('Signing could not be opened. Return to your chat to retry or request a new link.');
    }
  });

  app.get('/signing/return', async (req: any, res: any) => {
    noStore(res);
    try {
      const { state, chatUrl } = await signing.returnState(req.query.token);
      res.type('html').send(signingReturnHtml(state, chatUrl));
    } catch (err: any) {
      console.warn('[signing] return failed:', err?.message || err);
      res.status(400).type('text').send('Unable to verify signing. Return to your chat to check document status.');
    }
  });

  // Polled by the policy card; reports only whether the current document is signed.
  app.get('/signing/status', async (req: any, res: any) => {
    noStore(res);
    res.set('Access-Control-Allow-Origin', '*');
    const ticketId = typeof req.query.ticketId === 'string' ? req.query.ticketId.trim() : '';
    if (!/^[A-Z0-9-]{4,40}$/i.test(ticketId)) return res.status(400).json({ ok: false, error: 'ticketId required' });
    try {
      const status = await signing.signatureStatus(ticketId);
      res.json({ ok: true, ticketId, signed: status.signed, signatureStatus: status.signatureStatus });
    } catch {
      res.status(503).json({ ok: false, error: 'Unable to check signing status' });
    }
  });

  // Sign Now opens DocuSign from the card. This stays off the chat tool path so the
  // "Click here to sign" message is not posted.
  const allowPrepare = (res: any) => {
    noStore(res);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  };
  app.options('/signing/prepare', (_req: any, res: any) => {
    allowPrepare(res);
    res.status(204).end();
  });
  app.post('/signing/prepare', async (req: any, res: any) => {
    allowPrepare(res);
    const ticketId = typeof req.query.ticketId === 'string' ? req.query.ticketId.trim() : '';
    if (!/^[A-Z0-9-]{4,40}$/i.test(ticketId)) return res.status(400).json({ ok: false, error: 'ticketId required' });
    const force = req.query.force === '1' || req.query.force === 'true';
    try {
      const result = await signing.prepareSignature(ticketId, { force });
      res.json(result);
    } catch (err: any) {
      console.warn('[signing] prepare failed:', err?.message || err);
      res.status(503).json({ ok: false, error: 'Unable to prepare signing' });
    }
  });

  console.log(
    `[signing] Registered /signing/start, /signing/return, /signing/status, /signing/prepare (DocuSign ${
      process.env.DOCUSIGN_JWT_CLIENT_ID || process.env.DOCUSIGN_ACCESS_TOKEN ? 'configured' : 'NOT configured'
    }, policy PDF ${signing.hasPolicyDocument() ? 'found' : 'MISSING'})`
  );
}

function registerDocumentUploadRoutes(app: any, servicing: ServicingService) {
  const cors = (res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Cache-Control', 'no-store');
  };

  app.options('/api/policy/document/upload', (_req: any, res: any) => {
    cors(res);
    res.status(204).end();
  });

  app.get('/api/policy/document/status', async (req: any, res: any) => {
    cors(res);
    const ticketId = typeof req.query.ticketId === 'string' ? req.query.ticketId.trim() : '';
    if (!/^[A-Z0-9-]{4,40}$/i.test(ticketId)) {
      return res.status(400).json({ ok: false, error: 'ticketId required' });
    }
    try {
      res.json(await servicing.supportingDocumentStatus(ticketId));
    } catch (err: any) {
      console.warn('[documents] status failed:', err?.message || err);
      res.status(503).json({ ok: false, error: 'Unable to read document status' });
    }
  });

  // The checklist stays open until this call stores the file and updates documentStatus.
  app.post('/api/policy/document/upload', async (req: any, res: any) => {
    cors(res);
    try {
      const body = await readJsonBody(req);
      const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : '';
      if (!/^[A-Z0-9-]{4,40}$/i.test(ticketId)) {
        return res.status(400).json({ ok: false, error: 'ticketId required' });
      }
      const result = await servicing.recordSupportingDocument({
        ticketId,
        fileName: body.fileName,
        docType: body.docType,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
      });
      res.status(result.statusCode).json(result);
    } catch (err: any) {
      console.warn('[documents] upload failed:', err?.message || err);
      res.status(503).json({ ok: false, error: 'Unable to save the document' });
    }
  });

  console.log('[documents] Registered POST /api/policy/document/upload and GET /api/policy/document/status');
}

function readJsonBody(req: any): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body as Record<string, unknown>);
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start HoneyQuote Unified MCP server:', error);
  process.exit(1);
});
