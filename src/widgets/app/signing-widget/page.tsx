'use client';

import { useEffect, useRef, useState } from 'react';
import { useWidgetSDK } from '@nitrostack/widgets';

const DEPLOYED_MCP_ORIGIN = 'https://honeyquote-chatapp-6ae1ced1-abhijits-org-33666fb0.app.nitrocloud.ai';

function mcpOriginFrom(url: string | undefined): string | null {
  if (!url || !url.startsWith('http')) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.startsWith('nitrochat-') || parsed.hostname.startsWith('hq-workflow-')) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function safeHttpUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('http')) return '';
  try {
    const url = new URL(value);
    const localHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol === 'https:' || (url.protocol === 'http:' && localHost)) return url.href;
  } catch {}
  return '';
}

export default function SigningWidget() {
  const { getToolOutput } = useWidgetSDK();
  const sdkOutput = getToolOutput<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const announcedRef = useRef(false);

  const raw = sdkOutput?.internal || sdkOutput?.data || sdkOutput || {};
  const authenticated = raw.authenticated !== false && sdkOutput?.internal?.authenticated !== false;
  const signingUrl = safeHttpUrl(raw.signingUrl || sdkOutput?.signingUrl);
  const alreadySigned = raw.signed === true || raw.signatureStatus === 'signed';
  const carrier = raw.carrier || 'Citizens Property Insurance';
  const policyNumber = raw.policyNumber || '';
  const customerName = String(raw.customerName || '').trim();
  const ticketId = raw.ticketId || '';
  const workflowApiUrl = (() => {
    const fromTool = mcpOriginFrom(raw.workflowApiUrl || sdkOutput?.workflowApiUrl);
    if (fromTool) return fromTool;
    if (
      typeof window !== 'undefined' &&
      (window.location.hostname.startsWith('honeyquote-chatapp-') ||
        ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
          window.location.port === '3000'))
    ) {
      return window.location.origin;
    }
    return DEPLOYED_MCP_ORIGIN;
  })();
  const signingStatusUrl = (() => {
    const rawUrl = String(raw.signingStatusUrl || '');
    if (!rawUrl) return `${workflowApiUrl}/signing/status`;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname.startsWith('nitrochat-') || parsed.hostname.startsWith('hq-workflow-')) {
        return `${workflowApiUrl}${parsed.pathname}${parsed.search}`;
      }
      return rawUrl;
    } catch {
      return `${workflowApiUrl}/signing/status`;
    }
  })();

  const [opened, setOpened] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<'pending' | 'signed'>(alreadySigned ? 'signed' : 'pending');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let lastHeight = -1;
    const notifyHeight = () => {
      const height = !authenticated || !signingUrl ? 0 : Math.max(el.scrollHeight + 24, 220);
      if (height === lastHeight) return;
      lastHeight = height;
      window.parent.postMessage(
        { type: 'nitro:set_height', widgetId: (window as any).openai?.widgetId, height },
        '*'
      );
    };
    notifyHeight();
    const observer = new ResizeObserver(notifyHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [authenticated, signingUrl, signatureStatus, opened, popupBlocked]);

  useEffect(() => {
    if (!authenticated || !signingUrl || !ticketId || signatureStatus === 'signed') return;
    let active = true;
    let attempts = 0;

    const refresh = async () => {
      try {
        const resp = await fetch(`${signingStatusUrl}?ticketId=${encodeURIComponent(ticketId)}`);
        if (!resp.ok) return;
        const result = await resp.json();
        if (!active || !result?.signed) return;
        setSignatureStatus('signed');
        if (announcedRef.current) return;
        announcedRef.current = true;
        const sdk = (window as any).openai;
        if (typeof sdk?.callTool === 'function') {
          void sdk.callTool('hq_docusign_status', { ticketId }).catch(() => {});
        }
      } catch {}
    };

    void refresh();
    const timer = setInterval(() => {
      if (++attempts >= 60) {
        clearInterval(timer);
        return;
      }
      void refresh();
    }, 5000);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [authenticated, signingUrl, ticketId, signingStatusUrl, signatureStatus]);

  const openSigning = () => {
    if (!signingUrl || signatureStatus === 'signed') return;
    setOpened(true);
    try {
      const sdk = (window as any).openai;
      if (typeof sdk?.openExternal === 'function') {
        sdk.openExternal({ href: signingUrl });
        setPopupBlocked(false);
      } else {
        const win = window.open(signingUrl, '_blank');
        if (win) win.opener = null;
        else setPopupBlocked(true);
      }
    } catch {
      setPopupBlocked(true);
    }
  };

  if (!authenticated || !signingUrl) {
    return <div ref={containerRef} />;
  }

  const firstName = customerName.split(/\s+/)[0];

  return (
    <div
      ref={containerRef}
      style={{
        padding: '12px 16px',
        maxWidth: '520px',
        margin: '0 auto',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '18px 20px 14px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #0F533A 0%, #177C56 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              color: '#FFFFFF',
              flexShrink: 0,
            }}
          >
            ✍️
          </div>
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#177C56',
              }}
            >
              Document signing
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginTop: '1px' }}>{carrier}</div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>
              {policyNumber ? `Policy #${policyNumber}` : 'Renewal document'}
              {firstName ? ` • ${firstName}` : ''}
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 20px' }}>
          {signatureStatus === 'signed' ? (
            <div
              style={{
                width: '100%',
                padding: '20px',
                borderRadius: '12px',
                background: '#DCFCE7',
                border: '1px solid #16A34A',
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                Document signed
              </div>
              <div style={{ fontSize: '13px', color: '#64748B' }}>
                Your renewal document is signed. The policy card will update in the chat.
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={openSigning}
              style={{
                width: '100%',
                padding: '16px 24px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #177C56 0%, #0F533A 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 700,
                fontSize: '16px',
                letterSpacing: '-0.01em',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(23, 124, 86, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '18px' }}>✍️</span>
              <span>Sign document</span>
              <span style={{ fontSize: '18px', marginLeft: '4px' }}>→</span>
            </button>
          )}

          {opened && signatureStatus === 'pending' && (
            <div
              style={{
                marginTop: '12px',
                textAlign: 'center',
                fontSize: '12px',
                color: '#16A34A',
                fontWeight: 600,
              }}
            >
              DocuSign opened — this card updates after you sign.
            </div>
          )}

          {signatureStatus === 'pending' && (
            <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '12px', color: '#64748B', lineHeight: 1.5 }}>
              {popupBlocked ? 'Your browser blocked the signing tab. ' : 'Or '}
              <a href={signingUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#177C56', fontWeight: 600 }}>
                open the signing link
              </a>
            </div>
          )}
        </div>

        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid #E2E8F0',
            background: '#FAFAFA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#64748B',
          }}
        >
          <div>Secure electronic signature</div>
          <div>
            Powered by <strong style={{ color: '#0F172A' }}>DocuSign</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
