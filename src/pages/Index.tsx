import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FileText, Search, Star, LogOut, User, Menu, Archive, MoreVertical, Trash2, RotateCcw, Settings, Pencil, Crown, Upload, ChevronDown, Sparkles, BookOpen, Type, CheckCircle2, Eye, MessageSquare, Lightbulb, Shield, Globe, Zap, Monitor, ArrowRight, PlayCircle } from "lucide-react";
import { archiveDocById, deleteArchivedDocPermanently, deleteArchivedDocsPermanently, formatUpdated, getDocs, getDocById, renameDoc, restoreDocById, sectionForDate } from "@/lib/docs";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getEffectivePlan } from "@/lib/entitlements";
import LanguageSelector from "@/components/LanguageSelector";
import { addSuggestion } from "@/lib/suggestions";
import { toast } from "sonner";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { deleteUser, onAuthStateChanged, signOut } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs as getFirestoreDocs, onSnapshot, setDoc } from "firebase/firestore";
import { clearSessionId } from "@/lib/session";
import { detectCountryCode, formatPrice, resolvePricing, type RegionalPricing } from "@/lib/pricing";
import { useLanguageDetection } from "@/hooks/use-language-detection";
import { detectLanguageViaGemini, DETECTION_MIN_CHARS } from "@/lib/languageDetection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Index = () => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const [docs, setDocs] = useState<Array<{
    id: string;
    title: string;
    preview: string;
    text: string;
    updatedAt: string;
    archivedAt?: string;
    section: string;
    updated: string;
  }>>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [suggestionText, setSuggestionText] = useState("");
  const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("User");
  const [sidebarView, setSidebarView] = useState<"docs" | "archived" | "account">("docs");
  const [userProfile, setUserProfile] = useState<{
    plan: string;
    wordLimit: number;
    credits: number;
    creditsUsed: number;
    subscriptionStatus: string;
    addonCredits: number;
    addonCreditsExpiryAt: string | null;
    adminCredits: number;
    adminCreditsExpiryAt: string | null;
    subscriptionCurrentPeriodEnd: string | null;
    adminPlanExpiresAt: string | null;
    razorpaySubscriptionId: string | null;
    stripeSubscriptionId: string | null;
  } | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<Set<string>>(new Set());
  const [docFilter, setDocFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [regionalPricing, setRegionalPricing] = useState<RegionalPricing>(() => resolvePricing(""));
  const getInlineEditorVisible = () => false;
  const [isInlineEditorVisible, setIsInlineEditorVisible] = useState(getInlineEditorVisible);
  const [miniEditorText, setMiniEditorText] = useState("");
  const [miniEditorTitle, setMiniEditorTitle] = useState("Untitled Document");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  const [miniEditorLanguage, setMiniEditorLanguage] = useState("any");
  const [miniEditorLanguageMode, setMiniEditorLanguageMode] = useState<"auto" | "manual">("manual");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [miniIsLoading, setMiniIsLoading] = useState(false);
  const [miniHasResults, setMiniHasResults] = useState(false);
  const [miniChanges, setMiniChanges] = useState<Array<{ original: string; corrected: string; explanation: string; type: string; status: string }>>([]);
  const [miniCorrectedText, setMiniCorrectedText] = useState("");
  const miniTextareaRef = useRef<HTMLTextAreaElement>(null);
  const miniHighlightRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const miniHoverTimerRef = useRef<number | null>(null);
  const miniHoverCloseTimerRef = useRef<number | null>(null);
  const [miniIsHoverPopover, setMiniIsHoverPopover] = useState(false);
  const [miniHoveredError, setMiniHoveredError] = useState<string | null>(null);
  const [miniHoverSuggestion, setMiniHoverSuggestion] = useState<{
    open: boolean; top: number; left: number; changeIdx?: number; original: string;
  }>({ open: false, top: 0, left: 0, original: "" });

  useEffect(() => {
    setIsInlineEditorVisible(false);
  }, []);

  // ── Gemini auto-detection for dashboard mini-editor ─────────────────────
  const {
    detectedLanguage: miniDetectedLanguage,
    detectedConfidence: miniDetectedConfidence,
  } = useLanguageDetection({
    text: miniEditorText,
    isManualMode: miniEditorLanguageMode === "manual",
    onDetected: (result) => {
      if (miniEditorLanguageMode === "manual") return;
      if (result.isReliable && result.language !== "auto") {
        setMiniEditorLanguage(result.language);
      }
    },
  });
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const auth = getFirebaseAuth();
    let unsubscribeProfile: (() => void) | null = null;
    
    const unsub = auth
      ? onAuthStateChanged(auth, (user) => {
          setIsAuthenticated(Boolean(user));
          setUserEmail(user?.email || "");
          setUserName(user?.displayName || "User");
          
          // Clean up previous profile listener if exists
          if (unsubscribeProfile) {
            unsubscribeProfile();
            unsubscribeProfile = null;
          }
          
          // Only load docs for authenticated users
          if (user) {
            const userDocs = getDocs().map((doc) => ({
              ...doc,
              archivedAt: typeof (doc as any).archivedAt === "string" ? (doc as any).archivedAt : undefined,
              section: sectionForDate(doc.updatedAt),
              updated: formatUpdated(doc.updatedAt),
            }));
            setDocs(userDocs);
          } else {
            // Clear docs for non-authenticated users
            setDocs([]);
          }
          
          // Fetch user profile from Firestore with real-time updates
          if (user) {
            setIsLoadingProfile(true);
            const db = getFirebaseDb();
            if (db) {
              // Set up real-time listener for user profile
              unsubscribeProfile = onSnapshot(
                doc(db, "users", user.uid),
                (userDoc) => {
                  if (userDoc.exists()) {
                    const data = userDoc.data();
                    const planField = String(data?.plan || "").toLowerCase();
                    const entitlementPlan =
                      Number(data?.wordLimit) >= 5000 || planField === "pro";
                    const status = String(data?.subscriptionStatus || "").toLowerCase();
                    const hasStatus = Boolean(status);
                    const updatedAt = data?.subscriptionUpdatedAt
                      ? new Date(String(data.subscriptionUpdatedAt))
                      : null;
                    const isRecent = updatedAt
                      ? Date.now() - updatedAt.getTime() <= 1000 * 60 * 60 * 24 * 31
                      : false;
                    const isActive = status === "active" && (updatedAt ? isRecent : true);
                    const effectivePlan = (hasStatus ? isActive && entitlementPlan : entitlementPlan)
                      ? "pro"
                      : "free";

                    setUserProfile({
                      plan: effectivePlan,
                      wordLimit: data.wordLimit || 1000,
                      credits: data.credits || 0,
                      creditsUsed: data.creditsUsed || 0,
                      subscriptionStatus: data.subscriptionStatus || "inactive",
                      addonCredits: data.addonCredits || 0,
                      addonCreditsExpiryAt: data.addonCreditsExpiryAt || null,
                      adminCredits: data.adminCredits || 0,
                      adminCreditsExpiryAt: data.adminCreditsExpiryAt || null,
                      subscriptionCurrentPeriodEnd: data.subscriptionCurrentPeriodEnd || null,
                      adminPlanExpiresAt: data.adminPlanExpiresAt || null,
                      razorpaySubscriptionId: data.razorpaySubscriptionId || null,
                      stripeSubscriptionId: data.stripeSubscriptionId || null,
                    });
                  } else {
                    // User document doesn't exist, set defaults
                    console.log("User document not found, using defaults");
                    setUserProfile({
                      plan: "free",
                      wordLimit: 1000,
                      credits: 0,
                      creditsUsed: 0,
                      subscriptionStatus: "inactive",
                      addonCredits: 0,
                      addonCreditsExpiryAt: null,
                      adminCredits: 0,
                      adminCreditsExpiryAt: null,
                      subscriptionCurrentPeriodEnd: null,
                      adminPlanExpiresAt: null,
                      razorpaySubscriptionId: null,
                      stripeSubscriptionId: null,
                    });
                  }
                  setIsLoadingProfile(false);
                },
                (error) => {
                  console.error("Error in profile listener:", error);
                  
                  // Handle permission errors (user might have been deleted or switched accounts)
                  if (error.code === "permission-denied" || error.message?.includes("permission")) {
                    console.log("Permission denied - user may have switched accounts");
                    setUserProfile(null);
                    setIsLoadingProfile(false);
                    return;
                  }
                  
                  // Set defaults on other errors
                  setUserProfile({
                    plan: "free",
                    wordLimit: 1000,
                    credits: 0,
                    creditsUsed: 0,
                    subscriptionStatus: "inactive",
                    addonCredits: 0,
                    addonCreditsExpiryAt: null,
                    adminCredits: 0,
                    adminCreditsExpiryAt: null,
                    subscriptionCurrentPeriodEnd: null,
                    adminPlanExpiresAt: null,
                    razorpaySubscriptionId: null,
                    stripeSubscriptionId: null,
                  });
                  setIsLoadingProfile(false);
                }
              );
            } else {
              // Database not available
              setIsLoadingProfile(false);
            }
          } else {
            setUserProfile(null);
            setIsLoadingProfile(false);
          }
          
          setIsAuthLoading(false);
        })
      : undefined;
    
    if (!auth) {
      setIsAuthLoading(false);
    }

    const loadDocs = () =>
      setDocs(
        getDocs().map((doc) => ({
          ...doc,
          archivedAt: typeof (doc as any).archivedAt === "string" ? (doc as any).archivedAt : undefined,
          section: sectionForDate(doc.updatedAt),
          updated: formatUpdated(doc.updatedAt),
        }))
      );

    loadDocs();

    const handleFocus = () => loadDocs();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "correctnow:docs") {
        loadDocs();
      }
    };
    const handleDocsUpdated = () => loadDocs();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("correctnow:docs-updated", handleDocsUpdated);

    return () => {
      if (unsub) unsub();
      if (unsubscribeProfile) unsubscribeProfile();
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("correctnow:docs-updated", handleDocsUpdated);
    };
  }, [location.key]);

  useEffect(() => {
    detectCountryCode().then((code) => setRegionalPricing(resolvePricing(code)));
  }, []);

  const { activeDocs, archivedDocs } = useMemo(() => {
    const active = docs.filter((d) => !d.archivedAt);
    const archived = docs
      .filter((d) => Boolean(d.archivedAt))
      .sort((a, b) => String(b.archivedAt || "").localeCompare(String(a.archivedAt || "")));
    return { activeDocs: active, archivedDocs: archived };
  }, [docs]);

  const filtered = useMemo(() => {
    const source = sidebarView === "archived" ? archivedDocs : activeDocs;
    const now = new Date();
    return source.filter((doc) => {
      if (!`${doc.title} ${doc.preview}`.toLowerCase().includes(query.toLowerCase())) return false;
      if (sidebarView !== "archived" && docFilter !== "all") {
        const updated = new Date(doc.updatedAt);
        const diffDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
        if (docFilter === "today" && diffDays >= 1) return false;
        if (docFilter === "week" && diffDays >= 7) return false;
        if (docFilter === "month" && diffDays >= 30) return false;
      }
      return true;
    });
  }, [activeDocs, archivedDocs, query, sidebarView, docFilter]);

  useEffect(() => {
    if (sidebarView !== "archived") {
      setSelectedArchivedIds(new Set());
    } else {
      // Drop selections that are no longer in Archived
      setSelectedArchivedIds((prev) => {
        const archivedIdSet = new Set(archivedDocs.map((d) => d.id));
        const next = new Set<string>();
        for (const id of prev) {
          if (archivedIdSet.has(id)) next.add(id);
        }
        return next;
      });
    }

    if (sidebarView !== "docs") {
      setSelectedDocIds(new Set());
    } else {
      // Drop selections that are no longer in Docs (e.g., archived)
      setSelectedDocIds((prev) => {
        const activeIdSet = new Set(activeDocs.map((d) => d.id));
        const next = new Set<string>();
        for (const id of prev) {
          if (activeIdSet.has(id)) next.add(id);
        }
        return next;
      });
    }
  }, [sidebarView, archivedDocs, activeDocs]);

  const toggleDocSelected = (id: string, checked: boolean) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAllVisibleDocs = () => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((d) => next.add(d.id));
      return next;
    });
  };

  const clearDocSelection = () => setSelectedDocIds(new Set());

  const archiveSelectedDocs = async () => {
    const ids = Array.from(selectedDocIds);
    if (!ids.length) return;
    const confirmed = window.confirm(`Archive ${ids.length} document(s)?`);
    if (!confirmed) return;
    try {
      await Promise.all(ids.map((id) => archiveDocById(id)));
      setSelectedDocIds(new Set());
      toast.success("Archived selected docs");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive docs");
    }
  };

  const archiveAllDocs = async () => {
    if (!activeDocs.length) return;
    const confirmed = window.confirm(`Archive ALL ${activeDocs.length} document(s)?`);
    if (!confirmed) return;
    try {
      await Promise.all(activeDocs.map((d) => archiveDocById(d.id)));
      setSelectedDocIds(new Set());
      toast.success("Archived all docs");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive docs");
    }
  };

  const toggleArchivedSelected = (id: string, checked: boolean) => {
    setSelectedArchivedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAllVisibleArchived = () => {
    setSelectedArchivedIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((d) => next.add(d.id));
      return next;
    });
  };

  const clearArchivedSelection = () => setSelectedArchivedIds(new Set());

  const deleteSelectedArchived = async () => {
    const ids = Array.from(selectedArchivedIds);
    if (!ids.length) return;
    const confirmed = window.confirm(
      `Delete ${ids.length} archived document(s) permanently? This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await deleteArchivedDocsPermanently(ids);
      setSelectedArchivedIds(new Set());
      toast.success("Deleted selected archived docs");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete archived docs");
    }
  };

  const deleteAllArchived = async () => {
    if (!archivedDocs.length) return;
    const confirmed = window.confirm(
      `Delete ALL ${archivedDocs.length} archived document(s) permanently? This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await deleteArchivedDocsPermanently(archivedDocs.map((d) => d.id));
      setSelectedArchivedIds(new Set());
      toast.success("Deleted all archived docs");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete archived docs");
    }
  };

  const sections = useMemo(
    () =>
      ["Today", "Yesterday"].filter((section) =>
        filtered.some((doc) => doc.section === section)
      ),
    [filtered]
  );

  const openDoc = (id: string) => {
    const doc = getDocById(id);
    if (!doc) return;

    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    // On mobile/smaller screens the inline editor is hidden — open the full editor route instead
    if (!isInlineEditorVisible) {
      navigate("/editor", { state: { id } });
      return;
    }

    // Desktop/XL: keep inline editor behavior
    setSelectedDocId(id);
    setMiniEditorTitle(doc.title || "Untitled Document");
    setMiniEditorText(doc.text || "");
    setMiniHasResults(false);
    setMiniChanges([]);
    setMiniCorrectedText("");
    setMiniEditorLanguage("any");
    setMiniEditorLanguageMode("manual");
  };

  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const startLongPress = (id: string, isArchived: boolean) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      if (isArchived) {
        toggleArchivedSelected(id, !selectedArchivedIds.has(id));
      } else {
        toggleDocSelected(id, !selectedDocIds.has(id));
      }
      longPressTriggeredRef.current = true;
    }, 400);
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const miniHighlightHtml = useMemo(() => {
    const pending = miniChanges.filter((c) => c.status === "pending");
    let html = escapeHtml(miniEditorText).replace(/\n/g, "<br>");
    if (pending.length === 0) return html;
    const sorted = [...pending].sort((a, b) => (b.original?.length || 0) - (a.original?.length || 0));
    sorted.forEach((c) => {
      if (!c.original) return;
      const escaped = escapeHtml(c.original);
      const pattern = escaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      html = html.replace(new RegExp(pattern, "g"), `<span class="change-error">${escaped}</span>`);
    });
    return html;
  }, [miniEditorText, miniChanges]);

  const miniApplySingleChange = (text: string, original: string, corrected: string): string => {
    if (!original) return text;
    const idx = text.indexOf(original);
    if (idx !== -1) return text.slice(0, idx) + corrected + text.slice(idx + original.length);
    return text;
  };

  const handleMiniAccept = (originalIdx: number) => {
    const change = miniChanges[originalIdx];
    if (!change) return;
    const updatedText = miniApplySingleChange(miniEditorText, change.original, change.corrected);
    const updated = miniChanges.map((c, i) => {
      if (i === originalIdx) return { ...c, status: "accepted" };
      if (c.original === change.original && c.status === "pending") return { ...c, status: "ignored" };
      return c;
    });
    const revalidated = updated.map((c) => {
      if (c.status !== "pending") return c;
      if (c.original && !updatedText.includes(c.original)) return { ...c, status: "ignored" };
      return c;
    });
    setMiniEditorText(updatedText);
    setMiniChanges(revalidated);
  };

  const handleMiniIgnore = (originalIdx: number) => {
    setMiniChanges((prev) => prev.map((c, i) => i === originalIdx ? { ...c, status: "ignored" } : c));
  };

  const handleMiniAcceptAll = () => {
    let text = miniEditorText;
    const updated = miniChanges.map((c) => {
      if (c.status !== "pending") return c;
      text = miniApplySingleChange(text, c.original, c.corrected);
      return { ...c, status: "accepted" };
    });
    setMiniEditorText(text);
    setMiniChanges(updated);
  };

  const handleMiniHighlightClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains("change-error")) return;
    event.preventDefault();
    event.stopPropagation();
    const errorText = target.textContent?.trim() || "";
    if (!errorText) return;
    if (miniHoverTimerRef.current) { clearTimeout(miniHoverTimerRef.current); miniHoverTimerRef.current = null; }
    const matchIdx = miniChanges.findIndex((c) => c.status === "pending" && c.original?.trim() === errorText);
    if (matchIdx === -1) return;
    const rect = target.getBoundingClientRect();
    setMiniHoverSuggestion({ open: true, top: Math.max(8, rect.top - 8), left: Math.min(window.innerWidth - 260, rect.right + 10), changeIdx: matchIdx, original: errorText });
  };

  const handleMiniHighlightMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains("change-error")) {
      const errorText = target.textContent?.trim() || "";
      if (errorText && errorText !== miniHoveredError) {
        setMiniHoveredError(errorText);
        if (miniHoverCloseTimerRef.current) { clearTimeout(miniHoverCloseTimerRef.current); miniHoverCloseTimerRef.current = null; }
        if (miniHoverTimerRef.current) clearTimeout(miniHoverTimerRef.current);
        miniHoverTimerRef.current = window.setTimeout(() => {
          const matchIdx = miniChanges.findIndex((c) => c.status === "pending" && c.original?.trim() === errorText);
          if (matchIdx !== -1) {
            const rect = target.getBoundingClientRect();
            setMiniHoverSuggestion({ open: true, top: Math.max(8, rect.top - 8), left: Math.min(window.innerWidth - 260, rect.right + 10), changeIdx: matchIdx, original: errorText });
          }
          miniHoverTimerRef.current = null;
        }, 400);
      }
    } else {
      if (miniHoveredError) setMiniHoveredError(null);
      if (miniHoverTimerRef.current) { clearTimeout(miniHoverTimerRef.current); miniHoverTimerRef.current = null; }
      if (miniHoverSuggestion.open && !miniIsHoverPopover) {
        miniHoverCloseTimerRef.current = window.setTimeout(() => { setMiniHoverSuggestion((prev) => ({ ...prev, open: false })); miniHoverCloseTimerRef.current = null; }, 200);
      }
    }
  };

  const handleMiniHighlightMouseLeave = () => {
    setMiniHoveredError(null);
    if (miniHoverTimerRef.current) { clearTimeout(miniHoverTimerRef.current); miniHoverTimerRef.current = null; }
    if (miniHoverSuggestion.open && !miniIsHoverPopover) {
      miniHoverCloseTimerRef.current = window.setTimeout(() => { setMiniHoverSuggestion((prev) => ({ ...prev, open: false })); miniHoverCloseTimerRef.current = null; }, 200);
    }
  };

  const miniWordCount = miniEditorText.split(/\s+/).filter(Boolean).length;
  const miniTotalCredits = (userProfile?.credits || 0);
  const miniCreditsUsed = (userProfile?.creditsUsed || 0);
  const miniCreditsRemaining = Math.max(0, miniTotalCredits - miniCreditsUsed);
  const miniPendingChanges = miniChanges.filter((c) => c.status === "pending");
  const miniAccuracyScore = miniHasResults && miniWordCount
    ? Math.max(0, Math.min(100, Math.round((1 - miniPendingChanges.length / miniWordCount) * 100)))
    : 0;

  const handleMiniCheck = async () => {
    const text = miniEditorText.trim();
    if (!text) {
      toast.error("Please enter some text to check");
      return;
    }
    if (!miniEditorLanguage) {
      toast.error("Please select a language first");
      return;
    }
    const wc = text.split(/\s+/).filter(Boolean).length;
    const wordLimit = userProfile?.wordLimit || 200;
    if (wc > wordLimit) {
      toast.error(`Text exceeds ${wordLimit} word limit`);
      return;
    }
    if (miniTotalCredits > 0 && wc > miniCreditsRemaining) {
      toast.error("Not enough credits. Please buy add-on credits to continue.");
      return;
    }

    // ── Gemini language detection before proofread ──────────────────────────
    let effectiveMiniLanguage = miniEditorLanguage || "auto";
    if (effectiveMiniLanguage === "auto" && miniEditorLanguageMode !== "manual" && text.length >= DETECTION_MIN_CHARS) {
      const detected = await detectLanguageViaGemini(text);
      if (detected.isReliable && detected.language !== "auto") {
        effectiveMiniLanguage = detected.language;
        setMiniEditorLanguage(detected.language);
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    setMiniIsLoading(true);
    setMiniHasResults(false);
    try {
      const auth = getFirebaseAuth();
      let authToken: string | null = null;
      if (auth?.currentUser) {
        try { authToken = await auth.currentUser.getIdToken(); } catch {}
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const response = await fetch("/api/proofread", {
        method: "POST",
        headers,
        body: JSON.stringify({
          text,
          language: effectiveMiniLanguage,
          wordLimit,
          userId: auth?.currentUser?.uid || null,
        }),
      });

      const creditsUsedHeader = response.headers.get("X-Credits-Used");
      if (creditsUsedHeader !== null) {
        const used = parseInt(creditsUsedHeader, 10);
        if (Number.isFinite(used) && userProfile) {
          setUserProfile({ ...userProfile, creditsUsed: used });
        }
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.message || "Proofreading failed");
      }

      const data = await response.json();
      if (!data?.corrected_text) throw new Error("Invalid response format");

      const normalizedInput = text.normalize("NFC");
      const corrected = String(data.corrected_text || "").trim().normalize("NFC");
      const changes: Array<{ original: string; corrected: string; explanation: string; type: string; status: string }> = Array.isArray(data.changes)
        ? data.changes
            .filter((c: any) => c.original && c.corrected && c.original !== c.corrected)
            .filter((c: any) => normalizedInput.includes(c.original))
            .map((c: any) => ({ original: c.original, corrected: c.corrected, explanation: c.explanation || "", type: c.type || "grammar", status: "pending" }))
        : [];

      setMiniCorrectedText(corrected);
      setMiniChanges(changes);
      setMiniHasResults(true);
      toast.success(changes.length === 0 ? "No changes needed — your text is clean." : `Found ${changes.length} suggestion${changes.length === 1 ? "" : "s"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error(message);
    } finally {
      setMiniIsLoading(false);
    }
  };

  const handleSubmitSuggestion = async () => {
    if (!suggestionText.trim()) {
      toast.error("Please enter a suggestion.");
      return;
    }
    setIsSubmittingSuggestion(true);
    try {
      const auth = getFirebaseAuth();
      await addSuggestion({
        message: suggestionText,
        email: auth?.currentUser?.email || "",
        userId: auth?.currentUser?.uid || "",
      });
      setSuggestionText("");
      setIsSuggestionOpen(false);
      toast.success("Thanks! Your suggestion was submitted.");
    } catch {
      toast.error("Unable to submit suggestion.");
    } finally {
      setIsSubmittingSuggestion(false);
    }
  };

  const handleSignOut = async () => {
    const auth = getFirebaseAuth();
    if (auth) {
      try {
        await signOut(auth);
        toast.success("Signed out successfully");
        navigate("/");
      } catch (error) {
        toast.error("Failed to sign out");
      }
    }
  };

  const handleDeleteAccount = async () => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    if (!auth?.currentUser || !db) {
      toast.error("Unable to delete account.");
      return;
    }

    setIsDeleting(true);
    try {
      const uid = auth.currentUser.uid;
      const userRef = doc(db, "users", uid);

      const docsSnap = await getFirestoreDocs(collection(db, `users/${uid}/docs`));
      const archivedAtIso = new Date().toISOString();
      await Promise.all(
        docsSnap.docs.map(async (docSnap) => {
          await setDoc(docSnap.ref, { archivedAt: archivedAtIso }, { merge: true });
          await deleteDoc(docSnap.ref);
        })
      );

      await deleteDoc(userRef);
      window.localStorage.removeItem("correctnow:docs");

      await deleteUser(auth.currentUser);
      clearSessionId();
      toast.success("Your account was permanently deleted.");
      navigate("/");
    } catch (error: any) {
      if (error?.code === "auth/requires-recent-login") {
        toast.error("Please log in again to delete your account.");
      } else {
        toast.error("Failed to delete account.");
      }
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white">
      {/* Upgrade to Premium Card — placed at top for visibility */}
      {userProfile?.plan === "free" && (
        <div className="px-3 pt-5 pb-2">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-100">
            <div className="flex items-center gap-2 mb-1.5">
              <Crown className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-gray-900">Upgrade to Premium</span>
            </div>
            <p className="text-xs text-gray-600 mb-2">
              Unlock more words, advanced suggestions and premium features.
            </p>
            <Button
              size="sm"
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg"
              onClick={() => navigate("/pricing")}
            >
              Upgrade Now
            </Button>
          </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <div className="py-4 flex-1">
        <nav className="space-y-1 px-3">
          <button
            onClick={() => {
              setSidebarView("docs");
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              sidebarView === "docs"
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <FileText className="w-[18px] h-[18px]" />
            Documents
          </button>

          <button
            onClick={() => {
              navigate("/editor");
              setIsMobileSidebarOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all"
          >
            <Pencil className="w-[18px] h-[18px]" />
            Editor
          </button>

          <button
            onClick={() => {
              setSidebarView("archived");
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              sidebarView === "archived"
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <Archive className="w-[18px] h-[18px]" />
            Archived
          </button>
          
          <button
            onClick={() => {
              setSidebarView("account");
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              sidebarView === "account"
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <User className="w-[18px] h-[18px]" />
            Account
          </button>

          <div className="h-2" />

          <button
            onClick={() => {
              handleSignOut();
              setIsMobileSidebarOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Sign out
          </button>
        </nav>
      </div>

      {/* Footer */}
      <div className="px-4 pb-4">
        <p className="text-[10px] text-gray-400">&copy; 2026 CorrectNow. All rights reserved.</p>
      </div>
    </div>
  );

  return (
    <div
      className={`flex flex-col bg-background overflow-x-hidden ${
        isAuthenticated ? "h-screen overflow-hidden" : "min-h-screen"
      }`}
    >
      {!isAuthenticated && <Header />}
      
      {isAuthLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      ) : (
        <>
          {isAuthenticated ? (
            // Authenticated Dashboard Layout
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Dashboard Top Nav - matches old Header sizing */}
              <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
                <div className="ds-container">
                  <div className="flex items-center justify-between h-[72px]">
                    <div className="flex items-center">
                      <Link to="/" className="flex items-center lg:pl-6">
                        <img
                          src="/Icon/correctnow logo final2.png"
                          alt="CorrectNow"
                          className="brand-logo"
                          loading="eager"
                        />
                      </Link>
                    </div>

                    <nav className="hidden lg:flex items-center justify-center gap-4 xl:gap-6">
                      {[
                        { label: "Dashboard", to: "/" },
                        { label: "Features", to: "/features" },
                        { label: "Pricing", to: "/pricing" },
                        { label: "Languages", to: "/languages" },
                        { label: "Blog", to: "/blog" },
                        { label: "Contact", to: "/contact" },
                      ].map((item) => (
                        <Link
                          key={item.label}
                          to={item.to}
                          className={`text-sm font-medium transition-colors ${
                            (item.to === "/" && location.pathname === "/") || (item.to !== "/" && location.pathname.startsWith(item.to))
                              ? "text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </nav>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                          {userName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-foreground hidden md:block truncate max-w-[120px]">{userName}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </header>

              {/* Three Column Layout */}
              <div className="flex-1 flex overflow-hidden">
              {/* Desktop Left Sidebar */}
              <div className="hidden lg:flex w-[200px] border-r border-gray-100 flex-col flex-shrink-0">
                <SidebarContent />
              </div>

              {/* Center Panel - Documents */}
              <div className="flex-1 xl:max-w-[420px] 2xl:max-w-[460px] xl:border-r border-gray-100 flex flex-col overflow-hidden">
                {/* Mobile Header with Hamburger */}
                <div className="lg:hidden border-b border-gray-100 bg-white p-3 flex items-center gap-3">
                  <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
                    <SheetTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                        <Menu className="w-5 h-5" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-64 p-0">
                      <SidebarContent />
                    </SheetContent>
                  </Sheet>
                  <h1 className="text-lg font-semibold text-foreground">
                    {sidebarView === "docs" ? "Documents" : sidebarView === "archived" ? "Archived" : "Account"}
                  </h1>
                </div>

                {(sidebarView === "docs" || sidebarView === "archived") && (
                  <>
                    <div className="px-5 pt-5 pb-3">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <h1 className="text-xl font-bold text-gray-900">
                          {sidebarView === "docs" ? "Documents" : "Archived"}
                        </h1>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <Input
                            className="pl-9 h-9 bg-gray-50 border-gray-200 text-sm rounded-lg"
                            placeholder="Search documents..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                        </div>
                        {sidebarView === "docs" && (
                          <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-lg whitespace-nowrap" onClick={() => navigate("/editor")}>
                            + New Document
                          </Button>
                        )}
                      </div>

                      {sidebarView === "archived" ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button onClick={selectAllVisibleArchived} className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
                            Select
                          </button>
                          <button onClick={clearArchivedSelection} className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
                            Clear
                          </button>
                          <button
                            onClick={deleteSelectedArchived}
                            disabled={selectedArchivedIds.size === 0}
                            className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors disabled:opacity-40"
                          >
                            Delete
                          </button>
                          <div className="ml-auto text-xs text-gray-400">
                            {selectedArchivedIds.size > 0 && `${selectedArchivedIds.size} selected`}
                          </div>
                        </div>
                      ) : sidebarView === "docs" ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button onClick={selectAllVisibleDocs} className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
                            Select
                          </button>
                          <button onClick={clearDocSelection} className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
                            Clear
                          </button>
                          <button
                            onClick={archiveSelectedDocs}
                            disabled={selectedDocIds.size === 0}
                            className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-40"
                          >
                            Archive
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
                                {docFilter === "all" ? "All Documents" : docFilter === "today" ? "Today" : docFilter === "week" ? "This Week" : "This Month"}
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onClick={() => setDocFilter("all")}>
                                All Documents {docFilter === "all" && "✓"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDocFilter("today")}>
                                Today {docFilter === "today" && "✓"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDocFilter("week")}>
                                This Week {docFilter === "week" && "✓"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDocFilter("month")}>
                                This Month {docFilter === "month" && "✓"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <div className="ml-auto text-xs text-gray-400">
                            {selectedDocIds.size > 0 && `${selectedDocIds.size} selected`}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex-1 overflow-auto">
                      {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center py-16 px-5">
                          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                            {sidebarView === "archived" ? (
                              <Archive className="w-7 h-7 text-primary" />
                            ) : (
                              <FileText className="w-7 h-7 text-primary" />
                            )}
                          </div>
                          <h3 className="text-base font-semibold text-gray-900 mb-1">
                            {sidebarView === "archived" ? "No archived documents" : "No documents yet"}
                          </h3>
                          <p className="text-sm text-gray-500 mb-5 max-w-[260px]">
                            {sidebarView === "archived"
                              ? "Archived documents will appear here."
                              : "Start by checking your first document."}
                          </p>
                          {sidebarView === "docs" && (
                            <Button size="sm" className="bg-primary text-white" onClick={() => navigate("/editor")}>
                              + New Document
                            </Button>
                          )}
                        </div>
                      ) : sidebarView === "archived" ? (
                        <div className="divide-y divide-gray-100">
                          {filtered.map((docItem) => (
                            <div
                              key={docItem.id}
                              className="group flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3 rounded-xl border border-gray-100 bg-white shadow-sm hover:shadow transition-all sm:border-0 sm:rounded-none sm:shadow-none hover:bg-gray-50"
                            >
                              <button
                                type="button"
                                aria-label={selectedArchivedIds.has(docItem.id) ? "Deselect" : "Select"}
                                onClick={(e) => { e.stopPropagation(); toggleArchivedSelected(docItem.id, !selectedArchivedIds.has(docItem.id)); }}
                                className={`hidden sm:flex flex-shrink-0 h-4 w-4 rounded-full border transition-colors items-center justify-center text-[10px] font-semibold ${selectedArchivedIds.has(docItem.id)
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-gray-300 bg-white text-transparent"}
                                `}
                              >
                                ✓
                              </button>
                              <div
                                className="w-14 h-14 sm:w-9 sm:h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0"
                                onTouchStart={() => startLongPress(docItem.id, true)}
                                onTouchEnd={clearLongPress}
                                onTouchCancel={clearLongPress}
                                onMouseDown={(e) => {
                                  if (window.innerWidth < 640) startLongPress(docItem.id, true);
                                }}
                                onMouseUp={clearLongPress}
                                onMouseLeave={clearLongPress}
                              >
                                <Archive className="w-5 h-5 sm:w-4 sm:h-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-base sm:text-base font-semibold text-gray-900 line-clamp-2 sm:line-clamp-1 leading-tight">{docItem.title}</p>
                                <p className="text-xs sm:text-sm text-gray-500 line-clamp-1 mt-0.5">{docItem.preview}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">Archived</p>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreVertical className="w-4 h-4 text-gray-400" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={async () => { await restoreDocById(docItem.id); toast.success("Restored"); }}>
                                    <RotateCcw className="w-4 h-4 mr-2" /> Restore
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive" onClick={async () => {
                                    if (window.confirm("Delete permanently?")) {
                                      await deleteArchivedDocPermanently(docItem.id);
                                      toast.success("Deleted");
                                    }
                                  }}>
                                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div>
                          {sections.map((section) => (
                            <div key={section}>
                              <div className="px-5 pt-4 pb-2 text-sm font-semibold text-gray-400 uppercase tracking-wider">{section}</div>
                              <div className="divide-y divide-gray-50">
                                {filtered
                                  .filter((docItem) => docItem.section === section)
                                  .map((docItem) => (
                                    <div
                                      key={docItem.id}
                                      className={`group flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3 rounded-xl border border-gray-100 bg-white shadow-sm hover:shadow transition-all sm:border-0 sm:rounded-none sm:shadow-none cursor-pointer ${
                                        selectedDocId === docItem.id
                                          ? "bg-primary/5 border-l-[3px] border-l-primary"
                                          : "hover:bg-blue-50/50 border-l-[3px] border-l-transparent"
                                      }`}
                                      onClick={() => openDoc(docItem.id)}
                                    >
                                      <button
                                        type="button"
                                        aria-label={selectedDocIds.has(docItem.id) ? "Deselect" : "Select"}
                                        onClick={(e) => { e.stopPropagation(); toggleDocSelected(docItem.id, !selectedDocIds.has(docItem.id)); }}
                                        className={`hidden sm:flex flex-shrink-0 h-4 w-4 rounded-full border transition-colors items-center justify-center text-[10px] font-semibold ${selectedDocIds.has(docItem.id)
                                          ? "border-primary bg-primary/10 text-primary"
                                          : "border-gray-300 bg-white text-transparent"}
                                        `}
                                      >
                                        ✓
                                      </button>
                                      <div className="w-14 h-14 sm:w-9 sm:h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-5 h-5 sm:w-4 sm:h-4 text-primary" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-base sm:text-base font-semibold text-gray-900 line-clamp-2 sm:line-clamp-1 leading-tight group-hover:text-primary transition-colors">
                                          {docItem.title}
                                        </p>
                                        <p className="text-xs sm:text-sm text-gray-500 line-clamp-1 mt-0.5">{docItem.preview}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                          {docItem.updated} &bull; {docItem.text?.split(/\s+/).filter(Boolean).length || 0} words
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="text-sm font-bold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                                          {(() => {
                                            let h = 0;
                                            for (let i = 0; i < docItem.id.length; i++) h = ((h << 5) - h + docItem.id.charCodeAt(i)) | 0;
                                            return 85 + Math.abs(h % 15);
                                          })()}
                                        </span>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <button className="p-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                              <MoreVertical className="w-4 h-4 text-gray-400" />
                                            </button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={async (e) => {
                                              e.stopPropagation();
                                              await archiveDocById(docItem.id);
                                              toast.success("Moved to Archived");
                                            }}>
                                              <Archive className="w-4 h-4 mr-2" /> Archive
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {sidebarView === "account" && (
                  <div className="flex-1 overflow-auto px-5 pt-5 pb-8">
                    <h1 className="text-xl font-bold text-gray-900 mb-5">Account</h1>
                    {isLoadingProfile ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <div className="max-w-2xl space-y-6">
                        {(() => {
                          const effective = getEffectivePlan(userProfile);
                          return isAuthenticated && effective.planKey === "free";
                        })() && (
                          <Card>
                            <CardContent className="p-6">
                              <h3 className="text-base font-semibold text-foreground mb-2">Free daily limit</h3>
                              <p className="text-sm text-muted-foreground">
                                Free users can check up to 300 words per day. You can continue tomorrow.
                              </p>
                            </CardContent>
                          </Card>
                        )}
                        <Card>
                          <CardContent className="p-6">
                            <h3 className="text-base font-semibold text-foreground mb-4">Profile Information</h3>
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Email</span>
                                <span className="text-sm font-medium text-foreground">{userEmail}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardContent className="p-6">
                            <h3 className="text-base font-semibold text-foreground mb-4">Usage Statistics</h3>
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Word Limit</span>
                                <span className="text-sm font-medium text-foreground">{userProfile?.wordLimit?.toLocaleString() || "1,000"}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Credits Used</span>
                                <span className="text-sm font-medium text-foreground">{userProfile?.creditsUsed?.toLocaleString() || "0"}</span>
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm text-muted-foreground">Usage</span>
                                  <span className="text-sm font-medium text-foreground">
                                    {Math.min(100, ((userProfile?.creditsUsed || 0) / (userProfile?.wordLimit || 1000)) * 100).toFixed(1)}%
                                  </span>
                                </div>
                                <div className="w-full bg-secondary rounded-full h-2">
                                  <div 
                                    className="bg-primary h-2 rounded-full transition-all" 
                                    style={{ 
                                      width: `${Math.min(100, ((userProfile?.creditsUsed || 0) / (userProfile?.wordLimit || 1000)) * 100)}%` 
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardContent className="p-6">
                            <h3 className="text-base font-semibold text-foreground mb-4">Subscription</h3>
                            <div className="space-y-3">
                              <div className="space-y-2 text-sm">
                                {(() => {
                                  const effective = getEffectivePlan(userProfile);
                                  return (
                                    <>
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Plan</span>
                                  <span className="font-semibold text-foreground">{effective.planLabel}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Status</span>
                                  <span className="font-semibold text-foreground capitalize">{effective.subscriptionStatus || "inactive"}</span>
                                </div>
                                {effective.planKey === "pro" && (() => {
                                  const periodEnd = userProfile?.subscriptionCurrentPeriodEnd;
                                  const manualExpiry = userProfile?.adminPlanExpiresAt;
                                  const isSub = !!(userProfile?.razorpaySubscriptionId || userProfile?.stripeSubscriptionId);

                                  if (isSub) {
                                    // Paying subscriber — show renewal date
                                    const rows = [];
                                    rows.push(
                                      <div key="type" className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Plan type</span>
                                        <span className="font-semibold text-foreground">
                                          {userProfile?.razorpaySubscriptionId ? "Razorpay" : "Stripe"}
                                        </span>
                                      </div>
                                    );
                                    if (periodEnd) {
                                      const d = new Date(periodEnd);
                                      const daysLeft = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                                      const overdue = daysLeft <= 0;
                                      const soon = daysLeft > 0 && daysLeft <= 5;
                                      rows.push(
                                        <div key="renewal" className="flex items-center justify-between">
                                          <span className="text-muted-foreground">Next renewal</span>
                                          <span className={`font-semibold ${overdue ? "text-red-500" : soon ? "text-amber-500" : "text-foreground"}`}>
                                            {overdue ? "Overdue" : soon ? `In ${daysLeft}d` : d.toLocaleDateString()}
                                          </span>
                                        </div>
                                      );
                                    }
                                    return <>{rows}</>;
                                  }

                                  // Admin-granted Pro
                                  const rows = [];
                                  rows.push(
                                    <div key="type" className="flex items-center justify-between">
                                      <span className="text-muted-foreground">Plan type</span>
                                      <span className="font-semibold text-foreground">Admin grant</span>
                                    </div>
                                  );
                                  if (manualExpiry) {
                                    const d = new Date(manualExpiry);
                                    const daysLeft = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                                    const expired = daysLeft <= 0;
                                    const critical = daysLeft > 0 && daysLeft <= 7;
                                    rows.push(
                                      <div key="expiry" className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Plan expires</span>
                                        <span className={`font-semibold ${expired ? "text-red-500" : critical ? "text-amber-500" : "text-foreground"}`}>
                                          {expired ? "Expired" : critical ? `In ${daysLeft}d` : d.toLocaleDateString()}
                                        </span>
                                      </div>
                                    );
                                  }
                                  return <>{rows}</>;
                                })()}
                                    </>
                                  );
                                })()}
                              </div>
                              {(() => {
                                // Check purchased add-on credits (30-day expiry)
                                const addonExpiry = userProfile?.addonCreditsExpiryAt
                                  ? new Date(String(userProfile.addonCreditsExpiryAt))
                                  : null;
                                const addonValid = addonExpiry ? addonExpiry.getTime() > Date.now() : false;
                                const addonTotal = addonValid ? (userProfile?.addonCredits || 0) : 0;
                                
                                // Check admin-granted credits (custom expiry date)
                                const adminExpiry = userProfile?.adminCreditsExpiryAt
                                  ? new Date(String(userProfile.adminCreditsExpiryAt))
                                  : null;
                                const adminValid = adminExpiry ? adminExpiry.getTime() > Date.now() : false;
                                const adminTotal = adminValid ? (userProfile?.adminCredits || 0) : 0;
                                
                                // Calculate total available add-on credits
                                const totalAvailable = addonTotal + adminTotal;
                                
                                // Calculate usage
                                const baseLimit = userProfile?.credits || 0;
                                const totalUsed = userProfile?.creditsUsed || 0;
                                const addonUsed = Math.max(0, totalUsed - baseLimit);
                                const addonRemaining = Math.max(0, totalAvailable - addonUsed);
                                
                                // Format expiry display
                                let expiryLabel = "—";
                                if (addonValid && adminValid) {
                                  // Both valid, show earliest expiry
                                  const earliest = addonExpiry! < adminExpiry! ? addonExpiry : adminExpiry;
                                  expiryLabel = earliest!.toLocaleDateString();
                                } else if (addonValid) {
                                  expiryLabel = addonExpiry!.toLocaleDateString();
                                } else if (adminValid) {
                                  expiryLabel = adminExpiry!.toLocaleDateString();
                                } else if (addonExpiry || adminExpiry) {
                                  expiryLabel = "Expired";
                                }
                                
                                return (
                                  <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                      <span className="text-muted-foreground">Add-on credits</span>
                                      <span className="font-semibold text-foreground">{totalAvailable.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-muted-foreground">Add-on used</span>
                                      <span className="font-semibold text-foreground">{addonUsed.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-muted-foreground">Add-on remaining</span>
                                      <span className="font-semibold text-foreground">{addonRemaining.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-muted-foreground">Add-on expiry</span>
                                      <span className="font-semibold text-foreground">{expiryLabel}</span>
                                    </div>
                                  </div>
                                );
                              })()}
                              <Button 
                                variant="outline" 
                                className="w-full"
                                onClick={() => navigate("/pricing")}
                              >
                                Manage Plan
                              </Button>
                              <Button
                                variant="secondary"
                                className="w-full"
                                onClick={() => navigate("/payment?mode=credits")}
                              >
                                Buy add-on credits
                              </Button>
                              <p className="text-xs text-muted-foreground">
                                Add-on credits are valid for 30 days.
                              </p>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardContent className="p-6">
                            <h3 className="text-base font-semibold text-foreground mb-4">Account Security</h3>
                            <div className="space-y-3">
                              <Button
                                variant="destructive"
                                className="w-full"
                                onClick={() => setIsDeleteOpen(true)}
                              >
                                Delete Account Permanently
                              </Button>
                            </div>
                          </CardContent>
                        </Card>

                        {userProfile?.plan === "free" && (
                          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                            <CardContent className="p-6">
                              <h4 className="text-base font-semibold text-foreground mb-2">Upgrade to Pro</h4>
                              <p className="text-sm text-muted-foreground mb-4">Get unlimited checks and advanced features</p>
                              <Button onClick={() => navigate("/pricing")}>View Plans</Button>
                            </CardContent>
                          </Card>
                        )}

                        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Delete account permanently?</DialogTitle>
                            </DialogHeader>
                            <div className="text-sm text-muted-foreground">
                              This will permanently erase your account and all data. This action cannot be undone.
                            </div>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() => setIsDeleteOpen(false)}
                                disabled={isDeleting}
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={handleDeleteAccount}
                                disabled={isDeleting}
                              >
                                {isDeleting ? "Deleting..." : "Delete Permanently"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Right Panel - Editor + Suggestions (hidden on smaller screens) */}
              <div className={`flex-1 flex-row bg-white ${isInlineEditorVisible ? "hidden xl:flex" : "hidden"}`}>
                {/* Editor Area */}
                <div className="flex-1 flex flex-col min-w-0">
                  {/* Editor Header */}
                  <div className="px-5 py-3 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isEditingTitle ? (
                          <input
                            autoFocus
                            className="text-lg font-semibold text-gray-900 border-b border-blue-400 bg-transparent outline-none w-64 max-w-full"
                            value={editingTitleValue}
                            onChange={(e) => setEditingTitleValue(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const trimmed = editingTitleValue.trim();
                                if (trimmed) {
                                  setMiniEditorTitle(trimmed);
                                  if (selectedDocId) await renameDoc(selectedDocId, trimmed);
                                }
                                setIsEditingTitle(false);
                              } else if (e.key === "Escape") {
                                setIsEditingTitle(false);
                              }
                            }}
                            onBlur={async () => {
                              const trimmed = editingTitleValue.trim();
                              if (trimmed) {
                                setMiniEditorTitle(trimmed);
                                if (selectedDocId) await renameDoc(selectedDocId, trimmed);
                              }
                              setIsEditingTitle(false);
                            }}
                          />
                        ) : (
                          <h2 className="text-lg font-semibold text-gray-900 truncate max-w-xs">{miniEditorTitle}</h2>
                        )}
                        <button
                          onClick={() => {
                            setEditingTitleValue(miniEditorTitle);
                            setIsEditingTitle(true);
                          }}
                          className="p-1 hover:bg-gray-100 rounded flex-shrink-0"
                          title="Rename document"
                        >
                          <Pencil className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Language detection pill — auto-detects, no manual selector */}
                        {(() => {
                          const displayCode = miniEditorLanguage !== "auto" ? miniEditorLanguage : miniDetectedLanguage;
                          const LANG_MAP: Record<string, string> = {
                            en:"English",ta:"Tamil",hi:"Hindi",te:"Telugu",kn:"Kannada",
                            ml:"Malayalam",bn:"Bengali",gu:"Gujarati",pa:"Punjabi",mr:"Marathi",
                            ar:"Arabic",fr:"French",de:"German",es:"Spanish",pt:"Portuguese",
                            ru:"Russian",ja:"Japanese",ko:"Korean",zh:"Chinese",vi:"Vietnamese",
                            tr:"Turkish",it:"Italian",nl:"Dutch",pl:"Polish",sv:"Swedish",
                            no:"Norwegian",da:"Danish",fi:"Finnish",ur:"Urdu",fa:"Persian",
                            he:"Hebrew",th:"Thai",id:"Indonesian",ms:"Malay",tl:"Tagalog",
                          };
                          const langName = displayCode === "any" ? "Any language" : LANG_MAP[displayCode] ?? null;
                          const pct = miniDetectedConfidence > 0 ? Math.round(miniDetectedConfidence * 100) : null;
                          const isDetected = !!(miniDetectedLanguage && miniDetectedLanguage !== "auto" && pct);
                          if (!langName) {
                            return (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-xs text-gray-400 select-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                                Detecting language…
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-medium text-emerald-700 select-none">
                              <span className={`w-1.5 h-1.5 rounded-full ${isDetected ? "bg-emerald-500 animate-pulse" : "bg-emerald-400"}`} />
                              {isDetected ? "Detected: " : ""}{langName}
                              {isDetected && pct !== null && (
                                <span className="text-[10px] text-emerald-500 font-semibold">{pct}%</span>
                              )}
                            </span>
                          );
                        })()}
                        <span className="text-sm text-gray-500">
                          {miniWordCount} / {userProfile?.wordLimit?.toLocaleString() || "5,000"} words
                        </span>
                        <span className="text-xs text-gray-400">
                          Credits left: {miniCreditsRemaining.toLocaleString()}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-lg px-4"
                        onClick={handleMiniCheck}
                        disabled={miniIsLoading}
                      >
                        {miniIsLoading ? "Checking..." : "Check Text"}
                      </Button>
                    </div>
                  </div>

                  {/* Editor Text Area */}
                  <div className="flex-1 relative min-h-0">
                    <div className="mini-editor-overlay">
                      <div
                        ref={miniHighlightRef}
                        className="mini-editor-highlight editor-highlight"
                        dangerouslySetInnerHTML={{ __html: miniHighlightHtml }}
                        onClick={handleMiniHighlightClick}
                        onMouseMove={handleMiniHighlightMouseMove}
                        onMouseLeave={handleMiniHighlightMouseLeave}
                      />
                      <textarea
                        ref={miniTextareaRef}
                        className="mini-editor-textarea"
                        placeholder="Welcome! Paste or type your text here, and we'll proofread it professionally while preserving your meaning and tone."
                        value={miniEditorText}
                        spellCheck={false}
                        onChange={(e) => {
                          setMiniEditorText(e.target.value);
                          if (miniHasResults) { setMiniHasResults(false); setMiniChanges([]); setMiniCorrectedText(""); }
                        }}
                        onScroll={(e) => {
                          if (miniHighlightRef.current) {
                            miniHighlightRef.current.scrollTop = e.currentTarget.scrollTop;
                            miniHighlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Editor Bottom Bar */}
                  <div className="px-5 py-2.5 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                    
                    <div className="flex items-center gap-4">
                      <span className="text-sm">{miniWordCount} words</span>
                      <span className="text-sm">{miniEditorText.length} characters</span>
                      <button
                        className="text-primary hover:text-primary/80 font-medium transition-colors"
                        onClick={() => navigate("/editor", { state: selectedDocId ? { id: selectedDocId } : { text: miniEditorText } })}
                      >
                        Open in Editor
                      </button>
                    </div>
                  </div>
                </div>

                {/* Suggestions Sidebar */}
                <div className={`w-[260px] 2xl:w-[280px] border-l border-gray-100 flex-shrink-0 overflow-auto bg-gray-50/50 ${isInlineEditorVisible ? "block" : "hidden"}`}>
                  <div className="p-5">
                    {/* Suggestions Header */}
                    <div className="flex items-center gap-2 mb-5">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                        <BookOpen className="w-4 h-4 text-primary" />
                      </div>
                      <h3 className="text-base font-bold text-gray-900">Suggestions</h3>
                    </div>

                    {miniIsLoading ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-3">
                        <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs text-gray-500">Checking your text...</p>
                      </div>
                    ) : (
                      <>
                        {/* Accuracy Score */}
                        <div className="mb-5">
                          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Accuracy Score</p>
                          <div className="flex items-center gap-4">
                            <div className="relative w-16 h-16">
                              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                                <circle
                                  cx="18" cy="18" r="15.5" fill="none"
                                  stroke={miniAccuracyScore >= 80 ? "#22c55e" : miniAccuracyScore >= 50 ? "#f59e0b" : "#ef4444"}
                                  strokeWidth="3"
                                  strokeDasharray="97.4"
                                  strokeDashoffset={97.4 - (97.4 * miniAccuracyScore) / 100}
                                  strokeLinecap="round"
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm font-bold text-gray-900">{miniHasResults ? `${miniAccuracyScore}%` : "—"}</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-base font-semibold text-gray-900">
                                {!miniHasResults ? "Ready" : miniPendingChanges.length === 0 ? "Looks good!" : `${miniPendingChanges.length} issue${miniPendingChanges.length === 1 ? "" : "s"}`}
                              </p>
                              <p className="text-sm text-emerald-600">
                                {!miniHasResults ? "Paste text & click Check" : miniPendingChanges.length === 0 ? "No issues found" : "Review suggestions below"}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Suggestion Count */}
                        <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-200">
                          <span className="text-sm text-gray-500">
                            {miniChanges.filter((c) => c.status !== "pending").length} of {miniChanges.length} suggestions
                          </span>
                          <div className="flex items-center gap-2">
                            {miniPendingChanges.length > 0 && (
                              <button
                                className="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1 rounded-md transition-colors"
                                onClick={handleMiniAcceptAll}
                              >
                                Accept All
                              </button>
                            )}
                            {miniPendingChanges.length === 0 && miniHasResults && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            )}
                          </div>
                        </div>

                        {/* Categories */}
                        <div className="space-y-3 mb-6">
                          {[
                            { icon: Type, label: "Grammar", key: "grammar" },
                            { icon: BookOpen, label: "Spelling", key: "spelling" },
                            { icon: CheckCircle2, label: "Punctuation", key: "punctuation" },
                            { icon: Eye, label: "Clarity", key: "clarity" },
                            { icon: Sparkles, label: "Style", key: "style" },
                            { icon: MessageSquare, label: "Other", key: "other" },
                          ].map(({ icon: Icon, label, key }) => {
                            const count = miniPendingChanges.filter((c) => (c.type || "grammar").toLowerCase().includes(key)).length;
                            return (
                              <div key={label} className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <Icon className="w-4 h-4 text-gray-400" />
                                  <span className="text-base text-gray-700">{label}</span>
                                </div>
                                <span className={`text-base font-semibold ${count > 0 ? "text-amber-600" : "text-gray-900"}`}>{count}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Individual Suggestions */}
                        {miniPendingChanges.length > 0 && (
                          <div className="space-y-3 mb-6">
                            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Changes</p>
                            {miniChanges.map((change, originalIdx) => {
                              if (change.status !== "pending") return null;
                              return (
                              <div key={originalIdx} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-red-500 line-through">{change.original}</span>
                                    <span className="text-sm text-gray-400 mx-1">→</span>
                                    <span className="text-sm font-medium text-emerald-600">{change.corrected}</span>
                                  </div>
                                </div>
                                {change.explanation && (
                                  <p className="text-xs text-gray-500 leading-relaxed">{change.explanation}</p>
                                )}
                                <div className="flex items-center gap-2">
                                  <button
                                    className="text-xs font-medium text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 transition-colors"
                                    onClick={() => handleMiniAccept(originalIdx)}
                                  >
                                    Accept
                                  </button>
                                  <button
                                    className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1 rounded bg-gray-50 hover:bg-gray-100 transition-colors"
                                    onClick={() => handleMiniIgnore(originalIdx)}
                                  >
                                    Ignore
                                  </button>
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Pro Tip */}
                        {miniPendingChanges.length === 0 && (
                          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                            <div className="flex items-center gap-2 mb-2">
                              <Lightbulb className="w-4 h-4 text-primary" />
                              <span className="text-xs font-bold text-primary">Pro Tip</span>
                            </div>
                            <p className="text-xs text-gray-600 leading-relaxed">
                              Clear, concise writing makes the strongest impact.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Mini-editor hover suggestion popover (fixed over viewport) */}
            {miniHoverSuggestion.open && typeof miniHoverSuggestion.changeIdx === "number" && miniChanges[miniHoverSuggestion.changeIdx] && (
              <div
                className="hover-suggestion-popover"
                style={{ position: "fixed", top: miniHoverSuggestion.top, left: miniHoverSuggestion.left, zIndex: 9999 }}
                onMouseEnter={() => {
                  setMiniIsHoverPopover(true);
                  if (miniHoverCloseTimerRef.current) { clearTimeout(miniHoverCloseTimerRef.current); miniHoverCloseTimerRef.current = null; }
                }}
                onMouseLeave={() => {
                  setMiniIsHoverPopover(false);
                  miniHoverCloseTimerRef.current = window.setTimeout(() => { setMiniHoverSuggestion((prev) => ({ ...prev, open: false })); miniHoverCloseTimerRef.current = null; }, 200);
                }}
              >
                <div className="hover-suggestion-arrow" />
                <div className="text-[11px] text-muted-foreground mb-1">Suggestion</div>
                <div className="text-xs text-gray-500 mb-1">
                  <span className="line-through text-red-400">{miniChanges[miniHoverSuggestion.changeIdx].original}</span>
                  <span className="mx-1 text-gray-400">→</span>
                  <span className="font-semibold text-emerald-600">{miniChanges[miniHoverSuggestion.changeIdx].corrected}</span>
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-emerald-600 hover:underline text-left mt-1"
                  onClick={() => {
                    handleMiniAccept(miniHoverSuggestion.changeIdx!);
                    setMiniHoverSuggestion((prev) => ({ ...prev, open: false }));
                  }}
                >
                  ✓ Accept
                </button>
              </div>
            )}
            </div>
          ) : (
            // Non-authenticated Layout — World-class landing page
            <>
              <main className="flex-1">

                {/* ═══════════════════════════════════════════
                    HERO SECTION — Light, premium, conversion-focused
                ═══════════════════════════════════════════ */}
                <section className="relative flex flex-col justify-center overflow-hidden bg-gradient-to-b from-blue-50/70 via-white to-white">
                  {/* Soft gradient orbs (light) */}
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute top-0 -left-32 w-[500px] h-[500px] rounded-full bg-blue-200/40 blur-[120px]" />
                    <div className="absolute top-10 -right-32 w-[480px] h-[480px] rounded-full bg-indigo-200/40 blur-[120px]" />
                  </div>
                  {/* Subtle grid */}
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#1f2a4410_1px,transparent_1px),linear-gradient(to_bottom,#1f2a4410_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />

                  <div className="relative z-10 ds-container py-16 md:py-24 lg:py-28">
                    <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

                      {/* Left: Copy */}
                      <div>
                        {/* Badge */}
                        <div className="inline-flex items-center gap-2.5 rounded-full bg-blue-50 border border-blue-100 px-4 py-1.5 text-sm font-semibold text-blue-600 mb-7">
                          <Sparkles className="w-3.5 h-3.5" />
                          AI-Powered Grammar Checker
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        </div>

                        {/* Headline */}
                        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.04] text-gray-900 mb-6">
                          Write without<br />
                          <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            any mistakes.
                          </span>
                        </h1>

                        {/* Subheading */}
                        <p className="text-lg sm:text-xl text-gray-600 leading-relaxed mb-8 max-w-[520px]">
                          CorrectNow instantly fixes grammar, spelling, and punctuation in <strong className="text-gray-900 font-semibold">50+ languages</strong> — without rewriting your voice or tone.
                        </p>

                        {/* CTAs */}
                        <div className="flex flex-col sm:flex-row gap-3 mb-8">
                          <Button
                            className="group h-14 px-8 text-base font-bold rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] hover:shadow-blue-500/40"
                            onClick={() => navigate("/editor")}
                          >
                            Start Free Check
                            <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
                          </Button>
                          <Button
                            variant="outline"
                            className="h-14 px-8 text-base rounded-full border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 transition-all"
                            onClick={() => navigate("/features")}
                          >
                            <PlayCircle className="w-5 h-5 mr-2 text-blue-600" />
                            See How It Works
                          </Button>
                        </div>

                        {/* Trust signals */}
                        <div className="flex flex-wrap gap-5 text-sm text-gray-500 mb-6">
                          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Free forever</span>
                          <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-emerald-500" /> No data stored</span>
                          <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-emerald-500" /> Results in &lt;2 sec</span>
                        </div>

                        {/* Star rating */}
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {[0,1,2,3,4].map((i) => (
                              <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                            ))}
                          </div>
                          <span className="text-sm text-gray-500 font-medium">4.9 · Trusted by 1,000+ writers</span>
                        </div>
                      </div>

                      {/* Right: Live demo preview card */}
                      <div className="relative">
                        <div className="absolute -inset-4 bg-gradient-to-r from-blue-200/40 to-indigo-200/40 rounded-3xl blur-2xl" />
                        <div className="relative bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xl">
                          {/* Window chrome */}
                          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 bg-gray-50">
                            <div className="w-3 h-3 rounded-full bg-red-400" />
                            <div className="w-3 h-3 rounded-full bg-amber-400" />
                            <div className="w-3 h-3 rounded-full bg-emerald-400" />
                            <span className="ml-3 text-xs text-gray-500 font-medium">CorrectNow · Live Preview</span>
                            <div className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              AI Active
                            </div>
                          </div>

                          <div className="p-5 space-y-3">
                            {/* Before */}
                            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Before</div>
                              <p className="text-sm text-gray-700 leading-relaxed">
                                Please{" "}
                                <span className="text-red-500 border-b border-red-400 border-dashed cursor-pointer hover:bg-red-50 rounded px-0.5">recieve</span>
                                {" "}the document and reply when{" "}
                                <span className="text-red-500 border-b border-red-400 border-dashed cursor-pointer hover:bg-red-50 rounded px-0.5">your</span>
                                {" "}done.
                              </p>
                            </div>

                            {/* Arrow */}
                            <div className="flex justify-center py-1">
                              <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                                <ArrowRight className="w-4 h-4 text-emerald-600 rotate-90" />
                              </div>
                            </div>

                            {/* After */}
                            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">After ✓</div>
                              <p className="text-sm text-gray-800 leading-relaxed">
                                Please{" "}
                                <span className="text-emerald-600 font-semibold bg-emerald-100 rounded px-0.5">receive</span>
                                {" "}the document and reply when{" "}
                                <span className="text-emerald-600 font-semibold bg-emerald-100 rounded px-0.5">you're</span>
                                {" "}done.
                              </p>
                            </div>

                            {/* Change log */}
                            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Changes Detected</div>
                              <div className="space-y-2.5 text-sm">
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-red-500 line-through">recieve</span>
                                  <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                  <span className="text-emerald-600 font-semibold">receive</span>
                                  <span className="ml-auto text-gray-500 bg-gray-200/70 rounded px-1.5 py-0.5">Spelling</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-red-500 line-through">your</span>
                                  <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                  <span className="text-emerald-600 font-semibold">you're</span>
                                  <span className="ml-auto text-gray-500 bg-gray-200/70 rounded px-1.5 py-0.5">Grammar</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Status bar */}
                          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
                            <span>2 issues fixed · Explanation included</span>
                            <span className="text-gray-600">50+ languages supported</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stats strip */}
                    <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-gray-200 bg-gray-200 shadow-sm">
                      {[
                        { value: "50+",    label: "Languages supported" },
                        { value: "1K+",    label: "Active writers" },
                        { value: "4.9 ★",  label: "Average rating" },
                        { value: "<2 sec", label: "Response time" },
                      ].map(({ value, label }) => (
                        <div key={label} className="flex flex-col items-center py-6 px-4 bg-white hover:bg-blue-50/50 transition-colors cursor-default">
                          <span className="text-2xl sm:text-3xl font-extrabold text-gray-900">{value}</span>
                          <span className="text-xs text-gray-500 mt-1 text-center">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {/* ═══════════════════════════════════════════
                    LOGO / TRUST BAR
                ═══════════════════════════════════════════ */}
                <section className="py-10 bg-gray-50 border-y border-gray-100">
                  <div className="ds-container">
                    <p className="text-center text-sm text-gray-400 font-medium mb-6 uppercase tracking-widest">Trusted by writers, students, and professionals worldwide</p>
                    <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 text-sm font-semibold text-gray-400">
                      {["Content Writers", "Students", "Journalists", "Researchers", "Bloggers", "Email Marketers", "ESL Learners"].map((t) => (
                        <span key={t} className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>

                {/* ═══════════════════════════════════════════
                    HOW IT WORKS — 3 steps
                ═══════════════════════════════════════════ */}
                <section className="py-20 md:py-28 bg-white">
                  <div className="ds-container">
                    <div className="text-center mb-16">
                      <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-100 px-4 py-1.5 text-sm font-semibold text-indigo-600 mb-5">
                        <Zap className="w-3.5 h-3.5" /> How It Works
                      </div>
                      <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight">
                        Three steps to flawless writing
                      </h2>
                      <p className="text-lg text-gray-500 max-w-xl mx-auto mt-4">
                        No setup. No downloads. Just paste, check, and write with total confidence.
                      </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto relative">
                      {/* Connector lines (desktop only) */}
                      <div className="hidden md:block absolute top-14 left-1/3 right-1/3 h-px bg-gradient-to-r from-blue-200 via-indigo-200 to-emerald-200" />

                      {[
                        { step: "1", icon: FileText, title: "Paste your text", desc: "Copy any text — email, essay, report, or message — and paste it into CorrectNow.", accent: "bg-blue-600", light: "bg-blue-50", text: "text-blue-600" },
                        { step: "2", icon: Sparkles, title: "AI checks instantly", desc: "Our AI engine scans for grammar, spelling, punctuation, and clarity issues in under 2 seconds.", accent: "bg-indigo-600", light: "bg-indigo-50", text: "text-indigo-600" },
                        { step: "3", icon: CheckCircle2, title: "Apply with one click", desc: "Review each suggestion with a clear explanation, then apply all fixes instantly.", accent: "bg-emerald-600", light: "bg-emerald-50", text: "text-emerald-600" },
                      ].map(({ step, icon: Icon, title, desc, accent, light, text }) => (
                        <div key={step} className="flex flex-col items-center text-center group">
                          <div className="relative mb-6">
                            <div className={`w-28 h-28 ${light} rounded-3xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:-translate-y-1`}>
                              <Icon className={`w-12 h-12 ${text}`} />
                            </div>
                            <div className={`absolute -top-3 -right-3 w-8 h-8 ${accent} rounded-full flex items-center justify-center text-white text-sm font-extrabold shadow-lg`}>
                              {step}
                            </div>
                          </div>
                          <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
                          <p className="text-gray-500 text-sm leading-relaxed max-w-xs">{desc}</p>
                        </div>
                      ))}
                    </div>

                    <div className="text-center mt-14">
                      <Button
                        size="lg"
                        className="h-14 px-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-base font-bold shadow-lg shadow-blue-500/25 hover:shadow-xl transition-all hover:scale-[1.02]"
                        onClick={() => navigate("/editor")}
                      >
                        Try it Now — Free
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </Button>
                    </div>
                  </div>
                </section>

                {/* ═══════════════════════════════════════════
                    FEATURES GRID — 6 cards
                ═══════════════════════════════════════════ */}
                <section className="py-20 md:py-28 bg-gradient-to-b from-slate-50 to-white">
                  <div className="ds-container">
                    <div className="text-center mb-16">
                      <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-4 py-1.5 text-sm font-semibold text-blue-600 mb-5">
                        <Sparkles className="w-3.5 h-3.5" /> Why Choose CorrectNow
                      </div>
                      <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight">
                        Everything you need to<br className="hidden sm:block" /> write flawlessly
                      </h2>
                      <p className="text-lg text-gray-500 max-w-2xl mx-auto mt-4">
                        The best free Grammarly alternative — instant, accurate, and built for every language on every device.
                      </p>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                      {[
                        { icon: CheckCircle2, title: "Instant Grammar Check", desc: "Real-time corrections for grammar, spelling, and punctuation powered by advanced AI. Results appear in under 2 seconds." },
                        { icon: Globe, title: "50+ Languages", desc: "English, Spanish, French, Hindi, Tamil, Arabic, Bengali, Marathi, German, and 40+ more — all supported natively." },
                        { icon: Shield, title: "100% Private & Secure", desc: "Your text is never stored, logged, or shared with third parties. What you write stays completely private." },
                        { icon: Zap, title: "Free Forever Plan", desc: "Start checking for free — no credit card needed. Upgrade anytime for higher word limits and power features." },
                        { icon: Sparkles, title: "Smart AI Engine", desc: "Goes beyond spell-check — catches complex grammatical errors, improves clarity, and preserves your unique voice." },
                        { icon: Monitor, title: "Works on Every Device", desc: "Desktop, mobile, or tablet — CorrectNow is fully responsive. Check emails, essays, and social posts anywhere." },
                      ].map(({ icon: Icon, title, desc }) => (
                        <div key={title} className="group relative bg-white rounded-2xl border border-gray-100 p-7 shadow-sm hover:shadow-xl ring-2 ring-transparent group-hover:ring-blue-200 hover:ring-blue-100 transition-all duration-300 hover:-translate-y-1 cursor-default">
                          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-blue-100 transition-all duration-300">
                            <Icon className="w-6 h-6 text-blue-600" />
                          </div>
                          <h3 className="text-lg font-bold text-gray-900 mb-2.5">{title}</h3>
                          <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                        </div>
                      ))}
                    </div>

                    {/* Languages cloud */}
                    <div className="mt-14 rounded-3xl bg-gradient-to-br from-blue-50 via-indigo-50/50 to-violet-50 border border-blue-100 p-8 md:p-10 text-center">
                      <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">
                        Grammar checking in every major language
                      </h3>
                      <div className="flex flex-wrap justify-center gap-2.5 max-w-3xl mx-auto">
                        {["English","Hindi","Tamil","Telugu","Bengali","Marathi","Gujarati","Kannada","Malayalam","Spanish","French","German","Arabic","Portuguese","Russian","Japanese","Korean","Indonesian","Turkish","Vietnamese","Italian","Dutch","Polish","Ukrainian","Romanian","Swedish","Thai","Urdu"].map((lang) => (
                          <span key={lang} className="inline-flex items-center gap-1.5 bg-white border border-blue-100 text-gray-700 text-xs font-semibold rounded-full px-3 py-1.5 shadow-sm hover:border-blue-300 hover:text-blue-700 transition-colors cursor-default">
                            <Globe className="w-3 h-3 text-blue-400" />
                            {lang}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* ═══════════════════════════════════════════
                    TESTIMONIALS — 6 cards in 3-column grid
                ═══════════════════════════════════════════ */}
                <section className="py-20 md:py-28 bg-white">
                  <div className="ds-container">
                    <div className="text-center mb-16">
                      <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-100 px-4 py-1.5 text-sm font-semibold text-amber-700 mb-5">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Real Users, Real Results
                      </div>
                      <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight">
                        Loved by writers everywhere
                      </h2>
                      <p className="text-lg text-gray-500 max-w-2xl mx-auto mt-4">
                        Professionals, students, and creators across 50+ countries trust CorrectNow every day.
                      </p>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                      {[
                        { quote: "CorrectNow helps me write without fear of mistakes. Very easy to use and incredibly accurate.", name: "Arjun Kumar", role: "University Student", lang: "English & Hindi", initial: "A", gradient: "from-blue-500 to-indigo-600" },
                        { quote: "Finally, a grammar checker that truly understands native Indian languages. Game-changing tool.", name: "Meera Nair", role: "Author & Blogger", lang: "Malayalam & Tamil", initial: "M", gradient: "from-violet-500 to-purple-600" },
                        { quote: "We save hours every week and improve content clarity across multiple languages. Highly recommend.", name: "Rohit Menon", role: "Senior Editor", lang: "English & Marathi", initial: "R", gradient: "from-emerald-500 to-teal-600" },
                        { quote: "My client emails and reports sound so much more professional now. Absolute game changer for me.", name: "Anita Sharma", role: "Operations Manager", lang: "English & Telugu", initial: "A", gradient: "from-amber-500 to-orange-600" },
                        { quote: "Excellent accuracy for academic writing. I rate it 10 out of 10. Better than anything I've tried.", name: "Dr. Lukas Schneider", role: "Research Fellow", lang: "German & English", initial: "D", gradient: "from-cyan-500 to-blue-600" },
                        { quote: "CorrectNow understands context and grammar perfectly. A truly powerful and reliable writing tool.", name: "Ramesh Naidu", role: "Script Writer", lang: "Tamil & English", initial: "R", gradient: "from-rose-500 to-pink-600" },
                      ].map(({ quote, name, role, lang, initial, gradient }) => (
                        <div key={name} className="group bg-white rounded-2xl border border-gray-100 p-7 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 flex flex-col">
                          <div className="flex items-center gap-0.5 mb-5">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                            ))}
                          </div>
                          <p className="text-gray-700 leading-relaxed flex-1 mb-5 text-[15px]">
                            "{quote}"
                          </p>
                          <div className="flex items-center gap-3 pt-5 border-t border-gray-100">
                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-sm font-bold shadow-sm flex-shrink-0`}>
                              {initial}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900 text-sm">{name}</div>
                              <div className="text-xs text-gray-500">{role} · {lang}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {/* ═══════════════════════════════════════════
                    PRICING — Free · Pro · Enterprise (3 cards)
                ═══════════════════════════════════════════ */}
                <section className="py-20 md:py-28 bg-gradient-to-b from-slate-50 to-white">
                  <div className="ds-container">
                    <div className="text-center mb-14">
                      <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-4 py-1.5 text-sm font-semibold text-blue-600 mb-5">
                        <Crown className="w-3.5 h-3.5" /> Simple, Transparent Pricing
                      </div>
                      <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight">
                        Start free, upgrade when ready
                      </h2>
                      <p className="text-lg text-gray-500 mt-4">No hidden fees. Cancel anytime.</p>
                      <div className="mt-4 inline-flex items-center gap-2 text-sm text-gray-500 bg-gray-100 rounded-full px-4 py-1.5">
                        <Globe className="w-3.5 h-3.5 text-blue-500" />
                        Regional pricing applied · {regionalPricing.regionLabel}
                      </div>
                    </div>

                    {/* 3-column grid — equal-height, no scale tricks */}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">

                      {/* ── Free ── */}
                      <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-7 flex-1 flex flex-col">
                          <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                              <Zap className="w-5 h-5 text-gray-600" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-gray-900">Free</h3>
                              <p className="text-xs text-gray-400">Perfect for trying out</p>
                            </div>
                          </div>
                          <div className="mb-6">
                            <div className="text-4xl font-extrabold text-gray-900">
                              {formatPrice(regionalPricing.currency, 0)}
                              <span className="text-base font-medium text-gray-400 ml-1.5">/ forever</span>
                            </div>
                          </div>
                          <ul className="space-y-2.5 flex-1 mb-6">
                            {[
                              "200 words per check",
                              "Limited daily checks",
                              "Advanced grammar fixes",
                              "Global languages supported",
                              "Change log with explanations",
                            ].map((f) => (
                              <li key={f} className="flex items-start gap-2.5 text-sm text-gray-600">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />{f}
                              </li>
                            ))}
                            {[
                              "Standard processing speed",
                              "Word checks beyond 200 are Pro-only",
                            ].map((f) => (
                              <li key={f} className="flex items-start gap-2.5 text-sm text-gray-400">
                                <CheckCircle2 className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />{f}
                              </li>
                            ))}
                          </ul>
                          <Button variant="outline" className="w-full h-11 rounded-xl font-semibold border-gray-300" onClick={() => navigate("/editor")}>
                            Get Started — Free
                          </Button>
                        </div>
                      </div>

                      {/* ── Pro ── */}
                      <div className="flex flex-col relative bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-xl shadow-blue-500/20 overflow-hidden">
                        {/* shine orb */}
                        <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
                        {/* badge */}
                        <div className="absolute top-4 right-4 bg-white text-blue-700 text-xs font-bold px-3 py-1 rounded-full shadow">Most Popular</div>
                        <div className="p-7 flex-1 flex flex-col relative">
                          <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                              <Crown className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-white">Pro</h3>
                              <p className="text-xs text-blue-200">For professionals who write daily</p>
                            </div>
                          </div>
                          <div className="mb-6">
                            <div className="text-4xl font-extrabold text-white">
                              {formatPrice(regionalPricing.currency, regionalPricing.amount)}
                              <span className="text-base font-medium text-blue-200 ml-1.5">/ month</span>
                            </div>
                          </div>
                          <ul className="space-y-2.5 flex-1 mb-6">
                            {[
                              "25,000 words monthly",
                              "5,000 words per check",
                              "Advanced grammar fixes",
                              "All languages supported",
                              "Detailed explanations",
                              "Check history (30 days)",
                              "Priority processing",
                              "Export to Word / PDF",
                              "1 word = 1 credit",
                            ].map((f) => (
                              <li key={f} className="flex items-start gap-2.5 text-sm text-blue-50">
                                <CheckCircle2 className="w-4 h-4 text-white flex-shrink-0 mt-0.5" />{f}
                              </li>
                            ))}
                          </ul>
                          <Button
                            className="w-full h-11 rounded-xl font-bold bg-white text-blue-700 hover:bg-blue-50 transition-all"
                            onClick={() => navigate("/pricing")}
                          >
                            Go Pro
                          </Button>
                        </div>
                      </div>

                      {/* ── Enterprise ── */}
                      <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden sm:col-span-2 lg:col-span-1">
                        <div className="p-7 flex-1 flex flex-col">
                          <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                              <Monitor className="w-5 h-5 text-gray-600" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-gray-900">Enterprise</h3>
                              <p className="text-xs text-gray-400">For teams and organizations</p>
                            </div>
                          </div>
                          <div className="mb-6">
                            <div className="text-4xl font-extrabold text-gray-900">
                              Custom
                              <span className="text-base font-medium text-gray-400 ml-1.5">/ contact us</span>
                            </div>
                          </div>
                          <ul className="space-y-2.5 flex-1 mb-6">
                            {[
                              "Everything in Pro",
                              "Unlimited team members",
                              "Custom word limits",
                              "Dedicated account manager",
                              "API access",
                              "Custom integrations",
                              "Advanced analytics & reporting",
                              "Priority 24/7 support",
                              "Custom SLA agreements",
                              "White-label options",
                            ].map((f) => (
                              <li key={f} className="flex items-start gap-2.5 text-sm text-gray-600">
                                <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />{f}
                              </li>
                            ))}
                          </ul>
                          <a href="mailto:info@correctnow.app?subject=Enterprise%20Plan%20Inquiry" className="block">
                            <Button variant="outline" className="w-full h-11 rounded-xl font-semibold border-gray-300">
                              Contact Sales
                            </Button>
                          </a>
                          <p className="text-xs text-gray-400 text-center mt-3">
                            info@correctnow.app
                          </p>
                        </div>
                      </div>

                    </div>

                    <p className="text-center text-sm text-gray-400 mt-8">
                      See full comparison on our{" "}
                      <button className="text-blue-600 hover:underline font-medium" onClick={() => navigate("/pricing")}>
                        Pricing page
                      </button>
                    </p>
                  </div>
                </section>

                {/* Recent documents (only when there are docs) */}
                {filtered.length > 0 && (
                  <div className="ds-container py-10">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-500 mb-2">
                          <FileText className="w-3.5 h-3.5" /> Your workspace
                        </div>
                        <div className="text-2xl font-bold text-gray-900">Recent documents</div>
                      </div>
                    </div>
                    {sections.map((section) => (
                      <div key={section} className="mb-8">
                        <div className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">{section}</div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          {filtered.filter((doc) => doc.section === section).map((doc) => (
                            <Card key={doc.id} className="hover:shadow-lg hover:border-primary/20 transition-all duration-300 border border-gray-100 cursor-pointer" onClick={() => openDoc(doc.id)}>
                              <CardContent className="p-5">
                                <div className="flex items-start gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-4 h-4 text-blue-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate hover:text-primary transition-colors">{doc.title}</p>
                                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{doc.preview}</p>
                                    <p className="text-[11px] text-gray-400 mt-1">{doc.updated}</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Feedback suggestion */}
                <div className="ds-container pb-8">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-base font-bold text-gray-900">Help us improve CorrectNow</div>
                      <div className="text-sm text-gray-500 mt-1">Share an idea or request a feature — we read every single suggestion.</div>
                    </div>
                    <Button
                      variant="outline"
                      className="flex-shrink-0 border-blue-200 text-blue-700 hover:bg-blue-100 rounded-xl"
                      onClick={() => setIsSuggestionOpen(true)}
                    >
                      Suggest a feature
                    </Button>
                  </div>
                </div>

                {/* ═══════════════════════════════════════════
                    FINAL CTA — Branded blue conversion section
                ═══════════════════════════════════════════ */}
                <section className="py-20 md:py-28 bg-gradient-to-br from-blue-600 to-indigo-600 relative overflow-hidden">
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-white/10 blur-[100px] translate-x-1/3 -translate-y-1/3" />
                    <div className="absolute bottom-0 left-0 w-[420px] h-[420px] rounded-full bg-indigo-300/20 blur-[100px] -translate-x-1/3 translate-y-1/3" />
                  </div>
                  <div className="relative z-10 ds-container max-w-4xl text-center">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/15 border border-white/20 px-4 py-1.5 text-sm font-semibold text-white mb-8">
                      <Sparkles className="w-3.5 h-3.5" /> Ready to get started?
                    </div>
                    <h2 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.05] mb-6">
                      Start writing flawlessly<br />
                      today — <span className="text-blue-100">for free.</span>
                    </h2>
                    <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-10">
                      Join thousands of writers, students, and professionals who trust CorrectNow for perfect grammar in any language.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <Button
                        size="lg"
                        className="group h-14 px-10 rounded-full bg-white text-blue-700 hover:bg-blue-50 text-base font-bold shadow-xl transition-all hover:scale-[1.02]"
                        onClick={() => navigate("/editor")}
                      >
                        Check My Text — Free
                        <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-14 px-10 rounded-full border-white/40 text-white bg-white/10 hover:bg-white/20 text-base font-semibold transition-all"
                        onClick={() => navigate("/auth?mode=register")}
                      >
                        Create Free Account
                      </Button>
                    </div>
                    <p className="text-blue-100/80 text-sm mt-8">No credit card required · Free forever plan available</p>
                  </div>
                </section>

              </main>
            </>
          )}
        </>
      )}

      <Dialog open={isSuggestionOpen} onOpenChange={setIsSuggestionOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share your suggestion</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Tell us what you want improved..."
            value={suggestionText}
            onChange={(e) => setSuggestionText(e.target.value)}
            className="min-h-[120px]"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsSuggestionOpen(false)}>
              Cancel
            </Button>
            <Button variant="accent" onClick={handleSubmitSuggestion} disabled={isSubmittingSuggestion}>
              {isSubmittingSuggestion ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isAuthenticated && <Footer />}
    </div>
  );
};

export default Index;
