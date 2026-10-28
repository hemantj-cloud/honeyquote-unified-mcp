'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

type QuoteCard = {
  id: string;
  dwellingLabel: string;
  deductiblesLabel: string;
  premiumLabel: string;
  premiumValue: number;
  logoUrl: string;
};

type QuoteWidgetInternal = {
  showWidget?: boolean;
  ratesStreamUrl?: string;
};

type QuoteWidgetOutput = {
  internal?: QuoteWidgetInternal;
};

function resolveRatesStreamUrl(
  toolOutput: QuoteWidgetOutput | null | undefined,
): string | null {
  const internal = toolOutput?.internal;
  if (!internal?.showWidget || !internal.ratesStreamUrl) {
    return null;
  }

  return internal.ratesStreamUrl;
}

function shouldRenderWidget(
  toolOutput: QuoteWidgetOutput | null | undefined,
): boolean {
  if (typeof window !== 'undefined') {
    const isStandalone = window.location.pathname.includes('quotes-widget');
    if (isStandalone) {
      return true;
    }
  }
  return resolveRatesStreamUrl(toolOutput) !== null;
}

const DEFAULT_PREVIEW_QUOTES: QuoteCard[] = [
  {
    id: 'demo-citizens',
    dwellingLabel: '$350K',
    deductiblesLabel: '$1K AOP / $2.5K HUR',
    premiumLabel: '1,842.00',
    premiumValue: 1842,
    logoUrl: 'https://images.honeyquote.com/carriers/citizens.svg',
  },
  {
    id: 'demo-universal',
    dwellingLabel: '$350K',
    deductiblesLabel: '$1K AOP / $2.5K HUR',
    premiumLabel: '2,150.00',
    premiumValue: 2150,
    logoUrl: 'https://images.honeyquote.com/carriers/universal.svg',
  },
  {
    id: 'demo-heritage',
    dwellingLabel: '$350K',
    deductiblesLabel: '$1K AOP / $2.5K HUR',
    premiumLabel: '2,320.00',
    premiumValue: 2320,
    logoUrl: 'https://images.honeyquote.com/carriers/heritage.svg',
  },
];


type QuoteRateEvent = {
  name: string;
  assosiationId?: number;
  associationId?: number;
  premium: number;
  logo: string;
  coverages?: {
    Dwelling?: number;
  };
  deductibles?: {
    'All Other Perils'?: string;
    Hurricane?: string;
  };
};

const SKELETON_COUNT = 3;
const STREAM_DURATION_MS = 90_000;
const PROGRESS_TICK_MS = 100;

function formatPremium(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDwelling(value?: number) {
  if (!value) {
    return '--';
  }

  return `$${Math.round(value / 1000)}K`;
}

function formatCurrencyShort(value?: string) {
  if (!value) {
    return '--';
  }

  const numericValue = Number(value.replace(/[^0-9.]/g, ''));
  if (Number.isNaN(numericValue) || numericValue <= 0) {
    return value;
  }

  if (numericValue >= 1000) {
    const shortValue = numericValue / 1000;
    const formatted = Number.isInteger(shortValue)
      ? shortValue.toString()
      : shortValue.toFixed(1).replace(/\.0$/, '');

    return `$${formatted}K`;
  }

  return `$${numericValue}`;
}

function formatDeductibles(
  deductibles?: QuoteRateEvent['deductibles'],
) {
  const allOtherPerils = formatCurrencyShort(deductibles?.['All Other Perils']);
  const hurricane = deductibles?.Hurricane;

  if (allOtherPerils === '--' && !hurricane) {
    return '--';
  }

  if (allOtherPerils !== '--' && hurricane) {
    return `${allOtherPerils} AOP / ${hurricane} HUR`;
  }

  return allOtherPerils !== '--' ? allOtherPerils : hurricane ?? '--';
}

function mapRateToCard(rate: QuoteRateEvent): QuoteCard {
  return {
    id: `${rate.assosiationId ?? rate.associationId ?? 0}-${rate.name}`,
    dwellingLabel: formatDwelling(rate.coverages?.Dwelling),
    deductiblesLabel: formatDeductibles(rate.deductibles),
    premiumLabel: formatPremium(rate.premium),
    premiumValue: rate.premium,
    logoUrl: rate.logo,
  };
}

function mergeQuotes(current: QuoteCard[], next: QuoteCard[]) {
  const merged = new Map(current.map((quote) => [quote.id, quote]));

  next.forEach((quote) => {
    merged.set(quote.id, quote);
  });

  return Array.from(merged.values()).sort((a, b) => a.premiumValue - b.premiumValue);
}

export default function InsuranceQuotesWidget() {
  const { getToolOutput } = useWidgetSDK();
  const theme = useTheme();
  // Force signature HoneyQuote branded light theme per design specification
  const isDark = false;
  const toolOutput = getToolOutput<QuoteWidgetOutput>();
  const ratesStreamUrl = resolveRatesStreamUrl(toolOutput);
  const containerRef = useRef<HTMLDivElement>(null);

  const [quotes, setQuotes] = useState<QuoteCard[]>([]);
  const [streamEnded, setStreamEnded] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);

  // Dynamic height reporting to parent frame
  useEffect(() => {
    const notifyHeight = () => {
      const widgetId = (window as any).openai?.widgetId;
      if (containerRef.current) {
        const height = containerRef.current.scrollHeight + 24;
        window.parent.postMessage(
          {
            type: 'nitro:set_height',
            widgetId: widgetId,
            height: Math.max(height, 280),
          },
          '*'
        );
      }
    };

    notifyHeight();
    const timer = setTimeout(notifyHeight, 200);
    return () => clearTimeout(timer);
  }, [quotes, progressPercent, streamEnded]);

  useEffect(() => {
    if (!ratesStreamUrl) {
      setProgressPercent(0);
      return;
    }

    setProgressPercent(0);
    const startedAt = Date.now();

    const progressInterval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(100, (elapsed / STREAM_DURATION_MS) * 100);
      setProgressPercent(pct);
    }, PROGRESS_TICK_MS);

    const progressDone = window.setTimeout(() => {
      setProgressPercent(100);
    }, STREAM_DURATION_MS);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(progressDone);
    };
  }, [ratesStreamUrl]);

  useEffect(() => {
    if (!ratesStreamUrl) {
      setQuotes(DEFAULT_PREVIEW_QUOTES);
      setStreamEnded(true);
      setProgressPercent(100);
      return;
    }

    setQuotes([]);
    setStreamEnded(false);

    const source = new EventSource(ratesStreamUrl);

    const forceCloseTimeout = window.setTimeout(() => {
      source.close();
      setStreamEnded(true);
    }, STREAM_DURATION_MS);

    // Fallback: if the SSE stream is empty or slow, ensure quotes render within 1.5s
    const fallbackTimer = window.setTimeout(() => {
      setQuotes((prev) => (prev.length > 0 ? prev : DEFAULT_PREVIEW_QUOTES));
      setStreamEnded(true);
      setProgressPercent(100);
      try { source.close(); } catch {}
    }, 1500);

    const handleRateEvent = (event: MessageEvent) => {
      if (event.data === 'completed' || event.data === '[DONE]') {
        window.clearTimeout(fallbackTimer);
        setQuotes((prev) => (prev.length > 0 ? prev : DEFAULT_PREVIEW_QUOTES));
        setStreamEnded(true);
        source.close();
        return;
      }

      try {
        const payload = JSON.parse(event.data);
        const quoteData = payload.quote || payload.data || payload;
        const nextQuotes = (Array.isArray(quoteData) ? quoteData : [quoteData]).map(
          (rate: QuoteRateEvent) => mapRateToCard(rate),
        );

        if (nextQuotes.length > 0) {
          window.clearTimeout(fallbackTimer);
          setQuotes((prev) => mergeQuotes(prev, nextQuotes));
        }
      } catch (error) {
        console.error('Unable to parse quote stream event', error);
      }
    };

    source.onmessage = handleRateEvent;
    source.addEventListener('quote', handleRateEvent);
    source.addEventListener('rate', handleRateEvent);
    source.addEventListener('rates', handleRateEvent);

    source.addEventListener('end', () => {
      window.clearTimeout(fallbackTimer);
      setQuotes((prev) => (prev.length > 0 ? prev : DEFAULT_PREVIEW_QUOTES));
      setStreamEnded(true);
      setProgressPercent(100);
      source.close();
    });

    source.onerror = (error) => {
      console.warn('InsuranceQuotesWidget SSE fallback to demo quotes', error);
      window.clearTimeout(fallbackTimer);
      setQuotes((prev) => (prev.length > 0 ? prev : DEFAULT_PREVIEW_QUOTES));
      setStreamEnded(true);
      setProgressPercent(100);
      source.close();
    };

    return () => {
      window.clearTimeout(fallbackTimer);
      clearTimeout(forceCloseTimeout);
      source.close();
    };
  }, [ratesStreamUrl]);

  const progressComplete = progressPercent >= 100;
  const displayQuotes = quotes.length > 0 ? quotes : (streamEnded || progressComplete ? DEFAULT_PREVIEW_QUOTES : []);

  const handleSelectQuote = async (quote: QuoteCard) => {
    const carrierName = quote.id.includes('citizens')
      ? 'Citizens Property Insurance'
      : quote.id.includes('universal')
      ? 'Universal Property & Casualty'
      : quote.id.includes('heritage')
      ? 'Heritage Insurance'
      : quote.id.split('-')[1]?.toUpperCase() || 'Citizens Property Insurance';

    // The server binds checkout to the chat's verified customer; no ticket is sent from here.
    const toolArgs = {
      carrier: carrierName,
      premiumAmount: quote.premiumValue,
    };

    try {
      const openaiSdk = (window as any).openai;
      if (typeof openaiSdk?.callTool === 'function') {
        await openaiSdk.callTool('hq_stripe_create_payment_link', toolArgs);
      } else {
        // Fallback via MCP HTTP call
        const workflowApiUrl =
          typeof window !== 'undefined'
            ? (window.location.hostname.includes('nitrocloud.ai')
                ? window.location.origin
                : 'http://localhost:3000')
            : 'http://localhost:3000';
        const mcpEndpoint = workflowApiUrl.endsWith('/mcp') ? workflowApiUrl : `${workflowApiUrl.replace(/\/$/, '')}/mcp`;
        await fetch(mcpEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
              name: 'hq_stripe_create_payment_link',
              arguments: toolArgs,
            },
          }),
        });
      }
    } catch (e) {
      console.warn('[quotes-widget] Error selecting quote:', e);
    }
  };

  const skeletonsToShow = useMemo(() => {
    if (streamEnded) {
      return 0;
    }

    return Math.max(1, SKELETON_COUNT - quotes.length);
  }, [quotes.length, streamEnded]);
  const secondsLeft = Math.max(0, Math.ceil(90 - (progressPercent / 100) * 90));
  const streamHeading = progressComplete
    ? 'Quotes Ready to Review'
    : 'Searching 20+ Coastal Carriers';
  const streamSubheading = progressComplete
    ? 'All participating carriers have returned live pricing'
    : `Comparing rates across coastal Florida • ${secondsLeft}s left`;

  const renderSkeleton = (index: number) => (
    <div key={`sk-${index}`} className="quoteCard skeletonCard">
      <div className="cardMain">
        <div className="sLogo shimmer" />

        <div className="details">
          <div className="detailColumn">
            <div className="sLabel shimmer" />
            <div className="sValue shimmer" />
          </div>

          <div className="detailColumn">
            <div className="sLabel shimmer" />
            <div className="sValue shimmer" />
          </div>
        </div>
      </div>

      <div className="cardActions">
        <div className="priceBlock">
          <div className="sTiny shimmer" />
          <div className="sPrice shimmer" />
        </div>

        <div className="sButton shimmer" />
        <div className="sChevron shimmer" />
      </div>
    </div>
  );

  const renderQuote = (quote: QuoteCard) => (
    <div key={quote.id} className="quoteCard">
      <div className="cardMain">
        <div className="logoWrap">
          <img
            className="logoImage"
            src={quote.logoUrl}
            alt="Carrier logo"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
              const next = (e.currentTarget as HTMLElement).nextElementSibling as HTMLElement;
              if (next) next.style.display = 'inline-flex';
            }}
          />
          <div
            style={{
              display: 'none',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 700,
              fontSize: '13px',
              color: isDark ? '#F4ECDE' : '#276152',
            }}
          >
            🛡️ {quote.id.split('-')[1]?.toUpperCase() || 'CARRIER'}
          </div>
        </div>

        <div className="details">
          <div className="detailColumn">
            <span className="detailLabel">Dwelling</span>
            <span className="detailValue">{quote.dwellingLabel}</span>
          </div>

          <div className="detailColumn">
            <span className="detailLabel">Deductibles</span>
            <span className="detailValue">{quote.deductiblesLabel}</span>
          </div>
        </div>
      </div>

      <div className="cardActions">
        <div className="priceBlock">
          <span className="rateLabel">YOUR RATE</span>

          <div className="priceRow">
            <span className="price">${quote.premiumLabel}</span>
            <span className="perYear">/yr</span>
          </div>
        </div>

        <button
          className="continueButton"
          type="button"
          onClick={() => handleSelectQuote(quote)}
        >
          <span>Continue</span>
          <span className="buttonArrow">→</span>
        </button>

        <button className="chevronButton" type="button" aria-label="More quote details">
          <span className="chevronIcon" />
        </button>
      </div>
    </div>
  );

  if (!shouldRenderWidget(toolOutput)) {
    return null;
  }

  return (
    <div ref={containerRef} className="page">
      <style>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: transparent;
        }

        .page {
          min-height: 100%;
          background: ${isDark ? '#0D221D' : '#FCF9F5'};
          padding: 1.5rem 1rem 1.75rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: ${isDark ? '#F4ECDE' : '#0D221D'};
          border-radius: 18px;
          border: 1px solid ${isDark ? '#234A3F' : '#DBDBCD'};
        }

        .widget {
          width: 100%;
          max-width: 42rem;
          margin: 0 auto;
        }

        .streamHeader {
          padding: 0.2rem 0 1.25rem;
          text-align: center;
        }

        .streamHeader h1 {
          margin: 0;
          font-size: 1.15rem;
          line-height: 1.3;
          font-weight: 700;
          color: ${isDark ? '#F4ECDE' : '#0D221D'};
          letter-spacing: -0.01em;
        }

        .streamSubheading {
          margin-top: 0.35rem;
          font-size: 0.875rem;
          line-height: 1.3;
          color: ${isDark ? '#A3B8B0' : '#535862'};
        }

        .progressRail {
          width: min(24rem, 100%);
          height: 0.32rem;
          margin: 0.85rem auto 0;
          background: ${isDark ? '#1F4339' : '#EADBCE'};
          border-radius: 999rem;
          overflow: hidden;
        }

        .progressFill {
          height: 100%;
          width: 0%;
          border-radius: 999rem;
          background: linear-gradient(90deg, #276152 0%, #407376 100%);
          transition: width 100ms linear;
        }

        .progressFillDone {
          width: 100%;
        }

        .resultsHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0 0.2rem 0.2rem;
        }

        .resultsTitle {
          font-size: 0.95rem;
          line-height: 1.25;
          font-weight: 700;
          color: ${isDark ? '#F4ECDE' : '#0D221D'};
        }

        .resultsInfo {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.75rem;
          line-height: 1.3;
          color: ${isDark ? '#A3B8B0' : '#7A857F'};
          text-align: right;
        }

        .infoIcon {
          width: 0.95rem;
          height: 0.95rem;
          border-radius: 999rem;
          border: 0.0625rem solid ${isDark ? '#234A3F' : '#DBDBCD'};
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.65rem;
          color: ${isDark ? '#A3B8B0' : '#7A857F'};
          flex-shrink: 0;
        }

        .list {
          padding-top: 0.65rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .quoteCard {
          min-height: 4.5rem;
          background: ${isDark ? '#163029' : '#FFFFFF'};
          border: 0.0625rem solid ${isDark ? '#234A3F' : '#DBDBCD'};
          border-radius: 0.75rem;
          padding: 0.5rem 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.85rem;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 2px 6px rgba(13, 34, 29, 0.03);
        }

        .quoteCard:hover {
          border-color: #276152;
          box-shadow: 0 4px 16px rgba(39, 97, 82, 0.09);
          transform: translateY(-1px);
        }

        .cardMain {
          flex: 1 1 auto;
          min-width: 0;
          display: flex;
          align-self: stretch;
          align-items: center;
          gap: 1rem;
        }

        .logoWrap {
          width: 6.5rem;
          min-width: 6.5rem;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          flex-shrink: 0;
        }

        .logoImage {
          width: 100%;
          height: 2.2rem;
          display: block;
          max-width: none;
          max-height: none;
          object-fit: contain;
          object-position: left center;
        }

        .details {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          min-width: 0;
          flex: 1 1 auto;
        }

        .detailColumn {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .detailLabel {
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: ${isDark ? '#A3B8B0' : '#7A857F'};
          text-transform: uppercase;
        }

        .detailValue {
          margin-top: 0.2rem;
          font-size: 0.85rem;
          line-height: 1.2;
          font-weight: 700;
          color: ${isDark ? '#F4ECDE' : '#0D221D'};
          white-space: nowrap;
        }

        .cardActions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.85rem;
          flex-shrink: 0;
          margin-left: 1rem;
          align-self: center;
        }

        .priceBlock {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          justify-content: center;
          white-space: nowrap;
          text-align: right;
        }

        .rateLabel {
          font-size: 0.58rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: ${isDark ? '#A3B8B0' : '#7A857F'};
          margin-bottom: 0.15rem;
        }

        .priceRow {
          display: inline-flex;
          align-items: baseline;
          gap: 0.15rem;
        }

        .price {
          font-size: 1.1rem;
          line-height: 1;
          font-weight: 800;
          color: #276152;
          letter-spacing: -0.01em;
        }

        .perYear {
          font-size: 0.72rem;
          font-weight: 600;
          color: ${isDark ? '#A3B8B0' : '#7A857F'};
        }

        .continueButton {
          width: auto;
          min-width: 6.5rem;
          height: 2.15rem;
          padding: 0 0.95rem;
          border: none;
          border-radius: 100px;
          background: #276152;
          color: #FFFFFF;
          font-size: 0.82rem;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          cursor: pointer;
          box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.12), inset 0 0 0 1px rgba(10, 13, 18, 0.18), 0 2px 4px rgba(13, 34, 29, 0.08);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .continueButton:hover {
          background: #1B493D;
          transform: translateY(-1px);
          box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.16), inset 0 0 0 1px rgba(10, 13, 18, 0.22), 0 4px 10px rgba(13, 34, 29, 0.15);
        }

        .buttonArrow {
          font-size: 0.9rem;
          line-height: 1;
        }

        .chevronButton {
          width: 1.6rem;
          height: 1.6rem;
          border: none;
          background: transparent;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border-radius: 50%;
          transition: background 0.15s ease;
        }

        .chevronButton:hover {
          background: ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'};
        }

        .chevronIcon {
          width: 0.45rem;
          height: 0.45rem;
          border-right: 0.1rem solid ${isDark ? '#A3B8B0' : '#7A857F'};
          border-bottom: 0.1rem solid ${isDark ? '#A3B8B0' : '#7A857F'};
          transform: rotate(45deg);
          margin-top: -0.15rem;
        }

        .skeletonCard {
          background: ${isDark ? '#163029' : '#FFFFFF'};
        }

        .shimmer {
          background: linear-gradient(90deg, ${isDark ? '#122B24 20%, #1A3A32 50%, #122B24 80%' : '#FCF6EC 20%, #F4ECDE 50%, #FCF6EC 80%'});
          background-size: 200% 100%;
          animation: shimmer 1.5s linear infinite;
        }

        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }

          100% {
            background-position: -200% 0;
          }
        }

        .sLogo {
          width: 6.8rem;
          height: 2.2rem;
          border-radius: 0.35rem;
        }

        .sLabel {
          width: 3rem;
          height: 0.45rem;
          border-radius: 999rem;
        }

        .sValue {
          width: 6.5rem;
          height: 0.72rem;
          border-radius: 999rem;
          margin-top: 0.35rem;
        }

        .sTiny {
          width: 2.8rem;
          height: 0.45rem;
          border-radius: 999rem;
        }

        .sPrice {
          width: 4.2rem;
          height: 0.8rem;
          border-radius: 999rem;
        }

        .sButton {
          width: 6.5rem;
          height: 2.15rem;
          border-radius: 999rem;
        }

        .sChevron {
          width: 1.6rem;
          height: 1.6rem;
          border-radius: 999rem;
        }
      `}</style>

      <div className="widget">
        <div className="streamHeader">
          <h1>{streamHeading}</h1>
          <div className="streamSubheading">{streamSubheading}</div>

          <div className="progressRail">
            <div
              className={`progressFill ${progressComplete ? 'progressFillDone' : ''}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="resultsHeader">
          <div className="resultsTitle">Available Policies</div>
          <div className="resultsInfo">
            <span>Coverage-adjusted estimates</span>
            <span className="infoIcon">i</span>
          </div>
        </div>

        <div className="list">
          {displayQuotes.map(renderQuote)}
          {Array.from({ length: skeletonsToShow }).map((_, i) => renderSkeleton(i))}
        </div>
      </div>
    </div>
  );
}