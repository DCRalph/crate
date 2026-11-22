import type { Metadata } from "next";
import { Toaster } from "sonner";

import "./globals.css";
import { ConfirmProvider } from "~/components/confirm-provider";
import { fontVariables } from "~/lib/fonts";
import { site } from "~/lib/site";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: { default: site.name, template: `%s | ${site.name}` },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${fontVariables}`}>
      <body>
        <TRPCReactProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </TRPCReactProvider>
        {/* Sits above the player bar. */}
        <Toaster theme="dark" position="bottom-right" offset={{ bottom: "calc(var(--player-height) + 1rem)" }} />
      </body>
    </html>
  );
}
