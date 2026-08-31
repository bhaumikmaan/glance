import * as vscode from "vscode";
import { URL } from "node:url";
import { DashboardAppService } from "../app/DashboardAppService";
import { ConfigService } from "../services/ConfigService";
import { DependencyTracerService } from "../services/DependencyTracerService";
import { SecretStore } from "../services/SecretStore";

type DashboardInitPayload = {
  pollingIntervalSeconds: number;
  githubApiBaseUrl: string;
  bitbucketBaseUrl: string;
  extraRepositories: string[];
  defaultBranch: string;
};

type AuthStatusPayload = {
  github: {
    configured: boolean;
  };
  bitbucket: {
    configured: boolean;
  };
};

export class DevCommandCenterViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "devCommandCenter.sidebarView";

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly configService: ConfigService,
    private readonly secretStore: SecretStore,
    private readonly appService: DashboardAppService,
    private readonly dependencyTracerService: DependencyTracerService
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: vscode.WebviewViewResolveContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== "object") {
        return;
      }

      const typed = message as { type?: string; payload?: unknown };
      if (typed.type === "dashboard/ready") {
        void this.postInitPayload();
        void this.postAuthStatus();
        this.appService.start(
          this.configService.pollingIntervalSeconds * 1000,
          async (snapshot) => {
            if (!this.view) {
              return;
            }
            await this.view.webview.postMessage({
              type: "dashboard/snapshot",
              payload: snapshot
            });
          }
        );
      }

      if (typed.type === "dashboard/refresh") {
        const snapshot = await this.appService.refreshNow();
        await this.view?.webview.postMessage({
          type: "dashboard/snapshot",
          payload: snapshot
        });
      }

      if (typed.type === "auth/saveToken" && typed.payload) {
        const payload = typed.payload as { provider?: string; token?: string };
        if (payload.provider && payload.token) {
          await this.secretStore.store(`${payload.provider}.token`, payload.token);
          vscode.window.setStatusBarMessage(
            `${payload.provider} token saved in SecretStorage.`,
            7000
          );
          const snapshot = await this.appService.refreshNow();
          await this.view?.webview.postMessage({
            type: "dashboard/snapshot",
            payload: snapshot
          });
          await this.postAuthStatus();
        }
      }

      if (typed.type === "auth/clearToken" && typed.payload) {
        const payload = typed.payload as { provider?: string };
        if (payload.provider) {
          await this.secretStore.delete(`${payload.provider}.token`);
          vscode.window.setStatusBarMessage(
            `${payload.provider} token removed from SecretStorage.`,
            7000
          );
          const snapshot = await this.appService.refreshNow();
          await this.view?.webview.postMessage({
            type: "dashboard/snapshot",
            payload: snapshot
          });
          await this.postAuthStatus();
        }
      }

      if (typed.type === "auth/openTokenHelp" && typed.payload) {
        const payload = typed.payload as { provider?: string };
        if (payload.provider === "github") {
          await vscode.env.openExternal(
            vscode.Uri.parse("https://github.com/settings/tokens")
          );
        }
        if (payload.provider === "bitbucket") {
          const base = this.configService.bitbucketBaseUrl;
          const isCloud = base.includes("bitbucket.org");
          const url = isCloud
            ? "https://bitbucket.org/account/settings/app-passwords/"
            : `${base}/plugins/servlet/oauth/users/access-tokens`;
          await vscode.env.openExternal(
            vscode.Uri.parse(url)
          );
        }
      }

      if (typed.type === "dashboard/openSettings") {
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "devCommandCenter"
        );
      }

      if (typed.type === "auth/openOAuth" && typed.payload) {
        const payload = typed.payload as { provider?: string };
        let statusMessage = "OAuth sign-in could not be opened. Use token mode.";
        if (payload.provider === "github") {
          await vscode.env.openExternal(vscode.Uri.parse("https://github.com/login"));
          statusMessage =
            "GitHub sign-in page opened. Complete sign-in and then paste a token if OAuth callback is not provisioned.";
        }
        if (payload.provider === "bitbucket") {
          await vscode.env.openExternal(
            vscode.Uri.parse(this.configService.bitbucketBaseUrl)
          );
          statusMessage =
            "Bitbucket sign-in page opened. If OAuth callback is not provisioned, use token mode.";
        }
        await this.view?.webview.postMessage({
          type: "auth/oauthResult",
          payload: { ok: true, message: statusMessage }
        });
        vscode.window.setStatusBarMessage(statusMessage, 8000);
      }

      if (typed.type === "config/updateBaseUrl" && typed.payload) {
        const payload = typed.payload as { provider?: string; baseUrl?: string };
        if (!payload.provider || !payload.baseUrl) {
          return;
        }
        const normalized = normalizeBaseUrl(payload.provider, payload.baseUrl);
        if (!normalized) {
          vscode.window.showWarningMessage("Invalid base URL provided.");
          return;
        }

        const section = vscode.workspace.getConfiguration("devCommandCenter");
        if (payload.provider === "github") {
          await section.update(
            "github.apiBaseUrl",
            normalized,
            vscode.ConfigurationTarget.Global
          );
        }
        if (payload.provider === "bitbucket") {
          await section.update(
            "bitbucket.baseUrl",
            normalized,
            vscode.ConfigurationTarget.Global
          );
        }
        vscode.window.setStatusBarMessage(
          `${payload.provider} base URL updated to ${normalized}`,
          8000
        );
        await this.postInitPayload();
      }

      if (typed.type === "config/updateDefaultBranch" && typed.payload) {
        const payload = typed.payload as { branch?: string };
        const branch = payload.branch?.trim();
        if (!branch) {
          return;
        }
        const section = vscode.workspace.getConfiguration("devCommandCenter");
        await section.update(
          "currentRepo.defaultBranch",
          branch,
          vscode.ConfigurationTarget.Workspace
        );
        vscode.window.setStatusBarMessage(`Default branch updated to ${branch}`, 7000);
        const snapshot = await this.appService.refreshNow();
        await this.view?.webview.postMessage({
          type: "dashboard/snapshot",
          payload: snapshot
        });
        await this.postInitPayload();
      }

      if (typed.type === "tools/runDependencyTrace" && typed.payload) {
        const payload = typed.payload as { dependency?: string };
        if (!payload.dependency) {
          return;
        }
        const result = await this.dependencyTracerService.trace(payload.dependency);
        await this.view?.webview.postMessage({
          type: "tools/dependencyTraceResult",
          payload: result
        });
      }

    });
  }

  private async postInitPayload(): Promise<void> {
    if (!this.view) {
      return;
    }

    const payload: DashboardInitPayload = {
      pollingIntervalSeconds: this.configService.pollingIntervalSeconds,
      githubApiBaseUrl: this.configService.githubApiBaseUrl,
      bitbucketBaseUrl: this.configService.bitbucketBaseUrl,
      extraRepositories: this.configService.extraRepositories,
      defaultBranch: this.configService.defaultBranch
    };

    await this.view.webview.postMessage({
      type: "dashboard/init",
      payload
    });
  }

  private async postAuthStatus(): Promise<void> {
    if (!this.view) {
      return;
    }
    const github = await this.secretStore.get("github.token");
    const bitbucket = await this.secretStore.get("bitbucket.token");
    const payload: AuthStatusPayload = {
      github: { configured: Boolean(github) },
      bitbucket: { configured: Boolean(bitbucket) }
    };
    await this.view.webview.postMessage({
      type: "auth/status",
      payload
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.js")
    );
    const utilsScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "webview", "utils.js")
    );
    const tabsScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "webview", "tabs.js")
    );
    const authScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "webview", "auth.js")
    );
    const myWorkScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "webview", "mywork.js")
    );
    const companionScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "webview", "companion.js")
    );
    const githubIconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "assets", "github.svg")
    );
    const bitbucketIconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "assets", "bitbucket.svg")
    );
    const prIconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "assets", "pr.svg")
    );
    const reviewIconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "assets", "review.svg")
    );
    const deployIconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "assets", "deploy.svg")
    );
    const glanceLogoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "assets", "glance.svg")
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "styles.css")
    );
    const nonce = getNonce();

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${stylesUri}" rel="stylesheet" />
    <title>Glance</title>
  </head>
  <body data-github-icon="${githubIconUri}" data-bitbucket-icon="${bitbucketIconUri}" data-deploy-icon="${deployIconUri}">
    <header class="header">
      <h1>GLANCE</h1>
      <div class="header-right">
        <div id="status-badges" style="display:none;">
          <span class="badge red">0</span>
          <span class="badge yellow">0</span>
          <span class="badge green">0</span>
        </div>
        <div id="provider-pills" class="provider-pills"></div>
        <button id="open-settings" class="icon-button" title="Open extension settings">Settings</button>
      </div>
    </header>
    <nav class="tabs" id="tabs-nav" style="display:none;">
      <button class="tab-button active" data-tab="mywork-tab">My Work</button>
      <button class="tab-button" data-tab="currentrepo-tab">Current Repository</button>
      <button class="tab-button" data-tab="tools-tab">Tools</button>
    </nav>
    <main id="auth-landing" class="auth-landing">
      <section class="info-card">
        <div class="welcome-center">
          <img class="glance-logo" src="${glanceLogoUri}" alt="Glance logo" />
          <h2>Welcome to Glance</h2>
          <p class="muted">Choose your provider first. Then add URL and authentication.</p>
          <div id="onboarding-provider-picker" class="provider-choice-row">
            <button id="pick-provider-bitbucket" data-provider="bitbucket">Use Bitbucket</button>
            <button id="pick-provider-github" data-provider="github">Use GitHub</button>
          </div>
          <div id="onboarding-config-section" style="display:none;">
            <p id="onboarding-selected-provider" class="muted">Provider selected</p>
            <div class="controls-row">
              <input id="onboarding-base-url" type="text" placeholder="e.g. bitbucket.example.com" />
              <button id="onboarding-save-base">Save Base URL</button>
            </div>
            <div class="button-row">
              <button id="onboarding-use-oauth">Use OAuth</button>
              <button id="onboarding-use-token">Use Token</button>
            </div>
            <div id="onboarding-oauth-panel" class="onboarding-panel">
              <button class="oauth-btn" id="onboarding-oauth-btn" data-provider="bitbucket">Continue with OAuth</button>
            </div>
            <div id="onboarding-token-panel" class="onboarding-panel" style="display:none;">
              <input id="onboarding-token-input" type="password" placeholder="Paste token" />
              <div class="button-row">
                <button id="onboarding-save-token">Save Token</button>
                <button id="onboarding-open-token-help">Open Token Page</button>
              </div>
            </div>
          </div>
          <div id="auth-loading" class="loading-row" style="display:none;">
            <span class="spinner"></span>
            <span id="auth-loading-text">Getting things ready...</span>
          </div>
        </div>
      </section>
    </main>
    <main id="app-shell" style="display:none;">
      <section id="mywork-tab" class="tab-panel active">
        <div class="section-header-row">
          <h2>My Work</h2>
          <div>
            <button id="toggle-filters">Filters</button>
            <button id="refresh-dashboard" class="refresh-button">
              <span id="refresh-label">Refresh</span>
              <span id="refresh-loading" class="button-loading" style="display:none;">
                <span class="spinner button-spinner"></span>
                <span>Refreshing...</span>
              </span>
            </button>
          </div>
        </div>
        <div id="mywork-filters" class="controls-row" style="display:none;">
          <input id="filter-query" type="text" placeholder="Search title/repo/author" />
          <select id="filter-provider">
            <option value="all">All providers</option>
            <option value="github">GitHub</option>
            <option value="bitbucket">Bitbucket</option>
          </select>
          <select id="filter-readiness">
            <option value="all">All readiness</option>
            <option value="blocked">Blocked</option>
            <option value="ready">Ready</option>
            <option value="pending">Pending</option>
          </select>
          <select id="sort-by">
            <option value="updated_desc">Newest</option>
            <option value="updated_asc">Oldest</option>
            <option value="title_asc">Title A-Z</option>
            <option value="title_desc">Title Z-A</option>
          </select>
          <div class="button-row">
            <button id="apply-filters">Apply Filters</button>
            <span id="filters-loading" class="inline-loading" style="display:none;">
              <span class="spinner"></span>
              <span>Applying...</span>
            </span>
          </div>
        </div>
        <div id="mywork-summary" class="mywork-summary"></div>
        <div class="info-card">
          <h3>Review Assistant</h3>
          <div id="review-assistant-summary" class="muted">Waiting for snapshot...</div>
          <div id="review-assistant-breaking" class="muted"></div>
        </div>
        <div class="mywork-sections">
          <details class="info-card" open>
            <summary><img class="tiny-icon" src="${prIconUri}" alt="pr" /> My PRs & Info</summary>
            <div id="my-prs-list" class="mywork-list">Waiting for first poll...</div>
          </details>
          <details class="info-card" open>
            <summary><img class="tiny-icon" src="${reviewIconUri}" alt="review" /> PRs for Review</summary>
            <div id="review-prs-list" class="mywork-list">Waiting for first poll...</div>
          </details>
          <details class="info-card" open>
            <summary><img class="tiny-icon" src="${deployIconUri}" alt="deploy" /> Recent Deployments</summary>
            <div id="deployments-list" class="mywork-list">Waiting for first poll...</div>
          </details>
        </div>
      </section>
      <section id="currentrepo-tab" class="tab-panel">
        <h2>Current Repository</h2>
        <div class="info-card">
          <h3>Main Branch Build Status</h3>
          <div id="current-core-branches" class="muted">Waiting for snapshot...</div>
        </div>
        <div class="info-card">
          <h3>Active Branch & Age</h3>
          <div id="current-active-branch" class="muted">Waiting for snapshot...</div>
        </div>
        <div class="info-card" id="current-codeowners-card">
          <h3>CODEOWNERS for Active File</h3>
          <div id="current-codeowners" class="muted">Waiting for snapshot...</div>
        </div>
        <div class="info-card">
          <h3>My Branches (Last 30 Days)</h3>
          <div id="current-recent-branches" class="muted">Waiting for snapshot...</div>
        </div>
        <details class="info-card">
          <summary>Default Branch</summary>
          <div class="controls-row">
            <input id="default-branch-input" type="text" placeholder="main" />
            <button id="save-default-branch">Save Default Branch</button>
          </div>
        </details>
        <div class="info-card">
          <h3>Dependency CVE Tracer</h3>
          <p class="muted">Enter package coordinate like <code>org.yaml:snakeyaml:1.30</code></p>
          <div class="controls-row">
            <input id="dependency-input" type="text" placeholder="group:artifact:version" />
            <button id="run-dependency-trace">Run Trace</button>
          </div>
          <p id="dependency-trace-summary" class="muted"></p>
          <pre id="dependency-trace-output">No trace executed yet.</pre>
        </div>
      </section>
      <section id="tools-tab" class="tab-panel">
        <h2>Tools & Assistant</h2>
        <div class="info-card">
          <h3>Authentication</h3>
          <p class="muted">Paste tokens here. They are stored in VS Code SecretStorage.</p>
          <div class="auth-grid">
            <label for="github-token"><img class="tiny-icon" src="${githubIconUri}" alt="github" /> GitHub Token</label>
            <div id="github-disconnected-actions" class="button-row">
              <button id="start-github-signin">Sign in</button>
            </div>
            <div id="github-signin-modes" class="button-row" style="display:none;">
              <button id="github-use-oauth">Use OAuth</button>
              <button id="github-use-token">Use Token</button>
            </div>
            <div id="github-oauth-panel" class="button-row" style="display:none;">
              <button class="oauth-btn" data-provider="github">Sign in with OAuth</button>
            </div>
            <div id="github-token-panel" style="display:none;">
              <input id="github-token" type="password" placeholder="ghp_..." />
              <div class="button-row">
                <button id="save-github">Save Token</button>
                <button id="help-github">Open Token Page</button>
              </div>
            </div>
            <div id="github-connected-actions" class="button-row" style="display:none;">
              <button id="clear-github">Remove Connection</button>
            </div>
            <p id="github-status" class="auth-status muted">Status: Not configured</p>
          </div>
          <div class="auth-grid">
            <label for="bitbucket-token"><img class="tiny-icon" src="${bitbucketIconUri}" alt="bitbucket" /> Bitbucket Token</label>
            <div id="bitbucket-disconnected-actions" class="button-row">
              <button id="start-bitbucket-signin">Sign in</button>
            </div>
            <div id="bitbucket-signin-modes" class="button-row" style="display:none;">
              <button id="bitbucket-use-oauth">Use OAuth</button>
              <button id="bitbucket-use-token">Use Token</button>
            </div>
            <div id="bitbucket-oauth-panel" class="button-row" style="display:none;">
              <button class="oauth-btn" data-provider="bitbucket">Sign in with OAuth</button>
            </div>
            <div id="bitbucket-token-panel" style="display:none;">
              <input id="bitbucket-token" type="password" placeholder="Paste Bitbucket access token" />
              <div class="button-row">
                <button id="save-bitbucket">Save Token</button>
                <button id="help-bitbucket">Open Token Page</button>
              </div>
            </div>
            <div id="bitbucket-connected-actions" class="button-row" style="display:none;">
              <button id="clear-bitbucket">Remove Connection</button>
            </div>
            <p id="bitbucket-status" class="auth-status muted">Status: Not configured</p>
          </div>
        </div>
        <div class="info-card">
          <h3>Theme</h3>
          <div class="controls-row">
            <select id="theme-mode">
              <option value="auto">Auto (Follow IDE)</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
        <div class="info-card">
          <h3>Runtime Settings Snapshot</h3>
          <pre id="settings-preview">Loading...</pre>
        </div>
      </section>
    </main>
    <footer class="companion-banner">
      <div class="companion-avatar">Mascot</div>
      <div class="companion-message" id="companion-message">Daily tip: Keep pull requests small and focused.</div>
      <div class="companion-timer" id="companion-timer">Break in 45m</div>
    </footer>
    <script nonce="${nonce}" src="${utilsScriptUri}"></script>
    <script nonce="${nonce}" src="${tabsScriptUri}"></script>
    <script nonce="${nonce}" src="${authScriptUri}"></script>
    <script nonce="${nonce}" src="${myWorkScriptUri}"></script>
    <script nonce="${nonce}" src="${companionScriptUri}"></script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function normalizeBaseUrl(provider: string, raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const withScheme =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (provider === "github") {
      if (url.hostname === "github.com") {
        return "https://api.github.com";
      }
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}
