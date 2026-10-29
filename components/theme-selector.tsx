"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="theme-switcher" aria-label="Color theme">
      {([["light", Sun], ["dark", Moon], ["system", Laptop]] as const).map(([value, Icon]) => (
        <button
          key={value}
          type="button"
          aria-label={`${value} theme`}
          aria-pressed={mounted && theme === value}
          onClick={() => setTheme(value)}
        >
          <Icon aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
