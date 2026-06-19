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
  const result = await new Promise((res) =>
    chrome.storage.local.get(['authToken', 'authUser', 'tokenExpiresAt'], res)
  );
  const { authToken, authUser, tokenExpiresAt } = result;

  // No session at all → nothing to do.
  if (!authToken || !authUser) return null;

  // Still comfortably valid → keep using it.
  const now = Date.now();
  if ((tokenExpiresAt || 0) - now > 60 * 1000) return authToken;

  // Expired / about to expire → mint a fresh one from the refresh token.
  console.log('⚠️ Token expiring — self-refreshing…');
  const fresh = await refreshIdToken();
  return fresh || authToken; // fall back to the (possibly stale) token
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
async function saveAuthToken(token, user, opts = {}) {
  return new Promise((resolve, reject) => {
    // Firebase ID tokens last ~1h. Refresh a couple of minutes early.
    const ttlMs = (Number(opts.expiresInSec) > 0 ? Number(opts.expiresInSec) * 1000 : 60 * 60 * 1000);
    const expiresAt = Date.now() + ttlMs - 2 * 60 * 1000;

    const payload = {
      authToken: token,
      authUser: user,
      tokenExpiresAt: expiresAt,
      guestMode: false,
    };
    // Persist the long-lived refresh token + Firebase API key so the extension
    // can mint fresh ID tokens on its own — the key to a PERMANENT session.
    // Only overwrite when provided (a server token-refresh won't resend these).
    if (opts.refreshToken) payload.firebaseRefreshToken = opts.refreshToken;
    if (opts.apiKey) payload.firebaseApiKey = opts.apiKey;

    chrome.storage.local.set(payload, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        console.log('✅ Auth token saved');
        chrome.runtime.sendMessage({ action: 'authStateChanged', user }).catch(() => {});
        resolve();
      }
    });
  });
}

/**
 * Mint a fresh Firebase ID token from the stored refresh token using Google's
 * Secure Token endpoint. Refresh tokens are long-lived (only invalidated by
 * sign-out / password change / revocation), so this keeps the extension logged
 * in PERMANENTLY without the website tab needing to be open.
 * Returns the new ID token, or null if refresh isn't possible.
 */
async function refreshIdToken() {
  const store = await new Promise((res) =>
    chrome.storage.local.get(['firebaseRefreshToken', 'firebaseApiKey', 'authUser'], res)
  );
  const { firebaseRefreshToken, firebaseApiKey, authUser } = store;
  if (!firebaseRefreshToken || !firebaseApiKey) {
    console.warn('⚠️ No refresh token / API key stored — cannot self-refresh');
    return null;
  }
  try {
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(firebaseRefreshToken)}`,
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn('⚠️ Secure-token refresh failed:', res.status, errText);
      // A 400 with TOKEN_EXPIRED / USER_DISABLED / invalid_grant means the
      // refresh token is dead — only then is re-login genuinely required.
      if (/invalid_grant|TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND/i.test(errText)) {
        await logout();
      }
      return null;
    }
    const data = await res.json();
    const newIdToken = data.id_token;
    const newRefresh = data.refresh_token || firebaseRefreshToken;
    const expiresInSec = Number(data.expires_in) || 3600;
    if (!newIdToken) return null;
    await saveAuthToken(newIdToken, authUser, { refreshToken: newRefresh, expiresInSec });
    console.log('✅ ID token self-refreshed via secure-token endpoint');
    return newIdToken;
  } catch (err) {
    console.warn('⚠️ Secure-token refresh error:', err.message);
    return null;
  }
}

/**
 * Logout user - clear stored auth data
 */
async function logout() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(['authToken', 'authUser', 'tokenExpiresAt', 'firebaseRefreshToken', 'firebaseApiKey'], () => {
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
    // Store the refresh token + Firebase API key the website sends, so the
    // extension can self-renew its ID token forever (permanent session).
    saveAuthToken(request.token, request.user, {
      refreshToken: request.refreshToken,
      apiKey: request.apiKey,
      expiresInSec: request.expiresInSec,
    })
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
    // Backend returns the full language NAME ({ language: "Pashto" }).
    // Older builds returned { code: "ps" }. Support both for compatibility.
    const detected = (typeof data.language === 'string' && data.language.trim())
      ? data.language.trim()
      : (typeof data.code === 'string' && data.code.trim() ? data.code.trim() : 'auto');
    console.log('🌍 Detected language:', detected);
    return detected;
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

    // Proactively ensure a fresh ID token before the request, so an expired
    // token never reaches the server in the first place.
    let effectiveAuthToken = authToken;
    if (authToken) {
      try { const fresh = await checkAndRefreshToken(); if (fresh) effectiveAuthToken = fresh; } catch (_) {}
    }

    const buildHeaders = (tok) => {
      const h = { 'Content-Type': 'application/json' };
      if (tok) {
        h['Authorization'] = `Bearer ${tok}`;
      } else if (apiKey && apiKey !== 'YOUR_API_KEY_HERE') {
        h['X-API-Key'] = apiKey;
        h['X-CorrectNow-API-Key'] = apiKey;
      }
      return h;
    };

    // Prepare request body
    const requestBody = { text: text, language: targetLanguage };
    if (userId) requestBody.userId = userId;

    const doFetch = (tok) => fetch(apiUrl, {
      method: 'POST',
      headers: buildHeaders(tok),
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    let response = await doFetch(effectiveAuthToken);

    // Reactive safety net: if the server still rejects the token (e.g. it died
    // between refresh and send), mint a brand-new one and retry ONCE before
    // ever forcing the user to log in again.
    if ((response.status === 401 || response.status === 403) && authToken) {
      console.log('🔄 Token rejected — refreshing and retrying once…');
      const refreshed = await refreshIdToken();
      if (refreshed) {
        effectiveAuthToken = refreshed;
        response = await doFetch(refreshed);
      }
    }

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
