(function () {
  const utils = {
    prettyReason(reason) {
      if (reason === "pipelineFailure") return "Pipeline failure";
      if (reason === "changesRequested") return "Changes requested";
      if (reason === "awaitingReviews") return "Awaiting reviews";
      return reason || "None";
    },
    formatTime(isoString) {
      const date = new Date(isoString);
      if (Number.isNaN(date.getTime())) return isoString;
      return date.toLocaleString();
    },
    escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }
  };

  window.Glance = window.Glance || {};
  window.Glance.utils = utils;
})();
