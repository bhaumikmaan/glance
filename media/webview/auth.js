(function () {
  function initAuth(vscode) {
    const githubTokenInput = document.getElementById("github-token");
    const bitbucketTokenInput = document.getElementById("bitbucket-token");
    const githubButton = document.getElementById("save-github");
    const bitbucketButton = document.getElementById("save-bitbucket");
    const githubClearButton = document.getElementById("clear-github");
    const bitbucketClearButton = document.getElementById("clear-bitbucket");
    const githubHelpButton = document.getElementById("help-github");
    const bitbucketHelpButton = document.getElementById("help-bitbucket");
    const oauthButtons = document.querySelectorAll(".oauth-btn");
    const githubStatus = document.getElementById("github-status");
    const bitbucketStatus = document.getElementById("bitbucket-status");
    const onboardingProvider = document.getElementById("onboarding-provider");
    const onboardingBaseUrl = document.getElementById("onboarding-base-url");
    const onboardingSaveBase = document.getElementById("onboarding-save-base");
    const onboardingUseOAuth = document.getElementById("onboarding-use-oauth");
    const onboardingUseToken = document.getElementById("onboarding-use-token");
    const onboardingOAuthPanel = document.getElementById("onboarding-oauth-panel");
    const onboardingTokenPanel = document.getElementById("onboarding-token-panel");
    const onboardingOauthBtn = document.getElementById("onboarding-oauth-btn");
    const onboardingTokenInput = document.getElementById("onboarding-token-input");
    const onboardingSaveToken = document.getElementById("onboarding-save-token");
    const onboardingOpenTokenHelp = document.getElementById("onboarding-open-token-help");
    const authLoading = document.getElementById("auth-loading");
    const authLoadingText = document.getElementById("auth-loading-text");

    function selectedProvider() {
      return onboardingProvider?.value || "bitbucket";
    }

    function saveToken(provider, token) {
      if (!token) return;
      if (authLoading) authLoading.style.display = "flex";
      if (authLoadingText) authLoadingText.textContent = "Saving token and fetching dashboard...";
      vscode.postMessage({ type: "auth/saveToken", payload: { provider, token } });
    }

    githubButton?.addEventListener("click", () => {
      saveToken("github", githubTokenInput?.value?.trim());
      if (githubTokenInput) githubTokenInput.value = "";
    });
    bitbucketButton?.addEventListener("click", () => {
      saveToken("bitbucket", bitbucketTokenInput?.value?.trim());
      if (bitbucketTokenInput) bitbucketTokenInput.value = "";
    });
    githubClearButton?.addEventListener("click", () => {
      vscode.postMessage({ type: "auth/clearToken", payload: { provider: "github" } });
    });
    bitbucketClearButton?.addEventListener("click", () => {
      vscode.postMessage({ type: "auth/clearToken", payload: { provider: "bitbucket" } });
    });
    githubHelpButton?.addEventListener("click", () => {
      vscode.postMessage({ type: "auth/openTokenHelp", payload: { provider: "github" } });
    });
    bitbucketHelpButton?.addEventListener("click", () => {
      vscode.postMessage({ type: "auth/openTokenHelp", payload: { provider: "bitbucket" } });
    });
    oauthButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const provider = button.getAttribute("data-provider");
        if (!provider) return;
        if (authLoading) authLoading.style.display = "flex";
        if (authLoadingText) {
          authLoadingText.textContent =
            "Opening provider sign-in. If OAuth is not provisioned, use token mode.";
        }
        vscode.postMessage({ type: "auth/openOAuth", payload: { provider } });
      });
    });
    onboardingProvider?.addEventListener("change", () => {
      const provider = selectedProvider();
      if (onboardingOauthBtn) {
        onboardingOauthBtn.setAttribute("data-provider", provider);
        onboardingOauthBtn.textContent =
          provider === "github" ? "Continue with GitHub OAuth" : "Continue with Bitbucket OAuth";
      }
      if (onboardingTokenInput) {
        onboardingTokenInput.placeholder =
          provider === "github" ? "Paste GitHub token (ghp_...)" : "Paste Bitbucket token";
      }
    });
    onboardingSaveBase?.addEventListener("click", () => {
      const provider = selectedProvider();
      const baseUrl = onboardingBaseUrl?.value?.trim();
      if (!baseUrl) return;
      vscode.postMessage({
        type: "config/updateBaseUrl",
        payload: { provider, baseUrl }
      });
    });
    onboardingUseOAuth?.addEventListener("click", () => {
      if (onboardingOAuthPanel) onboardingOAuthPanel.style.display = "block";
      if (onboardingTokenPanel) onboardingTokenPanel.style.display = "none";
    });
    onboardingUseToken?.addEventListener("click", () => {
      if (onboardingOAuthPanel) onboardingOAuthPanel.style.display = "none";
      if (onboardingTokenPanel) onboardingTokenPanel.style.display = "block";
    });
    onboardingSaveToken?.addEventListener("click", () => {
      const provider = selectedProvider();
      const token = onboardingTokenInput?.value?.trim();
      if (!token) return;
      saveToken(provider, token);
      if (onboardingTokenInput) onboardingTokenInput.value = "";
    });
    onboardingOpenTokenHelp?.addEventListener("click", () => {
      vscode.postMessage({
        type: "auth/openTokenHelp",
        payload: { provider: selectedProvider() }
      });
    });

    function renderAuthStatus(payload) {
      if (onboardingProvider) {
        onboardingProvider.dispatchEvent(new Event("change"));
      }
      if (githubStatus && payload?.github) {
        githubStatus.textContent = payload.github.configured
          ? "Status: Configured"
          : "Status: Not configured";
      }
      if (bitbucketStatus && payload?.bitbucket) {
        bitbucketStatus.textContent = payload.bitbucket.configured
          ? "Status: Configured"
          : "Status: Not configured";
      }
      const configuredProviders = [];
      if (payload?.github?.configured) configuredProviders.push("github");
      if (payload?.bitbucket?.configured) configuredProviders.push("bitbucket");
      if (authLoading) authLoading.style.display = "none";
      return configuredProviders;
    }

    return { renderAuthStatus };
  }

  window.Glance = window.Glance || {};
  window.Glance.auth = { initAuth };
})();
