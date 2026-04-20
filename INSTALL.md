# Install

You're already in Copilot CLI — let it do the install for you.

## Simplest path (recommended)

Paste this into Copilot CLI:

> Install the copilot-overview extension from this repo:
> https://github.com/JW-Sthlm/copilot-overview
>
> Clone it, copy the extension folder to `~/.copilot/extensions/copilot-overview/`,
> copy the skill folder to `~/.copilot/skills/copilot-overview/`,
> then reload extensions.

Then ask:

> Generate my Copilot CLI overview

Done. A self-contained HTML dashboard opens in your browser.

## What gets installed

Two files, both under your home directory:

- `~/.copilot/extensions/copilot-overview/extension.mjs` — discovery tool
- `~/.copilot/skills/copilot-overview/` — skill + HTML template

Nothing else is touched. No system-wide changes.

## Uninstall

Paste into Copilot CLI:

> Remove the copilot-overview extension and skill from my `~/.copilot/` folder.

## Troubleshooting

**"Extension not found" after install** — ask Copilot CLI to run `extensions_reload`, or restart the CLI.

**Git not available** — Copilot CLI will fall back to downloading the zip from GitHub.

**Corporate proxy blocks git clone** — ask Copilot CLI to download individual files via the GitHub raw URLs instead.
