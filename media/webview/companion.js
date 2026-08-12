(function () {
  function initCompanion() {
    const companionMessage = document.getElementById("companion-message");
    const companionTimer = document.getElementById("companion-timer");
    let breakCountdownMinutes = 45;
    const messages = [
      "Daily tip: Keep pull requests small and focused.",
      "Reminder: Rebase long-running branches to avoid merge friction.",
      "Hydration check: Drink water before your next context switch.",
      "Review tip: Start with risky files and migration paths first."
    ];

    function rotate() {
      if (!companionMessage) return;
      companionMessage.textContent = messages[Math.floor(Math.random() * messages.length)];
    }

    setInterval(() => {
      breakCountdownMinutes = Math.max(0, breakCountdownMinutes - 1);
      if (companionTimer) companionTimer.textContent = `Break in ${breakCountdownMinutes}m`;
      if (breakCountdownMinutes === 0) {
        breakCountdownMinutes = 45;
        rotate();
      }
    }, 60_000);

    rotate();
  }

  window.Glance = window.Glance || {};
  window.Glance.companion = { initCompanion };
})();
