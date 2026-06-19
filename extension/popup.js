/**
 * CorrectNow Extension Popup
 * Handles user authentication and displays usage stats
 */

const BACKEND_OPTIONS = {
  deployed: {
    apiBase: 'https://correctnow.app',
    webBase: 'https://correctnow.app',
    label: 'Deployed (Render)',
  },
  local: {
    apiBase: 'http://localhost:8787',
    webBase: 'http://localhost:8080',
    label: 'Local Testing (localhost)',
  },
};

// DOM Elements
const loadingView = document.getElementById('loadingView');
const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');
const loginBtn = document.getElementById('loginBtn');
const continueWithoutLoginBtn = document.getElementById('continueWithoutLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const upgradeBtn = document.getElementById('upgradeBtn');
const dashboardBtn = document.getElementById('dashboardBtn');
const disableExtensionBtn = document.getElementById('disableExtensionBtn');
const disableExtensionBtnLogin = document.getElementById('disableExtensionBtnLogin');
const userEmail = document.getElementById('userEmail');
const planBadge = document.getElementById('planBadge');
const checksUsed = document.getElementById('checksUsed');
const creditsRemaining = document.getElementById('creditsRemaining');
const progressFill = document.getElementById('progressFill');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const backendModeSelect = document.getElementById('backendModeSelect');
const backendModeHint = document.getElementById('backendModeHint');
// New premium-UI elements (purely presentational wiring — no business logic)
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const themeSegment = document.getElementById('themeSegment');
const statusBadge = document.getElementById('statusBadge');
const statusBadgeText = document.getElementById('statusBadgeText');
const userAvatar = document.getElementById('userAvatar');
const dashboardBtnFooter = document.getElementById('dashboardBtnFooter');

let currentBackendMode = 'deployed';
let currentBackendApiBase = BACKEND_OPTIONS.deployed.apiBase;
let currentBackendWebBase = BACKEND_OPTIONS.deployed.webBase;

function getAuthUrl() {
  return `${currentBackendWebBase}/auth`;
}

function getDashboardUrl() {
  return `${currentBackendWebBase}/dashboard`;
}

function getPricingUrl() {
  return `${currentBackendWebBase}/pricing`;
}

function updateBackendHint() {
  if (!backendModeHint) return;
  backendModeHint.textContent = `Using ${currentBackendMode} backend: ${currentBackendApiBase}`;
}

async function loadBackendMode() {
  const stored = await chrome.storage.local.get(['backendMode', 'backendApiBase', 'backendWebBase']);
  const mode = stored.backendMode === 'local' ? 'local' : 'deployed';
  const fallback = BACKEND_OPTIONS[mode];

  currentBackendMode = mode;
  currentBackendApiBase = String(stored.backendApiBase || fallback.apiBase).trim();
  currentBackendWebBase = String(stored.backendWebBase || fallback.webBase).trim();

  // Migrate legacy local frontend URL from :5173 to :8080
  if (
    mode === 'local' &&
    (!currentBackendWebBase || currentBackendWebBase === 'http://localhost:5173')
  ) {
    currentBackendWebBase = BACKEND_OPTIONS.local.webBase;
    await chrome.storage.local.set({
      backendMode: 'local',
      backendApiBase: currentBackendApiBase || BACKEND_OPTIONS.local.apiBase,
      backendWebBase: currentBackendWebBase,
    });
  }

  if (backendModeSelect) {
    backendModeSelect.value = mode;
  }
  updateBackendHint();
}

async function saveBackendMode(mode) {
  const selected = mode === 'local' ? 'local' : 'deployed';
  const cfg = BACKEND_OPTIONS[selected];

  currentBackendMode = selected;
  currentBackendApiBase = cfg.apiBase;
  currentBackendWebBase = cfg.webBase;

  await chrome.storage.local.set({
    backendMode: selected,
    backendApiBase: cfg.apiBase,
    backendWebBase: cfg.webBase,
  });

  updateBackendHint();
}

/**
 * Initialize popup on load
 */
async function init() {
  console.log('Popup initializing...');
  
  try {
    await loadBackendMode();

    // Check extension enabled state
    const { extensionEnabled } = await chrome.storage.local.get(['extensionEnabled']);
    const isEnabled = extensionEnabled !== false; // default to true
    
    // Update button texts based on state
    if (disableExtensionBtn) {
      disableExtensionBtn.textContent = isEnabled ? 'Disable Extension' : 'Enable Extension';
    }
    if (disableExtensionBtnLogin) {
      disableExtensionBtnLogin.textContent = isEnabled ? 'Disable Extension' : 'Enable Extension';
    }
    
    // Check if user is logged in
    const authState = await getAuthState();
    
    if (authState && authState.user) {
      console.log('User is logged in:', authState.user.email);
      await showDashboard(authState);
    } else {
      console.log('User is not logged in');
      showLogin();
    }
  } catch (error) {
    console.error('Error during initialization:', error);
    showLogin();
  }
}

/**
 * Get authentication state from background script
 */
async function getAuthState() {
  return new Promise((resolve) => {
    let resolved = false;
    
    try {
      chrome.runtime.sendMessage({ action: 'getAuthState' }, (response) => {
        if (!resolved) {
          resolved = true;
          if (chrome.runtime.lastError) {
            console.error('Error getting auth state:', chrome.runtime.lastError);
            resolve(null);
          } else {
            resolve(response);
          }
        }
      });
      
      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('Auth state request timed out');
          resolve(null);
        }
      }, 5000);
    } catch (error) {
      if (!resolved) {
        resolved = true;
        console.error('Exception getting auth state:', error);
        resolve(null);
      }
    }
  });
}

/**
 * Get user usage stats
 */
async function getUserStats() {
  return new Promise((resolve) => {
    let resolved = false;
    
    try {
      chrome.runtime.sendMessage({ action: 'getUserStats' }, (response) => {
        if (!resolved) {
          resolved = true;
          if (chrome.runtime.lastError) {
            console.error('Error getting user stats:', chrome.runtime.lastError);
            resolve(null);
          } else {
            resolve(response);
          }
        }
      });
      
      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('User stats request timed out');
          resolve(null);
        }
      }, 5000);
    } catch (error) {
      if (!resolved) {
        resolved = true;
        console.error('Exception getting user stats:', error);
        resolve(null);
      }
    }
  });
}

/**
 * Show login view
 */
function showLogin() {
  loadingView.classList.add('hidden');
  dashboardView.classList.add('hidden');
  loginView.classList.remove('hidden');
}

/**
 * Show dashboard view
 */
async function showDashboard(authState) {
  loadingView.classList.add('hidden');
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  
  // Display user info
  const emailStr = authState.user.email || 'User';
  userEmail.textContent = emailStr;
  if (userAvatar) userAvatar.textContent = (emailStr.trim()[0] || 'U').toUpperCase();

  // Get usage stats
  const stats = await getUserStats();

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (stats) {
    const planType = stats.planType || 'free';
    planBadge.textContent = planType.charAt(0).toUpperCase() + planType.slice(1);
    planBadge.classList.toggle('is-pro', planType !== 'free');

    if (planType === 'free') {
      // FREE — daily CHECK quota (not a credit pool).
      const used = Number(stats.checksToday || 0);
      const limit = Number(stats.dailyCheckLimit || 5);
      const remaining = stats.checksRemaining != null ? Number(stats.checksRemaining) : Math.max(0, limit - used);
      const wordsPerCheck = Number(stats.wordsPerCheck || 200);

      $('usageTitle').textContent = 'Daily usage';
      $('usageSub').textContent = 'Free plan';
      $('usageSub').classList.remove('hidden');
      $('statLabelUsed').textContent = 'Checks today';
      checksUsed.textContent = `${used} / ${limit}`;
      $('statLabelRemaining').textContent = 'Remaining';
      creditsRemaining.textContent = String(remaining);
      $('wordsPerCheckRow').classList.remove('hidden');
      $('wordsPerCheck').textContent = fmt(wordsPerCheck);

      progressFill.style.width = Math.min((used / limit) * 100, 100) + '%';
      progressFill.classList.toggle('is-full', remaining <= 0);

      // Conversion: show the banner only when the daily limit is exhausted.
      const banner = $('upgradeBanner');
      if (remaining <= 0) {
        banner.classList.remove('hidden');
        $('upgradeBannerTitle').textContent = `You've used all ${limit} free checks today`;
      } else {
        banner.classList.add('hidden');
      }
      upgradeBtn.classList.remove('hidden'); // free users can always upgrade
    } else {
      // PRO — monthly credit (word) pool.
      const used = Number(stats.creditsUsed || 0);
      const total = Number(stats.totalCredits || 25000);
      const remaining = stats.creditsRemaining != null ? Number(stats.creditsRemaining) : Math.max(0, total - used);

      $('usageTitle').textContent = 'Monthly usage';
      $('usageSub').textContent = 'Pro plan';
      $('statLabelUsed').textContent = 'Credits used';
      checksUsed.textContent = `${fmt(used)} / ${fmt(total)}`;
      $('statLabelRemaining').textContent = 'Remaining';
      creditsRemaining.textContent = fmt(remaining);
      $('wordsPerCheckRow').classList.add('hidden');
      progressFill.style.width = Math.min((used / total) * 100, 100) + '%';
      progressFill.classList.remove('is-full');
      $('upgradeBanner').classList.add('hidden');
      upgradeBtn.classList.add('hidden');
    }
  } else {
    // No stats yet — assume free defaults.
    $('usageTitle').textContent = 'Daily usage';
    $('statLabelUsed').textContent = 'Checks today';
    checksUsed.textContent = '0 / 5';
    creditsRemaining.textContent = '5';
    $('wordsPerCheck').textContent = '200';
    progressFill.style.width = '0%';
    $('upgradeBanner').classList.add('hidden');
  }
}

/**
 * Show error message
 */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
  setTimeout(() => {
    errorMessage.classList.add('hidden');
  }, 5000);
}

/**
 * Show success message
 */
function showSuccess(message) {
  successMessage.textContent = message;
  successMessage.classList.remove('hidden');
  setTimeout(() => {
    successMessage.classList.add('hidden');
  }, 3000);
}

/**
 * Handle login button click
 */
loginBtn.addEventListener('click', (e) => {
  e.preventDefault();
  // Open auth page in new tab
  chrome.tabs.create({ url: getAuthUrl() });
});

/**
 * Handle continue without login button click
 */
continueWithoutLoginBtn.addEventListener('click', () => {
  // Store guest mode preference
  chrome.storage.local.set({ guestMode: true }, () => {
    window.close();
  });
});

/**
 * Handle logout button click
 */
logoutBtn.addEventListener('click', async () => {
  try {
    // Send logout message to background script
    chrome.runtime.sendMessage({ action: 'logout' }, (response) => {
      if (chrome.runtime.lastError) {
        showError('Logout failed. Please try again.');
        return;
      }
      
      if (response && response.success) {
        showSuccess('Logged out successfully!');
        setTimeout(() => {
          showLogin();
        }, 1000);
      } else {
        showError('Logout failed. Please try again.');
      }
    });
  } catch (error) {
    console.error('Logout error:', error);
    showError('An error occurred during logout.');
  }
});

/**
 * Handle upgrade button click
 */
upgradeBtn.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: getPricingUrl() });
});

// Conversion banner CTA (shown when the free daily limit is reached).
const upgradeBannerBtn = document.getElementById('upgradeBannerBtn');
if (upgradeBannerBtn) {
  upgradeBannerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: getPricingUrl() });
  });
}

/**
 * Handle dashboard button click
 */
dashboardBtn.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: getDashboardUrl() });
});

if (backendModeSelect) {
  backendModeSelect.addEventListener('change', async () => {
    try {
      await saveBackendMode(backendModeSelect.value);
      showSuccess(`Backend switched to ${currentBackendMode}.`);
    } catch (error) {
      console.error('Error saving backend mode:', error);
      showError('Failed to save backend mode.');
    }
  });
}

/**
 * Handle disable extension button click (dashboard view)
 */
if (disableExtensionBtn) {
  disableExtensionBtn.addEventListener('click', async () => {
    try {
      const { extensionEnabled } = await chrome.storage.local.get(['extensionEnabled']);
      const isEnabled = extensionEnabled !== false;
      
      // Toggle the state
      await chrome.storage.local.set({ extensionEnabled: !isEnabled });
      
      if (isEnabled) {
        disableExtensionBtn.textContent = 'Enable Extension';
        showSuccess('Extension disabled. Grammar checking is now inactive.');
      } else {
        disableExtensionBtn.textContent = 'Disable Extension';
        showSuccess('Extension enabled. Grammar checking is now active.');
      }
      
      // Reload all tabs to apply changes
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
            chrome.tabs.reload(tab.id);
          }
        });
      });
    } catch (error) {
      console.error('Error toggling extension:', error);
      showError('Failed to toggle extension state.');
    }
  });
}

/**
 * Handle disable extension button click (login view)
 */
if (disableExtensionBtnLogin) {
  disableExtensionBtnLogin.addEventListener('click', async () => {
    try {
      const { extensionEnabled } = await chrome.storage.local.get(['extensionEnabled']);
      const isEnabled = extensionEnabled !== false;
      
      // Toggle the state
      await chrome.storage.local.set({ extensionEnabled: !isEnabled });
      
      if (isEnabled) {
        disableExtensionBtnLogin.textContent = 'Enable Extension';
        showSuccess('Extension disabled. Grammar checking is now inactive.');
      } else {
        disableExtensionBtnLogin.textContent = 'Disable Extension';
        showSuccess('Extension enabled. Grammar checking is now active.');
      }
      
      // Reload all tabs to apply changes
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
            chrome.tabs.reload(tab.id);
          }
        });
      });
    } catch (error) {
      console.error('Error toggling extension:', error);
      showError('Failed to toggle extension state.');
    }
  });
}

/**
 * Listen for auth state changes from background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'authStateChanged') {
    console.log('Auth state changed:', message.user ? 'logged in' : 'logged out');
    
    if (message.reason === 'token_expired') {
      showError('Your session has expired. Please log in again.');
    }
    
    if (message.user) {
      showDashboard({ user: message.user });
    } else {
      showLogin();
    }
  } else if (message.action === 'usageUpdated') {
    console.log('Usage updated');
    // Refresh stats
    getAuthState().then((authState) => {
      if (authState && authState.user) {
        showDashboard(authState);
      }
    });
  }
});

// =============================================================================
// PRESENTATION LAYER — theme, settings panel, status badge
// (purely visual; does not touch auth, stats, or backend logic)
// =============================================================================

const THEME_KEY = 'uiTheme'; // 'auto' | 'light' | 'dark'
const _prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return _prefersDark.matches ? 'dark' : 'light';
}

function applyTheme(pref) {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref));
  if (themeSegment) {
    themeSegment.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.themeValue === pref);
    });
  }
}

async function initTheme() {
  let pref = 'auto';
  try {
    const stored = await chrome.storage.local.get([THEME_KEY]);
    if (stored[THEME_KEY]) pref = stored[THEME_KEY];
  } catch (_) { /* default auto */ }
  applyTheme(pref);

  // React to OS theme changes while in 'auto'
  _prefersDark.addEventListener('change', async () => {
    try {
      const s = await chrome.storage.local.get([THEME_KEY]);
      if ((s[THEME_KEY] || 'auto') === 'auto') applyTheme('auto');
    } catch (_) {}
  });

  if (themeSegment) {
    themeSegment.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const value = btn.dataset.themeValue || 'auto';
        applyTheme(value);
        try { await chrome.storage.local.set({ [THEME_KEY]: value }); } catch (_) {}
      });
    });
  }
}

function initSettingsPanel() {
  if (!settingsBtn || !settingsPanel) return;
  settingsBtn.addEventListener('click', () => {
    const open = settingsPanel.classList.toggle('open');
    settingsBtn.setAttribute('aria-expanded', String(open));
  });
}

async function syncStatusBadge() {
  if (!statusBadge || !statusBadgeText) return;
  let enabled = true;
  try {
    const { extensionEnabled } = await chrome.storage.local.get(['extensionEnabled']);
    enabled = extensionEnabled !== false;
  } catch (_) {}
  statusBadge.classList.toggle('is-off', !enabled);
  statusBadgeText.textContent = enabled ? 'Active' : 'Off';
}

function initFooterLink() {
  if (!dashboardBtnFooter) return;
  dashboardBtnFooter.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: getDashboardUrl() });
  });
}

// Keep the popup live when relevant storage changes elsewhere (e.g. the website
// pushes a fresh token while the popup is open). This is a backstop to the
// runtime `authStateChanged` message — whichever fires first updates the view.
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.extensionEnabled) syncStatusBadge();

    // Auth token added/refreshed → switch to dashboard.
    if (changes.authToken) {
      const newToken = changes.authToken.newValue;
      if (newToken) {
        getAuthState().then((authState) => {
          if (authState && authState.user) showDashboard(authState);
        });
      } else {
        // Token removed → back to login.
        showLogin();
      }
    }
  });
} catch (_) {}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  init();          // existing auth/stats flow (unchanged)
  initTheme();     // theme system
  initSettingsPanel();
  initFooterLink();
  syncStatusBadge();
});
