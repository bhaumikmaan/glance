import * as vscode from "vscode";

export class ConfigService {
  private static readonly section = "devCommandCenter";

  get pollingIntervalSeconds(): number {
    return this.getConfiguration().get<number>("pollingIntervalSeconds", 60);
  }

  get githubApiBaseUrl(): string {
    return this.getConfiguration().get<string>(
      "github.apiBaseUrl",
      "https://api.github.com"
    );
  }

  get bitbucketBaseUrl(): string {
    return this.getConfiguration().get<string>(
      "bitbucket.baseUrl",
      "https://bitbucket.org"
    );
  }

  get extraRepositories(): string[] {
    return this.getConfiguration().get<string[]>("myWork.extraRepositories", []);
  }

  get branchAgeWarningDays(): number {
    return this.getConfiguration().get<number>("currentRepo.branchAgeWarningDays", 14);
  }

  get defaultBranch(): string {
    return this.getConfiguration().get<string>("currentRepo.defaultBranch", "main");
  }

  private getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(ConfigService.section);
  }
}
