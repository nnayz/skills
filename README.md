# @nnayz/skills

One command installs Nasrul's shared agent skills into any project.

## Install

Run directly from the personal GitHub repository:

```sh
npx --yes github:nnayz/skills
# or
bunx github:nnayz/skills
```

The default destination is `.agents/skills`, which is shared by compatible coding agents. The installer does not overwrite an existing skill unless you pass `--force`.

After publishing the prepared npm package, the shorter commands are:

```sh
npx --yes @nnayz/skills
# or
bunx @nnayz/skills
```

## Usage

```sh
# Install every bundled skill into the current project
nnayz-skills

# Install only selected skills
nnayz-skills ponytail i-have-adhd
nnayz-skills --skill ponytail,i-have-adhd

# Install one skill for Claude Code
nnayz-skills --skill archify --agent claude-code

# Install all skills for one or more agents
nnayz-skills --skill '*' --agent codex,cursor

# Install every skill for every supported agent
nnayz-skills --all

# Refresh existing copies from this repository
nnayz-skills --force

# Install into the personal ~/.agents/skills collection
nnayz-skills --global --force

# Inspect what is available
nnayz-skills --list
nnayz-skills --list-agents
```

Agent choices are `claude-code`, `codex`, `cursor`, `prime-agent`, `opencode`, `fx`, and `grok`. Common aliases such as `claude`, `prime`, `open-code`, `fx-by-vercel`, and `grok-build` are accepted. Use `*` or `all` with `--skill` or `--agent` to select every available choice. Repeat either option or pass a comma-separated list to select several.

Project installs for Codex, Cursor, Prime Agent, OpenCode, and `fx` share `.agents/skills`, which those agents discover natively. Claude Code uses `.claude/skills`, and Grok uses `.grok/skills`. Add `--global` to use the corresponding user-level directories, or use `--target <directory>` for another agent-specific skills folder.

## Bundled skills

This repository currently contains 19 skills:

- `i-have-adhd`
- `archify`
- `better-accessibility`, `better-colors`, `better-interface`, `better-layout`
- `better-typography`, `better-ui`, `better-writing`, `break`, `build-design`
- `explain-interface`, `interface-review`, `state-machine`, `technical-drawing`, `variant`
- `component-canvas`
- `make-interfaces-feel-better`
- `ponytail`

See [UPSTREAMS.md](UPSTREAMS.md) for source repositories and update provenance.

## Development

```sh
npm test
npm pack --dry-run
```
