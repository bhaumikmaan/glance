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
  const refreshLoading = document.getElementById("refresh-loading");
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
  let isManualRefreshInFlight = false;

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
    if (message.type === "tools/dependencyTraceResult") renderDependencyTraceResult(message.payload);
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
    isManualRefreshInFlight = true;
    if (refreshButton) refreshButton.disabled = true;
    if (refreshLoading) refreshLoading.style.display = "inline-flex";
    vscode.postMessage({ type: "dashboard/refresh" });
  });
  toggleFiltersButton?.addEventListener("click", () => {
    if (!myWorkFilters) return;
    const isHidden = myWorkFilters.style.display === "none";
    myWorkFilters.style.display = isHidden ? "grid" : "none";
    toggleFiltersButton.textContent = isHidden ? "Hide Filters" : "Filters";
  });
  if (myWorkFilters) {
    myWorkFilters.style.display = "none";
  }
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
    renderProviderPills(snapshot.providers || [], window.Glance.app.configuredProviders || []);
    if (isManualRefreshInFlight) {
      isManualRefreshInFlight = false;
      if (refreshButton) refreshButton.disabled = false;
      if (refreshLoading) refreshLoading.style.display = "none";
    }

    myWork.renderSnapshot(snapshot, window.Glance.app.configuredProviders || []);
    renderCurrentRepo(snapshot.currentRepo);
    renderReviewAssistant(snapshot.reviewAssistant);
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
        Boolean(currentRepo.codeownersPath) &&
        currentRepo.codeownersPath !== "not found";
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
        currentRepo.effectiveDefaultBranch || window.Glance.app.initPayload?.defaultBranch || "main";
    }
  }

  function renderReviewAssistant(reviewAssistant) {
    const reviewAssistantSummary = document.getElementById("review-assistant-summary");
    const reviewAssistantBreaking = document.getElementById("review-assistant-breaking");
    if (!reviewAssistant) {
      return;
    }
    if (reviewAssistantSummary) {
      reviewAssistantSummary.textContent = `Total items: ${
        reviewAssistant.totalItems
      } | Blocked: ${reviewAssistant.blockedItems} | Top blocked reason: ${
        reviewAssistant.topBlockedReason || "n/a"
      }`;
    }
    if (reviewAssistantBreaking) {
      if (!reviewAssistant.potentiallyBreakingItems?.length) {
        reviewAssistantBreaking.textContent =
          "Potential breaking changes: none detected from PR titles.";
        return;
      }

      reviewAssistantBreaking.innerHTML =
        `<p>Potential breaking changes:</p>` +
        reviewAssistant.potentiallyBreakingItems
          .map(
            (item) =>
              `<div><a class="work-title" href="${escapeHtml(item.url)}">${escapeHtml(
                item.title
              )}</a> <span class="muted">(${escapeHtml(item.repository)})</span></div>`
          )
          .join("");
    }
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
        const icon = provider.provider === "github"
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
})();
