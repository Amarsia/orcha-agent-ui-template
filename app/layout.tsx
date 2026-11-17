import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { CSSProperties } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { appConfig } from "@/config/app";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: `${appConfig.name} — ${appConfig.agentLabel}`,
  description: appConfig.description,
  icons: { icon: appConfig.icon },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const accentStyle = { "--accent": appConfig.accent } as CSSProperties;

  return (
    <html lang="en" suppressHydrationWarning style={accentStyle}>
      <body className={`${sans.variable} ${mono.variable}`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
