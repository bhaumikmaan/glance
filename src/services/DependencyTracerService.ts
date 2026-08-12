import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";

const exec = promisify(execCallback);

export type DependencyTraceResult = {
  tool: "gradle" | "maven" | "manifest";
  success: boolean;
  summary: string;
  output: string;
};

export class DependencyTracerService {
  async trace(dependencyCoordinate: string): Promise<DependencyTraceResult> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return {
        tool: "manifest",
        success: false,
        summary: "No workspace folder is open.",
        output: ""
      };
    }

    const cwd = workspaceFolder.uri.fsPath;
    const packageOnly = dependencyCoordinate.split(":").slice(0, 2).join(":");

    const gradleCommands = [
      `./gradlew dependencyInsight --dependency "${packageOnly}"`,
      `gradlew dependencyInsight --dependency "${packageOnly}"`,
      `gradle dependencyInsight --dependency "${packageOnly}"`
    ];
    for (const gradleCommand of gradleCommands) {
      const gradleResult = await this.runCommand(gradleCommand, cwd, "gradle");
      if (gradleResult.success) {
        return gradleResult;
      }
    }

    const mavenCommand = `mvn dependency:tree -Dincludes="${packageOnly}"`;
    const mavenResult = await this.runCommand(mavenCommand, cwd, "maven");
    if (mavenResult.success) {
      return mavenResult;
    }

    const manifestFallback = await this.fallbackParseManifests(packageOnly);
    return manifestFallback;
  }

  private async runCommand(
    command: string,
    cwd: string,
    tool: "gradle" | "maven"
  ): Promise<DependencyTraceResult> {
    try {
      const { stdout, stderr } = await exec(command, {
        cwd,
        timeout: 120_000,
        maxBuffer: 1024 * 1024 * 4
      });
      const output = `${stdout}\n${stderr}`.trim();
      if (!output) {
        return {
          tool,
          success: false,
          summary: `${tool} ran but returned no output.`,
          output
        };
      }
      return {
        tool,
        success: true,
        summary: `${tool} dependency trace completed.`,
        output
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        tool,
        success: false,
        summary: `${tool} execution failed.`,
        output: message
      };
    }
  }

  private async fallbackParseManifests(
    packageOnly: string
  ): Promise<DependencyTraceResult> {
    const files = await vscode.workspace.findFiles(
      "{**/build.gradle,**/build.gradle.kts,**/pom.xml}",
      "**/node_modules/**",
      30
    );
    const matches: string[] = [];
    for (const file of files) {
      try {
        const bytes = await vscode.workspace.fs.readFile(file);
        const content = Buffer.from(bytes).toString("utf8");
        if (content.includes(packageOnly)) {
          matches.push(file.fsPath);
        }
      } catch {
        // ignore unreadable file
      }
    }

    if (matches.length === 0) {
      return {
        tool: "manifest",
        success: false,
        summary: "Dependency not found in local Gradle/Maven manifests.",
        output: ""
      };
    }

    return {
      tool: "manifest",
      success: true,
      summary: `Found dependency reference in ${matches.length} manifest file(s).`,
      output: matches.join("\n")
    };
  }
}
