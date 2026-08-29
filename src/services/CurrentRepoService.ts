import * as path from "path";
import * as vscode from "vscode";
import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execCallback);

type CurrentRepoSnapshot = {
  workspaceName?: string;
  workspacePath?: string;
  effectiveDefaultBranch?: string;
  activeBranch?: string;
  activeBranchAgeDays?: number;
  branchAgeWarning: boolean;
  codeownersPath?: string;
  activeFile?: string;
  activeFileOwners: string[];
  coreBranches: Array<{
    name: string;
    exists: boolean;
    status: "success" | "failure" | "pending" | "unknown";
  }>;
  recentBranches: Array<{
    name: string;
    lastCommitAt: string;
    ageDays: number;
  }>;
};

export class CurrentRepoService {
  async buildSnapshot(
    branchAgeWarningDays: number,
    defaultBranch: string
  ): Promise<CurrentRepoSnapshot> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return {
        branchAgeWarning: false,
        activeFileOwners: [],
        coreBranches: [],
        recentBranches: []
      };
    }

    const rootPath = workspaceFolder.uri.fsPath;
    const activeBranch = await this.safeGit("git rev-parse --abbrev-ref HEAD", rootPath);
    const effectiveDefaultBranch = await this.resolveBaseBranch(rootPath, defaultBranch);
    const branchAgeDays = await this.getBranchAgeDays(rootPath, activeBranch);
    const coreBranches = await this.getCoreBranches(
      rootPath,
      effectiveDefaultBranch ?? defaultBranch
    );
    const recentBranches = await this.getRecentBranches(rootPath);
    const codeowners = await this.getCodeownersInfo(workspaceFolder.uri);

    return {
      workspaceName: workspaceFolder.name,
      workspacePath: rootPath,
      effectiveDefaultBranch: effectiveDefaultBranch ?? undefined,
      activeBranch: activeBranch ?? undefined,
      activeBranchAgeDays: branchAgeDays ?? undefined,
      branchAgeWarning: (branchAgeDays ?? 0) > branchAgeWarningDays,
      codeownersPath: codeowners.codeownersPath,
      activeFile: codeowners.activeFile,
      activeFileOwners: codeowners.owners,
      coreBranches,
      recentBranches
    };
  }

  private async getCoreBranches(
    workspacePath: string,
    defaultBranch: string
  ): Promise<CurrentRepoSnapshot["coreBranches"]> {
    const names = Array.from(new Set([defaultBranch, "main", "master", "develop"]));
    const results: CurrentRepoSnapshot["coreBranches"] = [];
    for (const name of names) {
      const exists = await this.branchExists(workspacePath, name);
      if (!exists) {
        continue;
      }
      results.push({
        name,
        exists,
        status: "unknown"
      });
    }
    return results;
  }

  private async branchExists(workspacePath: string, branch: string): Promise<boolean> {
    try {
      await exec(`git show-ref --verify --quiet refs/heads/${branch}`, {
        cwd: workspacePath
      });
      return true;
    } catch {
      return false;
    }
  }

  private async getBranchAgeDays(
    workspacePath: string,
    branchName: string | null
  ): Promise<number | null> {
    if (!branchName) {
      return null;
    }
    const latestCommitTs = await this.safeGit(
      `git log -1 --format=%ct ${branchName}`,
      workspacePath
    );
    if (!latestCommitTs) {
      return null;
    }
    const lastTs = Number(latestCommitTs.split(/\r?\n/)[0]) * 1000;
    if (Number.isNaN(lastTs)) {
      return null;
    }
    return Math.max(0, Math.floor((Date.now() - lastTs) / 86_400_000));
  }

  private async resolveBaseBranch(
    workspacePath: string,
    configuredDefault: string
  ): Promise<string | null> {
    if (await this.branchExists(workspacePath, configuredDefault)) {
      return configuredDefault;
    }
    const originHead = await this.safeGit(
      "git symbolic-ref --short refs/remotes/origin/HEAD",
      workspacePath
    );
    const fromOriginHead = originHead?.replace("origin/", "");
    if (fromOriginHead && (await this.branchExists(workspacePath, fromOriginHead))) {
      return fromOriginHead;
    }
    if (await this.branchExists(workspacePath, "develop")) return "develop";
    if (await this.branchExists(workspacePath, "main")) return "main";
    if (await this.branchExists(workspacePath, "master")) return "master";
    return null;
  }

  private async getRecentBranches(
    workspacePath: string
  ): Promise<CurrentRepoSnapshot["recentBranches"]> {
    const output = await this.safeGit(
      'git for-each-ref refs/heads --format="%(refname:short)|%(committerdate:iso8601)"',
      workspacePath
    );
    if (!output) {
      return [];
    }

    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [name, ts] = line.split("|");
        const date = new Date(ts);
        const ageDays = Number.isNaN(date.getTime())
          ? 9999
          : Math.floor((Date.now() - date.getTime()) / 86_400_000);
        return {
          name,
          lastCommitAt: Number.isNaN(date.getTime())
            ? new Date().toISOString()
            : date.toISOString(),
          ageDays
        };
      })
      .filter((branch) => branch.ageDays <= 30)
      .sort((a, b) => a.ageDays - b.ageDays)
      .slice(0, 30);
  }

  private async getCodeownersInfo(workspaceUri: vscode.Uri): Promise<{
    codeownersPath?: string;
    activeFile?: string;
    owners: string[];
  }> {
    const activeFileUri = vscode.window.activeTextEditor?.document.uri;
    const activeFilePath = activeFileUri?.fsPath;
    const candidates = [
      vscode.Uri.joinPath(workspaceUri, ".github", "CODEOWNERS"),
      vscode.Uri.joinPath(workspaceUri, "docs", "CODEOWNERS"),
      vscode.Uri.joinPath(workspaceUri, "CODEOWNERS")
    ];

    let content: string | undefined;
    let selectedPath: string | undefined;
    for (const candidate of candidates) {
      try {
        const bytes = await vscode.workspace.fs.readFile(candidate);
        content = Buffer.from(bytes).toString("utf8");
        selectedPath = candidate.fsPath;
        break;
      } catch {
        // continue
      }
    }

    if (!content || !activeFilePath) {
      return { codeownersPath: selectedPath, activeFile: activeFilePath, owners: [] };
    }

    const workspacePath = workspaceUri.fsPath;
    const relative = toPosix(path.relative(workspacePath, activeFilePath));
    const owners = resolveOwners(content, relative);
    return {
      codeownersPath: selectedPath,
      activeFile: activeFilePath,
      owners
    };
  }

  private async safeGit(command: string, cwd: string): Promise<string | null> {
    try {
      const { stdout } = await exec(command, { cwd });
      return stdout.trim();
    } catch {
      return null;
    }
  }
}

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

function resolveOwners(codeownersContent: string, relativePath: string): string[] {
  const rules = codeownersContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        pattern: parts[0],
        owners: parts.slice(1)
      };
    });

  let matchedOwners: string[] = [];
  for (const rule of rules) {
    if (matchesPattern(rule.pattern, relativePath)) {
      matchedOwners = rule.owners;
    }
  }
  return matchedOwners;
}

function matchesPattern(pattern: string, relativePath: string): boolean {
  const normalizedPattern = pattern.replace(/^\//, "");
  if (normalizedPattern === "*") {
    return true;
  }
  if (!normalizedPattern.includes("*")) {
    return relativePath === normalizedPattern || relativePath.startsWith(`${normalizedPattern}/`);
  }

  const regex = new RegExp(
    `^${normalizedPattern
      .replaceAll(".", "\\.")
      .replaceAll("**", "___DOUBLE___")
      .replaceAll("*", "[^/]*")
      .replaceAll("___DOUBLE___", ".*")}$`
  );
  return regex.test(relativePath);
}
