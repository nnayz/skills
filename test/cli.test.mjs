import assert from "node:assert/strict";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cli = resolve("bin/skills.mjs");

function run(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", ...options });
}

test("lists catalog skills and upstream sources", () => {
  const result = run(["--list"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^archify\ttt-a1i\/archify$/m);
  assert.match(result.stdout, /^ponytail\tDietrichGebert\/ponytail$/m);
  assert.equal(result.stdout.trim().split("\n").length, 19);
});

test("lists supported agents without exposing a separate command name", () => {
  const result = run(["--list-agents"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^claude-code\tClaude Code$/m);
  assert.match(result.stdout, /^prime-agent\tPrime Agent$/m);

  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /npx --yes github:nnayz\/skills/);
  assert.doesNotMatch(help.stdout, /nnayz-skills/);
});

test("groups selected skills into upstream dry-run commands", () => {
  const result = run([
    "--skill", "better-ui,archify,better-layout",
    "--agent", "claude-code,cursor",
    "--dry-run",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^npx --yes skills add jakubkrehel\/skills --skill better-ui better-layout --agent claude-code cursor --yes --json$/m);
  assert.match(result.stdout, /^npx --yes skills add tt-a1i\/archify --skill archify --agent claude-code cursor --yes --json$/m);
  assert.equal(result.stdout.trim().split("\n").length, 2);
});

test("maps Prime Agent to the shared installer target and deduplicates it", () => {
  const result = run([
    "--skill", "ponytail",
    "--agent", "prime,codex",
    "--global",
    "--dry-run",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim(),
    "npx --yes skills add DietrichGebert/ponytail --skill ponytail --agent codex --yes --json --global",
  );
});

test("expands all skills and agents into grouped commands", () => {
  const result = run(["--all", "--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split("\n").length, 6);
  assert.match(result.stdout, /^npx --yes skills add jakubkrehel\/skills --skill better-accessibility .* --agent claude-code codex cursor opencode fx grok --yes --json$/m);
  assert.match(result.stdout, /^npx --yes skills add ibelick\/ui-skills --skill component-canvas /m);
});

test("validates skill and agent choices", () => {
  const skill = run(["--skill", "missing-skill", "--agent", "codex", "--dry-run"]);
  assert.equal(skill.status, 1);
  assert.match(skill.stderr, /Unknown skill: missing-skill/);

  const agent = run(["--skill", "archify", "--agent", "missing-agent", "--dry-run"]);
  assert.equal(agent.status, 1);
  assert.match(agent.stderr, /Unknown agent: missing-agent/);
});

test("requires explicit confirmation for non-interactive installs", () => {
  const result = run(["--skill", "archify", "--agent", "codex"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Add --yes to install non-interactively/);
});

test("protects existing agent-specific skills unless forced", async () => {
  const { mkdir, mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "skill-set-overwrite-"));

  try {
    const skill = join(root, ".claude", "skills", "archify");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "local edit\n");

    const result = run(["--skill", "archify", "--agent", "claude-code", "--yes"], { cwd: root });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Already installed: archify/);
    assert.match(result.stderr, /Add --force/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("protects the shared canonical copy for agent-specific selections", async () => {
  const { mkdir, mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "skill-set-canonical-"));

  try {
    const skill = join(root, ".agents", "skills", "archify");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "local edit\n");

    const result = run(["--skill", "archify", "--agent", "claude-code,grok", "--yes"], { cwd: root });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Already installed: archify/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires a terminal when launched without options", () => {
  const result = run([]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /interactive installer needs a terminal/);
});

test("rejects conflicting and malformed selections", () => {
  const all = run(["--all", "--skill", "archify", "--dry-run"]);
  assert.equal(all.status, 1);
  assert.match(all.stderr, /--all cannot be combined/);

  for (const args of [["--skill", ",,,"], ["--agent", ",,,"]]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires a name/);
  }
});
