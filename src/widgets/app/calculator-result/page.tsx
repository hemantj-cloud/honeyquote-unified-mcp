'use client';

import { useEffect, useRef } from 'react';
import { useTheme, useWidgetState, useWidgetSDK } from '@nitrostack/widgets';

interface CalculatorData {
  operation: string;
  a: number;
  b: number;
  result: number;
  expression: string;
}

export default function CalculatorResult() {
  const theme = useTheme();
  const isDark = theme === 'dark';
  const { getToolOutput } = useWidgetSDK();
  const [state, setState] = useWidgetState<{ viewMode: 'compact' | 'detailed' }>(() => ({
    viewMode: 'detailed',
  }));
  const containerRef = useRef<HTMLDivElement>(null);

  // Access tool output from Widget SDK
  const data = getToolOutput<CalculatorData>() || {
    operation: 'add',
    a: 2450,
    b: 350,
    result: 2800,
    expression: '2,450 + 350 = 2,800',
  };

  // Dynamic height reporting to NitroChat parent window
  useEffect(() => {
    const notifyHeight = () => {
      const widgetId = (window as any).openai?.widgetId;
      if (containerRef.current) {
        const height = containerRef.current.scrollHeight + 24;
        window.parent.postMessage(
          {
            type: 'nitro:set_height',
            widgetId,
            height: Math.max(height, 220),
          },
          '*'
        );
      }
    };

    notifyHeight();
    const timer = setTimeout(notifyHeight, 200);
    return () => clearTimeout(timer);
  }, [state?.viewMode, data]);

  const getOperationIcon = (op: string) => {
    const icons: Record<string, string> = {
      add: '+',
      subtract: '−',
      multiply: '×',
      divide: '÷',
    };
    return icons[op] || '✦';
  };

  const getOperationTitle = (op: string) => {
    const titles: Record<string, string> = {
      add: 'Addition',
      subtract: 'Subtraction',
      multiply: 'Multiplication',
      divide: 'Division',
    };
    return titles[op] || 'Calculation';
  };

  // HoneyQuote theme colors
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
        accent: '#276152',
        accentGold: '#EBBFBC',
        pillBg: '#1F4339',
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
        accent: '#276152',
        accentGold: '#AC512A',
        pillBg: '#F4ECDE',
      };

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        maxWidth: '460px',
        margin: '0 auto',
        padding: '20px 22px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '18px',
        boxShadow: isDark
          ? '0 12px 32px rgba(0, 0, 0, 0.4)'
          : '0 8px 30px -4px rgba(13, 34, 29, 0.08), 0 2px 6px -1px rgba(13, 34, 29, 0.04)',
        boxSizing: 'border-box',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: colors.textPrimary,
        transition: 'all 0.25s ease',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          paddingBottom: '14px',
          borderBottom: `1px solid ${colors.subBorder}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '11px',
              background: '#276152',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              fontWeight: 700,
              boxShadow: '0 3px 8px rgba(39, 97, 82, 0.25)',
              flexShrink: 0,
            }}
          >
            {getOperationIcon(data.operation)}
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '15.5px',
                fontWeight: 700,
                color: colors.textPrimary,
                letterSpacing: '-0.01em',
              }}
            >
              Calculation Result
            </h3>
            <p
              style={{
                margin: '2px 0 0 0',
                fontSize: '12px',
                color: colors.textSecondary,
              }}
            >
              {getOperationTitle(data.operation)} Analysis
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setState({
              viewMode: state?.viewMode === 'compact' ? 'detailed' : 'compact',
            })
          }
          style={{
            padding: '5px 12px',
            borderRadius: '100px',
            border: `1px solid ${colors.border}`,
            background: colors.stripBg,
            color: colors.textPrimary,
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {state?.viewMode === 'compact' ? 'Show Details' : 'Compact'}
        </button>
      </div>

      {/* Main Result Display Box */}
      <div
        style={{
          background: colors.cardBg,
          borderRadius: '14px',
          padding: '18px 20px',
          border: `1px solid ${colors.border}`,
          marginBottom: '14px',
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
          Evaluated Expression
        </div>

        <div
          style={{
            fontSize: '26px',
            fontWeight: 800,
            color: '#276152',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}
        >
          {data.expression}
        </div>

        {state?.viewMode === 'detailed' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              marginTop: '16px',
              paddingTop: '14px',
              borderTop: `1px solid ${colors.subBorder}`,
            }}
          >
            <div
              style={{
                background: colors.stripBg,
                padding: '8px 10px',
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ fontSize: '10.5px', color: colors.textSecondary, fontWeight: 500 }}>
                Operand A
              </div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: colors.textPrimary, marginTop: '2px' }}>
                {data.a}
              </div>
            </div>

            <div
              style={{
                background: colors.stripBg,
                padding: '8px 10px',
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ fontSize: '10.5px', color: colors.textSecondary, fontWeight: 500 }}>
                Operand B
              </div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: colors.textPrimary, marginTop: '2px' }}>
                {data.b}
              </div>
            </div>

            <div
              style={{
                background: colors.stripBg,
                padding: '8px 10px',
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ fontSize: '10.5px', color: colors.accentGold, fontWeight: 600 }}>
                Final Total
              </div>
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#276152', marginTop: '2px' }}>
                {data.result}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer info badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: colors.textMuted,
          padding: '0 4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#276152' }}>●</span>
          <span>HoneyQuote Smart Calculator</span>
        </div>
        <span
          style={{
            background: colors.stripBg,
            padding: '2px 8px',
            borderRadius: '100px',
            border: `1px solid ${colors.border}`,
            fontSize: '10.5px',
          }}
        >
          Verified Output
        </span>
      </div>
    </div>
  );
}
