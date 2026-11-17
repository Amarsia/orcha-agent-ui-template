export type AppConfig = {
  name: string;
  description: string;
  agentLabel: string;
  icon: string;
  accent: string;
  theme: "light" | "dark" | "system";
  poweredBy: string;
  allowFileUploads: boolean;
  maxFileSizeMb: number;
  maxFilesPerRun: number;
  suggestedPrompts: readonly { title: string; prompt: string }[];
};

export const appConfig = {
  name: "Atlas",
  description: "A compact workspace for building, running, and inspecting durable Orcha agents.",
  agentLabel: "Orcha Agent",
  icon: "/agent-mark.svg",
  accent: "#D97757",
  theme: "system",
  poweredBy: "Powered by OrchaJS",
  allowFileUploads: true,
  maxFileSizeMb: 25,
  maxFilesPerRun: 5,
  suggestedPrompts: [
    {
      title: "Launch checklist",
      prompt: "Create a concise launch checklist and use the checklist action.",
    },
    {
      title: "Research & risk plan",
      prompt:
        "Delegate to the researcher subagent to compare canary vs blue-green deployments, then build a risk register.",
    },
    {
      title: "Approval gate",
      prompt: "Evaluate a production deployment plan, then request my approval before finalizing.",
    },
  ],
} as const satisfies AppConfig;
