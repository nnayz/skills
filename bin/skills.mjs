#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  autocompleteMultiselect,
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  note,
  outro,
  select,
  spinner,
} from "@clack/prompts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(join(packageRoot, "catalog.json"), "utf8"));
const pkg = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const skillsCli = fileURLToPath(import.meta.resolve("skills/bin/cli.mjs"));

const agentAliases = new Map(
  catalog.agents.flatMap((agent) => [agent.id, ...(agent.aliases ?? [])].map((alias) => [alias, agent.id])),
);

function help() {
  return `Interactive agent skill installer.

Run the installer:
  npx --yes github:nnayz/skills
  bunx github:nnayz/skills

Options:
  -s, --skill <names>  Install comma-separated skills; use "*" for all
  -a, --agent <names>  Install for comma-separated agents; use "*" for all
  -g, --global         Install for the current user instead of this project
  --all                Install every catalog skill for every supported agent
  --force              Replace skills that are already installed
  -y, --yes            Skip confirmation prompts
  --dry-run            Print the upstream install commands without running them
  --list               List catalog skills and their upstream sources
  --list-agents        List supported agents
  --version            Print the package version
  -h, --help           Show this help
`;
}

function optionValues(option, value) {
  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!values.length) throw new Error(`${option} requires a name`);
  return values;
}

function parseArgs(args) {
  const options = {
    agents: [],
    all: false,
    dryRun: false,
    force: false,
    global: false,
    list: false,
    listAgents: false,
    skills: [],
    yes: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--all") options.all = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--global" || arg === "-g") options.global = true;
    else if (arg === "--list") options.list = true;
    else if (arg === "--list-agents") options.listAgents = true;
    else if (arg === "--yes" || arg === "-y") options.yes = true;
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
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      throw new Error(`Unexpected argument: ${arg}\nUse --skill <name> to select a skill.`);
    }
  }

  if (options.all && (options.skills.length || options.agents.length)) {
    throw new Error("--all cannot be combined with --skill or --agent");
  }
  return options;
}

function resolveSkills(requested, all = false) {
  const available = new Map(catalog.skills.map((skill) => [skill.id, skill]));
  const named = requested.filter((name) => name !== "*" && name !== "all");
  const unknown = named.filter((name) => !available.has(name));
  if (unknown.length) {
    throw new Error(`Unknown skill: ${unknown.join(", ")}\nAvailable: ${[...available.keys()].join(", ")}`);
  }
  if (all || requested.some((name) => name === "*" || name === "all")) return catalog.skills;
  return [...new Set(named)].map((name) => available.get(name));
}

function resolveAgents(requested, all = false) {
  const normalized = requested.map((name) => name.toLowerCase());
  const named = normalized.filter((name) => name !== "*" && name !== "all");
  const unknown = named.filter((name) => !agentAliases.has(name));
  if (unknown.length) {
    throw new Error(`Unknown agent: ${unknown.join(", ")}\nAvailable: ${catalog.agents.map((agent) => agent.id).join(", ")}`);
  }
  if (all || normalized.some((name) => name === "*" || name === "all")) {
    return catalog.agents.map((agent) => agent.id);
  }
  return [...new Set(named.map((name) => agentAliases.get(name)))];
}

function installPlan(selectedSkills, agents, global) {
  const agentMap = new Map(catalog.agents.map((agent) => [agent.id, agent.installerAgent]));
  const installerAgents = [...new Set(agents.map((agent) => agentMap.get(agent)))];
  const groups = new Map();
  for (const skill of selectedSkills) {
    const group = groups.get(skill.source) ?? [];
    group.push(skill.id);
    groups.set(skill.source, group);
  }

  return [...groups].map(([source, skills]) => {
    const args = ["add", source, "--skill", ...skills, "--agent", ...installerAgents, "--yes", "--json"];
    if (global) args.push("--global");
    return { source, skills, agents, global, args };
  });
}

function quote(value) {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function commandText(step) {
  return `npx --yes skills ${step.args.map(quote).join(" ")}`;
}

function parseJsonOutput(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("The upstream installer returned an invalid response.");
  return JSON.parse(output.slice(start, end + 1));
}

function runSkills(args, signal) {
  return new Promise((resolvePromise, reject) => {
    const grouped = process.platform !== "win32";
    const child = spawn(process.execPath, [skillsCli, ...args], {
      cwd: process.cwd(),
      detached: grouped,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const abort = () => {
      if (child.exitCode !== null) return;
      if (grouped) process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    };
    signal.addEventListener("abort", abort, { once: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) {
        reject(new Error("Installation cancelled."));
        return;
      }
      try {
        const results = parseJsonOutput(stdout);
        const failed = results.filter((result) => result.status !== "installed");
        if (code !== 0 || failed.length) {
          const reasons = failed.map((result) => `${result.name ?? "skill"}: ${result.error ?? result.reason ?? result.status}`);
          reject(new Error(reasons.join("\n") || stderr.trim() || `skills exited with code ${code}`));
          return;
        }
        resolvePromise(results);
      } catch (error) {
        reject(new Error(stderr.trim() || error.message));
      }
    });
  });
}

async function installedSkills(selectedSkills, selectedAgents, global) {
  const agentMap = new Map(catalog.agents.map((agent) => [agent.id, agent]));
  const base = global ? homedir() : process.cwd();
  const roots = [...new Set([join(base, ".agents", "skills"), ...selectedAgents.map((id) => {
    const agent = agentMap.get(id);
    return join(base, global ? agent.globalPath : agent.projectPath);
  })])];
  const checks = await Promise.all(selectedSkills.map(async (skill) => {
    for (const root of roots) {
      try {
        await access(join(root, skill.id));
        return skill.id;
      } catch {}
    }
    return null;
  }));
  return checks.filter(Boolean);
}

function cancelled(value) {
  if (!isCancel(value)) return false;
  cancel("Installation cancelled.");
  return true;
}

async function tui() {
  intro("Skill set installer");
  log.info(`${catalog.skills.length} curated skills from ${new Set(catalog.skills.map((skill) => skill.source)).size} upstream repositories.`);

  const skillMode = await select({
    message: "Which skills do you want?",
    options: [
      { value: "all", label: "All skills", hint: `${catalog.skills.length} skills` },
      { value: "select", label: "Choose skills", hint: "Search and select individually" },
    ],
    initialValue: "all",
  });
  if (cancelled(skillMode)) return;

  let selectedSkills = catalog.skills;
  if (skillMode === "select") {
    const selected = await autocompleteMultiselect({
      message: "Select skills",
      options: catalog.skills.map((skill) => ({
        value: skill.id,
        label: skill.name,
        hint: skill.description,
      })),
      required: true,
      placeholder: "Type to filter skills",
    });
    if (cancelled(selected)) return;
    selectedSkills = resolveSkills(selected);
  }

  const scope = await select({
    message: "Where should they be available?",
    options: [
      { value: "project", label: "This project", hint: "Recommended for shared repositories" },
      { value: "global", label: "Every project", hint: "Install for the current user" },
    ],
    initialValue: "project",
  });
  if (cancelled(scope)) return;

  const agentMode = await select({
    message: "Which AI agents should receive them?",
    options: [
      { value: "all", label: "All supported agents", hint: `${catalog.agents.length} agents` },
      { value: "select", label: "Choose agents", hint: "Select one or more" },
    ],
    initialValue: "all",
  });
  if (cancelled(agentMode)) return;

  let agents = catalog.agents.map((agent) => agent.id);
  if (agentMode === "select") {
    const selected = await multiselect({
      message: "Select agents",
      options: catalog.agents.map((agent) => ({
        value: agent.id,
        label: agent.name,
        hint: agent.projectPath,
      })),
      required: true,
    });
    if (cancelled(selected)) return;
    agents = resolveAgents(selected);
  }

  const sources = new Set(selectedSkills.map((skill) => skill.source));
  const existing = await installedSkills(selectedSkills, agents, scope === "global");
  note([
    `${selectedSkills.length} skill${selectedSkills.length === 1 ? "" : "s"}`,
    `${agents.length} agent${agents.length === 1 ? "" : "s"}`,
    `${scope === "global" ? "Global" : "Project"} scope`,
    `${sources.size} upstream repositor${sources.size === 1 ? "y" : "ies"}`,
    "Skills run with your agent's permissions; review unfamiliar upstreams before installing.",
  ].join("\n"), "Install plan");

  if (existing.length) {
    log.warn(`${existing.length} selected skill${existing.length === 1 ? " is" : "s are"} already installed: ${existing.join(", ")}`);
    const replace = await confirm({ message: "Replace the installed copies?", initialValue: false });
    if (cancelled(replace) || !replace) {
      if (!isCancel(replace)) cancel("Installation cancelled. No existing skills were replaced.");
      return;
    }
  }

  const approved = await confirm({ message: "Install this skill set?", initialValue: true });
  if (cancelled(approved) || !approved) {
    if (!isCancel(approved)) cancel("Installation cancelled.");
    return;
  }

  return { selectedSkills, agents, global: scope === "global" };
}

async function execute(plan, interactive) {
  if (!plan.length) throw new Error("Select at least one skill to install.");

  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);

  try {
    for (const step of plan) {
      const progress = interactive ? spinner() : null;
      progress?.start(`Installing ${step.skills.length} skill${step.skills.length === 1 ? "" : "s"} from ${step.source}`);
      try {
        const results = await runSkills(step.args, controller.signal);
        const security = results.flatMap((result) => result.security?.details ? [result.security.details] : []);
        progress?.stop(`Installed ${step.skills.join(", ")}`);
        if (security.length) log.info(`Security reports: ${[...new Set(security)].join(", ")}`);
        if (!interactive) process.stdout.write(`Installed ${step.skills.join(", ")} from ${step.source}\n`);
      } catch (error) {
        progress?.error(`Failed to install from ${step.source}`);
        throw error;
      }
    }
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }

  if (interactive) outro("Your selected skills are ready.");
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const options = parseArgs(rawArgs);

  if (options.help) return process.stdout.write(help());
  if (options.version) return process.stdout.write(`${pkg.version}\n`);
  if (options.list) {
    return process.stdout.write(`${catalog.skills.map((skill) => `${skill.id}\t${skill.source}`).join("\n")}\n`);
  }
  if (options.listAgents) {
    return process.stdout.write(`${catalog.agents.map((agent) => `${agent.id}\t${agent.name}`).join("\n")}\n`);
  }

  const interactive = rawArgs.length === 0;
  if (interactive) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("The interactive installer needs a terminal. Use --all --yes or select with --skill and --agent.");
    }
    const choices = await tui();
    if (!choices) return;
    await execute(installPlan(choices.selectedSkills, choices.agents, choices.global), true);
    return;
  }

  const selectedSkills = resolveSkills(options.skills, options.all);
  const agents = resolveAgents(options.agents, options.all);
  if (!selectedSkills.length) throw new Error("Use --skill <name> or --all to choose skills.");
  if (!agents.length) throw new Error("Use --agent <name> or --all to choose agents.");

  const plan = installPlan(selectedSkills, agents, options.global);
  if (options.dryRun) {
    process.stdout.write(`${plan.map(commandText).join("\n")}\n`);
    return;
  }
  if (!options.yes && !options.all) {
    throw new Error("Add --yes to install non-interactively, or run without options to use the TUI.");
  }
  const existing = await installedSkills(selectedSkills, agents, options.global);
  if (existing.length && !options.force) {
    throw new Error(`Already installed: ${existing.join(", ")}\nAdd --force to replace installed skills.`);
  }
  await execute(plan, false);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
