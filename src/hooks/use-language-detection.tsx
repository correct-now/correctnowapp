/**
 * useLanguageDetection
 *
 * React hook that drives automatic language detection for the CorrectNow editors.
 *
 * Behaviour:
 *  1. Does nothing until text reaches DETECTION_MIN_CHARS characters.
 *  2. Debounces by DETECTION_DEBOUNCE_MS ms to avoid detecting on every keystroke.
 *  3. Runs fast synchronous heuristic detection first for immediate UI feedback.
 *  4. Runs async CLD3 detection; updates result when it completes.
 *  5. Respects `isManualMode` — when the user has explicitly chosen a language,
 *     detection is suppressed entirely (zero interference with manual selection).
 *  6. All exceptions are caught — the editor always remains functional.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DetectionResult,
  DETECTION_DEBOUNCE_MS,
  DETECTION_MIN_CHARS,
  detectLanguage,
  detectLanguageFast,
} from "@/lib/languageDetection";

export interface LanguageDetectionState {
  /** Detected ISO-639-1 code, or "auto" if undetected */
  detectedLanguage: string;
  /** 0–1 confidence score */
  detectedConfidence: number;
  /** True once CLD3 async pass has completed */
  isDetecting: boolean;
  /** Full detection result for consumers who need it */
  detectionResult: DetectionResult | null;
}

interface UseLanguageDetectionOptions {
  /** Current text in the editor */
  text: string;
  /**
   * When true, detection is suppressed — the user has manually selected a language.
   * Set this to `languageMode === "manual"`.
   */
  isManualMode: boolean;
  /**
   * Callback invoked when a high-confidence result arrives.
   * Consumers should call `setLanguage` here.
   */
  onDetected?: (result: DetectionResult) => void;
}

const INITIAL_STATE: LanguageDetectionState = {
  detectedLanguage: "auto",
  detectedConfidence: 0,
  isDetecting: false,
  detectionResult: null,
};

export const useLanguageDetection = ({
  text,
  isManualMode,
  onDetected,
}: UseLanguageDetectionOptions): LanguageDetectionState => {
  const [state, setState] = useState<LanguageDetectionState>(INITIAL_STATE);

  // Stable ref so the debounced callback always closes over the latest value
  const onDetectedRef = useRef(onDetected);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  // Track whether we're still mounted — prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runDetection = useCallback(async (input: string) => {
    if (!mountedRef.current) return;
    if (input.trim().length < DETECTION_MIN_CHARS) {
      setState(INITIAL_STATE);
      return;
    }

    // ── Fast sync heuristic pass (immediate) ──
    const fast = detectLanguageFast(input);
    if (mountedRef.current) {
      setState({
        detectedLanguage: fast.language,
        detectedConfidence: fast.confidence,
        isDetecting: true, // CLD3 still in flight
        detectionResult: fast,
      });
      if (fast.isReliable) {
        onDetectedRef.current?.(fast);
      }
    }

    // ── Async CLD3 pass (more accurate) ──
    try {
      const cld3 = await detectLanguage(input);
      if (!mountedRef.current) return;

      setState({
        detectedLanguage: cld3.language,
        detectedConfidence: cld3.confidence,
        isDetecting: false,
        detectionResult: cld3,
      });

      if (cld3.isReliable) {
        onDetectedRef.current?.(cld3);
      }
    } catch {
      // CLD3 failed — keep the heuristic result
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, isDetecting: false }));
      }
    }
  }, []);

  useEffect(() => {
    // Suppress when user has manually selected a language
    if (isManualMode) {
      setState(INITIAL_STATE);
      return;
    }

    // Below minimum threshold — reset
    if (!text || text.trim().length < DETECTION_MIN_CHARS) {
      setState(INITIAL_STATE);
      return;
    }

    // Debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runDetection(text);
    }, DETECTION_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, isManualMode, runDetection]);

  return state;
};
