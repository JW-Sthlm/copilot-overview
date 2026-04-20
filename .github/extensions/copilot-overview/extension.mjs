import { joinSession } from "@github/copilot-sdk/extension";
import { readdir, readFile, stat, access } from "node:fs/promises";
import { join, basename, resolve, sep } from "node:path";
import { homedir, platform } from "node:os";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const HOME = homedir();
const COPILOT_DIR = join(HOME, ".copilot");
const CODEX_DIR = join(HOME, ".codex");
const PLUGINS_DIR = join(COPILOT_DIR, "installed-plugins");

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function safeReadJson(p) {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; }
}

async function safeReadText(p) {
  try { return await readFile(p, "utf8"); } catch { return null; }
}

async function listDir(p) {
  try { return await readdir(p); } catch { return []; }
}

async function isDir(p) {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

function redactPath(p) {
  return p.replace(HOME, "~").replace(/\\/g, "/");
}

function firstLine(text) {
  if (!text) return "";
  const lines = text.split("\n").filter(l => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
  return (lines[0] || "").trim().slice(0, 200);
}

async function discoverInstructions(cwd) {
  const items = [];
  const globalInst = join(COPILOT_DIR, "copilot-instructions.md");
  if (await exists(globalInst)) {
    const text = await safeReadText(globalInst);
    items.push({ name: "copilot-instructions.md", scope: "global", desc: firstLine(text), path: redactPath(globalInst) });
  }
  // Project-level
  for (const fname of ["copilot-instructions.md"]) {
    const p = join(cwd, ".github", fname);
    if (await exists(p)) {
      const text = await safeReadText(p);
      items.push({ name: fname, scope: "project", desc: firstLine(text), path: redactPath(p) });
    }
  }
  for (const fname of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
    const p = join(cwd, fname);
    if (await exists(p)) items.push({ name: fname, scope: "project", desc: `Root-level instruction file`, path: redactPath(p) });
  }
  // .github/instructions/**/*.instructions.md
  const instDir = join(cwd, ".github", "instructions");
  if (await isDir(instDir)) {
    const walk = async (dir) => {
      for (const f of await listDir(dir)) {
        const fp = join(dir, f);
        if (await isDir(fp)) await walk(fp);
        else if (f.endsWith(".instructions.md")) items.push({ name: f, scope: "project", desc: "Additional instruction file", path: redactPath(fp) });
      }
    };
    await walk(instDir);
  }
  return items;
}

async function discoverAgents(cwd) {
  const items = [];
  const seen = new Set();
  // Global agents
  const globalAgentDir = join(COPILOT_DIR, "agents");
  for (const f of await listDir(globalAgentDir)) {
    if (f.endsWith(".agent.md")) {
      const text = await safeReadText(join(globalAgentDir, f));
      const name = f.replace(".agent.md", "");
      seen.add(name);
      items.push({ name, scope: "global", source: "Global — your custom", desc: firstLine(text), path: redactPath(join(globalAgentDir, f)) });
    }
  }
  // Project agents (only if different from global path)
  const projAgentDir = join(cwd, ".copilot", "agents");
  if (resolve(projAgentDir) !== resolve(globalAgentDir)) {
    for (const f of await listDir(projAgentDir)) {
      if (f.endsWith(".agent.md")) {
        const name = f.replace(".agent.md", "");
        if (!seen.has(name)) {
          items.push({ name, scope: "project", source: "Project", desc: "", path: redactPath(join(projAgentDir, f)) });
        }
      }
    }
  }
  return items;
}

async function discoverSkills(cwd) {
  const items = [];
  const seen = new Set();
  // Global skills (~/.copilot/skills/)
  const copilotSkillsDir = join(COPILOT_DIR, "skills");
  for (const d of await listDir(copilotSkillsDir)) {
    const skillFile = join(copilotSkillsDir, d, "SKILL.md");
    if (await exists(skillFile)) {
      const text = await safeReadText(skillFile);
      seen.add(d);
      items.push({ name: d, scope: "global", source: "Global — your custom", desc: firstLine(text) });
    }
  }
  // Codex skills (~/.codex/skills/)
  for (const d of await listDir(join(CODEX_DIR, "skills"))) {
    const skillFile = join(CODEX_DIR, "skills", d, "SKILL.md");
    if (await exists(skillFile) && !seen.has(d)) {
      const text = await safeReadText(skillFile);
      seen.add(d);
      items.push({ name: d, scope: "global", source: "Global — Codex", desc: firstLine(text) });
    }
  }
  // Project skills (only if different from global path)
  const projSkillsDir = join(cwd, ".copilot", "skills");
  if (resolve(projSkillsDir) !== resolve(copilotSkillsDir)) {
    for (const d of await listDir(projSkillsDir)) {
      const skillFile = join(projSkillsDir, d, "SKILL.md");
      if (await exists(skillFile) && !seen.has(d)) {
        items.push({ name: d, scope: "project", source: "Project", desc: "" });
      }
    }
  }
  return items;
}

async function discoverMcpServers(cwd) {
  const items = [];
  const seen = new Set();
  // Global MCP config
  const globalMcp = await safeReadJson(join(COPILOT_DIR, "mcp-config.json"));
  if (globalMcp?.mcpServers) {
    for (const [name, cfg] of Object.entries(globalMcp.mcpServers)) {
      seen.add(name);
      items.push({ name, scope: "global", source: "Global — user-configured", desc: `Command: ${cfg.command || "unknown"}`, path: redactPath(join(COPILOT_DIR, "mcp-config.json")) });
    }
  }
  // Project MCP configs (only if not home dir)
  if (resolve(cwd) !== resolve(HOME)) {
    for (const rel of [".copilot/mcp-config.json", ".mcp.json"]) {
      const mcp = await safeReadJson(join(cwd, rel));
      if (mcp?.mcpServers) {
        for (const [name] of Object.entries(mcp.mcpServers)) {
          if (!seen.has(name)) {
            seen.add(name);
            items.push({ name, scope: "project", source: "Project", desc: `From ${rel}` });
          }
        }
      }
    }
  }
  // Built-in (always present)
  items.push({ name: "github-mcp-server", scope: "system", source: "System — built-in", desc: "GitHub API: repos, issues, PRs, code search, Actions, commits, Copilot Spaces" });
  items.push({ name: "web_search", scope: "system", source: "System — built-in", desc: "AI-powered web search with citations" });
  items.push({ name: "web_fetch", scope: "system", source: "System — built-in", desc: "Fetch URLs as markdown or raw HTML" });
  return items;
}

async function discoverExtensions(cwd) {
  const items = [];
  // Global extensions
  const globalExtDir = join(COPILOT_DIR, "extensions");
  for (const d of await listDir(globalExtDir)) {
    if (await exists(join(globalExtDir, d, "extension.mjs"))) {
      items.push({ name: d, scope: "global", desc: "", path: redactPath(join(globalExtDir, d)) });
    }
  }
  // Project extensions
  const projExtDir = join(cwd, ".github", "extensions");
  for (const d of await listDir(projExtDir)) {
    if (await exists(join(projExtDir, d, "extension.mjs"))) {
      items.push({ name: d, scope: "project", desc: "", path: redactPath(join(projExtDir, d)) });
    }
  }
  return items;
}

async function discoverLsp(cwd) {
  const items = [];
  const globalLsp = await safeReadJson(join(COPILOT_DIR, "lsp-config.json"));
  if (globalLsp?.lspServers) {
    for (const [name, cfg] of Object.entries(globalLsp.lspServers)) {
      const langs = cfg.fileExtensions ? Object.values(cfg.fileExtensions) : [];
      items.push({ name, scope: "global", desc: `Languages: ${[...new Set(langs)].join(", ")}`, languages: [...new Set(langs)] });
    }
  }
  const projLsp = await safeReadJson(join(cwd, ".github", "lsp.json"));
  if (projLsp?.lspServers) {
    for (const [name, cfg] of Object.entries(projLsp.lspServers)) {
      const langs = cfg.fileExtensions ? Object.values(cfg.fileExtensions) : [];
      items.push({ name, scope: "project", desc: `Languages: ${[...new Set(langs)].join(", ")}`, languages: [...new Set(langs)] });
    }
  }
  return items;
}

async function discoverPlugins() {
  const plugins = [];
  const directDir = join(PLUGINS_DIR, "_direct");
  const dirs = [...(await listDir(PLUGINS_DIR)), ...(await listDir(directDir)).map(d => join("_direct", d))];

  for (const d of dirs) {
    if (d === "_direct") continue;
    const pluginDir = join(PLUGINS_DIR, d);
    if (!(await isDir(pluginDir))) continue;

    // Find plugin.json in various locations
    let manifest = null;
    for (const loc of ["plugin.json", ".claude-plugin/plugin.json", ".github/plugin/plugin.json"]) {
      manifest = await safeReadJson(join(pluginDir, loc));
      if (manifest) break;
    }
    if (!manifest) continue;

    // Count agents
    let agentCount = 0;
    const agentNames = [];
    const walkForAgents = async (dir) => {
      for (const f of await listDir(dir)) {
        const fp = join(dir, f);
        if (await isDir(fp)) await walkForAgents(fp);
        else if (f.endsWith(".agent.md")) { agentCount++; agentNames.push(f.replace(".agent.md", "")); }
      }
    };
    await walkForAgents(pluginDir);

    // Count skills
    let skillCount = 0;
    const skillNames = [];
    const walkForSkills = async (dir) => {
      for (const f of await listDir(dir)) {
        const fp = join(dir, f);
        if (await isDir(fp)) {
          if (await exists(join(fp, "SKILL.md"))) { skillCount++; skillNames.push(basename(fp)); }
          else await walkForSkills(fp);
        }
      }
    };
    await walkForSkills(pluginDir);

    // Count MCP servers from plugin
    let mcpCount = 0;
    const mcpNames = [];
    const walkForMcp = async (dir) => {
      for (const f of await listDir(dir)) {
        const fp = join(dir, f);
        if (await isDir(fp)) await walkForMcp(fp);
        else if (f === ".mcp.json") {
          const mcp = await safeReadJson(fp);
          if (mcp?.mcpServers) {
            for (const name of Object.keys(mcp.mcpServers)) { mcpCount++; mcpNames.push(name); }
          }
        }
      }
    };
    await walkForMcp(pluginDir);

    plugins.push({
      name: manifest.name || basename(d),
      desc: manifest.description || "",
      version: manifest.version || "",
      scope: "plugin",
      source: `Plugin: ${manifest.name || basename(d)}`,
      agents: agentCount,
      agentNames,
      skills: skillCount,
      skillNames,
      mcpServers: mcpCount,
      mcpNames,
      path: redactPath(pluginDir)
    });
  }
  return plugins;
}

async function discoverProjects(scanRoots) {
  const projects = [];
  for (const root of scanRoots) {
    if (!(await isDir(root))) continue;
    for (const d of await listDir(root)) {
      const projDir = join(root, d);
      if (!(await isDir(projDir))) continue;

      const hasInstructions = await exists(join(projDir, ".github", "copilot-instructions.md"));
      let agents = 0;
      for (const f of await listDir(join(projDir, ".copilot", "agents").catch?.(() => "") || "")) {
        if (f?.endsWith?.(".agent.md")) agents++;
      }
      // Simpler agent count
      const agentDir = join(projDir, ".copilot", "agents");
      agents = (await listDir(agentDir)).filter(f => f.endsWith(".agent.md")).length;

      let skills = 0;
      const skillDir = join(projDir, ".copilot", "skills");
      for (const s of await listDir(skillDir)) {
        if (await exists(join(skillDir, s, "SKILL.md"))) skills++;
      }

      const hasMcp = (await exists(join(projDir, ".copilot", "mcp-config.json"))) || (await exists(join(projDir, ".mcp.json")));
      const hasSquad = await isDir(join(projDir, ".squad"));

      // Check git remote
      let remoteUrl = null;
      try {
        const gitConfig = await safeReadText(join(projDir, ".git", "config"));
        const match = gitConfig?.match(/url\s*=\s*(.+)/);
        if (match) remoteUrl = match[1].trim().replace(/\.git$/, "").replace(/^git@github\.com:/, "https://github.com/");
      } catch {}

      if (hasInstructions || agents || skills || hasMcp || hasSquad) {
        projects.push({
          name: d,
          desc: "",
          hasInstructions,
          agents,
          skills,
          mcp: hasMcp ? 1 : 0,
          hasSquad,
          remoteUrl
        });
      }
    }
  }
  return projects;
}

// ============================================================
// Project status discovery (for Projects tab)
// ============================================================

// Parse .overviewignore (gitignore-style). Returns array of regex patterns.
async function loadOverviewIgnore(root) {
  const text = await safeReadText(join(root, ".overviewignore"));
  if (!text) return [];
  return text.split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"))
    .map(pattern => {
      // Convert simple glob to regex: * -> [^/]*, ? -> [^/]
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      const rx = escaped.replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
      return new RegExp(`^${rx}$`);
    });
}

function isIgnored(name, patterns) {
  return patterns.some(rx => rx.test(name));
}

async function runGit(cwd, args) {
  try {
    const { stdout } = await execFileP("git", args, { cwd, timeout: 5000, windowsHide: true });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getGitInfo(projDir) {
  const hasGit = await exists(join(projDir, ".git"));
  if (!hasGit) return { has_git: false };

  const [remote, branch, lastCommitIso, lastCommitSubject, uncommitted, commitCount30d] = await Promise.all([
    runGit(projDir, ["config", "--get", "remote.origin.url"]),
    runGit(projDir, ["rev-parse", "--abbrev-ref", "HEAD"]),
    runGit(projDir, ["log", "-1", "--format=%cI"]),
    runGit(projDir, ["log", "-1", "--format=%s"]),
    runGit(projDir, ["status", "--porcelain"]),
    runGit(projDir, ["rev-list", "--count", "--since=30.days", "HEAD"])
  ]);

  const remoteUrl = remote
    ? remote.replace(/\.git$/, "").replace(/^git@github\.com:/, "https://github.com/")
    : null;

  return {
    has_git: true,
    remote_url: remoteUrl,
    branch: branch || null,
    last_commit_at: lastCommitIso || null,
    last_commit_subject: lastCommitSubject || null,
    uncommitted_count: uncommitted ? uncommitted.split("\n").filter(Boolean).length : 0,
    commits_last_30d: commitCount30d ? parseInt(commitCount30d, 10) : 0
  };
}

// Collect first plan.md found under project/.copilot/session-state/*/plan.md
async function getProjectPlanMd(projDir) {
  const sessionStateDir = join(projDir, ".copilot", "session-state");
  if (!(await isDir(sessionStateDir))) return null;

  let newest = null;
  for (const sid of await listDir(sessionStateDir)) {
    const pmd = join(sessionStateDir, sid, "plan.md");
    try {
      const s = await stat(pmd);
      if (!newest || s.mtimeMs > newest.mtime) {
        newest = { path: pmd, mtime: s.mtimeMs };
      }
    } catch {}
  }
  if (!newest) return null;

  const text = await safeReadText(newest.path);
  if (!text) return null;
  return {
    path: redactPath(newest.path),
    updated_at: new Date(newest.mtime).toISOString(),
    content: text.length > 4000 ? text.slice(0, 4000) + "\n...[truncated]" : text
  };
}

// Find the most recent file mtime anywhere in project (skipping node_modules, .git)
async function getLastFileActivity(projDir) {
  const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "_output", "__pycache__"]);
  let newest = 0;

  async function walk(dir, depth) {
    if (depth > 4) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (SKIP.has(ent.name) || ent.name.startsWith(".")) continue;
      const fp = join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(fp, depth + 1);
      } else {
        try {
          const s = await stat(fp);
          if (s.mtimeMs > newest) newest = s.mtimeMs;
        } catch {}
      }
    }
  }
  await walk(projDir, 0);
  return newest ? new Date(newest).toISOString() : null;
}

async function discoverProjectStatus(scanRoots) {
  const results = [];

  for (const root of scanRoots) {
    if (!(await isDir(root))) continue;
    const ignorePatterns = await loadOverviewIgnore(root);

    for (const d of await listDir(root)) {
      if (d.startsWith(".") || d.startsWith("_")) continue;
      if (isIgnored(d, ignorePatterns)) continue;

      const projDir = join(root, d);
      if (!(await isDir(projDir))) continue;

      const [gitInfo, planMd, lastFileAt] = await Promise.all([
        getGitInfo(projDir),
        getProjectPlanMd(projDir),
        getLastFileActivity(projDir)
      ]);

      // Lightweight content hash for cache staleness detection
      const hashInput = JSON.stringify({
        git: gitInfo,
        plan_updated: planMd?.updated_at,
        last_file: lastFileAt
      });
      const rawHash = createHash("sha1").update(hashInput).digest("hex").slice(0, 16);

      results.push({
        name: d,
        path: redactPath(projDir),
        abs_path: projDir,
        scan_root: redactPath(root),
        ...gitInfo,
        plan_md: planMd,
        last_file_activity_at: lastFileAt,
        raw_hash: rawHash
      });
    }
  }

  // Sort by activity (last commit or file mtime), newest first
  results.sort((a, b) => {
    const at = a.last_commit_at || a.last_file_activity_at || "";
    const bt = b.last_commit_at || b.last_file_activity_at || "";
    return bt.localeCompare(at);
  });

  return results;
}

// ============================================================
// MAIN: Register the discovery tool
// ============================================================

const session = await joinSession({
  tools: [
    {
      name: "discover_copilot_environment",
      description: "Programmatically discover everything in the user's Copilot CLI environment: instructions, agents, skills, MCP servers, extensions, LSP servers, plugins, and projects. Returns structured JSON ready for the copilot-overview template. Pass optional scan_roots (comma-separated paths) to discover projects.",
      parameters: {
        type: "object",
        properties: {
          scan_roots: {
            type: "string",
            description: "Comma-separated absolute paths to scan for project repos (e.g. ~/projects). Leave empty to skip project discovery."
          }
        }
      },
      handler: async (args) => {
        const cwd = process.cwd();
        const scanRoots = args.scan_roots
          ? args.scan_roots.split(",").map(p => resolve(p.trim().replace(/^~/, HOME)))
          : [];

        const [instructions, agents, skills, mcpServers, extensions, lspServers, plugins, projects] = await Promise.all([
          discoverInstructions(cwd),
          discoverAgents(cwd),
          discoverSkills(cwd),
          discoverMcpServers(cwd),
          discoverExtensions(cwd),
          discoverLsp(cwd),
          discoverPlugins(),
          discoverProjects(scanRoots)
        ]);

        // Merge plugin-contributed agents/skills/MCP into the main lists
        for (const plugin of plugins) {
          for (const aName of plugin.agentNames) {
            if (!agents.find(a => a.name === aName)) {
              agents.push({ name: aName, scope: "plugin", source: `Plugin: ${plugin.name}`, desc: "" });
            }
          }
          for (const sName of plugin.skillNames) {
            if (!skills.find(s => s.name === sName)) {
              skills.push({ name: sName, scope: "plugin", source: `Plugin: ${plugin.name}`, desc: "" });
            }
          }
          for (const mName of plugin.mcpNames) {
            if (!mcpServers.find(m => m.name === mName)) {
              mcpServers.push({ name: mName, scope: "plugin", source: `Plugin: ${plugin.name}`, desc: `From ${plugin.name} plugin` });
            }
          }
        }

        const envData = {
          meta: {
            generatedAt: new Date().toISOString(),
            cliVersion: null,
            experimentalMode: false,
            currentModel: null,
            platform: platform() === "win32" ? "Windows" : platform() === "darwin" ? "macOS" : "Linux"
          },
          instructions,
          agents,
          skills,
          mcpServers,
          extensions,
          lspServers,
          plugins: plugins.map(p => ({ name: p.name, desc: p.desc, version: p.version, scope: "plugin", source: `Plugin: ${p.name}`, agents: p.agents, skills: p.skills, mcpServers: p.mcpServers })),
          projects
        };

        return JSON.stringify(envData, null, 2);
      }
    },
    {
      name: "discover_project_status",
      description: "Discover per-project raw status data for the Projects view: git info (remote, branch, last commit, uncommitted changes), latest plan.md contents, and last file activity. Respects .overviewignore at each scan_root. Returns an array of project records. The model is expected to query session_store via the sql tool for checkpoint/turn data and synthesize TLDR + status on top of this raw data.",
      parameters: {
        type: "object",
        properties: {
          scan_roots: {
            type: "string",
            description: "Comma-separated absolute paths to scan for projects (e.g. ~/projects,~/work). Required."
          }
        },
        required: ["scan_roots"]
      },
      handler: async (args) => {
        if (!args.scan_roots) {
          return JSON.stringify({ error: "scan_roots parameter is required" });
        }
        const scanRoots = args.scan_roots
          .split(",")
          .map(p => resolve(p.trim().replace(/^~/, HOME)));

        const projects = await discoverProjectStatus(scanRoots);
        return JSON.stringify({
          generated_at: new Date().toISOString(),
          scan_roots: scanRoots.map(redactPath),
          project_count: projects.length,
          projects
        }, null, 2);
      }
    }
  ],
  hooks: {}
});
