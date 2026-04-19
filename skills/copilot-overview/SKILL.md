# Copilot CLI Overview Generator

Generate a personalized, interactive HTML dashboard of your Copilot CLI environment.

## Description

Use this skill when the user asks to: generate copilot overview, show my copilot setup, create copilot dashboard, what do I have installed, map my copilot environment, copilot inventory, environment report, generate my setup page, what tools do I have.

## How to generate

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

1. Read the template from `references/template.html`
2. Replace the placeholder `const ENV_DATA = {};` with the populated data object
3. Save to the user's preferred output path (default: `~/projects/_output/copilot-overview.html` or current directory)
4. Open in the default browser

### Notes

- The operating stack section (M365 Copilot → GitHub Copilot → CLI → Agency → Squad) is static in the template — it doesn't change per user
- Built-in tools and agent types are listed as a static reference section in the template
- Group items by source: global custom → per plugin → system → project
- If a scan location doesn't exist, skip it silently
- Never fail on missing paths — gracefully degrade
