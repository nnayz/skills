# Skills installer

A small interactive installer for a curated set of agent skills. The repository stores only a source catalog; skills are downloaded directly from their upstream repositories when selected.

## Run

Use either command from the project where you want the skills:

```sh
npx --yes github:nnayz/skills
# or
bunx github:nnayz/skills
```

Running the package with no options opens the TUI. It lets you choose:

- every catalog skill or specific skills
- project or global installation
- every supported AI agent or specific agents
- final confirmation before anything is installed

The installer supports Claude Code, Codex, Cursor, Prime Agent, OpenCode, `fx` by Vercel, and Grok. It delegates downloads and agent-directory integration to the open [`skills`](https://github.com/vercel-labs/skills) installer.

## Automation

Flags are available for scripts and CI without introducing another command name:

```sh
# Preview one skill for Claude Code
npx --yes github:nnayz/skills --skill archify --agent claude-code --dry-run

# Install selected skills for selected agents
npx --yes github:nnayz/skills \
  --skill better-ui,better-layout \
  --agent codex,cursor \
  --yes

# Install the complete catalog for every supported agent
npx --yes github:nnayz/skills --all

# Inspect the catalog
npx --yes github:nnayz/skills --list
npx --yes github:nnayz/skills --list-agents
```

Use `--global` to install for the current user instead of the current project. Agent aliases such as `claude`, `prime`, `open-code`, `fx-by-vercel`, and `grok-build` are accepted.

Existing skills are not replaced silently. The TUI asks before replacing selected skills; non-interactive installs require `--force` when a selected skill already exists. This release replaces the former positional skill syntax and custom `--target` option with the catalog-driven `--skill` and `--agent` flow.

## Catalog

[`catalog.json`](catalog.json) is the source of truth for the curated skill names, descriptions, upstream repositories, supported agents, and aliases. Skills from the same upstream are installed together to avoid redundant downloads.

No third-party skill contents are committed to this repository. Upstream availability and changes therefore affect installation; review the catalog and upstream repositories before installing.

## Development

Requires Node.js 22.20 or later.

```sh
npm install
npm run check
npm pack --dry-run
```
