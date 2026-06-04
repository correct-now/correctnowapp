/**
 * CorrectNow Language Detection — Production Module
 *
 * Architecture:
 *  • Primary:  Google CLD3 via `cld3-asm` (lazy-loaded WASM, ~1MB)
 *  • Fallback: Unicode-range + keyword heuristics (synchronous, zero-cost)
 *
 * Design principles:
 *  • CLD3 is loaded lazily — zero impact on initial page load
 *  • All paths are guarded with try/catch — never crashes the editor
 *  • Confidence gating prevents low-quality auto-applies
 *  • Manual user selection is always respected (consumers handle this)
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DetectionResult {
  /** BCP-47 / ISO-639-1 language code, or "auto" if detection failed/unconfident */
  language: string;
  /** 0–1 probability score */
  confidence: number;
  /** Whether confidence meets the threshold for auto-applying */
  isReliable: boolean;
  /** Detection method used */
  source: "cld3" | "heuristic" | "fallback";
}

// ─── Configuration ────────────────────────────────────────────────────────────

/** Minimum character count before we attempt detection */
export const DETECTION_MIN_CHARS = 20;

/** Debounce delay (ms) for detection on text change */
export const DETECTION_DEBOUNCE_MS = 500;

/**
 * CLD3 probability threshold above which we auto-apply the detected language.
 * 0.75 gives us a safe margin: Tamil is ~0.9999, English ~0.9983.
 */
export const CONFIDENCE_THRESHOLD = 0.75;

// ─── CLD3 singleton ───────────────────────────────────────────────────────────

type Cld3Factory = {
  create: (minBytes: number, maxBytes: number) => {
    findLanguage: (text: string) => { language: string; probability: number; is_reliable: boolean };
    findMostFrequentLanguages: (text: string, n: number) => Array<{ language: string; probability: number; is_reliable: boolean }>;
  };
};

let cld3Factory: Cld3Factory | null = null;
let cld3LoadPromise: Promise<Cld3Factory | null> | null = null;

/**
 * Lazily loads the CLD3 WASM module. Safe to call multiple times — returns
 * the same promise on subsequent calls. Returns null on failure (fallback applies).
 */
const loadCld3 = (): Promise<Cld3Factory | null> => {
  if (cld3Factory) return Promise.resolve(cld3Factory);
  if (cld3LoadPromise) return cld3LoadPromise;

  cld3LoadPromise = (async () => {
    try {
      const { loadModule } = await import("cld3-asm");
      const factory = await loadModule();
      cld3Factory = factory as unknown as Cld3Factory;
      return cld3Factory;
    } catch (err) {
      // Non-fatal: fall through to heuristic detection
      if (process.env.NODE_ENV !== "production") {
        console.warn("[LanguageDetection] CLD3 failed to load, using heuristic fallback:", err);
      }
      return null;
    }
  })();

  return cld3LoadPromise;
};

// Eagerly start loading CLD3 in the background so it's ready when needed.
if (typeof window !== "undefined") {
  // Use requestIdleCallback when available to avoid competing with critical renders
  const scheduleLoad = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2000));
  scheduleLoad(() => { loadCld3().catch(() => {}); });
}

// ─── CLD3 code normaliser ─────────────────────────────────────────────────────

/**
 * CLD3 returns IETF BCP-47 tags. Normalise to the codes used in LANGUAGE_OPTIONS.
 */
const normaliseCld3Code = (code: string): string => {
  const base = code.split("-")[0].toLowerCase();
  const map: Record<string, string> = {
    "zh":    "zh",    // Mandarin (both simplified and traditional → "zh")
    "sr":    "sr",
    "bs":    "bs",
    "nb":    "no",    // Norwegian Bokmål → Norwegian
    "nn":    "no",    // Norwegian Nynorsk → Norwegian
    "iw":    "he",    // legacy Hebrew code
    "jv":    "jw",    // Javanese (CLD3 uses "jv", we use "jw")
    "fil":   "tl",    // Filipino → Tagalog
    "in":    "id",    // legacy Indonesian
    "mo":    "ro",    // Moldavian → Romanian
  };
  return map[base] ?? base;
};

// ─── CLD3 detection ───────────────────────────────────────────────────────────

/**
 * Detect language using CLD3. Returns null if CLD3 is unavailable or the
 * detection is unreliable (callers should fall through to heuristics).
 */
const detectWithCld3 = async (text: string): Promise<DetectionResult | null> => {
  try {
    const factory = await loadCld3();
    if (!factory) return null;

    const detector = factory.create(0, 1000);
    const result = detector.findLanguage(text);

    const language = normaliseCld3Code(result.language);
    const confidence = result.probability ?? 0;

    return {
      language,
      confidence,
      isReliable: confidence >= CONFIDENCE_THRESHOLD && result.is_reliable,
      source: "cld3",
    };
  } catch {
    return null;
  }
};

// ─── Heuristic detection (synchronous fallback) ───────────────────────────────

/**
 * Fast Unicode-range and keyword-based detection.
 * Returns high confidence for non-Latin scripts (Unicode range is definitive).
 * Returns lower confidence for Latin-script languages (keyword-based).
 */
export const detectLanguageHeuristic = (text: string): DetectionResult => {
  const t = text.trim();
  if (!t) return { language: "auto", confidence: 0, isReliable: false, source: "fallback" };

  // ── Non-Latin scripts (Unicode ranges are definitive → high confidence) ──

  if (/[஀-௿]/.test(t))
    return { language: "ta", confidence: 0.95, isReliable: true, source: "heuristic" };

  if (/[ऀ-ॿ]/.test(t)) {
    // Distinguish Hindi vs Marathi by common words
    const isMarathi = /\b(आहे|नाही|मी|तू|आपण|हे|ते)\b/.test(t);
    return { language: isMarathi ? "mr" : "hi", confidence: 0.90, isReliable: true, source: "heuristic" };
  }

  if (/[ঀ-৿]/.test(t))
    return { language: "bn", confidence: 0.95, isReliable: true, source: "heuristic" };

  if (/[ఀ-౿]/.test(t))
    return { language: "te", confidence: 0.95, isReliable: true, source: "heuristic" };

  if (/[ಀ-೿]/.test(t))
    return { language: "kn", confidence: 0.95, isReliable: true, source: "heuristic" };

  if (/[ഀ-ൿ]/.test(t))
    return { language: "ml", confidence: 0.95, isReliable: true, source: "heuristic" };

  if (/[઀-૿]/.test(t))
    return { language: "gu", confidence: 0.95, isReliable: true, source: "heuristic" };

  if (/[਀-੿]/.test(t))
    return { language: "pa", confidence: 0.90, isReliable: true, source: "heuristic" };

  // Arabic / Farsi / Urdu disambiguation
  if (/[؀-ۿ]/.test(t)) {
    if (/\b(میں|ہے|نہیں|آپ|اور|کیا|نے)\b/.test(t))
      return { language: "ur", confidence: 0.88, isReliable: true, source: "heuristic" };
    if (/\b(است|نیست|این|برای|شما|که)\b/.test(t))
      return { language: "fa", confidence: 0.88, isReliable: true, source: "heuristic" };
    return { language: "ar", confidence: 0.90, isReliable: true, source: "heuristic" };
  }

  if (/[֐-׿]/.test(t))
    return { language: "he", confidence: 0.95, isReliable: true, source: "heuristic" };

  if (/[฀-๿]/.test(t))
    return { language: "th", confidence: 0.95, isReliable: true, source: "heuristic" };

  if (/[一-鿿㐀-䶿]/.test(t))
    return { language: "zh", confidence: 0.92, isReliable: true, source: "heuristic" };

  if (/[぀-ヿ]/.test(t))
    return { language: "ja", confidence: 0.95, isReliable: true, source: "heuristic" };

  if (/[가-힯ᄀ-ᇿ]/.test(t))
    return { language: "ko", confidence: 0.95, isReliable: true, source: "heuristic" };

  if (/[Ѐ-ӿ]/.test(t)) {
    if (/\b(і|є|та|що|як|або|яка)\b/.test(t))
      return { language: "uk", confidence: 0.82, isReliable: true, source: "heuristic" };
    if (/\b(і|ці|гэта|як|але|або)\b/.test(t))
      return { language: "be", confidence: 0.78, isReliable: false, source: "heuristic" };
    return { language: "ru", confidence: 0.85, isReliable: true, source: "heuristic" };
  }

  // ── Latin-script languages (lower confidence, keyword-based) ──

  const count = (patterns: RegExp[]) =>
    patterns.reduce((n, p) => n + (p.test(t) ? 1 : 0), 0);

  if (/[àâçéèêëîïôùûüÿœæ]/i.test(t) && count([/\b(le|la|les|de|des|et|en|un|une)\b/i, /\b(pour|avec|dans|sur)\b/i]) >= 1)
    return { language: "fr", confidence: 0.82, isReliable: true, source: "heuristic" };

  if (/[äöüß]/i.test(t) && count([/\b(der|die|das|und|ist|nicht|ein|eine)\b/i, /\b(mit|für|auf|von)\b/i]) >= 1)
    return { language: "de", confidence: 0.82, isReliable: true, source: "heuristic" };

  if (/[ñÑáÁéÉíÍóÓúÚüÜ¿¡]/u.test(t) && count([/\b(el|la|los|las|de|y|en|un|una)\b/i]) >= 1)
    return { language: "es", confidence: 0.78, isReliable: true, source: "heuristic" };

  if (/[ãõçàáâêéíóôúü]/i.test(t) && count([/\b(de|e|o|a|em|um|uma|não|para)\b/i]) >= 1)
    return { language: "pt", confidence: 0.76, isReliable: true, source: "heuristic" };

  if (/[äöå]/i.test(t) && /\b(och|det|är|att|en|ett|på|av)\b/i.test(t))
    return { language: "sv", confidence: 0.76, isReliable: true, source: "heuristic" };

  if (/[æøå]/i.test(t) && /\b(og|er|det|en|til|for|ikke|med)\b/i.test(t))
    return { language: "no", confidence: 0.75, isReliable: true, source: "heuristic" };

  if (/[æøå]/i.test(t) && /\b(og|er|det|en|til|at|ikke|med)\b/i.test(t))
    return { language: "da", confidence: 0.74, isReliable: false, source: "heuristic" };

  if (/[ąćęłńóśźż]/i.test(t) && /\b(i|w|z|do|na|że|się)\b/i.test(t))
    return { language: "pl", confidence: 0.80, isReliable: true, source: "heuristic" };

  if (/[áčďéěíňóřšťúůýž]/i.test(t) && /\b(je|to|v|a|na|se|pro)\b/i.test(t))
    return { language: "cs", confidence: 0.78, isReliable: true, source: "heuristic" };

  if (/[ăâîșțĂÂÎȘȚ]/u.test(t) && /\b(și|în|la|de|cu|un|o|al)\b/i.test(t))
    return { language: "ro", confidence: 0.78, isReliable: true, source: "heuristic" };

  if (/[çğıöşü]/i.test(t) && /\b(ve|bir|bu|o|da|de|ile|için)\b/i.test(t))
    return { language: "tr", confidence: 0.80, isReliable: true, source: "heuristic" };

  if (/[ăâîșț]/u.test(t))
    return { language: "ro", confidence: 0.70, isReliable: false, source: "heuristic" };

  // Fallback to English for pure Latin script
  if (/[A-Za-z]/.test(t))
    return { language: "en", confidence: 0.60, isReliable: false, source: "heuristic" };

  return { language: "auto", confidence: 0, isReliable: false, source: "fallback" };
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect language of `text`.
 *
 * - Returns a heuristic result synchronously (via `fastDetect`).
 * - The returned promise resolves with CLD3 result when the WASM module is ready.
 *
 * @param text  Input text (must be ≥ DETECTION_MIN_CHARS for reliable results)
 */
export const detectLanguage = async (text: string): Promise<DetectionResult> => {
  if (!text || text.trim().length < DETECTION_MIN_CHARS) {
    return { language: "auto", confidence: 0, isReliable: false, source: "fallback" };
  }

  // Try CLD3 first (most accurate)
  const cld3Result = await detectWithCld3(text);
  if (cld3Result && cld3Result.isReliable) {
    return cld3Result;
  }

  // Fall through to heuristics
  const heuristic = detectLanguageHeuristic(text);

  // If CLD3 returned a result but below threshold, blend with heuristic
  if (cld3Result && cld3Result.language !== "auto") {
    // Prefer CLD3 code but use its probability
    if (cld3Result.confidence > heuristic.confidence) {
      return { ...cld3Result, isReliable: cld3Result.confidence >= CONFIDENCE_THRESHOLD };
    }
  }

  return heuristic;
};

/**
 * Synchronous fast detection (no CLD3). Use for immediate UI feedback
 * before the async CLD3 result arrives.
 */
export const detectLanguageFast = (text: string): DetectionResult => {
  if (!text || text.trim().length < DETECTION_MIN_CHARS) {
    return { language: "auto", confidence: 0, isReliable: false, source: "fallback" };
  }
  return detectLanguageHeuristic(text);
};

/**
 * Format a DetectionResult for display: "Detected: Tamil (99%)"
 */
export const formatDetectionLabel = (result: DetectionResult, languageName: string): string => {
  if (result.language === "auto" || !result.isReliable) return "";
  const pct = Math.round(result.confidence * 100);
  return `Detected: ${languageName} (${pct}%)`;
};
