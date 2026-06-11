/**
 * CorrectNow Content Script
 * Injects grammar checking functionality into webpages
 * - Detects input/textarea focus
 * - Shows floating "Check with CorrectNow" button
 * - Communicates with background.js for API calls
 * - Highlights grammar errors with yellow background
 */

// Inject extension ID into CorrectNow website for authentication
// This must happen IMMEDIATELY at document_start
(function injectExtensionId() {
  const hostname = window.location.hostname;
  const href = window.location.href;

  // Check if we're on the correct domain (supports localhost on any port).
  // IMPORTANT: with all_frames:true this IIFE runs in every iframe on every
  // site, so we return SILENTLY off-domain — no logging — to avoid console
  // spam and wasted work on third-party pages and ad frames.
  const isCorrectDomain = hostname === 'correctnow.app' ||
                          hostname === 'localhost' ||
                          hostname === '127.0.0.1' ||
                          hostname.endsWith('.correctnow.app');

  if (!isCorrectDomain) {
    return;
  }

  console.log('[CorrectNow Extension] ✅ On CorrectNow domain, proceeding with auth injection');
  console.log('[CorrectNow Extension] Hostname:', hostname, '| URL:', href);
  
  try {
    const extensionId = chrome.runtime.id;
    console.log('[CorrectNow Extension] 🔑 Extension ID:', extensionId);
    
    // Method 1: Set directly in content script world
    window.__CORRECTNOW_EXTENSION_ID = extensionId;
    console.log('[CorrectNow Extension] ✅ Method 1: Set in content script world');
    
    // Method 2: Inject bridge file into main world via external script src (CSP-safe)
    const script = document.createElement('script');
    script.id = 'correctnow-extension-id-injector';
    script.src = chrome.runtime.getURL('injected-extension-id.js');
    script.dataset.extensionId = extensionId;
    script.async = false;
    
    // Inject as early as possible
    const targetElement = document.head || document.documentElement;
    if (targetElement) {
      targetElement.appendChild(script);
      console.log('[CorrectNow Extension] ✅ Method 2: Injected into', targetElement.tagName);
      script.onload = () => script.remove();
      script.onerror = () => {
        console.error('[CorrectNow Extension] ❌ Bridge script failed to load');
        script.remove();
      };
    } else {
      console.warn('[CorrectNow Extension] ⚠️ No head or documentElement yet, will retry');
      // Retry after a tiny delay
      setTimeout(() => {
        const el = document.head || document.documentElement || document.body;
        if (el) {
          el.appendChild(script);
          script.onload = () => script.remove();
          script.onerror = () => {
            console.error('[CorrectNow Extension] ❌ Bridge script failed to load after retry');
            script.remove();
          };
          console.log('[CorrectNow Extension] ✅ Method 2: Injected after retry');
        }
      }, 10);
    }
    
    // Method 3: Listen for requests from the page
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'REQUEST_EXTENSION_ID') {
        console.log('[CorrectNow Extension] 📨 Received REQUEST_EXTENSION_ID message');
        window.postMessage({
          type: 'EXTENSION_ID_RESPONSE',
          extensionId: extensionId
        }, '*');
        console.log('[CorrectNow Extension] ✅ Sent EXTENSION_ID_RESPONSE');
      }
    });
    
    console.log('[CorrectNow Extension] ✅ All injection methods completed');
    console.log('[CorrectNow Extension] ========================================');
    
  } catch (error) {
    console.error('[CorrectNow Extension] ❌ CRITICAL ERROR during injection:', error);
    console.error('[CorrectNow Extension] Stack:', error.stack);
  }
})();

// Configuration
const CONFIG = {
  API_BASE_URL: 'https://correctnow.app', // Production API URL (deployed backend)
  EXTENSION_TOKEN: 'CORRECTNOW_CHROME_EXTENSION_V1', // Extension identifier (not sensitive)
  BUTTON_TEXT: 'Check',
  BUTTON_SIZE: 38,
  BUTTON_ICON: 'android-chrome-512x512.png',
  BUTTON_CLASS: 'correctnow-check-button',
  HIGHLIGHT_CLASS: 'correctnow-error-highlight',
  MESSAGE_CLASS: 'correctnow-message',
  DEFAULT_LANGUAGE: 'auto', // Default to auto-detect
};

let currentFocusedElement = null;
let floatingButton = null;
let floatingButtonElement = null; // The actual button inside the container
let applyAllButton = null; // Apply All button
let highlightedRanges = [];
let originalContent = null; // Store original content for restoration
let isCheckingInProgress = false; // Prevent concurrent checks
let hoverTooltip = null; // Hover correction tooltip
let tooltipHideTimeout = null; // Tooltip hide timeout
let currentErrors = []; // Store errors for correction
let lastCheckedText = ''; // Store last checked text to align offsets
let lastCorrectedText = ''; // Store last corrected text to prevent re-checking
let lastApiCorrectedText = ''; // Authoritative full corrected text returned by API (used by Apply All)
let buttonIdleHideTimer = null;

const BUTTON_IDLE_HIDE_MS = 15000;

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setFloatingButtonIcon(button, isLoading = false) {
  if (!button) return;

  if (isLoading) {
    button.innerHTML = '<span style="display:inline-block;animation:correctnow-spin 0.9s linear infinite;font-size:16px;line-height:1;color:#2563eb;">⟳</span>';
    return;
  }

  const iconUrl = chrome.runtime.getURL(CONFIG.BUTTON_ICON);
  button.innerHTML = `<img src="${iconUrl}" alt="CorrectNow" style="width:26px;height:26px;display:block;border-radius:999px;object-fit:cover;pointer-events:none;" />`;
}

function clearButtonIdleTimer() {
  if (buttonIdleHideTimer) {
    clearTimeout(buttonIdleHideTimer);
    buttonIdleHideTimer = null;
  }
}

function hideFloatingButton() {
  clearButtonIdleTimer();
  if (floatingButton) {
    floatingButton.style.display = 'none';
    floatingButton.style.opacity = '0';
    // Drop the entrance class so it can replay next time the button appears.
    if (floatingButtonElement) floatingButtonElement.classList.remove('correctnow-entrance');
  }
}

function scheduleIdleHide() {
  clearButtonIdleTimer();
  buttonIdleHideTimer = setTimeout(() => {
    if (isCheckingInProgress) return;
    const active = document.activeElement;
    const stillEditing = !!(active && isEditableField(active));
    // Only hide on idle if the user has moved focus AWAY from any editable field.
    // While still focused in editor, keep the button visible so it's always clickable.
    if (!stillEditing) {
      hideFloatingButton();
    }
  }, BUTTON_IDLE_HIDE_MS);
}


/**
 * Inject the floating button's design system (once). A white disc wrapped in a
 * slowly rotating conic-gradient ring, with a soft breathing brand glow,
 * spring-in entrance, and a satisfying hover lift.
 */
function injectButtonStyles() {
  if (document.getElementById('correctnow-button-style')) return;
  const style = document.createElement('style');
  style.id = 'correctnow-button-style';
  style.textContent = `
    @keyframes correctnow-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes correctnow-ring-spin { to { transform: rotate(360deg); } }
    @keyframes correctnow-pop {
      0%   { transform: scale(.3) translateY(6px); opacity: 0; }
      55%  { transform: scale(1.12) translateY(-1px); opacity: 1; }
      78%  { transform: scale(.96); }
      100% { transform: scale(1) translateY(0); opacity: 1; }
    }
    @keyframes correctnow-breathe {
      0%,100% { box-shadow: 0 4px 14px rgba(37,99,235,.30), 0 0 0 0 rgba(99,102,241,.0); }
      50%     { box-shadow: 0 7px 20px rgba(37,99,235,.45), 0 0 0 6px rgba(99,102,241,.10); }
    }
    .${CONFIG.BUTTON_CLASS} {
      position: relative;
      isolation: isolate;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: #ffffff;
      cursor: pointer;
      pointer-events: auto;
      user-select: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: correctnow-breathe 3.4s ease-in-out infinite;
      transition: transform .22s cubic-bezier(.34,1.56,.64,1), filter .22s ease;
      will-change: transform;
    }
    /* Rotating conic gradient ring */
    .${CONFIG.BUTTON_CLASS}::before {
      content: '';
      position: absolute;
      inset: -2.5px;
      border-radius: 999px;
      z-index: -1;
      background: conic-gradient(from 0deg, #2563eb, #7c3aed, #06b6d4, #2563eb);
      animation: correctnow-ring-spin 3.2s linear infinite;
    }
    /* Glossy inner highlight */
    .${CONFIG.BUTTON_CLASS}::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 999px;
      z-index: 1;
      background: radial-gradient(120% 120% at 30% 22%, rgba(255,255,255,.9), rgba(255,255,255,0) 55%);
      pointer-events: none;
    }
    .${CONFIG.BUTTON_CLASS} > * { position: relative; z-index: 2; }
    .${CONFIG.BUTTON_CLASS}:hover {
      transform: translateY(-2px) scale(1.08);
      filter: drop-shadow(0 6px 12px rgba(37,99,235,.35));
    }
    .${CONFIG.BUTTON_CLASS}:hover::before { animation-duration: 1.1s; }
    .${CONFIG.BUTTON_CLASS}:active { transform: translateY(0) scale(.96); }
    .${CONFIG.BUTTON_CLASS}.correctnow-entrance { animation: correctnow-pop .42s cubic-bezier(.34,1.56,.64,1), correctnow-breathe 3.4s ease-in-out infinite .42s; }
    @media (prefers-reduced-motion: reduce) {
      .${CONFIG.BUTTON_CLASS}, .${CONFIG.BUTTON_CLASS}::before, .${CONFIG.BUTTON_CLASS}.correctnow-entrance { animation: none !important; }
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

/** Replay the spring-in entrance animation each time the button is shown. */
function playButtonEntrance() {
  if (!floatingButtonElement) return;
  floatingButtonElement.classList.remove('correctnow-entrance');
  // Force reflow so the animation restarts even if the class was just removed.
  void floatingButtonElement.offsetWidth;
  floatingButtonElement.classList.add('correctnow-entrance');
}

/**
 * Create and position the floating button
 */
function createFloatingButton() {
  const container = document.createElement('div');
  container.className = 'correctnow-button-container';
  container.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    display: block;
  `;

  // Create button
  const button = document.createElement('button');
  button.className = CONFIG.BUTTON_CLASS;
  setFloatingButtonIcon(button, false);
  button.type = 'button';
  button.title = 'Check grammar with CorrectNow';
  button.setAttribute('aria-label', 'Check grammar with CorrectNow');

  // The button is a white disc; the eye-catching part is a rotating conic
  // gradient ring (::before) + a soft brand glow that gently "breathes".
  button.style.width = `${CONFIG.BUTTON_SIZE}px`;
  button.style.height = `${CONFIG.BUTTON_SIZE}px`;

  injectButtonStyles();

  console.log('🔷 Button created');

  // Prevent the underlying input from losing focus when clicking the button
  button.addEventListener('mousedown', (e) => { e.preventDefault(); });
  button.addEventListener('pointerdown', (e) => { e.preventDefault(); });

  // Click handler with immediate logging
  button.addEventListener('click', (e) => {
    console.log('🟢 BUTTON CLICKED - Event captured!', e);
    e.preventDefault();
    e.stopPropagation();
    handleCheckClick();
  }, true);

  container.appendChild(button);
  
  // Store reference to button element for later use
  floatingButtonElement = button;

  return container;
}

/**
 * Position the button near the focused element
 */
function positionButton(element, container) {
  const rect = element.getBoundingClientRect();
  const buttonSize = CONFIG.BUTTON_SIZE;
  const inset = 6;
  const minPad = 6;

  // Position: right-most bottom inside the input box.
  let top = rect.bottom - buttonSize - inset;
  let left = rect.right - buttonSize - inset;

  if (top < minPad) top = minPad;
  if (left < minPad) left = minPad;
  if (top + buttonSize + minPad > window.innerHeight) {
    top = Math.max(minPad, window.innerHeight - buttonSize - minPad);
  }
  if (left + buttonSize + minPad > window.innerWidth) {
    left = Math.max(minPad, window.innerWidth - buttonSize - minPad);
  }

  container.style.top = `${Math.round(top)}px`;
  container.style.left = `${Math.round(left)}px`;
}

/**
 * Show floating button on input/textarea focus
 */
function handleFocus(event) {
  // composedPath() lets us see inside shadow DOM (Notion, Slack, etc.)
  const path = (event.composedPath && event.composedPath()) || [];
  const element = path[0] || event.target;

  // Only attach to textarea and text inputs
  if (!isEditableField(element)) return;
  
  // Check if extension is enabled
  if (!chrome?.runtime?.id) {
    console.warn('⚠️ Extension context invalidated in handleFocus');
    return;
  }

  chrome.storage.local.get(['extensionEnabled'], (result) => {
    if (chrome.runtime.lastError) {
      console.warn('⚠️ Could not read extension state in handleFocus:', chrome.runtime.lastError.message);
      return;
    }
    const isEnabled = result.extensionEnabled !== false; // default to true
    
    if (!isEnabled) {
      console.log('🔷 Extension is disabled, not showing button');
      return;
    }

    // Clear previous highlights only when focusing a DIFFERENT field.
    // Re-focusing the same field (e.g. user clicked away and back) must
    // preserve underlines and the Apply button so the workflow isn't lost.
    if (currentFocusedElement && currentFocusedElement !== element) {
      clearHighlights();
    }

    // For Gmail and similar editors, find the main compose container
    let targetElement = element;
    if (element.isContentEditable) {
      // Walk up the tree to find the root contentEditable container
      let parent = element.parentElement;
      while (parent && parent.isContentEditable) {
        targetElement = parent;
        parent = parent.parentElement;
      }
      console.log('🎯 Found compose container:', targetElement.className || targetElement.tagName);
    }

    // Store focused element
    currentFocusedElement = targetElement;

    // Create button if it doesn't exist
    if (!floatingButton || !document.body.contains(floatingButton)) {
      console.log('🔷 Creating new button');
      floatingButton = createFloatingButton();
      document.body.appendChild(floatingButton);
    } else {
      console.log('🔷 Reusing existing button');
    }

    // Position and show button
    const wasHidden = floatingButton.style.display === 'none' || floatingButton.style.opacity === '0';
    positionButton(targetElement, floatingButton);
    floatingButton.style.display = 'block';
    floatingButton.style.opacity = '1';
    if (wasHidden) playButtonEntrance(); // spring-in only when (re)appearing
    scheduleIdleHide();
    console.log('🔷 Button shown at position:', floatingButton.style.left, floatingButton.style.top);
  });
}

/**
 * Hide floating button on blur
 */
function handleBlur() {
  // RELIABILITY: don't trust event.relatedTarget (it's frequently null, and
  // misses tab-away / scrollbar / programmatic focus changes — the cause of the
  // "button won't disappear" bug). Instead, defer one tick so focus settles,
  // then decide from the REAL active element. Keep the button only if focus is
  // still inside an editable field or moved into our own UI; otherwise hide.
  setTimeout(() => {
    if (isCheckingInProgress) return; // never yank the button mid-check
    const active = document.activeElement;
    if (active && (isEditableField(active) || isClickInsideExtension(active))) return;
    hideFloatingButton();
    // Note: do NOT null currentFocusedElement here — post-check actions
    // (Apply All, tooltip Apply) still need to target the correct field.
  }, 80);
}

/**
 * Check if element is an editable field
 */
function isEditableField(element) {
  if (!element || !element.tagName) return false;
  if (element.tagName === 'TEXTAREA') return true;
  if (element.tagName === 'INPUT') {
    const t = (element.type || 'text').toLowerCase();
    return ['text', 'email', 'search', 'url', 'tel', 'number', 'password'].includes(t);
  }
  if (element.isContentEditable) return true;
  // Attribute-level check (catches elements where property hasn't propagated)
  const ce = element.getAttribute && element.getAttribute('contenteditable');
  if (ce === 'true' || ce === '') return true;
  // ARIA roles used by rich-text editors (Notion, Slack, Docs, etc.)
  const role = element.getAttribute && element.getAttribute('role');
  if (role === 'textbox' || role === 'combobox') return true;
  if (element.getAttribute && element.getAttribute('aria-multiline') === 'true') return true;
  return false;
}

/**
 * Handle "Check with CorrectNow" button click
 */
function handleCheckClick() {
  console.log('🔵 Button clicked');
  
  // Prevent concurrent checks
  if (isCheckingInProgress) {
    console.log('⏳ Check already in progress, skipping');
    return;
  }
  
  if (!currentFocusedElement) {
    console.log('❌ No focused element');
    return;
  }

  // Extract text based on element type
  let text;
  if (currentFocusedElement.value !== undefined) {
    // textarea or input
    text = currentFocusedElement.value;
  } else if (currentFocusedElement.textContent !== undefined) {
    // contentEditable div (Gmail, etc.)
    text = currentFocusedElement.textContent;
  } else if (currentFocusedElement.innerText !== undefined) {
    // fallback
    text = currentFocusedElement.innerText;
  } else {
    text = '';
  }
  
  console.log('📝 Text extracted:', text ? text.substring(0, 50) + '...' : '(empty)');
  console.log('📝 Text length:', text ? text.length : 0);

  if (!text || text.trim() === '') {
    showMessage('Please enter some text to check', 'warning');
    console.log('⚠️ Text is empty');
    return;
  }

  // Check if this is the same text we just corrected - skip checking
  if (lastCorrectedText && text === lastCorrectedText) {
    console.log('✅ Text was just corrected, skipping check');
    showMessage('No issues found', 'success');
    return;
  }

  // Store the exact text sent to the API for accurate highlighting
  lastCheckedText = text;

  // Clear any previous highlights before starting new check
  clearHighlights();

  // Show loading state
  clearButtonIdleTimer();
  isCheckingInProgress = true;
  if (floatingButtonElement) {
    floatingButtonElement.disabled = true;
    setFloatingButtonIcon(floatingButtonElement, true);
    floatingButtonElement.style.opacity = '0.92';
  }
  console.log('⏳ Sending message to service worker...');
  console.log('📤 API Base URL:', CONFIG.API_BASE_URL);

  // Timeout to reset button if no response (10 seconds)
  let checkTimeout;
  const resetButton = () => {
    isCheckingInProgress = false;
    if (floatingButtonElement) {
      floatingButtonElement.disabled = false;
      setFloatingButtonIcon(floatingButtonElement, false);
      floatingButtonElement.style.opacity = '1';
    }

    // Re-arm idle hide only when editor is still focused.
    const active = document.activeElement;
    if (active && isEditableField(active)) {
      scheduleIdleHide();
    } else {
      hideFloatingButton();
    }
  };

  checkTimeout = setTimeout(() => {
    console.error('❌ Check timeout - no response after 60 seconds');
    showMessage('Request timed out. API might be slow or rate-limited. Wait a few minutes and try again.', 'error');
    resetButton();
  }, 60000);

  // Get auth token and backend mode from storage (if user is logged in)
  if (!chrome?.runtime?.id) {
    showMessage('Extension context invalidated. Reload the page and try again.', 'error');
    resetButton();
    return;
  }

  chrome.storage.local.get(['authToken', 'authUser', 'backendApiBase'], (storageData) => {
    if (chrome.runtime.lastError) {
      console.warn('⚠️ Could not read auth/backend state:', chrome.runtime.lastError.message);
      showMessage('Extension state unavailable. Please reload extension.', 'error');
      resetButton();
      return;
    }

    const authToken = storageData.authToken || null;
    const authUser = storageData.authUser || null;
    const userId = authUser ? (authUser.uid || authUser.id) : null;
    const apiBase = (storageData.backendApiBase || CONFIG.API_BASE_URL || '').trim();

    console.log('🔑 Auth status:', authToken ? 'Logged in' : 'Guest');
    console.log('👤 User:', authUser ? authUser.email : 'Guest');

    // Send message to background.js
    chrome.runtime.sendMessage(
      {
        action: 'checkGrammar',
        text: text,
        apiBase,
        apiKey: CONFIG.EXTENSION_TOKEN, // Extension access token (for guest users)
        authToken: authToken, // Firebase auth token (for logged-in users)
        userId: userId, // User ID (for usage tracking)
      },
      (response) => {
        // MUST check lastError first — reading it clears the pending error flag
        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError;
          console.error('❌ Runtime error:', error);
          clearTimeout(checkTimeout);
          resetButton();
          showMessage('Extension error: ' + error.message + ' — try reloading the page.', 'error');
          return;
        }

        clearTimeout(checkTimeout);
        console.log('📥 Response received:', response);
        resetButton();

      if (!response) {
        console.log('❌ No response');
        showMessage('No response from API', 'error');
        return;
      }

      if (response.error) {
        console.error('❌ API error:', response.error);
        // Show actionable message for auth/upgrade errors
        if (response.requiresAuth) {
          showMessage('Sign in to CorrectNow to check grammar. Click the extension icon → Sign In.', 'warning');
        } else if (response.requiresUpgrade) {
          showMessage('Daily free limit reached. Upgrade to Pro for unlimited checks.', 'warning');
        } else {
          showMessage(`Error: ${response.error}`, 'error');
        }
        return;
      }

      // Store authoritative corrected text for Apply All (matches website behavior)
      lastApiCorrectedText = typeof response.correctedText === 'string' ? response.correctedText : '';

      if (response.errors && response.errors.length > 0) {
        console.log('📨 Raw API response errors:', response.errors);
        
        // Use API positions directly (clamped) and realign using `original` when provided
        const fullText = lastCheckedText || (currentFocusedElement.value !== undefined
          ? currentFocusedElement.value
          : (currentFocusedElement.textContent || currentFocusedElement.innerText || ''));
        const fixedErrors = [];
        
        response.errors.forEach(err => {
          if (!err.suggestion || err.start === undefined || err.end === undefined) return;

          const clampedStart = Math.max(0, Math.min(err.start, fullText.length));
          const clampedEnd = Math.max(clampedStart, Math.min(err.end, fullText.length));

          if (clampedEnd <= clampedStart) {
            console.log('⚠️ Skipping error with invalid range:', err);
            return;
          }

          let start = clampedStart;
          let end = clampedEnd;

          // Extract what's at the API position
          const textAtPosition = fullText.substring(clampedStart, clampedEnd).trim();
          const original = typeof err.original === 'string' ? err.original.trim() : '';
          
          // Get surrounding context for debugging
          const beforeChar = clampedStart > 0 ? fullText[clampedStart - 1] : '';
          const afterChar = clampedEnd < fullText.length ? fullText[clampedEnd] : '';

          console.log(`📍 API position [${clampedStart}-${clampedEnd}]: "${textAtPosition}", original: "${original}", suggestion: "${err.suggestion}", before: "${beforeChar}", after: "${afterChar}"`);

          // Strategy 1: If original field provided and it's in the text, use ONLY the API position
          // Don't look for all occurrences - just use what API told us
          if (original && original.length > 0) {
            // Use the exact position from API
            const textAtApiPos = fullText.substring(clampedStart, clampedEnd);
            if (textAtApiPos === original || textAtApiPos.trim() === original) {
              start = clampedStart;
              end = clampedEnd;
              console.log(`✅ Using API position for "${original}" at [${start}-${end}]`);
            }
          }

          // Strategy 2: If original wasn't found or not provided, use exact API positions
          // This handles punctuation errors like ".." -> "."
          if (start === clampedStart && end === clampedEnd) {
            // Check if this is a punctuation/whitespace error
            const textAtPos = fullText.substring(clampedStart, clampedEnd);
            const isPunctuation = /^[^\w\s]*$/.test(textAtPos) || /^\s+$/.test(textAtPos);
            
            if (isPunctuation) {
              // For punctuation errors, use exact API positions
              start = clampedStart;
              end = clampedEnd;
              console.log(`✅ Using exact API position for punctuation: "${textAtPos}" at [${start}-${end}]`);
            } else {
              // For word errors, try word boundary expansion (only for languages using Latin alphabet)
              let wordStart = clampedStart;
              while (wordStart > 0 && /\p{L}/u.test(fullText[wordStart - 1])) {
                wordStart--;
              }

              let wordEnd = clampedEnd;
              while (wordEnd < fullText.length && /\p{L}/u.test(fullText[wordEnd])) {
                wordEnd++;
              }

              const wordAtPosition = fullText.substring(wordStart, wordEnd);

              // If we found a valid word and it's different from what API suggested
              if (wordAtPosition && wordAtPosition.length > 0 &&
                  wordAtPosition.toLowerCase() !== err.suggestion.toLowerCase()) {
                start = wordStart;
                end = wordEnd;
                console.log(`✅ Expanded to word boundaries: "${wordAtPosition}" at [${start}-${end}]`);
              } else {
                // If word boundary expansion gave us the same as suggestion, skip this error
                console.log(`⚠️ Word boundary expansion matched suggestion, skipping`);
                return;
              }
            }
          }

          // Get the actual text that will be underlined (DON'T trim for punctuation)
          const actualText = fullText.substring(start, end);
          const suggestionTrimmed = err.suggestion.trim();
          const actualTrimmed = actualText.trim();

          // Skip if the actual text and suggestion are the same (case-insensitive)
          if (actualTrimmed.toLowerCase() === suggestionTrimmed.toLowerCase()) {
            console.log(`⚠️ Skipping error: actual text "${actualTrimmed}" matches suggestion "${suggestionTrimmed}"`);
            return;
          }

          // For punctuation, don't do substring checks
          const isPunctuationError = /^[^\w\s]*$/.test(actualText) || /^\s+$/.test(actualText);
          
          if (!isPunctuationError) {
            // Skip only when suggestion is wildly longer than the actual text
            const lengthRatio = suggestionTrimmed.length / Math.max(1, actualTrimmed.length);
            if (lengthRatio >= 4) {
              console.log(`⚠️ Skipping error: suggestion "${suggestionTrimmed}" too long for "${actualTrimmed}" (ratio ${lengthRatio.toFixed(2)})`);
              return;
            }
          }

          // Skip if suggestion doesn't make sense (is a substring of a longer suggestion for different range)
          if (suggestionTrimmed.length > 100) {
            console.log(`⚠️ Skipping error: suggestion too long (${suggestionTrimmed.length} chars)`);
            return;
          }

          // Skip very short matches (1-2 chars) unless it's punctuation or a clear typo
          if (!isPunctuationError && actualTrimmed.length <= 2 && suggestionTrimmed.length > 6) {
            console.log(`⚠️ Skipping error: actualText too short ("${actualTrimmed}") for long suggestion "${suggestionTrimmed}"`);
            return;
          }

          const normalizedActual = actualTrimmed.toLowerCase();
          const normalizedSuggestion = suggestionTrimmed.toLowerCase();
          const nearDuplicate = fixedErrors.some(existing => {
            const existingActual = (fullText.substring(existing.start, existing.end) || '').trim().toLowerCase();
            const existingSuggestion = (existing.suggestion || '').trim().toLowerCase();
            const sameText = normalizedActual && existingActual && normalizedActual === existingActual;
            const sameSuggestion = normalizedSuggestion && existingSuggestion && normalizedSuggestion === existingSuggestion;
            // More strict: exact position match, not just "close"
            const samePosition = start === existing.start && end === existing.end;
            return sameText && sameSuggestion && samePosition;
          });

          if (nearDuplicate) {
            console.log(`⚠️ Skipping near-duplicate suggestion for "${actualTrimmed}" at [${start}-${end}]`);
            return;
          }
          
          // Check for exact overlapping positions with same suggestion (strict check)
          const hasExactOverlap = fixedErrors.some(existing => {
            const sameRange = start === existing.start && end === existing.end;
            const sameSuggestion = suggestionTrimmed.toLowerCase() === (existing.suggestion || '').trim().toLowerCase();
            if (sameRange && sameSuggestion) {
              console.log(`⚠️ Exact duplicate: same range [${start}-${end}] and suggestion "${suggestionTrimmed}"`);
              return true;
            }
            return false;
          });
          
          if (hasExactOverlap) {
            console.log(`⚠️ Skipping exact duplicate at [${start}-${end}]`);
            return;
          }

          fixedErrors.push({
            ...err,
            start,
            end,
            type: err.type || 'spelling',
            message: err.message || 'Spelling error',
            suggestion: err.suggestion,
          });
        });
        
        console.log('✅ Errors with corrected positions:', fixedErrors);
        
        if (fixedErrors.length > 0) {
          highlightErrors(currentFocusedElement, fixedErrors);
          showMessage(`Found ${fixedErrors.length} issue(s)`, 'info');

          // Show Apply All whenever there are errors — works for all field types
          // since the overlay approach supports individual accepts on every type.
          showApplyAllButton();
        } else {
          clearHighlights();
          showMessage('No issues found', 'success');
        }
      } else {
        console.log('✅ No errors found');
        clearHighlights(); // Clear any previous highlights
        showMessage('No issues found', 'success');
      }
    }
  ); // End chrome.runtime.sendMessage
  }); // End chrome.storage.local.get
}

/**
 * Highlight grammar errors using the universal overlay system.
 * Never modifies the editor's DOM — works on all websites.
 *   • textarea / input  → transparent mirror overlay with underlined spans
 *   • contentEditable   → Range-pixel overlay (underline + highlight divs)
 */
function highlightErrors(element, errors) {
  clearHighlights();
  currentErrors = errors;

  const isTextInput = element.tagName === 'TEXTAREA' || element.tagName === 'INPUT';
  console.log('📍 Highlighting', errors.length, 'errors via overlay on', element.tagName);

  if (isTextInput) {
    _createInputOverlay(element, errors);
  } else {
    // contentEditable (any framework — Gmail, Notion, Tiptap, ProseMirror, …)
    _createCEOverlay(element, errors);
  }

  highlightedRanges.push(element);
}

/**
 * Clear all highlights — removes overlays, never touches editor DOM.
 */
function clearHighlights() {
  highlightedRanges.forEach((element) => {
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      _removeInputOverlay(element);
      // Remove legacy yellow-border styling if any
      element.style.borderColor = '';
      element.style.borderWidth = '';
      element.style.outline    = '';
      element.style.boxShadow  = '';
    } else {
      _removeCEOverlay(element);
      // Remove any old injected spans left from a previous session
      element.querySelectorAll('.correctnow-error-span').forEach(span => {
        span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
      });
      element.normalize();
      originalContent = null;
    }
  });
  highlightedRanges = [];
  currentErrors = [];
  hideCorrectionTooltip();
  hideApplyAllButton();
  lastCorrectedText = '';
}

/**
 * Create and show Apply All button
 */
function showApplyAllButton() {
  if (!applyAllButton) {
    _ensureUIStyles();
    applyAllButton = document.createElement('button');
    applyAllButton.setAttribute('data-correctnow-ui', 'true');
    applyAllButton.innerHTML =
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20 6 9 17l-5-5"/></svg>` +
      `<span>Apply All</span>`;
    applyAllButton.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 10px 18px;
      background: linear-gradient(135deg, #2563eb 0%, #6366f1 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 13.5px;
      font-weight: 600;
      letter-spacing: -0.2px;
      cursor: pointer;
      box-shadow: 0 8px 22px rgba(37, 99, 235, 0.35), 0 2px 6px rgba(37, 99, 235, 0.25);
      transition: transform 0.18s cubic-bezier(.34,1.56,.64,1), box-shadow 0.18s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      white-space: nowrap;
      visibility: hidden;
      animation: correctnow-pop .2s cubic-bezier(.34,1.56,.64,1);
    `;

    applyAllButton.addEventListener('mouseenter', () => {
      applyAllButton.style.transform = 'translateY(-2px)';
      applyAllButton.style.boxShadow = '0 12px 28px rgba(37, 99, 235, 0.45), 0 3px 8px rgba(37, 99, 235, 0.3)';
    });

    applyAllButton.addEventListener('mouseleave', () => {
      applyAllButton.style.transform = 'translateY(0)';
      applyAllButton.style.boxShadow = '0 8px 22px rgba(37, 99, 235, 0.35), 0 2px 6px rgba(37, 99, 235, 0.25)';
    });

    // Prevent underlying input from losing focus when clicking Apply All
    applyAllButton.addEventListener('mousedown', (e) => { e.preventDefault(); });
    applyAllButton.addEventListener('pointerdown', (e) => { e.preventDefault(); });

    applyAllButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyAllCorrections();
    });
    
    document.body.appendChild(applyAllButton);
    console.log('✅ Apply All button created and shown');
  }

  applyAllButton.style.display = 'block';
  applyAllButton.style.visibility = 'visible';

  // Measure after in DOM so we can clamp without cutting off text
  const buttonRect = applyAllButton.getBoundingClientRect();
  const minPad = 10;
  const margin = 12;
  const btnWidth = buttonRect.width || 0;
  const btnHeight = buttonRect.height || 0;

  if (floatingButton) {
    const rect = floatingButton.getBoundingClientRect();
    // Position to the right of the floating button instead of above/below
    let top = rect.top;
    let left = rect.right + margin;

    // If doesn't fit on right, try below the button
    if (left + btnWidth + minPad > window.innerWidth) {
      left = rect.left;
      top = rect.bottom + margin;
    }
    
    // If doesn't fit below, try above
    if (top + btnHeight + minPad > window.innerHeight) {
      top = rect.top - btnHeight - margin;
    }
    
    // Final fallback: top of button, left position
    if (top < minPad) {
      top = rect.top;
      left = rect.left;
    }

    // Clamp horizontally so the button stays fully visible
    if (left + btnWidth + minPad > window.innerWidth) {
      left = Math.max(minPad, window.innerWidth - btnWidth - minPad);
    }
    if (left < minPad) {
      left = minPad;
    }

    applyAllButton.style.top = `${Math.round(top)}px`;
    applyAllButton.style.left = `${Math.round(left)}px`;
    applyAllButton.style.right = 'auto';
    applyAllButton.style.bottom = 'auto';
    applyAllButton.style.minWidth = `${Math.max(rect.width, btnWidth)}px`;
  } else {
    // Fallback position if button not available
    applyAllButton.style.top = 'auto';
    applyAllButton.style.right = 'auto';
    applyAllButton.style.left = `${minPad}px`;
    applyAllButton.style.bottom = '80px';
    applyAllButton.style.minWidth = '180px';
  }

  applyAllButton.style.visibility = 'visible';
}

/**
 * Hide Apply All button
 */
function hideApplyAllButton() {
  if (applyAllButton) {
    applyAllButton.style.display = 'none';
    applyAllButton.style.visibility = 'hidden';
  }
}

/**
 * Apply a text correction to a contentEditable element using the Range API.
 * This preserves surrounding HTML formatting (bold, italic, links, etc.)
 * unlike setting textContent which strips all markup.
 */
function applyRangeCorrection(element, start, end, replacement) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
  let charIndex = 0;
  let startNode = null, startOffset = 0;
  let endNode = null, endOffset = 0;
  let node;
  while ((node = walker.nextNode())) {
    const len = node.nodeValue.length;
    if (startNode === null && charIndex + len > start) {
      startNode = node;
      startOffset = start - charIndex;
    }
    if (endNode === null && charIndex + len >= end) {
      endNode = node;
      endOffset = end - charIndex;
    }
    if (startNode && endNode) break;
    charIndex += len;
  }
  if (!startNode || !endNode) return false;
  try {
    const range = document.createRange();
    range.setStart(startNode, Math.min(startOffset, startNode.nodeValue.length));
    range.setEnd(endNode, Math.min(endOffset, endNode.nodeValue.length));
    range.deleteContents();
    if (replacement) range.insertNode(document.createTextNode(replacement));
    element.normalize();
    return true;
  } catch (e) {
    console.error('[CorrectNow] Range correction failed:', e);
    return false;
  }
}

/**
 * Apply all corrections at once
 */
function applyAllCorrections() {
  console.log('✅ Applying all corrections. Current errors:', currentErrors.length);
  
  if (!currentFocusedElement) {
    console.log('❌ No focused element');
    return;
  }
  
  if (currentErrors.length === 0) {
    console.log('❌ No errors in currentErrors array');
    return;
  }
  
  const sourceText = lastCheckedText || (currentFocusedElement.value !== undefined
    ? currentFocusedElement.value
    : (currentFocusedElement.textContent || currentFocusedElement.innerText || ''));

  if (!sourceText) {
    console.log('❌ No source text available for Apply All');
    return;
  }

  const isInputField = currentFocusedElement.value !== undefined;

  // FAST PATH (inputs/textarea ONLY): if we have the API's authoritative
  // corrected text AND the field still matches what we checked, apply it
  // directly. This matches the website's "Accept All" and captures any
  // LLM-added punctuation not enumerated as a change.
  //
  // We intentionally DO NOT use this path for contentEditable: assigning
  // textContent would flatten all rich formatting (bold, links, line breaks)
  // — catastrophic in Gmail/Outlook. ContentEditable falls through to the
  // per-error Range application below, which preserves surrounding markup.
  if (isInputField && lastApiCorrectedText && sourceText === lastCheckedText && lastApiCorrectedText !== sourceText) {
    const result = lastApiCorrectedText;
    _removeInputOverlay(currentFocusedElement);
    currentFocusedElement.value = result;
    currentFocusedElement.dispatchEvent(new Event('input', { bubbles: true }));
    currentFocusedElement.dispatchEvent(new Event('change', { bubbles: true }));
    lastCorrectedText = result;
    const appliedN = currentErrors.length;
    currentErrors = [];
    highlightedRanges = [];
    hideCorrectionTooltip();
    hideApplyAllButton();
    showMessage(`Applied ${appliedN} correction(s)!`, 'success');
    return;
  }

  // Sort by start and remove overlaps
  const sorted = [...currentErrors]
    .filter(e => e && typeof e.start === 'number' && typeof e.end === 'number' && e.end > e.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [];
  sorted.forEach((err) => {
    const last = merged[merged.length - 1];
    if (!last || err.start >= last.end) {
      merged.push(err);
      return;
    }
    // Overlap: keep the longer range (more specific correction)
    const lastLen = last.end - last.start;
    const errLen = err.end - err.start;
    if (errLen > lastLen) {
      merged[merged.length - 1] = err;
    }
  });

  // Build corrected text by applying replacements left-to-right
  let appliedCount = 0;
  let result = '';
  let cursor = 0;

  merged.forEach((err, idx) => {
    const start = Math.max(0, Math.min(err.start, sourceText.length));
    const end = Math.max(start, Math.min(err.end, sourceText.length));
    const suggestion = (err.suggestion || '').toString();

    if (start < cursor) {
      console.log(`⚠️ Skipping overlapping correction ${idx} at [${start}-${end}]`);
      return;
    }

    result += sourceText.slice(cursor, start);
    if (suggestion) {
      result += suggestion;
      appliedCount++;
    } else {
      result += sourceText.slice(start, end);
    }
    cursor = end;
  });

  result += sourceText.slice(cursor);

  console.log('Applied', appliedCount, 'of', merged.length, 'corrections');
  
  if (currentFocusedElement) {
    if (currentFocusedElement.value !== undefined) {
      // textarea / input — remove overlay then apply value
      _removeInputOverlay(currentFocusedElement);
      currentFocusedElement.value = result;
      currentFocusedElement.dispatchEvent(new Event('input', { bubbles: true }));
      currentFocusedElement.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // contentEditable: remove overlay, then apply corrections via Range API.
      _removeCEOverlay(currentFocusedElement);
      currentFocusedElement.normalize();
      const reversedMerged = [...merged].reverse();
      let ceApplied = 0;
      reversedMerged.forEach(err => {
        const s = Math.max(0, Math.min(err.start, sourceText.length));
        const e = Math.max(s, Math.min(err.end, sourceText.length));
        if (applyRangeCorrection(currentFocusedElement, s, e, (err.suggestion || '').toString())) ceApplied++;
      });
      appliedCount = ceApplied;
      originalContent = currentFocusedElement.innerHTML;
    }
    lastCorrectedText = result;
  }

  // Clear state
  currentErrors = [];
  highlightedRanges = [];
  hideCorrectionTooltip();
  hideApplyAllButton();

  if (appliedCount > 0) {
    showMessage(`Applied ${appliedCount} correction(s)!`, 'success');
  } else {
    showMessage('No corrections applied', 'error');
  }
}

/**
 * Dismiss a single suggestion (UI affordance for the card's Ignore button).
 * Removes only this error and rebuilds the overlay for the rest.
 */
function _ignoreError(error) {
  const remaining = currentErrors.filter((e) => e !== error);
  if (remaining.length && currentFocusedElement) {
    highlightErrors(currentFocusedElement, remaining); // rebuilds overlay + resets currentErrors
  } else {
    clearHighlights();
  }
  hideCorrectionTooltip();
}

/**
 * Show premium glassmorphism suggestion card on hover.
 * Visual redesign only — accept still calls applyCorrection(), ignore dismisses.
 */
function showCorrectionTooltip(event, error) {
  _ensureUIStyles();

  // Clear any pending hide timeout
  if (tooltipHideTimeout) {
    clearTimeout(tooltipHideTimeout);
    tooltipHideTimeout = null;
  }

  // If tooltip already exists, remove it first to show the new one
  if (hoverTooltip) {
    hoverTooltip.remove();
    hoverTooltip = null;
  }

  const span = event.target;
  const rect = span.getBoundingClientRect();

  const hasSuggestion = error.suggestion && error.suggestion.trim() && error.suggestion !== 'No suggestion';
  const color = _suggestionColor(error.type);
  const label = _suggestionLabel(error.type);
  const message = error.message || '';
  const originalText = (error.original && String(error.original).trim())
    ? String(error.original).trim()
    : (span && span.textContent ? span.textContent.trim() : '');

  // Theme palette (in-page card adapts to OS color scheme)
  const dark = _prefersDarkUI();
  const cardBg = dark ? 'rgba(22,27,34,0.86)' : 'rgba(255,255,255,0.9)';
  const cardBorder = dark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';
  const txt = dark ? '#f1f5f9' : '#0f172a';
  const sub = dark ? '#9aa6b8' : '#64748b';
  const surf2 = dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9';
  const ignoreText = dark ? '#cbd5e1' : '#475569';
  const shadow = dark
    ? '0 14px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.5)'
    : '0 14px 40px rgba(2,6,23,0.16), 0 2px 8px rgba(2,6,23,0.08)';

  const tooltip = document.createElement('div');
  tooltip.className = 'correctnow-tooltip';
  tooltip.setAttribute('data-correctnow-ui', 'true');
  tooltip.style.cssText =
    `position:fixed;z-index:2147483646;box-sizing:border-box;` +
    `min-width:248px;max-width:330px;padding:14px;` +
    `background:${cardBg};-webkit-backdrop-filter:blur(14px) saturate(180%);backdrop-filter:blur(14px) saturate(180%);` +
    `border:1px solid ${cardBorder};border-radius:14px;box-shadow:${shadow};` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;` +
    `pointer-events:auto;transform-origin:top center;animation:correctnow-pop .18s cubic-bezier(.34,1.56,.64,1);`;

  const chip =
    `<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;` +
    `font-size:11px;font-weight:700;letter-spacing:.2px;background:${_hexA(color, 0.14)};color:${color};">` +
    `<span style="width:6px;height:6px;border-radius:50%;background:${color};"></span>${label}</span>`;

  const messageHtml = message
    ? `<div dir="auto" style="font-size:12.5px;line-height:1.5;color:${sub};margin:10px 0 0;">${escapeHtml(message)}</div>`
    : '';

  // dir="auto" lets each token follow its own script direction (RTL for
  // Arabic/Hebrew/Urdu/Persian, LTR otherwise) — essential for a multilingual tool.
  const suggestionHtml = hasSuggestion
    ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:11px 0 13px;font-size:14px;">` +
        (originalText
          ? `<span dir="auto" style="color:${sub};text-decoration:line-through;text-decoration-color:${_hexA(color, 0.85)};">${escapeHtml(originalText)}</span>` +
            `<span style="color:${sub};font-size:13px;">→</span>`
          : '') +
        `<span dir="auto" style="font-weight:700;color:${txt};">${escapeHtml(error.suggestion)}</span></div>`
    : `<div style="font-size:13px;color:${sub};margin:10px 0 4px;">No suggestion available</div>`;

  const actionsHtml = hasSuggestion
    ? `<div style="display:flex;gap:8px;">` +
        `<button data-cn="accept" class="cn-act" style="flex:1;height:36px;border:none;border-radius:10px;cursor:pointer;` +
        `font-size:13px;font-weight:600;color:#fff;background:linear-gradient(135deg,#2563eb,#6366f1);` +
        `box-shadow:0 4px 12px rgba(37,99,235,.32);display:inline-flex;align-items:center;justify-content:center;gap:6px;">` +
        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>Accept</button>` +
        `<button data-cn="ignore" class="cn-act" style="height:36px;padding:0 14px;border:1px solid ${cardBorder};border-radius:10px;cursor:pointer;` +
        `font-size:13px;font-weight:600;color:${ignoreText};background:${surf2};">Ignore</button></div>`
    : `<div style="display:flex;"><button data-cn="ignore" class="cn-act" style="flex:1;height:36px;border:1px solid ${cardBorder};` +
        `border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;color:${ignoreText};background:${surf2};">Dismiss</button></div>`;

  tooltip.innerHTML =
    `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">${chip}</div>` +
    messageHtml + suggestionHtml + actionsHtml;

  document.body.appendChild(tooltip);

  // Position tooltip with better centering (viewport-relative; fixed positioning)
  const tooltipRect = tooltip.getBoundingClientRect();
  let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
  let top = rect.top - tooltipRect.height - 8;

  if (left + tooltipRect.width > window.innerWidth - 10) left = window.innerWidth - tooltipRect.width - 10;
  if (left < 10) left = 10;
  if (top < 10) top = rect.bottom + 8;

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';

  // Keep tooltip visible while hovered
  tooltip.addEventListener('mouseenter', () => {
    if (tooltipHideTimeout) { clearTimeout(tooltipHideTimeout); tooltipHideTimeout = null; }
  });
  tooltip.addEventListener('mouseleave', () => {
    tooltipHideTimeout = setTimeout(hideCorrectionTooltip, 300);
  });

  // Wire Accept / Ignore (keep underlying field focused)
  const acceptBtn = tooltip.querySelector('[data-cn="accept"]');
  const ignoreBtn = tooltip.querySelector('[data-cn="ignore"]');
  [acceptBtn, ignoreBtn].forEach((b) => {
    if (!b) return;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('pointerdown', (e) => e.preventDefault());
  });
  if (acceptBtn) {
    acceptBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tooltipHideTimeout) { clearTimeout(tooltipHideTimeout); tooltipHideTimeout = null; }
      applyCorrection(span, error);
      hideCorrectionTooltip();
    });
  }
  if (ignoreBtn) {
    ignoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tooltipHideTimeout) { clearTimeout(tooltipHideTimeout); tooltipHideTimeout = null; }
      _ignoreError(error);
    });
  }

  hoverTooltip = tooltip;
}

/**
 * Hide correction tooltip
 */
function hideCorrectionTooltip() {
  // Clear any pending timeout
  if (tooltipHideTimeout) {
    clearTimeout(tooltipHideTimeout);
    tooltipHideTimeout = null;
  }

  // Remove tooltip if it exists
  if (hoverTooltip) {
    hoverTooltip.remove();
    hoverTooltip = null;
  }
}

/**
 * Apply correction to the text using range-based approach (prevents duplicates)
 */
function applyCorrection(span, error) {
  if (!error.suggestion || !currentFocusedElement) {
    console.log('❌ Cannot apply correction - missing suggestion or element');
    return;
  }
  
  console.log('✏️ Applying correction from:', span ? span.textContent : error.original, 'to:', error.suggestion);
  
  try {
    // Get the original source text
    const sourceText = lastCheckedText || (currentFocusedElement.value !== undefined
      ? currentFocusedElement.value
      : (currentFocusedElement.textContent || currentFocusedElement.innerText || ''));
    
    if (!sourceText) {
      console.log('❌ No source text available');
      return;
    }
    
    // Apply this one correction using range-based approach (no DOM manipulation)
    const start = Math.max(0, Math.min(error.start, sourceText.length));
    const end = Math.max(start, Math.min(error.end, sourceText.length));
    const suggestion = (error.suggestion || '').toString();
    
    const correctedText = sourceText.slice(0, start) + suggestion + sourceText.slice(end);
    console.log('✅ Built corrected text using range-based approach');
    
    // Calculate position shift for remaining errors
    const lengthDiff = suggestion.length - (end - start);
    
    // Remove this error from list and adjust positions of remaining errors
    currentErrors = currentErrors.filter(e => e !== error).map(e => {
      // If error is after this correction, adjust its position
      if (e.start >= end) {
        return {
          ...e,
          start: e.start + lengthDiff,
          end: e.end + lengthDiff
        };
      }
      return e;
    });
    console.log('📋 Remaining errors after adjustment:', currentErrors.length);
    
    // Set the corrected text
    if (currentFocusedElement.value !== undefined) {
      // textarea / input
      _removeInputOverlay(currentFocusedElement);
      currentFocusedElement.value = correctedText;
      currentFocusedElement.dispatchEvent(new Event('input', { bubbles: true }));
      currentFocusedElement.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // contentEditable: remove Range overlay, apply correction, rebuild overlay
      _removeCEOverlay(currentFocusedElement);
      currentFocusedElement.normalize();
      applyRangeCorrection(currentFocusedElement, start, end, suggestion);
      originalContent = currentFocusedElement.innerHTML;
    }
    
    // Update lastCheckedText to the new corrected text
    lastCheckedText = correctedText;
    
    // Clear stale highlightedRanges pointer (overlays already removed above)
    highlightedRanges = [];
    
    // Rebuild overlay for remaining errors, or finish
    if (currentErrors.length > 0) {
      console.log('🔄 Re-highlighting remaining errors');
      highlightErrors(currentFocusedElement, currentErrors);
    } else {
      console.log('🎉 All errors corrected!');
      lastCorrectedText = correctedText;
      hideApplyAllButton();
      showMessage('All corrections applied!', 'success');
    }
    
    hideCorrectionTooltip();
  } catch (err) {
    console.error('❌ Error applying correction:', err);
  }
}

/**
 * Show temporary message near button
 */
function showMessage(text, type = 'info', isDetailed = false) {
  // Remove existing message
  const existing = document.querySelector(`.${CONFIG.MESSAGE_CLASS}`);
  if (existing) {
    existing.remove();
  }

  _ensureUIStyles();
  const message = document.createElement('div');
  message.className = CONFIG.MESSAGE_CLASS;
  message.setAttribute('data-correctnow-ui', 'true');

  // Accent color based on type
  const colors = {
    success: '#059669',
    error: '#dc2626',
    warning: '#d97706',
    info: '#2563eb',
  };
  const dark = _prefersDarkUI();
  const cardBg = dark ? 'rgba(22,27,34,0.92)' : 'rgba(255,255,255,0.94)';
  const cardBorder = dark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';
  const txt = dark ? '#f1f5f9' : '#0f172a';
  const accent = colors[type] || colors.info;

  // Per-type icon (consistent line-icon family)
  const icons = {
    success: '<path d="M20 6 9 17l-5-5"/>',
    error: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    warning: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  };

  // Temporary positioning to measure size
  message.style.cssText = `
    position: fixed;
    z-index: 999998;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 15px;
    background: ${cardBg};
    -webkit-backdrop-filter: blur(14px) saturate(180%);
    backdrop-filter: blur(14px) saturate(180%);
    color: ${txt};
    border: 1px solid ${cardBorder};
    border-left: 3px solid ${accent};
    border-radius: 12px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: ${(type === 'error' || type === 'warning') ? '460px' : '340px'};
    white-space: ${(isDetailed || type === 'error' || type === 'warning') ? 'pre-wrap' : 'nowrap'};
    word-wrap: break-word;
    box-shadow: ${dark ? '0 14px 40px rgba(0,0,0,0.6)' : '0 14px 40px rgba(2,6,23,0.16)'};
    visibility: hidden;
    animation: correctnow-toast-in 0.28s cubic-bezier(.34,1.56,.64,1);
  `;

  message.innerHTML =
    `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;">${icons[type] || icons.info}</svg>` +
    `<span style="min-width:0;">${escapeHtml(text)}</span>`;
  document.body.appendChild(message);

  // Calculate position to keep within viewport
  const rect = message.getBoundingClientRect();
  const padding = 10;
  let left = floatingButton ? floatingButton.offsetLeft : 20;
  
  // Position below Apply All button if it exists and is visible
  let top;
  if (applyAllButton && applyAllButton.style.display !== 'none' && applyAllButton.style.visibility !== 'hidden') {
    const applyAllRect = applyAllButton.getBoundingClientRect();
    top = applyAllRect.bottom + 10; // Position 10px below Apply All button
  } else if (floatingButton) {
    top = floatingButton.offsetTop + 40;
  } else {
    top = 20;
  }

  // Get focused element bounds to avoid overlap
  const focusedRect = currentFocusedElement ? currentFocusedElement.getBoundingClientRect() : null;

  // Adjust if goes off right edge - move to left side
  if (left + rect.width + padding > window.innerWidth) {
    left = Math.max(padding, window.innerWidth - rect.width - padding);
  }

  // Adjust if goes off bottom edge - show above instead
  if (top + rect.height + padding > window.innerHeight) {
    top = Math.max(padding, window.innerHeight - rect.height - padding);
  }

  // If message overlaps focused element, position above it
  if (focusedRect && top < focusedRect.bottom && top + rect.height > focusedRect.top) {
    top = Math.max(padding, focusedRect.top - rect.height - 10);
    // If still no space above, move to left side
    if (top < padding) {
      left = Math.max(padding, Math.min(left - rect.width - 20, window.innerWidth - rect.width - padding));
    }
  }

  // Apply final positioning
  message.style.visibility = 'visible';
  message.style.left = left + 'px';
  message.style.top = top + 'px';

  // Auto-remove: longer for warning/error so users can read actionable messages
  const displayMs = (type === 'warning' || type === 'error') ? 7000 : 4000;
  setTimeout(() => {
    message.style.opacity = '0';
    message.style.transition = 'opacity 0.3s ease';
    setTimeout(() => message.remove(), 300);
  }, displayMs);
}

/**
 * Check if click target is inside our extension UI elements
 */
function isClickInsideExtension(target) {
  // Check if clicking on floating button
  if (floatingButton && floatingButton.contains(target)) {
    return true;
  }

  // Check if clicking on Apply All button
  if (applyAllButton && applyAllButton.contains(target)) {
    return true;
  }

  // Check if clicking on hover tooltip
  if (hoverTooltip && hoverTooltip.contains(target)) {
    return true;
  }

  // Check if clicking on an error span (underlined text) or any overlay element
  if (target.closest && (
    target.closest('span[data-suggestion][style*="text-decoration"]') ||
    target.closest('[data-correctnow-ui]')
  )) {
    return true;
  }

  // Check if clicking on the focused element itself
  if (currentFocusedElement && currentFocusedElement.contains(target)) {
    return true;
  }

  return false;
}

/**
 * Handle clicks outside extension UI to clear highlights
 */
function handleDocumentClick(event) {
  // Check if click is inside our extension UI
  if (isClickInsideExtension(event.target)) {
    console.log('🎯 Click inside extension UI, keeping highlights');
    return;
  }

  // Hide trigger button when clicking outside editable context.
  const target = event.target;
  if (!isEditableField(target)) {
    hideFloatingButton();
  }

  // If there are no highlights, nothing else to do
  if (highlightedRanges.length === 0) {
    return;
  }

  // Click is outside - clear highlights
  console.log('👆 Click outside extension UI, clearing highlights');
  clearHighlights();
}

/**
 * Handle input events to clear corrected text tracking
 */
function handleInput(event) {
  // Ignore input events WE dispatched while applying corrections (isTrusted=false).
  // Only react to genuine user keystrokes — otherwise we'd tear down the overlay
  // we're in the middle of rebuilding.
  if (event && event.isTrusted === false) return;

  // Clear the last corrected text when user types
  if (lastCorrectedText) {
    console.log('🔄 User is typing, clearing lastCorrectedText');
    lastCorrectedText = '';
  }

  if (!currentFocusedElement) return;
  const target = event.target;
  if (!target || (target !== currentFocusedElement && !currentFocusedElement.contains(target))) return;

  // Manual editing invalidates every cached error offset. Keeping the overlay
  // would make underlines drift out of alignment with the text (the classic
  // "misaligned highlight" bug). Clear them; the user re-checks when ready.
  if (highlightedRanges.length > 0 || currentErrors.length > 0) {
    clearHighlights();
  }

  if (floatingButton) {
    positionButton(currentFocusedElement, floatingButton);
    floatingButton.style.display = 'block';
    floatingButton.style.opacity = '1';
  }
  scheduleIdleHide();
}

// =============================================================================
// UNIVERSAL OVERLAY SYSTEM
// Works on every website like Grammarly — never modifies the editor's DOM.
//
//  ① Input Mirror Overlay  (textarea / input type=text …)
//     Creates a transparent pixel-exact clone on top; error spans show
//     red underlines through the transparent text.
//
//  ② CE Range Overlay  (contentEditable – Gmail, Notion, Tiptap, ProseMirror …)
//     Uses Range.getClientRects() to place <2 px> underline strips and
//     transparent clickable highlight divs at the exact positions of each
//     error — completely outside the editor's DOM.
// =============================================================================

const _inputOverlayMap = new Map();  // HTMLElement → {overlay, inner}
const _ceOverlayMap    = new Map();  // HTMLElement → {overlay, items[{range,els[],err}]}

const _overlayResizeObs = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver(entries => entries.forEach(e => {
      if (_inputOverlayMap.has(e.target)) _syncInputOverlay(e.target);
    }))
  : null;

let _overlaySyncRAF = null;
function _onOverlayGlobalSync() {
  if (_overlaySyncRAF) return;
  _overlaySyncRAF = requestAnimationFrame(() => {
    _overlaySyncRAF = null;
    _inputOverlayMap.forEach((_, el) => { if (document.contains(el)) _syncInputOverlay(el); });
    _ceOverlayMap.forEach((_, el)    => { if (document.contains(el)) _syncCEOverlay(el); });
  });
}

/** Escape value for use inside a quoted HTML attribute */
function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- Premium suggestion design system ---------------------------------------
// Distinct colors per suggestion category (Grammarly-style):
//   grammar/spelling → red · punctuation → amber · clarity → blue · style → purple
function _suggestionColor(type) {
  switch (String(type || '').toLowerCase()) {
    case 'clarity':     return '#2563eb';
    case 'style':       return '#8b5cf6';
    case 'punctuation': return '#f59e0b';
    case 'grammar':     return '#ef4444';
    case 'spelling':    return '#ef4444';
    default:            return '#ef4444';
  }
}
function _suggestionLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'clarity') return 'Clarity';
  if (t === 'style') return 'Style';
  if (t === 'punctuation') return 'Punctuation';
  if (t === 'spelling') return 'Spelling';
  if (t === 'grammar') return 'Grammar';
  return 'Suggestion';
}
function _hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
// Crisp wavy underline as an inline SVG tile (used for contentEditable strips).
function _waveBg(color) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='6' height='4' viewBox='0 0 6 4'><path d='M0 3 Q1.5 0.4 3 3 T6 3' fill='none' stroke='${color}' stroke-width='1.1' stroke-linecap='round'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
// User's theme preference, mirrored from the popup ('auto' | 'light' | 'dark').
// Kept in sync via chrome.storage so the in-page card/toast match the popup.
let _cnThemePref = 'auto';

// True if the in-page UI should render dark — honors the popup's manual choice
// first, then falls back to the OS/browser color scheme when set to 'auto'.
function _prefersDarkUI() {
  if (_cnThemePref === 'dark') return true;
  if (_cnThemePref === 'light') return false;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) { return false; }
}

// Load the stored theme preference and keep it live across changes.
(function _cnInitThemeSync() {
  try {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.get(['uiTheme'], (r) => {
      if (chrome.runtime?.lastError) return;
      if (r && typeof r.uiTheme === 'string') _cnThemePref = r.uiTheme;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.uiTheme) {
        _cnThemePref = changes.uiTheme.newValue || 'auto';
        // Re-theme any open card immediately: dismiss so the next hover re-renders
        // with the new palette (underline colors are type-based, not theme-based).
        try { if (typeof hideCorrectionTooltip === 'function') hideCorrectionTooltip(); } catch (_) {}
      }
    });
  } catch (_) { /* storage unavailable in this frame — fall back to OS theme */ }
})();

// Also react to live OS theme changes while in 'auto' mode.
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (_cnThemePref === 'auto') {
      try { if (typeof hideCorrectionTooltip === 'function') hideCorrectionTooltip(); } catch (_) {}
    }
  });
} catch (_) {}

// Inject shared keyframes once (animations for the in-page card + toast).
function _ensureUIStyles() {
  if (document.getElementById('correctnow-ui-style')) return;
  const style = document.createElement('style');
  style.id = 'correctnow-ui-style';
  style.textContent = `
    @keyframes correctnow-pop { from { opacity: 0; transform: translateY(6px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes correctnow-toast-in { from { opacity: 0; transform: translateY(-8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .correctnow-tooltip .cn-act { transition: transform .15s cubic-bezier(.34,1.56,.64,1), box-shadow .15s ease, background .15s ease, border-color .15s ease; }
    .correctnow-tooltip .cn-act:hover { transform: translateY(-1px); }
    .correctnow-tooltip .cn-act:active { transform: translateY(0) scale(.97); }
  `;
  (document.head || document.documentElement).appendChild(style);
}

// ---- ① Input Mirror Overlay ------------------------------------------------

function _syncInputOverlay(el) {
  const data = _inputOverlayMap.get(el);
  if (!data) return;
  const { overlay, inner } = data;
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height || !document.contains(el)) {
    overlay.style.visibility = 'hidden'; return;
  }
  overlay.style.visibility = 'visible';
  const cs = window.getComputedStyle(el);
  const bT = parseFloat(cs.borderTopWidth)    || 0;
  const bR = parseFloat(cs.borderRightWidth)  || 0;
  const bB = parseFloat(cs.borderBottomWidth) || 0;
  const bL = parseFloat(cs.borderLeftWidth)   || 0;
  Object.assign(overlay.style, {
    top: rect.top + 'px', left: rect.left + 'px',
    width: rect.width + 'px', height: rect.height + 'px',
  });
  Object.assign(inner.style, {
    boxSizing: 'border-box',
    paddingTop:    (bT + (parseFloat(cs.paddingTop)    || 0)) + 'px',
    paddingRight:  (bR + (parseFloat(cs.paddingRight)  || 0)) + 'px',
    paddingBottom: (bB + (parseFloat(cs.paddingBottom) || 0)) + 'px',
    paddingLeft:   (bL + (parseFloat(cs.paddingLeft)   || 0)) + 'px',
    fontFamily: cs.fontFamily, fontSize: cs.fontSize,
    fontWeight: cs.fontWeight, fontStyle: cs.fontStyle,
    fontVariant: cs.fontVariant, fontKerning: cs.fontKerning,
    lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing,
    wordSpacing: cs.wordSpacing, textAlign: cs.textAlign,
    textTransform: cs.textTransform, textIndent: cs.textIndent,
    direction: cs.direction,
    whiteSpace:    el.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre',
    wordWrap: 'break-word', overflowWrap: 'break-word',
    tabSize: cs.tabSize || '8',
    transform: `translateY(-${el.scrollTop}px) translateX(-${el.scrollLeft}px)`,
  });
}

function _buildMirrorHTML(text, errors) {
  const sorted = [...errors]
    .filter(e => typeof e.start === 'number' && e.end > e.start && e.start >= 0 && e.end <= text.length)
    .sort((a, b) => a.start - b.start);
  let html = '', cursor = 0;
  sorted.forEach(err => {
    const s = Math.max(cursor, err.start);
    const e = Math.min(text.length, err.end);
    if (e <= s) return;
    if (s > cursor) html += escapeHtml(text.slice(cursor, s));
    const col = _suggestionColor(err.type);
    html += `<span class="correctnow-error-span" data-err-start="${s}" data-err-end="${e}" ` +
      `data-suggestion="${escapeAttr(err.suggestion || '')}" ` +
      `style="color:transparent;text-decoration:underline;text-decoration-style:wavy;` +
      `text-decoration-color:${col};text-decoration-thickness:1.5px;text-underline-offset:2px;` +
      `background-color:${_hexA(col, 0.10)};border-radius:2px;` +
      `pointer-events:auto;cursor:pointer;white-space:inherit;"` +
      `>${escapeHtml(text.slice(s, e))}</span>`;
    cursor = e;
  });
  if (cursor < text.length) html += escapeHtml(text.slice(cursor));
  return html;
}

function _attachInputOverlaySpanEvents(inner, errors) {
  inner.querySelectorAll('.correctnow-error-span').forEach(span => {
    const start = parseInt(span.dataset.errStart);
    const end   = parseInt(span.dataset.errEnd);
    const err   = errors.find(e => e.start === start && e.end === end);
    if (!err) return;
    span.addEventListener('mouseenter', ev => showCorrectionTooltip(ev, err));
    span.addEventListener('mouseleave', () => {
      if (tooltipHideTimeout) clearTimeout(tooltipHideTimeout);
      tooltipHideTimeout = setTimeout(hideCorrectionTooltip, 300);
    });
    span.addEventListener('mousedown',   ev => ev.preventDefault());
    span.addEventListener('pointerdown', ev => ev.preventDefault());
    span.addEventListener('click', ev => {
      ev.stopPropagation();
      if (tooltipHideTimeout) { clearTimeout(tooltipHideTimeout); tooltipHideTimeout = null; }
      applyCorrection(span, err);
      hideCorrectionTooltip();
    });
  });
}

function _createInputOverlay(el, errors) {
  let data = _inputOverlayMap.get(el);
  if (!data) {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-correctnow-ui', 'true');
    overlay.style.cssText =
      'position:fixed;z-index:2147483645;overflow:hidden;pointer-events:none;' +
      'box-sizing:border-box;background:transparent;';
    const inner = document.createElement('div');
    inner.style.cssText =
      'position:relative;top:0;left:0;color:transparent;background:transparent;' +
      'pointer-events:none;box-sizing:border-box;margin:0;';
    overlay.appendChild(inner);
    document.body.appendChild(overlay);
    // Keep a stable handler reference so it can be removed later (prevents
    // duplicate listeners accumulating across repeated check cycles).
    const onScroll = () => _syncInputOverlay(el);
    data = { overlay, inner, onScroll };
    _inputOverlayMap.set(el, data);
    if (_overlayResizeObs) _overlayResizeObs.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
  }
  data.inner.innerHTML = _buildMirrorHTML(el.value || '', errors);
  _attachInputOverlaySpanEvents(data.inner, errors);
  _syncInputOverlay(el);
}

function _removeInputOverlay(el) {
  const data = _inputOverlayMap.get(el);
  if (data) {
    data.overlay.remove();
    if (data.onScroll) try { el.removeEventListener('scroll', data.onScroll); } catch (_) {}
    _inputOverlayMap.delete(el);
    if (_overlayResizeObs) try { _overlayResizeObs.unobserve(el); } catch (_) {}
  }
}

// ---- ② ContentEditable Range Overlay ---------------------------------------

function _getErrorRange(el, start, end) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
  let ci = 0, sNode = null, sOff = 0, eNode = null, eOff = 0, node;
  while ((node = walker.nextNode())) {
    const len = node.nodeValue.length;
    if (!sNode && ci + len > start)  { sNode = node; sOff = start - ci; }
    if (!eNode && ci + len >= end)   { eNode = node; eOff = end   - ci; }
    if (sNode && eNode) break;
    ci += len;
  }
  if (!sNode || !eNode) return null;
  try {
    const r = document.createRange();
    r.setStart(sNode, Math.min(sOff, sNode.nodeValue.length));
    r.setEnd  (eNode, Math.min(eOff, eNode.nodeValue.length));
    return r;
  } catch (_) { return null; }
}

function _makeRectElements(rect, err, overlay) {
  const col = _suggestionColor(err.type);
  const ul = document.createElement('div');
  ul.style.cssText =
    `position:fixed;pointer-events:none;` +
    `background-image:${_waveBg(col)};background-repeat:repeat-x;background-position:left center;` +
    `top:${rect.bottom - 3}px;left:${rect.left}px;width:${rect.width}px;height:4px;`;
  const hl = document.createElement('div');
  hl.style.cssText =
    `position:fixed;pointer-events:auto;cursor:pointer;border-radius:3px;` +
    `background:${_hexA(col, 0.07)};` +
    `top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;`;
  hl.addEventListener('mouseenter', ev => showCorrectionTooltip(ev, err));
  hl.addEventListener('mouseleave', () => {
    if (tooltipHideTimeout) clearTimeout(tooltipHideTimeout);
    tooltipHideTimeout = setTimeout(hideCorrectionTooltip, 300);
  });
  hl.addEventListener('mousedown',   ev => ev.preventDefault());
  hl.addEventListener('pointerdown', ev => ev.preventDefault());
  hl.addEventListener('click', ev => {
    ev.stopPropagation();
    if (tooltipHideTimeout) { clearTimeout(tooltipHideTimeout); tooltipHideTimeout = null; }
    applyCorrection(null, err);
    hideCorrectionTooltip();
  });
  overlay.appendChild(ul);
  overlay.appendChild(hl);
  return { ul, hl };
}

function _createCEOverlay(el, errors) {
  _removeCEOverlay(el);
  const overlay = document.createElement('div');
  overlay.setAttribute('data-correctnow-ui', 'true');
  overlay.style.cssText =
    'position:fixed;z-index:2147483645;pointer-events:none;top:0;left:0;width:0;height:0;overflow:visible;';
  const items = [];
  errors.forEach(err => {
    const range = _getErrorRange(el, err.start, err.end);
    if (!range) return;
    const rects = [...range.getClientRects()].filter(r => r.width > 1);
    if (!rects.length) return;
    const els = rects.map(rect => _makeRectElements(rect, err, overlay));
    items.push({ range, els, err });
  });
  document.body.appendChild(overlay);
  const onScroll = () => _syncCEOverlay(el);
  _ceOverlayMap.set(el, { overlay, items, onScroll });
  el.addEventListener('scroll', onScroll, { passive: true });
}

function _syncCEOverlay(el) {
  const data = _ceOverlayMap.get(el);
  if (!data) return;
  requestAnimationFrame(() => {
    data.items.forEach(({ range, els }) => {
      const rects = [...range.getClientRects()].filter(r => r.width > 1);
      els.forEach(({ ul, hl }, i) => {
        const rect = rects[i];
        if (!rect) { ul.style.display = 'none'; hl.style.display = 'none'; return; }
        ul.style.display = hl.style.display = '';
        ul.style.top = (rect.bottom - 3) + 'px'; ul.style.left = rect.left + 'px'; ul.style.width = rect.width + 'px';
        hl.style.top = rect.top + 'px'; hl.style.left = rect.left + 'px';
        hl.style.width = rect.width + 'px'; hl.style.height = rect.height + 'px';
      });
    });
  });
}

function _removeCEOverlay(el) {
  const data = _ceOverlayMap.get(el);
  if (data) {
    data.overlay.remove();
    if (data.onScroll) try { el.removeEventListener('scroll', data.onScroll); } catch (_) {}
    _ceOverlayMap.delete(el);
  }
}

// =============================================================================
// END OVERLAY SYSTEM
// =============================================================================

/**
 * Initialize content script
 * Attach event listeners to all input/textarea elements
 */
function initializeContentScript() {
  // Attach to existing elements (capture phase)
  document.addEventListener('focus', handleFocus, true);
  document.addEventListener('blur', handleBlur, true);
  document.addEventListener('input', handleInput, true);

  // Handle clicks outside extension UI to clear highlights
  document.addEventListener('click', handleDocumentClick, true);

  // NOTE: A second click→handleFocus listener used to live here. It was removed
  // because the capture-phase 'focus' listener already covers entering a field,
  // and re-running handleFocus on every click caused redundant work and could
  // wrongly clear active highlights when clicking inside an already-checked
  // contentEditable (the inner click target differs from the stored container).

  // Keep overlays aligned when window scrolls or resizes
  window.addEventListener('scroll', _onOverlayGlobalSync, { capture: true, passive: true });
  window.addEventListener('resize', _onOverlayGlobalSync, { passive: true });

  console.log('CorrectNow extension loaded - Ready to check grammar');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
  initializeContentScript();
}

// NOTE: A page-wide MutationObserver (childList + subtree on document.body)
// used to run here with an EMPTY callback. It fired on every DOM mutation of
// the entire page — significant overhead on dynamic apps (Gmail, Notion, X) —
// while doing nothing. Removed. Field detection is fully handled by the
// capture-phase 'focus' listener, which sees dynamically-added editors the
// moment they receive focus, so no observer is needed.
