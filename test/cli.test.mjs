import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cli = resolve("bin/skills.mjs");

function run(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", ...options });
}

test("lists bundled skills", () => {
  const result = run(["--list"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ponytail$/m);
  assert.match(result.stdout, /^archify$/m);
});

test("installs a selected skill and protects existing content", async () => {
  const root = await mkdtemp(join(tmpdir(), "nnayz-skills-"));
  const target = join(root, "skills");

  try {
    const first = run(["ponytail", "--target", target]);
    assert.equal(first.status, 0, first.stderr);
    assert.match(await readFile(join(target, "ponytail", "SKILL.md"), "utf8"), /name: ponytail/);

    await writeFile(join(target, "ponytail", "SKILL.md"), "local edit\n");
    const second = run(["ponytail", "--target", target]);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(await readFile(join(target, "ponytail", "SKILL.md"), "utf8"), "local edit\n");

    const forced = run(["ponytail", "--target", target, "--force"]);
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(await readFile(join(target, "ponytail", "SKILL.md"), "utf8"), /name: ponytail/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unknown skills", () => {
  const result = run(["missing-skill"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown skill: missing-skill/);
});

test("installs flagged skills for a selected agent", async () => {
  const root = await mkdtemp(join(tmpdir(), "nnayz-skills-agent-"));

  try {
    const result = run(["--skill", "ponytail", "--agent", "claude"], { cwd: root });
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(join(root, ".claude", "skills", "ponytail", "SKILL.md"), "utf8"), /name: ponytail/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deduplicates shared targets for multiple agents", async () => {
  const root = await mkdtemp(join(tmpdir(), "nnayz-skills-agents-"));

  try {
    const result = run(["-s", "ponytail", "-a", "codex,cursor,prime-agent,opencode,fx"], { cwd: root });
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(join(root, ".agents", "skills", "ponytail", "SKILL.md"), "utf8"), /name: ponytail/);
    assert.match(result.stdout, /Installed 1 skill into/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("installs a selected skill for all supported agent targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "nnayz-skills-all-agents-"));

  try {
    const result = run(["--skill", "ponytail", "--agent", "*"], { cwd: root });
    assert.equal(result.status, 0, result.stderr);
    for (const target of [".agents", ".claude", ".grok"]) {
      assert.match(await readFile(join(root, target, "skills", "ponytail", "SKILL.md"), "utf8"), /name: ponytail/);
    }
    assert.match(result.stdout, /Installed 3 skills into 3 agent directories/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("installs all skills for all supported agent targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "nnayz-skills-all-"));

  try {
    const result = run(["--all"], { cwd: root });
    assert.equal(result.status, 0, result.stderr);
    for (const target of [".agents", ".claude", ".grok"]) {
      assert.match(await readFile(join(root, target, "skills", "archify", "SKILL.md"), "utf8"), /name: archify/);
      assert.match(await readFile(join(root, target, "skills", "ponytail", "SKILL.md"), "utf8"), /name: ponytail/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lists and validates agent choices", () => {
  const listed = run(["--list-agents"]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /^claude-code\tClaude Code\t\.claude\/skills/m);
  assert.match(listed.stdout, /^prime-agent\tPrime Agent\t\.agents\/skills/m);

  const unknown = run(["--agent", "missing-agent", "--skill", "ponytail"]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown agent: missing-agent/);
});

test("rejects conflicting target choices", () => {
  const result = run(["--agent", "codex", "--target", "somewhere"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Use either --agent or --target/);

  const all = run(["--all", "--target", "somewhere"]);
  assert.equal(all.status, 1);
  assert.match(all.stderr, /--all cannot be combined/);
});

test("rejects empty and invalid wildcard selections", () => {
  for (const args of [["--skill", ",,,"], ["--agent", ",,,"]]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires a name/);
  }

  const skill = run(["--skill", "*,missing-skill"]);
  assert.equal(skill.status, 1);
  assert.match(skill.stderr, /Unknown skill: missing-skill/);

  const agent = run(["--skill", "ponytail", "--agent", "*,missing-agent"]);
  assert.equal(agent.status, 1);
  assert.match(agent.stderr, /Unknown agent: missing-agent/);
});
