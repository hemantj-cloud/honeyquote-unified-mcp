'use client';

import { useEffect, useRef, useState } from 'react';
import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

interface PaymentWidgetData {
  checkoutUrl?: string;
  checkoutSessionId?: string;
  receiptId?: string;
  carrier?: string;
  premiumAmount?: number;
  policyNumber?: string;
  customerEmail?: string;
  ticketId?: string;
  paymentStatus?: string;
  transactionTimestamp?: string;
  workflowApiUrl?: string;
}

export default function StripePayButtonWidget() {
  const { getToolOutput } = useWidgetSDK();
  const sdkOutput = getToolOutput<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  // Force signature HoneyQuote branded light theme per design specification
  const isDark = false;

  const rawData: PaymentWidgetData =
    sdkOutput?.internal || sdkOutput?.data || sdkOutput || {};

  const carrier = rawData.carrier || sdkOutput?.carrier || 'Citizens Property Insurance';
  const premium = Number(rawData.premiumAmount || sdkOutput?.premiumAmount || 1842.00);
  const policyNumber = rawData.policyNumber || sdkOutput?.policyNumber || 'HQ-POL-88421';
  const email = rawData.customerEmail || sdkOutput?.customerEmail || '';
  const checkoutUrl = rawData.checkoutUrl || sdkOutput?.checkoutUrl || 'https://checkout.stripe.com';
  const receiptId = rawData.receiptId || sdkOutput?.receiptId || `rcpt_renew_${Date.now()}`;
  const checkoutSessionId = rawData.checkoutSessionId || sdkOutput?.checkoutSessionId || '';
  const ticketId = rawData.ticketId || 'HQ-DEMO-001';
  const workflowApiUrl =
    rawData.workflowApiUrl ||
    sdkOutput?.workflowApiUrl ||
    (typeof window !== 'undefined' && window.location.hostname.includes('nitrocloud.ai')
      ? 'https://hq-workflow-6adb190c-abhijits-org-33666fb0.app.nitrocloud.ai'
      : 'http://localhost:3012');

  // Stripe Checkout redirects back to this same page after payment. Detect the
  // return params, show a receipt, and self-close — the tab was script-opened
  // by window.open, so window.close() is allowed.
  const urlParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isCancelledReturn = urlParams?.get('payment') === 'cancelled';
  const isReturnLanding = Boolean(urlParams?.get('session_id') || isCancelledReturn);

  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'error'>('pending');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Self-close the tab upon returning from Stripe Checkout.
  // Browsers allow scripts to close a window if it was opened by script or
  // if window.open('', '_self') claims the window.
  useEffect(() => {
    if (!isReturnLanding) return;

    const attemptClose = () => {
      try {
        window.close();
      } catch {}
      try {
        window.open('', '_self');
        window.close();
      } catch {}
    };

    // Try immediately
    attemptClose();

    // Also try on a short timer in case DOM wasn't fully loaded
    const t1 = setTimeout(attemptClose, 500);
    const t2 = setTimeout(attemptClose, 1500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isReturnLanding]);

  // Poll the servicing API until the checkout session reports paid.
  useEffect(() => {
    if (!clicked || !checkoutSessionId || paymentStatus !== 'pending') return;
    const startedAt = Date.now();
    const MAX_POLL_MS = 10 * 60 * 1000;
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        setPaymentStatus('error');
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      try {
        let data: any = null;

        // Poll server silently via direct HTTP to avoid spamming chat messages during polling
        const mcpEndpoint = workflowApiUrl.endsWith('/mcp') ? workflowApiUrl : `${workflowApiUrl.replace(/\/$/, '')}/mcp`;
        try {
          const resp = await fetch(mcpEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'tools/call',
              params: {
                name: 'hq_stripe_payment_status',
                arguments: { checkoutSessionId, ticketId },
              },
            }),
          });
          if (resp.ok) {
            const payload = await resp.json();
            const text = payload?.result?.content?.[0]?.text;
            if (text) {
              try {
                const parsed = JSON.parse(text);
                data = parsed.result || parsed;
              } catch {
                data = null;
              }
            } else {
              data = payload?.result || payload;
            }
          }
        } catch (fetchErr) {
          console.warn('[stripe-widget] Silent status poll fetch error:', fetchErr);
        }

        const isPaid =
          data?.status === 'paid' ||
          data?.internal?.paid === true ||
          data?.internal?.status === 'IN_FORCE_RENEWED';

        if (isPaid) {
          setPaymentStatus('paid');
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Transient error — keep polling.
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [clicked, checkoutSessionId, paymentStatus, ticketId, workflowApiUrl]);

  // Dynamic height reporting to parent NitroChat iframe container
  useEffect(() => {
    const notifyHeight = () => {
      const widgetId = (window as any).openai?.widgetId;
      if (containerRef.current) {
        const height = containerRef.current.scrollHeight + 24;
        window.parent.postMessage(
          {
            type: 'nitro:set_height',
            widgetId,
            height: Math.max(height, 240),
          },
          '*'
        );
      }
    };

    notifyHeight();
    const timer = setTimeout(notifyHeight, 150);
    return () => clearTimeout(timer);
  }, [clicked]);

  const formattedPremium = `$${premium.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const handlePayClick = () => {
    setClicked(true);
    if (checkoutUrl) {
      try {
        const openaiSdk = (window as any).openai;
        if (typeof openaiSdk?.openExternal === 'function') {
          openaiSdk.openExternal({ href: checkoutUrl });
        } else {
          window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
        }
      } catch {
        window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
      }

      try {
        window.parent.postMessage(
          {
            type: 'nitro:widget_action',
            action: 'pay_stripe',
            checkoutUrl,
            carrier,
            premium,
            policyNumber,
          },
          '*'
        );
      } catch (err) {
        console.warn('Stripe pay postMessage warning:', err);
      }
    }
  };

  const bgCard = isDark ? '#14181F' : '#FFFFFF';
  const borderColor = isDark ? '#26303D' : '#E2E8F0';
  const textPrimary = isDark ? '#F1F5F9' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';

  if (isReturnLanding) {
    return (
      <div
        ref={containerRef}
        style={{
          padding: '12px 16px',
          maxWidth: '420px',
          margin: '0 auto',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div
          style={{
            background: bgCard,
            border: `1px solid ${borderColor}`,
            borderRadius: '16px',
            padding: '32px 24px',
            textAlign: 'center',
            boxShadow: isDark
              ? '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
              : '0 10px 25px -5px rgba(0, 0, 0, 0.08)',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>
            {isCancelledReturn ? '⚠️' : '✅'}
          </div>
          <div
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: textPrimary,
              marginBottom: '6px',
            }}
          >
            {isCancelledReturn ? 'Payment cancelled' : 'Payment complete'}
          </div>
          <div style={{ fontSize: '13px', color: textSecondary, lineHeight: 1.5, marginBottom: '20px' }}>
            {isCancelledReturn
              ? 'No charge was made. You can close this tab and return to your chat.'
              : 'Your policy renewal is confirmed! Closing this tab and returning to your chat...'}
          </div>
          <button
            type="button"
            onClick={() => {
              try { window.close(); } catch {}
              try { window.open('', '_self'); window.close(); } catch {}
            }}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              background: '#0F533A',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Close Tab
          </button>
        </div>
      </div>
    );
  }

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
          background: bgCard,
          border: `1px solid ${borderColor}`,
          borderRadius: '16px',
          boxShadow: isDark
            ? '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)'
            : '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Header Summary */}
        <div
          style={{
            padding: '18px 20px 14px 20px',
            borderBottom: `1px solid ${borderColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                boxShadow: '0 2px 8px rgba(23, 124, 86, 0.25)',
              }}
            >
              🛡️
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
                Policy Renewal Checkout
              </div>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: textPrimary,
                  marginTop: '1px',
                }}
              >
                {carrier}
              </div>
              <div style={{ fontSize: '12px', color: textSecondary }}>
                Policy #{policyNumber} • Term 2027–2028
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: textSecondary, textTransform: 'uppercase' }}>
              Due Now
            </div>
            <div
              style={{
                fontSize: '22px',
                fontWeight: 800,
                color: textPrimary,
                letterSpacing: '-0.02em',
              }}
            >
              {formattedPremium}
            </div>
            <div style={{ fontSize: '11px', color: '#16A34A', fontWeight: 600 }}>Annual</div>
          </div>
        </div>

        {/* Action Body */}
        <div style={{ padding: '18px 20px' }}>
          {paymentStatus === 'paid' ? (
            <div
              style={{
                width: '100%',
                padding: '20px',
                borderRadius: '12px',
                background: isDark ? '#0F533A' : '#DCFCE7',
                border: `1px solid ${isDark ? '#177C56' : '#16A34A'}`,
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: textPrimary,
                  marginBottom: '4px',
                }}
              >
                Payment Complete!
              </div>
              <div style={{ fontSize: '13px', color: textSecondary }}>
                Your renewal with {carrier} is now in force — Policy #{policyNumber}, renewed term +1 year.
              </div>
              <div style={{ fontSize: '12px', color: textSecondary, marginTop: '8px' }}>
                Receipt ID: {receiptId}
              </div>
            </div>
          ) : paymentStatus === 'error' ? (
            <div
              style={{
                width: '100%',
                padding: '20px',
                borderRadius: '12px',
                background: isDark ? '#7F1D1D' : '#FEE2E2',
                border: `1px solid ${isDark ? '#DC2626' : '#EF4444'}`,
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ fontSize: '16px', fontWeight: 700, color: textPrimary, marginBottom: '4px' }}>
                Still waiting for confirmation
              </div>
              <div style={{ fontSize: '13px', color: textSecondary }}>
                If you already paid, ask the assistant to check your renewal status.
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handlePayClick}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              disabled={clicked}
              style={{
                width: '100%',
                padding: '16px 24px',
                borderRadius: '12px',
                background: clicked
                  ? '#94A3B8'
                  : hovered
                  ? 'linear-gradient(135deg, #136949 0%, #0D4530 100%)'
                  : 'linear-gradient(135deg, #177C56 0%, #0F533A 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 700,
                fontSize: '16px',
                letterSpacing: '-0.01em',
                cursor: clicked ? 'not-allowed' : 'pointer',
                boxShadow: hovered && !clicked
                  ? '0 8px 20px rgba(23, 124, 86, 0.45)'
                  : '0 4px 14px rgba(23, 124, 86, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transform: hovered && !clicked ? 'translateY(-1px)' : 'none',
                transition: 'all 0.15s ease',
                opacity: clicked ? 0.7 : 1,
              }}
            >
              <span style={{ fontSize: '18px' }}>🔒</span>
              <span>{clicked ? 'Waiting for payment...' : `Pay ${formattedPremium} with Stripe`}</span>
              <span style={{ fontSize: '18px', marginLeft: '4px' }}>{!clicked && '→'}</span>
            </button>
          )}

          {clicked && paymentStatus === 'pending' && (
            <div
              style={{
                marginTop: '12px',
                textAlign: 'center',
                fontSize: '12px',
                color: '#16A34A',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <span>⏳</span> Stripe checkout opened — checking payment status every 5s...
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 20px',
            borderTop: `1px solid ${borderColor}`,
            background: isDark ? '#11161E' : '#FAFAFA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: textSecondary,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔒</span> 256-Bit Encrypted Checkout
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Powered by <strong style={{ color: textPrimary }}>Stripe</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
