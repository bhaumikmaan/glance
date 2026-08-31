import { PollingScheduler } from "../core/pollingScheduler";
import { deriveBlockedReason, blockedReasonLabel } from "../domain/statusEngine";
import { computeBadges } from "../domain/statusEngine";
import { DashboardSnapshot, ProviderSnapshot } from "../domain/types";
import { ProviderAdapter } from "../providers/types";
import { CurrentRepoService } from "../services/CurrentRepoService";

type OnSnapshot = (snapshot: DashboardSnapshot) => Promise<void> | void;

export class DashboardAppService {
  private readonly scheduler = new PollingScheduler();
  private lastSnapshots = new Map<ProviderSnapshot["provider"], ProviderSnapshot>();
  private currentRepoSnapshot: DashboardSnapshot["currentRepo"] = {
    branchAgeWarning: false,
    activeFileOwners: [],
    coreBranches: [],
    recentBranches: []
  };

  constructor(
    private readonly providers: ProviderAdapter[],
    private readonly currentRepoService: CurrentRepoService,
    private readonly branchAgeWarningDays: number,
    private readonly getDefaultBranch: () => string
  ) {}

  start(intervalMs: number, onSnapshot: OnSnapshot): void {
    this.scheduler.start({
      id: "dashboard-poll",
      intervalMs,
      run: async () => {
        await this.refreshNow();
        await onSnapshot(this.buildSnapshot());
      }
    });
  }

  stop(): void {
    this.scheduler.stopAll();
  }

  getCurrentSnapshot(): DashboardSnapshot {
    return this.buildSnapshot();
  }

  async refreshNow(): Promise<DashboardSnapshot> {
    const snapshots = await Promise.all(
      this.providers.map((provider) => provider.fetchSnapshot())
    );
    for (const snapshot of snapshots) {
      this.lastSnapshots.set(snapshot.provider, snapshot);
    }
    this.currentRepoSnapshot = await this.currentRepoService.buildSnapshot(
      this.branchAgeWarningDays,
      this.getDefaultBranch()
    );
    return this.buildSnapshot();
  }

  private buildSnapshot(): DashboardSnapshot {
    const providers = [...this.lastSnapshots.values()];
    const myWork = providers.flatMap((provider) => provider.workItems);
    const deployments = providers
      .flatMap((provider) => provider.deployments ?? [])
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, 25);
    const badges = computeBadges(myWork);
    const blockedItems = myWork.filter((item) => item.readiness === "blocked");
    const topBlockedReason =
      deriveBlockedReason(blockedItems.flatMap((item) => item.blockedReasons)) ??
      "awaitingReviews";
    const potentiallyBreakingItems = myWork
      .filter((item) => /BREAKING CHANGE|!:/i.test(item.title))
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        title: item.title,
        repository: item.repository,
        reason: "Title contains potential breaking-change marker.",
        url: item.url
      }));

    return {
      generatedAt: new Date().toISOString(),
      providers,
      myWork,
      deployments,
      badges,
      currentRepo: this.currentRepoSnapshot,
      reviewAssistant: {
        totalItems: myWork.length,
        blockedItems: blockedItems.length,
        topBlockedReason: blockedReasonLabel(topBlockedReason),
        potentiallyBreakingItems
      }
    };
  }
}
