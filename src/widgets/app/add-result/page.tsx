'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

export default function AddResult() {
  const { getToolOutput } = useWidgetSDK();
  const theme = useTheme();
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);

  const data = getToolOutput<any>() || { sum: 42, a: 20, b: 22 };
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setLoading(true), 400);
    return () => window.clearTimeout(id);
  }, []);

  // Dynamic height reporting to parent frame
  useEffect(() => {
    const notifyHeight = () => {
      const widgetId = (window as any).openai?.widgetId;
      if (containerRef.current) {
        const height = containerRef.current.scrollHeight + 24;
        window.parent.postMessage(
          {
            type: 'nitro:set_height',
            widgetId,
            height: Math.max(height, 200),
          },
          '*'
        );
      }
    };

    notifyHeight();
    const timer = setTimeout(notifyHeight, 150);
    return () => clearTimeout(timer);
  }, [loading]);

  const colors = isDark
    ? {
        bg: '#163029',
        border: '#234A3F',
        subBorder: '#1F4339',
        cardBg: '#0D221D',
        stripBg: '#122B24',
        textPrimary: '#F4ECDE',
        textSecondary: '#A3B8B0',
        textMuted: '#7A857F',
        shimmerBase: '#122B24',
        shimmerHighlight: '#1A3A32',
      }
    : {
        bg: '#FFFFFF',
        border: '#DBDBCD',
        subBorder: '#EFEFEA',
        cardBg: '#FCF6EC',
        stripBg: '#F4ECDE',
        textPrimary: '#0D221D',
        textSecondary: '#535862',
        textMuted: '#7A857F',
        shimmerBase: '#FCF6EC',
        shimmerHighlight: '#F4ECDE',
      };

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '440px',
    margin: '0 auto',
    background: colors.bg,
    borderRadius: '18px',
    padding: '22px',
    boxShadow: isDark
      ? '0 12px 32px rgba(0, 0, 0, 0.4)'
      : '0 8px 30px -4px rgba(13, 34, 29, 0.08), 0 2px 6px -1px rgba(13, 34, 29, 0.04)',
    border: `1px solid ${colors.border}`,
    boxSizing: 'border-box',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: colors.textPrimary,
  };

  if (!loading) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          padding: '12px',
          boxSizing: 'border-box',
        }}
      >
        <div style={cardStyle}>
          {/* Skeleton Header */}
          <div
            style={{
              height: '36px',
              width: '55%',
              background: colors.cardBg,
              borderRadius: '10px',
              marginBottom: '18px',
            }}
          />

          {/* Skeleton Result Box */}
          <div
            style={{
              height: '110px',
              background: colors.stripBg,
              borderRadius: '14px',
            }}
          />
        </div>
      </div>
    );
  }

  const sumValue = data?.sum ?? (data?.result ?? 0);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        padding: '12px',
        boxSizing: 'border-box',
      }}
    >
      <div style={cardStyle}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            paddingBottom: '14px',
            borderBottom: `1px solid ${colors.subBorder}`,
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#276152',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                fontWeight: 700,
                boxShadow: '0 3px 8px rgba(39, 97, 82, 0.25)',
                flexShrink: 0,
              }}
            >
              +
            </div>

            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: 700,
                  color: colors.textPrimary,
                  letterSpacing: '-0.01em',
                }}
              >
                Addition Computed
              </h3>
              <p
                style={{
                  margin: '2px 0 0 0',
                  color: colors.textSecondary,
                  fontSize: '12.5px',
                }}
              >
                HoneyQuote Live Calculation
              </p>
            </div>
          </div>

          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              padding: '3px 10px',
              borderRadius: '100px',
              background: isDark ? 'rgba(39, 97, 82, 0.3)' : '#E8F5EE',
              color: isDark ? '#CEF5CA' : '#1B493D',
              border: `1px solid ${isDark ? '#276152' : '#B8E2CB'}`,
            }}
          >
            Success
          </span>
        </div>

        {/* Result Box */}
        <div
          style={{
            background: colors.cardBg,
            borderRadius: '14px',
            padding: '20px 24px',
            border: `1px solid ${colors.border}`,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '6px',
            }}
          >
            Calculated Total
          </div>

          <div
            style={{
              fontSize: 'clamp(36px, 8vw, 48px)',
              fontWeight: 800,
              color: '#276152',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            {typeof sumValue === 'number' ? sumValue.toLocaleString() : sumValue}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11.5px',
            color: colors.textMuted,
            padding: '0 4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#276152' }}>●</span>
            <span>HoneyQuote Servicing Tool</span>
          </div>
          <span>Instant Result</span>
        </div>
      </div>
    </div>
  );
}
