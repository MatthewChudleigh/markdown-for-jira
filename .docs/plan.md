# Markdown for Jira — Plan

A Jira Cloud app (Forge) that renders `.md` / `.markdown` file attachments as formatted HTML instead of forcing users to download the raw text.

## 1. Goals & Non-Goals

### Goals

- Render markdown attachments inline on Jira issues (Cloud).
- Support the common case: GitHub-Flavored Markdown (tables, task lists, fenced code, autolinks).
- Safe by default: sanitize HTML, no arbitrary script execution.
- Installable on our own Jira Cloud site with minimal friction.
- Open-sourced under MIT so others can self-install / fork.

### Non-Goals (at least for v1)

- Editing markdown in-place.
- Rendering markdown inside comments or descriptions (Jira already handles wiki/ADF there).
- Jira Server / Data Center support (Forge is Cloud-only; a separate Connect app would be needed).
- Confluence support (possible later — Forge makes this cheap to add).
- Diagram extensions (Mermaid, PlantUML) — deferred to v2 (bundle-size cost).
- Confluence equivalent — not planned; revisit only if asked.
- Internationalization / RTL — UI strings ship in English only for v1.

## 2. Chosen Platform: Atlassian Forge

**Why Forge over Connect:**

- Hosted by Atlassian — no server to run, no TLS cert, no auth plumbing.
- Free tier is generous for personal / small-team use.
- Manifest-driven permissions and simple CLI (`forge deploy`, `forge install`).
- UI Kit / Custom UI both support attachment module extension points.

**Trade-offs:**

- Forge apps run in Atlassian's sandbox — network egress to non-Atlassian domains requires explicit `permissions.external.fetch` entries.
  - We fetch the attachment via `api.asUser().requestJira(...)`, and the 302 → `media.atlassian.com` redirect is treated as **internal Atlassian traffic** by the Forge runtime — **no `external.fetch` declaration required**. ([Forge runtime egress permissions docs](https://developer.atlassian.com/platform/forge/runtime-egress-permissions/).)
- Cloud-only. If Server support ever matters, a parallel Connect build would be required.

## 3. Extension Points

Primary: **`jira:issueContext`** panel that lists markdown attachments on the current issue and renders the selected one.

**Confirmed limitation — no attachment-preview hook exists.** Atlassian staff have stated on the developer community that "we don't have any extensibility in the image previewer itself" ([thread](https://community.developer.atlassian.com/t/jira-attachments-preview-with-forge/74413)), and the [Jira Forge module index](https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-jira/) contains no attachment-viewer / MIME-typed renderer module. Jira Cloud's sandbox prohibits third-party code at the page top level, so this is a platform constraint, not a gap likely to close soon.

**UX implication stakeholders must accept:** clicking a `.md` attachment in the native attachment strip still opens Jira's built-in preview (which shows the raw text). To see rendered HTML, the user opens the app's side panel and selects the file from its list. This is a two-click workflow, not a seamless in-place preview.

Stretch (v1.1): secondary surface via `jira:issueAction` (modal) for a larger rendered view — still user-initiated, not a preview replacement.

## 4. Architecture

```
Jira Issue View
   └── Forge Custom UI iframe (React)
         ├─ resolver (Forge runtime, Node) ──► Jira REST: /rest/api/3/issue/{key}?fields=attachment
         ├─ resolver ──► Jira attachment content URL (authenticated via Forge invoke)
         └─ client: markdown-it + DOMPurify  ──► sanitized HTML
```

- **Resolver (backend, Forge runtime):** fetches attachment metadata and file bytes using the Forge `api.asApp()` or `asUser()` bridge. Returns UTF-8 text to the UI.
  - **Resolved:** the 302 from `/rest/api/3/attachment/content/{id}` → `media.atlassian.com` is handled as internal Atlassian traffic and does **not** require an `external.fetch` manifest entry ([docs](https://developer.atlassian.com/platform/forge/runtime-egress-permissions/)). Working pattern: call `api.asUser().requestJira(route\`/rest/api/3/attachment/content/{id}\`)` then `await response.arrayBuffer()` (not `.json()` — binary will be corrupted) and decode as UTF-8 on the resolver side before returning text to the UI.
  - **Known runtime limit:** the resolver response payload cap is ~512 KB–1 MB in practice (community reports of "Payload Too Large" at ~512 KB for base64-encoded bodies). Since we return decoded UTF-8 text (not base64), the effective cap is higher, but the Stage 1 size-cap guard should use a conservative threshold (~500 KB of source bytes) until measured on the real runtime.
- **Frontend (Custom UI, React + Vite):**
  - **Why Custom UI over UI Kit 2:** we need to inject sanitized HTML from `markdown-it` + DOMPurify (via `dangerouslySetInnerHTML` or equivalent). UI Kit 2's component model does not support arbitrary HTML rendering, so Custom UI's iframe is required despite the extra bundle weight.
  - List markdown attachments on the issue.
  - Render selected file with `markdown-it` + plugins (GFM tables, task lists, anchor, highlight.js for code).
  - Sanitize output with DOMPurify before injection.
  - **Relative image links — v1 decision:** strip `<img>` tags with relative `src` and replace with a linkified placeholder (e.g. the alt text or filename as a plain link). Avoids rendering broken image icons on READMEs with screenshots. Sibling-attachment URLs are auth-gated and would require a proxy resolver returning data URLs, which interacts poorly with the 1 MB payload cap. Full resolution deferred to v2.
  - **Encoding:** enforce UTF-8. The resolver attempts `TextDecoder('utf-8', { fatal: true })` and returns a clear error to the UI on failure. No fallback to other encodings in v1.
  - **Bundle-size ceiling (v1):** 600 KB gzipped for the Custom UI bundle. Measured in CI; revisit if we need to add Mermaid/shiki.
  - **Error reporting:** no telemetry. Resolver and UI failures emit `console.error` with a structured message and surface a user-visible error state in the panel. Users diagnose via browser devtools.

## 5. Security

- All rendered HTML passes through DOMPurify with a conservative allowlist (no `<script>`, no inline event handlers, no `javascript:` URLs).
- Code blocks highlighted client-side; no `eval`.
- No external network fetches from rendered content by default — images from `http(s)://` are **click-to-load** (linkified, not auto-loaded) to avoid tracking pixels. A per-user toggle can opt in to auto-load.
- Forge scopes requested: `read:jira-work` only. No write scopes.

## 6. Licensing & Dependencies

- **License:** MIT.
- **Core deps (all permissive — MIT / BSD / Apache-2.0):**
  - `markdown-it` (+ `markdown-it-task-lists`, `markdown-it-anchor`, `markdown-it-emoji`)
  - `dompurify`
  - `highlight.js` (default for v1; trial `shiki` in v2 for higher-fidelity highlighting if bundle-size budget allows)
  - `@forge/api`, `@forge/bridge`, `@forge/resolver`
  - React 18, Vite
- No commercial dependencies. No telemetry.

## 7. Staged Development

### Stage 0 — Scaffolding

- `npm create @forge/cli` → pick Custom UI + Jira issue panel template.
- Set up repo, MIT `LICENSE`, `README.md`, `.editorconfig`, Prettier, ESLint.
- Verify `forge tunnel` works against a dev Jira site.
- **Pin Node version** in `package.json` `engines` and `.nvmrc` to match the Forge runtime (currently Node 20.x). Keep CI and local dev on the same pinned version.
- **Acceptance criteria:**
  - `forge tunnel` serves a hello-world panel on a real issue on the dev site.
  - Repo has MIT `LICENSE`, `README.md` stub, Prettier + ESLint configured, Node version pinned.

### Stage 1 — Walking Skeleton

- Issue-panel module appears on an issue.
- Resolver returns the attachment list filtered to `*.md` / `*.markdown` / `text/markdown`.
- UI shows a plain-text dump of the first markdown attachment.
- Deploy to `development` environment; install on personal dev site.
- **Size-cap guard:** reject attachments whose metadata `size` exceeds a conservative threshold (~500 KB initial, tune after measuring on the real runtime) *before* fetching bytes. Return a clear error string to the UI. (Lifted from Stage 3 because it gates the whole fetch path.)
- **Acceptance criteria:**
  - Panel appears on a real issue on the dev site.
  - Resolver returns only markdown-typed attachments; non-markdown filtered out.
  - Opening an issue with 0 markdown attachments shows an empty state, not an error.
  - Attachment over the size cap shows the size-cap error instead of a truncated/failed fetch.

### Stage 2 — Rendering

- Integrate `markdown-it` + GFM plugins.
- Add DOMPurify.
- Dropdown/selector when multiple `.md` attachments exist.
- Basic styling matching Atlassian design tokens (`@atlaskit/css` or hand-rolled CSS vars).
- **Acceptance criteria:**
  - GFM sample (tables, task lists, fenced code, autolinks) renders correctly.
  - `<script>` and `<img onerror=...>` fixtures render inert (verified in the browser, not just unit tests).
  - Selector switches between multiple `.md` attachments without a full reload.
  - Light + dark theme both legible.

### Stage 3 — Polish

- Code-block syntax highlighting.
- Task-list checkboxes (read-only).
- Empty state, error state, loading skeleton.
- **Manual refresh:** the panel will not auto-detect attachments added after it loads. Include a visible "Refresh" button to re-query the attachment list. Polling deferred unless needed.
- **Acceptance criteria:**
  - Common languages (js, ts, py, bash, json, yaml, md) highlight correctly.
  - Task-list boxes render as checkboxes; clicking them does nothing (read-only) and does not throw.
  - Refresh button re-fetches the attachment list; newly added `.md` appears without reloading the issue.
  - Loading skeleton shows during fetch; error state shows on resolver failure.

### Stage 4 — Hardening

- Unit tests for the markdown → sanitized HTML pipeline (Vitest).
- Manual test matrix: large file, binary masquerading as `.md`, non-UTF-8, files with YAML frontmatter, files with embedded HTML, files with malicious `<script>` / `<img onerror>`.
- Commit actual fixture files for the matrix above to the repo (e.g. `test/fixtures/`) so Vitest can exercise them automatically alongside the manual pass.
- YAML frontmatter handling: render raw as a fenced block at the top of the document (matches current Jira-download behaviour where users see the raw text). Revisit pretty-rendering in v2.
- Theme: ensure the renderer respects the user's chosen Atlassian theme (light / dark / system) via Atlassian design tokens or `prefers-color-scheme`.
- CI: GitHub Actions running lint + tests on PR.
- **End-to-end validation on a real Jira Cloud site** (our production site or a dedicated test site): install the deployed app, walk the Stage 1–3 acceptance criteria against real attachments, and record the pass/fail in the release notes. **Tech Lead signs off** on the walkthrough before v1.0 is tagged.
- **Acceptance criteria:**
  - Vitest suite green; fixture files in `test/fixtures/` covering the malicious-input matrix all render safely.
  - Manual test matrix signed off (large file, binary-masquerade, non-UTF-8, frontmatter, embedded HTML, `<script>`, `<img onerror>`).
  - End-to-end walkthrough on a real site passes every Stage 1–3 acceptance item.
  - CI runs lint + tests on PR and blocks merge on failure.

## 8. Deployment

### Release v1.0

- Tag `v1.0.0`, publish source on GitHub under MIT.
- `forge deploy --environment production`.
- Install on our production Jira Cloud site via `forge install`.
- Document install steps in README for others who want to self-host.

### Optional Marketplace Listing (later, only if demand)

- Requires Atlassian vendor account + app review.
- Free listing is fine; no revenue plumbing needed.
- Adds discoverability but also review overhead. Skip unless others ask for it.

### Deployment Model

| Environment   | Purpose                          | How installed                              |
|---------------|----------------------------------|--------------------------------------------|
| `development` | `forge tunnel` live dev          | `forge install --site <dev-site>`          |
| `production`  | Our real Jira Cloud site         | `forge deploy -e production` + install     |

No separate `staging` environment — end-to-end validation (Stage 4) runs against the dev site install before promoting to production.

Others who want to use it:
1. Clone the repo.
2. `npm install && forge login && forge deploy`.
3. `forge install` targeting their own Cloud site.

No hosted shared instance — each org runs its own Forge app under its own Atlassian account. This sidesteps any multi-tenant / GDPR / support-burden concerns.
