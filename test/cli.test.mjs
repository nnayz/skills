import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cli = resolve("bin/skills.mjs");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
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
