# Copilot CLI Overview Generator

Generate a personalized, interactive HTML dashboard of your Copilot CLI environment.

## Description

Use this skill when the user asks to: generate copilot overview, show my copilot setup, create copilot dashboard, what do I have installed, map my copilot environment, copilot inventory, environment report, generate my setup page, what tools do I have.

## How to generate

### Preferred: Use the discovery tool

If the `discover_copilot_environment` tool is available (provided by this plugin's extension), call it first:

```
discover_copilot_environment({ scan_roots: "~/projects" })
```

This returns a complete `ENV_DATA` JSON object with all items discovered programmatically. Skip to Step 3.

The tool:
- Scans all config locations automatically
- Merges plugin-contributed agents/skills/MCP into the main lists
- Redacts home paths and sensitive values by default
- Discovers project-level configs across multiple repos

If the tool is NOT available (e.g. extension didn't load), fall back to manual scanning below.

### Fallback: Manual introspection

### Step 1: Collect environment data

Scan the following locations. For each item found, record: name, type, scope, source path, and a one-line description (read from file frontmatter or first paragraph if available).

**Default to safe mode:** redact absolute home paths to `~/`, never include env var values from MCP configs, never include emails or secrets. Show server names and types only.

#### Global config (`~/.copilot/`)

| What | Scan location | Notes |
|------|--------------|-------|
| Instructions | `~/.copilot/copilot-instructions.md` | Read first line for summary |
| Agents | `~/.copilot/agents/*.agent.md` | Read YAML frontmatter for description |
| Skills | `~/.copilot/skills/*/SKILL.md` | Read first heading + description line |
| Skills (Codex) | `~/.codex/skills/*/SKILL.md` | Legacy path, may not exist |
| MCP Servers | `~/.copilot/mcp-config.json` | Parse JSON — record server names only, redact args/env |
| Extensions | `~/.copilot/extensions/*/extension.mjs` | Record extension name from folder |
| LSP Servers | `~/.copilot/lsp-config.json` | Parse JSON — record language/command pairs |

#### Installed plugins (`~/.copilot/installed-plugins/`)

For each plugin directory:
1. Read `plugin.json` or `.claude-plugin/plugin.json` or `.github/plugin/plugin.json` for name/description/version
2. Scan for `**/*.agent.md` — count and list agent names
3. Scan for `**/skills/*/SKILL.md` — count and list skill names
4. Scan for `**/.mcp.json` — count MCP servers contributed
5. Record plugin as parent; agents/skills/MCP as children (avoids double-counting)

#### Project-level (current working directory, if in a git repo)

| What | Scan location |
|------|--------------|
| Instructions | `.github/copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` |
| Additional instructions | `.github/instructions/**/*.instructions.md` |
| Agents | `.copilot/agents/*.agent.md` |
| Skills | `.copilot/skills/*/SKILL.md` |
| MCP Servers | `.copilot/mcp-config.json`, `.mcp.json` |
| Extensions | `.github/extensions/*/extension.mjs` |
| LSP Servers | `.github/lsp.json` |
| Squad | `.squad/` directory (check for `agents/*/charter.md`) |

#### Project inventory (optional)

If the user has a workspace with multiple repos (e.g. `~/projects/`), offer to scan for repos with copilot configs. **Do not assume `~/projects/` exists** — ask the user for their repo root, or skip this section.

For each discovered repo, record:
- Has project instructions (yes/no)
- Has agents/skills/MCP/extensions/Squad (counts)
- Git remote URL (if available, for linking)

#### CLI metadata

Also collect:
- CLI version: run `copilot --version` or check `/version` output
- Experimental mode: check if enabled
- Current model: if known from session context
- OS platform

### Step 2: Build the data payload

Construct a JavaScript object matching this schema and inject it into the template:

```javascript
const ENV_DATA = {
  meta: {
    generatedAt: "ISO date string",
    cliVersion: "string or null",
    experimentalMode: true/false,
    currentModel: "string or null",
    platform: "Windows/macOS/Linux"
  },
  instructions: [
    { name: "string", scope: "global|project", desc: "string", path: "redacted path" }
  ],
  agents: [
    { name: "string", scope: "global|plugin|project", source: "plugin name or empty", desc: "string" }
  ],
  skills: [
    { name: "string", scope: "global|plugin|system|project", source: "plugin name or empty", desc: "string" }
  ],
  mcpServers: [
    { name: "string", scope: "global|plugin|system|project", desc: "string", path: "redacted" }
  ],
  extensions: [
    { name: "string", scope: "global|project", desc: "string" }
  ],
  lspServers: [
    { name: "string", scope: "global|project", languages: ["string"] }
  ],
  plugins: [
    { name: "string", desc: "string", version: "string", agents: 0, skills: 0, mcpServers: 0 }
  ],
  projects: [
    { name: "string", desc: "string", hasInstructions: true/false, agents: 0, skills: 0, mcp: 0, hasSquad: true/false, remoteUrl: "string or null" }
  ]
};
```

### Step 3: Generate output

**Output mode: persistent dashboard (default).**

The dashboard is a long-lived browser tab the user keeps open and refreshes on demand. Two files live at a stable path:

```
~/.copilot/overview/index.html   # template copy (one-time)
~/.copilot/overview/data.js      # skill-generated payload — rewritten on each refresh
```

**First-time setup:**

1. Create `~/.copilot/overview/` if missing.
2. Copy `references/template.html` verbatim to `~/.copilot/overview/index.html`. Do NOT modify the template for this install.
3. Write `data.js` (see format below).
4. Open `~/.copilot/overview/index.html` in the default browser.

**data.js format:**

```js
// Generated by copilot-overview skill. Do not edit by hand.
window.DASHBOARD = {
  version: "<monotonic integer or ISO timestamp>",
  generated_at: "<ISO 8601 timestamp>",
  mode: "full",          // "full" | "env_only" | "projects_only"
  env: { /* ENV_DATA object */ },
  projects: [ /* PROJECT_DATA.projects array */ ]
};
```

Bump `version` on every write. The open browser tab polls `data.js` every 30s and auto-reloads (silently if the tab is not active; otherwise shows a click-to-reload banner).

**Refresh flow:**

When the user says "refresh overview", "update overview", "refresh dashboard", or the trigger phrase again:

1. **Ask which section to refresh** (unless they specify):
   > "Refresh environment (fast), projects (slower), or both?"
2. Load the existing `data.js` so you preserve the other section.
3. Regenerate only the requested section.
4. Rewrite `data.js` with a bumped `version` and updated `generated_at`.
5. Do NOT reopen the browser — the user's existing tab will pick up the change.

For single-project refresh ("refresh project X"): load `data.js`, re-synthesize only that project entry, bump version, rewrite.

**Legacy one-shot mode (preview / first run without stable path):**

If the user explicitly asks for a one-off file (e.g., "save overview to ~/Desktop"), you may instead inline the data into a single HTML file by replacing the template's fallback block:

```js
window.DASHBOARD = window.DASHBOARD || { version:"0", ... };
```

with a populated object. The template works either way.

### Notes

- The operating stack section (M365 Copilot → GitHub Copilot → CLI → Agency → Squad) is static in the template — it doesn't change per user
- Built-in tools and agent types are listed as a static reference section in the template
- Group items by source: global custom → per plugin → system → project
- If a scan location doesn't exist, skip it silently
- Never fail on missing paths — gracefully degrade

---

## Projects view (second tab)

Trigger phrases: "project status", "what have I been working on", "pick up where I left off", "projects overview", "what's next", "project tldr".

### Step 1: Collect raw project data

Call the extension tool:

```
discover_project_status({ scan_roots: "~/projects,~/work" })
```

This returns an array of project records with filesystem/git data: `name`, `path`, `abs_path`, `remote_url`, `branch`, `last_commit_at`, `last_commit_subject`, `uncommitted_count`, `commits_last_30d`, `plan_md`, `last_file_activity_at`, `raw_hash`.

**Default scan_roots**: start with `~/projects` and `~/work`. Ask the user to override if these don't match their setup.

### Step 2: Query session_store for each project

Use the `sql` tool with `database: "session_store"` to get session/checkpoint data. Match sessions by `cwd` prefix — a project at `C:/Users/x/projects/foo` owns sessions whose cwd equals or starts with that path.

For each project, fetch:

```sql
-- Sessions for this project
SELECT id, summary, created_at, updated_at
FROM sessions
WHERE cwd = :abs_path OR cwd LIKE :abs_path || '%'
ORDER BY updated_at DESC LIMIT 10;

-- Latest checkpoint (across all sessions for this project)
SELECT c.session_id, c.checkpoint_number, c.title, c.overview, c.work_done, c.next_steps
FROM checkpoints c
JOIN sessions s ON c.session_id = s.id
WHERE s.cwd = :abs_path OR s.cwd LIKE :abs_path || '%'
ORDER BY s.updated_at DESC, c.checkpoint_number DESC
LIMIT 1;

-- Activity counters
SELECT COUNT(*) AS turns_30d FROM turns t
JOIN sessions s ON t.session_id = s.id
WHERE (s.cwd = :abs_path OR s.cwd LIKE :abs_path || '%')
  AND t.timestamp >= date('now', '-30 days');

SELECT COUNT(*) AS turns_7d FROM turns t
JOIN sessions s ON t.session_id = s.id
WHERE (s.cwd = :abs_path OR s.cwd LIKE :abs_path || '%')
  AND t.timestamp >= date('now', '-7 days');
```

To avoid one-query-per-project at scale, batch with an `IN` clause or a UNION per project. For small project counts (<20), serial queries are fine.

### Step 3: Read cache

Read `~/.copilot/skills/copilot-overview/cache/projects.json` if it exists. Schema:

```json
{
  "version": 1,
  "projects": {
    "<abs_path>": {
      "refreshed_at": "ISO",
      "raw_hash": "string",
      "status": "in_progress|done|abandoned|not_started",
      "tldr": "string",
      "last_action": "string",
      "next_steps": ["string"],
      "smart_suggestion": "string"
    }
  }
}
```

For each project, compare the cache's `raw_hash` against the extension's `raw_hash`. Also check if checkpoint data has newer `updated_at` than `refreshed_at`. If hash matches AND no new checkpoint → reuse cached synthesis. Otherwise re-synthesize.

### Step 4: Classify status

Use these rules as a default; override with judgment based on plan.md and checkpoint content.

| Signal | Status |
|--------|--------|
| Never had a session AND no recent git activity | `not_started` |
| Any activity in last 14 days (turns, commits, or uncommitted changes) | `in_progress` |
| Has open todos in plan.md OR non-empty `next_steps` in latest checkpoint, no activity 14-30 days | `in_progress` (stale but not dropped) |
| No activity > 30 days AND open todos/next_steps | `abandoned` |
| No activity > 14 days AND empty next_steps/no open todos | `done` |

### Step 5: Synthesize fields

For each project needing fresh synthesis:

- **tldr** — 1 sentence. What is this project? Draw from: latest checkpoint `overview`, plan.md "Problem" section, or git remote README if sparse.
- **last_action** — 1 sentence. What was the last meaningful thing done? Draw from: latest checkpoint `work_done` (summarize), or last commit subject, or plan.md status.
- **next_steps** — Max 3 bullets. Draw from: plan.md open todos (status != done), then latest checkpoint `next_steps`. If both empty and status is `done`, return empty array.
- **smart_suggestion** — 1 sentence, actionable. Consider: time since last activity, uncommitted changes (remind to commit/push), imminent-sounding todos, dependencies on other projects the user is also working on. Example: "You last touched this 12 days ago and have 2 uncommitted files — finish the pricing slide and ship v0.2." Do NOT fabricate deadlines or names not in source data.

**Redaction rules** (same as environment view):
- Never output paths outside `~/`
- Never include env var values, emails, tokens, or partner/customer names unless they're already in the public-facing project name
- If a project looks like private partner work (check `.overviewignore` patterns, folder name hints like `-nda`, or checkpoint mentions), prefer conservative summaries

### Step 6: Write cache

Write updated synthesis back to `~/.copilot/skills/copilot-overview/cache/projects.json`. Keep previously-cached projects that still exist on disk; drop entries for projects no longer present.

### Step 7: Generate shortcuts

For each project, write a `.bat` file to `~/.copilot/skills/copilot-overview/shortcuts/<safe-name>.bat`:

```bat
@echo off
cd /d "<abs_path>"
copilot
```

On macOS/Linux, write `.command` files instead:

```bash
#!/usr/bin/env bash
cd "<abs_path>"
exec copilot
```

`<safe-name>` is the project name lowercased with non-alphanumerics replaced by `-`. Ensure the shortcuts directory exists.

### Step 8: Populate PROJECT_DATA

Build this structure and inject into the template alongside `ENV_DATA`:

```javascript
const PROJECT_DATA = {
  generated_at: "ISO",
  projects: [
    {
      name: "string",
      path: "~/projects/foo",
      repository: "https://github.com/... or null",
      branch: "string or null",
      status: "in_progress|done|abandoned|not_started",
      last_activity_at: "ISO",
      tldr: "string",
      last_action: "string",
      next_steps: ["string"],
      smart_suggestion: "string",
      uncommitted_count: 0,
      shortcut_path: "file:///.../shortcuts/foo.bat",
      refresh_prompt: "refresh project foo"
    }
  ]
};
```

`refresh_prompt` is text the UI will copy to clipboard when the user clicks Refresh on that card.

### Step 9: Render

Write the payload to `~/.copilot/overview/data.js` (see "Step 3: Generate output" for the dashboard file layout). Load the existing `data.js` first and merge: keep the current `env` section, replace `projects`, bump `version`, refresh `generated_at`.

If the dashboard files don't exist yet (`~/.copilot/overview/index.html`), create them first (copy the template verbatim). Open the browser only on this first run — subsequent refreshes should NOT reopen the tab; the user's open tab polls `data.js` and updates itself.

For **projects-only** mode (user explicitly asked for just projects with no env): set `mode: "projects_only"` in the payload. The template hides the Environment tab in that case.

### Refresh flows

- **"refresh project status"** / **"refresh projects"** → Steps 1–2 for all projects, force cache regen, rewrite `data.js` with bumped version
- **"refresh project X"** → load existing `data.js`, re-synthesize only that project entry, update cache, bump version, rewrite
- **"refresh overview"** (ambiguous) → ask: environment, projects, or both?
- In all refresh cases, do NOT reopen the browser. The open tab auto-picks up changes.

### .overviewignore format

Place `.overviewignore` at each `scan_root` (e.g., `~/projects/.overviewignore`). Gitignore-style, one pattern per line:

```
# private partner work
frontier-consultancy
*-nda
_output
```

The extension filters these out before returning data — summaries will never be generated for ignored projects.

