(function () {
  function initMyWork() {
    const utils = window.Glance.utils;
    const githubIcon = document.body.getAttribute("data-github-icon") || "";
    const bitbucketIcon = document.body.getAttribute("data-bitbucket-icon") || "";
    const deployIcon = document.body.getAttribute("data-deploy-icon") || "";
    const myWorkSummary = document.getElementById("mywork-summary");
    const myPrsList = document.getElementById("my-prs-list");
    const reviewPrsList = document.getElementById("review-prs-list");
    const deploymentsList = document.getElementById("deployments-list");
    const filterQuery = document.getElementById("filter-query");
    const filterProvider = document.getElementById("filter-provider");
    const filterReadiness = document.getElementById("filter-readiness");
    const sortBy = document.getElementById("sort-by");
    const displayLimit = 100;

    function getFilteredItems(items, configuredProviders) {
      const query = (filterQuery?.value || "").trim().toLowerCase();
      const provider = filterProvider?.value || "all";
      const readiness = filterReadiness?.value || "all";

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
      const mode = sortBy?.value || "updated_desc";
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

    function renderSnapshot(snapshot, configuredProviders) {
      const myWorkItems = getSortedItems(getFilteredItems(snapshot.myWork || [], configuredProviders));
      const visible = myWorkItems.slice(0, displayLimit);

      const myPrs = visible.filter((item) => item.isMine !== false);
      const reviewPrs = visible.filter((item) => item.isMine === false);
      const deployments = myPrs.slice(0, 10).map((item) => ({
        env: "Dev/Stg/Prod",
        status: item.lastCommitStatus,
        title: item.title,
        url: item.url,
        updatedAt: item.updatedAt
      }));

      if (myWorkSummary) {
        const blocked = myWorkItems.filter((item) => item.readiness === "blocked").length;
        const ready = myWorkItems.filter((item) => item.readiness === "ready").length;
        myWorkSummary.textContent = `Showing ${visible.length}/${myWorkItems.length} | Blocked ${blocked} | Ready ${ready}`;
      }

      if (myPrsList) myPrsList.innerHTML = renderCards(myPrs);
      if (reviewPrsList) reviewPrsList.innerHTML = renderCards(reviewPrs);
      if (deploymentsList) {
        deploymentsList.innerHTML = deployments.length
          ? deployments
              .map(
                (dep) =>
                  `<div class="deployment-row"><img class="tiny-icon" src="${deployIcon}" alt="deployment" /><a class="work-title" href="${utils.escapeHtml(dep.url)}">${utils.escapeHtml(dep.title)}</a><span>${utils.escapeHtml(dep.env)} | ${utils.escapeHtml(dep.status)} | ${utils.escapeHtml(utils.formatTime(dep.updatedAt))}</span></div>`
              )
              .join("")
          : `<p class="muted">No recent deployment signals available yet.</p>`;
      }

    }

    return { renderSnapshot };
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
