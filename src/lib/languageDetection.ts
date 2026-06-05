/**
 * CorrectNow Language Detection — Gemini Backend
 *
 * All detection is delegated to POST /api/detect-language.
 * CLD3 and heuristic paths have been removed; this module is now a
 * thin adapter between the hook and the backend.
 *
 * Design principles:
 *  • Never crashes the editor — every code path has try/catch
 *  • Falls back to { language: "auto", confidence: 0, isReliable: false }
 *    on any network/parse error
 *  • Manual user selection is always respected (consumers handle this)
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DetectionResult {
  /** ISO-639-1 language code, or "auto" if detection failed/unconfident */
  language: string;
  /** 0–1 confidence score */
  confidence: number;
  /** Whether result is reliable enough for auto-applying */
  isReliable: boolean;
  /** Detection method used */
  source: "gemini" | "fallback";
}

// ─── Configuration ────────────────────────────────────────────────────────────

/** Minimum character count before we attempt detection */
export const DETECTION_MIN_CHARS = 20;

/** Debounce delay (ms) for detection on text change */
export const DETECTION_DEBOUNCE_MS = 600;

// ─── Fallback result ──────────────────────────────────────────────────────────

const FALLBACK: DetectionResult = {
  language: "auto",
  confidence: 0,
  isReliable: false,
  source: "fallback",
};

// ─── Gemini backend helper ────────────────────────────────────────────────────

/**
 * POST text to /api/detect-language and return a DetectionResult.
 * The backend returns { code: string } — we normalise it here.
 * Returns FALLBACK on any error.
 */
export const detectLanguageViaGemini = async (text: string): Promise<DetectionResult> => {
  try {
    const res = await fetch("/api/detect-language", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) return FALLBACK;

    const data = await res.json() as { code?: string };
    const code = typeof data?.code === "string" ? data.code.trim() : "auto";

    if (!code || code === "auto") return FALLBACK;

    return {
      language: code,
      confidence: 0.92,   // Gemini is authoritative; use a stable high-confidence value
      isReliable: true,
      source: "gemini",
    };
  } catch {
    return FALLBACK;
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect language of `text` via the Gemini backend.
 * Returns FALLBACK for short inputs or on API failure.
 */
export const detectLanguage = async (text: string): Promise<DetectionResult> => {
  if (!text || text.trim().length < DETECTION_MIN_CHARS) return FALLBACK;
  return detectLanguageViaGemini(text);
};

/**
 * "Fast" detection — kept for API compatibility.
 * There is no synchronous path anymore; callers should treat the returned
 * value as a placeholder and await the async `detectLanguage` result.
 */
export const detectLanguageFast = (_text: string): DetectionResult => FALLBACK;

/**
 * Format a DetectionResult for display: "Detected: Tamil (92%)"
 */
export const formatDetectionLabel = (result: DetectionResult, languageName: string): string => {
  if (result.language === "auto" || !result.isReliable) return "";
  const pct = Math.round(result.confidence * 100);
  return `Detected: ${languageName} (${pct}%)`;
};
