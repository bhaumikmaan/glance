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
    const startGithubSigninButton = document.getElementById("start-github-signin");
    const startBitbucketSigninButton = document.getElementById("start-bitbucket-signin");
    const githubSigninModes = document.getElementById("github-signin-modes");
    const bitbucketSigninModes = document.getElementById("bitbucket-signin-modes");
    const githubUseOAuthButton = document.getElementById("github-use-oauth");
    const githubUseTokenButton = document.getElementById("github-use-token");
    const bitbucketUseOAuthButton = document.getElementById("bitbucket-use-oauth");
    const bitbucketUseTokenButton = document.getElementById("bitbucket-use-token");
    const githubOAuthPanel = document.getElementById("github-oauth-panel");
    const githubTokenPanel = document.getElementById("github-token-panel");
    const bitbucketOAuthPanel = document.getElementById("bitbucket-oauth-panel");
    const bitbucketTokenPanel = document.getElementById("bitbucket-token-panel");
    const githubDisconnectedActions = document.getElementById("github-disconnected-actions");
    const bitbucketDisconnectedActions = document.getElementById("bitbucket-disconnected-actions");
    const githubConnectedActions = document.getElementById("github-connected-actions");
    const bitbucketConnectedActions = document.getElementById("bitbucket-connected-actions");
    const providerPickBitbucket = document.getElementById("pick-provider-bitbucket");
    const providerPickGithub = document.getElementById("pick-provider-github");
    const onboardingConfigSection = document.getElementById("onboarding-config-section");
    const onboardingSelectedProvider = document.getElementById("onboarding-selected-provider");
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
    let onboardingProvider = null;
    let authLoadingTimeout;

    function selectedProvider() {
      return onboardingProvider;
    }

    function setLoading(isLoading, text) {
      if (authLoading) authLoading.style.display = isLoading ? "flex" : "none";
      if (authLoadingText && text) authLoadingText.textContent = text;
      if (authLoadingTimeout) {
        window.clearTimeout(authLoadingTimeout);
        authLoadingTimeout = undefined;
      }
      if (isLoading) {
        authLoadingTimeout = window.setTimeout(() => {
          if (authLoading) authLoading.style.display = "none";
        }, 15000);
      }
    }

    function setProvider(provider, reveal = true) {
      onboardingProvider = provider === "github" ? "github" : "bitbucket";
      if (onboardingConfigSection && reveal) onboardingConfigSection.style.display = "block";
      if (onboardingSelectedProvider) {
        onboardingSelectedProvider.textContent =
          onboardingProvider === "github" ? "Provider: GitHub" : "Provider: Bitbucket";
      }
      if (onboardingBaseUrl) {
        const payload = window.Glance?.app?.initPayload;
        onboardingBaseUrl.value =
          onboardingProvider === "github"
            ? payload?.githubApiBaseUrl || ""
            : payload?.bitbucketBaseUrl || "";
      }
      if (onboardingOauthBtn) {
        onboardingOauthBtn.setAttribute("data-provider", onboardingProvider);
        onboardingOauthBtn.textContent =
          onboardingProvider === "github" ? "Continue with GitHub OAuth" : "Continue with Bitbucket OAuth";
      }
      if (onboardingTokenInput) {
        onboardingTokenInput.placeholder =
          onboardingProvider === "github" ? "Paste GitHub token (ghp_...)" : "Paste Bitbucket token";
      }
    }

    function saveToken(provider, token) {
      if (!token) return;
      setLoading(true, "Saving token and fetching dashboard...");
      vscode.postMessage({ type: "auth/saveToken", payload: { provider, token } });
    }

    function setSignInView(provider, mode) {
      const isGitHub = provider === "github";
      const signInModes = isGitHub ? githubSigninModes : bitbucketSigninModes;
      const oauthPanel = isGitHub ? githubOAuthPanel : bitbucketOAuthPanel;
      const tokenPanel = isGitHub ? githubTokenPanel : bitbucketTokenPanel;
      if (signInModes) signInModes.style.display = mode === "methods" ? "flex" : "none";
      if (oauthPanel) oauthPanel.style.display = mode === "oauth" ? "flex" : "none";
      if (tokenPanel) tokenPanel.style.display = mode === "token" ? "block" : "none";
    }

    function setProviderConnectionState(provider, isConfigured) {
      const isGitHub = provider === "github";
      const disconnectedActions = isGitHub
        ? githubDisconnectedActions
        : bitbucketDisconnectedActions;
      const connectedActions = isGitHub ? githubConnectedActions : bitbucketConnectedActions;
      if (disconnectedActions) disconnectedActions.style.display = isConfigured ? "none" : "flex";
      if (connectedActions) connectedActions.style.display = isConfigured ? "flex" : "none";
      setSignInView(provider, "none");
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
        setLoading(
          true,
          "Opening provider sign-in. If OAuth is not provisioned, use token mode."
        );
        vscode.postMessage({ type: "auth/openOAuth", payload: { provider } });
      });
    });
    startGithubSigninButton?.addEventListener("click", () => {
      setSignInView("github", "methods");
    });
    startBitbucketSigninButton?.addEventListener("click", () => {
      setSignInView("bitbucket", "methods");
    });
    githubUseOAuthButton?.addEventListener("click", () => setSignInView("github", "oauth"));
    githubUseTokenButton?.addEventListener("click", () => setSignInView("github", "token"));
    bitbucketUseOAuthButton?.addEventListener("click", () =>
      setSignInView("bitbucket", "oauth")
    );
    bitbucketUseTokenButton?.addEventListener("click", () =>
      setSignInView("bitbucket", "token")
    );
    providerPickBitbucket?.addEventListener("click", () => setProvider("bitbucket", true));
    providerPickGithub?.addEventListener("click", () => setProvider("github", true));
    onboardingSaveBase?.addEventListener("click", () => {
      const provider = selectedProvider();
      if (!provider) return;
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
      if (onboardingUseOAuth) onboardingUseOAuth.disabled = true;
      if (onboardingUseToken) onboardingUseToken.disabled = false;
    });
    onboardingUseToken?.addEventListener("click", () => {
      if (onboardingOAuthPanel) onboardingOAuthPanel.style.display = "none";
      if (onboardingTokenPanel) onboardingTokenPanel.style.display = "block";
      if (onboardingUseToken) onboardingUseToken.disabled = true;
      if (onboardingUseOAuth) onboardingUseOAuth.disabled = false;
    });
    onboardingSaveToken?.addEventListener("click", () => {
      const provider = selectedProvider();
      if (!provider) return;
      const token = onboardingTokenInput?.value?.trim();
      if (!token) return;
      saveToken(provider, token);
      if (onboardingTokenInput) onboardingTokenInput.value = "";
    });
    onboardingOpenTokenHelp?.addEventListener("click", () => {
      const provider = selectedProvider();
      if (!provider) return;
      vscode.postMessage({
        type: "auth/openTokenHelp",
        payload: { provider }
      });
    });

    function handleOAuthResult(payload) {
      setLoading(false);
      if (authLoadingText && payload?.message) {
        authLoadingText.textContent = payload.message;
      }
    }

    function renderAuthStatus(payload) {
      if (onboardingConfigSection && !selectedProvider()) {
        onboardingConfigSection.style.display = "none";
      }
      if (onboardingUseOAuth) onboardingUseOAuth.disabled = false;
      if (onboardingUseToken) onboardingUseToken.disabled = false;
      if (onboardingOAuthPanel) onboardingOAuthPanel.style.display = "none";
      if (onboardingTokenPanel) onboardingTokenPanel.style.display = "none";
      if (githubStatus && payload?.github) {
        githubStatus.textContent = payload.github.configured
          ? "Status: Configured"
          : "Status: Not configured";
        setProviderConnectionState("github", payload.github.configured);
      }
      if (bitbucketStatus && payload?.bitbucket) {
        bitbucketStatus.textContent = payload.bitbucket.configured
          ? "Status: Configured"
          : "Status: Not configured";
        setProviderConnectionState("bitbucket", payload.bitbucket.configured);
      }
      const configuredProviders = [];
      if (payload?.github?.configured) configuredProviders.push("github");
      if (payload?.bitbucket?.configured) configuredProviders.push("bitbucket");
      setLoading(false);
      return configuredProviders;
    }

    return { renderAuthStatus, handleOAuthResult };
  }

  window.Glance = window.Glance || {};
  window.Glance.auth = { initAuth };
})();
