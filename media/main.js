/* global acquireVsCodeApi */
(function () {
  const vscode = acquireVsCodeApi();
  const settingsPreview = document.getElementById("settings-preview");
  const statusBadges = document.getElementById("status-badges");
  const openSettingsButton = document.getElementById("open-settings");
  const refreshButton = document.getElementById("refresh-dashboard");
  const runDependencyTraceButton = document.getElementById("run-dependency-trace");
  const dependencyInput = document.getElementById("dependency-input");
  const dependencyTraceSummary = document.getElementById("dependency-trace-summary");
  const dependencyTraceOutput = document.getElementById("dependency-trace-output");
  const toggleFiltersButton = document.getElementById("toggle-filters");
  const myWorkFilters = document.getElementById("mywork-filters");
  const authLanding = document.getElementById("auth-landing");
  const appShell = document.getElementById("app-shell");
  const tabsNav = document.getElementById("tabs-nav");
  const providerPills = document.getElementById("provider-pills");
  const onboardingBaseUrl = document.getElementById("onboarding-base-url");
  const defaultBranchInput = document.getElementById("default-branch-input");
  const saveDefaultBranchButton = document.getElementById("save-default-branch");
  const themeMode = document.getElementById("theme-mode");
  const currentCoreBranches = document.getElementById("current-core-branches");
  const currentActiveBranch = document.getElementById("current-active-branch");
  const currentCodeowners = document.getElementById("current-codeowners");
  const currentCodeownersCard = document.getElementById("current-codeowners-card");
  const currentRecentBranches = document.getElementById("current-recent-branches");
  const cursorUsageSummary = document.getElementById("cursor-usage-summary");
  const cursorUsageProgress = document.getElementById("cursor-usage-progress");
  const cursorRecentRequests = document.getElementById("cursor-recent-requests");
  const cursorInsightsList = document.getElementById("cursor-insights-list");
  const cursorTimeframe = document.getElementById("cursor-timeframe");
  const cursorMetric = document.getElementById("cursor-metric");
  const cursorUsageRefresh = document.getElementById("cursor-usage-refresh");
  const openCursorUsageDashboard = document.getElementById("open-cursor-usage-dashboard");
  const cursorInsightsLoading = document.getElementById("cursor-insights-loading");
  const applyFiltersButton = document.getElementById("apply-filters");
  const filtersLoading = document.getElementById("filters-loading");
  let isManualRefreshInFlight = false;
  let manualRefreshTimeout;

  const tabs = window.Glance.tabs.initTabs();
  const auth = window.Glance.auth.initAuth(vscode);
  const myWork = window.Glance.myWork.initMyWork();
  window.Glance.companion.initCompanion();
  window.Glance.app = { latestSnapshot: null, configuredProviders: [], initPayload: null };

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || !message.type) {
      return;
    }

    if (message.type === "dashboard/init" && settingsPreview) {
      settingsPreview.textContent = JSON.stringify(message.payload, null, 2);
      window.Glance.app.initPayload = message.payload;
      if (onboardingBaseUrl) {
        onboardingBaseUrl.value = message.payload?.bitbucketBaseUrl || "";
      }
      if (defaultBranchInput && document.activeElement !== defaultBranchInput) {
        defaultBranchInput.value = message.payload?.defaultBranch || "main";
      }
    }

    if (message.type === "dashboard/snapshot") renderSnapshot(message.payload);
    if (message.type === "auth/status") renderAuthStatus(message.payload);
    if (message.type === "auth/oauthResult") auth.handleOAuthResult(message.payload);
    if (message.type === "tools/dependencyTraceResult")
      renderDependencyTraceResult(message.payload);
  });

  openSettingsButton?.addEventListener("click", () => {
    vscode.postMessage({ type: "dashboard/openSettings" });
  });
  runDependencyTraceButton?.addEventListener("click", () => {
    const dependency = dependencyInput?.value?.trim();
    if (!dependency) {
      if (dependencyTraceSummary) {
        dependencyTraceSummary.textContent = "Enter a dependency coordinate first.";
      }
      return;
    }
    if (dependencyTraceSummary) {
      dependencyTraceSummary.textContent = "Running trace...";
    }
    vscode.postMessage({
      type: "tools/runDependencyTrace",
      payload: { dependency }
    });
  });
  refreshButton?.addEventListener("click", () => {
    if (isManualRefreshInFlight) return;
    isManualRefreshInFlight = true;
    if (refreshButton) refreshButton.classList.add("is-loading");
    if (manualRefreshTimeout) window.clearTimeout(manualRefreshTimeout);
    manualRefreshTimeout = window.setTimeout(() => {
      isManualRefreshInFlight = false;
      if (refreshButton) refreshButton.classList.remove("is-loading");
    }, 12000);
    vscode.postMessage({ type: "dashboard/refresh" });
  });
  toggleFiltersButton?.addEventListener("click", () => {
    if (!myWorkFilters) return;
    const isHidden = myWorkFilters.style.display === "none";
    myWorkFilters.style.display = isHidden ? "grid" : "none";
    toggleFiltersButton.textContent = isHidden ? "Hide Filters" : "Filters";
    if (filtersLoading) filtersLoading.style.display = "none";
    if (applyFiltersButton) applyFiltersButton.disabled = false;
  });
  if (myWorkFilters) {
    myWorkFilters.style.display = "none";
  }
  if (filtersLoading) filtersLoading.style.display = "none";
  saveDefaultBranchButton?.addEventListener("click", () => {
    const branch = defaultBranchInput?.value?.trim();
    if (!branch) return;
    vscode.postMessage({
      type: "config/updateDefaultBranch",
      payload: { branch }
    });
  });
  themeMode?.addEventListener("change", () => {
    document.body.classList.remove("theme-force-dark", "theme-force-light");
    if (themeMode.value === "dark") document.body.classList.add("theme-force-dark");
    if (themeMode.value === "light") document.body.classList.add("theme-force-light");
  });
  cursorUsageRefresh?.addEventListener("click", () => {
    setInsightsLoading(true);
    vscode.postMessage({ type: "cursorUsage/refresh" });
  });
  openCursorUsageDashboard?.addEventListener("click", () => {
    vscode.postMessage({ type: "cursorUsage/openDashboard" });
  });
  cursorTimeframe?.addEventListener("change", () => {
    setInsightsLoading(true);
    vscode.postMessage({
      type: "cursorUsage/setView",
      payload: {
        timeframe: cursorTimeframe.value,
        metric: cursorMetric?.value
      }
    });
  });
  cursorMetric?.addEventListener("change", () => {
    setInsightsLoading(true);
    vscode.postMessage({
      type: "cursorUsage/setView",
      payload: {
        timeframe: cursorTimeframe?.value,
        metric: cursorMetric.value
      }
    });
  });

  vscode.postMessage({ type: "dashboard/ready" });
  function renderSnapshot(snapshot) {
    if (!snapshot) {
      return;
    }
    window.Glance.app.latestSnapshot = snapshot;

    if (statusBadges && snapshot.badges) {
      statusBadges.innerHTML = `
        <span class="badge red">${snapshot.badges.red ?? 0}</span>
        <span class="badge yellow">${snapshot.badges.yellow ?? 0}</span>
        <span class="badge green">${snapshot.badges.green ?? 0}</span>
      `;
    }
    const authenticatedProvidersFromSnapshot = (snapshot.providers || [])
      .filter((provider) => provider.authenticated)
      .map((provider) => provider.provider);
    if (
      authenticatedProvidersFromSnapshot.length > 0 &&
      (window.Glance.app.configuredProviders || []).length === 0
    ) {
      window.Glance.app.configuredProviders = authenticatedProvidersFromSnapshot;
      if (authLanding) authLanding.style.display = "none";
      if (appShell) appShell.style.display = "block";
      if (tabsNav) tabsNav.style.display = "flex";
      if (statusBadges) statusBadges.style.display = "block";
      tabs.activateTab("mywork-tab");
      auth.setLoading(false);
    }
    renderProviderPills(snapshot.providers || [], window.Glance.app.configuredProviders || []);
    if (isManualRefreshInFlight) {
      isManualRefreshInFlight = false;
      if (manualRefreshTimeout) window.clearTimeout(manualRefreshTimeout);
      if (refreshButton) refreshButton.classList.remove("is-loading");
    }

    myWork.renderSnapshot(snapshot, window.Glance.app.configuredProviders || []);
    renderCurrentRepo(snapshot.currentRepo);
    renderReviewAssistant(snapshot);
    renderCursorUsage(snapshot.cursorUsage);
    setInsightsLoading(false);
  }

  function renderAuthStatus(payload) {
    const configuredProviders = auth.renderAuthStatus(payload);
    window.Glance.app.configuredProviders = configuredProviders;
    const hasProvider = configuredProviders.length > 0;
    const providerFilter = document.getElementById("filter-provider");
    if (providerFilter) {
      [...providerFilter.options].forEach((option) => {
        if (option.value === "all") return;
        option.hidden = !configuredProviders.includes(option.value);
      });
      if (!configuredProviders.includes(providerFilter.value) && providerFilter.value !== "all") {
        providerFilter.value = "all";
      }
    }
    if (authLanding) authLanding.style.display = hasProvider ? "none" : "block";
    if (appShell) appShell.style.display = hasProvider ? "block" : "none";
    if (tabsNav) tabsNav.style.display = hasProvider ? "flex" : "none";
    if (statusBadges) statusBadges.style.display = hasProvider ? "block" : "none";
    renderProviderPills(window.Glance.app.latestSnapshot?.providers || [], configuredProviders);
    if (window.Glance.app.latestSnapshot) {
      myWork.renderSnapshot(window.Glance.app.latestSnapshot, configuredProviders);
    }
    tabs.activateTab(hasProvider ? "mywork-tab" : "tools-tab");
  }

  function renderCurrentRepo(currentRepo) {
    if (!currentRepo) {
      return;
    }
    if (currentCoreBranches) {
      const topBranch =
        (currentRepo.coreBranches || []).find(
          (branch) => branch.name === currentRepo.effectiveDefaultBranch
        ) || (currentRepo.coreBranches || [])[0];
      if (!topBranch) {
        currentCoreBranches.innerHTML = `<span class="status-pill unknown">Build Status: Unknown</span>`;
      } else {
        currentCoreBranches.innerHTML = `
          <div class="build-status-row">
            <span class="muted">${escapeHtml(topBranch.name)}</span>
            <span class="status-pill ${escapeHtml(topBranch.status)}">Build Status: ${escapeHtml(
              capitalize(topBranch.status)
            )}</span>
          </div>
        `;
      }
    }

    if (currentActiveBranch) {
      const warning = currentRepo.branchAgeWarning ? " (warning)" : "";
      currentActiveBranch.textContent = `Active: ${
        currentRepo.activeBranch || "unknown"
      } | Age: ${currentRepo.activeBranchAgeDays ?? "n/a"} Days${warning}`;
    }

    if (currentCodeowners) {
      const hasCodeowners =
        Boolean(currentRepo.codeownersPath) && currentRepo.codeownersPath !== "not found";
      if (currentCodeownersCard) {
        currentCodeownersCard.style.display = hasCodeowners ? "block" : "none";
      }
      if (!hasCodeowners) {
        currentCodeowners.textContent = "";
      } else {
        currentCodeowners.innerHTML = `<div>File: ${escapeHtml(
          currentRepo.activeFile || "No active file"
        )}</div>
        <div>CODEOWNERS: ${escapeHtml(currentRepo.codeownersPath || "not found")}</div>
        <div>Owners: ${
          currentRepo.activeFileOwners?.length
            ? escapeHtml(currentRepo.activeFileOwners.join(", "))
            : "none matched"
        }</div>`;
      }
    }

    if (currentRecentBranches) {
      const rows = (currentRepo.recentBranches || [])
        .slice(0, 12)
        .map(
          (branch) => `<tr>
            <td>${escapeHtml(branch.name)}</td>
            <td>${branch.ageDays}d</td>
            <td>${escapeHtml(window.Glance.utils.formatTime(branch.lastCommitAt))}</td>
          </tr>`
        )
        .join("");
      currentRecentBranches.innerHTML = rows
        ? `<table class="branches-table">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Age</th>
                <th>Last Commit</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>`
        : `<p class="muted">No branches found in the last 30 days.</p>`;
    }

    if (defaultBranchInput && document.activeElement !== defaultBranchInput) {
      defaultBranchInput.value =
        currentRepo.effectiveDefaultBranch ||
        window.Glance.app.initPayload?.defaultBranch ||
        "main";
    }
  }

  function renderReviewAssistant(snapshot) {
    const reviewAssistantSummary = document.getElementById("review-assistant-summary");
    const reviewAssistant = snapshot?.reviewAssistant;
    const allItems = snapshot?.myWork || [];
    if (!reviewAssistant) {
      return;
    }

    const myWorkItems = allItems.filter((item) => item.isMine !== false);
    const reviewItems = allItems.filter((item) => item.isMine === false);
    const myWorkSummary = summarizeReviewSection(myWorkItems, true);
    const reviewSummary = summarizeReviewSection(reviewItems, false);

    if (reviewAssistantSummary) {
      reviewAssistantSummary.innerHTML = `
        <table class="review-assistant-table">
          <thead>
            <tr>
              <th>Section</th>
              <th>Total</th>
              <th>Ready</th>
              <th>Pending</th>
              <th>Blocked</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>My Work</td>
              <td>${myWorkSummary.total}</td>
              <td>${myWorkSummary.ready}</td>
              <td>${myWorkSummary.pending}</td>
              <td>${myWorkSummary.blocked}</td>
              <td>${escapeHtml(myWorkSummary.summary)}</td>
            </tr>
            <tr>
              <td>PR Reviews</td>
              <td>${reviewSummary.total}</td>
              <td>${reviewSummary.ready}</td>
              <td>${reviewSummary.pending}</td>
              <td>${reviewSummary.blocked}</td>
              <td>${escapeHtml(reviewSummary.summary)}</td>
            </tr>
          </tbody>
        </table>
      `;
    }
  }

  function summarizeReviewSection(items, isMyWork) {
    const summary = {
      total: items.length,
      ready: items.filter((item) => item.readiness === "ready").length,
      pending: items.filter((item) => item.readiness === "pending").length,
      blocked: items.filter((item) => item.readiness === "blocked").length,
      summary: "No items yet."
    };
    if (summary.blocked > 0) {
      const blockedReason = topBlockedReason(items);
      summary.summary = `Blocked: ${blockedReason}`;
      return summary;
    }
    if (summary.pending > 0) {
      summary.summary = isMyWork ? "Pending: waiting for review." : "Pending: please review.";
      return summary;
    }
    if (summary.ready > 0) {
      summary.summary = "Ready to merge.";
      return summary;
    }
    return summary;
  }

  function topBlockedReason(items) {
    const priority = ["pipelineFailure", "changesRequested", "awaitingReviews"];
    const labels = {
      pipelineFailure: "pipeline failure",
      changesRequested: "changes requested",
      awaitingReviews: "awaiting reviews"
    };
    for (const reason of priority) {
      if (items.some((item) => (item.blockedReasons || []).includes(reason))) {
        return labels[reason];
      }
    }
    return "action needed";
  }

  function renderDependencyTraceResult(result) {
    if (!result) {
      return;
    }
    if (dependencyTraceSummary) {
      dependencyTraceSummary.textContent = `${result.success ? "Success" : "Failed"} via ${result.tool}: ${result.summary}`;
    }
    if (dependencyTraceOutput) {
      dependencyTraceOutput.textContent =
        result.output || "(No output returned from command/parser)";
    }
  }

  function renderCursorUsage(cursorUsage) {
    if (!cursorUsage) {
      return;
    }

    if (cursorUsageSummary) {
      if (!cursorUsage.authenticated || !cursorUsage.reachable) {
        cursorUsageSummary.textContent =
          cursorUsage.warning || "Cursor usage unavailable. Sign in to Cursor on this machine.";
      } else {
        const used = formatUsd(cursorUsage.monthly?.usedCents || 0);
        const limit = formatUsd(cursorUsage.monthly?.limitCents || 0);
        const remaining = formatUsd(cursorUsage.monthly?.remainingCents || 0);
        cursorUsageSummary.textContent = `MTD: ${used} / ${limit} (${cursorUsage.monthly?.progressPercent ?? 0}%) | Remaining: ${remaining}`;
      }
    }

    if (cursorUsageProgress) {
      const progressPercent = Math.max(0, Math.min(100, cursorUsage.monthly?.progressPercent ?? 0));
      cursorUsageProgress.style.width = `${progressPercent}%`;
      cursorUsageProgress.textContent = `${progressPercent}%`;
    }

    if (cursorTimeframe && cursorUsage.conversationInsights?.timeframe) {
      cursorTimeframe.value = cursorUsage.conversationInsights.timeframe;
    }
    if (cursorMetric && cursorUsage.conversationInsights?.metric) {
      cursorMetric.value = cursorUsage.conversationInsights.metric;
    }

    if (cursorInsightsList) {
      const segments = cursorUsage.conversationInsights?.segments || [];
      cursorInsightsList.innerHTML = segments.length
        ? renderInsightsPieChart(segments)
        : `<p class="muted">No insights available for this timeframe.</p>`;
    }

    if (cursorRecentRequests) {
      const requests = cursorUsage.recentRequests || [];
      cursorRecentRequests.innerHTML = requests.length
        ? requests
            .map(
              (request) => `<div class="usage-request-row">
              <span class="muted">${escapeHtml(window.Glance.utils.formatTime(request.timestamp))}</span>
              <span>${escapeHtml(request.model)}</span>
              <span>${formatUsd(request.chargedCents)}</span>
            </div>`
            )
            .join("")
        : `<p class="muted">No recent requests found in this cycle.</p>`;
    }
  }

  function renderProviderPills(providers, configuredProviders) {
    if (!providerPills) return;
    providerPills.innerHTML = providers
      .filter((provider) => configuredProviders.includes(provider.provider))
      .map((provider) => {
        const stateClass = provider.authenticated
          ? provider.reachable
            ? "dot-green"
            : "dot-yellow"
          : "dot-red";
        const label = provider.authenticated
          ? provider.reachable
            ? "Active"
            : "Needs Attention"
          : "Auth Required";
        const icon =
          provider.provider === "github"
            ? document.body.getAttribute("data-github-icon")
            : document.body.getAttribute("data-bitbucket-icon");
        return `<span class="provider-pill-inline">
          <img class="tiny-icon" src="${icon}" alt="${escapeHtml(provider.provider)}" />
          <span class="status-dot ${stateClass}"></span>
          <span>${escapeHtml(capitalize(provider.provider))}: ${escapeHtml(label)}</span>
        </span>`;
      })
      .join("");
  }

  function capitalize(value) {
    if (!value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function escapeHtml(value) {
    return window.Glance.utils.escapeHtml(value);
  }

  function formatUsd(cents) {
    const numeric = Number.isFinite(cents) ? cents : 0;
    return `$${(Math.max(0, numeric) / 100).toFixed(2)}`;
  }

  function renderInsightsPieChart(segments) {
    const palette = [
      "#3b8f8f",
      "#57b7a9",
      "#74c2d5",
      "#5b86c2",
      "#8e8ac6",
      "#c58fcd",
      "#d7959f",
      "#d6a66d"
    ];
    const total = segments.reduce((sum, segment) => sum + (Number(segment.count) || 0), 0);
    const radius = 52;
    const strokeWidth = 22;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const slices = segments
      .map((segment, index) => {
        const count = Math.max(0, Number(segment.count) || 0);
        const ratio = total > 0 ? count / total : 0;
        const dashLength = ratio * circumference;
        const color = palette[index % palette.length];
        const label = `${segment.label}: ${segment.count} (${segment.percentage}%)`;
        const circle = `<circle
            class="usage-pie-slice"
            data-label="${escapeHtml(label)}"
            cx="80"
            cy="80"
            r="${radius}"
            fill="none"
            stroke="${color}"
            stroke-width="${strokeWidth}"
            stroke-dasharray="${dashLength} ${circumference - dashLength}"
            stroke-dashoffset="${-offset}"
            stroke-linecap="butt"
          >
            <title>${escapeHtml(label)}</title>
          </circle>`;
        offset += dashLength;
        return circle;
      })
      .join("");

    return `<div class="usage-pie-layout">
      <div class="usage-pie-chart" id="usage-pie-chart">
        <svg viewBox="0 0 160 160" width="220" height="220" aria-label="Conversation insights pie chart">
          <circle cx="80" cy="80" r="${radius}" fill="none" stroke="var(--vscode-input-border, #333)" stroke-width="${strokeWidth}" />
          <g transform="rotate(-90 80 80)">
            ${slices}
          </g>
          <circle cx="80" cy="80" r="34" fill="var(--vscode-editorWidget-background)" />
        </svg>
        <div id="usage-pie-tooltip" class="usage-pie-tooltip">Hover slices for details</div>
      </div>
    </div>`;
  }

  function setInsightsLoading(isLoading) {
    if (cursorInsightsLoading) {
      cursorInsightsLoading.style.display = isLoading ? "flex" : "none";
    }
    if (cursorInsightsList) {
      cursorInsightsList.classList.toggle("is-loading", isLoading);
    }
  }

  document.addEventListener("mouseover", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.classList.contains("usage-pie-slice")) return;
    const tooltip = document.getElementById("usage-pie-tooltip");
    const label = target.getAttribute("data-label");
    if (tooltip && label) tooltip.textContent = label;
  });

  document.addEventListener("mouseout", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.classList.contains("usage-pie-slice")) return;
    const tooltip = document.getElementById("usage-pie-tooltip");
    if (tooltip) tooltip.textContent = "Hover slices for details";
  });
})();
