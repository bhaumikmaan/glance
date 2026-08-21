import { getJson } from "../../core/httpClient";
import { TtlCache } from "../../core/ttlCache";
import { deriveReadiness } from "../../domain/statusEngine";
import { BlockedReason, ProviderSnapshot, WorkItem } from "../../domain/types";
import { SecretStore } from "../../services/SecretStore";
import { ProviderAdapter } from "../types";

export class GitHubAdapter implements ProviderAdapter {
  readonly id = "github" as const;
  private readonly cache = new TtlCache<ProviderSnapshot>();

  constructor(
    private readonly secretStore: SecretStore,
    private readonly getApiBaseUrl: () => string
  ) {}

  async fetchSnapshot(): Promise<ProviderSnapshot> {
    const cached = this.cache.get("snapshot");
    if (cached) {
      return cached;
    }

    const token = await this.secretStore.get("github.token");
    if (!token) {
      return {
        provider: this.id,
        reachable: false,
        authenticated: false,
        workItems: [],
        warning: "GitHub token not configured."
      };
    }

    try {
      const endpoint = `${this.getApiBaseUrl()}/search/issues?q=is:pr+is:open+author:@me&per_page=20`;
      const response = await getJson<GitHubSearchResponse>(endpoint, {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "dev-command-center"
      });

      const workItems: WorkItem[] = response.items.map((item) => {
        const blockedReasons = deriveGitHubBlockedReasons(item);
        return {
          id: `gh-${item.id}`,
          provider: "github",
          repository: item.repository_url.replace("https://api.github.com/repos/", ""),
          title: item.title,
          url: item.html_url,
          author: item.user?.login ?? "unknown",
          isMine: true,
          blockedReasons,
          readiness: deriveReadiness({ blockedReasons }),
          lastCommitStatus: inferCommitStatusFromChecks(item),
          updatedAt: item.updated_at
        };
      });

      const snapshot: ProviderSnapshot = {
        provider: this.id,
        reachable: true,
        authenticated: true,
        workItems
      };
      this.cache.set("snapshot", snapshot, 30_000);
      return snapshot;
    } catch {
      const fallback = buildFallbackSnapshot();
      this.cache.set("snapshot", fallback, 15_000);
      return {
        ...fallback,
        warning:
          "GitHub API fetch failed. Showing fallback sample data. Verify token and API base URL."
      };
    }
  }
}

type GitHubSearchResponse = {
  items: Array<{
    id: number;
    title: string;
    html_url: string;
    repository_url: string;
    updated_at: string;
    user?: { login?: string };
    pull_request?: {
      merged_at?: string | null;
    };
    state_reason?: string | null;
  }>;
};

function deriveGitHubBlockedReasons(item: GitHubSearchResponse["items"][number]): BlockedReason[] {
  if (item.state_reason === "not_planned") {
    return ["changesRequested"];
  }
  return [];
}

function inferCommitStatusFromChecks(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _item: GitHubSearchResponse["items"][number]
): WorkItem["lastCommitStatus"] {
  // Search API does not include check rollup; default to unknown for now.
  return "unknown";
}

function buildFallbackSnapshot(): ProviderSnapshot {
  const rawItems: WorkItem[] = [
    {
      id: "gh-fallback-1",
      provider: "github",
      repository: "org/service-a",
      title: "Refactor polling scheduler",
      url: "https://github.com",
      author: "you",
      isMine: true,
      blockedReasons: [],
      readiness: "ready",
      lastCommitStatus: "success",
      updatedAt: new Date().toISOString(),
      queuePosition: 2
    },
    {
      id: "gh-fallback-2",
      provider: "github",
      repository: "org/service-b",
      title: "Fix flaky deployment check",
      url: "https://github.com",
      author: "you",
      isMine: true,
      blockedReasons: ["pipelineFailure"],
      readiness: "blocked",
      lastCommitStatus: "failure",
      updatedAt: new Date().toISOString()
    }
  ];
  const workItems = rawItems.map((item) => ({
    ...item,
    readiness: deriveReadiness(item)
  }));
  return {
    provider: "github",
    reachable: true,
    authenticated: true,
    workItems
  };
}
