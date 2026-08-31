export type MergeReadiness = "ready" | "blocked" | "pending";

export type BlockedReason =
  | "pipelineFailure"
  | "changesRequested"
  | "awaitingReviews";

export type ProviderId = "github" | "bitbucket";

export type DeploymentSignal = {
  id: string;
  provider: ProviderId;
  repository: string;
  title: string;
  url: string;
  status: "success" | "failure" | "pending" | "unknown";
  updatedAt: string;
  environment?: string;
};

export type WorkItem = {
  id: string;
  provider: ProviderId;
  repository: string;
  title: string;
  url: string;
  author: string;
  isMine?: boolean;
  readiness: MergeReadiness;
  blockedReasons: BlockedReason[];
  lastCommitStatus: "success" | "failure" | "pending" | "unknown";
  updatedAt: string;
  queuePosition?: number;
};

export type ProviderSnapshot = {
  provider: ProviderId;
  reachable: boolean;
  authenticated: boolean;
  workItems: WorkItem[];
  deployments?: DeploymentSignal[];
  warning?: string;
};

export type DashboardSnapshot = {
  generatedAt: string;
  badges: {
    red: number;
    yellow: number;
    green: number;
  };
  providers: ProviderSnapshot[];
  myWork: WorkItem[];
  deployments: DeploymentSignal[];
  currentRepo: {
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
  reviewAssistant: {
    totalItems: number;
    blockedItems: number;
    topBlockedReason: string;
    potentiallyBreakingItems: Array<{
      id: string;
      title: string;
      repository: string;
      reason: string;
      url: string;
    }>;
  };
};
