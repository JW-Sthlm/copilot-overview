# copilot-overview

A Copilot CLI plugin that generates a personalized HTML dashboard of your environment.

## What it does

Say **"generate my copilot overview"** and the skill introspects your setup:

- Instructions, agents, skills, MCP servers, extensions, plugins
- Project-level configs (`.copilot/`, `.github/`, `.squad/`)
- Plugin-contributed assets (with parent-child grouping)
- CLI version and model info

Outputs a self-contained HTML dashboard with an interactive operating stack (M365 Copilot → GitHub Copilot → CLI → Agency → Squad), explainer cards, and filterable inventory.

## Install

**You're already in Copilot CLI — let it install itself.** Paste this prompt:

> Install the copilot-overview extension from this repo:
> https://github.com/JW-Sthlm/copilot-overview
>
> Clone it, copy the extension folder to `~/.copilot/extensions/copilot-overview/`,
> copy the skill folder to `~/.copilot/skills/copilot-overview/`,
> then reload extensions.

See [INSTALL.md](./INSTALL.md) for details and troubleshooting.

### Alternative: plugin install

If/when GitHub's plugin marketplace is available:

```
/plugin install JW-Sthlm/copilot-overview
```

Note: the discovery extension still needs to be copied to `~/.copilot/extensions/` manually — plugins don't auto-install extensions yet.

## Usage

In any Copilot CLI session:

```
generate my copilot overview
```

Or: `show my copilot setup`, `copilot inventory`, `environment report`

### Projects view (v2)

Ask for a status digest across your project folders:

```
what have I been working on
```

Or: `project status`, `generate project overview`

The skill scans `~/projects` and `~/work` (configurable via `.overviewignore`), joins data from Copilot session history, git, and `plan.md` files, and renders a second tab with:

- **TLDR + status** per project (in_progress / done / abandoned / not_started)
- **Last action** and **next steps** picked up from the most recent session checkpoint
- **Smart suggestion** — the model's one-line recommendation for what to pick up next
- **Open in Copilot CLI** button — generates a shortcut that `cd`'s into the project and launches the CLI

To exclude a folder, drop a `.overviewignore` file next to it (gitignore-style patterns).
To refresh a single project, say `refresh project <name>`.

## Privacy

**Safe by default.** The skill instructs the model to:
- Redact absolute home paths to `~/`
- Never include env var values from MCP configs
- Never include emails or secrets
- Show server names and types only

## How it works

1. **SKILL.md** triggers on environment-related prompts
2. Model scans your `~/.copilot/`, plugins, and current project
3. Populates a structured `ENV_DATA` JavaScript object
4. Injects it into `template.html` — a data-driven renderer
5. Saves and opens the result

The template renders everything from the data object. No personal data is hardcoded in the template itself.

## Structure

```
plugin.json                          # Plugin manifest
skills/copilot-overview/
  SKILL.md                           # Skill instructions
  references/
    template.html                    # Data-driven HTML template
```

## License

MIT
