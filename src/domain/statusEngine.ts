import { BlockedReason, DashboardSnapshot, WorkItem } from "./types";

const blockedReasonPriority: Record<BlockedReason, number> = {
  pipelineFailure: 3,
  changesRequested: 2,
  awaitingReviews: 1
};

export function deriveBlockedReason(
  reasons: BlockedReason[]
): BlockedReason | undefined {
  if (reasons.length === 0) {
    return undefined;
  }

  return reasons
    .slice()
    .sort(
      (left, right) => blockedReasonPriority[right] - blockedReasonPriority[left]
    )[0];
}

export function deriveReadiness(item: Pick<WorkItem, "blockedReasons">): WorkItem["readiness"] {
  if (item.blockedReasons.length > 0) {
    return "blocked";
  }
  return "ready";
}

export function computeBadges(items: WorkItem[]): DashboardSnapshot["badges"] {
  let red = 0;
  let yellow = 0;
  let green = 0;

  for (const item of items) {
    if (item.readiness === "blocked") {
      red += 1;
      continue;
    }

    if (item.readiness === "pending") {
      yellow += 1;
      continue;
    }

    green += 1;
  }

  return { red, yellow, green };
}

export function blockedReasonLabel(reason: BlockedReason): string {
  switch (reason) {
    case "pipelineFailure":
      return "Pipeline failure";
    case "changesRequested":
      return "Changes requested";
    case "awaitingReviews":
      return "Awaiting reviews";
  }
}
