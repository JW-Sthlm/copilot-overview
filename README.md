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

The dashboard is a persistent browser tab you keep open. First run:

```
generate my copilot overview
```

This creates `~/.copilot/overview/index.html` + `data.js` and opens it. **Bookmark the tab.**

To refresh:

```
refresh overview
```

The skill asks what to refresh (environment / projects / both), rewrites `data.js`, and your open tab picks it up automatically — silent reload if the tab isn't focused, click-to-reload banner if it is. State (active tab, filter) is preserved across reloads.

Trigger phrases: `generate my copilot overview`, `show my copilot setup`, `copilot inventory`, `environment report`, `refresh overview`.

### Projects view

The dashboard has two tabs: **Environment** and **Projects**. To populate or update only projects:

```
refresh projects
```

Or: `project status`, `what have I been working on`, `refresh project <name>`.

Each project card shows status (in_progress / done / abandoned / not_started), TLDR, last action, next steps, a smart suggestion, and an "Open in Copilot CLI" shortcut.

To exclude a folder from scanning, drop a `.overviewignore` file (gitignore syntax) in the scan root.

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
