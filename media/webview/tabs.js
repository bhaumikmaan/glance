(function () {
  function initTabs() {
    const tabButtons = document.querySelectorAll(".tab-button");
    const tabPanels = document.querySelectorAll(".tab-panel");

    function activateTab(targetTabId) {
      tabButtons.forEach((button) => {
        const isActive = button.dataset.tab === targetTabId;
        button.classList.toggle("active", isActive);
      });
      tabPanels.forEach((panel) => {
        panel.classList.toggle("active", panel.id === targetTabId);
      });
    }

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.tab));
    });

    return { activateTab };
  }

  window.Glance = window.Glance || {};
  window.Glance.tabs = { initTabs };
})();
