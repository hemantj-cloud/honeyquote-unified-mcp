'use client';

import { WidgetLayout } from '@nitrostack/widgets';


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var p = new URLSearchParams(window.location.search);
                  if (p.has('session_id') || p.get('payment') === 'cancelled' || p.get('renewed') === 'true') {
                    function doClose() {
                      try { window.close(); } catch(e) {}
                      try { window.open('', '_self'); window.close(); } catch(e) {}
                    }
                    doClose();
                    window.addEventListener('DOMContentLoaded', doClose);
                    setTimeout(doClose, 100);
                    setTimeout(doClose, 400);
                    setTimeout(doClose, 1000);
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: 'transparent',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        <WidgetLayout>{children}</WidgetLayout>
      </body>
    </html>
  );
}
