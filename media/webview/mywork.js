(function () {
  function initMyWork() {
    const utils = window.Glance.utils;
    const githubIcon = document.body.getAttribute("data-github-icon") || "";
    const bitbucketIcon = document.body.getAttribute("data-bitbucket-icon") || "";
    const myWorkSummary = document.getElementById("mywork-summary");
    const myPrsList = document.getElementById("my-prs-list");
    const reviewPrsList = document.getElementById("review-prs-list");
    const deploymentsList = document.getElementById("deployments-list");
    const filterQuery = document.getElementById("filter-query");
    const filterProvider = document.getElementById("filter-provider");
    const filterReadiness = document.getElementById("filter-readiness");
    const sortBy = document.getElementById("sort-by");
    const applyFiltersButton = document.getElementById("apply-filters");
    const filtersLoading = document.getElementById("filters-loading");
    const displayLimit = 100;
    let appliedFilters = {
      query: "",
      provider: "all",
      readiness: "all",
      sortBy: "updated_desc"
    };
    let lastSnapshot = null;
    let lastConfiguredProviders = [];

    function getFilteredItems(items, configuredProviders) {
      const query = (appliedFilters.query || "").trim().toLowerCase();
      const provider = appliedFilters.provider || "all";
      const readiness = appliedFilters.readiness || "all";

      return items
        .filter((item) => configuredProviders.includes(item.provider))
        .filter((item) => {
          const providerOk = provider === "all" ? true : item.provider === provider;
          const readinessOk = readiness === "all" ? true : item.readiness === readiness;
          const haystack = `${item.title} ${item.repository} ${item.author}`.toLowerCase();
          const queryOk = query.length === 0 ? true : haystack.includes(query);
          return providerOk && readinessOk && queryOk;
        });
    }

    function getSortedItems(items) {
      const mode = appliedFilters.sortBy || "updated_desc";
      const next = [...items];
      if (mode === "updated_asc") return next.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
      if (mode === "title_asc") return next.sort((a, b) => a.title.localeCompare(b.title));
      if (mode === "title_desc") return next.sort((a, b) => b.title.localeCompare(a.title));
      return next.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    function renderCards(items) {
      if (!items.length) return `<p class="muted">No items in this section.</p>`;
      return items.map((item) => {
        const reason = item.blockedReasons?.length
          ? utils.prettyReason(getPrimaryBlockedReason(item.blockedReasons))
          : "None";
        const readinessClass = item.readiness === "blocked" ? "badge red" : item.readiness === "pending" ? "badge yellow" : "badge green";
        const providerLogo = item.provider === "github" ? githubIcon : bitbucketIcon;
        return `<article class="work-card">
          <div class="work-card-top">
            <div class="title-with-logo"><img class="tiny-icon" src="${providerLogo}" alt="${item.provider}" /><a class="work-title" href="${utils.escapeHtml(item.url)}">${utils.escapeHtml(item.title)}</a></div>
            <span class="${readinessClass}">${utils.escapeHtml(capitalize(item.readiness))}</span>
          </div>
          <div class="work-meta">
            <span>${utils.escapeHtml(item.repository)}</span>
            <span>Author: ${utils.escapeHtml(item.author)}</span>
            <span>Build Status: ${utils.escapeHtml(capitalize(item.lastCommitStatus))}</span>
            <span>Reason: ${utils.escapeHtml(reason)}</span>
            <span>Updated: ${utils.escapeHtml(utils.formatTime(item.updatedAt))}</span>
          </div>
        </article>`;
      }).join("");
    }

    function renderDeploymentCards(items) {
      if (!items.length) return `<p class="muted">No recent deployment signals available yet.</p>`;
      return items.map((item) => {
        const statusClass = item.status === "failure"
          ? "badge red"
          : item.status === "pending"
            ? "badge yellow"
            : item.status === "success"
              ? "badge green"
              : "badge yellow";
        const providerLogo = item.provider === "github" ? githubIcon : bitbucketIcon;
        return `<article class="work-card">
          <div class="work-card-top">
            <div class="title-with-logo"><img class="tiny-icon" src="${providerLogo}" alt="${item.provider}" /><a class="work-title" href="${utils.escapeHtml(item.url)}">${utils.escapeHtml(item.title)}</a></div>
            <span class="${statusClass}">${utils.escapeHtml(capitalize(item.status))}</span>
          </div>
          <div class="work-meta">
            <span>${utils.escapeHtml(item.repository || "unknown-repo")}</span>
            <span>Source: ${utils.escapeHtml(item.environment || "Merged branch")}</span>
            <span>Updated: ${utils.escapeHtml(utils.formatTime(item.updatedAt))}</span>
          </div>
        </article>`;
      }).join("");
    }

    function applyFilters() {
      appliedFilters = {
        query: filterQuery?.value || "",
        provider: filterProvider?.value || "all",
        readiness: filterReadiness?.value || "all",
        sortBy: sortBy?.value || "updated_desc"
      };
      if (filtersLoading) filtersLoading.style.display = "inline-flex";
      if (applyFiltersButton) applyFiltersButton.disabled = true;
      window.setTimeout(() => {
        if (lastSnapshot) {
          renderSnapshot(lastSnapshot, lastConfiguredProviders);
        }
        if (filtersLoading) filtersLoading.style.display = "none";
        if (applyFiltersButton) applyFiltersButton.disabled = false;
      }, 250);
    }

    function sortByReadiness(items, order) {
      const rank = order === "my"
        ? { ready: 0, pending: 1, blocked: 2 }
        : { pending: 0, ready: 1, blocked: 2 };
      return [...items].sort((a, b) => {
        const diff = (rank[a.readiness] ?? 99) - (rank[b.readiness] ?? 99);
        if (diff !== 0) return diff;
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
    }

    function renderSnapshot(snapshot, configuredProviders) {
      lastSnapshot = snapshot;
      lastConfiguredProviders = configuredProviders;
      const myWorkItems = getSortedItems(getFilteredItems(snapshot.myWork || [], configuredProviders));
      const visible = myWorkItems.slice(0, displayLimit);
      const myPrs = sortByReadiness(visible.filter((item) => item.isMine !== false), "my");
      const reviewPrs = sortByReadiness(visible.filter((item) => item.isMine === false), "review");
      const deployments = (snapshot.deployments || [])
        .filter((dep) => configuredProviders.includes(dep.provider))
        .slice(0, 10)
        .map((dep) => ({
          provider: dep.provider,
          repository: dep.repository,
          environment: dep.environment || "Merged branch",
          status: dep.status,
          title: dep.title,
          url: dep.url,
          updatedAt: dep.updatedAt
        }));

      if (myWorkSummary) {
        const blocked = myWorkItems.filter((item) => item.readiness === "blocked").length;
        const ready = myWorkItems.filter((item) => item.readiness === "ready").length;
        myWorkSummary.textContent = `Showing ${visible.length}/${myWorkItems.length} | Blocked ${blocked} | Ready ${ready}`;
      }
      if (myPrsList) myPrsList.innerHTML = renderCards(myPrs);
      if (reviewPrsList) reviewPrsList.innerHTML = renderCards(reviewPrs);
      if (deploymentsList) {
        deploymentsList.innerHTML = renderDeploymentCards(deployments);
      }
    }

    applyFiltersButton?.addEventListener("click", applyFilters);

    return { renderSnapshot, applyFilters };
  }

  function capitalize(value) {
    if (!value) return "Unknown";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getPrimaryBlockedReason(reasons) {
    const priority = {
      pipelineFailure: 3,
      changesRequested: 2,
      awaitingReviews: 1
    };
    return [...reasons].sort((a, b) => (priority[b] || 0) - (priority[a] || 0))[0];
  }

  window.Glance = window.Glance || {};
  window.Glance.myWork = { initMyWork };
})();
