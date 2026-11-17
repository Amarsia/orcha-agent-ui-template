# Orcha Agent UI Template

A compact, technical workspace for learning how to build and run durable AI
agents with [OrchaJS](https://github.com/Amarsia/orcha). Use it as a starter
application, a reference implementation, or a hands-on tutorial.

The template runs Orcha directly inside a Next.js server. The browser receives
streaming execution snapshots while Orcha owns model calls, actions, durable
history, client-action pauses, and resumptions.

## What is included

- On-demand agent runs with cumulative streaming output
- Durable per-browser run history and deep links
- Compact execution states for thinking, writing, actions, subagents, and completion
- Rich GitHub-flavored Markdown when the model returns Markdown
- Image and document input from the composer
- Local actions with JSON Schema inputs and validated outputs
- A client-side approval action that pauses and safely resumes a run
- Responsive light, dark, and system themes
- Amarsia inference and cloud storage, or direct provider credentials

The example `Atlas` agent includes:

- `create_checklist` — normalize a concrete execution plan
- `prioritize_tasks` — rank work using impact, urgency, and effort
- `build_risk_register` — score and order operational risks
- `calculate_metrics` — calculate numeric summaries without model arithmetic
- `request_approval` — pause for an explicit browser-side decision

## Start locally

Requirements: Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

### Option 1: Amarsia inference

Amarsia inference includes free credits and does not require a separate model
provider key:

1. Sign up at [Amarsia](https://amarsia.com).
2. Open **Projects**.
3. Choose **Connect New Project**.
4. Copy the generated project key into `.env`:

```env
AMARSIA_PROJECT_KEY=your_project_key
```

This configuration also enables Orcha cloud session storage.

### Option 2: Your own provider key

Leave `AMARSIA_PROJECT_KEY` empty and configure a provider supported by the
agent model:

```env
OPENAI_API_KEY=your_key
```

The fallback provider registration is in `orcha/index.ts`.

## Follow the agent lifecycle

The main integration lives in `app/api/executions/route.ts`:

1. Resolve the private browser identity.
2. Convert uploaded attachment IDs into Orcha file content.
3. Call `assistant.run(...)` for a new durable session.
4. Call `assistant.resume(...)` for a follow-up turn.
5. Stream snapshots and the final result as NDJSON.

Each action is a folder under `orcha/assistant/actions`:

```text
actions/
  calculateMetrics/
    index.json
    index.js
```

`index.json` describes the model-facing action and its schemas. `index.js`
contains ordinary server-side JavaScript. Add another action folder and Orcha
discovers it during compilation.

## File input

The composer uploads files to `POST /api/uploads`. Files are validated and
stored under `.orcha/uploads/<visitorId>/`, then supplied to Orcha as local
file content:

```ts
{
  type: "file",
  filePath,
  mimeType
}
```

Uploaded bytes are local runtime data. Mount persistent storage or replace the
upload layer with object storage when deploying to an ephemeral platform.

## Customize the template

- Branding, accent color, upload limits, and suggestions: `config/app.ts`
- Provider, model, and token limit: `orcha/assistant/index.json`
- Stable agent behavior: `orcha/assistant/instructions.md`
- Actions: `orcha/assistant/actions`
- Main workspace: `components/agent-workspace.tsx`
- Visual system: `app/globals.css`

The system instructions intentionally do not force Markdown. Plain model text
renders as plain text; headings, lists, links, code, blockquotes, and tables
become rich UI only when the model naturally returns Markdown.

## API surface

- `POST /api/executions` — start or continue a run and stream NDJSON
- `POST /api/uploads` — validate and store an attachment
- `GET /api/sessions` — list runs owned by the current browser
- `GET /api/sessions/:id` — load projected history and execution events
- `GET /api/sessions/:id/history` — load paginated projected history
- `GET /api/sessions/:id/events` — load stable paginated events
- `POST /api/sessions/:id/tools/:callId` — resolve a pending client action

Every session read and mutation verifies an opaque HttpOnly browser identity.
Provider credentials are never sent to the browser.

## Orcha resources

- [OrchaJS on GitHub](https://github.com/Amarsia/orcha)
- [OrchaJS on npm](https://www.npmjs.com/package/orchajs)

Useful development commands:

```bash
npm run agent:playground
npm run agent:test
```

## License

MIT
