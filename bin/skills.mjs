#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { cp, mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundledSkills = join(packageRoot, "skills");

async function skillNames() {
  const entries = await readdir(bundledSkills, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function help() {
  return `Install @nnayz/skills into the current project.

Usage:
  nnayz-skills [skill ...] [options]

Options:
  --target <dir>  Install into this skills directory (default: .agents/skills)
  --global        Install into ~/.agents/skills
  --force         Replace skills that already exist
  --list          List bundled skills
  --version       Print the package version
  -h, --help      Show this help
`;
}

function parseArgs(args) {
  const options = { force: false, global: false, list: false, target: null, version: false };
  const selected = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--force") options.force = true;
    else if (arg === "--global") options.global = true;
    else if (arg === "--list") options.list = true;
    else if (arg === "--version") options.version = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--target") {
      const target = args[index + 1];
      if (!target || target.startsWith("-")) throw new Error("--target requires a directory");
      options.target = target;
      index += 1;
    } else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else selected.push(arg);
  }

  if (options.global && options.target) throw new Error("Use either --global or --target, not both");
  return { options, selected };
}

async function installSkill(name, targetRoot, force) {
  const source = join(bundledSkills, name);
  const destination = join(targetRoot, name);
  const temporary = join(targetRoot, `.${name}.tmp-${randomUUID()}`);

  try {
    await cp(source, temporary, { recursive: true, errorOnExist: true });
    if (force) await rm(destination, { recursive: true, force: true });
    await rename(temporary, destination);
    return "installed";
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    if (error.code === "EEXIST" || error.code === "ENOTEMPTY") return "skipped";
    throw error;
  }
}

async function main() {
  const { options, selected } = parseArgs(process.argv.slice(2));
  const available = await skillNames();

  if (options.help) {
    process.stdout.write(help());
    return;
  }
  if (options.version) {
    const pkg = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    process.stdout.write(`${pkg.version}\n`);
    return;
  }
  if (options.list) {
    process.stdout.write(`${available.join("\n")}\n`);
    return;
  }

  const requested = selected.length ? [...new Set(selected)] : available;
  const unknown = requested.filter((name) => !available.includes(name));
  if (unknown.length) {
    throw new Error(`Unknown skill: ${unknown.join(", ")}\nAvailable: ${available.join(", ")}`);
  }

  const targetRoot = options.global
    ? join(homedir(), ".agents", "skills")
    : resolve(options.target ?? join(".agents", "skills"));
  await mkdir(targetRoot, { recursive: true });

  let installed = 0;
  let skipped = 0;
  for (const name of requested) {
    const result = await installSkill(name, targetRoot, options.force);
    if (result === "installed") installed += 1;
    else skipped += 1;
    process.stdout.write(`${result === "installed" ? "+" : "="} ${name}${result === "skipped" ? " (already exists)" : ""}\n`);
  }

  process.stdout.write(`\nInstalled ${installed} skill${installed === 1 ? "" : "s"} into ${targetRoot}`);
  if (skipped) process.stdout.write(`; skipped ${skipped}`);
  process.stdout.write(".\n");
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
