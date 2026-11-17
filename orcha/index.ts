import { orcha } from "orchajs";

if (!orcha.isInitialized()) {
  const amarsiaKey = process.env.AMARSIA_PROJECT_KEY?.trim();

  orcha.init(
    amarsiaKey
      ? {
          amarsia: {
            key: amarsiaKey,
            endpoint: process.env.AMARSIA_API_URL,
            inference: true,
          },
          storage: {
            strategy: "cloud",
          },
          actions: { runtime: "native" },
          agents: {
            assistant: {
              path: "./assistant",
              subagents: {
                researcher: "./researcher",
              },
            },
          },
        }
      : {
          providers: {
            openai: process.env.OPENAI_API_KEY ?? "",
            anthropic: process.env.ANTHROPIC_API_KEY ?? "",
            googlegenai: process.env.GOOGLE_API_KEY ?? "",
            deepseek: process.env.DEEPSEEK_API_KEY ?? "",
          },
          actions: { runtime: "native" },
          agents: {
            assistant: {
              path: "./assistant",
              subagents: {
                researcher: "./researcher",
              },
            },
          },
        },
  );
}

export { orcha };
