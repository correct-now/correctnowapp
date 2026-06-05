/**
 * useLanguageDetection
 *
 * React hook that drives automatic language detection for the CorrectNow editors.
 *
 * Behaviour:
 *  1. Does nothing until text reaches DETECTION_MIN_CHARS characters.
 *  2. Debounces by DETECTION_DEBOUNCE_MS ms to avoid calling on every keystroke.
 *  3. Calls the Gemini backend (/api/detect-language) for the result.
 *  4. Respects `isManualMode` — when the user has explicitly chosen a language,
 *     detection is suppressed entirely (zero interference with manual selection).
 *  5. All exceptions are caught — the editor always remains functional.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DetectionResult,
  DETECTION_DEBOUNCE_MS,
  DETECTION_MIN_CHARS,
  detectLanguage,
} from "@/lib/languageDetection";

export interface LanguageDetectionState {
  /** Detected ISO-639-1 code, or "auto" if undetected */
  detectedLanguage: string;
  /** 0–1 confidence score */
  detectedConfidence: number;
  /** True while the Gemini API call is in-flight */
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
   * Callback invoked when a reliable result arrives.
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

  // Track whether the component is still mounted — prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runDetection = useCallback(async (input: string) => {
    if (!mountedRef.current) return;

    // Show "detecting" spinner while the API call is in-flight
    setState((prev) => ({ ...prev, isDetecting: true }));

    try {
      const result = await detectLanguage(input);
      if (!mountedRef.current) return;

      setState({
        detectedLanguage: result.language,
        detectedConfidence: result.confidence,
        isDetecting: false,
        detectionResult: result,
      });

      if (result.isReliable && result.language !== "auto") {
        onDetectedRef.current?.(result);
      }
    } catch {
      // API failure — reset to neutral state, never block the editor
      if (mountedRef.current) {
        setState(INITIAL_STATE);
      }
    }
  }, []);

  useEffect(() => {
    // Suppress when user has manually selected a language
    if (isManualMode) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setState(INITIAL_STATE);
      return;
    }

    // Below minimum threshold — reset silently
    if (!text || text.trim().length < DETECTION_MIN_CHARS) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setState(INITIAL_STATE);
      return;
    }

    // Debounce: wait for the user to pause typing before calling the API
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
