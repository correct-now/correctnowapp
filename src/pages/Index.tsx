import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [miniEditorText, setMiniEditorText] = useState("");
  const [miniEditorTitle, setMiniEditorTitle] = useState("Untitled Document");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  const [miniEditorLanguage, setMiniEditorLanguage] = useState("auto");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [miniIsLoading, setMiniIsLoading] = useState(false);
  const [miniHasResults, setMiniHasResults] = useState(false);
  const [miniChanges, setMiniChanges] = useState<Array<{ original: string; corrected: string; explanation: string; type: string; status: string }>>([]);
  const [miniCorrectedText, setMiniCorrectedText] = useState("");
  const miniTextareaRef = useRef<HTMLTextAreaElement>(null);
  const miniHighlightRef = useRef<HTMLDivElement>(null);
  const miniHoverTimerRef = useRef<number | null>(null);
  const miniHoverCloseTimerRef = useRef<number | null>(null);
  const [miniIsHoverPopover, setMiniIsHoverPopover] = useState(false);
  const [miniHoveredError, setMiniHoveredError] = useState<string | null>(null);
  const [miniHoverSuggestion, setMiniHoverSuggestion] = useState<{
    open: boolean; top: number; left: number; changeIdx?: number; original: string;
  }>({ open: false, top: 0, left: 0, original: "" });

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
    if (doc) {
      setSelectedDocId(id);
      setMiniEditorTitle(doc.title || "Untitled Document");
      setMiniEditorText(doc.text || "");
      setMiniHasResults(false);
      setMiniChanges([]);
      setMiniCorrectedText("");
    }
  };

  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
          language: miniEditorLanguage,
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
                <div className="container max-w-none px-3 sm:px-4 md:px-0">
                  <div className="flex flex-col md:grid md:grid-cols-[1fr_auto_1fr] md:items-center gap-2 sm:gap-3 py-2 sm:py-4">
                    <div className="flex w-full md:w-auto items-center justify-center md:justify-start md:pl-6">
                      <Link to="/" className="flex items-center">
                        <img
                          src="/Icon/correctnow logo final2.png"
                          alt="CorrectNow"
                          className="brand-logo"
                          loading="eager"
                        />
                      </Link>
                    </div>

                    <nav className="hidden md:flex items-center justify-center gap-4 lg:gap-6">
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

                    <div className="flex w-full md:w-auto items-center justify-center md:justify-end gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-semibold">
                          {userName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-foreground hidden md:block">{userName}</span>
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
                            <div key={docItem.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors group">
                              <Checkbox
                                checked={selectedArchivedIds.has(docItem.id)}
                                onCheckedChange={(v) => toggleArchivedSelected(docItem.id, v === true)}
                                className="flex-shrink-0"
                              />
                              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                                <Archive className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 line-clamp-1">{docItem.title}</p>
                                <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{docItem.preview}</p>
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
                                      className={`flex items-center gap-3 px-5 py-3 transition-colors cursor-pointer group ${
                                        selectedDocId === docItem.id
                                          ? "bg-primary/5 border-l-[3px] border-l-primary"
                                          : "hover:bg-blue-50/50 border-l-[3px] border-l-transparent"
                                      }`}
                                      onClick={() => openDoc(docItem.id)}
                                    >
                                      <Checkbox
                                        checked={selectedDocIds.has(docItem.id)}
                                        onCheckedChange={(v) => toggleDocSelected(docItem.id, v === true)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex-shrink-0"
                                      />
                                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 text-primary" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-base font-semibold text-gray-900 line-clamp-1 group-hover:text-primary transition-colors">
                                          {docItem.title}
                                        </p>
                                        <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">{docItem.preview}</p>
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
              <div className="hidden xl:flex flex-1 flex-row bg-white">
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
                        <LanguageSelector
                          value={miniEditorLanguage}
                          onChange={setMiniEditorLanguage}
                        />
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
                      <button className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        Upload File
                      </button>
                    </div>
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
                <div className="w-[260px] 2xl:w-[280px] border-l border-gray-100 flex-shrink-0 overflow-auto bg-gray-50/50">
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
            // Non-authenticated Layout (Hero + Recent Docs)
            <>
              <main className="flex-1 pt-0 pb-0">
            {!isAuthenticated && (
        <section className="mb-0 relative overflow-hidden bg-white">
          {/* Decorative gradient orb — top right */}
          <div className="pointer-events-none absolute right-0 top-0 w-[680px] h-[680px] rounded-full bg-gradient-to-br from-blue-200/60 via-indigo-300/40 to-violet-300/50 blur-[2px] translate-x-1/3 -translate-y-1/4" />
          <div className="pointer-events-none absolute right-16 top-16 w-[420px] h-[420px] rounded-full bg-gradient-to-br from-blue-100/50 via-indigo-200/30 to-violet-200/40 blur-sm" />

          <div className="container relative py-14 sm:py-20 md:py-28 px-4 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center">

              {/* ── Left copy ── */}
              <div className="max-w-xl">
                {/* Badge pills */}
                <div className="flex flex-wrap gap-3 mb-7">
                  <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-full px-3.5 py-1 bg-gray-50/80">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Global languages grammar check
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-full px-3.5 py-1 bg-gray-50/80">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Grammarly alternative
                  </span>
                </div>

                {/* Headline */}
                <h1 className="text-4xl sm:text-5xl md:text-[3.5rem] font-extrabold text-gray-900 leading-[1.1] tracking-tight">
                  AI Proofreader and<br />
                  Grammar Checker<br />
                  for <span className="text-primary">Every Language</span>
                </h1>

                {/* Description */}
                <p className="text-gray-500 text-base sm:text-lg mt-5 leading-relaxed">
                  Correct grammar, spelling, and punctuation errors instantly with CorrectNow. Your AI-powered writing assistant for clear, confident, and mistake-free content in 50+ languages.
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row gap-3 mt-8">
                  <Button
                    className="group rounded-full bg-gradient-to-r from-gray-900 to-gray-700 text-white px-7 py-5 text-base font-semibold hover:from-gray-800 hover:to-gray-600 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all w-full sm:w-auto"
                    onClick={() => navigate("/editor")}
                  >
                    Check My Text Now — Free
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full border-gray-300 text-gray-700 px-7 py-5 text-base font-semibold hover:bg-gray-100 hover:text-gray-800 hover:border-gray-400 transition-all w-full sm:w-auto"
                    onClick={() => navigate("/features")}
                  >
                    <PlayCircle className="w-4 h-4 mr-2" />
                    See How It Works
                  </Button>
                </div>

                {/* Trust bullets */}
                <div className="flex flex-wrap gap-5 mt-6 text-sm text-gray-500">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-gray-400" /> Free forever</span>
                  <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-gray-400" /> Instant results</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-gray-400" /> No sign-up required</span>
                </div>

                {/* Privacy note */}
                <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-400 italic">
                  <Shield className="w-3.5 h-3.5 shrink-0" />
                  <span>Your privacy matters. We don't store or share your text</span>
                </div>
              </div>

              {/* ── Right: Preview card ── */}
              <div className="relative">
                <Card className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex items-center justify-between text-xs mb-4">
                      <span className="font-semibold text-gray-700">Live preview</span>
                      <span className="text-gray-400">Professional proofreading</span>
                    </div>

                    {/* Original */}
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 mb-3">
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Original</div>
                      <div className="text-sm text-gray-700 leading-relaxed">
                        Please <span className="text-red-500 underline decoration-red-400">recieve</span> the document and reply when <span className="text-red-500 underline decoration-red-400">your</span> done.
                      </div>
                    </div>

                    {/* Corrected */}
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 mb-3">
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Corrected</div>
                      <div className="text-sm text-gray-700 leading-relaxed">
                        Please <span className="text-emerald-600 font-semibold">receive</span> the document and reply when <span className="text-emerald-600 font-semibold">you're</span> done.
                      </div>
                    </div>

                    {/* Change log */}
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Change log</div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <span className="flex-1">recieve</span>
                          <span className="text-gray-300">→</span>
                          <span className="flex-1 font-semibold text-gray-900">receive</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <span className="flex-1">your</span>
                          <span className="text-gray-300">→</span>
                          <span className="flex-1 font-semibold text-gray-900">you're</span>
                        </div>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-3 pt-2.5 border-t border-gray-100">
                        Explanations included for every fix
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* ── Social proof stats bar ── */}
            <div className="mt-16">
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-1">
                  {[0,1,2,3,4].map((i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                  <span className="text-sm text-gray-500 ml-2 font-medium">4.9/5 · Trusted by 1,000+ writers worldwide</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-gray-100 w-full max-w-2xl shadow-sm">
                  {[
                    { value: "50+",    label: "Languages" },
                    { value: "1,000+", label: "Active users" },
                    { value: "4.9/5",  label: "User rating" },
                    { value: "<2 sec", label: "Avg. response" },
                  ].map(({ value, label }) => (
                    <div key={label} className="flex flex-col items-center justify-center bg-gray-50/80 py-4 px-3">
                      <span className="text-xl font-extrabold text-gray-900">{value}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── 4 feature mini-cards ── */}
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Globe,     title: "50+ Languages",        desc: "Check grammar and spelling in over 50 languages with native-level accuracy.",                             bg: "bg-blue-500" },
                { icon: Zap,       title: "Instant Results",       desc: "Get real-time corrections and suggestions as you type or paste your text.",                              bg: "bg-emerald-500" },
                { icon: Shield,    title: "Privacy First",         desc: "Your text is safe with us. We don't store or share your content with anyone.",                          bg: "bg-violet-500" },
                { icon: Sparkles,  title: "AI-Powered Accuracy",   desc: "Advanced AI technology ensures context-aware corrections and better clarity.",                           bg: "bg-orange-500" },
              ].map(({ icon: Icon, title, desc, bg }) => (
                <Card key={title} className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center mb-3`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{title}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
        )}

        {/* How It Works Section */}
        {!isAuthenticated && (
        <section className="py-20 md:py-28 bg-gradient-to-b from-white to-blue-50/30">
          <div className="container">
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-100 px-4 py-1.5 text-sm font-semibold text-indigo-600 mb-5">
                <Zap className="w-3.5 h-3.5" /> How It Works
              </div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-foreground tracking-tight">
                Three steps to flawless writing
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto mt-4">
                No setup, no downloads. Just paste, check, and write with confidence.
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-3 max-w-4xl mx-auto">
              {[
                { step: "01", icon: FileText, title: "Paste your text", desc: "Copy any text — email, essay, report, message — and paste it into CorrectNow.", color: "text-blue-600", bg: "bg-blue-50" },
                { step: "02", icon: Sparkles, title: "AI checks instantly", desc: "Our AI engine scans for grammar, spelling, punctuation, and clarity issues in seconds.", color: "text-indigo-600", bg: "bg-indigo-50" },
                { step: "03", icon: CheckCircle2, title: "Apply corrections", desc: "Review each suggestion with a clear explanation, then apply all fixes with one click.", color: "text-emerald-600", bg: "bg-emerald-50" },
              ].map(({ step, icon: Icon, title, desc, color, bg }) => (
                <div key={step} className="relative flex flex-col items-center text-center gap-4">
                  <div className="relative">
                    <div className={`w-16 h-16 rounded-2xl ${bg} flex items-center justify-center shadow-sm`}>
                      <Icon className={`w-7 h-7 ${color}`} />
                    </div>
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-gray-200 text-[10px] font-extrabold text-gray-500 flex items-center justify-center shadow-sm">{step}</span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        )}

        {/* Features Section */}
        {!isAuthenticated && (
        <section className="container pt-20 pb-12 md:pt-28 md:pb-20">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-4 py-1.5 text-sm font-semibold text-blue-600 mb-5">
              <Sparkles className="w-3.5 h-3.5" /> Why Choose CorrectNow
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-foreground tracking-tight">
              Everything you need to write flawlessly
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mt-4">
              The best free alternative to Grammarly — instant, accurate, and built for every language.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: CheckCircle2, title: "Instant Grammar Check", desc: "Real-time grammar, spelling, and punctuation corrections powered by AI. Results in seconds.", color: "text-emerald-600", bg: "bg-emerald-50", border: "group-hover:border-emerald-200" },
              { icon: Globe, title: "50+ Languages", desc: "English, Spanish, French, German, Tamil, Hindi, Arabic, and 45+ more languages supported natively.", color: "text-blue-600", bg: "bg-blue-50", border: "group-hover:border-blue-200" },
              { icon: Shield, title: "100% Private & Secure", desc: "Your text is never stored or shared. End-to-end privacy with no data logging whatsoever.", color: "text-violet-600", bg: "bg-violet-50", border: "group-hover:border-violet-200" },
              { icon: Zap, title: "Free Forever", desc: "No credit card, no limits on basic checks. Upgrade anytime for power features and higher limits.", color: "text-amber-600", bg: "bg-amber-50", border: "group-hover:border-amber-200" },
              { icon: Sparkles, title: "Smart AI Engine", desc: "Catches complex grammar mistakes, improves sentence structure, and enhances overall clarity.", color: "text-rose-600", bg: "bg-rose-50", border: "group-hover:border-rose-200" },
              { icon: Monitor, title: "Works Everywhere", desc: "Desktop, mobile, or tablet. Check emails, essays, social posts, and documents from any device.", color: "text-cyan-600", bg: "bg-cyan-50", border: "group-hover:border-cyan-200" },
            ].map(({ icon: Icon, title, desc, color, bg, border }) => (
              <Card key={title} className={`group border border-border/60 shadow-sm hover:shadow-xl ${border} transition-all duration-300 hover:-translate-y-1`}>
                <CardContent className="p-6">
                  <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-16 rounded-2xl bg-gradient-to-br from-blue-50 via-white to-indigo-50 border border-blue-100 p-8 md:p-10 text-center">
            <h3 className="text-xl md:text-2xl font-bold text-foreground mb-3">
              Languages supported for grammar checking
            </h3>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              English, Mandarin Chinese, Hindi, Spanish, French, Arabic, Bengali, Portuguese, Russian, Indonesian, Urdu, German, Japanese, Marathi, Telugu, Turkish, Tamil, Vietnamese, Korean, Italian, Thai, Gujarati, Kannada, Malayalam, Polish, Dutch, Greek, Ukrainian, Romanian, Swedish, Hungarian, Czech, and more.
            </p>
          </div>

          <div className="mt-16 text-center">
            <h3 className="text-2xl md:text-3xl font-extrabold text-foreground mb-3">Ready to write error-free?</h3>
            <p className="text-muted-foreground mb-8 text-lg">Join thousands of writers who trust CorrectNow daily.</p>
            <Button
              size="lg"
              className="rounded-full px-8 py-5 text-base font-bold shadow-lg hover:shadow-xl transition-all"
              onClick={() => navigate("/editor")}
            >
              Try Free Grammar Checker
            </Button>
          </div>
        </section>
        )}

        {/* Testimonials Section */}
        {!isAuthenticated && (
        <section className="relative overflow-hidden py-20 md:py-28">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-50/30 to-transparent" />
          <div className="container relative">
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-100 px-4 py-1.5 text-sm font-semibold text-amber-700 mb-5">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Trusted Worldwide
              </div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-foreground tracking-tight">
                Loved by writers everywhere
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto mt-4">
                See what professionals, students, and creators say about CorrectNow.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[
                { quote: "CorrectNow helps me write without fear of mistakes. Very easy to use.", name: "Arjun Kumar", role: "University Student", lang: "English, Hindi", initial: "A", gradient: "from-blue-500 to-indigo-600" },
                { quote: "Finally, a grammar checker that understands native languages properly.", name: "Meera Nair", role: "Author & Blogger", lang: "Malayalam, Tamil", initial: "M", gradient: "from-violet-500 to-purple-600" },
                { quote: "We save time and improve clarity across languages. Highly useful.", name: "Rohit Menon", role: "Senior Editor", lang: "English, Marathi", initial: "R", gradient: "from-emerald-500 to-teal-600" },
                { quote: "My emails and reports sound more professional now. A game changer.", name: "Anita Sharma", role: "Operations Manager", lang: "English, Telugu", initial: "A", gradient: "from-amber-500 to-orange-600" },
                { quote: "Excellent accuracy for research writing. I would rate it 10 out of 10.", name: "Dr. Lukas Schneider", role: "Research Fellow", lang: "German, English", initial: "D", gradient: "from-cyan-500 to-blue-600" },
                { quote: "CorrectNow understands grammar and context perfectly. Powerful tool.", name: "Ramesh Naidu", role: "Script Writer", lang: "Tamil, English", initial: "R", gradient: "from-rose-500 to-pink-600" },
              ].map(({ quote, name, role, lang, initial, gradient }) => (
                <Card key={name} className="group border border-border/50 bg-card hover:shadow-xl hover:border-primary/15 transition-all duration-300">
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex items-center gap-0.5 mb-4">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-foreground leading-relaxed flex-1 mb-4">
                      "{quote}"
                    </p>
                    <div className="text-xs text-muted-foreground mb-4 font-medium">{lang}</div>
                    <div className="flex items-center gap-3 pt-4 border-t border-border/60">
                      <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-sm font-bold shadow-sm`}>
                        {initial}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground text-sm">{name}</div>
                        <div className="text-xs text-muted-foreground">{role}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
        )}

        <div className="container pb-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-secondary border border-border/60 px-4 py-1.5 text-sm font-medium text-muted-foreground mb-2">
                <FileText className="w-3.5 h-3.5" /> Your workspace
              </div>
              <div className="text-2xl md:text-3xl font-bold text-foreground">Recent documents</div>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">No documents found.</div>
          ) : (
            sections.map((section) => (
              <div key={section} className="mb-8">
                <div className="text-sm font-semibold text-muted-foreground mb-3">{section}</div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {filtered
                    .filter((doc) => doc.section === section)
                    .map((doc) => (
                      <div key={doc.id} className="flex justify-end">
                        <Card className="hover:shadow-lg hover:border-primary/20 transition-all duration-300 w-full border border-border/60">
                          <CardContent className="p-5 min-h-[150px]">
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                                <FileText className="w-5 h-5 text-blue-600" />
                              </div>
                              <div className="flex-1">
                                <button
                                  className="text-left text-base font-semibold text-foreground hover:text-primary transition-colors"
                                  onClick={() => openDoc(doc.id)}
                                >
                                  {doc.title}
                                </button>
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {doc.preview}
                                </p>
                                <div className="text-xs text-muted-foreground mt-2">{doc.updated}</div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                </div>
              </div>
            ))
          )}

          <div className="mt-12">
            <Card className="border border-border/60 bg-gradient-to-br from-primary/[0.03] to-transparent shadow-sm">
              <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="text-base font-bold text-foreground">
                    Help us improve CorrectNow
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Share an idea or request a feature — we read every suggestion.
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="border-primary/20 text-primary hover:bg-primary/5"
                  onClick={() => setIsSuggestionOpen(true)}
                >
                  Suggest an improvement
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Final CTA */}
          <div className="mt-20 mb-4 rounded-2xl bg-gradient-to-br from-primary to-blue-700 p-8 md:p-12 text-center text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
            <div className="relative">
              <h3 className="text-2xl md:text-3xl font-extrabold mb-3">Start writing flawlessly today</h3>
              <p className="text-white/80 mb-6 max-w-lg mx-auto">Join thousands of writers, students, and professionals who trust CorrectNow for perfect grammar in any language.</p>
              <Button
                size="lg"
                className="rounded-full bg-white text-primary px-8 py-5 text-base font-bold shadow-lg hover:shadow-xl hover:bg-white/95 transition-all"
                onClick={() => navigate("/editor")}
              >
                Get Started — Free
              </Button>
            </div>
          </div>
        </div>
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
