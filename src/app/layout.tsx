import type { Metadata } from "next";
import { Toaster } from "sonner";

import "./globals.css";
import { ConfirmProvider } from "~/components/confirm-provider";
import { ThemeSync, themeScript } from "~/components/shell/theme";
import { fontVariables } from "~/lib/fonts";
import { site } from "~/lib/site";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: { default: site.name, template: `%s | ${site.name}` },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets a class on <html> before React wakes up, which is the difference this tells React to expect.
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeSync />
        <TRPCReactProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </TRPCReactProvider>
        {/* Sits above the player deck. Toasts are print, like everything else that is read. */}
        <Toaster
          theme="light"
          position="bottom-right"
          offset={{ bottom: "calc(var(--player-height) + 1rem)" }}
          style={{ "--normal-bg": "var(--strip)", "--normal-text": "var(--ink)", "--normal-border": "var(--strip-line)" } as React.CSSProperties}
          toastOptions={{ style: { fontFamily: "inherit", borderRadius: "6px" } }}
        />
      </body>
    </html>
  );
}
