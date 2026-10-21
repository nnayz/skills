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

# Refresh existing copies from this repository
nnayz-skills --force

# Install into the personal ~/.agents/skills collection
nnayz-skills --global --force

# Inspect what is available
nnayz-skills --list
```

Use `--target <directory>` for another agent-specific skills folder.

## Bundled skills

This repository currently contains 18 skills:

- `i-have-adhd`
- `archify`
- `better-accessibility`, `better-colors`, `better-interface`, `better-layout`
- `better-typography`, `better-ui`, `better-writing`, `break`, `build-design`
- `explain-interface`, `interface-review`, `state-machine`, `technical-drawing`, `variant`
- `make-interfaces-feel-better`
- `ponytail`

See [UPSTREAMS.md](UPSTREAMS.md) for source repositories and update provenance.

## Development

```sh
npm test
npm pack --dry-run
```
