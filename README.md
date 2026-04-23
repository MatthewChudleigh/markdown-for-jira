# Markdown for Jira

Render `.md` / `.markdown` attachments inline on Jira Cloud issues instead of forcing users to view the raw text.

Built as an [Atlassian Forge](https://developer.atlassian.com/platform/forge/) app. MIT licensed.

## What you get

- A side panel on every issue (`jira:issueContext`) that lists markdown attachments and renders the selected one.
- GitHub-Flavored Markdown: tables, task lists, fenced code, autolinks, emoji.
- Syntax-highlighted code blocks (highlight.js).
- Safe by default — all rendered HTML is passed through DOMPurify; `<script>`, event handlers, inline styles, `<iframe>`, and `javascript:` URLs are stripped.
- Light + dark themes follow `prefers-color-scheme`.

## Known limitations

- **Not a replacement for Jira's native attachment preview.** Atlassian does not expose a hook for the preview strip — clicking a `.md` file there still opens the raw-text preview. Open the side panel to see rendered HTML. See [plan §3](plan.md#3-extension-points).
- **Size cap ~500 KB.** Forge resolvers have a payload limit; larger files show a size-cap error.
- **Relative images are not resolved.** A `![](./screenshot.png)` in a README becomes `[image: screenshot]`. Absolute `https://` images render. ([v1 decision, plan §4](plan.md#4-architecture).)
- **Cloud only.** Forge does not run on Jira Server / Data Center.
- **English-only UI strings.**

## Install on your own Jira Cloud site

You need Node 20, an Atlassian account with admin rights on the target site, and [Task](https://taskfile.dev) (`go-task`) installed.

```bash
git clone https://github.com/<you>/markdown-for-jira.git
cd markdown-for-jira
task install

# Create your own copy of the app under your Atlassian account
npx forge login
npx forge register          # writes a fresh app id into manifest.yml

# Build, deploy, and install onto your site
task build
task deploy
task install:forge SITE=your-site.atlassian.net
```

For local development:

```bash
task dev:panel              # Vite dev server on :5173
task dev                    # forge tunnel against a dev site (separate shell)
```

Run `task` (no args) to see every available task.

## Project layout

```
manifest.yml                # Forge module + resolver wiring
src/index.js                # Resolver: attachment list + content fetch
static/panel/               # Custom UI (React + Vite)
  src/App.jsx               # Panel UI, list + selector + refresh
  src/markdown.js           # markdown-it + DOMPurify + highlight.js pipeline
  src/styles.css            # Atlassian-ish tokens, light + dark
test/                       # Vitest suite + fixture .md files
```

## Security

- `read:jira-work` is the only scope requested. No write scopes.
- No telemetry. No external network fetches from rendered content.
- Relative `<img>` tags are stripped (not loaded). Absolute images render as-is.
- DOMPurify runs with `html` profile plus explicit bans on `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, and on `style` / `on*` attributes.

Report vulnerabilities by opening a GitHub issue marked `security` or contacting the author directly.

## Development

Common workflows are wrapped as [Task](https://taskfile.dev) targets:

```bash
task lint                   # ESLint
task test                   # Vitest (one-shot)
task test:watch             # Vitest watch mode
task build                  # Vite build of the panel
task check                  # lint + test + build (the CI gate)
task format                 # Prettier write
task logs                   # forge logs --tail
task clean                  # remove dist/
```

Deploy targets:

```bash
task deploy                 # development environment
task deploy:staging
task deploy:production      # prompts for confirmation
```

CI runs `task check` on every PR.

## License

MIT. See [LICENSE](LICENSE).
