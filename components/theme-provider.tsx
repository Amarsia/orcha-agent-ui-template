"use client";

import { ThemeProvider as Provider } from "next-themes";
import { appConfig } from "@/config/app";

export function ThemeProvider({ children }: React.PropsWithChildren) {
  return (
    <Provider
      attribute="class"
      defaultTheme={appConfig.theme}
      enableSystem
      disableTransitionOnChange
      storageKey="orcha-agent-theme"
    >
      {children}
    </Provider>
  );
}
