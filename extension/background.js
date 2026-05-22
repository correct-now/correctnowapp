/**
 * CorrectNow Background Service Worker (Manifest V3)
 * Handles API communication for grammar checking with multi-language support
 * - Receives messages from content.js
 * - Makes API calls to the grammar checking backend
 * - Returns structured error responses
 */

console.log('🔧 CorrectNow Service Worker loaded');

const BACKEND_CONFIG = {
  deployed: {
    apiBase: 'https://correctnow.app',
    webBase: 'https://correctnow.app',
  },
  local: {
    apiBase: 'http://localhost:8787',
    webBase: 'http://localhost:8080',
  },
};

async function getBackendConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['backendMode', 'backendApiBase', 'backendWebBase'], (result) => {
      const mode = result.backendMode === 'local' ? 'local' : 'deployed';
      const fallback = BACKEND_CONFIG[mode];
      const apiBase = String(result.backendApiBase || fallback.apiBase).trim();
      let webBase = String(result.backendWebBase || fallback.webBase).trim();

      // Migrate legacy local frontend URL from :5173 to :8080
      if (mode === 'local' && (!webBase || webBase === 'http://localhost:5173')) {
        webBase = BACKEND_CONFIG.local.webBase;
        chrome.storage.local.set({
          backendMode: 'local',
          backendApiBase: apiBase || BACKEND_CONFIG.local.apiBase,
          backendWebBase: webBase,
        });
      }

      resolve({
        mode,
        apiBase,
        webBase,
      });
    });
  });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Message received:', request.action);
  console.log('📍 From:', sender.url);

  if (request.action === 'checkGrammar') {
    // Handle async with promise
    handleGrammarCheck(request, sender)
      .then(sendResponse)
      .catch(error => {
        console.error('❌ Unhandled error:', error);
        sendResponse({
          error: error.message || 'Unknown error occurred',
          details: error.toString(),
        });
      });
    // Return true to indicate async response
    return true;
  } else if (request.action === 'getAuthState') {
    // Get stored authentication state
    getAuthState()
      .then(sendResponse)
      .catch(error => {
        console.error('❌ Error getting auth state:', error);
        sendResponse(null);
      });
    return true;
  } else if (request.action === 'getUserStats') {
    // Get user usage statistics
    getUserStats()
      .then(sendResponse)
      .catch(error => {
        console.error('❌ Error getting user stats:', error);
        sendResponse(null);
      });
    return true;
  } else if (request.action === 'logout') {
    // Logout user
    logout()
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('❌ Error logging out:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === 'saveAuthToken') {
    // Save Firebase auth token
    saveAuthToken(request.token, request.user)
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('❌ Error saving auth token:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

/**
 * Check if token needs refresh and request new one if needed
 */
async function checkAndRefreshToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken', 'authUser', 'tokenExpiresAt'], async (result) => {
      const { authToken, authUser, tokenExpiresAt } = result;
      
      // No token stored, nothing to refresh
      if (!authToken || !authUser) {
        resolve();
        return;
      }
      
      // Check if token is expired or will expire soon (within 5 minutes)
      const now = Date.now();
      const expiresAt = tokenExpiresAt || 0;
      const willExpireSoon = expiresAt - now < (5 * 60 * 1000); // Less than 5 minutes left
      
      if (!willExpireSoon) {
        console.log('✅ Token is still valid');
        resolve();
        return;
      }
      
      console.log('⚠️ Token will expire soon, requesting refresh...');
      
      // Try to get a fresh token from the website
      try {
        const backend = await getBackendConfig();
        const response = await fetch(`${backend.apiBase}/api/refresh-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.token) {
            console.log('✅ Token refreshed successfully');
            await saveAuthToken(data.token, authUser);
          }
        } else {
          console.warn('⚠️ Could not refresh token, will prompt login when needed');
        }
      } catch (error) {
        console.warn('⚠️ Token refresh failed:', error.message);
      }
      
      resolve();
    });
  });
}

/**
 * Get stored authentication state
 */
async function getAuthState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken', 'authUser'], (result) => {
      if (result.authToken && result.authUser) {
        resolve({
          token: result.authToken,
          user: result.authUser
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Get user usage statistics from backend
 */
async function getUserStats() {
  try {
    // Check and refresh token if needed
    await checkAndRefreshToken();
    const backend = await getBackendConfig();
    
    const authState = await getAuthState();
    
    if (!authState || !authState.token) {
      return {
        planType: 'free',
        dailyChecksUsed: 0,
        dailyLimit: 5,
        creditsRemaining: null
      };
    }

    // Fetch stats from backend
    const response = await fetch(`${backend.apiBase}/api/user/stats`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authState.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      // Check if token expired (401 or 403)
      if (response.status === 401 || response.status === 403) {
        console.warn('Auth token expired or invalid, clearing auth state');
        await logout();
        // Notify popup to show login view
        chrome.runtime.sendMessage({ 
          action: 'authStateChanged', 
          user: null,
          reason: 'token_expired'
        }).catch(() => {});
        return null;
      }
      console.error('Failed to fetch user stats:', response.status);
      return null;
    }

    const stats = await response.json();
    return stats;
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return null;
  }
}

/**
 * Save authentication token and user info
 */
async function saveAuthToken(token, user) {
  return new Promise((resolve, reject) => {
    // Calculate token expiration (Firebase tokens last 1 hour)
    // We'll refresh at 50 minutes to be safe
    const expiresAt = Date.now() + (50 * 60 * 1000); // 50 minutes from now
    
    chrome.storage.local.set({ 
      authToken: token,
      authUser: user,
      tokenExpiresAt: expiresAt,
      guestMode: false
    }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        console.log('✅ Auth token saved (expires in 50 minutes)');
        // Notify popup of auth state change
        chrome.runtime.sendMessage({ 
          action: 'authStateChanged', 
          user: user 
        }).catch(() => {}); // Ignore if popup is closed
        resolve();
      }
    });
  });
}

/**
 * Logout user - clear stored auth data
 */
async function logout() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(['authToken', 'authUser', 'tokenExpiresAt'], () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        console.log('✅ User logged out');
        // Notify popup of auth state change
        chrome.runtime.sendMessage({ 
          action: 'authStateChanged', 
          user: null 
        }).catch(() => {}); // Ignore if popup is closed
        resolve();
      }
    });
  });
}

/**
 * Listen for auth messages from web app (when user logs in on website)
 */
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  console.log('📨 External message received from:', sender.url);
  console.log('📨 Message action:', request.action);
  console.log('📨 Message details:', { 
    hasToken: !!request.token, 
    hasUser: !!request.user,
    userEmail: request.user?.email 
  });
  
  if (request.action === 'authUpdate' && request.token && request.user) {
    console.log('✅ Valid authUpdate message received, saving token...');
    saveAuthToken(request.token, request.user)
      .then(() => {
        console.log('✅ Token saved successfully');
        sendResponse({ success: true, message: 'Auth token saved' });
      })
      .catch(error => {
        console.error('❌ Error saving token:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  } else {
    console.log('⚠️ Invalid message format or missing data');
    sendResponse({ success: false, error: 'Invalid message format' });
  }
});


/**
 * Detect language of the text
 */
async function detectLanguage(text, apiBase, apiKey, authToken) {
  try {
    const apiUrl = `${apiBase}/api/detect-language`;
    console.log('🌍 Detecting language...');

    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Use auth token if available, otherwise fall back to extension token
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    } else if (apiKey && apiKey !== 'YOUR_API_KEY_HERE') {
      headers['X-API-Key'] = apiKey;
      headers['X-CorrectNow-API-Key'] = apiKey;
    }

    const langController = new AbortController();
    const langTimeout = setTimeout(() => langController.abort(), 5000);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ text }),
      signal: langController.signal,
    });
    clearTimeout(langTimeout);

    if (!response.ok) {
      console.error('❌ Language detection failed:', response.status);
      return 'auto'; // Fallback to auto
    }

    const data = await response.json();
    const detectedCode = data.code || 'auto';
    console.log('🌍 Detected language:', detectedCode);
    return detectedCode;
  } catch (error) {
    console.error('❌ Language detection error:', error);
    return 'auto'; // Fallback to auto
  }
}

/**
 * LCS-based diff: returns pure-insertion segments (non-alphanumeric chars in
 * corrected that don't exist at that position in applied). These are typically
 * punctuation the LLM added in corrected_text but forgot to enumerate in changes[].
 *
 * Returns [{posInApplied, chars}] — each entry is a run of inserted chars
 * and the position in `applied` where they were inserted.
 */
function findPureInsertions(applied, corrected) {
  const m = applied.length, n = corrected.length;
  if (!m || !n || m > 3000 || n > 3000) return [];

  const W = n + 1;
  const dp = new Uint16Array((m + 1) * W);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i * W + j] = applied[i - 1] === corrected[j - 1]
        ? dp[(i - 1) * W + (j - 1)] + 1
        : Math.max(dp[(i - 1) * W + j], dp[i * W + (j - 1)]);
    }
  }

  // Backtrack to collect edit ops
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && applied[i - 1] === corrected[j - 1]) {
      ops.push({ t: 'e', posA: i - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i * W + (j - 1)] >= dp[(i - 1) * W + j])) {
      ops.push({ t: 'i', posA: i, ch: corrected[j - 1] });
      j--;
    } else {
      ops.push({ t: 'd', posA: i - 1 });
      i--;
    }
  }
  ops.reverse();

  // Group consecutive inserts; skip if adjacent to a delete (= replacement, not pure insert)
  const insertions = [];
  for (let k = 0; k < ops.length; ) {
    if (ops[k].t !== 'i') { k++; continue; }
    const posA = ops[k].posA;
    let chars = '';
    let kEnd = k;
    while (kEnd < ops.length && ops[kEnd].t === 'i' && ops[kEnd].posA === posA) {
      chars += ops[kEnd].ch;
      kEnd++;
    }
    const prevIsDel = k > 0 && ops[k - 1].t === 'd';
    const nextIsDel = kEnd < ops.length && ops[kEnd].t === 'd';
    // Only surface if it's purely punctuation/whitespace (ignore whole-word insertions)
    const isPunct = /^[^\p{L}\p{N}]+$/u.test(chars);
    if (!prevIsDel && !nextIsDel && isPunct) {
      insertions.push({ posInApplied: posA, chars });
    }
    k = kEnd;
  }
  return insertions;
}

/**
 * Convert new API response format to old format for extension compatibility.
 * Each change entry maps to exactly ONE occurrence in the source text (first
 * unconsumed position). This prevents false-positive underlines when a common
 * word appears many times but only one specific instance needs correction.
 */
function convertResponseToErrors(data, originalText) {
  const { corrected_text, changes } = data;

  if (!Array.isArray(changes) || changes.length === 0) {
    return [];
  }

  const errors = [];
  // Track consumed [start, end) ranges so two change entries for the same
  // original text resolve to two different positions in the source.
  const usedRanges = [];

  changes.forEach((change) => {
    const original = change.original || '';
    const corrected = change.corrected || '';
    const explanation = change.explanation || 'Grammar or spelling error';

    if (!original) return;

    // Find the first occurrence of `original` that is not already claimed
    // by a previous change entry.
    let searchIndex = 0;
    while (searchIndex < originalText.length) {
      const foundIndex = originalText.indexOf(original, searchIndex);
      if (foundIndex === -1) break;

      const start = foundIndex;
      const end = foundIndex + original.length;

      const alreadyUsed = usedRanges.some(r => r.start < end && r.end > start);
      if (!alreadyUsed) {
        usedRanges.push({ start, end });
        errors.push({
          start,
          end,
          type: 'grammar',
          message: explanation,
          suggestion: corrected,
          original,
        });
        break; // Only the FIRST available occurrence per change entry
      }

      searchIndex = foundIndex + 1;
    }
  });

  // --- Absorb ALL missing punctuation from corrected_text into existing changes ---
  // The LLM often adds punctuation (commas, question marks, etc.) anywhere in
  // corrected_text but omits those positions from the changes[] array. This block
  // uses a full LCS diff to find every pure-insertion of non-word chars between
  // `applied` (changes applied to original) and `corrected_text`, then either:
  //   A) absorbs them into the adjacent change's suggestion (preferred), or
  //   B) creates a minimal standalone underline entry on the unchanged char.
  try {
    if (typeof corrected_text === 'string' && corrected_text.length > 0 && errors.length > 0) {
      // Build segments: interleaved gap/change blocks with positions in both
      // originalText and the simulated applied string.
      const sortedErrors = [...errors].sort((a, b) => a.start - b.start);
      let applied = '';
      let cursor = 0;
      const segments = [];

      for (const err of sortedErrors) {
        if (err.start < cursor) continue;
        if (err.start > cursor) {
          segments.push({
            type: 'gap',
            origStart: cursor, origEnd: err.start,
            appliedStart: applied.length,
            appliedEnd: applied.length + (err.start - cursor),
          });
          applied += originalText.slice(cursor, err.start);
        }
        const suggestion = err.suggestion || '';
        segments.push({
          type: 'change',
          origStart: err.start, origEnd: err.end,
          appliedStart: applied.length,
          appliedEnd: applied.length + suggestion.length,
          errorIdx: errors.indexOf(err),
        });
        applied += suggestion;
        cursor = err.end;
      }
      if (cursor < originalText.length) {
        segments.push({
          type: 'gap',
          origStart: cursor, origEnd: originalText.length,
          appliedStart: applied.length,
          appliedEnd: applied.length + (originalText.length - cursor),
        });
        applied += originalText.slice(cursor);
      }

      if (applied !== corrected_text) {
        const insertions = findPureInsertions(applied, corrected_text);
        console.log('🔍 Punctuation insertions found:', JSON.stringify(insertions));

        for (const ins of insertions) {
          // A) Insertion immediately AFTER a change → append to that change's suggestion
          const segAfterChange = segments.find(
            s => s.type === 'change' && s.appliedEnd === ins.posInApplied
          );
          if (segAfterChange) {
            errors[segAfterChange.errorIdx] = {
              ...errors[segAfterChange.errorIdx],
              suggestion: errors[segAfterChange.errorIdx].suggestion + ins.chars,
            };
            segAfterChange.appliedEnd += ins.chars.length;
            console.log('✏️ [A] Appended', JSON.stringify(ins.chars), 'to change idx', segAfterChange.errorIdx);
            continue;
          }

          // B) Insertion immediately BEFORE a change → prepend to that change's suggestion
          const segBeforeChange = segments.find(
            s => s.type === 'change' && s.appliedStart === ins.posInApplied
          );
          if (segBeforeChange) {
            errors[segBeforeChange.errorIdx] = {
              ...errors[segBeforeChange.errorIdx],
              suggestion: ins.chars + errors[segBeforeChange.errorIdx].suggestion,
            };
            segBeforeChange.appliedStart -= ins.chars.length;
            console.log('✏️ [B] Prepended', JSON.stringify(ins.chars), 'to change idx', segBeforeChange.errorIdx);
            continue;
          }

          // C) Insertion inside/adjacent to a gap → create standalone underline
          const gapSeg = segments.find(
            s => s.type === 'gap' &&
              s.appliedStart <= ins.posInApplied && ins.posInApplied <= s.appliedEnd
          );
          if (gapSeg) {
            const origPos = gapSeg.origStart + (ins.posInApplied - gapSeg.appliedStart);
            const anchorPos = Math.max(0, Math.min(origPos, originalText.length - 1));
            const anchorChar = originalText[anchorPos] || '';
            const alreadyCovered = anchorChar &&
              errors.some(e => e.start <= anchorPos && e.end > anchorPos);
            if (anchorChar && !alreadyCovered) {
              errors.push({
                start: anchorPos, end: anchorPos + 1,
                type: 'punctuation',
                message: `Adds '${ins.chars}' for clarity.`,
                suggestion: anchorChar + ins.chars,
                original: anchorChar,
              });
              console.log('✏️ [C] Standalone punctuation at orig pos', anchorPos);
            }
          }
        }
      }
    }
  } catch (diffErr) {
    console.warn('⚠️ Punctuation diff failed:', diffErr);
  }

  console.log('✅ Converted', changes.length, 'changes to', errors.length, 'errors');
  return errors;
}

/**
 * Handle grammar check request
 * Calls the backend API and returns results
 */
async function handleGrammarCheck(request, sender) {
  try {
    const { text, apiBase, language, apiKey, authToken, userId } = request;
    const backend = await getBackendConfig();
    const effectiveApiBase = String(apiBase || backend.apiBase || BACKEND_CONFIG.deployed.apiBase).trim();

    console.log('📝 Text length:', text.length);
    console.log('🌐 API Base:', effectiveApiBase);
    console.log('🔑 Extension Token:', apiKey ? 'Provided' : 'Not provided');
    console.log('🔐 Auth Token:', authToken ? 'Logged in' : 'Guest');
    console.log('👤 User ID:', userId || 'None');

    if (!text || text.trim() === '') {
      console.log('❌ Empty text');
      return { error: 'Empty text provided' };
    }

    // Detect language if not provided
    let targetLanguage = language || 'auto';
    if (targetLanguage === 'auto') {
      targetLanguage = await detectLanguage(text, effectiveApiBase, apiKey, authToken);
    }
    console.log('🌍 Target language:', targetLanguage);

    // Construct API URL for proofreading
    const apiUrl = `${effectiveApiBase}/api/proofread`;

    console.log('🔗 Making request to:', apiUrl);

    // Make fetch request to backend API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    // Build headers
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Priority 1: Use Firebase auth token if user is logged in (for usage tracking)
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
      console.log('🔐 Using Firebase auth token (logged in user)');
    }
    // Priority 2: Use extension API key for guest users (bypasses rate limits)
    // Send on both header names the server accepts
    else if (apiKey && apiKey !== 'YOUR_API_KEY_HERE') {
      headers['X-API-Key'] = apiKey;
      headers['X-CorrectNow-API-Key'] = apiKey;
      console.log('🔑 Using extension token (guest user)');
    }

    // Prepare request body
    const requestBody = {
      text: text,
      language: targetLanguage,
    };

    // Add userId if available (for usage tracking)
    if (userId) {
      requestBody.userId = userId;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('📨 Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson = null;
      try {
        errorJson = JSON.parse(errorText);
      } catch (_e) {
        // keep raw text fallback
      }
      console.error('❌ API error:', response.status, errorText);
      const backendMessage = errorJson?.message || errorJson?.error || '';
      
      // Handle specific HTTP status codes
      if (response.status === 429) {
        return {
          error: backendMessage || 'Too many requests. Please try again later or sign in.',
          details: errorText,
          requiresAuth: !!errorJson?.requiresAuth,
          requiresUpgrade: !!errorJson?.requiresUpgrade,
        };
      }

      if (response.status === 401 || response.status === 403) {
        await logout().catch(() => {});
        chrome.runtime.sendMessage({
          action: 'authStateChanged',
          user: null,
          reason: 'token_expired'
        }).catch(() => {});
        return {
          error: backendMessage || 'Session expired. Please sign in again.',
          details: errorText,
          requiresAuth: true,
        };
      }
      
      if (response.status === 503) {
        return {
          error: backendMessage || 'Service temporarily unavailable. Please try again in a moment.',
          details: errorText,
        };
      }
      
      return {
        error: backendMessage || `API error: ${response.status} ${response.statusText}`,
        details: errorText,
      };
    }

    // Parse API response — read as text first so we can show the raw body if JSON parse fails
    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      const preview = rawText.substring(0, 200);
      console.error('❌ Response is not JSON:', preview);
      return {
        error: `Server returned non-JSON response (status ${response.status}): ${preview}`,
        details: rawText,
      };
    }
    console.log('📤 Response received:', data);

    // Validate response format (new format: corrected_text and changes)
    if (typeof data.corrected_text !== 'string' || !Array.isArray(data.changes)) {
      const dataPreview = JSON.stringify(data).substring(0, 200);
      console.error('❌ Invalid response format:', dataPreview);
      return {
        error: `Invalid API response format. Server returned: ${dataPreview}`,
        details: data,
      };
    }

    // Convert new API format to old error format
    const errors = convertResponseToErrors(data, text);

    // Return parsed errors
    console.log('✅ Returning errors:', errors.length);
    return {
      errors: errors,
      correctedText: data.corrected_text,
      changes: data.changes,
    };
  } catch (error) {
    console.error('❌ Grammar check error:', error);

    // Check if it's an AbortError (timeout)
    if (error.name === 'AbortError') {
      return {
        error: 'Request timed out. The API might be slow or rate-limited.',
        details: 'Please try again in a few moments.',
      };
    }

    return {
      error: error.message || 'Unknown error occurred',
      details: error.toString(),
    };
  }
}

/**
 * Extension lifecycle hooks
 */

// On extension install or update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('CorrectNow extension installed');
    // Optionally open welcome page
    // chrome.tabs.create({ url: 'welcome.html' });
  } else if (details.reason === 'update') {
    console.log('CorrectNow extension updated');
  }
});

// Optional: Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Show notification or perform action when extension icon is clicked
  console.log('Extension icon clicked on tab:', tab.id);
});
