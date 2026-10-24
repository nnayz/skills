#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { cp, mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundledSkills = join(packageRoot, "skills");
const sharedProjectTarget = join(".agents", "skills");
const sharedGlobalTarget = join(homedir(), ".agents", "skills");

const agents = {
  "claude-code": {
    label: "Claude Code",
    aliases: ["claude"],
    projectTarget: join(".claude", "skills"),
    globalTarget: join(homedir(), ".claude", "skills"),
  },
  codex: {
    label: "Codex",
    aliases: [],
    projectTarget: sharedProjectTarget,
    globalTarget: sharedGlobalTarget,
  },
  cursor: {
    label: "Cursor",
    aliases: [],
    projectTarget: sharedProjectTarget,
    globalTarget: join(homedir(), ".cursor", "skills"),
  },
  "prime-agent": {
    label: "Prime Agent",
    aliases: ["prime"],
    projectTarget: sharedProjectTarget,
    globalTarget: sharedGlobalTarget,
  },
  opencode: {
    label: "OpenCode",
    aliases: ["open-code"],
    projectTarget: sharedProjectTarget,
    globalTarget: join(homedir(), ".config", "opencode", "skills"),
  },
  fx: {
    label: "fx by Vercel",
    aliases: ["vercel-fx", "fx-by-vercel"],
    projectTarget: sharedProjectTarget,
    globalTarget: sharedGlobalTarget,
  },
  grok: {
    label: "Grok",
    aliases: ["grok-build"],
    projectTarget: join(".grok", "skills"),
    globalTarget: join(homedir(), ".grok", "skills"),
  },
};

const agentAliases = new Map(
  Object.entries(agents).flatMap(([name, agent]) => [name, ...agent.aliases].map((alias) => [alias, name])),
);

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
  -s, --skill <names>  Install comma-separated skills; use "*" for all
  -a, --agent <names>  Install for comma-separated agents; use "*" for all
  --all                Install all skills for all supported agents
  --target <dir>       Install into this skills directory (default: .agents/skills)
  --global             Install into user-level agent directories
  --force              Replace skills that already exist
  --list               List bundled skills
  --list-agents        List supported agent names and targets
  --version            Print the package version
  -h, --help           Show this help

Agents:
  claude-code, codex, cursor, prime-agent, opencode, fx, grok
`;
}

function commaSeparated(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function optionValues(option, value) {
  const values = commaSeparated(value);
  if (!values.length) throw new Error(`${option} requires a name`);
  return values;
}

function parseArgs(args) {
  const options = {
    agents: [],
    all: false,
    force: false,
    global: false,
    list: false,
    listAgents: false,
    skills: [],
    target: null,
    version: false,
  };
  const selected = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--force") options.force = true;
    else if (arg === "--global") options.global = true;
    else if (arg === "--all") options.all = true;
    else if (arg === "--list") options.list = true;
    else if (arg === "--list-agents") options.listAgents = true;
    else if (arg === "--version") options.version = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--agent" || arg === "-a") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) throw new Error(`${arg} requires an agent name`);
      options.agents.push(...optionValues(arg, value));
      index += 1;
    } else if (arg.startsWith("--agent=")) {
      options.agents.push(...optionValues("--agent", arg.slice("--agent=".length)));
    } else if (arg === "--skill" || arg === "-s") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) throw new Error(`${arg} requires a skill name`);
      options.skills.push(...optionValues(arg, value));
      index += 1;
    } else if (arg.startsWith("--skill=")) {
      options.skills.push(...optionValues("--skill", arg.slice("--skill=".length)));
    } else if (arg === "--target") {
      const target = args[index + 1];
      if (!target || target.startsWith("-")) throw new Error("--target requires a directory");
      options.target = target;
      index += 1;
    } else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else selected.push(arg);
  }

  if (options.global && options.target) throw new Error("Use either --global or --target, not both");
  if (options.agents.length && options.target) throw new Error("Use either --agent or --target, not both");
  if (options.all && (selected.length || options.skills.length || options.agents.length || options.target)) {
    throw new Error("--all cannot be combined with named skills, --agent, or --target");
  }
  return { options, selected };
}

function requestedSkills(available, selected, flagged, all) {
  const requested = [...selected, ...flagged];
  const named = requested.filter((name) => name !== "*" && name !== "all");
  if (all || requested.length === 0 || named.length !== requested.length) {
    return [...new Set([...available, ...named])];
  }
  return [...new Set(named)];
}

function requestedAgents(selected, all) {
  const normalized = selected.map((name) => name.toLowerCase());
  const named = normalized.filter((name) => name !== "*" && name !== "all");
  const unknown = named.filter((name) => !agentAliases.has(name));
  if (unknown.length) {
    throw new Error(`Unknown agent: ${unknown.join(", ")}\nAvailable: ${Object.keys(agents).join(", ")}`);
  }
  if (all || named.length !== normalized.length) return Object.keys(agents);
  return [...new Set(named.map((name) => agentAliases.get(name)))];
}

function installTargets(options) {
  if (options.target) return [resolve(options.target)];

  const selectedAgents = requestedAgents(options.agents, options.all);
  if (selectedAgents.length === 0) {
    return [options.global ? sharedGlobalTarget : resolve(sharedProjectTarget)];
  }

  return [...new Set(selectedAgents.map((name) => {
    const target = options.global ? agents[name].globalTarget : agents[name].projectTarget;
    return options.global ? target : resolve(target);
  }))];
}

function listAgents() {
  return Object.entries(agents)
    .map(([name, agent]) => `${name}\t${agent.label}\t${agent.projectTarget}\t${agent.globalTarget}`)
    .join("\n");
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
  if (options.listAgents) {
    process.stdout.write(`agent\tname\tproject target\tglobal target\n${listAgents()}\n`);
    return;
  }

  const requested = requestedSkills(available, selected, options.skills, options.all);
  const unknown = requested.filter((name) => !available.includes(name));
  if (unknown.length) {
    throw new Error(`Unknown skill: ${unknown.join(", ")}\nAvailable: ${available.join(", ")}`);
  }

  const targets = installTargets(options);

  let installed = 0;
  let skipped = 0;
  for (const targetRoot of targets) {
    await mkdir(targetRoot, { recursive: true });
    if (targets.length > 1) process.stdout.write(`\n${targetRoot}\n`);

    for (const name of requested) {
      const result = await installSkill(name, targetRoot, options.force);
      if (result === "installed") installed += 1;
      else skipped += 1;
      process.stdout.write(`${result === "installed" ? "+" : "="} ${name}${result === "skipped" ? " (already exists)" : ""}\n`);
    }
  }

  const destination = targets.length === 1 ? targets[0] : `${targets.length} agent directories`;
  process.stdout.write(`\nInstalled ${installed} skill${installed === 1 ? "" : "s"} into ${destination}`);
  if (skipped) process.stdout.write(`; skipped ${skipped}`);
  process.stdout.write(".\n");
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
