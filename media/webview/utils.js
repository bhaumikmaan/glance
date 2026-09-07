(function () {
  const utils = {
    prettyReason(reason) {
      if (reason === 'pipelineFailure') return 'Pipeline failure';
      if (reason === 'changesRequested') return 'Changes requested';
      if (reason === 'awaitingReviews') return 'Awaiting reviews';
      return reason || 'None';
    },
    formatTime(input) {
      const raw = String(input ?? '');
      const numericTs = /^\d+$/.test(raw) && raw.length >= 10 ? Number(raw.length === 10 ? `${raw}000` : raw) : NaN;
      const date = Number.isFinite(numericTs) ? new Date(numericTs) : new Date(raw);
      if (Number.isNaN(date.getTime())) return raw;
      return date.toLocaleString();
    },
    escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    },
  };

  window.Glance = window.Glance || {};
  window.Glance.utils = utils;
})();
