import * as vscode from "vscode";
import { DashboardAppService } from "./app/DashboardAppService";
import { BitbucketAdapter } from "./providers/bitbucket/BitbucketAdapter";
import { GitHubAdapter } from "./providers/github/GitHubAdapter";
import { CurrentRepoService } from "./services/CurrentRepoService";
import { DevCommandCenterViewProvider } from "./webview/DevCommandCenterViewProvider";
import { ConfigService } from "./services/ConfigService";
import { DependencyTracerService } from "./services/DependencyTracerService";
import { SecretStore } from "./services/SecretStore";

export function activate(context: vscode.ExtensionContext): void {
  const configService = new ConfigService();
  const secretStore = new SecretStore(context.secrets);
  const currentRepoService = new CurrentRepoService(
    () => configService.bitbucketBaseUrl,
    () => secretStore.get("bitbucket.token")
  );
  const dependencyTracerService = new DependencyTracerService();
  const appService = new DashboardAppService([
    new GitHubAdapter(secretStore, () => configService.githubApiBaseUrl),
    new BitbucketAdapter(secretStore, () => configService.bitbucketBaseUrl)
  ], currentRepoService, configService.branchAgeWarningDays, () => configService.defaultBranch);

  const viewProvider = new DevCommandCenterViewProvider(
    context.extensionUri,
    configService,
    secretStore,
    appService,
    dependencyTracerService
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DevCommandCenterViewProvider.viewType,
      viewProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devCommandCenter.open", async () => {
      await vscode.commands.executeCommand(
        "workbench.view.extension.devCommandCenter"
      );
    })
  );

  context.subscriptions.push({
    dispose: () => {
      appService.stop();
    }
  });
}

export function deactivate(): void {
  // No explicit teardown needed in phase 1.
}
