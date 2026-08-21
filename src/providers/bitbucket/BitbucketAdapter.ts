import { getJson } from "../../core/httpClient";
import { TtlCache } from "../../core/ttlCache";
import { deriveReadiness } from "../../domain/statusEngine";
import { BlockedReason, ProviderSnapshot, WorkItem } from "../../domain/types";
import { SecretStore } from "../../services/SecretStore";
import { ProviderAdapter } from "../types";

export class BitbucketAdapter implements ProviderAdapter {
  readonly id = "bitbucket" as const;
  private readonly cache = new TtlCache<ProviderSnapshot>();

  constructor(
    private readonly secretStore: SecretStore,
    private readonly getBaseUrl: () => string
  ) {}

  async fetchSnapshot(): Promise<ProviderSnapshot> {
    const cached = this.cache.get("snapshot");
    if (cached) {
      return cached;
    }

    const token = await this.secretStore.get("bitbucket.token");
    if (!token) {
      return {
        provider: this.id,
        reachable: false,
        authenticated: false,
        workItems: [],
        warning:
          "Bitbucket token not configured. Use access tokens page from your workspace."
      };
    }

    try {
      const authorItems = await this.fetchDashboardItems(token, "AUTHOR");
      const reviewerItems = await this.fetchDashboardItems(token, "REVIEWER");
      const merged = dedupeById([...authorItems, ...reviewerItems]);

      const snapshot: ProviderSnapshot = {
        provider: this.id,
        reachable: true,
        authenticated: true,
        workItems: merged
      };
      this.cache.set("snapshot", snapshot, 30_000);
      return snapshot;
    } catch {
      const fallback = buildFallbackSnapshot();
      this.cache.set("snapshot", fallback, 15_000);
      return {
        ...fallback,
        warning:
          "Bitbucket API fetch failed. Showing fallback sample data. Verify token and base URL."
      };
    }
  }

  private async fetchDashboardItems(
    token: string,
    role: "AUTHOR" | "REVIEWER"
  ): Promise<WorkItem[]> {
    const baseUrl = this.getBaseUrl();
    const endpoint = `${baseUrl}/rest/api/1.0/dashboard/pull-requests?state=OPEN&role=${role}&limit=25`;
    const response = await getJson<BitbucketDashboardResponse>(endpoint, {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    });

    const items = await Promise.all((response.values ?? []).map(async (value) => {
      const blockedReasons = deriveBitbucketBlockedReasons(value);
      const buildStatus = await this.fetchBuildStatus(
        baseUrl,
        token,
        value.fromRef?.latestCommit
      );
      if (buildStatus === "failure") {
        blockedReasons.unshift("pipelineFailure");
      }
      const item: WorkItem = {
        id: `bb-${value.id}`,
        provider: "bitbucket",
        repository: `${value.fromRef?.repository?.project?.key ?? "UNKNOWN"}/${value.fromRef?.repository?.slug ?? "unknown-repo"}`,
        title: value.title ?? `PR ${value.id}`,
        url: value.links?.self?.[0]?.href ?? baseUrl,
        author: value.author?.user?.name ?? "unknown",
        isMine: role === "AUTHOR",
        blockedReasons,
        readiness: deriveReadiness({ blockedReasons }),
        lastCommitStatus: buildStatus,
        updatedAt: value.updatedDate
          ? new Date(value.updatedDate).toISOString()
          : new Date().toISOString()
      };
      return item;
    }));
    return items;
  }

  private async fetchBuildStatus(
    baseUrl: string,
    token: string,
    commit?: string
  ): Promise<WorkItem["lastCommitStatus"]> {
    if (!commit) {
      return "unknown";
    }
    try {
      const endpoint = `${baseUrl}/rest/build-status/1.0/commits/${commit}`;
      const response = await getJson<{
        values?: Array<{ state?: string }>;
      }>(endpoint, {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      });
      const states = (response.values ?? []).map((value) => value.state ?? "");
      if (states.some((state) => state === "FAILED")) return "failure";
      if (states.some((state) => state === "INPROGRESS")) return "pending";
      if (states.some((state) => state === "SUCCESSFUL")) return "success";
      return "unknown";
    } catch {
      return "unknown";
    }
  }
}

type BitbucketDashboardResponse = {
  values?: BitbucketDashboardItem[];
};

function deriveBitbucketBlockedReasons(
  item: BitbucketDashboardItem
): BlockedReason[] {
  const reasons: BlockedReason[] = [];
  const hasNeedsWork =
    item.reviewers?.some((reviewer) => reviewer.status === "NEEDS_WORK") ?? false;
  const hasUnapproved =
    item.reviewers?.some((reviewer) => reviewer.approved === false) ?? false;

  if (hasNeedsWork) {
    reasons.push("changesRequested");
  } else if (hasUnapproved) {
    reasons.push("awaitingReviews");
  }

  return reasons;
}

type BitbucketDashboardItem = {
  id: number;
  title?: string;
  updatedDate?: number;
  author?: {
    user?: {
      name?: string;
    };
  };
  links?: {
    self?: Array<{ href: string }>;
  };
  fromRef?: {
    latestCommit?: string;
    repository?: {
      slug?: string;
      project?: {
        key?: string;
      };
    };
  };
  reviewers?: Array<{
    approved?: boolean;
    status?: string;
  }>;
};

function dedupeById(items: WorkItem[]): WorkItem[] {
  const map = new Map<string, WorkItem>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return [...map.values()];
}

function buildFallbackSnapshot(): ProviderSnapshot {
  const rawItems: WorkItem[] = [
    {
      id: "bb-fallback-1",
      provider: "bitbucket",
      repository: "platform/analytics-api",
      title: "Update CODEOWNERS for reviews",
      url: "https://bitbucket.org",
      author: "you",
      isMine: true,
      blockedReasons: ["awaitingReviews"],
      readiness: "blocked",
      lastCommitStatus: "success",
      updatedAt: new Date().toISOString()
    },
    {
      id: "bb-fallback-2",
      provider: "bitbucket",
      repository: "platform/web-client",
      title: "Stabilize release branch",
      url: "https://bitbucket.org",
      author: "you",
      isMine: false,
      blockedReasons: ["changesRequested"],
      readiness: "blocked",
      lastCommitStatus: "pending",
      updatedAt: new Date().toISOString()
    }
  ];
  const workItems = rawItems.map((item) => ({
    ...item,
    readiness: deriveReadiness(item)
  }));
  return {
    provider: "bitbucket",
    reachable: true,
    authenticated: true,
    workItems
  };
}
