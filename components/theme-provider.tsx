"use client";

import { ThemeProvider as Provider } from "next-themes";

export function ThemeProvider({ children }: React.PropsWithChildren) {
  return (
    <Provider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="orcha-agent-theme">
      {children}
    </Provider>
  );
}
