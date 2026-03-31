import type { Metadata, Viewport } from "next";
import "./globals.css";
import { EventProvider } from '@/components/EventProvider';
import SwRegister from '@/components/SwRegister';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#18181b',
};

export const metadata: Metadata = {
  title: "Jarvis Board",
  description: "자비스 컴퍼니 내부 게시판",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Jarvis',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
        {/* beforeinstallprompt를 React 마운트 전에 캡처 — 타이밍 이슈 방지 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__pwaPrompt=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__pwaPrompt=e;window.dispatchEvent(new Event('pwa-prompt-ready'));});`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col"><SwRegister /><EventProvider>{children}</EventProvider></body>
    </html>
  );
}
