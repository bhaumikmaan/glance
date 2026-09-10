import * as vscode from 'vscode';
import { DashboardAppService } from './app/DashboardAppService';
import { BitbucketAdapter } from './providers/bitbucket/BitbucketAdapter';
import { GitHubAdapter } from './providers/github/GitHubAdapter';
import { CurrentRepoService } from './services/CurrentRepoService';
import { DevCommandCenterViewProvider } from './webview/DevCommandCenterViewProvider';
import { ConfigService } from './services/ConfigService';
import { CursorUsageService } from './services/CursorUsageService';
import { DependencyTracerService } from './services/DependencyTracerService';
import { SecretStore } from './services/SecretStore';

export function activate(context: vscode.ExtensionContext): void {
  const configService = new ConfigService();
  const secretStore = new SecretStore(context.secrets);
  const currentRepoService = new CurrentRepoService(
    () => configService.bitbucketBaseUrl,
    () => secretStore.get('bitbucket.token')
  );
  const dependencyTracerService = new DependencyTracerService();
  const cursorUsageService = new CursorUsageService();
  const appService = new DashboardAppService(
    [
      new GitHubAdapter(secretStore, () => configService.githubApiBaseUrl),
      new BitbucketAdapter(secretStore, () => configService.bitbucketBaseUrl),
    ],
    currentRepoService,
    cursorUsageService,
    configService.branchAgeWarningDays,
    () => configService.defaultBranch
  );

  const viewProvider = new DevCommandCenterViewProvider(
    context.extensionUri,
    configService,
    secretStore,
    appService,
    dependencyTracerService,
    cursorUsageService
  );

  const usageStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
  usageStatusBar.command = 'devCommandCenter.open';
  usageStatusBar.text = 'MTD - -- / --';
  usageStatusBar.tooltip = 'Cursor usage not loaded yet.';
  usageStatusBar.show();
  context.subscriptions.push(usageStatusBar);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DevCommandCenterViewProvider.viewType, viewProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devCommandCenter.open', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.devCommandCenter');
    })
  );

  context.subscriptions.push({
    dispose: () => {
      appService.stop();
    },
  });

  const refreshUsageStatusBar = async (): Promise<void> => {
    const snapshot = appService.getCurrentSnapshot();
    const usage = snapshot.cursorUsage;
    if (!usage.authenticated || !usage.reachable) {
      usageStatusBar.text = 'MTD - unavailable';
      usageStatusBar.tooltip = usage.warning ?? 'Cursor usage unavailable. Click to open Glance.';
      return;
    }
    usageStatusBar.text = `MTD - ${formatUsd(usage.monthly.usedCents)} / ${formatUsd(usage.monthly.limitCents)}`;
    usageStatusBar.tooltip = [
      'Cursor Monthly Usage',
      '',
      `Used: ${formatUsd(usage.monthly.usedCents)}`,
      `Limit: ${formatUsd(usage.monthly.limitCents)}`,
      `Remaining: ${formatUsd(usage.monthly.remainingCents)}`,
      usage.lastUpdated ? `Updated: ${new Date(usage.lastUpdated).toLocaleString()}` : '',
      '',
      'Click to open Glance.',
    ]
      .filter(Boolean)
      .join('\n');
  };

  void appService.refreshNow().then(refreshUsageStatusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand('devCommandCenter.updateUsageStatusBar', async () => {
      await refreshUsageStatusBar();
    })
  );
}

export function deactivate(): void {
  // No explicit teardown needed in phase 1.
}

function formatUsd(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}
