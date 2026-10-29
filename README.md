# Orcha Agent UI Template

A self-contained Next.js 16.4.3 workspace for running OrchaJS agents directly on the server. It combines durable browser-isolated sessions, cumulative streaming output, projected history, canonical event traces, client-action resolution, and responsive light/dark/system UI.

## Features

- Direct server-side `orchajs` runtime; no hosted client SDK
- Streaming NDJSON executions and durable JSONL sessions
- HttpOnly, SameSite=Strict per-browser session ownership
- Detailed action, client action, subagent, skill, evaluation, message, and completion cards
- Raw execution event inspector, token usage, run status, and durable deep links
- Typed product configuration in `config/app.ts`
- Editable agent instructions and actions under `orcha/assistant`
- Safe local `create_checklist` action and interactive `request_approval` client action
- Loading, empty, error, unsupported-action, and reduced-motion states
- Standalone container deployment with persistent storage

## Start locally

Requirements: Node.js 20.9 or newer and an OpenAI API key.

```bash
npm install
cp .env.example .env.local
# Add OPENAI_API_KEY to .env.local
npm run dev
```

Open `http://localhost:3000`.

## Customize

- Product identity and prompt suggestions: `config/app.ts`
- Agent model and limits: `orcha/assistant/index.json`
- Agent behavior: `orcha/assistant/instructions.md`
- Local and client actions: `orcha/assistant/actions`
- Semantic visual system: `app/globals.css`

Only advertise client actions that the UI can resolve. The included execution route derives advertised capabilities from the compiled agent, while the UI explicitly supports `request_approval`.

## API

- `POST /api/executions` starts or continues an execution and streams NDJSON.
- `GET /api/sessions` lists sessions owned by the current browser.
- `GET /api/sessions/:id` returns the session, projected history, and canonical events.
- `GET /api/sessions/:id/history` returns paginated projected history.
- `GET /api/sessions/:id/events` returns stable paginated canonical events.
- `POST /api/sessions/:id/tools/:callId` resolves a pending client action and streams continuation.

Every session read and mutation verifies the opaque HttpOnly browser identity against session metadata. Provider credentials never reach the client.

## Storage and deployment

Local sessions default to `.orcha/sessions`. The container uses `/data/sessions`; mount it as a persistent volume:

```bash
docker build -t orcha-agent-ui .
docker run --env-file .env.local -p 3000:3000 -v orcha-agent-sessions:/data/sessions orcha-agent-ui
```

The JSONL store is appropriate for one application instance. Replace it with shared durable storage before horizontally scaling.

## Agent development

```bash
npm run agent:playground
npm run agent:test
```

See the [OrchaJS documentation](https://github.com/Amarsia/orcha) for actions, skills, subagents, evaluations, and provider configuration.

## License

MIT
