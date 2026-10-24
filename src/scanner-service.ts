import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { buildGraphDetailed, type ScanOptions } from "./core.js";
import { persistGraph } from "./store.js";
import type { EvidenceGraph } from "./model.js";
import { collectFiles, findCommonRoot, relativePath } from "./files.js";

export interface FolderInfo {
  directory: string;
  name: string;
  languages: { name: string; fileCount: number; percentage: number }[];
  frameworks: string[];
  packageManagers: string[];
  totalFiles: number;
  hasGit: boolean;
  gitBranch?: string;
  gitRevision?: string;
  workingTree?: "clean" | "dirty" | "unknown";
}

export interface ProjectDetection {
  directory: string;
  directories?: string[];
  folders?: FolderInfo[];
  projectName: string;
  languages: { name: string; fileCount: number; percentage: number }[];
  frameworks: string[];
  packageManagers: string[];
  structure: {
    totalFiles: number;
    directories: string[];
    hasGit: boolean;
    gitBranch?: string;
    gitRevision?: string;
    workingTree?: "clean" | "dirty" | "unknown";
  };
  contracts: {
    hasOpenApi: boolean;
    openApiFiles: string[];
    hasTraces: boolean;
    tracesFiles: string[];
  };
}

export interface ScanPlan {
  directory: string;
  directories?: string[];
  folders?: { path: string; name: string; fileCount: number }[];
  filesToScan: string[];
  totalFiles: number;
  activeAnalyzers: { name: string; description: string; filePattern: string; enabled: boolean }[];
  ignoredDirectories: string[];
  estimatedStages: string[];
  warnings: string[];
}

export interface ScanJob {
  id: string;
  directory: string;
  directories?: string[];
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  currentStage: string;
  stages: { name: string; status: "pending" | "in_progress" | "done" | "skipped"; detail?: string }[];
  logs: string[];
  warnings: string[];
  error?: string;
  startedAt: string;
  completedAt?: string;
  result?: {
    nodesCount: number;
    edgesCount: number;
    jsonPath: string;
    sqlitePath: string;
    graph?: EvidenceGraph;
  };
}

export class ScannerService {
  private jobs = new Map<string, ScanJob>();
  private activeGraph?: EvidenceGraph;
  private activeDirectories: string[] = [];

  constructor(defaultDirectories?: string | string[]) {
    if (defaultDirectories) {
      const dirs = Array.isArray(defaultDirectories) ? defaultDirectories : [defaultDirectories];
      this.activeDirectories = dirs.map((d) => resolve(d));
    } else {
      this.activeDirectories = [process.cwd()];
    }
  }

  getActiveDirectories(): string[] {
    return this.activeDirectories.length > 0 ? this.activeDirectories : [process.cwd()];
  }

  getActiveDirectory(): string {
    return this.activeDirectories[0] || process.cwd();
  }

  setActiveDirectories(dirs: string[]): void {
    this.activeDirectories = dirs.map((d) => resolve(d));
  }

  setActiveDirectory(dir: string): void {
    this.activeDirectories = [resolve(dir)];
  }

  getActiveGraph(): EvidenceGraph | undefined {
    return this.activeGraph;
  }

  setActiveGraph(graph: EvidenceGraph): void {
    this.activeGraph = graph;
    this.activeDirectories = [graph.repository];
  }

  /**
   * Inspects a single directory for languages, frameworks, packages, git status.
   */
  async detectSingleFolder(dirPath: string): Promise<FolderInfo & { openApiFiles: string[]; tracesFiles: string[] }> {
    const dir = resolve(dirPath);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new Error(`Target path is not a valid directory: ${dir}`);
    }

    let folderName = basename(dir);
    const pkgPath = join(dir, "package.json");
    let pkgJson: Record<string, unknown> | undefined;
    if (existsSync(pkgPath)) {
      try {
        pkgJson = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (typeof pkgJson?.name === "string") folderName = pkgJson.name;
      } catch { /* ignore */ }
    }

    const packageManagers: string[] = [];
    if (existsSync(join(dir, "package-lock.json"))) packageManagers.push("npm");
    if (existsSync(join(dir, "yarn.lock"))) packageManagers.push("yarn");
    if (existsSync(join(dir, "pnpm-lock.yaml"))) packageManagers.push("pnpm");
    if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) packageManagers.push("bun");
    if (existsSync(join(dir, "poetry.lock"))) packageManagers.push("poetry");
    if (existsSync(join(dir, "requirements.txt")) || existsSync(join(dir, "Pipfile"))) packageManagers.push("pip");

    const allFiles = await collectFiles(dir);
    const langCounts = new Map<string, number>();

    for (const f of allFiles) {
      const ext = f.split(".").pop()?.toLowerCase();
      if (!ext) continue;
      let lang = "Other";
      if (ext === "ts" || ext === "tsx") lang = "TypeScript";
      else if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") lang = "JavaScript";
      else if (ext === "py") lang = "Python";
      else if (ext === "sql") lang = "SQL";
      else if (ext === "prisma") lang = "Prisma Schema";
      else if (ext === "json") lang = "JSON";
      else if (ext === "yaml" || ext === "yml") lang = "YAML";
      else if (ext === "html") lang = "HTML";
      else if (ext === "css" || ext === "scss") lang = "CSS";
      langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
    }

    const totalCount = allFiles.length || 1;
    const languages = [...langCounts.entries()]
      .map(([name, count]) => ({
        name,
        fileCount: count,
        percentage: Math.round((count / totalCount) * 100),
      }))
      .sort((a, b) => b.fileCount - a.fileCount);

    const frameworks = new Set<string>();
    const deps = {
      ...((pkgJson?.dependencies as Record<string, string>) || {}),
      ...((pkgJson?.devDependencies as Record<string, string>) || {}),
    };

    if (deps["react"] || allFiles.some((f) => f.endsWith(".tsx") || f.endsWith(".jsx"))) frameworks.add("React");
    if (deps["next"] || existsSync(join(dir, "next.config.js")) || existsSync(join(dir, "next.config.mjs")) || existsSync(join(dir, "next.config.ts"))) frameworks.add("Next.js");
    if (deps["express"]) frameworks.add("Express");
    if (deps["@nestjs/core"]) frameworks.add("NestJS");
    if (deps["@prisma/client"] || allFiles.some((f) => f.endsWith(".prisma"))) frameworks.add("Prisma");
    if (deps["axios"]) frameworks.add("Axios");
    if (deps["knex"]) frameworks.add("Knex");
    if (deps["sequelize"]) frameworks.add("Sequelize");

    for (const f of allFiles.filter((file) => file.endsWith(".py"))) {
      try {
        const content = readFileSync(f, "utf8");
        if (content.includes("FastAPI") || content.includes("fastapi")) frameworks.add("FastAPI");
        if (content.includes("Flask") || content.includes("flask")) frameworks.add("Flask");
      } catch { /* ignore */ }
    }

    let hasGit = false;
    let gitBranch: string | undefined;
    let gitRevision: string | undefined;
    let workingTree: "clean" | "dirty" | "unknown" = "unknown";

    if (existsSync(join(dir, ".git"))) {
      hasGit = true;
      try {
        gitRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8", timeout: 2000, stdio: ["pipe", "pipe", "ignore"] }).trim();
      } catch { /* ignore */ }
      try {
        gitBranch = execFileSync("git", ["branch", "--show-current"], { cwd: dir, encoding: "utf8", timeout: 2000, stdio: ["pipe", "pipe", "ignore"] }).trim();
      } catch { /* ignore */ }
      try {
        const status = execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8", timeout: 2000, stdio: ["pipe", "pipe", "ignore"] });
        workingTree = status.trim() ? "dirty" : "clean";
      } catch { /* ignore */ }
    }

    const openApiFiles: string[] = [];
    const tracesFiles: string[] = [];
    function findContracts(currentDir: string, depth = 0) {
      if (depth > 4) return;
      try {
        const dirEntries = readdirSync(currentDir, { withFileTypes: true });
        for (const e of dirEntries) {
          if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist") {
            findContracts(join(currentDir, e.name), depth + 1);
          } else if (e.isFile()) {
            if (/openapi\.(json|ya?ml)$/i.test(e.name)) {
              openApiFiles.push(join(currentDir, e.name));
            } else if (/traces?\.json$/i.test(e.name)) {
              tracesFiles.push(join(currentDir, e.name));
            }
          }
        }
      } catch { /* ignore */ }
    }
    findContracts(dir);

    return {
      directory: dir,
      name: folderName,
      languages,
      frameworks: [...frameworks],
      packageManagers,
      totalFiles: allFiles.length,
      hasGit,
      gitBranch,
      gitRevision,
      workingTree,
      openApiFiles,
      tracesFiles,
    };
  }

  /**
   * Step 1: Detect project languages, frameworks, package managers, and structure.
   * Supports a single directory or multiple disparate folder paths!
   */
  async detectProject(targetDirs?: string | string[]): Promise<ProjectDetection> {
    const rawTargets = targetDirs
      ? (Array.isArray(targetDirs) ? targetDirs : [targetDirs])
      : this.getActiveDirectories();
    const targets = rawTargets.map((d) => resolve(d));

    const folders: FolderInfo[] = [];
    const combinedFrameworks = new Set<string>();
    const combinedPackageManagers = new Set<string>();
    const combinedLangCounts = new Map<string, number>();
    const allOpenApiFiles: string[] = [];
    const allTracesFiles: string[] = [];
    let combinedTotalFiles = 0;

    for (const t of targets) {
      const folderRes = await this.detectSingleFolder(t);
      folders.push({
        directory: folderRes.directory,
        name: folderRes.name,
        languages: folderRes.languages,
        frameworks: folderRes.frameworks,
        packageManagers: folderRes.packageManagers,
        totalFiles: folderRes.totalFiles,
        hasGit: folderRes.hasGit,
        gitBranch: folderRes.gitBranch,
        gitRevision: folderRes.gitRevision,
        workingTree: folderRes.workingTree,
      });

      folderRes.frameworks.forEach((f) => combinedFrameworks.add(f));
      folderRes.packageManagers.forEach((pm) => combinedPackageManagers.add(pm));
      folderRes.languages.forEach((l) => {
        combinedLangCounts.set(l.name, (combinedLangCounts.get(l.name) ?? 0) + l.fileCount);
      });
      combinedTotalFiles += folderRes.totalFiles;
      allOpenApiFiles.push(...folderRes.openApiFiles);
      allTracesFiles.push(...folderRes.tracesFiles);
    }

    const totalCount = combinedTotalFiles || 1;
    const combinedLanguages = [...combinedLangCounts.entries()]
      .map(([name, count]) => ({
        name,
        fileCount: count,
        percentage: Math.round((count / totalCount) * 100),
      }))
      .sort((a, b) => b.fileCount - a.fileCount);

    const primaryDir = targets.length === 1 ? targets[0] : findCommonRoot(targets);
    const projectName = folders.length === 1 ? folders[0].name : `${folders[0]?.name || "multi"}-workspace (${folders.length} folders)`;

    return {
      directory: primaryDir,
      directories: targets,
      folders,
      projectName,
      languages: combinedLanguages,
      frameworks: [...combinedFrameworks],
      packageManagers: [...combinedPackageManagers],
      structure: {
        totalFiles: combinedTotalFiles,
        directories: folders.map((f) => f.name),
        hasGit: folders.some((f) => f.hasGit),
        gitBranch: folders.find((f) => f.gitBranch)?.gitBranch,
        gitRevision: folders.find((f) => f.gitRevision)?.gitRevision,
        workingTree: folders.some((f) => f.workingTree === "dirty") ? "dirty" : "clean",
      },
      contracts: {
        hasOpenApi: allOpenApiFiles.length > 0,
        openApiFiles: allOpenApiFiles.map((f) => relativePath(primaryDir, f)),
        hasTraces: allTracesFiles.length > 0,
        tracesFiles: allTracesFiles.map((f) => relativePath(primaryDir, f)),
      },
    };
  }

  /**
   * Step 2: Review scan plan preview before starting analysis.
   * Previews files and active analyzers across single or multiple project directories.
   */
  async previewScanPlan(targetDirs?: string | string[], options: ScanOptions = {}): Promise<ScanPlan> {
    const rawTargets = targetDirs
      ? (Array.isArray(targetDirs) ? targetDirs : [targetDirs])
      : this.getActiveDirectories();
    const targets = rawTargets.map((d) => resolve(d));
    const commonRoot = options.root ? resolve(options.root) : (targets.length === 1 ? targets[0] : findCommonRoot(targets));

    const files: string[] = [];
    const folderSummaries: { path: string; name: string; fileCount: number }[] = [];

    for (const t of targets) {
      const folderFiles = await collectFiles(t, { include: options.include, exclude: options.exclude, root: commonRoot });
      files.push(...folderFiles);
      folderSummaries.push({
        path: t,
        name: basename(t),
        fileCount: folderFiles.length,
      });
    }

    const warnings: string[] = [];
    const hasTs = files.some((f) => /\.[cm]?[jt]sx?$/i.test(f));
    const hasPy = files.some((f) => f.endsWith(".py"));
    const hasSchema = files.some((f) => /\.(prisma|sql)$/i.test(f));

    if (!hasTs && !hasPy) {
      warnings.push("No TypeScript, JavaScript, or Python files found across the target folders.");
    }

    const activeAnalyzers = [
      {
        name: "TypeScript / JavaScript Compiler Analyzer",
        description: "Extracts AST symbols, function calls, imports, and source locations",
        filePattern: "*.{ts,tsx,js,jsx,mjs,cjs}",
        enabled: hasTs,
      },
      {
        name: "React & Next.js AST Analyzer",
        description: "Extracts JSX hierarchy, context providers, custom hooks, and page/app routes",
        filePattern: "*.{tsx,jsx,ts,js}",
        enabled: hasTs,
      },
      {
        name: "Express & API Route Adapter",
        description: "Extracts Express routes, router mounts, middleware, and request clients",
        filePattern: "*.{ts,js}",
        enabled: hasTs,
      },
      {
        name: "Python & FastAPI Analyzer",
        description: "Extracts FastAPI route declarations, endpoints, and Python database executions",
        filePattern: "*.py",
        enabled: hasPy,
      },
      {
        name: "Database & Schema Analyzer",
        description: "Extracts SQL tables, Prisma models, database client queries, and migration entities",
        filePattern: "*.{sql,prisma}",
        enabled: hasSchema || hasTs || hasPy,
      },
      {
        name: "OpenAPI Contract Importer",
        description: "Validates API routes and extracts response schemas as fields",
        filePattern: "openapi.{json,yaml}",
        enabled: !!options.openapiPath || files.some((f) => /openapi\.(json|ya?ml)$/i.test(f)),
      },
      {
        name: "OpenTelemetry Runtime Trace Importer",
        description: "Imports observed HTTP and DB spans to ground execution evidence",
        filePattern: "traces.json",
        enabled: !!options.tracesPath || files.some((f) => /traces?\.json$/i.test(f)),
      },
    ];

    const ignoredDirectories = [
      ".git",
      "node_modules",
      "dist",
      "build",
      ".next",
      "__pycache__",
      ".venv",
      "venv",
      ".repopath",
    ];

    const estimatedStages = [
      "1. Repository Discovery & File Collection",
      "2. Symbol & Function Call Resolution",
      "3. React Component, Provider & Hook Mapping",
      "4. Client Request to Backend Route Matching",
      "5. Database Operations, Queries & Schema Entities",
      "6. Graph Validation, Coverage & SQLite Indexing",
    ];

    return {
      directory: commonRoot,
      directories: targets,
      folders: folderSummaries,
      filesToScan: files.map((f) => relativePath(commonRoot, f)),
      totalFiles: files.length,
      activeAnalyzers,
      ignoredDirectories,
      estimatedStages,
      warnings,
    };
  }

  /**
   * Step 3: Run scan job in background with live progress tracking across one or more folders.
   */
  startScanJob(targetDirs?: string | string[], options: ScanOptions = {}): ScanJob {
    const rawTargets = targetDirs
      ? (Array.isArray(targetDirs) ? targetDirs : [targetDirs])
      : this.getActiveDirectories();
    const targets = rawTargets.map((d) => resolve(d));
    const commonRoot = options.root ? resolve(options.root) : (targets.length === 1 ? targets[0] : findCommonRoot(targets));

    const id = `scan-${randomUUID().slice(0, 8)}`;
    const startedAt = new Date().toISOString();

    const stages: ScanJob["stages"] = [
      { name: "Discovery", status: "pending", detail: `Collecting files from ${targets.length} folder(s)` },
      { name: "Symbol Resolution", status: "pending", detail: "Parsing AST symbols and imports" },
      { name: "React Analysis", status: "pending", detail: "Mapping JSX, providers, and hooks" },
      { name: "API Matching", status: "pending", detail: "Connecting client requests to backend routes" },
      { name: "Database & Schema", status: "pending", detail: "Resolving queries and schema entities" },
      { name: "Validation & Indexing", status: "pending", detail: "Validating graph and saving SQLite index" },
    ];

    const job: ScanJob = {
      id,
      directory: commonRoot,
      directories: targets,
      status: "running",
      progress: 5,
      currentStage: "Discovery",
      stages,
      logs: [`[${new Date().toLocaleTimeString()}] Starting RepoPath scan for ${targets.length} folder(s): ${targets.map((t) => basename(t)).join(", ")}`],
      warnings: [],
      startedAt,
    };

    this.jobs.set(id, job);

    this.executeScanJob(job, targets, commonRoot, options).catch((err: unknown) => {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      job.completedAt = new Date().toISOString();
      job.logs.push(`[${new Date().toLocaleTimeString()}] ERROR: ${job.error}`);
    });

    return job;
  }

  private async executeScanJob(job: ScanJob, targets: string[], commonRoot: string, options: ScanOptions): Promise<void> {
    const updateStage = (stageIdx: number, progress: number, logMsg: string) => {
      for (let i = 0; i < stageIdx; i++) {
        job.stages[i].status = "done";
      }
      job.stages[stageIdx].status = "in_progress";
      job.currentStage = job.stages[stageIdx].name;
      job.progress = progress;
      job.logs.push(`[${new Date().toLocaleTimeString()}] ${logMsg}`);
    };

    try {
      updateStage(0, 15, `Discovering files across ${targets.length} project folder(s)...`);
      await new Promise((r) => setTimeout(r, 40));

      updateStage(1, 35, "Resolving symbols, classes, functions, and cross-folder imports...");
      await new Promise((r) => setTimeout(r, 40));

      updateStage(2, 55, "Analyzing React hierarchy, Context providers, hooks, and client requests...");
      await new Promise((r) => setTimeout(r, 40));

      updateStage(3, 70, "Matching client request endpoints to Express / FastAPI / Next.js routes...");
      await new Promise((r) => setTimeout(r, 40));

      updateStage(4, 85, "Resolving database operations, SQL queries, and schema tables...");
      await new Promise((r) => setTimeout(r, 40));

      // Perform multi-target analysis
      const scanResult = await buildGraphDetailed(targets, { ...options, root: commonRoot });
      const graph = scanResult.graph;
      job.warnings.push(...scanResult.warnings);

      // Stage 5: Validation & Indexing
      updateStage(5, 95, "Validating graph contract integrity and persisting SQLite index...");
      const outDir = join(commonRoot, ".repopath");
      const paths = await persistGraph(graph, outDir);

      for (let i = 0; i < job.stages.length; i++) {
        job.stages[i].status = "done";
      }

      job.progress = 100;
      job.status = "completed";
      job.currentStage = "Complete";
      job.completedAt = new Date().toISOString();
      job.logs.push(`[${new Date().toLocaleTimeString()}] Scan complete: ${graph.nodes.length} nodes, ${graph.edges.length} edges across ${targets.length} folder(s)`);
      job.logs.push(`[${new Date().toLocaleTimeString()}] Saved unified index to ${paths.sqlitePath}`);

      job.result = {
        nodesCount: graph.nodes.length,
        edgesCount: graph.edges.length,
        jsonPath: paths.jsonPath,
        sqlitePath: paths.sqlitePath,
        graph,
      };

      this.activeGraph = graph;
      this.activeDirectories = targets;
    } catch (err: unknown) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      job.completedAt = new Date().toISOString();
      job.logs.push(`[${new Date().toLocaleTimeString()}] Scan failed: ${job.error}`);
      throw err;
    }
  }

  getJob(id: string): ScanJob | undefined {
    return this.jobs.get(id);
  }

  listJobs(): ScanJob[] {
    return [...this.jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
}
