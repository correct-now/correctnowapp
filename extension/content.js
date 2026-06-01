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
  
  console.log('[CorrectNow Extension] ========================================');
  console.log('[CorrectNow Extension] Content script initializing');
  console.log('[CorrectNow Extension] Hostname:', hostname);
  console.log('[CorrectNow Extension] Full URL:', href);
  console.log('[CorrectNow Extension] ========================================');
  
  // Check if we're on the correct domain (supports localhost on any port)
  const isCorrectDomain = hostname === 'correctnow.app' || 
                          hostname === 'localhost' || 
                          hostname === '127.0.0.1' ||
                          hostname.endsWith('.correctnow.app');
  
  if (!isCorrectDomain) {
    console.log('[CorrectNow Extension] Not on CorrectNow domain, skipping auth injection');
    return;
  }
  
  console.log('[CorrectNow Extension] ✅ On CorrectNow domain, proceeding with auth injection');
  
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

  // Style the button
  button.style.cssText = `
    width: ${CONFIG.BUTTON_SIZE}px;
    height: ${CONFIG.BUTTON_SIZE}px;
    padding: 0;
    background-color: #ffffff;
    color: #2563eb;
    border: 1px solid rgba(37, 99, 235, 0.35);
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 3px 12px rgba(15, 23, 42, 0.22);
    transition: all 0.2s ease;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    pointer-events: auto;
    user-select: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  `;

  if (!document.getElementById('correctnow-spin-style')) {
    const spinStyle = document.createElement('style');
    spinStyle.id = 'correctnow-spin-style';
    spinStyle.textContent = '@keyframes correctnow-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    (document.head || document.documentElement).appendChild(spinStyle);
  }

  console.log('🔷 Button created');

  // Hover effect
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-1px) scale(1.03)';
    button.style.boxShadow = '0 6px 16px rgba(15, 23, 42, 0.26)';
    button.style.borderColor = 'rgba(37, 99, 235, 0.7)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0) scale(1)';
    button.style.boxShadow = '0 3px 12px rgba(15, 23, 42, 0.22)';
    button.style.borderColor = 'rgba(37, 99, 235, 0.35)';
  });

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
    positionButton(targetElement, floatingButton);
    floatingButton.style.display = 'block';
    floatingButton.style.opacity = '1';
    scheduleIdleHide();
    console.log('🔷 Button shown at position:', floatingButton.style.left, floatingButton.style.top);
  });
}

/**
 * Hide floating button on blur
 */
function handleBlur(event) {
  // Don't hide / clear state if user is clicking any CorrectNow UI element
  // (floating check button, Apply All button, or correction tooltip).
  const rt = event && event.relatedTarget;
  if (rt && (
    (floatingButton && floatingButton.contains(rt)) ||
    (applyAllButton && applyAllButton.contains(rt)) ||
    (hoverTooltip && hoverTooltip.contains(rt))
  )) {
    console.log('🔷 Button blur - clicked extension UI, keeping state');
    return;
  }

  hideFloatingButton();
  // Note: do NOT null currentFocusedElement here — keep it so post-check
  // operations (Apply All click, tooltip Apply click) can still target the
  // correct field. It will be reassigned on the next focus / click.
  console.log('🔷 Button blur - hiding button');
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
    applyAllButton = document.createElement('button');
    applyAllButton.textContent = '✓ Apply All Corrections';
    applyAllButton.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      padding: 10px 20px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
      transition: all 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      white-space: nowrap;
      visibility: hidden;
    `;

    applyAllButton.addEventListener('mouseenter', () => {
      applyAllButton.style.transform = 'translateY(-2px)';
      applyAllButton.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.5)';
    });
    
    applyAllButton.addEventListener('mouseleave', () => {
      applyAllButton.style.transform = 'translateY(0)';
      applyAllButton.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
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

  // FAST PATH: If we have the API's authoritative corrected text AND the
  // current source still matches what we checked, just use it directly.
  // This guarantees parity with the website's Accept All button and
  // captures any LLM-added punctuation that wasn't enumerated as a change.
  if (lastApiCorrectedText && sourceText === lastCheckedText && lastApiCorrectedText !== sourceText) {
    const result = lastApiCorrectedText;
    if (currentFocusedElement.value !== undefined) {
      _removeInputOverlay(currentFocusedElement);
      currentFocusedElement.value = result;
      currentFocusedElement.dispatchEvent(new Event('input', { bubbles: true }));
      currentFocusedElement.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // contentEditable: remove overlay then replace full text
      _removeCEOverlay(currentFocusedElement);
      currentFocusedElement.querySelectorAll('.correctnow-error-span').forEach(s => {
        s.parentNode.replaceChild(document.createTextNode(s.textContent), s);
      });
      currentFocusedElement.normalize();
      currentFocusedElement.textContent = result;
    }
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
 * Show correction tooltip on hover
 */
function showCorrectionTooltip(event, error) {
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

  const tooltip = document.createElement('div');
  tooltip.className = 'correctnow-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    z-index: 2147483646;
    background: white;
    border: 2px solid #ef4444;
    border-radius: 8px;
    padding: 10px 14px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    min-width: 150px;
    max-width: 300px;
    pointer-events: auto;
    transition: opacity 0.2s ease;
  `;

  const hasSuggestion = error.suggestion && error.suggestion.trim() && error.suggestion !== 'No suggestion';

  console.log('🎯 Showing tooltip for:', error.message, 'Suggestion:', error.suggestion, 'Has valid suggestion:', hasSuggestion);

  tooltip.innerHTML = `
    <div style="color: #666; font-size: 11px; margin-bottom: 6px; line-height: 1.4;">${escapeHtml(error.message || 'Spelling error')}</div>
    <div style="font-weight: 600; color: ${hasSuggestion ? '#10b981' : '#999'}; font-size: 15px; line-height: 1.4;">${escapeHtml(error.suggestion || 'No suggestion available')}</div>
    ${hasSuggestion ? `<div style="color: #999; font-size: 10px; margin-top: 6px; font-style: italic;">Click to apply</div>` : ''}
  `;
  
  // Make entire tooltip clickable if there's a suggestion
  if (hasSuggestion) {
    tooltip.style.cursor = 'pointer';
    tooltip.style.transition = 'all 0.2s ease';
  }

  document.body.appendChild(tooltip);

  // Position tooltip with better centering
  const tooltipRect = tooltip.getBoundingClientRect();
  // Tooltip uses position:fixed so coordinates are viewport-relative.
  // getBoundingClientRect() already returns viewport-relative values —
  // do NOT add window.scrollX/scrollY or the tooltip drifts on scrolled pages.
  let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

  // Default to showing ABOVE the error (prevents overlap with next line errors)
  // Small gap (2px) for easy mouse movement from error to tooltip
  let top = rect.top - tooltipRect.height - 2;

  // Keep within viewport horizontally
  if (left + tooltipRect.width > window.innerWidth - 10) {
    left = window.innerWidth - tooltipRect.width - 10;
  }
  if (left < 10) left = 10;

  // If not enough space above, show below instead
  if (top < 10) {
    top = rect.bottom + 2;
  }

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';

  // Keep tooltip visible when hovering over it
  tooltip.addEventListener('mouseenter', () => {
    if (tooltipHideTimeout) {
      clearTimeout(tooltipHideTimeout);
      tooltipHideTimeout = null;
    }
    // Add hover effect if clickable
    if (hasSuggestion) {
      tooltip.style.transform = 'scale(1.02)';
      tooltip.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
    }
  });

  tooltip.addEventListener('mouseleave', () => {
    // Reset hover effect
    if (hasSuggestion) {
      tooltip.style.transform = 'scale(1)';
      tooltip.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
    }
    // Hide after a short delay when leaving tooltip
    tooltipHideTimeout = setTimeout(hideCorrectionTooltip, 300);
  });

  // Click entire tooltip to apply correction
  if (hasSuggestion) {
    // Prevent underlying input from losing focus on click
    tooltip.addEventListener('mousedown', (e) => { e.preventDefault(); });
    tooltip.addEventListener('pointerdown', (e) => { e.preventDefault(); });

    tooltip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tooltipHideTimeout) {
        clearTimeout(tooltipHideTimeout);
        tooltipHideTimeout = null;
      }
      applyCorrection(span, error);
      hideCorrectionTooltip();
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

  const message = document.createElement('div');
  message.className = CONFIG.MESSAGE_CLASS;

  // Color based on type
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  };

  const bgColors = {
    success: '#ecfdf5',
    error: '#fef2f2',
    warning: '#fffbeb',
    info: '#eff6ff',
  };

  // Temporary positioning to measure size
  message.style.cssText = `
    position: fixed;
    z-index: 999998;
    padding: 12px 16px;
    background-color: ${bgColors[type]};
    color: ${colors[type]};
    border: 1px solid ${colors[type]};
    border-radius: 4px;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: ${(type === 'error' || type === 'warning') ? '500px' : '350px'};
    white-space: ${(isDetailed || type === 'error' || type === 'warning') ? 'pre-wrap' : 'nowrap'};
    word-wrap: break-word;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    visibility: hidden;
  `;

  message.textContent = text;
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
  // Clear the last corrected text when user types
  if (lastCorrectedText) {
    console.log('🔄 User is typing, clearing lastCorrectedText');
    lastCorrectedText = '';
  }

  if (!currentFocusedElement) return;
  const target = event.target;
  if (!target || (target !== currentFocusedElement && !currentFocusedElement.contains(target))) return;

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
    paddingTop:    (bT + (parseFloat(cs.paddingTop)    || 0)) + 'px',
    paddingRight:  (bR + (parseFloat(cs.paddingRight)  || 0)) + 'px',
    paddingBottom: (bB + (parseFloat(cs.paddingBottom) || 0)) + 'px',
    paddingLeft:   (bL + (parseFloat(cs.paddingLeft)   || 0)) + 'px',
    fontFamily: cs.fontFamily, fontSize: cs.fontSize,
    fontWeight: cs.fontWeight, fontStyle: cs.fontStyle,
    lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing,
    wordSpacing: cs.wordSpacing, textAlign: cs.textAlign,
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
    html += `<span class="correctnow-error-span" data-err-start="${s}" data-err-end="${e}" ` +
      `data-suggestion="${escapeAttr(err.suggestion || '')}" ` +
      `style="color:transparent;text-decoration:underline #ef4444;text-decoration-thickness:2px;` +
      `text-underline-offset:3px;background-color:rgba(239,68,68,0.12);border-radius:2px;` +
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
    data = { overlay, inner };
    _inputOverlayMap.set(el, data);
    if (_overlayResizeObs) _overlayResizeObs.observe(el);
    el.addEventListener('scroll', () => _syncInputOverlay(el), { passive: true });
  }
  data.inner.innerHTML = _buildMirrorHTML(el.value || '', errors);
  _attachInputOverlaySpanEvents(data.inner, errors);
  _syncInputOverlay(el);
}

function _removeInputOverlay(el) {
  const data = _inputOverlayMap.get(el);
  if (data) {
    data.overlay.remove();
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
  const ul = document.createElement('div');
  ul.style.cssText =
    `position:fixed;pointer-events:none;border-radius:1px;background:#ef4444;` +
    `top:${rect.bottom - 2}px;left:${rect.left}px;width:${rect.width}px;height:2px;`;
  const hl = document.createElement('div');
  hl.style.cssText =
    `position:fixed;pointer-events:auto;cursor:pointer;border-radius:2px;` +
    `background:rgba(239,68,68,0.08);` +
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
  _ceOverlayMap.set(el, { overlay, items });
  el.addEventListener('scroll', () => _syncCEOverlay(el), { passive: true });
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
        ul.style.top = (rect.bottom - 2) + 'px'; ul.style.left = rect.left + 'px'; ul.style.width = rect.width + 'px';
        hl.style.top = rect.top + 'px'; hl.style.left = rect.left + 'px';
        hl.style.width = rect.width + 'px'; hl.style.height = rect.height + 'px';
      });
    });
  });
}

function _removeCEOverlay(el) {
  const data = _ceOverlayMap.get(el);
  if (data) { data.overlay.remove(); _ceOverlayMap.delete(el); }
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

  // Also listen for click events (helps with some websites)
  document.addEventListener('click', function(e) {
    const path = (e.composedPath && e.composedPath()) || [];
    const target = path[0] || e.target;
    if (isEditableField(target)) {
      setTimeout(() => handleFocus({ target, composedPath: () => path }), 100);
    }
  }, true);

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

// Handle dynamic elements (only after body exists)
const observer = new MutationObserver(() => {
  // Re-attach listeners if needed
});

// Only observe if document.body exists
if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
} else {
  // Wait for body to be available
  document.addEventListener('DOMContentLoaded', () => {
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  });
}
