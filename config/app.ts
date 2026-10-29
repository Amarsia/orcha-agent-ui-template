export type AppConfig = {
  name: string;
  description: string;
  agentLabel: string;
  defaultPrompt: string;
  suggestedPrompts: readonly { title: string; prompt: string }[];
};

export const appConfig = {
  name: "Atlas",
  description: "A transparent workspace for durable AI agent executions.",
  agentLabel: "Orcha agent",
  defaultPrompt: "Help me plan a focused work session.",
  suggestedPrompts: [
    { title: "Plan a launch", prompt: "Create a concise launch checklist and use the checklist action." },
    { title: "Review a decision", prompt: "Help me evaluate a decision, then ask for my approval before finalizing." },
    { title: "Break down work", prompt: "Turn my goal into five concrete next steps." },
  ],
} as const satisfies AppConfig;
