import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  Users,
  FileText,
  TrendingUp,
  BarChart3,
  Calendar,
  Activity,
  Settings,
  LogOut,
  Search,
  Download,
  Filter,
  MessageSquare,
  CreditCard,
  Bold,
  Italic,
  Underline,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  Undo,
  Redo,
  X,
  Coins,
  UserPlus,
  Upload,
  Globe,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Shield,
  Ban,
  AlertTriangle,
  Crown,
  RefreshCw,
  UserX,
  ShieldCheck,
  ArrowUpDown,
  SortAsc,
  SortDesc,
  Zap,
  Info,
  Mail,
  Phone as PhoneIcon,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { getFirebaseAuth, getFirebaseDb, getFirebaseStorage } from "@/lib/firebase";
import {
  collection,
  collectionGroup,
  deleteField,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  orderBy,
  query,
} from "firebase/firestore";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { toast } from "sonner";
import {
  fetchRemoteSuggestions,
  getSuggestions,
  mergeSuggestions,
  updateSuggestionStatus,
  type SuggestionItem,
} from "@/lib/suggestions";
import { LANGUAGE_OPTIONS } from "@/components/LanguageSelector";
import {
  useAuditLog,
  useSavedPresets,
  useBlogAutosave,
  useSuggestionMeta,
  useKeyboardShortcuts,
  FilterPresetBar,
  AuditTimeline,
  BulkReasonDialog,
  OgPreview,
  JsonLdPanel,
  PriorityBadge,
  SlaTimer,
  exportChecksCsv,
  exportSuggestionsCsv,
  exportPaymentsCsv,
  downloadCsv,
  type FilterPreset,
} from "@/pages/admin-helpers";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  category?: string;
  plan: string;
  wordLimit?: number;
  credits?: number;
  creditsUsed?: number;
  addonCredits?: number;
  addonCreditsExpiryAt?: string;
  adminCredits?: number;
  adminCreditsExpiryAt?: string;
  subscriptionStatus?: string;
  subscriptionUpdatedAt?: string;
  subscriptionCreatedAt?: string;
  subscriptionCurrentPeriodEnd?: string | null;
  subscriptionPeriodStart?: string | null;
  razorpaySubscriptionId?: string;
  stripeSubscriptionId?: string;
  paymentGateway?: string;
  lastPaymentAmount?: number | null;
  razorpayPaidCount?: number | null;
  razorpayTotalCount?: number | null;
  adminPlanExpiresAt?: string | null;
  adminPlanDurationDays?: number | null;
  updatedAt?: string;
  createdAt?: string;
  status?: string;
};

type LiveSubscription = {
  userId: string;
  email: string;
  name: string;
  plan: string;
  paymentGateway: string | null;
  subscriptionStatus: string | null;
  subscriptionCreatedAt: string | null;
  subscriptionUpdatedAt: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  subscriptionPeriodStart: string | null;
  lastPaymentAmount: number | null;
  stripeSubscriptionId: string | null;
  razorpaySubscriptionId: string | null;
  razorpayPaidCount: number | null;
  razorpayTotalCount: number | null;
  createdAt: string | null;
  liveStatus: string | null;
  liveAmount: number | null;
  liveCurrency: string | null;
  livePeriodStart: string | null;
  livePeriodEnd: string | null;
  liveCreatedAt: string | null;
  livePaidCount: number | null;
  liveTotalCount: number | null;
  livePlanName: string | null;
  liveNextChargeAt: string | null;
  livePaymentMethod: string | null;
  liveError: string | null;
};

type BulkPreviewRow = {
  row: number;
  name: string;
  email: string;
  phone: string;
  category: string;
  password: string;
  parseError?: string;
};

type BlogPost = {
  id: string;
  title: string;
  slug?: string;
  contentHtml: string;
  contentText?: string;
  imageUrls?: string[];
  imagePaths?: string[];
  coverImageUrl?: string;
  views?: number;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type Coupon = {
  id: string;
  code: string;
  percent: number;
  active: boolean;
  createdAt?: string;
  expiresAt?: string;
  maxUsage?: number;
  usageCount?: number;
};

// Apply all suggestions sequentially to reconstruct fully-corrected text
const applyAllSuggestions = (text: string, suggestions: Array<{ original: string; corrected: string }>) => {
  let result = text;
  for (const s of suggestions) {
    if (!s.original || s.original === s.corrected) continue;
    const idx = result.indexOf(s.original);
    if (idx !== -1) {
      result = result.slice(0, idx) + s.corrected + result.slice(idx + s.original.length);
    }
  }
  return result;
};

const Admin = () => {
  const auth = useMemo(() => getFirebaseAuth(), []);
  const [user, setUser] = useState(() => auth?.currentUser ?? null);
  const [loading, setLoading] = useState<boolean>(!!auth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState<
    "overview" | "users" | "suggestions" | "checks" | "billing" | "blog" | "seo" | "languages" | "settings" | "auditlog"
  >("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [suggestionSearch, setSuggestionSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  const [checksToday, setChecksToday] = useState(0);
  const [wordsToday, setWordsToday] = useState(0);

  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogSaving, setBlogSaving] = useState(false);
  const [blogLastPublished, setBlogLastPublished] = useState<{ title: string; slug: string; id: string; wasEdit: boolean } | null>(null);
  const [blogEditingId, setBlogEditingId] = useState<string | null>(null);
  const [blogTitle, setBlogTitle] = useState("");
  const [blogCustomSlug, setBlogCustomSlug] = useState("");
  const [blogContentHtml, setBlogContentHtml] = useState("");
  const [blogContentText, setBlogContentText] = useState("");
  const [blogDateTime, setBlogDateTime] = useState("");
  const [blogImages, setBlogImages] = useState<
    Array<{ url?: string; path?: string; file?: File; preview: string }>
  >([]);
  const blogEditorRef = useRef<HTMLDivElement>(null);
  const [blogEditorKey, setBlogEditorKey] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Blog AI Generator
  const [blogAiKeywords, setBlogAiKeywords] = useState("");
  const [blogAiTone, setBlogAiTone] = useState("informative");
  const [blogAiAudience, setBlogAiAudience] = useState("everyone");
  const [blogAiWordCount, setBlogAiWordCount] = useState("800");
  const [blogAiExtraContext, setBlogAiExtraContext] = useState("");
  const [blogAiLanguage, setBlogAiLanguage] = useState("English");
  const [blogAiGenerating, setBlogAiGenerating] = useState(false);
  const [blogAiResult, setBlogAiResult] = useState<null | {
    title: string; slug: string; metaDescription: string; excerpt: string;
    tags: string[]; imagePrompt: string; contentHtml: string;
  }>(null);
  // Blog Image Generation
  const [blogAiImageStyle, setBlogAiImageStyle] = useState("photorealistic");
  const [blogAiImgGenerating, setBlogAiImgGenerating] = useState(false);
  const [blogAiGeneratedImages, setBlogAiGeneratedImages] = useState<Array<{ dataUrl: string }>>([]);
  const [blogAiFallbackImg, setBlogAiFallbackImg] = useState<{ unsplashUrl: string; unsplashSearchUrl: string } | null>(null);
  // Blog Google Indexing
  const [blogIndexingLoading, setBlogIndexingLoading] = useState(false);
  const [blogIndexingResults, setBlogIndexingResults] = useState<{ url: string; ok: boolean; code: number; message?: string; notifyTime?: string | null; type?: string | null; error?: string }[]>([]);

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [couponPercent, setCouponPercent] = useState("");
  const [couponExpiry, setCouponExpiry] = useState("");
  const [couponMaxUsage, setCouponMaxUsage] = useState("");
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [billingSearch, setBillingSearch] = useState("");
  const [liveSubscriptions, setLiveSubscriptions] = useState<LiveSubscription[]>([]);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false);
  const [subscriptionsError, setSubscriptionsError] = useState<string | null>(null);

  // SEO Pages management
  const [seoPages, setSeoPages] = useState<Array<{
    id: string;
    urlSlug: string;
    languageCode: string;
    languageName: string;
    title: string;
    metaDescription: string;
    keywords: string;
    h1: string;
    description: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
  }>>([]);
  const [seoLoading, setSeoLoading] = useState(false);
  const [seoSaving, setSeoSaving] = useState(false);
  const [seoEditingId, setSeoEditingId] = useState<string | null>(null);
  const [seoUrlSlug, setSeoUrlSlug] = useState("");
  const [seoLanguageCode, setSeoLanguageCode] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoMetaDescription, setSeoMetaDescription] = useState("");
  const [seoKeywords, setSeoKeywords] = useState("");
  const [seoH1, setSeoH1] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoActive, setSeoActive] = useState(true);
  const [seoSearch, setSeoSearch] = useState("");
  const [seoPage, setSeoPage] = useState(1);
  const SEO_PAGE_SIZE = 50;
  const [bulkSeoDialogOpen, setBulkSeoDialogOpen] = useState(false);
  const [bulkSeoCreating, setBulkSeoCreating] = useState(false);
  const [indexingServiceJson, setIndexingServiceJson] = useState<string>(() => {
    try { return localStorage.getItem("gIndexServiceJson") || ""; } catch { return ""; }
  });
  const [indexingUrlsText, setIndexingUrlsText] = useState("");
  const [indexingLoading, setIndexingLoading] = useState(false);
  const [indexingStatusLoading, setIndexingStatusLoading] = useState(false);
  const [indexingResults, setIndexingResults] = useState<{ url: string; ok: boolean; code: number; message?: string; notifyTime?: string | null; type?: string | null; error?: string }[]>([]);
  const [bulkLangCode, setBulkLangCode] = useState("");
  const [bulkLangSearch, setBulkLangSearch] = useState("");
  const [bulkSlugsText, setBulkSlugsText] = useState("");

  // AI SEO Content Generator
  const [seoAiKeywords, setSeoAiKeywords] = useState("");
  const [seoAiTone, setSeoAiTone] = useState<"professional" | "friendly" | "technical" | "simple">("professional");
  const [seoAiAudience, setSeoAiAudience] = useState("everyone");
  const [seoAiExtraContext, setSeoAiExtraContext] = useState("");
  const [seoAiGenerating, setSeoAiGenerating] = useState(false);
  const [seoAiVariantIdx, setSeoAiVariantIdx] = useState(0);
  const [seoAiResult, setSeoAiResult] = useState<null | {
    variants: Array<{ title: string; h1: string; metaDescription: string; keywords: string; description: string }>;
    faqItems: Array<{ q: string; a: string }>;
    suggestedInternalLinks?: string[];
  }>(null);

  // Languages management
  const [customLanguages, setCustomLanguages] = useState<Array<{
    id: string;
    code: string;
    name: string;
    createdAt: string;
  }>>([]);
  const [languagesLoading, setLanguagesLoading] = useState(false);
  const [newLanguageCode, setNewLanguageCode] = useState("");
  const [newLanguageName, setNewLanguageName] = useState("");
  const [bulkLanguages, setBulkLanguages] = useState("");
  const [savingLanguage, setSavingLanguage] = useState(false);

  // User checks history
  const [userChecks, setUserChecks] = useState<Array<{
    id: string;
    userId: string;
    userEmail?: string;
    text: string;
    correctedText?: string;
    language: string;
    wordCount: number;
    suggestionsCount: number;
    suggestions?: Array<{ original: string; corrected: string; explanation: string; status?: string }>;
    creditsUsed?: number;
    timestamp: string;
  }>>([]);
  const [checksLoading, setChecksLoading] = useState(false);
  const [checksFilter, setChecksFilter] = useState<"all" | "today" | "week">("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);

  // Admin creation
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // User limit management
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [limitType, setLimitType] = useState<"unlimited" | "limited" | "disabled">("limited");
  const [wordLimitValue, setWordLimitValue] = useState("2000");
  const [creditsValue, setCreditsValue] = useState("25000");
  const [reactivatingUserId, setReactivatingUserId] = useState<string | null>(null);
  
  // Addon credits management
  const [addingCreditsUserId, setAddingCreditsUserId] = useState<string | null>(null);
  const [addonCreditsAmount, setAddonCreditsAmount] = useState("");

  // Plan toggle management
  const [togglingPlanUserId, setTogglingPlanUserId] = useState<string | null>(null);
  const [planGrantDialogUser, setPlanGrantDialogUser] = useState<AdminUser | null>(null);
  const [planGrantDays, setPlanGrantDays] = useState<30 | 90 | 365>(30);
  const [addonCreditsExpiry, setAddonCreditsExpiry] = useState("");
  const [savingAddonCredits, setSavingAddonCredits] = useState(false);

  // User creation
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserCategory, setNewUserCategory] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  const [editUserName, setEditUserName] = useState("");
  const [editUserPhone, setEditUserPhone] = useState("");
  const [editUserCategory, setEditUserCategory] = useState("");

  const [categoryFilter, setCategoryFilter] = useState("");

  // Bulk user upload
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null);
  const [bulkUploadProgress, setBulkUploadProgress] = useState(0);
  const [bulkUploadResults, setBulkUploadResults] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const [isUploadingBulk, setIsUploadingBulk] = useState(false);
  const [bulkUploadPreview, setBulkUploadPreview] = useState<BulkPreviewRow[]>([]);
  const [bulkUploadStep, setBulkUploadStep] = useState<"select" | "preview" | "uploading" | "done">("select");

  // ── Helpers: audit log, presets, suggestion meta, blog autosave ──
  const adminEmail = user?.email || "admin";
  const { entries: auditEntries, log: logAudit, clearLog: clearAuditLog } = useAuditLog(adminEmail);
  const { presets: filterPresets, save: savePreset, remove: removePreset } = useSavedPresets();
  const { get: getSuggMeta, update: updateSuggMeta } = useSuggestionMeta();
  const { lastSaved: blogDraftSaved, loadDraft: loadBlogDraft, clearDraft: clearBlogDraft } = useBlogAutosave(
    blogTitle, blogCustomSlug, blogContentHtml, blogEditingId
  );

  // ── Checks: search + date filter ──
  const [checksSearch, setChecksSearch] = useState("");
  const [checksDateFrom, setChecksDateFrom] = useState("");
  const [checksDateTo, setChecksDateTo] = useState("");
  const [checksUserSearch, setChecksUserSearch] = useState("");

  // ── Suggestions: filter by status/priority ──
  const [suggestionStatusFilter, setSuggestionStatusFilter] = useState<"all" | "new" | "reviewed" | "resolved">("all");
  const [suggestionPriorityFilter, setSuggestionPriorityFilter] = useState<"all" | "low" | "medium" | "high" | "critical">("all");
  const [suggestionTagInput, setSuggestionTagInput] = useState<Record<string, string>>({});
  const [suggestionOwnerInput, setSuggestionOwnerInput] = useState<Record<string, string>>({});

  // ── Billing: search + export ──
  const [billingStatusFilter, setBillingStatusFilter] = useState<"all" | "active" | "past_due" | "cancelled">("all");

  // ── Settings: API key masking ──
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyRotating, setApiKeyRotating] = useState(false);

  // ── Bulk action: reason note dialog ──
  const [bulkReasonOpen, setBulkReasonOpen] = useState(false);
  const [pendingBulkFn, setPendingBulkFn] = useState<((note: string) => Promise<void>) | null>(null);
  const [pendingBulkTitle, setPendingBulkTitle] = useState("");
  const [pendingBulkDesc, setPendingBulkDesc] = useState("");
  const [pendingBulkDestructive, setPendingBulkDestructive] = useState(false);

  // ── SEO: OG preview toggle, duplicate slug warning ──
  const [seoOgPreviewOpen, setSeoOgPreviewOpen] = useState(false);
  const [seoJsonLdOpen, setSeoJsonLdOpen] = useState(false);
  const slugAlreadyExists = useMemo(
    () => seoPages.some((p) => p.urlSlug === seoUrlSlug && p.id !== seoEditingId),
    [seoPages, seoUrlSlug, seoEditingId]
  );

  // Keep Firebase auth state in sync, but fail gracefully if Firebase is not configured
  useEffect(() => {
    if (!auth) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);

  // User deletion
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [isDeletingUsers, setIsDeletingUsers] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  // Enhanced user filters & sort
  const [planFilter, setPlanFilter] = useState<"all" | "free" | "pro">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "deactivated">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "7days" | "30days" | "90days">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name" | "credits">("newest");

  // User profile modal
  const [viewingUser, setViewingUser] = useState<AdminUser | null>(null);

  // Suspend user
  const [suspendingUserId, setSuspendingUserId] = useState<string | null>(null);

  // Bulk actions
  const [bulkPlanDialogOpen, setBulkPlanDialogOpen] = useState(false);
  const [bulkPlanAction, setBulkPlanAction] = useState<"grant" | "revoke">("grant");
  const [bulkPlanDays, setBulkPlanDays] = useState<30 | 90 | 365>(30);
  const [bulkCreditsDialogOpen, setBulkCreditsDialogOpen] = useState(false);
  const [bulkCreditsAmount, setBulkCreditsAmount] = useState("");
  const [bulkCreditsExpiry, setBulkCreditsExpiry] = useState("");
  const [bulkCategoryDialogOpen, setBulkCategoryDialogOpen] = useState(false);
  const [bulkCategoryValue, setBulkCategoryValue] = useState("");
  const [bulkSuspendDialogOpen, setBulkSuspendDialogOpen] = useState(false);
  const [bulkSuspendAction, setBulkSuspendAction] = useState<"suspend" | "reactivate">("suspend");
  const [isBulkActioning, setIsBulkActioning] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);

  // Keyboard shortcuts: G+U → users, G+C → checks, G+B → billing, G+S → suggestions, Mod+Shift+E → export
  useKeyboardShortcuts(
    useMemo(() => ({
      "g+u": () => setActiveTab("users"),
      "g+c": () => setActiveTab("checks"),
      "g+b": () => setActiveTab("billing"),
      "g+s": () => setActiveTab("suggestions"),
    }), [])
  );

  // Helper to wrap a destructive/important bulk action with a reason dialog
  const withBulkReason = useCallback(
    (title: string, description: string, fn: (note: string) => Promise<void>, destructive = false) => {
      setPendingBulkTitle(title);
      setPendingBulkDesc(description);
      setPendingBulkFn(() => fn);
      setPendingBulkDestructive(destructive);
      setBulkReasonOpen(true);
    },
    []
  );

  // Filtered checks (search + date + user)
  const filteredChecks = useMemo(() => {
    let list = userChecks;
    if (checksSearch.trim()) {
      const q = checksSearch.toLowerCase();
      list = list.filter((c) => c.text.toLowerCase().includes(q) || c.language.toLowerCase().includes(q));
    }
    if (checksUserSearch.trim()) {
      const q = checksUserSearch.toLowerCase();
      list = list.filter((c) => (c.userEmail || "").toLowerCase().includes(q) || c.userId.toLowerCase().includes(q));
    }
    if (checksDateFrom) {
      const from = new Date(checksDateFrom).getTime();
      list = list.filter((c) => new Date(c.timestamp).getTime() >= from);
    }
    if (checksDateTo) {
      const to = new Date(checksDateTo).getTime() + 86400000;
      list = list.filter((c) => new Date(c.timestamp).getTime() <= to);
    }
    if (checksFilter === "today") {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      list = list.filter((c) => new Date(c.timestamp) >= todayStart);
    } else if (checksFilter === "week") {
      const weekAgo = Date.now() - 7 * 86400000;
      list = list.filter((c) => new Date(c.timestamp).getTime() >= weekAgo);
    }
    return list;
  }, [userChecks, checksSearch, checksUserSearch, checksDateFrom, checksDateTo, checksFilter]);

  // Filtered suggestions (status + priority)
  const filteredSuggestionsEnhanced = useMemo(() => {
    return suggestions.filter((s) => {
      const meta = getSuggMeta(s.id);
      const matchStatus = suggestionStatusFilter === "all" || s.status === suggestionStatusFilter;
      const matchPriority = suggestionPriorityFilter === "all" || meta.priority === suggestionPriorityFilter;
      const matchSearch = !suggestionSearch.trim() ||
        s.message.toLowerCase().includes(suggestionSearch.toLowerCase()) ||
        (s.email || "").toLowerCase().includes(suggestionSearch.toLowerCase());
      return matchStatus && matchPriority && matchSearch;
    });
  }, [suggestions, getSuggMeta, suggestionStatusFilter, suggestionPriorityFilter, suggestionSearch]);

  // All hooks must be called before any conditional returns
  const filteredUsers = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;
    const dateThresholds: Record<string, number> = {
      "7days": now - 7 * dayMs,
      "30days": now - 30 * dayMs,
      "90days": now - 90 * dayMs,
    };

    let list = users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.phone || "").includes(searchQuery);
      const normalizedCategory = (u.category || "uncategorized").toLowerCase();
      const normalizedFilter = categoryFilter.trim().toLowerCase();
      const matchesCategory = normalizedFilter ? normalizedCategory === normalizedFilter : true;
      const matchesPlan =
        planFilter === "all" ||
        (planFilter === "pro" && u.plan === "Pro") ||
        (planFilter === "free" && u.plan !== "Pro");
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && u.status !== "deactivated") ||
        (statusFilter === "deactivated" && u.status === "deactivated");
      const joinedTs = u.createdAt ? new Date(u.createdAt).getTime() : 0;
      const matchesDate =
        dateFilter === "all" || joinedTs >= (dateThresholds[dateFilter] ?? 0);
      return matchesSearch && matchesCategory && matchesPlan && matchesStatus && matchesDate;
    });

    list.sort((a, b) => {
      if (sortBy === "newest") return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (sortBy === "oldest") return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "credits") return (b.credits || 0) - (a.credits || 0);
      return 0;
    });
    return list;
  }, [users, searchQuery, categoryFilter, planFilter, statusFilter, dateFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // Reset to page 1 when filters/sort/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, planFilter, statusFilter, dateFilter, sortBy, pageSize]);

  // Unique categories from loaded users
  const uniqueCategories = useMemo(() => {
    const cats = new Set(users.map(u => (u.category || "Uncategorized").trim()).filter(Boolean));
    return Array.from(cats).sort();
  }, [users]);

  const filteredSuggestions = useMemo(() => {
    if (!suggestionSearch.trim()) return suggestions;
    const query = suggestionSearch.toLowerCase();
    return suggestions.filter(
      (item) =>
        item.message.toLowerCase().includes(query) ||
        (item.email || "").toLowerCase().includes(query)
    );
  }, [suggestions, suggestionSearch]);

  const proUsers = users.filter((user) => user.plan === "Pro").length;
  const freeUsers = users.filter((user) => user.plan !== "Pro").length;
  const suspendedUsers = users.filter((user) => user.status === "deactivated").length;
  const totalUsers = users.length;
  const conversionRate = totalUsers ? Math.round((proUsers / totalUsers) * 100) : 0;
  const monthlyRevenue = proUsers * 500;
  const isToday = (iso?: string) => {
    if (!iso) return false;
    const date = new Date(iso);
    const now = new Date();
    return date.toDateString() === now.toDateString();
  };
  const newUsersToday = users.filter((user) => isToday(user.createdAt)).length;

  const billingRows = useMemo(() => {
    return users
      .filter((user) => user.plan === "Pro" || user.subscriptionStatus)
      .map((user) => {
        const statusRaw = String(user.subscriptionStatus || "").toLowerCase();
        const statusLabel = statusRaw
          ? statusRaw === "active"
            ? "Paid"
            : statusRaw === "past_due"
              ? "Past Due"
              : "Cancelled"
          : user.plan === "Pro"
            ? "Paid"
            : "Free";
        return {
          name: user.email || user.name,
          plan: user.plan,
          amount: user.plan === "Pro" ? "₹500" : "₹0",
          status: statusLabel,
          date: user.updatedAt || user.createdAt || new Date().toISOString(),
          subscriptionUpdatedAt: user.subscriptionUpdatedAt,
          createdAt: user.createdAt,
          userId: user.id,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [users]);

  // Full billing data for export (not limited)
  const allBillingData = useMemo(() => {
    return users
      .filter((user) => user.plan === "Pro" || user.subscriptionStatus)
      .map((user) => {
        const statusRaw = String(user.subscriptionStatus || "").toLowerCase();
        const statusLabel = statusRaw
          ? statusRaw === "active"
            ? "Paid"
            : statusRaw === "past_due"
              ? "Past Due"
              : "Cancelled"
          : user.plan === "Pro"
            ? "Paid"
            : "Free";
        return {
          name: user.email || user.name,
          plan: user.plan,
          amount: user.plan === "Pro" ? "₹500" : "₹0",
          status: statusLabel,
          date: user.updatedAt || user.createdAt || new Date().toISOString(),
          subscriptionUpdatedAt: user.subscriptionUpdatedAt,
          createdAt: user.createdAt,
          userId: user.id,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [users]);

  const handleExportBilling = () => {
    if (allBillingData.length === 0) {
      alert("No billing data to export");
      return;
    }

    // Create CSV content
    const headers = [
      "Customer",
      "Plan",
      "Amount (INR)",
      "Status",
      "Subscription Date",
      "Subscription Time",
      "Last Updated Date",
      "Last Updated Time",
      "User ID"
    ];

    const rows = allBillingData.map(payment => [
      payment.name,
      payment.plan,
      payment.amount.replace('₹', ''), // Remove rupee symbol for better compatibility
      payment.status,
      payment.subscriptionUpdatedAt 
        ? new Date(payment.subscriptionUpdatedAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          })
        : "N/A",
      payment.subscriptionUpdatedAt
        ? new Date(payment.subscriptionUpdatedAt).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })
        : "N/A",
      new Date(payment.date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }),
      new Date(payment.date).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),
      payment.userId
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => 
        row.map(cell => 
          typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))
            ? `"${cell.replace(/"/g, '""')}"` // Escape quotes and wrap in quotes
            : cell
        ).join(",")
      )
    ].join("\n");

    exportPaymentsCsv(
      allBillingData.map((p) => ({
        userId: p.userId,
        userName: p.name,
        userEmail: p.email,
        plan: p.plan,
        amount: p.amount,
        status: p.status,
        updatedAt: p.date,
      }))
    );
  };

  const fetchLiveSubscriptions = async () => {
    setIsLoadingSubscriptions(true);
    setSubscriptionsError(null);
    try {
      const auth = getFirebaseAuth();
      const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/admin/subscriptions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch subscriptions");
      setLiveSubscriptions(data.subscriptions || []);
    } catch (err) {
      setSubscriptionsError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoadingSubscriptions(false);
    }
  };

  const toLocalInputValue = (iso?: string) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (value: number) => String(value).padStart(2, "0");
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  };

  const resetBlogForm = () => {
    const nowIso = new Date().toISOString();
    setBlogEditingId(null);
    setBlogTitle("");
    setBlogCustomSlug("");
    setBlogContentHtml("");
    setBlogContentText("");
    setBlogDateTime(toLocalInputValue(nowIso));
    setBlogImages([]);
    setBlogEditorKey((prev) => prev + 1);
    setBlogAiResult(null);
    setBlogAiKeywords("");
    setBlogAiExtraContext("");
    setBlogAiGeneratedImages([]);
    setBlogAiFallbackImg(null);
    setBlogLastPublished(null);
  };

  const handleReactivateUser = async (userId: string) => {
    const db = getFirebaseDb();
    if (!db) return;

    setReactivatingUserId(userId);
    try {
      await updateDoc(doc(db, "users", userId), {
        status: "active",
        sessionId: "",
        sessionUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: "active" } : u))
      );
      if (viewingUser?.id === userId) setViewingUser(prev => prev ? { ...prev, status: "active" } : prev);
      toast.success("User reactivated");
    } finally {
      setReactivatingUserId(null);
    }
  };

  const handleSuspendUser = async (userId: string) => {
    const db = getFirebaseDb();
    if (!db) return;
    setSuspendingUserId(userId);
    try {
      await updateDoc(doc(db, "users", userId), {
        status: "deactivated",
        updatedAt: new Date().toISOString(),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: "deactivated" } : u))
      );
      if (viewingUser?.id === userId) setViewingUser(prev => prev ? { ...prev, status: "deactivated" } : prev);
      const target = users.find((u) => u.id === userId);
      logAudit("suspend", userId, target?.email || userId, `Suspended user ${target?.email || userId}`);
      toast.success("User suspended");
    } catch (err) {
      toast.error("Failed to suspend user");
    } finally {
      setSuspendingUserId(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const db = getFirebaseDb();
    if (!db) return;

    setIsDeletingUsers(true);
    try {
      // Call backend API to delete from both Auth and Firestore
      const response = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete user");
      }

      const target = users.find((u) => u.id === userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setSelectedUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
      logAudit("delete", userId, target?.email || userId, `Deleted user ${target?.email || userId}`);
      toast.success("User deleted successfully");
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete user");
    } finally {
      setIsDeletingUsers(false);
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  // ─── SEO AI Content Generator ───────────────────────────────────────────
  const handleSeoAiGenerate = async () => {
    if (!seoUrlSlug || !seoLanguageCode) {
      toast.error("Please fill in URL Slug and Language before generating");
      return;
    }
    setSeoAiGenerating(true);
    setSeoAiResult(null);
    setSeoAiVariantIdx(0);
    try {
      const langName = allLanguages.find(l => l.code === seoLanguageCode)?.name || seoLanguageCode;
      const res = await fetch("/api/seo-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urlSlug: seoUrlSlug,
          languageCode: seoLanguageCode,
          languageName: langName,
          keywords: seoAiKeywords,
          tone: seoAiTone,
          targetAudience: seoAiAudience,
          extraContext: seoAiExtraContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      if (!data.variants?.length) throw new Error("No variants returned");
      setSeoAiResult(data);
      // Auto-apply variant 0 immediately
      const v = data.variants[0];
      setSeoTitle(v.title || "");
      setSeoH1(v.h1 || "");
      setSeoMetaDescription(v.metaDescription || "");
      setSeoKeywords(v.keywords || "");
      setSeoDescription(v.description || "");
      toast.success("Content generated! Review and edit as needed.");
    } catch (err: any) {
      toast.error(err.message || "AI generation failed");
    } finally {
      setSeoAiGenerating(false);
    }
  };

  const applySeoAiVariant = (idx: number) => {
    if (!seoAiResult?.variants?.[idx]) return;
    const v = seoAiResult.variants[idx];
    setSeoTitle(v.title || "");
    setSeoH1(v.h1 || "");
    setSeoMetaDescription(v.metaDescription || "");
    setSeoKeywords(v.keywords || "");
    setSeoDescription(v.description || "");
    setSeoAiVariantIdx(idx);
    toast.success(`Variant ${idx + 1} applied`);
  };
  // ────────────────────────────────────────────────────────────────────────

  // ─── Blog AI Handlers ────────────────────────────────────────────────────
  const handleBlogAiGenerate = async () => {
    if (!blogAiKeywords && !blogTitle) {
      toast.error("Enter keywords or a title first");
      return;
    }
    setBlogAiGenerating(true);
    setBlogAiResult(null);
    setBlogAiGeneratedImages([]);
    setBlogAiFallbackImg(null);
    try {
      const res = await fetch("/api/blog-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: blogTitle,
          keywords: blogAiKeywords,
          tone: blogAiTone,
          targetAudience: blogAiAudience,
          wordCount: parseInt(blogAiWordCount) || 800,
          extraContext: blogAiExtraContext,
          language: blogAiLanguage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setBlogAiResult(data);
      // Auto-apply to form
      if (data.title) setBlogTitle(data.title);
      if (data.slug) setBlogCustomSlug(data.slug);
      if (data.contentHtml && blogEditorRef.current) {
        const linkedHtml = linkifyHtml(data.contentHtml);
        blogEditorRef.current.innerHTML = linkedHtml;
        syncBlogContentState(linkedHtml);
      }
      toast.success("Blog content generated! Review and edit as needed.");
    } catch (err: any) {
      toast.error(err.message || "AI generation failed");
    } finally {
      setBlogAiGenerating(false);
    }
  };

  const handleBlogImageGenerate = async () => {
    const prompt = blogAiResult?.imagePrompt || blogAiKeywords || blogTitle;
    if (!prompt) {
      toast.error("Generate blog content first, or enter keywords");
      return;
    }
    setBlogAiImgGenerating(true);
    setBlogAiGeneratedImages([]);
    setBlogAiFallbackImg(null);
    try {
      const res = await fetch("/api/blog-image-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, style: blogAiImageStyle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed");
      if (data.fallback) {
        setBlogAiFallbackImg({ unsplashUrl: data.unsplashUrl, unsplashSearchUrl: data.unsplashSearchUrl });
        toast.info("Image generation unavailable — showing Unsplash suggestions instead.");
      } else {
        setBlogAiGeneratedImages(data.images || []);
        toast.success(`${data.images?.length} image(s) generated!`);
      }
    } catch (err: any) {
      toast.error(err.message || "Image generation failed");
    } finally {
      setBlogAiImgGenerating(false);
    }
  };

  const applyBlogAiImage = (dataUrl: string) => {
    // Only works for data: URLs (base64) — external URLs can't be fetched cross-origin
    if (!dataUrl.startsWith("data:")) {
      window.open(dataUrl, "_blank");
      return;
    }
    fetch(dataUrl)
      .then(r => r.blob())
      .then(blob => {
        const file = new File([blob], "ai-generated.png", { type: blob.type || "image/png" });
        const preview = dataUrl;
        setBlogImages(prev => [{ file, preview }, ...prev]);
        toast.success("Image added as cover photo");
      })
      .catch(() => toast.error("Failed to apply image"));
  };

  const handleBlogIndexing = async () => {
    const sa = indexingServiceJson;
    if (!sa) { toast.error("Paste your Google service account JSON in the SEO tab first"); return; }
    const urls = blogPosts
      .filter(p => p.slug || p.id)
      .map(p => `https://correctnow.app/blog/${p.slug || p.id}`);
    if (!urls.length) { toast.error("No blog posts to index"); return; }
    setBlogIndexingLoading(true);
    setBlogIndexingResults([]);
    try {
      const res = await fetch("/api/google-index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceAccountJson: sa, urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Indexing failed");
      setBlogIndexingResults(data.results || []);
      const ok = data.results?.filter((r: any) => r.ok).length || 0;
      toast.success(`Submitted ${ok}/${data.results?.length} blog posts to Google`);
    } catch (err: any) {
      toast.error(err.message || "Indexing failed");
    } finally {
      setBlogIndexingLoading(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const handleDeleteSelectedUsers = async () => {
    const db = getFirebaseDb();
    if (!db || selectedUsers.size === 0) return;

    setIsDeletingUsers(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const userId of Array.from(selectedUsers)) {
        try {
          // Call backend API to delete from both Auth and Firestore
          const response = await fetch("/api/admin/delete-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Failed to delete user");
          }

          successCount++;
        } catch (error) {
          console.error(`Error deleting user ${userId}:`, error);
          failCount++;
        }
      }

      setUsers((prev) => prev.filter((u) => !selectedUsers.has(u.id)));
      setSelectedUsers(new Set());

      if (successCount > 0) {
        toast.success(`${successCount} user(s) deleted successfully`);
      }
      if (failCount > 0) {
        toast.error(`Failed to delete ${failCount} user(s)`);
      }
    } finally {
      setIsDeletingUsers(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const toggleSelectUser = (userId: string) => {
    setSelectedUsers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map((u) => u.id)));
    }
  };

  const callBulkAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const ids = Array.from(selectedUsers);
    if (ids.length === 0) return;
    setIsBulkActioning(true);
    try {
      const res = await fetch("/api/admin/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userIds: ids, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk action failed");
      toast.success(`Done: ${data.processed} updated${data.failed ? `, ${data.failed} failed` : ""}`);
      // Refresh user list
      const db = getFirebaseDb();
      if (db) {
        const snap = await getDocs(collection(db, "users"));
        const list: AdminUser[] = snap.docs.map((docSnap) => {
          const d = docSnap.data() as Record<string, any>;
          const planField = String(d?.plan || "").toLowerCase();
          const entitlementPlan = Number(d?.wordLimit) >= 5000 || planField === "pro";
          const status = String(d?.subscriptionStatus || "").toLowerCase();
          const updatedAt = d?.subscriptionUpdatedAt ? new Date(String(d.subscriptionUpdatedAt)) : null;
          const isRecent = updatedAt ? Date.now() - updatedAt.getTime() <= 1000 * 60 * 60 * 24 * 31 : false;
          const isActive = status === "active" && (updatedAt ? isRecent : true);
          const effectivePlan = (status ? isActive && entitlementPlan : entitlementPlan) ? "Pro" : "Free";
          return {
            id: docSnap.id,
            name: d?.name || "User",
            email: d?.email || "",
            category: d?.category,
            plan: effectivePlan,
            phone: d?.phone,
            wordLimit: d?.wordLimit,
            credits: d?.credits,
            creditsUsed: d?.creditsUsed,
            addonCredits: d?.addonCredits,
            addonCreditsExpiryAt: d?.addonCreditsExpiryAt,
            adminCredits: d?.adminCredits,
            adminCreditsExpiryAt: d?.adminCreditsExpiryAt,
            subscriptionStatus: d?.subscriptionStatus,
            subscriptionUpdatedAt: d?.subscriptionUpdatedAt,
            subscriptionCurrentPeriodEnd: d?.subscriptionCurrentPeriodEnd,
            razorpaySubscriptionId: d?.razorpaySubscriptionId,
            stripeSubscriptionId: d?.stripeSubscriptionId,
            adminPlanExpiresAt: d?.adminPlanExpiresAt,
            adminPlanDurationDays: d?.adminPlanDurationDays,
            updatedAt: d?.updatedAt,
            createdAt: d?.createdAt,
            status: d?.status || "active",
          };
        });
        setUsers(list);
      }
      setSelectedUsers(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk action failed");
    } finally {
      setIsBulkActioning(false);
    }
  };

  const handleBulkGrantPro = async (note = "") => {
    const ids = Array.from(selectedUsers);
    await callBulkAction("grant-pro", { durationDays: bulkPlanDays });
    logAudit("bulk_grant_pro", ids.join(","), `${ids.length} users`, `Bulk grant Pro (${bulkPlanDays}d) to ${ids.length} users`, note || undefined);
    setBulkPlanDialogOpen(false);
  };

  const handleBulkRevokePro = async (note = "") => {
    const ids = Array.from(selectedUsers);
    await callBulkAction("revoke-pro");
    logAudit("bulk_revoke_pro", ids.join(","), `${ids.length} users`, `Bulk revoke Pro from ${ids.length} users`, note || undefined);
  };

  const handleBulkAddCredits = async (note = "") => {
    const amount = parseInt(bulkCreditsAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid credits amount"); return; }
    const ids = Array.from(selectedUsers);
    await callBulkAction("add-credits", { creditsAmount: amount, creditsExpiry: bulkCreditsExpiry || undefined });
    logAudit("bulk_add_credits", ids.join(","), `${ids.length} users`, `Bulk add ${amount.toLocaleString()} credits to ${ids.length} users`, note || undefined);
    setBulkCreditsDialogOpen(false);
    setBulkCreditsAmount("");
    setBulkCreditsExpiry("");
  };

  const handleBulkSuspend = async (note = "") => {
    const ids = Array.from(selectedUsers);
    await callBulkAction(bulkSuspendAction);
    logAudit(bulkSuspendAction === "suspend" ? "bulk_suspend" : "bulk_reactivate", ids.join(","), `${ids.length} users`, `Bulk ${bulkSuspendAction} ${ids.length} users`, note || undefined);
    setBulkSuspendDialogOpen(false);
  };

  const handleBulkSetCategory = async (note = "") => {
    if (!bulkCategoryValue.trim()) { toast.error("Enter a category name"); return; }
    const ids = Array.from(selectedUsers);
    await callBulkAction("set-category", { category: bulkCategoryValue.trim() });
    logAudit("bulk_set_category", ids.join(","), `${ids.length} users`, `Bulk set category "${bulkCategoryValue}" for ${ids.length} users`, note || undefined);
    setBulkCategoryDialogOpen(false);
    setBulkCategoryValue("");
  };

  useEffect(() => {
    if (!user) return; // Don't load data if not logged in
    
    const loadUsers = async () => {
      const db = getFirebaseDb();
      if (!db) return;
      const snap = await getDocs(collection(db, "users"));
      const list: AdminUser[] = snap.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, any>;
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
          ? "Pro"
          : "Free";
        return {
          id: docSnap.id,
          name: data?.name || "User",
          email: data?.email || "",
          category: data?.category,
          plan: effectivePlan,
          phone: data?.phone,
          wordLimit: data?.wordLimit,
          credits: data?.credits,
          creditsUsed: data?.creditsUsed,
          addonCredits: data?.addonCredits,
          addonCreditsExpiryAt: data?.addonCreditsExpiryAt,
          subscriptionStatus: data?.subscriptionStatus,
          subscriptionUpdatedAt: data?.subscriptionUpdatedAt,
          subscriptionCreatedAt: data?.subscriptionCreatedAt,
          subscriptionCurrentPeriodEnd: data?.subscriptionCurrentPeriodEnd,
          subscriptionPeriodStart: data?.subscriptionPeriodStart,
          razorpaySubscriptionId: data?.razorpaySubscriptionId,
          stripeSubscriptionId: data?.stripeSubscriptionId,
          paymentGateway: data?.paymentGateway,
          lastPaymentAmount: data?.lastPaymentAmount ?? null,
          razorpayPaidCount: data?.razorpayPaidCount ?? null,
          razorpayTotalCount: data?.razorpayTotalCount ?? null,
          adminPlanExpiresAt: data?.adminPlanExpiresAt ?? null,
          adminPlanDurationDays: data?.adminPlanDurationDays ?? null,
          updatedAt: data?.updatedAt,
          createdAt: data?.createdAt,
          status: data?.status || "active",
        };
      });
      setUsers(list);

      const docsSnap = await getDocs(collectionGroup(db, "docs"));
      setTotalDocs(docsSnap.size);

      // Calculate today's stats
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let wordsAll = 0;
      let checksTodayCount = 0;
      let wordsTodayCount = 0;

      docsSnap.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, any>;
        const text = typeof data?.text === "string" ? data.text : "";
        const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
        wordsAll += wordCount;

        // Check if document was created today
        const createdAt = data?.createdAt;
        if (createdAt) {
          const docDate = typeof createdAt === "string" 
            ? new Date(createdAt) 
            : createdAt?.toDate ? createdAt.toDate() : null;
          
          if (docDate && docDate >= todayStart) {
            checksTodayCount++;
            wordsTodayCount += wordCount;
          }
        }
      });

      setTotalWords(wordsAll);
      setChecksToday(checksTodayCount);
      setWordsToday(wordsTodayCount);
    };

    loadUsers();

    const loadSuggestions = async () => {
      try {
        const local = getSuggestions();
        const remote = await fetchRemoteSuggestions();
        setSuggestions(mergeSuggestions(local, remote));
      } catch (error) {
        console.error("Failed to load suggestions:", error);
        // Use local suggestions only if remote fails
        setSuggestions(getSuggestions());
      }
    };
    loadSuggestions();

    const loadBlogs = async () => {
      const db = getFirebaseDb();
      if (!db) return;
      setBlogLoading(true);
      try {
        const blogQuery = query(
          collection(db, "blogs"),
          orderBy("publishedAt", "desc")
        );
        const snap = await getDocs(blogQuery);
        const list: BlogPost[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, any>;
          const contentHtml = String(data?.contentHtml || data?.content || "");
          const contentText = String(data?.contentText || "").trim();
          const imageUrls: string[] = Array.isArray(data?.imageUrls)
            ? data.imageUrls
            : data?.imageUrl
            ? [String(data.imageUrl)]
            : [];
          const imagePaths: string[] = Array.isArray(data?.imagePaths)
            ? data.imagePaths
            : data?.imagePath
            ? [String(data.imagePath)]
            : [];
          return {
            id: docSnap.id,
            title: data?.title || "",
            contentHtml,
            contentText,
            imageUrls,
            imagePaths,
            coverImageUrl: String(data?.coverImageUrl || imageUrls[0] || ""),
            publishedAt: data?.publishedAt,
            createdAt: data?.createdAt,
            updatedAt: data?.updatedAt,
          };
        });
        setBlogPosts(list);
      } finally {
        setBlogLoading(false);
      }
    };
    loadBlogs();

    const handleStorage = () => loadSuggestions();
    window.addEventListener("correctnow:suggestions-updated", handleStorage);
    return () => window.removeEventListener("correctnow:suggestions-updated", handleStorage);
  }, [user]);

  useEffect(() => {
    const loadCoupons = async () => {
      const db = getFirebaseDb();
      if (!db) return;
      setCouponLoading(true);
      try {
        const snap = await getDocs(collection(db, "coupons"));
        const items: Coupon[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          return {
            id: docSnap.id,
            code: String(data.code || docSnap.id),
            percent: Number(data.percent || 0),
            active: Boolean(data.active ?? true),
            createdAt: String(data.createdAt || ""),
          };
        });
        items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        setCoupons(items);
      } catch (err) {
        console.error("Failed to load coupons", err);
      } finally {
        setCouponLoading(false);
      }
    };
    loadCoupons();
  }, []);

  // Update blog editor content only when loading/resetting, not on every keystroke
  useEffect(() => {
    if (blogEditorRef.current) {
      const linked = linkifyHtml(blogContentHtml);
      blogEditorRef.current.innerHTML = linked;
      if (linked !== blogContentHtml) setBlogContentHtml(linked);
    }
  }, [blogEditorKey]);

  // Load custom languages
  useEffect(() => {
    if (!user) return;
    
    const loadCustomLanguages = async () => {
      const db = getFirebaseDb();
      if (!db) return;
      
      setLanguagesLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "customLanguages"));
        const langs = snapshot.docs.map(doc => ({
          id: doc.id,
          code: doc.data().code || doc.id,
          name: doc.data().name || "",
          createdAt: doc.data().createdAt || new Date().toISOString(),
        })).sort((a, b) => a.name.localeCompare(b.name));
        
        setCustomLanguages(langs);
      } catch (error) {
        console.error("Error loading custom languages:", error);
      } finally {
        setLanguagesLoading(false);
      }
    };

    loadCustomLanguages();
  }, [user]);

  // Load SEO pages when switching to SEO tab
  useEffect(() => {
    if (!user || activeTab !== "seo") return;
    
    const loadSeoPages = async () => {
      const db = getFirebaseDb();
      if (!db) return;
      
      setSeoLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "seoPages"));
        const pages = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setSeoPages(pages);
      } catch (error) {
        console.error("Error loading SEO pages:", error);
      } finally {
        setSeoLoading(false);
      }
    };

    loadSeoPages();
  }, [user, activeTab]);

  // Load user checks when switching to checks tab
  useEffect(() => {
    if (!user || activeTab !== "checks") return;
    
    const loadUserChecks = async () => {
      const db = getFirebaseDb();
      if (!db) return;
      
      setChecksLoading(true);
      try {
        const q = query(
          collection(db, "userChecks"),
          orderBy("timestamp", "desc")
        );
        const snapshot = await getDocs(q);
        const checks = snapshot.docs.map(d => ({
          id: d.id,
          userId: d.data().userId || "anonymous",
          userEmail: d.data().userEmail || "",
          text: d.data().text || "",
          correctedText: d.data().correctedText || null,
          language: d.data().language || "auto",
          wordCount: d.data().wordCount || 0,
          suggestionsCount: d.data().suggestionsCount || 0,
          suggestions: d.data().suggestions || [],
          creditsUsed: d.data().creditsUsed ?? d.data().wordCount ?? 0,
          timestamp: d.data().timestamp || new Date().toISOString(),
        }));
        setUserChecks(checks);
      } catch (error) {
        console.error("Error loading user checks:", error);
      } finally {
        setChecksLoading(false);
      }
    };

    loadUserChecks();
  }, [user, activeTab]);

  // Merge default and custom languages for use in selectors
  const allLanguages = useMemo(() => {
    const customLangOptions = customLanguages.map(lang => ({
      code: lang.code,
      name: lang.name,
    }));
    
    // Merge and deduplicate by code
    const merged = [...LANGUAGE_OPTIONS, ...customLangOptions];
    const uniqueMap = new Map(merged.map(lang => [lang.code, lang]));
    return Array.from(uniqueMap.values());
  }, [customLanguages]);

  const handleCreateCoupon = async () => {
    const db = getFirebaseDb();
    if (!db) return;
    const code = couponCode.trim().toUpperCase();
    const percent = Number(couponPercent);
    if (!code) {
      toast.error("Enter a coupon code");
      return;
    }
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      toast.error("Enter a valid percentage (1-100)");
      return;
    }
    setCouponSaving(true);
    try {
      const ref = doc(db, "coupons", code);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        toast.error("Coupon code already exists");
        return;
      }
      const newCouponData: Omit<Coupon, 'id'> = {
        code,
        percent,
        active: true,
        createdAt: new Date().toISOString(),
        ...(couponExpiry ? { expiresAt: couponExpiry } : {}),
        ...(couponMaxUsage && Number(couponMaxUsage) > 0 ? { maxUsage: Number(couponMaxUsage), usageCount: 0 } : {}),
      };
      await setDoc(ref, newCouponData);
      setCoupons((prev) => [
        { id: code, ...newCouponData },
        ...prev,
      ]);
      setCouponCode("");
      setCouponPercent("");
      setCouponExpiry("");
      setCouponMaxUsage("");
      toast.success("Coupon created");
    } catch (err) {
      console.error("Failed to create coupon", err);
      toast.error("Failed to create coupon");
    } finally {
      setCouponSaving(false);
    }
  };

  const handleCreateAdmin = async () => {
    if (!auth) {
      toast.error("Firebase is not configured.");
      return;
    }

    if (!newAdminEmail || !newAdminPassword) {
      toast.error("Email and password are required");
      return;
    }

    if (newAdminPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setCreatingAdmin(true);
    try {
      // Get auth token
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("You must be logged in to create admin users");
      }

      const idToken = await currentUser.getIdToken();

      const response = await fetch("/api/set-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          email: newAdminEmail,
          password: newAdminPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create admin");
      }

      toast.success(`Admin access granted to ${newAdminEmail}`);
      setNewAdminEmail("");
      setNewAdminPassword("");
    } catch (err: any) {
      console.error("Failed to create admin", err);
      toast.error(err.message || "Failed to create admin");
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleTogglePlan = async (user: AdminUser) => {
    if (user.plan !== "Pro") {
      // Open duration dialog before granting Pro
      setPlanGrantDialogUser(user);
      setPlanGrantDays(30);
      return;
    }
    // Downgrade directly
    setTogglingPlanUserId(user.id);
    try {
      const response = await fetch("/api/admin/toggle-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to toggle plan");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, plan: "Free", wordLimit: data.wordLimit, subscriptionStatus: data.subscriptionStatus, adminPlanExpiresAt: null }
            : u
        )
      );
      toast.success("User downgraded to Free");
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle plan");
    } finally {
      setTogglingPlanUserId(null);
    }
  };

  const handleConfirmPlanGrant = async () => {
    if (!planGrantDialogUser) return;
    const userId = planGrantDialogUser.id;
    setTogglingPlanUserId(userId);
    setPlanGrantDialogUser(null);
    try {
      const response = await fetch("/api/admin/toggle-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, durationDays: planGrantDays }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to grant plan");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                plan: "Pro",
                wordLimit: data.wordLimit,
                subscriptionStatus: data.subscriptionStatus,
                adminPlanExpiresAt: data.adminPlanExpiresAt,
              }
            : u
        )
      );
      const label = planGrantDays === 30 ? "30 days" : planGrantDays === 90 ? "3 months" : "1 year";
      logAudit("grant_pro", userId, planGrantDialogUser?.email || userId, `Granted Pro plan for ${label}`);
      toast.success(`Pro plan granted for ${label}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to grant plan");
    } finally {
      setTogglingPlanUserId(null);
    }
  };

  const handleToggleCoupon = async (coupon: Coupon) => {
    const db = getFirebaseDb();
    if (!db) return;
    try {
      await updateDoc(doc(db, "coupons", coupon.id), { active: !coupon.active });
      setCoupons((prev) =>
        prev.map((item) =>
          item.id === coupon.id ? { ...item, active: !coupon.active } : item
        )
      );
    } catch (err) {
      console.error("Failed to update coupon", err);
      toast.error("Failed to update coupon");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      if (!auth) {
        throw new Error("Firebase is not configured.");
      }
      // Clear any existing session data before login
      localStorage.removeItem("correctnow:sessionId");
      
      await signInWithEmailAndPassword(auth, email, password);
      
      // Reset admin state
      setUsers([]);
      setSelectedUsers(new Set());
      setActiveTab("overview");
    } catch (error: any) {
      setLoginError(error.message || "Failed to login");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (!auth) {
        throw new Error("Firebase is not configured.");
      }
      // Clear session data
      localStorage.removeItem("correctnow:sessionId");
      
      // Clear admin state
      setUsers([]);
      setSelectedUsers(new Set());
      setBlogPosts([]);
      setCoupons([]);
      setSuggestions([]);
      setActiveTab("overview");
      
      // Sign out
      await auth.signOut();
    } catch (error) {
      console.error("Error during logout:", error);
      toast.error("Failed to sign out");
    }
  };

  const downloadSampleCSV = () => {
    const ts = Date.now();
    const csvContent = `name,email,phone,category,password
Arjun Kumar,arjun${ts}@college.edu,9876543210,Batch A,pass123
Priya Singh,priya${ts}@college.edu,+91 98123 45678,Batch A,pass456
Ravi Sharma,ravi${ts}@college.edu,,Batch B,pass789
Meena Raj,meena${ts}@gmail.com,,,pass999`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', 'sample_users.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Sample CSV downloaded — phone column is optional (any format or blank)");
  };

  const exportUsersCsv = () => {
    const rows = (filteredUsers.length ? filteredUsers : users).map((user) => [
      user.name || "",
      user.email || "",
      user.phone || "",
      user.category || "",
      user.plan || "",
      user.status || "",
      user.wordLimit ?? "",
      user.credits ?? "",
      user.creditsUsed ?? "",
      user.addonCredits ?? "",
      user.addonCreditsExpiryAt || "",
      user.createdAt || user.updatedAt || "",
    ]);

    const header = [
      "name",
      "email",
      "phone",
      "category",
      "plan",
      "status",
      "wordLimit",
      "credits",
      "creditsUsed",
      "addonCredits",
      "addonCreditsExpiryAt",
      "joined",
    ];

    const escapeCsv = (value: string | number | null | undefined) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const csvContent = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF", csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "users_export.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Users exported successfully!");
  };

  const handleEditUser = (userId: string, userData: AdminUser) => {
    setEditingUserId(userId);
    setWordLimitValue(String(userData.wordLimit || 2000));
    setCreditsValue(String(userData.credits || 25000));
    setEditUserName(userData.name || "");
    setEditUserPhone(userData.phone || "");
    setEditUserCategory(userData.category || "");
    if (userData.wordLimit === 999999) {
      setLimitType("unlimited");
    } else if (userData.wordLimit === 0) {
      setLimitType("disabled");
    } else {
      setLimitType("limited");
    }
  };

  const handleAddAddonCredits = (userId: string, userData: AdminUser) => {
    setAddingCreditsUserId(userId);
    setAddonCreditsAmount("");
    // Default expiry to 30 days from now
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + 30);
    setAddonCreditsExpiry(defaultExpiry.toISOString().slice(0, 16));
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    const phoneValue = newUserPhone.trim();
    const categoryValue = newUserCategory.trim();
    const phoneRegex = /^\+?[0-9\s()\-]{7,20}$/;
    if (phoneValue && !phoneRegex.test(phoneValue)) {
      toast.error("Please enter a valid phone number");
      return;
    }

    // Password validation (minimum 6 characters)
    if (newUserPassword.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    setCreatingUser(true);
    try {
      const payload: Record<string, unknown> = {
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        password: newUserPassword,
      };
      if (phoneValue) payload.phone = phoneValue;
      if (categoryValue) payload.category = categoryValue;

      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      const contentType = response.headers.get("content-type") || "";
      let data: any = null;

      if (rawText) {
        const looksJson = contentType.includes("application/json") || rawText.trim().startsWith("{") || rawText.trim().startsWith("[");
        if (looksJson) {
          try {
            data = JSON.parse(rawText);
          } catch {
            data = null;
          }
        }
      }

      if (!response.ok) {
        const message =
          (data && (data.error || data.message)) ||
          rawText ||
          `Failed to create user (HTTP ${response.status})`;
        throw new Error(message);
      }

      if (!data) {
        throw new Error("Server returned an empty response");
      }

      // Add new user to local state
      setUsers((prev) => [
        {
          id: data.uid,
          name: data.name,
          email: data.email,
          phone: data.phone,
          category: data.category,
          plan: "free",
          wordLimit: 200,
          credits: 0,
          creditsUsed: 0,
          subscriptionStatus: "inactive",
          status: "active",
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      toast.success(`User created successfully! Email: ${data.email}, Password: ${newUserPassword}`);
      
      // Reset form
      setIsCreateUserOpen(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPhone("");
      setNewUserCategory("");
      setNewUserPassword("");
    } catch (error) {
      console.error("Failed to create user:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create user");
    } finally {
      setCreatingUser(false);
    }
  };

  // Parse CSV into a preview — no users created yet
  const handleParseCsvForPreview = async () => {
    if (!bulkUploadFile) { toast.error("Please select a CSV file"); return; }
    if (!bulkUploadFile.name.toLowerCase().endsWith('.csv')) {
      toast.error("Please upload a .csv file"); return;
    }
    try {
      const text = await bulkUploadFile.text();
      const raw = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (raw.length === 0) { toast.error("CSV file is empty"); return; }

      // Respect quoted fields
      const parseLine = (line: string): string[] => {
        const result: string[] = [];
        let cur = '', inQ = false;
        for (const ch of line) {
          if (ch === '"' || ch === "'") { inQ = !inQ; }
          else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
          else { cur += ch; }
        }
        result.push(cur.trim());
        return result;
      };

      // Auto-detect header row
      const firstLow = raw[0].toLowerCase();
      const hasHeader = ['name','email','phone','password','category','pass','mobile'].some(k => firstLow.includes(k));

      let nameIdx = 0, emailIdx = 1, phoneIdx = -1, categoryIdx = -1, passwordIdx = 2;
      let dataLines = raw;

      if (hasHeader) {
        const headers = parseLine(raw[0]).map(h => h.toLowerCase().trim());
        nameIdx     = headers.findIndex(h => h.includes('name'));
        emailIdx    = headers.findIndex(h => h.includes('email'));
        phoneIdx    = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h === 'ph');
        categoryIdx = headers.findIndex(h => h.includes('category') || h.includes('group') || h.includes('batch'));
        passwordIdx = headers.findIndex(h => h.includes('password') || h.includes('pass') || h === 'pwd');
        if (nameIdx < 0) nameIdx = 0;
        if (emailIdx < 0) emailIdx = 1;
        if (passwordIdx < 0) passwordIdx = headers.length - 1;
        dataLines = raw.slice(1);
      }

      const preview: BulkPreviewRow[] = dataLines.map((line, i) => {
        const parts = parseLine(line);
        let name = '', email = '', phone = '', category = '', password = '', parseError: string | undefined;

        if (hasHeader) {
          name     = (nameIdx >= 0 ? parts[nameIdx] : '') || '';
          email    = (emailIdx >= 0 ? parts[emailIdx] : '') || '';
          phone    = (phoneIdx >= 0 ? parts[phoneIdx] : '') || '';
          category = (categoryIdx >= 0 ? parts[categoryIdx] : '') || '';
          password = (passwordIdx >= 0 ? parts[passwordIdx] : '') || '';
        } else {
          if (parts.length < 3) {
            parseError = `Only ${parts.length} column(s) — need at least name, email, password`;
            name = parts[0] || ''; email = parts[1] || '';
          } else {
            name = parts[0]; email = parts[1];
            if (parts.length === 3)      { password = parts[2]; }
            else if (parts.length === 4) { phone = parts[2]; password = parts[3]; }
            else                         { phone = parts[2]; category = parts[3]; password = parts[4] || ''; }
          }
        }

        if (!parseError) {
          if (!name.trim())                  parseError = 'Name is missing';
          else if (!email.trim())            parseError = 'Email is missing';
          else if (!email.includes('@'))     parseError = `Invalid email: "${email}"`;
          else if (!password.trim())         parseError = 'Password is missing';
          else if (password.trim().length < 6) parseError = `Password too short (min 6): "${password}"`;
        }

        return { row: i + (hasHeader ? 2 : 1), name: name.trim(), email: email.trim(), phone: phone.trim(), category: category.trim(), password: password.trim(), parseError };
      });

      setBulkUploadPreview(preview);
      setBulkUploadStep('preview');
    } catch (err) {
      toast.error('Failed to read CSV file');
    }
  };

  // Actually create users — only called after admin confirms the preview
  const handleConfirmBulkUpload = async () => {
    const valid = bulkUploadPreview.filter(r => !r.parseError);
    if (valid.length === 0) { toast.error('No valid rows to upload'); return; }
    setIsUploadingBulk(true);
    setBulkUploadProgress(0);
    setBulkUploadStep('uploading');
    setBulkUploadResults(null);
    const results = { success: 0, failed: 0, errors: [] as string[] };
    for (let i = 0; i < valid.length; i++) {
      const row = valid[i];
      try {
        const res = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: row.name, email: row.email, phone: row.phone || undefined, category: row.category || undefined, password: row.password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create user');
        results.success++;
        setUsers(prev => [{ id: data.uid, name: data.name, email: data.email, phone: data.phone, category: data.category, plan: 'free', wordLimit: 200, credits: 0, creditsUsed: 0, subscriptionStatus: 'inactive', status: 'active', createdAt: new Date().toISOString() }, ...prev]);
      } catch (err) {
        results.failed++;
        results.errors.push(`Row ${row.row} (${row.email}): ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
      setBulkUploadProgress(Math.round(((i + 1) / valid.length) * 100));
    }
    setBulkUploadResults(results);
    setBulkUploadStep('done');
    setIsUploadingBulk(false);
    if (results.success > 0) toast.success(`Created ${results.success} user(s)`);
    if (results.failed > 0) toast.error(`${results.failed} failed — see details below`);
  };

  const handleSaveAddonCredits = async () => {
    if (!addingCreditsUserId) return;
    
    const db = getFirebaseDb();
    if (!db) {
      toast.error("Database not available");
      return;
    }

    const amount = parseInt(addonCreditsAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid credits amount");
      return;
    }

    if (!addonCreditsExpiry) {
      toast.error("Please select an expiry date");
      return;
    }

    setSavingAddonCredits(true);
    try {
      const userRef = doc(db, "users", addingCreditsUserId);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : {};
      
      // Get current addon credits
      const currentAddon = Number(userData?.addonCredits || 0);
      const currentExpiry = userData?.addonCreditsExpiryAt;
      
      // Check if current credits are still valid
      const now = new Date();
      const isCurrentValid = currentExpiry 
        ? new Date(String(currentExpiry)).getTime() > now.getTime() 
        : false;
      
      // Add to existing if still valid, otherwise replace
      const newAddonCredits = isCurrentValid ? currentAddon + amount : amount;
      
      await updateDoc(userRef, {
        addonCredits: newAddonCredits,
        addonCreditsExpiryAt: addonCreditsExpiry,
        creditsUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === addingCreditsUserId
            ? { 
                ...u, 
                addonCredits: newAddonCredits,
                addonCreditsExpiryAt: addonCreditsExpiry,
              }
            : u
        )
      );

      const target = users.find((u) => u.id === addingCreditsUserId);
      logAudit("add_credits", addingCreditsUserId!, target?.email || addingCreditsUserId!, `Added ${amount.toLocaleString()} addon credits (expires ${addonCreditsExpiry})`);
      toast.success(`Added ${amount.toLocaleString()} credits successfully!`);
      setAddingCreditsUserId(null);
      setAddonCreditsAmount("");
      setAddonCreditsExpiry("");
    } catch (error) {
      console.error("Failed to add addon credits:", error);
      toast.error("Failed to add credits");
    } finally {
      setSavingAddonCredits(false);
    }
  };

  const handleSaveUserLimits = async () => {
    if (!editingUserId) return;
    
    const db = getFirebaseDb();
    if (!db) return;

    try {
      const updates: any = {};
      
      if (limitType === "unlimited") {
        updates.wordLimit = 999999;
        updates.credits = 999999;
        updates.plan = "pro";
        updates.status = "active";
        updates.subscriptionStatus = "active";
        updates.subscriptionUpdatedAt = new Date().toISOString();
      } else if (limitType === "disabled") {
        updates.wordLimit = 0;
        updates.credits = 0;
        updates.plan = "free";
        updates.status = "deactivated";
        updates.subscriptionStatus = "inactive";
        updates.subscriptionUpdatedAt = new Date().toISOString();
      } else {
        const wordLimit = parseInt(wordLimitValue);
        const credits = parseInt(creditsValue);
        updates.wordLimit = isNaN(wordLimit) ? 2000 : wordLimit;
        updates.credits = isNaN(credits) ? 25000 : credits;
        updates.status = "active";

        // Keep plan/status consistent when using custom limits
        const inferredPro = (updates.wordLimit ?? 0) >= 5000;
        updates.plan = inferredPro ? "pro" : "free";
        updates.subscriptionStatus = inferredPro ? "active" : "inactive";
        updates.subscriptionUpdatedAt = new Date().toISOString();
      }

      updates.updatedAt = new Date().toISOString();

        const phoneValue = editUserPhone.trim();
        const phoneRegex = /^\+?[0-9\s()\-]{7,20}$/;
        if (phoneValue && !phoneRegex.test(phoneValue)) {
          toast.error("Please enter a valid phone number");
          return;
        }

        updates.name = editUserName.trim() || "User";
        updates.phone = phoneValue ? phoneValue : deleteField();
        updates.category = editUserCategory.trim() ? editUserCategory.trim() : deleteField();

      const userRef = doc(db, "users", editingUserId);
      await updateDoc(userRef, updates);

      // Reload users
      const snap = await getDocs(collection(db, "users"));
      const list: AdminUser[] = snap.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, any>;
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
          ? "Pro"
          : "Free";
        return {
          id: docSnap.id,
          name: data?.name || "User",
          email: data?.email || "",
          phone: data?.phone,
          category: data?.category,
          plan: effectivePlan,
          wordLimit: data?.wordLimit,
          credits: data?.credits,
          creditsUsed: data?.creditsUsed,
          addonCredits: data?.addonCredits,
          addonCreditsExpiryAt: data?.addonCreditsExpiryAt,
          subscriptionStatus: data?.subscriptionStatus,
          subscriptionUpdatedAt: data?.subscriptionUpdatedAt,
          updatedAt: data?.updatedAt,
          createdAt: data?.createdAt,
          status: data?.status || "active",
        };
      });
      setUsers(list);
      const target = users.find((u) => u.id === editingUserId);
      logAudit("edit_limits", editingUserId!, target?.email || editingUserId!, `Limits updated: type=${limitType}, wordLimit=${wordLimitValue}, credits=${creditsValue}, category=${editUserCategory}`);
      setEditingUserId(null);
    } catch (error) {
      console.error("Failed to update user limits:", error);
      alert("Failed to update user limits");
    }
  };

  const handleBlogImagesChange = (files?: FileList | null) => {
    if (!files || !files.length) return;
    const next = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setBlogImages((prev) => [...prev, ...next]);
  };

  const removeBlogImage = (index: number) => {
    setBlogImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleEditBlog = (post: BlogPost) => {
    setBlogEditingId(post.id);
    setBlogTitle(post.title || "");
    setBlogCustomSlug(post.slug || "");
    setBlogContentHtml(post.contentHtml || "");
    setBlogContentText(post.contentText || "");
    setBlogDateTime(toLocalInputValue(post.publishedAt));
    setBlogImages(
      (post.imageUrls || []).map((url, idx) => ({
        url,
        path: post.imagePaths?.[idx],
        preview: url,
      }))
    );
    setBlogEditorKey((prev) => prev + 1);
  };

  const syncBlogContentState = (html: string) => {
    setBlogContentHtml(html);
    const text = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
    setBlogContentText(text);
  };

  const applyBlogCommand = (command: string, value?: string) => {
    const target = blogEditorRef.current;
    if (!target) return;
    target.focus();
    
    // For headings and blockquote, wrap selected text only
    if (command === 'formatBlock' && (value === '<h2>' || value === '<h3>' || value === '<blockquote>')) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      
      const range = selection.getRangeAt(0);
      const selectedText = range.toString();
      
      if (selectedText) {
        // Create the appropriate element
        const tagName = value.replace(/[<>]/g, '');
        const element = document.createElement(tagName);
        element.textContent = selectedText;
        
        // Replace selection with new element
        range.deleteContents();
        range.insertNode(element);
        
        // Add a line break after if needed
        const br = document.createElement('br');
        element.parentNode?.insertBefore(br, element.nextSibling);
        
        // Move cursor after the element
        const newRange = document.createRange();
        newRange.setStartAfter(element);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      } else {
        // No selection, just apply to current line
        document.execCommand(command, false, value);
      }
    } else {
      // For other commands (bold, italic, underline, lists), use normal execCommand
      document.execCommand(command, false, value);
    }
    
    syncBlogContentState(target.innerHTML);
  };

  const handleBlogKeyDown = (e: React.KeyboardEvent) => {
    // Handle Ctrl+U for underline
    if (e.ctrlKey && e.key === 'u') {
      e.preventDefault();
      applyBlogCommand('underline');
    }
  };

  /** Convert bare URLs in HTML to clickable <a> tags (skips already-linked URLs) */
  const linkifyHtml = (html: string): string => {
    return html.replace(
      /(<a[\s\S]*?<\/a>)|(\bhttps?:\/\/[^\s<>"'&)(\]]+)/g,
      (match, aTag, url) => {
        if (aTag) return aTag; // already an anchor — leave intact
        // Strip trailing punctuation that's unlikely part of the URL
        const stripped = url.replace(/[.,;:!?)]+$/, "");
        return `<a href="${stripped}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${stripped}</a>`;
      }
    );
  };

  const handleBlogPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // After the browser inserts pasted content, linkify any bare URLs in it
    setTimeout(() => {
      if (!blogEditorRef.current) return;
      const newHtml = linkifyHtml(blogEditorRef.current.innerHTML);
      if (newHtml !== blogEditorRef.current.innerHTML) {
        blogEditorRef.current.innerHTML = newHtml;
        syncBlogContentState(newHtml);
      }
    }, 0);
  };

  const handleBlogLink = () => {
    const url = window.prompt("Enter URL");
    if (!url) return;
    applyBlogCommand("createLink", url);
  };

  const handleSaveBlog = async () => {
    const db = getFirebaseDb();
    if (!db) return;
    const plainText = blogContentText || blogContentHtml.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!blogTitle.trim() || !plainText) {
      toast.error("Title and content are required");
      return;
    }

    setBlogSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const publishedAtIso = blogDateTime
        ? new Date(blogDateTime).toISOString()
        : nowIso;

      const existing = blogEditingId
        ? blogPosts.find((post) => post.id === blogEditingId)
        : null;

      const docRef = blogEditingId
        ? doc(db, "blogs", blogEditingId)
        : doc(collection(db, "blogs"));

      const storage = getFirebaseStorage();
      const retainedExisting = blogImages.filter((item) => !item.file && item.url);
      const retainedPaths = retainedExisting
        .map((item) => item.path)
        .filter((value): value is string => Boolean(value));
      const existingPaths = existing?.imagePaths || [];
      const removedPaths = existingPaths.filter((path) => !retainedPaths.includes(path));

      if (storage && removedPaths.length) {
        await Promise.all(
          removedPaths.map((path) =>
            deleteObject(storageRef(storage, path)).catch(() => null)
          )
        );
      }

      let uploaded: Array<{ url: string; path: string }> = [];
      if (storage) {
        const newFiles = blogImages.filter((item) => item.file);
        uploaded = await Promise.all(
          newFiles.map(async (item) => {
            const file = item.file as File;
            const path = `blog-images/${docRef.id}/${Date.now()}-${file.name}`;
            const fileRef = storageRef(storage, path);
            await uploadBytes(fileRef, file);
            const url = await getDownloadURL(fileRef);
            return { url, path };
          })
        );
      }

      const finalImageUrls = [
        ...retainedExisting.map((item) => item.url as string),
        ...uploaded.map((item) => item.url),
      ];
      const finalImagePaths = [
        ...retainedPaths,
        ...uploaded.map((item) => item.path),
      ];

      const slugify = (value: string) => {
        const base = value
          .trim()
          .toLowerCase()
          .replace(/['"`]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");
        return base;
      };
      
      // Use custom slug if provided, otherwise auto-generate from title
      let stableSlug;
      if (blogCustomSlug.trim()) {
        // Use custom slug (already slugified by user input)
        stableSlug = slugify(blogCustomSlug.trim());
      } else if (existing?.slug) {
        // Keep existing slug when editing
        stableSlug = existing.slug;
      } else {
        // Auto-generate from title for new posts
        const slugBase = slugify(blogTitle.trim());
        stableSlug = slugBase ? `${slugBase}-${docRef.id.slice(0, 6)}` : `post-${docRef.id.slice(0, 8)}`;
      }

      const payload: BlogPost = {
        id: docRef.id,
        title: blogTitle.trim(),
        slug: stableSlug,
        contentHtml: blogContentHtml.trim(),
        contentText: plainText,
        imageUrls: finalImageUrls,
        imagePaths: finalImagePaths,
        coverImageUrl: finalImageUrls[0] || "",
        views: existing?.views || 0,
        publishedAt: publishedAtIso,
        updatedAt: nowIso,
        createdAt: existing?.createdAt || nowIso,
      };

      await setDoc(docRef, payload, { merge: true });

      setBlogPosts((prev) => {
        const next = blogEditingId
          ? prev.map((post) => (post.id === docRef.id ? payload : post))
          : [payload, ...prev];
        return [...next].sort((a, b) =>
          new Date(b.publishedAt || b.createdAt || 0).getTime() -
          new Date(a.publishedAt || a.createdAt || 0).getTime()
        );
      });

      // Optionally ping Google to re-check sitemap (non-blocking)
      if (!blogEditingId) {
        // Only ping for new posts, not edits
        fetch("/api/ping-sitemap", { method: "POST" })
          .catch(() => null); // Silent fail - this is optional
      }

      toast.success(blogEditingId ? "Blog post updated" : "Blog post created");
      const wasEdit = !!blogEditingId;
      resetBlogForm();
      setBlogLastPublished({ title: payload.title, slug: payload.slug, id: payload.id, wasEdit });
    } finally {
      setBlogSaving(false);
    }
  };

  const handleDeleteBlog = async (post: BlogPost) => {
    const db = getFirebaseDb();
    if (!db) return;
    const confirmed = window.confirm("Delete this blog post? This cannot be undone.");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "blogs", post.id));
      const storage = getFirebaseStorage();
      const paths = post.imagePaths || [];
      if (storage && paths.length) {
        await Promise.all(
          paths.map((path) => deleteObject(storageRef(storage, path)).catch(() => null))
        );
      }
      setBlogPosts((prev) => prev.filter((item) => item.id !== post.id));
      toast.success("Blog post deleted");
      if (blogEditingId === post.id) {
        resetBlogForm();
      }
    } catch {
      toast.error("Failed to delete blog post");
    }
  };

  // Show login form if not authenticated
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-sm text-gray-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 relative overflow-hidden">
        {/* Subtle background accents */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-60 pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-100 rounded-full blur-3xl opacity-60 pointer-events-none" />

        <div className="w-full max-w-sm relative z-10">
          {/* Logo + badge */}
          <div className="flex flex-col items-center mb-8">
            <img
              src="/Icon/correctnow logo final2.png"
              alt="CorrectNow"
              className="h-10 w-auto object-contain mb-4"
            />
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
              <Shield className="w-3 h-3" />
              Admin Panel
            </span>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <h1 className="text-xl font-bold text-gray-900 text-center mb-1">Welcome back</h1>
            <p className="text-center text-gray-500 text-sm mb-7">Sign in to access the admin dashboard</p>

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@correctnow.app"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="pl-10 h-10 border-gray-200 bg-gray-50 focus:bg-white text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <Link to="/forgot-password" className="text-xs text-blue-600 hover:text-blue-700 transition-colors">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pl-10 h-10 border-gray-200 bg-gray-50 focus:bg-white text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Error */}
              {loginError && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {loginError}
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm mt-1"
                disabled={loggingIn}
              >
                {loggingIn ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                    Signing in…
                  </span>
                ) : (
                  "Sign in to Admin"
                )}
              </Button>
            </form>

            <div className="mt-6 pt-5 border-t border-gray-100 text-center">
              <Link to="/" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
                ← Back to CorrectNow
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Compute tab display name for breadcrumb
  const tabLabels: Record<string, string> = {
    overview: "Dashboard",
    users: "Users",
    suggestions: "Suggestions",
    checks: "User Checks",
    seo: "SEO Pages",
    languages: "Languages",
    blog: "Blog",
    billing: "Billing & Plans",
    settings: "Settings",
    auditlog: "Audit Log",
  };

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-x-hidden w-full">
      {/* ── Fixed Left Sidebar ── */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64 z-40 bg-blue-50 border-r border-blue-100 shadow-sm">
        {/* Logo area */}
        <div className="flex flex-col items-center px-5 pt-6 pb-4 border-b border-blue-100">
          <Link to="/" className="flex items-center justify-center mb-2">
            <img
              src="/Icon/correctnow logo final2.png"
              alt="CorrectNow"
              className="h-9 sm:h-10 w-auto object-contain"
            />
          </Link>
          <span className="text-[10px] font-bold tracking-widest text-blue-900 uppercase">Admin Panel</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {[
            { id: "overview", icon: BarChart3, label: "Dashboard" },
            { id: "users", icon: Users, label: "Users" },
            { id: "suggestions", icon: MessageSquare, label: "Suggestions" },
            { id: "checks", icon: Activity, label: "User Checks" },
            { id: "seo", icon: Globe, label: "SEO Pages" },
            { id: "languages", icon: Globe, label: "Languages" },
            { id: "blog", icon: FileText, label: "Blog" },
            { id: "billing", icon: CreditCard, label: "Billing & Plans" },
            { id: "settings", icon: Settings, label: "Settings" },
            { id: "auditlog", icon: Shield, label: "Audit Log" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as typeof activeTab)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all border ${
                activeTab === item.id
                  ? "bg-white text-blue-900 border-blue-200 shadow-sm"
                  : "text-blue-900 border-transparent hover:bg-blue-100 hover:text-blue-900"
              }`}
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" style={{ width: "1.125rem", height: "1.125rem" }} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* User + Logout at bottom */}
        <div className="px-3 py-4 border-t border-blue-100 space-y-2">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-blue-100">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">A</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-blue-900 truncate">{user?.email?.split("@")[0] || "Admin"}</p>
              <p className="text-[10px] font-semibold text-blue-900 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-blue-900 hover:bg-blue-100 hover:text-blue-900 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Mobile Nav Drawer ── */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <aside className="relative flex flex-col w-72 max-w-[85vw] bg-blue-50 border-r border-blue-100 shadow-2xl h-full overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-blue-100">
              <Link to="/" onClick={() => setMobileNavOpen(false)}>
                <img src="/Icon/correctnow logo final2.png" alt="CorrectNow" className="h-9 w-auto object-contain" />
              </Link>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 rounded-lg text-blue-700 hover:bg-blue-100 transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Nav items */}
            <nav className="flex-1 px-3 py-4 space-y-1">
              {[
                { id: "overview", icon: BarChart3, label: "Dashboard" },
                { id: "users", icon: Users, label: "Users" },
                { id: "suggestions", icon: MessageSquare, label: "Suggestions" },
                { id: "checks", icon: Activity, label: "User Checks" },
                { id: "seo", icon: Globe, label: "SEO Pages" },
                { id: "languages", icon: Globe, label: "Languages" },
                { id: "blog", icon: FileText, label: "Blog" },
                { id: "billing", icon: CreditCard, label: "Billing & Plans" },
                { id: "settings", icon: Settings, label: "Settings" },
                { id: "auditlog", icon: Shield, label: "Audit Log" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id as typeof activeTab); setMobileNavOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition-all border ${
                    activeTab === item.id
                      ? "bg-white text-blue-900 border-blue-200 shadow-sm"
                      : "text-blue-900 border-transparent hover:bg-blue-100"
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </button>
              ))}
            </nav>
            {/* User + logout */}
            <div className="px-3 py-4 border-t border-blue-100 space-y-2">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-blue-100">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-white">A</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-blue-900 truncate">{user?.email?.split("@")[0] || "Admin"}</p>
                  <p className="text-[10px] text-blue-700 truncate">{user?.email}</p>
                </div>
              </div>
              <button
                onClick={() => { handleLogout(); setMobileNavOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-blue-900 hover:bg-blue-100 transition-all"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Area ── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen lg:ml-64 overflow-x-hidden">
        {/* ── Top Header Bar ── */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 sm:px-6 h-14 gap-3">
            {/* Hamburger — mobile only */}
            <button
              className="lg:hidden p-2 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
              <span className="hidden sm:block text-gray-400 shrink-0">Admin</span>
              <ChevronRight className="hidden sm:block w-4 h-4 text-gray-300 shrink-0" />
              <span className="font-semibold text-gray-900 truncate">{tabLabels[activeTab] || activeTab}</span>
            </div>

            {/* Right side: date + avatar */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden md:block text-xs text-gray-400">
                {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </span>
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-white">A</span>
              </div>
            </div>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="flex-1 px-4 sm:px-6 py-6 sm:py-8 overflow-x-hidden overflow-y-auto w-full">
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Page header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                    <p className="text-gray-500 text-sm mt-0.5">Platform overview — real-time metrics</p>
                  </div>
                  <div className="text-xs text-gray-400 bg-white border border-gray-200 px-3 py-1.5 rounded-full shadow-sm shrink-0">
                    {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>

                {/* Primary KPI row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {[
                    { label: "Total Users", value: totalUsers.toLocaleString(), sub: `+${newUsersToday} today`, icon: <Users className="w-5 h-5" />, accent: "bg-blue-500", light: "bg-blue-50", color: "text-blue-600", border: "border-l-blue-500" },
                    { label: "Pro Subscribers", value: proUsers.toLocaleString(), sub: `${conversionRate}% conversion`, icon: <Crown className="w-5 h-5" />, accent: "bg-amber-500", light: "bg-amber-50", color: "text-amber-600", border: "border-l-amber-500" },
                    { label: "Free Users", value: freeUsers.toLocaleString(), sub: "Potential upgrades", icon: <Zap className="w-5 h-5" />, accent: "bg-emerald-500", light: "bg-emerald-50", color: "text-emerald-600", border: "border-l-emerald-500" },
                    { label: "Suspended", value: suspendedUsers.toLocaleString(), sub: "Deactivated accounts", icon: <UserX className="w-5 h-5" />, accent: "bg-red-500", light: "bg-red-50", color: "text-red-600", border: "border-l-red-500" },
                  ].map(card => (
                    <div key={card.label} className={`bg-white rounded-xl border border-gray-200 border-l-4 ${card.border} p-5 shadow-sm`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-gray-500 font-medium">{card.label}</span>
                        <div className={`${card.light} ${card.color} p-2 rounded-lg`}>{card.icon}</div>
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900">{card.value}</p>
                      <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Secondary KPI row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {[
                    { label: "Checks Today", value: checksToday.toLocaleString(), sub: `${totalDocs.toLocaleString()} all time`, icon: <CheckCircle className="w-5 h-5" />, light: "bg-purple-50", color: "text-purple-600", border: "border-l-purple-500" },
                    { label: "Words Today", value: wordsToday >= 1000 ? `${(wordsToday/1000).toFixed(1)}K` : wordsToday.toString(), sub: `${(totalWords/1000).toFixed(0)}K total`, icon: <FileText className="w-5 h-5" />, light: "bg-indigo-50", color: "text-indigo-600", border: "border-l-indigo-500" },
                    { label: "Monthly Revenue", value: `₹${monthlyRevenue.toLocaleString("en-IN")}`, sub: "Based on Pro users × ₹500", icon: <TrendingUp className="w-5 h-5" />, light: "bg-teal-50", color: "text-teal-600", border: "border-l-teal-500" },
                    { label: "Conversion Rate", value: `${conversionRate}%`, sub: "Free → Pro", icon: <BarChart3 className="w-5 h-5" />, light: "bg-orange-50", color: "text-orange-600", border: "border-l-orange-500" },
                  ].map(card => (
                    <div key={card.label} className={`bg-white rounded-xl border border-gray-200 border-l-4 ${card.border} p-5 shadow-sm`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-gray-500 font-medium">{card.label}</span>
                        <div className={`${card.light} ${card.color} p-2 rounded-lg`}>{card.icon}</div>
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900">{card.value}</p>
                      <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                    </div>
                  ))}
                </div>

                {/* User breakdown + Activity + Quick Actions */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                  {/* User Plan Breakdown with Donut Chart */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900">User Plan Breakdown</h3>
                    <div className="flex items-center gap-6">
                      {/* SVG Donut Chart */}
                      {(() => {
                        const total = totalUsers || 1;
                        const radius = 54;
                        const circumference = 2 * Math.PI * radius;
                        const proAngle = (proUsers / total) * circumference;
                        const freeAngle = (freeUsers / total) * circumference;
                        const susAngle = (suspendedUsers / total) * circumference;
                        return (
                          <svg viewBox="0 0 120 120" className="w-32 h-32 shrink-0">
                            <circle cx="60" cy="60" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="12" />
                            <circle cx="60" cy="60" r={radius} fill="none" stroke="#f59e0b" strokeWidth="12"
                              strokeDasharray={`${proAngle} ${circumference - proAngle}`}
                              strokeDashoffset={circumference * 0.25} strokeLinecap="round" />
                            <circle cx="60" cy="60" r={radius} fill="none" stroke="#3b82f6" strokeWidth="12"
                              strokeDasharray={`${freeAngle} ${circumference - freeAngle}`}
                              strokeDashoffset={circumference * 0.25 - proAngle} strokeLinecap="round" />
                            <circle cx="60" cy="60" r={radius} fill="none" stroke="#ef4444" strokeWidth="12"
                              strokeDasharray={`${susAngle} ${circumference - susAngle}`}
                              strokeDashoffset={circumference * 0.25 - proAngle - freeAngle} strokeLinecap="round" />
                            <text x="60" y="56" textAnchor="middle" fill="#111827" fontSize="16" fontWeight="700">{total}</text>
                            <text x="60" y="70" textAnchor="middle" fill="#9ca3af" fontSize="9">users</text>
                          </svg>
                        );
                      })()}
                      <div className="space-y-2 flex-1">
                        {[
                          { label: "Pro", count: proUsers, dot: "bg-amber-500" },
                          { label: "Free", count: freeUsers, dot: "bg-blue-500" },
                          { label: "Suspended", count: suspendedUsers, dot: "bg-red-500" },
                        ].map(item => (
                          <div key={item.label} className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.dot}`} />
                            <span className="text-sm text-gray-500 flex-1">{item.label}</span>
                            <span className="text-sm font-semibold text-gray-900">{item.count}</span>
                            <span className="text-xs text-gray-400">{totalUsers ? Math.round((item.count / totalUsers) * 100) : 0}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Activity Summary */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900">Activity Summary</h3>
                    <div className="space-y-3">
                      {[
                        { label: "New Users Today", value: `+${newUsersToday}`, color: "text-emerald-600" },
                        { label: "Total Documents", value: totalDocs.toLocaleString(), color: "text-blue-600" },
                        { label: "Total Words Processed", value: `${(totalWords/1000).toFixed(1)}K`, color: "text-purple-600" },
                        { label: "Words Per Check", value: totalDocs ? Math.round(totalWords / totalDocs).toLocaleString() : "—", color: "text-orange-600" },
                        { label: "Avg Credits/User", value: users.length ? Math.round(users.reduce((s,u) => s + (u.credits||0), 0) / users.length).toLocaleString() : "—", color: "text-indigo-600" },
                      ].map(item => (
                        <div key={item.label} className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">{item.label}</span>
                          <span className={`text-sm font-semibold ${item.color}`}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3>
                    <div className="space-y-2">
                      {[
                        { label: "Manage Users", tab: "users" as const, icon: <Users className="w-4 h-4" /> },
                        { label: "SEO Pages", tab: "seo" as const, icon: <Globe className="w-4 h-4" /> },
                        { label: "Blog Posts", tab: "blog" as const, icon: <FileText className="w-4 h-4" /> },
                        { label: "Billing", tab: "billing" as const, icon: <CreditCard className="w-4 h-4" /> },
                        { label: "Settings", tab: "settings" as const, icon: <Settings className="w-4 h-4" /> },
                      ].map(a => (
                        <button
                          key={a.label}
                          onClick={() => setActiveTab(a.tab)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left border border-gray-200 group"
                        >
                          <span className="text-gray-400 group-hover:text-blue-500">{a.icon}</span>
                          {a.label}
                          <ChevronRight className="w-3.5 h-3.5 ml-auto text-gray-300 group-hover:text-blue-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Today at a Glance */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h2 className="text-sm font-semibold text-gray-900 mb-4">Today at a Glance</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: "New Signups", value: `+${newUsersToday}`, color: "text-emerald-600", bg: "bg-emerald-50" },
                      { label: "Checks Run", value: checksToday.toLocaleString(), color: "text-blue-600", bg: "bg-blue-50" },
                      { label: "Words Checked", value: wordsToday >= 1000 ? `${(wordsToday/1000).toFixed(1)}K` : wordsToday.toString(), color: "text-purple-600", bg: "bg-purple-50" },
                      { label: "Avg Words/Check", value: checksToday ? Math.round(wordsToday / checksToday).toLocaleString() : "—", color: "text-orange-600", bg: "bg-orange-50" },
                    ].map(s => (
                      <div key={s.label} className={`${s.bg} rounded-xl p-4 text-center`}>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-gray-500 mt-1 font-medium">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Smart Insights */}
                {(() => {
                  const pastDueCount = users.filter(u => String(u.subscriptionStatus || "").toLowerCase() === "past_due").length;
                  const newThisWeek = users.filter(u => u.createdAt && Date.now() - new Date(u.createdAt).getTime() < 7 * 86400000).length;
                  const dormant = users.filter(u => u.plan !== "Pro" && u.updatedAt && Date.now() - new Date(u.updatedAt).getTime() > 30 * 86400000).length;
                  const insights: { type: "warn" | "good" | "info"; text: string }[] = [];
                  if (pastDueCount > 0) insights.push({ type: "warn", text: `${pastDueCount} user${pastDueCount > 1 ? "s are" : " is"} past due — churn risk. Go to Billing to review.` });
                  if (newUsersToday > 0) insights.push({ type: "good", text: `${newUsersToday} new signup${newUsersToday > 1 ? "s" : ""} today — growth is happening.` });
                  if (newThisWeek > 0) insights.push({ type: "info", text: `${newThisWeek} user${newThisWeek > 1 ? "s" : ""} joined in the last 7 days.` });
                  if (conversionRate > 0) insights.push({ type: conversionRate >= 20 ? "good" : "info", text: `Conversion rate is ${conversionRate}% — ${conversionRate >= 20 ? "strong performance" : "room to grow with better onboarding or discounts"}.` });
                  if (dormant > 0) insights.push({ type: "warn", text: `${dormant} free user${dormant > 1 ? "s have" : " has"} been inactive for 30+ days — consider a re-engagement offer.` });
                  if (proUsers > 0) insights.push({ type: "good", text: `MRR ₹${monthlyRevenue.toLocaleString("en-IN")} — ARR estimate ₹${(monthlyRevenue * 12).toLocaleString("en-IN")}.` });
                  if (insights.length === 0) return null;
                  return (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                      <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        Smart Insights
                      </h2>
                      <div className="space-y-2">
                        {insights.map((ins, i) => (
                          <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-sm border ${
                            ins.type === "warn" ? "bg-red-50 text-red-700 border-red-200" :
                            ins.type === "good" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            "bg-blue-50 text-blue-700 border-blue-200"
                          }`}>
                            <span className="mt-0.5 shrink-0">{ins.type === "warn" ? <AlertTriangle className="w-4 h-4" /> : ins.type === "good" ? <CheckCircle className="w-4 h-4" /> : <Info className="w-4 h-4" />}</span>
                            <span>{ins.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {activeTab === "users" && (
              <div className="space-y-5">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Users</h1>
                    <p className="text-gray-500 text-sm mt-0.5">Manage all registered users — {users.length.toLocaleString()} total</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg h-9 px-4 text-sm shadow-sm"
                      onClick={() => setIsCreateUserOpen(true)}
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Create User
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-lg h-9 px-4 text-sm border-gray-200"
                      onClick={() => setIsBulkUploadOpen(true)}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Bulk Upload
                    </Button>
                    <Button variant="outline" className="rounded-lg h-9 px-4 text-sm border-gray-200" onClick={exportUsersCsv}>
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                </div>

                {/* Bulk Actions Toolbar */}
                {selectedUsers.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl border border-blue-200 bg-blue-50 shadow-sm">
                    <span className="text-sm font-bold text-blue-700 mr-1">
                      {selectedUsers.size} selected
                    </span>
                    <button
                      className="text-xs text-blue-500 underline hover:text-blue-700"
                      onClick={() => setSelectedUsers(new Set())}
                    >
                      Clear
                    </button>
                    <div className="w-px h-4 bg-blue-200 mx-1" />
                    <Button
                      size="sm" className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg"
                      onClick={() => { setBulkPlanAction("grant"); setBulkPlanDialogOpen(true); }}
                      disabled={isBulkActioning}
                    >
                      <Crown className="w-3.5 h-3.5 mr-1" />
                      Grant Pro
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-8 text-xs rounded-lg border-gray-300"
                      onClick={handleBulkRevokePro}
                      disabled={isBulkActioning}
                    >
                      Revoke Pro
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-8 text-xs rounded-lg border-gray-300"
                      onClick={() => { setBulkCreditsDialogOpen(true); const d = new Date(); d.setDate(d.getDate() + 30); setBulkCreditsExpiry(d.toISOString().slice(0, 16)); }}
                      disabled={isBulkActioning}
                    >
                      <Coins className="w-3.5 h-3.5 mr-1" />
                      Add Credits
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-8 text-xs rounded-lg border-gray-300"
                      onClick={() => setBulkCategoryDialogOpen(true)}
                      disabled={isBulkActioning}
                    >
                      Set Category
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-8 text-xs rounded-lg border-gray-300"
                      onClick={() => { setBulkSuspendAction("suspend"); setBulkSuspendDialogOpen(true); }}
                      disabled={isBulkActioning}
                    >
                      <UserX className="w-3.5 h-3.5 mr-1" />
                      Suspend
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-8 text-xs rounded-lg border-gray-300"
                      onClick={() => { setBulkSuspendAction("reactivate"); setBulkSuspendDialogOpen(true); }}
                      disabled={isBulkActioning}
                    >
                      Reactivate
                    </Button>
                    <Button
                      size="sm" className="h-8 text-xs ml-auto bg-red-500 hover:bg-red-600 text-white rounded-lg"
                      onClick={() => setIsDeleteDialogOpen(true)}
                      disabled={isDeletingUsers || isBulkActioning}
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Delete ({selectedUsers.size})
                    </Button>
                  </div>
                )}

                {/* Segment Pills */}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {([
                      { label: "All Users", count: users.length, onClick: () => { setPlanFilter("all"); setStatusFilter("all"); setDateFilter("all"); setSearchQuery(""); setCategoryFilter(""); }, active: planFilter === "all" && statusFilter === "all" && dateFilter === "all" && !categoryFilter },
                      { label: "Pro", count: proUsers, onClick: () => { setPlanFilter("pro"); setStatusFilter("all"); setDateFilter("all"); }, active: planFilter === "pro" },
                      { label: "Free", count: freeUsers, onClick: () => { setPlanFilter("free"); setStatusFilter("all"); setDateFilter("all"); }, active: planFilter === "free" && statusFilter === "all" },
                      { label: "New This Week", count: users.filter(u => u.createdAt && Date.now() - new Date(u.createdAt).getTime() < 7 * 86400000).length, onClick: () => { setPlanFilter("all"); setStatusFilter("all"); setDateFilter("7days"); }, active: dateFilter === "7days" },
                      { label: "Suspended", count: suspendedUsers, onClick: () => { setPlanFilter("all"); setStatusFilter("deactivated"); setDateFilter("all"); }, active: statusFilter === "deactivated" },
                    ] as { label: string; count: number; onClick: () => void; active: boolean }[]).map(seg => (
                      <button
                        key={seg.label}
                        onClick={seg.onClick}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                          seg.active
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                            : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                        }`}
                      >
                        {seg.label}
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          seg.active ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
                        }`}>{seg.count}</span>
                      </button>
                    ))}
                  </div>
                  {uniqueCategories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-xs text-gray-400 mr-1 font-medium">Category:</span>
                      {uniqueCategories.map(cat => {
                        const count = users.filter(u => (u.category || "Uncategorized").toLowerCase() === cat.toLowerCase()).length;
                        const active = categoryFilter.toLowerCase() === cat.toLowerCase();
                        return (
                          <button
                            key={cat}
                            onClick={() => setCategoryFilter(active ? "" : cat)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                              active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                            }`}
                          >
                            {cat}
                            <span className={`px-1 rounded-full text-[10px] font-bold ${active ? "bg-white/25 text-white" : "bg-gray-100 text-gray-400"}`}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Search & Filter Bar */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                  {/* Row 1: search + category */}
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Search name, email, phone..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-9 border-gray-200 bg-gray-50 focus:bg-white text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        list="admin-category-filter"
                        placeholder="Category..."
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="h-9 w-32 sm:w-36 text-sm border-gray-200 bg-gray-50"
                      />
                      <datalist id="admin-category-filter">
                        <option value="Uncategorized" />
                        {uniqueCategories.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                  </div>
                  {/* Row 2: filters + sort */}
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      value={planFilter}
                      onChange={(e) => setPlanFilter(e.target.value as "all" | "free" | "pro")}
                      className="h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 cursor-pointer flex-1 min-w-[110px]"
                    >
                      <option value="all">All Plans</option>
                      <option value="pro">Pro Only</option>
                      <option value="free">Free Only</option>
                    </select>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "deactivated")}
                      className="h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 cursor-pointer flex-1 min-w-[110px]"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="deactivated">Suspended</option>
                    </select>
                    <select
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value as "all" | "7days" | "30days" | "90days")}
                      className="h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 cursor-pointer flex-1 min-w-[110px]"
                    >
                      <option value="all">All Time</option>
                      <option value="7days">Last 7 Days</option>
                      <option value="30days">Last 30 Days</option>
                      <option value="90days">Last 90 Days</option>
                    </select>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "name" | "credits")}
                      className="h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 cursor-pointer flex-1 min-w-[110px]"
                    >
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                      <option value="name">Name A–Z</option>
                      <option value="credits">Most Credits</option>
                    </select>

                    {/* Reset */}
                    {(searchQuery || categoryFilter || planFilter !== "all" || statusFilter !== "all" || dateFilter !== "all" || sortBy !== "newest") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 text-gray-500 hover:text-gray-900"
                        onClick={() => {
                          setSearchQuery("");
                          setCategoryFilter("");
                          setPlanFilter("all");
                          setStatusFilter("all");
                          setDateFilter("all");
                          setSortBy("newest");
                        }}
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        Reset
                      </Button>
                    )}
                  </div>

                  {/* Filter Presets */}
                  <FilterPresetBar
                    presets={filterPresets}
                    currentFilters={{ planFilter, statusFilter, dateFilter, categoryFilter, sortBy, searchQuery }}
                    onApply={(p) => {
                      setPlanFilter(p.planFilter as any);
                      setStatusFilter(p.statusFilter as any);
                      setDateFilter(p.dateFilter as any);
                      setCategoryFilter(p.categoryFilter);
                      setSortBy(p.sortBy as any);
                      if (p.searchQuery !== undefined) setSearchQuery(p.searchQuery);
                    }}
                    onSave={(name) => savePreset({ name, planFilter, statusFilter, dateFilter, categoryFilter, sortBy, searchQuery })}
                    onRemove={removePreset}
                  />

                  {/* Stats summary */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 pt-2 border-t border-gray-100">
                    <span>
                      Showing <span className="font-semibold text-gray-700">{Math.min(pageSize, filteredUsers.length - (currentPage - 1) * pageSize)}</span> of <span className="font-semibold text-gray-700">{filteredUsers.length}</span> {filteredUsers.length !== users.length ? `(filtered from ${users.length})` : "users"}
                    </span>
                    <span className="flex items-center gap-1"><Crown className="w-3 h-3 text-amber-500" /> Pro: <span className="font-semibold text-gray-700">{filteredUsers.filter(u => u.plan === "Pro").length}</span></span>
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-blue-400" /> Free: <span className="font-semibold text-gray-700">{filteredUsers.filter(u => u.plan !== "Pro").length}</span></span>
                    <span className="flex items-center gap-1"><UserX className="w-3 h-3 text-red-400" /> Suspended: <span className="font-semibold text-gray-700">{filteredUsers.filter(u => u.status === "deactivated").length}</span></span>
                  </div>
                </div>

                {/* Users — Mobile Card List (< md) */}
                <div className="md:hidden space-y-3">
                  {paginatedUsers.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center text-gray-400 text-sm">No users found.</div>
                  ) : paginatedUsers.map((user) => {
                    const isExpanded = expandedCheckId === `user-${user.id}`;
                    return (
                      <div key={user.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        {/* Card main row */}
                        <div className="flex items-center gap-3 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedUsers.has(user.id)}
                            onChange={() => toggleSelectUser(user.id)}
                            className="w-4 h-4 shrink-0 accent-blue-600"
                          />
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-white">{user.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                            <p className="text-xs text-gray-400 truncate">{user.email}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge
                              className={user.plan === "Pro" ? "bg-amber-500 text-white border-0 text-xs" : "text-blue-600 border-blue-200 bg-blue-50 text-xs"}
                            >{user.plan}</Badge>
                            {user.status === "deactivated"
                              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Suspended</span>
                              : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Active</span>
                            }
                          </div>
                          <button
                            className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"
                            onClick={() => setExpandedCheckId(isExpanded ? null : `user-${user.id}`)}
                            aria-label={isExpanded ? "Collapse" : "Expand"}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>

                        {/* Expanded detail drawer */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50/60">
                            {/* Detail rows */}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                              {[
                                { label: "Phone", value: user.phone || "—" },
                                { label: "Category", value: user.category || "—" },
                                { label: "Credits", value: user.credits ? `${(user.creditsUsed || 0).toLocaleString()} / ${user.credits.toLocaleString()}` : "—" },
                                { label: "Addon Credits", value: user.addonCredits && user.addonCredits > 0 ? user.addonCredits.toLocaleString() : "—" },
                                { label: "Word Limit", value: user.wordLimit ? user.wordLimit.toLocaleString() : "—" },
                                { label: "Joined", value: user.createdAt ? new Date(user.createdAt).toLocaleDateString() : user.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : "—" },
                              ].map(({ label, value }) => (
                                <div key={label}>
                                  <p className="text-xs text-gray-400 font-medium">{label}</p>
                                  <p className="text-sm text-gray-800 font-medium truncate">{value}</p>
                                </div>
                              ))}
                            </div>
                            {/* Actions */}
                            <div className="flex flex-wrap gap-2 pt-1">
                              <Button size="sm" variant="outline" className="h-8 text-xs flex-1 min-w-[80px]" onClick={() => setViewingUser(user)}>
                                <Info className="w-3.5 h-3.5 mr-1" /> View
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 text-xs flex-1 min-w-[80px]" onClick={() => handleEditUser(user.id, user)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                className={`h-8 text-xs flex-1 min-w-[80px] ${user.plan === "Pro" ? "bg-red-100 text-red-700 border border-red-200" : "bg-amber-100 text-amber-700 border border-amber-200"}`}
                                onClick={() => handleTogglePlan(user)}
                                disabled={togglingPlanUserId === user.id}
                              >
                                {togglingPlanUserId === user.id ? "..." : user.plan === "Pro" ? "↓ Free" : "↑ Pro"}
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 text-xs flex-1 min-w-[80px]" onClick={() => handleAddAddonCredits(user.id, user)}>
                                <Coins className="w-3.5 h-3.5 mr-1" /> Credits
                              </Button>
                              {user.status === "deactivated" && (
                                <Button size="sm" variant="outline" className="h-8 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex-1 min-w-[80px]"
                                  onClick={() => handleReactivateUser(user.id)} disabled={reactivatingUserId === user.id}>
                                  {reactivatingUserId === user.id ? "..." : "Reactivate"}
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => { setUserToDelete(user.id); setIsDeleteDialogOpen(true); }} disabled={isDeletingUsers}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Mobile pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between gap-2 py-2">
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>‹ Prev</Button>
                      <span className="text-sm text-gray-500">Page {currentPage} / {totalPages}</span>
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next ›</Button>
                    </div>
                  )}
                </div>

                {/* Users Table — Desktop (≥ md) */}
                <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="py-3 px-5 text-sm font-medium text-gray-500 w-12">
                            <input
                              type="checkbox"
                              checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                              onChange={toggleSelectAll}
                              className="w-4 h-4 cursor-pointer accent-blue-600"
                            />
                          </th>
                          <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                          <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                          <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                          <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</th>
                          <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                          <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Credits</th>
                          <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Addon</th>
                          <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Addon Used</th>
                          <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Usage</th>
                          <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Limit</th>
                          <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                          <th className="text-right py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedUsers.map((user) => (
                          <tr
                            key={user.id}
                            className="border-b border-gray-100 last:border-0 hover:bg-blue-50/30 transition-colors"
                          >
                            <td className="py-4 px-5">
                              <input
                                type="checkbox"
                                checked={selectedUsers.has(user.id)}
                                onChange={() => toggleSelectUser(user.id)}
                                className="w-4 h-4 cursor-pointer accent-blue-600"
                              />
                            </td>
                            <td className="py-4 px-5">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                                  <span className="text-xs font-bold text-white">
                                    {user.name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 truncate">
                                    {user.name}
                                  </p>
                                  <p className="text-xs text-gray-400 truncate mb-1.5">
                                    {user.email}
                                  </p>
                                  <div className="flex items-center gap-1.5">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 px-2 text-xs border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 rounded"
                                      onClick={() => handleEditUser(user.id, user)}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 px-2 text-xs border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 rounded"
                                      onClick={() => handleAddAddonCredits(user.id, user)}
                                      title="Add Addon Credits"
                                    >
                                      <Coins className="w-3 h-3 mr-1" />
                                      Credits
                                    </Button>
                                    <Button
                                      size="sm"
                                      className={`h-6 px-2 text-xs rounded ${user.plan === "Pro" ? "bg-red-100 hover:bg-red-200 text-red-700 border border-red-200" : "bg-amber-100 hover:bg-amber-200 text-amber-700 border border-amber-200"}`}
                                      onClick={() => handleTogglePlan(user)}
                                      disabled={togglingPlanUserId === user.id}
                                      title={user.plan === "Pro" ? "Downgrade to Free" : "Upgrade to Pro"}
                                    >
                                      {togglingPlanUserId === user.id ? "..." : user.plan === "Pro" ? "↓ Free" : "↑ Pro"}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-5 text-sm text-gray-500">
                              {user.phone || "—"}
                            </td>
                            <td className="py-4 px-5 text-sm text-gray-500">
                              {user.category ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{user.category}</span>
                              ) : "—"}
                            </td>
                            <td className="py-4 px-5">
                              <div className="flex flex-col gap-1">
                                <Badge
                                  variant={
                                    user.plan === "Pro"
                                      ? "default"
                                      : user.plan === "Team"
                                      ? "secondary"
                                      : "outline"
                                  }
                                  className={user.plan === "Pro" ? "bg-amber-500 hover:bg-amber-500 text-white border-0" : user.plan !== "Pro" ? "text-blue-600 border-blue-200 bg-blue-50" : ""}
                                >
                                  {user.plan}
                                </Badge>
                                {user.plan === "Pro" && !user.razorpaySubscriptionId && !user.stripeSubscriptionId && (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-muted-foreground italic">Manual Grant</span>
                                    {user.adminPlanExpiresAt && (() => {
                                      const expiresAt = new Date(user.adminPlanExpiresAt);
                                      const now = new Date();
                                      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                      const expired = daysLeft <= 0;
                                      const critical = daysLeft > 0 && daysLeft <= 7;
                                      const warning = daysLeft > 7 && daysLeft <= 14;
                                      return (
                                        <span className={`text-[10px] font-medium ${expired ? "text-red-500" : critical ? "text-red-400" : warning ? "text-amber-500" : "text-muted-foreground"}`}>
                                          {expired
                                            ? `⚠ Expired ${Math.abs(daysLeft)}d ago`
                                            : critical
                                            ? `⚠ Expires in ${daysLeft}d`
                                            : warning
                                            ? `Expires in ${daysLeft}d`
                                            : `Until ${expiresAt.toLocaleDateString()}`}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                )}
                                {user.plan === "Pro" && (user.razorpaySubscriptionId || user.stripeSubscriptionId) && (() => {
                                  const periodEnd = user.subscriptionCurrentPeriodEnd;
                                  if (!periodEnd) return <span className="text-[10px] text-muted-foreground italic">Subscribed</span>;
                                  const expiresAt = new Date(periodEnd);
                                  const now = new Date();
                                  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                  const expired = daysLeft <= 0;
                                  const critical = daysLeft > 0 && daysLeft <= 5;
                                  return (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-[10px] text-muted-foreground italic">
                                        {user.razorpaySubscriptionId ? "Razorpay" : "Stripe"}
                                      </span>
                                      <span className={`text-[10px] font-medium ${expired ? "text-red-500" : critical ? "text-amber-500" : "text-muted-foreground"}`}>
                                        {expired
                                          ? `⚠ Renewal overdue`
                                          : critical
                                          ? `Renews in ${daysLeft}d`
                                          : `Renews ${expiresAt.toLocaleDateString()}`}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="py-4 px-5">
                              {user.status === "deactivated" ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Suspended</span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Active</span>
                              )}
                            </td>
                            <td className="py-4 px-5 text-sm text-gray-700 font-medium">
                              {user.credits ? user.credits.toLocaleString() : "—"}
                            </td>
                            <td className="py-4 px-5">
                              {user.addonCredits && user.addonCredits > 0 ? (
                                <div className="flex flex-col">
                                  <span className="text-sm text-gray-700 font-medium">
                                    {user.addonCredits.toLocaleString()}
                                  </span>
                                  {user.addonCreditsExpiryAt && (
                                    <span className="text-[10px] text-gray-400">
                                      Exp: {new Date(user.addonCreditsExpiryAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </td>
                            <td className="py-4 px-5 text-sm text-gray-700">
                              {(() => {
                                const baseLimit = user.credits || 0;
                                const totalUsed = user.creditsUsed || 0;
                                const totalAddon = (user.addonCredits || 0) + (user.adminCredits || 0);
                                const addonUsed = Math.max(0, totalUsed - baseLimit);
                                return addonUsed > 0 && totalAddon > 0
                                  ? `${addonUsed.toLocaleString()} / ${totalAddon.toLocaleString()}`
                                  : "—";
                              })()}
                            </td>
                            <td className="py-4 px-5 text-sm text-gray-700">
                              {user.credits
                                ? `${(user.creditsUsed || 0).toLocaleString()} / ${user.credits.toLocaleString()}`
                                : "—"}
                            </td>
                            <td className="py-4 px-5 text-sm text-gray-700">
                              {user.wordLimit ? user.wordLimit.toLocaleString() : "—"}
                            </td>
                            <td className="py-4 px-5 text-sm text-gray-400">
                              {user.createdAt
                                ? new Date(user.createdAt).toLocaleDateString()
                                : user.updatedAt
                                ? new Date(user.updatedAt).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className="py-4 px-5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2.5 text-xs border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 rounded"
                                  onClick={() => setViewingUser(user)}
                                >
                                  <Info className="w-3.5 h-3.5 mr-1" />
                                  View
                                </Button>
                                {user.status === "deactivated" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded"
                                    onClick={() => handleReactivateUser(user.id)}
                                    disabled={reactivatingUserId === user.id}
                                  >
                                    {reactivatingUserId === user.id ? "..." : "Reactivate"}
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                  onClick={() => {
                                    setUserToDelete(user.id);
                                    setIsDeleteDialogOpen(true);
                                  }}
                                  disabled={isDeletingUsers}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination controls */}
                  {totalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-gray-100">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>Page <span className="font-semibold text-gray-900">{currentPage}</span> of <span className="font-semibold text-gray-900">{totalPages}</span></span>
                        <select
                          value={pageSize}
                          onChange={e => setPageSize(Number(e.target.value) as 25 | 50 | 100)}
                          className="ml-2 h-7 px-2 rounded border border-gray-200 bg-white text-xs text-gray-700"
                        >
                          <option value={25}>25 / page</option>
                          <option value={50}>50 / page</option>
                          <option value={100}>100 / page</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" className="h-7 px-2 border-gray-200" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>«</Button>
                        <Button variant="outline" size="sm" className="h-7 px-2 border-gray-200" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>‹ Prev</Button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                          const page = start + i;
                          return page <= totalPages ? (
                            <Button key={page} variant={page === currentPage ? "default" : "outline"} size="sm" className={`h-7 w-7 p-0 text-xs ${page === currentPage ? "bg-blue-600 hover:bg-blue-700 border-blue-600" : "border-gray-200"}`} onClick={() => setCurrentPage(page)}>{page}</Button>
                          ) : null;
                        })}
                        <Button variant="outline" size="sm" className="h-7 px-2 border-gray-200" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next ›</Button>
                        <Button variant="outline" size="sm" className="h-7 px-2 border-gray-200" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>»</Button>
                      </div>
                    </div>
                  )}
                </div>{/* end desktop table */}

                {/* Bulk: Grant Pro Dialog */}
                {bulkPlanDialogOpen && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-2xl space-y-4">
                      <h3 className="text-lg font-semibold text-foreground">Grant Pro — {selectedUsers.size} user{selectedUsers.size > 1 ? "s" : ""}</h3>
                      <p className="text-sm text-muted-foreground">Choose how long the Pro plan should last.</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([30, 90, 365] as const).map(d => {
                          const exp = new Date(); exp.setDate(exp.getDate() + d);
                          return (
                            <button
                              key={d}
                              onClick={() => setBulkPlanDays(d)}
                              className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-colors ${bulkPlanDays === d ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                            >
                              <span className="font-bold text-base text-foreground">{d === 365 ? "1 Yr" : `${d}d`}</span>
                              <span className="text-[10px] text-primary mt-0.5">{exp.toLocaleDateString()}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setBulkPlanDialogOpen(false)} disabled={isBulkActioning}>Cancel</Button>
                        <Button onClick={handleBulkGrantPro} disabled={isBulkActioning}>
                          {isBulkActioning ? "Applying..." : `Grant Pro (${bulkPlanDays === 365 ? "1yr" : bulkPlanDays + "d"})`}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bulk: Add Credits Dialog */}
                {bulkCreditsDialogOpen && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-2xl space-y-4">
                      <h3 className="text-lg font-semibold text-foreground">Add Credits — {selectedUsers.size} user{selectedUsers.size > 1 ? "s" : ""}</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium mb-1">Credits Amount</label>
                          <Input type="number" value={bulkCreditsAmount} onChange={e => setBulkCreditsAmount(e.target.value)} placeholder="e.g. 10000" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Expiry Date & Time</label>
                          <Input type="datetime-local" value={bulkCreditsExpiry} onChange={e => setBulkCreditsExpiry(e.target.value)} />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setBulkCreditsDialogOpen(false)} disabled={isBulkActioning}>Cancel</Button>
                        <Button onClick={handleBulkAddCredits} disabled={isBulkActioning}>
                          {isBulkActioning ? "Applying..." : "Add Credits"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bulk: Suspend / Reactivate Dialog */}
                {bulkSuspendDialogOpen && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-2xl space-y-4">
                      <h3 className="text-lg font-semibold text-foreground">
                        {bulkSuspendAction === "suspend" ? "Suspend" : "Reactivate"} {selectedUsers.size} user{selectedUsers.size > 1 ? "s" : ""}?
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {bulkSuspendAction === "suspend"
                          ? "These users will lose access to the app immediately."
                          : "These users will regain full access to the app."}
                      </p>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setBulkSuspendDialogOpen(false)} disabled={isBulkActioning}>Cancel</Button>
                        <Button variant={bulkSuspendAction === "suspend" ? "destructive" : "default"} onClick={handleBulkSuspend} disabled={isBulkActioning}>
                          {isBulkActioning ? "Applying..." : bulkSuspendAction === "suspend" ? "Suspend All" : "Reactivate All"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bulk: Set Category Dialog */}
                {bulkCategoryDialogOpen && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-2xl space-y-4">
                      <h3 className="text-lg font-semibold text-foreground">Set Category — {selectedUsers.size} user{selectedUsers.size > 1 ? "s" : ""}</h3>
                      <div>
                        <label className="block text-sm font-medium mb-1">Category Name</label>
                        <Input
                          list="bulk-category-list"
                          value={bulkCategoryValue}
                          onChange={e => setBulkCategoryValue(e.target.value)}
                          placeholder="e.g. College Batch 2026"
                        />
                        <datalist id="bulk-category-list">
                          <option value="Uncategorized" />
                          {uniqueCategories.map(c => <option key={c} value={c} />)}
                        </datalist>
                        <p className="text-xs text-muted-foreground mt-1">This replaces the existing category for all selected users.</p>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setBulkCategoryDialogOpen(false)} disabled={isBulkActioning}>Cancel</Button>
                        <Button onClick={handleBulkSetCategory} disabled={isBulkActioning}>
                          {isBulkActioning ? "Saving..." : "Set Category"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Edit User Limits Dialog */}
                {editingUserId && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-2xl">
                      <h3 className="text-lg font-semibold text-foreground mb-4">
                        Manage User Limits
                      </h3>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Full Name</label>
                          <Input
                            type="text"
                            value={editUserName}
                            onChange={(e) => setEditUserName(e.target.value)}
                            placeholder="User name"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">Phone Number</label>
                          <Input
                            type="tel"
                            value={editUserPhone}
                            onChange={(e) => setEditUserPhone(e.target.value)}
                            placeholder="+91 98765 43210"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">Category</label>
                          <Input
                            list="admin-category-edit"
                            value={editUserCategory}
                            onChange={(e) => setEditUserCategory(e.target.value)}
                            placeholder="College, Friends, or custom"
                          />
                          <datalist id="admin-category-edit">
                            <option value="Uncategorized" />
                            {uniqueCategories.map(c => <option key={c} value={c} />)}
                          </datalist>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">Limit Type</label>
                          <select
                            value={limitType}
                            onChange={(e) => setLimitType(e.target.value as any)}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                          >
                            <option value="limited">Limited</option>
                            <option value="unlimited">Unlimited</option>
                            <option value="disabled">Disabled</option>
                          </select>
                        </div>

                        {limitType === "limited" && (
                          <>
                            <div>
                              <label className="block text-sm font-medium mb-2">Word Limit</label>
                              <Input
                                type="number"
                                value={wordLimitValue}
                                onChange={(e) => setWordLimitValue(e.target.value)}
                                placeholder="2000"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium mb-2">Credits</label>
                              <Input
                                type="number"
                                value={creditsValue}
                                onChange={(e) => setCreditsValue(e.target.value)}
                                placeholder="25000"
                              />
                            </div>
                          </>
                        )}

                        {limitType === "unlimited" && (
                          <p className="text-sm text-muted-foreground">
                            User will have unlimited word limit and credits
                          </p>
                        )}

                        {limitType === "disabled" && (
                          <p className="text-sm text-destructive">
                            User will be unable to use the service
                          </p>
                        )}
                      </div>

                      <div className="flex gap-3 mt-6">
                        <Button onClick={handleSaveUserLimits} className="flex-1">
                          Save Changes
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditingUserId(null)}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Add Addon Credits Dialog */}
                {addingCreditsUserId && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-2xl">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent">
                          <Coins className="w-5 h-5 text-accent-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">
                          Add Addon Credits
                        </h3>
                      </div>

                      <p className="text-sm text-muted-foreground mb-6">
                        Add additional credits with a custom expiry date. These credits will be added on top of existing valid credits.
                      </p>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Credits Amount
                          </label>
                          <Input
                            type="number"
                            value={addonCreditsAmount}
                            onChange={(e) => setAddonCreditsAmount(e.target.value)}
                            placeholder="10000"
                            min="1"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Enter the number of credits to add
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Expiry Date & Time
                          </label>
                          <Input
                            type="datetime-local"
                            value={addonCreditsExpiry}
                            onChange={(e) => setAddonCreditsExpiry(e.target.value)}
                            min={new Date().toISOString().slice(0, 16)}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Credits will expire at the selected date and time
                          </p>
                        </div>

                        <div className="bg-accent/10 rounded-lg p-3 border border-accent/20">
                          <p className="text-xs text-foreground font-medium mb-1">
                            📌 How it works:
                          </p>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            <li>• If user has valid addon credits, new amount will be added</li>
                            <li>• If existing credits expired, they will be replaced</li>
                            <li>• User can see expiry date in their dashboard</li>
                            <li>• Credits automatically expire at the set date</li>
                          </ul>
                        </div>
                      </div>

                      <div className="flex gap-3 mt-6">
                        <Button 
                          onClick={handleSaveAddonCredits} 
                          className="flex-1"
                          disabled={savingAddonCredits}
                        >
                          {savingAddonCredits ? "Adding..." : "Add Credits"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setAddingCreditsUserId(null);
                            setAddonCreditsAmount("");
                            setAddonCreditsExpiry("");
                          }}
                          className="flex-1"
                          disabled={savingAddonCredits}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Create User Dialog */}
                <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Create New User</DialogTitle>
                      <DialogDescription>
                        Create a new user account with email and password. The user can log in immediately with these credentials.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Full Name
                        </label>
                        <Input
                          type="text"
                          value={newUserName}
                          onChange={(e) => setNewUserName(e.target.value)}
                          placeholder="John Doe"
                          disabled={creatingUser}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Email Address
                        </label>
                        <Input
                          type="email"
                          value={newUserEmail}
                          onChange={(e) => setNewUserEmail(e.target.value)}
                          placeholder="user@example.com"
                          disabled={creatingUser}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Phone Number (optional)
                        </label>
                        <Input
                          type="tel"
                          value={newUserPhone}
                          onChange={(e) => setNewUserPhone(e.target.value)}
                          placeholder="+91 98765 43210"
                          disabled={creatingUser}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Category
                        </label>
                        <Input
                          list="admin-category-create"
                          value={newUserCategory}
                          onChange={(e) => setNewUserCategory(e.target.value)}
                          disabled={creatingUser}
                          placeholder="College, Friends, or custom"
                        />
                        <datalist id="admin-category-create">
                          <option value="College" />
                          <option value="Friends" />
                          <option value="Uncategorized" />
                        </datalist>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Password
                        </label>
                        <Input
                          type="text"
                          value={newUserPassword}
                          onChange={(e) => setNewUserPassword(e.target.value)}
                          placeholder="Minimum 6 characters"
                          disabled={creatingUser}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Share this password securely with the user
                        </p>
                      </div>

                      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                        <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">
                          ℹ️ Note:
                        </p>
                        <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                          <li>• Email verification will be auto-enabled</li>
                          <li>• User starts with Free plan (200 word limit)</li>
                          <li>• You can upgrade their plan or add credits later</li>
                        </ul>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsCreateUserOpen(false);
                          setNewUserName("");
                          setNewUserEmail("");
                          setNewUserPhone("");
                          setNewUserCategory("");
                          setNewUserPassword("");
                        }}
                        disabled={creatingUser}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreateUser}
                        disabled={creatingUser}
                      >
                        {creatingUser ? "Creating..." : "Create User"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Bulk Upload Dialog */}
                <Dialog open={isBulkUploadOpen} onOpenChange={(open) => {
                  if (!open) {
                    setIsBulkUploadOpen(false);
                    setBulkUploadFile(null);
                    setBulkUploadProgress(0);
                    setBulkUploadResults(null);
                    setBulkUploadPreview([]);
                    setBulkUploadStep("select");
                  }
                }}>
                  <DialogContent className={bulkUploadStep === "preview" ? "max-w-5xl w-full" : "sm:max-w-lg"}>
                    <DialogHeader>
                      <DialogTitle>
                        {bulkUploadStep === "select" && "Bulk Upload Users"}
                        {bulkUploadStep === "preview" && `Preview — ${bulkUploadPreview.length} row${bulkUploadPreview.length !== 1 ? "s" : ""} parsed`}
                        {bulkUploadStep === "uploading" && "Creating Users..."}
                        {bulkUploadStep === "done" && "Upload Complete"}
                      </DialogTitle>
                      <DialogDescription>
                        {bulkUploadStep === "select" && "Upload a CSV file. Phone, category are optional. Review before confirming."}
                        {bulkUploadStep === "preview" && `${bulkUploadPreview.filter(r => !r.parseError).length} valid · ${bulkUploadPreview.filter(r => !!r.parseError).length} with errors · Invalid rows will be skipped`}
                        {bulkUploadStep === "uploading" && `Processing ${bulkUploadPreview.filter(r => !r.parseError).length} users…`}
                        {bulkUploadStep === "done" && "All done. See results below."}
                      </DialogDescription>
                    </DialogHeader>

                    {/* STEP: SELECT FILE */}
                    {bulkUploadStep === "select" && (
                      <div className="space-y-4 py-2">
                        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                          <div className="flex items-start justify-between mb-2">
                            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">CSV Format</p>
                            <Button variant="outline" size="sm" onClick={downloadSampleCSV} className="h-7 text-xs">
                              <Download className="w-3 h-3 mr-1" />
                              Sample CSV
                            </Button>
                          </div>
                          <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                            <li>• Columns: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">name, email, password</code> (minimum required)</li>
                            <li>• Optional columns: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">phone</code> and <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">category</code> — any format accepted</li>
                            <li>• Header row is auto-detected and skipped</li>
                            <li>• Named headers supported: columns can be in any order if a header row is present</li>
                            <li>• Example (5 cols): <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">Arjun,arjun@college.edu,9876543210,Batch A,pass123</code></li>
                            <li>• Example (3 cols): <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">Arjun,arjun@college.edu,pass123</code></li>
                          </ul>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Select CSV File</label>
                          <Input
                            type="file"
                            accept=".csv,text/csv"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (!file.name.toLowerCase().endsWith('.csv')) {
                                  toast.error("Please select a .csv file");
                                  e.target.value = '';
                                  return;
                                }
                                setBulkUploadFile(file);
                                setBulkUploadPreview([]);
                              }
                            }}
                          />
                          {bulkUploadFile && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {bulkUploadFile.name} — {(bulkUploadFile.size / 1024).toFixed(1)} KB
                            </p>
                          )}
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsBulkUploadOpen(false)}>Cancel</Button>
                          <Button onClick={handleParseCsvForPreview} disabled={!bulkUploadFile}>
                            Parse & Preview →
                          </Button>
                        </DialogFooter>
                      </div>
                    )}

                    {/* STEP: PREVIEW */}
                    {bulkUploadStep === "preview" && (
                      <div className="space-y-3 py-2">
                        {/* Summary pills */}
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
                            ✓ {bulkUploadPreview.filter(r => !r.parseError).length} valid
                          </span>
                          {bulkUploadPreview.filter(r => !!r.parseError).length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                              ✗ {bulkUploadPreview.filter(r => !!r.parseError).length} errors (will be skipped)
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto self-center">Click ✗ to remove a row</span>
                        </div>

                        {/* Preview table */}
                        <div className="rounded-lg border border-border overflow-hidden max-h-[50vh] overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b border-border">
                              <tr>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground w-8">#</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Name</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Email</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Phone</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Category</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Password</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Status</th>
                                <th className="py-2 px-3 w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkUploadPreview.map((row, idx) => (
                                <tr key={idx} className={`border-b border-border last:border-0 ${row.parseError ? "bg-red-50 dark:bg-red-950/20" : "hover:bg-muted/30"}`}>
                                  <td className="py-2 px-3 text-muted-foreground">{row.row}</td>
                                  <td className="py-2 px-3 font-medium text-foreground">{row.name || <span className="text-muted-foreground italic">—</span>}</td>
                                  <td className="py-2 px-3 text-muted-foreground">{row.email || <span className="italic">—</span>}</td>
                                  <td className="py-2 px-3 text-muted-foreground">{row.phone || <span className="italic text-xs">—</span>}</td>
                                  <td className="py-2 px-3 text-muted-foreground">{row.category || <span className="italic text-xs">—</span>}</td>
                                  <td className="py-2 px-3 text-muted-foreground font-mono">{"•".repeat(Math.min(row.password.length, 8))}</td>
                                  <td className="py-2 px-3">
                                    {row.parseError
                                      ? <span className="text-red-500 font-medium" title={row.parseError}>✗ {row.parseError}</span>
                                      : <span className="text-green-600 font-medium">✓ OK</span>}
                                  </td>
                                  <td className="py-2 px-3">
                                    <button
                                      className="text-muted-foreground hover:text-destructive"
                                      title="Remove this row"
                                      onClick={() => setBulkUploadPreview(prev => prev.filter((_, i) => i !== idx))}
                                    >
                                      ×
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <DialogFooter className="gap-2 flex-wrap">
                          <Button variant="outline" onClick={() => setBulkUploadStep("select")}>← Back</Button>
                          <Button
                            onClick={handleConfirmBulkUpload}
                            disabled={bulkUploadPreview.filter(r => !r.parseError).length === 0}
                          >
                            Confirm &amp; Upload {bulkUploadPreview.filter(r => !r.parseError).length} user{bulkUploadPreview.filter(r => !r.parseError).length !== 1 ? "s" : ""} →
                          </Button>
                        </DialogFooter>
                      </div>
                    )}

                    {/* STEP: UPLOADING */}
                    {bulkUploadStep === "uploading" && (
                      <div className="py-6 space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Creating accounts…</span>
                            <span className="font-semibold">{bulkUploadProgress}%</span>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-3">
                            <div className="bg-primary h-3 rounded-full transition-all" style={{ width: `${bulkUploadProgress}%` }} />
                          </div>
                        </div>
                        <p className="text-xs text-center text-muted-foreground">Please wait, do not close this dialog…</p>
                      </div>
                    )}

                    {/* STEP: DONE */}
                    {bulkUploadStep === "done" && bulkUploadResults && (
                      <div className="py-2 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 border border-green-200 dark:border-green-800 text-center">
                            <p className="text-xs text-green-600 dark:text-green-400 mb-1">Created</p>
                            <p className="text-3xl font-bold text-green-700 dark:text-green-300">{bulkUploadResults.success}</p>
                          </div>
                          <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-4 border border-red-200 dark:border-red-800 text-center">
                            <p className="text-xs text-red-600 dark:text-red-400 mb-1">Failed</p>
                            <p className="text-3xl font-bold text-red-700 dark:text-red-300">{bulkUploadResults.failed}</p>
                          </div>
                        </div>
                        {bulkUploadResults.errors.length > 0 && (
                          <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 border border-red-200 dark:border-red-800 max-h-44 overflow-y-auto">
                            <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2">Errors:</p>
                            <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                              {bulkUploadResults.errors.map((e, i) => <li key={i}>• {e}</li>)}
                            </ul>
                          </div>
                        )}
                        <DialogFooter>
                          <Button onClick={() => {
                            setIsBulkUploadOpen(false);
                            setBulkUploadFile(null);
                            setBulkUploadProgress(0);
                            setBulkUploadResults(null);
                            setBulkUploadPreview([]);
                            setBulkUploadStep("select");
                          }}>Close</Button>
                        </DialogFooter>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>

                {/* User Profile Modal */}
                <Dialog open={!!viewingUser} onOpenChange={(open) => { if (!open) setViewingUser(null); }}>
                  <DialogContent className="max-w-2xl">
                    {viewingUser && (
                      <>
                        <DialogHeader>
                          <DialogTitle>
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-lg font-bold text-accent">
                                {(viewingUser.name || viewingUser.email || "?")[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="text-lg font-semibold text-foreground">{viewingUser.name || "—"}</p>
                                <p className="text-sm text-muted-foreground font-normal">{viewingUser.email}</p>
                              </div>
                              <div className="ml-auto flex gap-2">
                                <Badge variant={viewingUser.plan === "Pro" ? "default" : "outline"} className={viewingUser.plan === "Pro" ? "bg-yellow-500 text-white" : ""}>
                                  {viewingUser.plan === "Pro" ? <Crown className="w-3 h-3 mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                                  {viewingUser.plan || "Free"}
                                </Badge>
                                <Badge variant={viewingUser.status === "deactivated" ? "destructive" : "outline"}>
                                  {viewingUser.status === "deactivated" ? "Suspended" : "Active"}
                                </Badge>
                              </div>
                            </div>
                          </DialogTitle>
                        </DialogHeader>

                        <div className="grid sm:grid-cols-2 gap-4 mt-2">
                          {/* Account Info */}
                          <div className="bg-muted/40 rounded-lg p-4 space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Account Info</p>
                            {[
                              { label: "User ID", value: viewingUser.id },
                              { label: "Phone", value: viewingUser.phone || "—" },
                              { label: "Category", value: viewingUser.category || "—" },
                              { label: "Joined", value: viewingUser.createdAt ? new Date(viewingUser.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—" },
                              { label: "Last Updated", value: viewingUser.updatedAt ? new Date(viewingUser.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—" },
                            ].map(row => (
                              <div key={row.label} className="flex justify-between gap-2">
                                <span className="text-xs text-muted-foreground shrink-0">{row.label}</span>
                                <span className="text-xs text-foreground font-medium text-right truncate max-w-[180px]">{row.value}</span>
                              </div>
                            ))}
                          </div>

                          {/* Credits & Usage */}
                          <div className="bg-muted/40 rounded-lg p-4 space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Credits & Usage</p>
                            {[
                              { label: "Credits", value: (viewingUser.credits || 0).toLocaleString() },
                              { label: "Credits Used", value: (viewingUser.creditsUsed || 0).toLocaleString() },
                              { label: "Addon Credits", value: (viewingUser.addonCredits || 0).toLocaleString() },
                              { label: "Admin Credits", value: (viewingUser.adminCredits || 0).toLocaleString() },
                              { label: "Word Limit", value: viewingUser.wordLimit ? viewingUser.wordLimit.toLocaleString() : "—" },
                            ].map(row => (
                              <div key={row.label} className="flex justify-between gap-2">
                                <span className="text-xs text-muted-foreground shrink-0">{row.label}</span>
                                <span className="text-xs text-foreground font-medium">{row.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </DialogContent>
                </Dialog>

              </div>
            )}

            {activeTab === "suggestions" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Suggestions</h1>
                    <p className="text-gray-500 text-sm mt-0.5">User ideas and product feedback — {filteredSuggestionsEnhanced.length} of {suggestions.length} shown</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => exportSuggestionsCsv(suggestions, getSuggMeta)}
                  >
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </Button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search suggestions..."
                      value={suggestionSearch}
                      onChange={(e) => setSuggestionSearch(e.target.value)}
                      className="pl-10 border-gray-200 bg-white h-9 text-sm"
                    />
                  </div>
                  <select
                    value={suggestionStatusFilter}
                    onChange={(e) => setSuggestionStatusFilter(e.target.value as any)}
                    className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm flex-1 min-w-[120px]"
                  >
                    <option value="all">All Status</option>
                    <option value="new">New</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="resolved">Resolved</option>
                  </select>
                  <select
                    value={suggestionPriorityFilter}
                    onChange={(e) => setSuggestionPriorityFilter(e.target.value as any)}
                    className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm flex-1 min-w-[120px]"
                  >
                    <option value="all">All Priority</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Message</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Owner</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">SLA</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSuggestionsEnhanced.length ? (
                          filteredSuggestionsEnhanced.map((item) => {
                            const meta = getSuggMeta(item.id);
                            return (
                              <tr
                                key={item.id}
                                className="border-b border-gray-100 last:border-0 hover:bg-blue-50/30 transition-colors"
                              >
                                <td className="py-3 px-4 text-sm text-gray-800 max-w-xs">
                                  <p className="line-clamp-2">{item.message}</p>
                                  {meta.internalNote && (
                                    <p className="text-xs text-amber-600 italic mt-0.5">Note: {meta.internalNote}</p>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-sm text-gray-500 whitespace-nowrap">
                                  {item.email ? (
                                    <a
                                      href={`mailto:${item.email}?subject=Re: Your feedback&body=Hi, thank you for your suggestion: "${item.message.slice(0, 80)}..."`}
                                      className="hover:text-blue-600 underline-offset-2 hover:underline"
                                      title="Reply by email"
                                    >
                                      {item.email}
                                    </a>
                                  ) : "Anonymous"}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-1.5">
                                    <PriorityBadge priority={meta.priority} />
                                    <select
                                      value={meta.priority}
                                      onChange={(e) => {
                                        updateSuggMeta(item.id, { priority: e.target.value as any });
                                        logAudit("suggestion_priority", item.id, item.email || "anon", `Priority set to ${e.target.value}`);
                                      }}
                                      className="text-xs border-0 bg-transparent cursor-pointer focus:outline-none"
                                    >
                                      <option value="low">low</option>
                                      <option value="medium">medium</option>
                                      <option value="high">high</option>
                                      <option value="critical">critical</option>
                                    </select>
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <Input
                                    value={suggestionOwnerInput[item.id] ?? meta.owner}
                                    onChange={(e) => setSuggestionOwnerInput(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    onBlur={(e) => {
                                      const v = e.target.value.trim();
                                      updateSuggMeta(item.id, { owner: v });
                                      logAudit("suggestion_assign", item.id, item.email || "anon", `Assigned to ${v || "nobody"}`);
                                    }}
                                    placeholder="—"
                                    className="h-7 text-xs w-24 border-gray-200"
                                  />
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex flex-wrap gap-1 items-center">
                                    {meta.tags.map((tag) => (
                                      <span
                                        key={tag}
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs cursor-pointer hover:bg-red-100 hover:text-red-700"
                                        title="Click to remove"
                                        onClick={() => updateSuggMeta(item.id, { tags: meta.tags.filter((t) => t !== tag) })}
                                      >
                                        {tag} ×
                                      </span>
                                    ))}
                                    <input
                                      value={suggestionTagInput[item.id] || ""}
                                      onChange={(e) => setSuggestionTagInput(prev => ({ ...prev, [item.id]: e.target.value }))}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === ",") {
                                          e.preventDefault();
                                          const tag = (suggestionTagInput[item.id] || "").trim().replace(/,/g, "");
                                          if (tag && !meta.tags.includes(tag)) {
                                            updateSuggMeta(item.id, { tags: [...meta.tags, tag] });
                                            logAudit("suggestion_tag", item.id, item.email || "anon", `Tag added: ${tag}`);
                                          }
                                          setSuggestionTagInput(prev => ({ ...prev, [item.id]: "" }));
                                        }
                                      }}
                                      placeholder="+ tag"
                                      className="h-5 text-xs border-b border-dashed border-gray-300 bg-transparent w-12 focus:outline-none focus:border-blue-400"
                                    />
                                  </div>
                                </td>
                                <td className="py-3 px-4 whitespace-nowrap">
                                  <SlaTimer deadline={meta.slaDeadline} />
                                  {!meta.slaDeadline && (
                                    <input
                                      type="date"
                                      className="text-xs border-0 bg-transparent text-muted-foreground focus:outline-none"
                                      title="Set SLA deadline"
                                      onChange={(e) => updateSuggMeta(item.id, { slaDeadline: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                                    />
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    item.status === "resolved" ? "bg-emerald-100 text-emerald-700" :
                                    item.status === "reviewed" ? "bg-blue-100 text-blue-700" :
                                    "bg-gray-100 text-gray-600"
                                  }`}>
                                    {item.status}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">
                                  {new Date(item.createdAt).toLocaleDateString()}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-gray-600 hover:text-blue-700 hover:bg-blue-50"
                                      onClick={() => { updateSuggestionStatus(item.id, "reviewed"); setSuggestions(prev => prev.map(s => s.id === item.id ? { ...s, status: "reviewed" as const } : s)); }}
                                    >
                                      Review
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-gray-600 hover:text-emerald-700 hover:bg-emerald-50"
                                      onClick={() => { updateSuggestionStatus(item.id, "resolved"); setSuggestions(prev => prev.map(s => s.id === item.id ? { ...s, status: "resolved" as const } : s)); }}
                                    >
                                      Resolve
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td className="py-12 text-center text-sm text-gray-400" colSpan={9}>
                              <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                              No suggestions match your filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "checks" && (
              <div className="space-y-5">

                {/* ── Header ── */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">User Grammar Checks</h1>
                    <p className="text-gray-500 text-sm mt-0.5">Track all grammar check requests from users</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedUserId && (
                      <Button variant="outline" size="sm" className="border-gray-200 text-gray-700 hover:bg-gray-50" onClick={() => setSelectedUserId(null)}>
                        ← All Users
                      </Button>
                    )}
                    <select
                      value={checksFilter}
                      onChange={(e) => setChecksFilter(e.target.value as typeof checksFilter)}
                      className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700"
                    >
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="week">This Week</option>
                    </select>
                    <Button variant="outline" size="sm" className="border-gray-200 gap-1.5" onClick={() => exportChecksCsv(filteredChecks)}>
                      <Download className="w-3.5 h-3.5" /> Export CSV
                    </Button>
                  </div>
                </div>

                {/* ── KPI Cards ── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Matching Checks", value: filteredChecks.length.toLocaleString(), icon: <Activity className="w-4 h-4" />, light: "bg-blue-50", color: "text-blue-600", border: "border-l-blue-500" },
                    { label: "Unique Users",     value: new Set(filteredChecks.map(c => c.userId)).size.toLocaleString(), icon: <Users className="w-4 h-4" />, light: "bg-emerald-50", color: "text-emerald-600", border: "border-l-emerald-500" },
                    { label: "Total Words",      value: filteredChecks.reduce((s, c) => s + c.wordCount, 0).toLocaleString(), icon: <FileText className="w-4 h-4" />, light: "bg-purple-50", color: "text-purple-600", border: "border-l-purple-500" },
                    { label: "Credits Used",     value: filteredChecks.reduce((s, c) => s + (c.creditsUsed ?? c.wordCount), 0).toLocaleString(), icon: <Coins className="w-4 h-4" />, light: "bg-amber-50", color: "text-amber-600", border: "border-l-amber-500" },
                  ].map(card => (
                    <div key={card.label} className={`bg-white rounded-xl border border-gray-200 border-l-4 ${card.border} shadow-sm p-4`}>
                      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg mb-2 ${card.light} ${card.color}`}>
                        {card.icon}
                      </div>
                      <p className="text-xs font-medium text-gray-500 leading-tight">{card.label}</p>
                      <p className="text-xl font-bold text-gray-900 mt-0.5 tabular-nums">{card.value}</p>
                    </div>
                  ))}
                </div>

                {/* ── Search & Filters ── */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <div className="relative flex-1 min-w-[160px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <Input placeholder="Search text or language…" value={checksSearch} onChange={(e) => setChecksSearch(e.target.value)} className="pl-9 h-9 text-sm" />
                    </div>
                    <div className="relative flex-1 min-w-[160px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <Input placeholder="Filter by user email…" value={checksUserSearch} onChange={(e) => setChecksUserSearch(e.target.value)} className="pl-9 h-9 text-sm" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Input type="date" value={checksDateFrom} onChange={(e) => setChecksDateFrom(e.target.value)} className="h-9 text-sm flex-1 min-w-[130px]" title="From date" />
                    <span className="text-xs text-gray-400 shrink-0">to</span>
                    <Input type="date" value={checksDateTo} onChange={(e) => setChecksDateTo(e.target.value)} className="h-9 text-sm flex-1 min-w-[130px]" title="To date" />
                    {(checksSearch || checksUserSearch || checksDateFrom || checksDateTo) && (
                      <>
                        <Button variant="ghost" size="sm" className="h-9 text-xs shrink-0" onClick={() => { setChecksSearch(""); setChecksUserSearch(""); setChecksDateFrom(""); setChecksDateTo(""); }}>
                          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reset
                        </Button>
                        <span className="text-xs text-gray-400 shrink-0">{filteredChecks.length} of {userChecks.length} shown</span>
                      </>
                    )}
                  </div>
                </div>

                {/* ── Content ── */}
                {checksLoading ? (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-16 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">Loading checks…</p>
                  </div>
                ) : !selectedUserId ? (
                  /* ── User List ── */
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-semibold text-gray-900">Users with Checks</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Click a row to view full check history</p>
                      </div>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full font-medium">
                        {Object.keys(filteredChecks.reduce((g, c) => ({ ...g, [c.userId]: true }), {} as Record<string,boolean>)).length} users
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {(() => {
                        const userGroups = filteredChecks.reduce((groups, check) => {
                          if (!groups[check.userId]) groups[check.userId] = { userId: check.userId, userEmail: check.userEmail || "Anonymous", checks: [] };
                          groups[check.userId].checks.push(check);
                          return groups;
                        }, {} as Record<string, { userId: string; userEmail: string; checks: typeof userChecks }>);
                        const sortedUsers = Object.values(userGroups).sort((a, b) => b.checks.length - a.checks.length);
                        return sortedUsers.length > 0 ? sortedUsers.map((ug) => (
                          <div key={ug.userId} onClick={() => setSelectedUserId(ug.userId)}
                            className="px-5 py-4 hover:bg-blue-50/40 cursor-pointer transition-colors group"
                          >
                            {/* Top row: avatar + email + chevron */}
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-white">{(ug.userEmail[0] || "?").toUpperCase()}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{ug.userEmail}</p>
                                <p className="text-xs text-gray-400 font-mono truncate">ID: {ug.userId.slice(0, 16)}…</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" />
                            </div>
                            {/* Stats row below — always horizontal, compact */}
                            <div className="mt-2.5 ml-11 flex flex-wrap gap-3">
                              {[
                                { label: "checks", value: ug.checks.length, color: "text-blue-600" },
                                { label: "words",  value: ug.checks.reduce((s, c) => s + c.wordCount, 0).toLocaleString(), color: "text-purple-600" },
                                { label: "suggestions", value: ug.checks.reduce((s, c) => s + c.suggestionsCount, 0), color: "text-emerald-600" },
                                { label: "credits", value: ug.checks.reduce((s, c) => s + (c.creditsUsed ?? c.wordCount), 0).toLocaleString(), color: "text-amber-600" },
                              ].map(s => (
                                <span key={s.label} className="inline-flex items-baseline gap-1 text-xs text-gray-500">
                                  <span className={`text-sm font-bold tabular-nums ${s.color}`}>{s.value}</span>
                                  {s.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        )) : (
                          <div className="py-16 text-center text-sm text-gray-400">
                            <Activity className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                            <p>No grammar checks yet.</p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  /* ── User Detail View ── */
                  <div className="space-y-4">
                    {(() => {
                      const userChecksFiltered = userChecks.filter(c => c.userId === selectedUserId);
                      const userEmail = userChecksFiltered[0]?.userEmail || "Unknown User";
                      return (
                        <>
                          {/* User summary card */}
                          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                                  <span className="text-sm font-bold text-white">{(userEmail[0] || "?").toUpperCase()}</span>
                                </div>
                                <div className="min-w-0">
                                  <h2 className="text-base font-semibold text-gray-900 truncate">{userEmail}</h2>
                                  <p className="text-xs text-gray-400 font-mono truncate">ID: {selectedUserId}</p>
                                </div>
                              </div>
                              {/* Summary stats grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:shrink-0">
                                {[
                                  { label: "Checks",      value: userChecksFiltered.length, color: "text-blue-600", bg: "bg-blue-50" },
                                  { label: "Words",       value: userChecksFiltered.reduce((s, c) => s + c.wordCount, 0).toLocaleString(), color: "text-purple-600", bg: "bg-purple-50" },
                                  { label: "Credits",     value: userChecksFiltered.reduce((s, c) => s + (c.creditsUsed ?? c.wordCount), 0).toLocaleString(), color: "text-amber-600", bg: "bg-amber-50" },
                                  { label: "Suggestions", value: userChecksFiltered.reduce((s, c) => s + c.suggestionsCount, 0), color: "text-emerald-600", bg: "bg-emerald-50" },
                                ].map(s => (
                                  <div key={s.label} className={`${s.bg} rounded-lg px-3 py-2 text-center min-w-[70px]`}>
                                    <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
                                    <p className="text-[10px] font-medium text-gray-500 mt-0.5">{s.label}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Check list */}
                          <div className="space-y-3">
                            {userChecksFiltered.map((check) => (
                              <div key={check.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                {/* Check row header */}
                                <div
                                  onClick={() => setExpandedCheckId(expandedCheckId === check.id ? null : check.id)}
                                  className="px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                >
                                  {/* Top line: badge + date + expand icon */}
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="outline" className="text-xs shrink-0">{check.language}</Badge>
                                    <span className="text-xs text-gray-400 flex-1 truncate">
                                      {new Date(check.timestamp).toLocaleString()}
                                    </span>
                                    {expandedCheckId === check.id
                                      ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                                      : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                                    }
                                  </div>
                                  {/* Text preview */}
                                  <p className="text-sm text-gray-700 line-clamp-2 mb-3">{check.text}</p>
                                  {/* Inline stats chips — always fit on one wrapped row */}
                                  <div className="flex flex-wrap gap-2">
                                    {[
                                      { label: "words",       value: check.wordCount.toLocaleString(),                           color: "text-blue-700",   bg: "bg-blue-50"   },
                                      { label: "credits",     value: (check.creditsUsed ?? check.wordCount).toLocaleString(),    color: "text-amber-700",  bg: "bg-amber-50"  },
                                      { label: "suggestions", value: check.suggestionsCount,                                      color: "text-purple-700", bg: "bg-purple-50" },
                                    ].map(s => (
                                      <span key={s.label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.color}`}>
                                        <span className="font-bold tabular-nums">{s.value}</span> {s.label}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                {/* Expanded detail panel */}
                                {expandedCheckId === check.id && (
                                  <div className="border-t border-gray-100 px-5 py-5 bg-gray-50/60 space-y-5">
                                    {/* Stats grid */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                      {[
                                        { label: "Words",       value: check.wordCount.toLocaleString(),                        color: "text-blue-600",   bg: "bg-blue-50"   },
                                        { label: "Credits Used",value: (check.creditsUsed ?? check.wordCount).toLocaleString(), color: "text-amber-600",  bg: "bg-amber-50"  },
                                        { label: "Suggestions", value: check.suggestionsCount,                                   color: "text-purple-600", bg: "bg-purple-50" },
                                        { label: "Language",    value: check.language,                                           color: "text-emerald-600",bg: "bg-emerald-50"},
                                      ].map(s => (
                                        <div key={s.label} className={`${s.bg} rounded-lg px-3 py-2.5 text-center`}>
                                          <p className={`text-base font-bold tabular-nums ${s.color}`}>{s.value}</p>
                                          <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
                                        </div>
                                      ))}
                                    </div>

                                    {/* User Input */}
                                    <div>
                                      <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">User Input</h4>
                                      <div className="bg-white rounded-lg border border-gray-200 p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                                        {check.text}
                                      </div>
                                    </div>

                                    {/* Suggestions list */}
                                    {check.suggestions && check.suggestions.length > 0 ? (
                                      <div>
                                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                                          Suggestions ({check.suggestions.length})
                                        </h4>
                                        <div className="space-y-2 max-h-64 overflow-y-auto">
                                          {check.suggestions.map((s, i) => (
                                            <div key={i} className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-sm">
                                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <span className="font-mono text-red-500 line-through break-all">{s.original}</span>
                                                <span className="text-gray-400 shrink-0">→</span>
                                                <span className="font-mono text-emerald-600 font-semibold break-all">{s.corrected}</span>
                                                {s.status && (
                                                  <Badge variant="outline" className={`text-xs shrink-0 ${
                                                    s.status === "accepted" ? "border-emerald-300 text-emerald-600 bg-emerald-50"
                                                    : s.status === "ignored" ? "border-gray-300 text-gray-500"
                                                    : "border-amber-300 text-amber-600 bg-amber-50"
                                                  }`}>
                                                    {s.status}
                                                  </Badge>
                                                )}
                                              </div>
                                              {s.explanation && <p className="text-xs text-gray-400 mt-1">{s.explanation}</p>}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-xs text-gray-400 italic">No suggestions recorded for this check.</p>
                                    )}

                                    {/* Corrected text */}
                                    {(() => {
                                      const corrected = check.correctedText
                                        || (check.suggestions?.length ? applyAllSuggestions(check.text, check.suggestions) : null);
                                      if (!corrected || corrected === check.text) return null;
                                      return (
                                        <div>
                                          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Final Text in User Input Box</h4>
                                          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                                            {corrected}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {activeTab === "blog" && (
              <div className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Blog</h1>
                    <p className="text-gray-500 text-sm mt-0.5">Create, edit, and publish blog posts</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {blogDraftSaved && (
                      <span className="text-xs text-muted-foreground">
                        Draft autosaved {blogDraftSaved.toLocaleTimeString()}
                        {" · "}
                        <button
                          className="underline hover:text-foreground"
                          onClick={() => {
                            const draft = loadBlogDraft();
                            if (draft) {
                              setBlogTitle(draft.title);
                              setBlogCustomSlug(draft.slug);
                              setBlogContentHtml(draft.contentHtml);
                              setBlogEditingId(draft.editingId);
                              toast.success("Draft restored");
                            }
                          }}
                        >restore</button>
                        {" · "}
                        <button className="underline hover:text-destructive" onClick={() => { clearBlogDraft(); toast.success("Draft cleared"); }}>clear</button>
                      </span>
                    )}
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg" onClick={resetBlogForm}>
                      New Post
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Title</label>
                      <Input
                        value={blogTitle}
                        onChange={(e) => setBlogTitle(e.target.value)}
                        placeholder="Blog post title"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Custom URL (Optional)</label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">correctnow.app/blog/</span>
                        <Input
                          value={blogCustomSlug}
                          onChange={(e) => {
                            // Auto-slugify as user types
                            const slugified = e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9\-]/g, "-")
                              .replace(/-+/g, "-")
                              .replace(/^-/, ""); // Only remove leading hyphen, allow trailing while typing
                            setBlogCustomSlug(slugified);
                          }}
                          placeholder="my-seo-friendly-url"
                          className="flex-1"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Leave empty to auto-generate from title. Only use lowercase letters, numbers, and hyphens.
                      </p>
                    </div>

                    {/* ─── AI Blog Content Generator ─────────────────── */}
                    <div className="rounded-xl border-2 border-purple-400/40 bg-purple-50/40 dark:bg-purple-950/20 p-4 space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">✨</span>
                        <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-300">AI Blog Generator</h4>
                        <span className="ml-auto text-xs text-muted-foreground">Powered by Gemini</span>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1 text-muted-foreground">Keywords / Topic *</label>
                        <Input
                          value={blogAiKeywords}
                          onChange={(e) => setBlogAiKeywords(e.target.value)}
                          placeholder="e.g. Tamil grammar mistakes beginners should avoid"
                          className="text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1 text-muted-foreground">Tone</label>
                          <select value={blogAiTone} onChange={(e) => setBlogAiTone(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground">
                            <option value="informative">Informative</option>
                            <option value="conversational">Conversational</option>
                            <option value="professional">Professional</option>
                            <option value="storytelling">Storytelling</option>
                            <option value="how-to">How-To Guide</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-muted-foreground">Target Audience</label>
                          <select value={blogAiAudience} onChange={(e) => setBlogAiAudience(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground">
                            <option value="everyone">Everyone</option>
                            <option value="students">Students</option>
                            <option value="professionals">Professionals</option>
                            <option value="writers">Writers / Bloggers</option>
                            <option value="teachers">Teachers</option>
                            <option value="beginners">Beginners</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1 text-muted-foreground">Word Count</label>
                          <select value={blogAiWordCount} onChange={(e) => setBlogAiWordCount(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground">
                            <option value="400">~400 words (Short)</option>
                            <option value="800">~800 words (Standard)</option>
                            <option value="1200">~1200 words (Long)</option>
                            <option value="2000">~2000 words (Deep Dive)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-muted-foreground">Blog Language</label>
                          <Input
                            value={blogAiLanguage}
                            onChange={(e) => setBlogAiLanguage(e.target.value)}
                            placeholder="English"
                            className="text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1 text-muted-foreground">Extra Context (optional)</label>
                        <Input
                          value={blogAiExtraContext}
                          onChange={(e) => setBlogAiExtraContext(e.target.value)}
                          placeholder="e.g. Include tips for Tamil script, mention CorrectNow's free plan..."
                          className="text-sm"
                        />
                      </div>

                      <Button onClick={handleBlogAiGenerate} disabled={blogAiGenerating || (!blogAiKeywords && !blogTitle)}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                        {blogAiGenerating
                          ? <><span className="animate-spin mr-2">⟳</span>Generating…</>
                          : <>✨ Generate Blog Post with AI</>}
                      </Button>

                      {/* AI Result summary */}
                      {blogAiResult && (
                        <div className="pt-2 border-t border-purple-200 dark:border-purple-800 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-green-600 dark:text-green-400">✓ Generated</span>
                            <span className="text-xs text-muted-foreground">— title, slug, content applied to form</span>
                          </div>
                          {blogAiResult.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {blogAiResult.tags.map((t, i) => (
                                <span key={i} className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full text-xs">{t}</span>
                              ))}
                            </div>
                          )}
                          {blogAiResult.excerpt && (
                            <p className="text-xs text-muted-foreground italic">"{blogAiResult.excerpt}"</p>
                          )}
                        </div>
                      )}

                      {/* ─── Image Generator (hidden) ─── */}
                      {false && (
                      <div className="pt-3 border-t border-purple-200 dark:border-purple-800 space-y-2">
                        <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">🖼 AI Image Generator</p>
                        <div className="flex gap-2">
                          <select value={blogAiImageStyle} onChange={(e) => setBlogAiImageStyle(e.target.value)}
                            className="flex-1 px-2 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground">
                            <option value="photorealistic">Photorealistic</option>
                            <option value="illustration">Digital Illustration</option>
                            <option value="3d">3D Render</option>
                            <option value="minimal">Minimalist</option>
                          </select>
                          <Button onClick={handleBlogImageGenerate} disabled={blogAiImgGenerating}
                            variant="outline" className="border-purple-400 text-purple-700 dark:text-purple-300">
                            {blogAiImgGenerating ? <span className="animate-spin">⟳</span> : "Generate Image"}
                          </Button>
                        </div>
                        {blogAiResult?.imagePrompt && (
                          <p className="text-xs text-muted-foreground">Prompt: {blogAiResult.imagePrompt}</p>
                        )}

                        {/* Generated images */}
                        {blogAiGeneratedImages.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            {blogAiGeneratedImages.map((img, i) => (
                              <div key={i} className="relative group rounded-lg overflow-hidden border border-border">
                                <img src={img.dataUrl} alt={`Generated ${i + 1}`} className="w-full h-32 object-cover" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <button onClick={() => applyBlogAiImage(img.dataUrl)}
                                    className="px-2 py-1 bg-white text-black rounded text-xs font-medium">
                                    Use as Cover
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Unsplash fallback */}
                        {blogAiFallbackImg && (
                          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 space-y-2">
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                              AI image generation unavailable — find a free image on Unsplash, download it, then upload below.
                            </p>
                            <a href={blogAiFallbackImg.unsplashSearchUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center justify-center gap-1 w-full px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium text-center">
                              Browse Unsplash for "{blogAiResult?.imagePrompt?.split(" ").slice(0, 4).join(" ") || "images"}"...
                            </a>
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                    {/* ────────────────────────────────────────────────── */}

                    <div>
                      <label className="block text-sm font-medium mb-2">Content</label>
                      <div className="rounded-lg border border-border bg-background">
                        <div className="flex flex-wrap gap-2 border-b border-border p-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => applyBlogCommand("undo")}
                            title="Undo (Ctrl+Z)">
                            <Undo className="w-4 h-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => applyBlogCommand("redo")}
                            title="Redo (Ctrl+Y)">
                            <Redo className="w-4 h-4" />
                          </Button>
                          <div className="w-px bg-border" />
                          <Button type="button" size="sm" variant="outline" onClick={() => applyBlogCommand("bold")}
                            title="Bold (Ctrl+B)">
                            <Bold className="w-4 h-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => applyBlogCommand("italic")}
                            title="Italic (Ctrl+I)">
                            <Italic className="w-4 h-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => applyBlogCommand("underline")}
                            title="Underline (Ctrl+U)">
                            <Underline className="w-4 h-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => applyBlogCommand("formatBlock", "<h2>")}
                            title="Heading 2">
                            <Heading2 className="w-4 h-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => applyBlogCommand("formatBlock", "<h3>")}
                            title="Heading 3">
                            <Heading3 className="w-4 h-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => applyBlogCommand("insertUnorderedList")}
                            title="Bullet list">
                            <List className="w-4 h-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => applyBlogCommand("insertOrderedList")}
                            title="Numbered list">
                            <ListOrdered className="w-4 h-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => applyBlogCommand("formatBlock", "<blockquote>")}
                            title="Quote">
                            <Quote className="w-4 h-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={handleBlogLink}
                            title="Insert link">
                            <Link2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <div
                          ref={blogEditorRef}
                          className="min-h-[220px] p-3 text-sm leading-relaxed focus:outline-none"
                          contentEditable
                          suppressContentEditableWarning
                          onInput={(e) => syncBlogContentState(e.currentTarget.innerHTML)}
                          onKeyDown={handleBlogKeyDown}
                          onPaste={handleBlogPaste}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Style your content like WordPress: headings, bold/italic, lists, quotes, and links.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Publish date & time</label>
                      <Input
                        type="datetime-local"
                        value={blogDateTime}
                        onChange={(e) => setBlogDateTime(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Images</label>
                      <Input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => handleBlogImagesChange(e.target.files)}
                      />
                      {blogImages.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          {blogImages.map((img, idx) => (
                            <div key={idx} className="relative">
                              <img
                                src={img.preview}
                                alt={`Blog image ${idx + 1}`}
                                className="w-full h-28 object-cover rounded-lg border border-border"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute top-1 right-1 bg-background/80"
                                onClick={() => removeBlogImage(idx)}
                                title="Remove image"
                              >
                                ✕
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Upload multiple images. The first image will be used as the cover.
                      </p>
                    </div>
                    {/* ── Post-publish confirmation banner ── */}
                    {blogLastPublished && (
                      <div className="flex items-start gap-3 rounded-xl border border-green-400/40 bg-green-50/60 dark:bg-green-950/30 px-4 py-3">
                        <span className="text-green-600 text-lg mt-0.5">✓</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                            {blogLastPublished.wasEdit ? "Post updated successfully!" : "Post published successfully!"}
                          </p>
                          <p className="text-xs text-green-700/70 dark:text-green-400 truncate mt-0.5">
                            {blogLastPublished.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => { setBlogLastPublished(null); document.getElementById('blog-posts-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 transition-colors"
                          >
                            📋 All Posts
                          </button>
                          <button
                            onClick={() => setBlogLastPublished(null)}
                            className="text-green-600 hover:text-green-800 dark:text-green-400 text-xl leading-none px-1"
                            title="Dismiss"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button onClick={handleSaveBlog} disabled={blogSaving}>
                        {blogSaving
                          ? "Saving..."
                          : blogEditingId
                            ? "Update Post"
                            : "Publish Post"}
                      </Button>
                      {blogEditingId && (
                        <Button variant="outline" onClick={resetBlogForm}>
                          Cancel Edit
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Live Preview Panel */}
                  <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <h3 className="text-lg font-semibold">Live Preview</h3>
                      <Badge variant="secondary">Auto-updating</Badge>
                    </div>
                    
                    {/* Preview Header */}
                    <div className="space-y-3">
                      {blogTitle ? (
                        <h1 className="text-3xl font-bold text-foreground">{blogTitle}</h1>
                      ) : (
                        <h1 className="text-3xl font-bold text-muted-foreground italic">Untitled Post</h1>
                      )}
                      {blogDateTime && (
                        <p className="text-sm text-muted-foreground">
                          {new Date(blogDateTime).toLocaleString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      )}
                    </div>
                    
                    {/* Cover Image Preview */}
                    {blogImages.length > 0 && (
                      <div className="w-full h-64 rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center">
                        <img
                          src={blogImages[0].preview}
                          alt="Cover preview"
                          className="max-w-full max-h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setLightboxImage(blogImages[0].preview)}
                        />
                      </div>
                    )}
                    
                    {/* Content Preview */}
                    <div className="border-t border-border pt-4">
                      <div className="blog-content prose max-w-none">
                        {blogContentHtml ? (
                          <div dangerouslySetInnerHTML={{ __html: blogContentHtml }} />
                        ) : (
                          <p className="text-muted-foreground italic">Start typing to see preview...</p>
                        )}
                      </div>
                    </div>
                    
                    {/* Image Gallery Preview */}
                    {blogImages.length > 1 && (
                      <div className="border-t border-border pt-4">
                        <h4 className="text-sm font-semibold mb-3">Gallery Images</h4>
                        <div className="grid grid-cols-3 gap-3">
                          {blogImages.slice(1).map((img, idx) => (
                            <div key={idx} className="w-full h-32 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden">
                              <img
                                src={img.preview}
                                alt={`Gallery ${idx + 1}`}
                                className="max-w-full max-h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => setLightboxImage(img.preview)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Image Lightbox */}
                {lightboxImage && (
                  <div 
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
                    onClick={() => setLightboxImage(null)}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-4 right-4 text-white hover:bg-white/20"
                      onClick={() => setLightboxImage(null)}
                    >
                      <X className="w-6 h-6" />
                    </Button>
                    <img
                      src={lightboxImage}
                      alt="Full size preview"
                      className="max-w-full max-h-full object-contain"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
                
                {/* Blog Posts List */}
                <div id="blog-posts-list" className="mt-6 bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-foreground">All Posts</h2>
                      <span className="text-sm text-muted-foreground">
                        {blogPosts.length} total
                      </span>
                    </div>
                    {blogLoading ? (
                      <p className="text-sm text-muted-foreground">Loading posts...</p>
                    ) : blogPosts.length ? (
                      <div className="space-y-4">
                        {blogPosts.map((post) => (
                          <div
                            key={post.id}
                            className="flex flex-col sm:flex-row gap-4 p-4 rounded-lg border border-border"
                          >
                            {(post.coverImageUrl || post.imageUrls?.[0]) && (
                              <img
                                src={post.coverImageUrl || post.imageUrls?.[0]}
                                alt={post.title}
                                className="w-full sm:w-32 h-24 object-cover rounded-md border border-border"
                              />
                            )}
                            <div className="flex-1 space-y-2">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <h3 className="font-semibold text-foreground">
                                  {post.title}
                                </h3>
                                <span className="text-xs text-muted-foreground">
                                  {post.publishedAt
                                    ? new Date(post.publishedAt).toLocaleString()
                                    : "Unscheduled"}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {post.contentText || post.contentHtml.replace(/<[^>]*>/g, " ").trim()}
                              </p>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleEditBlog(post)}>
                                  Edit
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => handleDeleteBlog(post)}>
                                  Delete
                                </Button>
                                <a
                                  href={`/blog/${post.slug || post.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background hover:bg-muted text-xs font-medium px-3 py-1.5 transition-colors text-foreground"
                                >
                                  🔗 View Post
                                </a>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No blog posts yet.</p>
                    )}
                  </div>

                  {/* Google Indexing for Blog Posts */}
                  <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-blue-500" />
                      <h3 className="text-base font-semibold text-foreground">Submit Blog Posts to Google</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Submit all published blog post URLs to Google for fast indexing. Uses the same service account configured in the SEO tab.
                      Limit: 200 URLs/day.
                    </p>

                    {!indexingServiceJson && (
                      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          ⚠ No service account configured. Go to <strong>SEO tab → Google Indexing API</strong> and paste your service account JSON key first.
                        </p>
                      </div>
                    )}

                    <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-medium text-foreground">URLs to be submitted ({blogPosts.length}):</p>
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {blogPosts.map(p => (
                          <p key={p.id} className="text-xs font-mono text-muted-foreground">
                            correctnow.app/blog/{p.slug || p.id}
                          </p>
                        ))}
                        {!blogPosts.length && <p className="text-xs text-muted-foreground italic">No posts yet</p>}
                      </div>
                    </div>

                    <Button
                      onClick={handleBlogIndexing}
                      disabled={blogIndexingLoading || !indexingServiceJson || !blogPosts.length}
                      className="w-full"
                    >
                      {blogIndexingLoading
                        ? <><span className="animate-spin mr-2">⟳</span>Submitting…</>
                        : <><Globe className="w-4 h-4 mr-2" />Submit All Blog Posts to Google</>}
                    </Button>

                    {blogIndexingResults.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-foreground">
                            Results — {blogIndexingResults.filter(r => r.ok).length}/{blogIndexingResults.length} succeeded
                          </p>
                          <button
                            onClick={async () => {
                              if (!indexingServiceJson) return;
                              const urls = blogIndexingResults.map(r => r.url);
                              try {
                                const res = await fetch("/api/google-index-status", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ serviceAccountJson: indexingServiceJson, urls }),
                                });
                                const data = await res.json();
                                if (!res.ok) { toast.error(data.error || "Status check failed"); return; }
                                const statusMap = Object.fromEntries((data.results || []).map((r: { url: string; notifyTime?: string | null; type?: string | null; error?: string }) => [r.url, r]));
                                setBlogIndexingResults(prev => prev.map(r => ({
                                  ...r,
                                  notifyTime: statusMap[r.url]?.notifyTime ?? r.notifyTime,
                                  type: statusMap[r.url]?.type ?? r.type,
                                })));
                                const confirmed = (data.results || []).filter((r: { notifyTime?: string | null }) => r.notifyTime).length;
                                toast.success(`${confirmed} of ${urls.length} URLs confirmed received by Google`);
                              } catch (err: unknown) {
                                toast.error((err instanceof Error ? err.message : String(err)) || "Status check failed");
                              }
                            }}
                            className="text-xs px-2 py-1 rounded border border-border bg-background hover:bg-muted text-foreground"
                          >
                            Check Status
                          </button>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {blogIndexingResults.map((r, i) => (
                            <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded text-xs ${r.ok ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"}`}>
                              <span>{r.ok ? "✓" : "✗"}</span>
                              <span className="font-mono truncate flex-1">{r.url.replace("https://correctnow.app", "")}</span>
                              <div className="shrink-0 text-right">
                                {r.message && <span>{r.message}</span>}
                                {r.notifyTime && (
                                  <span className="block text-green-600 dark:text-green-400">✓ {new Date(r.notifyTime).toLocaleDateString()}</span>
                                )}
                                {r.notifyTime === null && (
                                  <span className="block text-amber-500">Not received yet</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">Click <strong>Check Status</strong> to confirm Google received each URL. Actual indexing takes hours to days.</p>
                      </div>
                    )}
                  </div>
              </div>
            )}

            {activeTab === "languages" && (
              <div className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Languages Management</h1>
                    <p className="text-gray-500 text-sm mt-0.5">Add and manage custom languages for your grammar checker</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Single Language Form */}
                  <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-foreground">Add Single Language</h3>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2">Language Code</label>
                      <Input
                        value={newLanguageCode}
                        onChange={(e) => setNewLanguageCode(e.target.value.toLowerCase().trim())}
                        placeholder="ta"
                        maxLength={10}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Unique language code (e.g., "ta", "hi", "es")
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Language Name</label>
                      <Input
                        value={newLanguageName}
                        onChange={(e) => setNewLanguageName(e.target.value)}
                        placeholder="Tamil (தமிழ்)"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Display name for this language
                      </p>
                    </div>

                    <Button 
                      onClick={async () => {
                        if (!newLanguageCode || !newLanguageName) {
                          toast.error("Please enter both language code and name");
                          return;
                        }

                        const db = getFirebaseDb();
                        if (!db) {
                          toast.error("Database not initialized");
                          return;
                        }

                        setSavingLanguage(true);
                        try {
                          // Check if language code already exists
                          const existingDoc = await getDoc(doc(db, "customLanguages", newLanguageCode));
                          if (existingDoc.exists()) {
                            toast.error(`Language code "${newLanguageCode}" already exists`);
                            return;
                          }

                          await setDoc(doc(db, "customLanguages", newLanguageCode), {
                            code: newLanguageCode,
                            name: newLanguageName,
                            createdAt: new Date().toISOString(),
                          });

                          setCustomLanguages(prev => [...prev, {
                            id: newLanguageCode,
                            code: newLanguageCode,
                            name: newLanguageName,
                            createdAt: new Date().toISOString(),
                          }].sort((a, b) => a.name.localeCompare(b.name)));

                          setNewLanguageCode("");
                          setNewLanguageName("");
                          toast.success("Language added successfully");
                        } catch (error) {
                          console.error("Error adding language:", error);
                          toast.error("Failed to add language");
                        } finally {
                          setSavingLanguage(false);
                        }
                      }}
                      disabled={savingLanguage || !newLanguageCode || !newLanguageName}
                      className="w-full"
                    >
                      {savingLanguage ? "Adding..." : "Add Language"}
                    </Button>
                  </div>

                  {/* Bulk Language Form */}
                  <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-foreground">Add Bulk Languages</h3>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2">Comma-Separated Languages</label>
                      <Textarea
                        value={bulkLanguages}
                        onChange={(e) => setBulkLanguages(e.target.value)}
                        placeholder="ta:Tamil (தமிழ்), hi:Hindi (हिन्दी), es:Spanish (Español)"
                        rows={6}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Format: code:name, code:name, ... (duplicates will be skipped)
                      </p>
                    </div>

                    <Button 
                      onClick={async () => {
                        if (!bulkLanguages.trim()) {
                          toast.error("Please enter languages to add");
                          return;
                        }

                        const db = getFirebaseDb();
                        if (!db) {
                          toast.error("Database not initialized");
                          return;
                        }

                        setSavingLanguage(true);
                        try {
                          const entries = bulkLanguages
                            .split(",")
                            .map(entry => entry.trim())
                            .filter(entry => entry.includes(":"));

                          let added = 0;
                          let skipped = 0;
                          const newLangs: typeof customLanguages = [];

                          for (const entry of entries) {
                            const [code, name] = entry.split(":").map(s => s.trim());
                            if (!code || !name) continue;

                            const lowerCode = code.toLowerCase();
                            
                            // Check if already exists
                            const existingDoc = await getDoc(doc(db, "customLanguages", lowerCode));
                            if (existingDoc.exists()) {
                              skipped++;
                              continue;
                            }

                            await setDoc(doc(db, "customLanguages", lowerCode), {
                              code: lowerCode,
                              name: name,
                              createdAt: new Date().toISOString(),
                            });

                            newLangs.push({
                              id: lowerCode,
                              code: lowerCode,
                              name: name,
                              createdAt: new Date().toISOString(),
                            });
                            added++;
                          }

                          if (newLangs.length > 0) {
                            setCustomLanguages(prev => [...prev, ...newLangs].sort((a, b) => a.name.localeCompare(b.name)));
                          }

                          setBulkLanguages("");
                          toast.success(`Added ${added} language(s). Skipped ${skipped} duplicate(s).`);
                        } catch (error) {
                          console.error("Error adding bulk languages:", error);
                          toast.error("Failed to add languages");
                        } finally {
                          setSavingLanguage(false);
                        }
                      }}
                      disabled={savingLanguage || !bulkLanguages.trim()}
                      className="w-full"
                    >
                      {savingLanguage ? "Adding..." : "Add Bulk Languages"}
                    </Button>
                  </div>
                </div>

                {/* Default Languages */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-2">Default Languages ({LANGUAGE_OPTIONS.length})</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    These are the built-in languages available in the system. They are available in all language selectors.
                  </p>
                  
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <div
                        key={lang.code}
                        className="flex items-center gap-3 p-2 rounded-lg border border-border bg-muted/30"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary font-mono text-xs font-semibold">
                          {lang.code}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{lang.name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom Languages List */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-2">Custom Languages ({customLanguages.length})</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Languages you've added. These will appear alongside default languages in all language selectors.
                  </p>
                  
                  {languagesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading languages...</p>
                  ) : customLanguages.length > 0 ? (
                    <div className="grid gap-2">
                      {customLanguages.map((lang) => (
                        <div
                          key={lang.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/5 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 text-accent font-mono font-semibold">
                              {lang.code}
                            </div>
                            <div>
                              <div className="font-medium text-foreground">{lang.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Added {new Date(lang.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const confirmed = window.confirm(`Delete language "${lang.name}" (${lang.code})?`);
                              if (!confirmed) return;

                              const db = getFirebaseDb();
                              if (!db) return;

                              try {
                                await deleteDoc(doc(db, "customLanguages", lang.id));
                                setCustomLanguages(prev => prev.filter(l => l.id !== lang.id));
                                toast.success("Language deleted");
                              } catch (error) {
                                console.error("Error deleting language:", error);
                                toast.error("Failed to delete language");
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No custom languages added yet.</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "billing" && (() => {
              const arpu = proUsers > 0 ? Math.round(monthlyRevenue / proUsers) : 0;
              const pastDueUsers = users.filter(u => String(u.subscriptionStatus || "").toLowerCase() === "past_due");
              const cancelledUsers = users.filter(u => String(u.subscriptionStatus || "").toLowerCase() === "cancelled");

              const filteredBilling = billingRows.filter(r => {
                const q = billingSearch.toLowerCase();
                return !q || r.name?.toLowerCase().includes(q) || r.userId?.toLowerCase().includes(q);
              });
              return (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Billing & Plans</h1>
                    <p className="text-gray-500 text-sm mt-0.5">Revenue, subscriptions, discounts, and payment activity</p>
                  </div>
                  <Button variant="outline" size="sm" className="border-gray-200 rounded-lg shrink-0" onClick={handleExportBilling}>
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </div>

                {/* KPI row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                  {[
                    { label: "MRR", value: `₹${monthlyRevenue.toLocaleString("en-IN")}`, sub: "Monthly recurring", color: "text-teal-600", bg: "bg-teal-50", border: "border-l-teal-500", icon: <CreditCard className="w-4 h-4" /> },
                    { label: "Active Subs", value: proUsers.toLocaleString(), sub: "Pro plans", color: "text-blue-600", bg: "bg-blue-50", border: "border-l-blue-500", icon: <Users className="w-4 h-4" /> },
                    { label: "ARPU", value: `₹${arpu.toLocaleString("en-IN")}`, sub: "Avg revenue/user", color: "text-indigo-600", bg: "bg-indigo-50", border: "border-l-indigo-500", icon: <BarChart3 className="w-4 h-4" /> },
                    { label: "Conversion", value: `${conversionRate}%`, sub: "Free → Pro", color: "text-orange-600", bg: "bg-orange-50", border: "border-l-orange-500", icon: <TrendingUp className="w-4 h-4" /> },
                    { label: "Churn Risk", value: pastDueUsers.length.toLocaleString(), sub: "Past due accounts", color: "text-red-600", bg: "bg-red-50", border: "border-l-red-500", icon: <AlertTriangle className="w-4 h-4" /> },
                    { label: "Cancelled", value: cancelledUsers.length.toLocaleString(), sub: "Cancelled subs", color: "text-gray-500", bg: "bg-gray-50", border: "border-l-gray-300", icon: <UserX className="w-4 h-4" /> },
                  ].map(c => (
                    <div key={c.label} className={`bg-white rounded-xl border border-gray-200 border-l-4 ${c.border} shadow-sm p-4`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500 font-medium">{c.label}</span>
                        <div className={`${c.bg} ${c.color} p-1.5 rounded-md`}>{c.icon}</div>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{c.value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Churn risk alert */}
                {pastDueUsers.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">Churn Risk — {pastDueUsers.length} Past Due</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pastDueUsers.slice(0, 8).map(u => (
                        <div key={u.id} className="text-xs bg-white dark:bg-red-900/40 border border-red-200 dark:border-red-700 rounded-lg px-3 py-1.5">
                          <span className="font-medium text-foreground">{u.name || u.email}</span>
                          {u.email && u.name && <span className="text-muted-foreground ml-1">— {u.email}</span>}
                        </div>
                      ))}
                      {pastDueUsers.length > 8 && (
                        <div className="text-xs bg-white dark:bg-red-900/40 border border-red-200 dark:border-red-700 rounded-lg px-3 py-1.5 text-muted-foreground">
                          +{pastDueUsers.length - 8} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* Coupon System */}
                  <div className="bg-card rounded-xl border border-border p-6 space-y-5">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Coupon System</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Create discount codes for Pro subscriptions</p>
                    </div>

                    {/* Create form */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Coupon code</label>
                          <Input
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                            placeholder="SAVE20"
                            className="font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Discount %</label>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={couponPercent}
                            onChange={(e) => setCouponPercent(e.target.value)}
                            placeholder="20"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Expiry date (optional)</label>
                          <Input
                            type="date"
                            value={couponExpiry}
                            onChange={(e) => setCouponExpiry(e.target.value)}
                            min={new Date().toISOString().split("T")[0]}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Max usage (optional)</label>
                          <Input
                            type="number"
                            min={1}
                            value={couponMaxUsage}
                            onChange={(e) => setCouponMaxUsage(e.target.value)}
                            placeholder="500"
                          />
                        </div>
                      </div>
                      <Button
                        variant="accent"
                        onClick={handleCreateCoupon}
                        disabled={couponSaving}
                        className="w-full"
                      >
                        {couponSaving ? "Saving..." : "Create Coupon"}
                      </Button>
                    </div>

                    {/* Coupon list */}
                    <div className="space-y-2">
                      {couponLoading ? (
                        <p className="text-sm text-muted-foreground">Loading coupons...</p>
                      ) : coupons.length ? (
                        coupons.map((coupon) => {
                          const isExpired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date();
                          const isMaxed = coupon.maxUsage && (coupon.usageCount || 0) >= coupon.maxUsage;
                          return (
                            <div key={coupon.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-border p-3">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-mono font-semibold text-foreground">{coupon.code}</span>
                                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{coupon.percent}% off</span>
                                  {isExpired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                                  {isMaxed && <Badge variant="destructive" className="text-xs">Maxed</Badge>}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                  {coupon.expiresAt && (
                                    <span>Expires: {new Date(coupon.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                                  )}
                                  {coupon.maxUsage && (
                                    <span>Usage: {coupon.usageCount || 0}/{coupon.maxUsage}</span>
                                  )}
                                  {coupon.createdAt && (
                                    <span>Created: {new Date(coupon.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant={coupon.active && !isExpired && !isMaxed ? "secondary" : "outline"}>
                                  {coupon.active && !isExpired && !isMaxed ? "Active" : "Inactive"}
                                </Badge>
                                <Button variant="outline" size="sm" onClick={() => handleToggleCoupon(coupon)}>
                                  {coupon.active ? "Disable" : "Enable"}
                                </Button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground">No coupons created yet.</p>
                      )}
                    </div>
                  </div>

                  {/* Revenue breakdown */}
                  <div className="bg-card rounded-xl border border-border p-6">
                    <h2 className="text-base font-semibold text-foreground mb-4">Revenue Breakdown</h2>
                    <div className="space-y-3">
                      {[
                        { label: "MRR", value: `₹${monthlyRevenue.toLocaleString("en-IN")}`, color: "text-emerald-500" },
                        { label: "ARR (Est.)", value: `₹${(monthlyRevenue * 12).toLocaleString("en-IN")}`, color: "text-blue-500" },
                        { label: "ARPU", value: `₹${arpu.toLocaleString("en-IN")}`, color: "text-indigo-500" },
                        { label: "Active Pro Users", value: proUsers.toLocaleString(), color: "text-yellow-500" },
                        { label: "Free Users", value: freeUsers.toLocaleString(), color: "text-muted-foreground" },
                        { label: "Conversion Rate", value: `${conversionRate}%`, color: "text-orange-500" },
                      ].map(r => (
                        <div key={r.label} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{r.label}</span>
                          <span className={`text-sm font-semibold ${r.color}`}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Live Subscriptions table — fetched from Razorpay + Stripe */}
                {(() => {
                  const fmt = (iso: string | null | undefined, includeTime = false) => {
                    if (!iso) return "—";
                    const d = new Date(iso);
                    if (isNaN(d.getTime())) return "—";
                    const datePart = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                    if (!includeTime) return datePart;
                    const timePart = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
                    return `${datePart}, ${timePart}`;
                  };
                  const fmtAmt = (amt: number | null, currency: string | null) => {
                    if (amt == null) return "—";
                    const sym = (currency || "INR") === "INR" ? "₹" : (currency === "USD" ? "$" : (currency || "") + " ");
                    return `${sym}${amt.toLocaleString("en-IN")}`;
                  };
                  const statusColor = (s: string | null) => {
                    if (!s) return "outline";
                    const sl = s.toLowerCase();
                    if (sl === "active") return "secondary";
                    if (sl === "past_due" || sl === "incomplete") return "destructive";
                    if (sl === "cancelled" || sl === "canceled" || sl === "halted" || sl === "inactive") return "outline";
                    return "outline";
                  };
                  const gatewayBadge = (gw: string | null) => {
                    if (!gw) return null;
                    if (gw === "razorpay") return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Razorpay</span>;
                    if (gw === "stripe") return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">Stripe</span>;
                    return <span className="text-xs text-muted-foreground">{gw}</span>;
                  };

                  // Determine which data to show: live (if loaded) or fallback to Firestore
                  const displayRows = liveSubscriptions.length > 0
                    ? liveSubscriptions
                        .filter(s => {
                          const q = billingSearch.toLowerCase();
                          return !q || s.email.toLowerCase().includes(q) || s.userId.toLowerCase().includes(q) || (s.stripeSubscriptionId || "").toLowerCase().includes(q) || (s.razorpaySubscriptionId || "").toLowerCase().includes(q);
                        })
                        .sort((a, b) => {
                          const dateA = new Date(a.liveCreatedAt || a.subscriptionCreatedAt || a.subscriptionUpdatedAt || a.createdAt || 0).getTime();
                          const dateB = new Date(b.liveCreatedAt || b.subscriptionCreatedAt || b.subscriptionUpdatedAt || b.createdAt || 0).getTime();
                          return dateB - dateA;
                        })
                    : filteredBilling;

                  return (
                  <div className="bg-card rounded-xl border border-border">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-6 border-b border-border">
                      <div>
                        <h2 className="text-base font-semibold text-foreground">Payment Subscriptions</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {liveSubscriptions.length > 0
                            ? `Live data from Razorpay & Stripe · ${liveSubscriptions.length} subscribers`
                            : "Firestore data · click \"Load Live\" to fetch from Razorpay & Stripe"}
                        </p>
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Search email or sub ID..."
                            value={billingSearch}
                            onChange={e => setBillingSearch(e.target.value)}
                            className="pl-9 h-8 text-sm w-52"
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1.5"
                          onClick={fetchLiveSubscriptions}
                          disabled={isLoadingSubscriptions}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSubscriptions ? "animate-spin" : ""}`} />
                          {isLoadingSubscriptions ? "Loading…" : "Load Live"}
                        </Button>
                      </div>
                    </div>

                    {subscriptionsError && (
                      <div className="px-6 py-3 bg-red-50 border-b border-red-100 text-sm text-red-600 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        {subscriptionsError}
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/40">
                            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Customer</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Gateway</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Plan</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Amount</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Status</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Sub ID</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Started</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Period Start</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Period End</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Next Charge</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Paid / Total</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Last Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {liveSubscriptions.length > 0 ? (
                            displayRows.length ? (
                              (displayRows as LiveSubscription[]).map((sub) => {
                                const subId = sub.stripeSubscriptionId || sub.razorpaySubscriptionId || "";
                                const status = sub.liveStatus || sub.subscriptionStatus || "—";
                                const amount = sub.liveAmount ?? sub.lastPaymentAmount;
                                const currency = sub.liveCurrency || "INR";
                                const paidCount = sub.livePaidCount ?? sub.razorpayPaidCount;
                                const totalCount = sub.liveTotalCount ?? sub.razorpayTotalCount;
                                const createdAt = sub.liveCreatedAt || sub.subscriptionCreatedAt;
                                const periodStart = sub.livePeriodStart || sub.subscriptionPeriodStart;
                                const periodEnd = sub.livePeriodEnd || sub.subscriptionCurrentPeriodEnd;
                                return (
                                  <tr key={sub.userId} className="border-b border-border last:border-0 hover:bg-muted/20">
                                    <td className="py-3 px-4 font-medium text-foreground max-w-[180px]">
                                      <div className="truncate" title={sub.email}>{sub.email || sub.name || sub.userId}</div>
                                      {sub.name && sub.email && <div className="text-xs text-muted-foreground truncate">{sub.name}</div>}
                                    </td>
                                    <td className="py-3 px-4">{gatewayBadge(sub.paymentGateway)}</td>
                                    <td className="py-3 px-4">
                                      <Badge variant={sub.plan?.toLowerCase() === "pro" ? "default" : "outline"}>
                                        {sub.plan || "Free"}
                                      </Badge>
                                    </td>
                                    <td className="py-3 px-4 font-semibold text-foreground whitespace-nowrap">
                                      {fmtAmt(amount, currency)}
                                    </td>
                                    <td className="py-3 px-4">
                                      <Badge variant={statusColor(status)}>
                                        {status}
                                      </Badge>
                                      {sub.liveError && <span className="ml-1 text-[10px] text-red-400" title={sub.liveError}>⚠</span>}
                                    </td>
                                    <td className="py-3 px-4">
                                      <span className="font-mono text-xs text-muted-foreground" title={subId}>
                                        {subId ? subId.slice(0, 20) + (subId.length > 20 ? "…" : "") : "—"}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{fmt(createdAt, true)}</td>
                                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{fmt(periodStart)}</td>
                                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{fmt(periodEnd)}</td>
                                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{fmt(sub.liveNextChargeAt)}</td>
                                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                                      {paidCount != null ? `${paidCount} / ${totalCount ?? "?"}` : "—"}
                                    </td>
                                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{fmt(sub.subscriptionUpdatedAt, true)}</td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr><td className="py-8 text-center text-sm text-muted-foreground" colSpan={12}>No results for "{billingSearch}"</td></tr>
                            )
                          ) : (
                            // Fallback: show Firestore data while live hasn't been loaded
                            filteredBilling.length ? (
                              filteredBilling.map((payment) => (
                                <tr key={`${payment.name}-${payment.date}`} className="border-b border-border last:border-0 hover:bg-muted/20">
                                  <td className="py-3 px-4 font-medium text-foreground max-w-[180px] truncate">{payment.name}</td>
                                  <td className="py-3 px-4 text-xs text-muted-foreground">—</td>
                                  <td className="py-3 px-4">
                                    <Badge variant={payment.plan === "Pro" ? "default" : "outline"}>{payment.plan}</Badge>
                                  </td>
                                  <td className="py-3 px-4 font-semibold text-foreground">{payment.amount}</td>
                                  <td className="py-3 px-4">
                                    <Badge variant={payment.status === "Paid" ? "secondary" : payment.status === "Past Due" ? "destructive" : "outline"}>
                                      {payment.status}
                                    </Badge>
                                  </td>
                                  <td className="py-3 px-4 text-xs text-muted-foreground">—</td>
                                  <td className="py-3 px-4 text-muted-foreground">{fmt(payment.subscriptionUpdatedAt)}</td>
                                  <td className="py-3 px-4 text-muted-foreground">—</td>
                                  <td className="py-3 px-4 text-muted-foreground">—</td>
                                  <td className="py-3 px-4 text-muted-foreground">—</td>
                                  <td className="py-3 px-4 text-muted-foreground">—</td>
                                  <td className="py-3 px-4 text-muted-foreground">{fmt(payment.date)}</td>
                                </tr>
                              ))
                            ) : (
                              <tr><td className="py-8 text-center text-sm text-muted-foreground" colSpan={12}>
                                {billingSearch ? `No results for "${billingSearch}"` : 'No billing activity yet. Click "Load Live" to fetch from Razorpay & Stripe.'}
                              </td></tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  );
                })()}
              </div>
              );
            })()}

            {activeTab === "seo" && (
              <div className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">SEO Language Pages</h1>
                    <p className="text-gray-500 text-sm mt-0.5">Create SEO-optimized landing pages for each language</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => {
                      setBulkSeoDialogOpen(true);
                      setBulkLangCode("");
                      setBulkLangSearch("");
                      setBulkSlugsText("");
                    }}>
                      <Upload className="w-4 h-4 mr-2" />
                      Bulk Create
                    </Button>
                    <Button variant="default" onClick={() => {
                      setSeoEditingId(null);
                      setSeoUrlSlug("");
                      setSeoLanguageCode("");
                      setSeoTitle("");
                      setSeoMetaDescription("");
                      setSeoKeywords("");
                      setSeoH1("");
                      setSeoDescription("");
                      setSeoActive(true);
                    }}>
                      <Plus className="w-4 h-4 mr-2" />
                    New SEO Page
                  </Button>
                </div>
              </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  {/* ── Left: Form ── */}
                  <div className="bg-card rounded-xl border border-border p-5 sm:p-6 space-y-4">
                    <h3 className="text-base font-semibold text-foreground">
                      {seoEditingId ? "Edit SEO Page" : "Create New SEO Page"}
                    </h3>

                    <div>
                      <label className="block text-sm font-medium mb-2">URL Slug (Custom)</label>
                      <Input
                        value={seoUrlSlug}
                        onChange={(e) => {
                          const slugified = e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9\-]/g, "-")
                            .replace(/-+/g, "-")
                            .replace(/^-/, ""); // Only remove leading hyphen, allow trailing while typing
                          setSeoUrlSlug(slugified);
                        }}
                        placeholder="tamil-grammar" 
                        disabled={!!seoEditingId}
                      />
                      {seoUrlSlug && !slugAlreadyExists && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          ✓ URL: correctnow.app/{seoUrlSlug}
                        </p>
                      )}
                      {slugAlreadyExists && (
                        <p className="text-xs text-red-500 mt-1 font-medium">
                          ⚠ Slug "{seoUrlSlug}" already exists — choose a different slug or edit the existing page.
                        </p>
                      )}
                      {!seoUrlSlug && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Custom URL for this page (e.g., "tamil", "hindi-checker", "grammar-ta")
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Language</label>
                      <select
                        value={seoLanguageCode}
                        onChange={(e) => {
                          const code = e.target.value;
                          const lang = allLanguages.find(l => l.code === code);
                          setSeoLanguageCode(code);
                          if (lang && !seoEditingId) {
                            // Auto-fill defaults for new pages
                            const autoSlug = seoUrlSlug || code;
                            if (!seoUrlSlug) {
                              setSeoUrlSlug(code); // Default URL to language code
                            }
                            const slugTitle = autoSlug
                              .split("-")
                              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                              .join(" ");
                            setSeoTitle(`${slugTitle} - CorrectNow`);
                            setSeoH1(slugTitle);
                            setSeoMetaDescription(`Free online ${slugTitle} tool. Check your ${lang.name} text for spelling, grammar, and style mistakes instantly.`);
                            setSeoKeywords(`${slugTitle.toLowerCase()}, ${lang.name} grammar checker, ${lang.name} spell check, ${lang.name} proofreading, online grammar check, ${code} grammar`);
                            setSeoDescription(`Free online ${slugTitle} tool. Check your ${lang.name} text for spelling, grammar, and style mistakes instantly.`);
                          }
                        }}
                        disabled={!!seoEditingId}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                      >
                        <option value="">Select a language...</option>
                        {allLanguages.filter(lang => lang.code !== "auto").map(lang => (
                          <option key={lang.code} value={lang.code}>
                            {lang.name} ({lang.code})
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Language for grammar checking (pre-selected for users)
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Page Title (SEO)</label>
                      <Input
                        value={seoTitle}
                        onChange={(e) => setSeoTitle(e.target.value)}
                        placeholder="Tamil Grammar Checker - CorrectNow"
                        maxLength={60}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {seoTitle.length}/60 - Shows in browser tab & search results
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Meta Description</label>
                      <Textarea
                        value={seoMetaDescription}
                        onChange={(e) => setSeoMetaDescription(e.target.value)}
                        placeholder="Free online Tamil grammar checker and proofreading tool..."
                        maxLength={160}
                        rows={3}
                        className="resize-none"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {seoMetaDescription.length}/160 - Appears in Google search results
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Keywords (comma-separated)</label>
                      <Textarea
                        value={seoKeywords}
                        onChange={(e) => setSeoKeywords(e.target.value)}
                        placeholder="tamil grammar checker, tamil spell check, tamil proofreading"
                        rows={2}
                        className="resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">H1 Heading</label>
                      <Input
                        value={seoH1}
                        onChange={(e) => setSeoH1(e.target.value)}
                        placeholder="Tamil Grammar Checker"
                        maxLength={70}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Page Description Text</label>
                      <Textarea
                        value={seoDescription}
                        onChange={(e) => setSeoDescription(e.target.value)}
                        placeholder="Free online Tamil grammar checker and proofreading tool. Check your Tamil text for spelling, grammar, and style mistakes instantly."
                        rows={3}
                        className="resize-none"
                      />
                    </div>

                    {/* ─── AI Content Generator ─────────────────────── */}
                    <div className="rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800 overflow-hidden">
                      {/* Header bar */}
                      <div className="flex items-center gap-2.5 px-4 py-3 bg-purple-100/70 dark:bg-purple-900/30 border-b border-purple-200 dark:border-purple-800">
                        <div className="w-6 h-6 rounded-md bg-purple-600 flex items-center justify-center shrink-0">
                          <Zap className="w-3.5 h-3.5 text-white" />
                        </div>
                        <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-200 flex-1 min-w-0">
                          AI Content Generator
                        </h4>
                        <span className="text-[10px] font-medium text-purple-500 dark:text-purple-400 bg-purple-200/60 dark:bg-purple-800/60 px-2 py-0.5 rounded-full shrink-0">
                          Gemini
                        </span>
                      </div>

                      <div className="p-4 space-y-3">
                        <div>
                          <label className="block text-xs font-medium mb-1 text-purple-700 dark:text-purple-300">Focus Keywords <span className="font-normal text-muted-foreground">(optional)</span></label>
                          <Input
                            value={seoAiKeywords}
                            onChange={(e) => setSeoAiKeywords(e.target.value)}
                            placeholder="Tamil grammar checker, spell check…"
                            className="text-sm bg-white dark:bg-background"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Leave blank to auto-generate from slug + language</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium mb-1 text-purple-700 dark:text-purple-300">Tone</label>
                            <select
                              value={seoAiTone}
                              onChange={(e) => setSeoAiTone(e.target.value as any)}
                              className="w-full h-9 px-2.5 text-sm rounded-lg border border-border bg-white dark:bg-background text-foreground"
                            >
                              <option value="professional">Professional</option>
                              <option value="friendly">Friendly</option>
                              <option value="technical">Technical</option>
                              <option value="simple">Simple (Beginner)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1 text-purple-700 dark:text-purple-300">Audience</label>
                            <select
                              value={seoAiAudience}
                              onChange={(e) => setSeoAiAudience(e.target.value)}
                              className="w-full h-9 px-2.5 text-sm rounded-lg border border-border bg-white dark:bg-background text-foreground"
                            >
                              <option value="everyone">Everyone</option>
                              <option value="students">Students</option>
                              <option value="professionals">Professionals</option>
                              <option value="writers">Writers / Bloggers</option>
                              <option value="teachers">Teachers / Educators</option>
                              <option value="non-native speakers">Non-native Speakers</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium mb-1 text-purple-700 dark:text-purple-300">Extra Context <span className="font-normal text-muted-foreground">(optional)</span></label>
                          <Input
                            value={seoAiExtraContext}
                            onChange={(e) => setSeoAiExtraContext(e.target.value)}
                            placeholder="Supports formal Tamil, works offline, fast…"
                            className="text-sm bg-white dark:bg-background"
                          />
                        </div>

                        {(!seoUrlSlug || !seoLanguageCode) && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            Fill in URL Slug and Language first
                          </div>
                        )}

                        <Button
                          onClick={handleSeoAiGenerate}
                          disabled={seoAiGenerating || !seoUrlSlug || !seoLanguageCode}
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
                        >
                          {seoAiGenerating ? (
                            <>
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                              Generating…
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4 shrink-0" />
                              Generate SEO Content with AI
                            </>
                          )}
                        </Button>

                        {/* Variant switcher */}
                        {seoAiResult && (
                          <div className="pt-3 border-t border-purple-200 dark:border-purple-800 space-y-2">
                            <p className="text-xs font-medium text-purple-700 dark:text-purple-300">Generated Variants</p>
                            <div className="grid grid-cols-2 gap-2">
                              {seoAiResult.variants.map((v, i) => (
                                <button
                                  key={i}
                                  onClick={() => applySeoAiVariant(i)}
                                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                                    seoAiVariantIdx === i
                                      ? "bg-purple-600 text-white border-purple-600"
                                      : "bg-white dark:bg-background border-border text-foreground hover:border-purple-400"
                                  }`}
                                >
                                  {i === 0
                                    ? <><Star className="w-3 h-3 shrink-0" /> Variant 1</>
                                    : <><Zap className="w-3 h-3 shrink-0" /> Variant 2</>
                                  }
                                  {seoAiVariantIdx === i && <CheckCircle className="w-3 h-3 shrink-0 ml-auto" />}
                                </button>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground">Click to apply — you can still edit after.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="seo-active"
                        checked={seoActive}
                        onChange={(e) => setSeoActive(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <label htmlFor="seo-active" className="text-sm font-medium">
                        Active (page will be publicly accessible)
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        onClick={async () => {
                          if (!seoUrlSlug || !seoLanguageCode || !seoTitle) {
                            toast.error("Please fill in URL slug, language, and title");
                            return;
                          }

                          const db = getFirebaseDb();
                          if (!db) {
                            toast.error("Database not available");
                            return;
                          }

                          setSeoSaving(true);
                          try {
                            let finalUrlSlug = seoUrlSlug;
                            
                            // Auto-increment URL slug if already exists (for new pages only)
                            if (!seoEditingId) {
                              let existingDoc = await getDoc(doc(db, "seoPages", finalUrlSlug));
                              let counter = 1;
                              
                              while (existingDoc.exists()) {
                                finalUrlSlug = `${seoUrlSlug}${counter}`;
                                existingDoc = await getDoc(doc(db, "seoPages", finalUrlSlug));
                                counter++;
                              }
                              
                              // Show info if URL was auto-incremented
                              if (finalUrlSlug !== seoUrlSlug) {
                                toast.info(`URL slug changed to "${finalUrlSlug}" (original was taken)`);
                              }
                            }

                            const langName = allLanguages.find(l => l.code === seoLanguageCode)?.name || seoLanguageCode;
                            const pageData = {
                              urlSlug: finalUrlSlug,
                              languageCode: seoLanguageCode,
                              languageName: langName,
                              title: seoTitle,
                              metaDescription: seoMetaDescription,
                              keywords: seoKeywords,
                              h1: seoH1,
                              description: seoDescription,
                              active: seoActive,
                              updatedAt: new Date().toISOString(),
                              ...(seoEditingId ? {} : { createdAt: new Date().toISOString() }),
                            };

                            await setDoc(doc(db, "seoPages", seoEditingId || finalUrlSlug), pageData);
                            toast.success(seoEditingId ? "SEO page updated!" : "SEO page created!");

                            // Reload list
                            const snapshot = await getDocs(collection(db, "seoPages"));
                            const pages = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
                            setSeoPages(pages);

                            // Reset form
                            setSeoEditingId(null);
                            setSeoUrlSlug("");
                            setSeoLanguageCode("");
                            setSeoTitle("");
                            setSeoMetaDescription("");
                            setSeoKeywords("");
                            setSeoH1("");
                            setSeoDescription("");
                            setSeoActive(true);
                            setSeoAiResult(null);
                            setSeoAiKeywords("");
                            setSeoAiExtraContext("");
                          } catch (error) {
                            console.error("Failed to save SEO page:", error);
                            toast.error("Failed to save SEO page");
                          } finally {
                            setSeoSaving(false);
                          }
                        }}
                        disabled={seoSaving || !seoUrlSlug || !seoLanguageCode || !seoTitle || slugAlreadyExists}
                        className="flex-1"
                      >
                        {seoSaving ? "Saving..." : seoEditingId ? "Update Page" : "Create Page"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSeoOgPreviewOpen((v) => !v)}
                        title="Toggle SERP / OG preview"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSeoJsonLdOpen((v) => !v)}
                        title="Generate JSON-LD schema"
                      >
                        {"{ }"}
                      </Button>
                      {seoEditingId && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSeoEditingId(null);
                            setSeoUrlSlug("");
                            setSeoLanguageCode("");
                            setSeoTitle("");
                            setSeoMetaDescription("");
                            setSeoKeywords("");
                            setSeoH1("");
                            setSeoDescription("");
                            setSeoActive(true);
                            setSeoAiResult(null);
                            setSeoAiKeywords("");
                            setSeoAiExtraContext("");
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* ── Right: Preview panels + List ── */}
                  <div className="space-y-4">

                  {/* OG / SERP Preview */}
                  {seoOgPreviewOpen && (
                    <div className="bg-card rounded-xl border border-border p-5 space-y-3">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Eye className="w-4 h-4" /> SERP & OG Preview
                      </h3>
                      <OgPreview title={seoTitle} metaDescription={seoMetaDescription} slug={seoUrlSlug} />
                    </div>
                  )}

                  {/* JSON-LD Panel */}
                  {seoJsonLdOpen && (
                    <div className="bg-card rounded-xl border border-border p-5">
                      <JsonLdPanel
                        title={seoTitle}
                        slug={seoUrlSlug}
                        description={seoDescription}
                        faqItems={seoAiResult?.faqItems}
                      />
                    </div>
                  )}

                  {/* List */}
                  <div className="bg-card rounded-xl border border-border p-5 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <h3 className="text-sm font-semibold text-foreground">
                        SEO Pages <span className="text-muted-foreground font-normal">({seoPages.length})</span>
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={async () => {
                          const db = getFirebaseDb();
                          if (!db) return;
                          setSeoLoading(true);
                          try {
                            const snapshot = await getDocs(collection(db, "seoPages"));
                            const pages = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
                            setSeoPages(pages);
                            setSeoPage(1);
                          } catch (error) {
                            console.error("Failed to load SEO pages:", error);
                            toast.error("Failed to load SEO pages");
                          } finally {
                            setSeoLoading(false);
                          }
                        }}
                      >
                        {seoLoading ? "Loading..." : "Refresh"}
                      </Button>
                    </div>

                    {/* Search */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <Input
                        className="pl-9 text-sm"
                        placeholder="Search by language name, code, or slug…"
                        value={seoSearch}
                        onChange={e => { setSeoSearch(e.target.value); setSeoPage(1); }}
                      />
                    </div>

                    {(() => {
                      const filtered = [...seoPages]
                        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                        .filter(page => {
                          const q = seoSearch.toLowerCase();
                          return (
                            !q ||
                            page.languageName?.toLowerCase().includes(q) ||
                            page.languageCode?.toLowerCase().includes(q) ||
                            (page.urlSlug || page.languageCode)?.toLowerCase().includes(q) ||
                            page.title?.toLowerCase().includes(q)
                          );
                        });
                      const totalPages = Math.max(1, Math.ceil(filtered.length / SEO_PAGE_SIZE));
                      const paginated = filtered.slice((seoPage - 1) * SEO_PAGE_SIZE, seoPage * SEO_PAGE_SIZE);

                      return (
                        <>
                          {/* Results info */}
                          {seoSearch && (
                            <p className="text-xs text-muted-foreground mb-3">
                              {filtered.length} result{filtered.length !== 1 ? "s" : ""} for “{seoSearch}”
                            </p>
                          )}

                          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                            {paginated.length > 0 ? (
                              paginated.map(page => (
                                <div
                                  key={page.id}
                                  className="p-4 rounded-lg border border-border hover:border-accent/50 transition-colors"
                                >
                                  {/* Top row: name + badge + actions */}
                                  <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                        <h4 className="font-medium text-foreground text-sm truncate">
                                          {page.languageName}
                                        </h4>
                                        <Badge variant={page.active ? "default" : "secondary"} className="text-xs shrink-0">
                                          {page.active ? "Active" : "Inactive"}
                                        </Badge>
                                      </div>
                                      <p className="text-xs text-muted-foreground font-mono truncate">
                                        /{page.urlSlug || page.languageCode}
                                      </p>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                      <Button
                                        variant="ghost" size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={() => window.open(`/${page.urlSlug || page.languageCode}`, '_blank')}
                                        title="Open in new tab"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost" size="sm"
                                        className="h-7 w-7 p-0"
                                        title="Edit"
                                        onClick={() => {
                                          setSeoEditingId(page.id);
                                          setSeoUrlSlug(page.urlSlug || page.languageCode);
                                          setSeoLanguageCode(page.languageCode);
                                          setSeoTitle(page.title);
                                          setSeoMetaDescription(page.metaDescription);
                                          setSeoKeywords(page.keywords);
                                          setSeoH1(page.h1);
                                          setSeoDescription(page.description);
                                          setSeoActive(page.active);
                                        }}
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost" size="sm"
                                        className="h-7 w-7 p-0"
                                        title="Delete"
                                        onClick={async () => {
                                          if (!confirm(`Delete SEO page for ${page.languageName}?`)) return;
                                          const db = getFirebaseDb();
                                          if (!db) return;
                                          try {
                                            await deleteDoc(doc(db, "seoPages", page.id));
                                            setSeoPages(prev => prev.filter(p => p.id !== page.id));
                                            toast.success("SEO page deleted");
                                          } catch (error) {
                                            console.error("Failed to delete SEO page:", error);
                                            toast.error("Failed to delete");
                                          }
                                        }}
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                      </Button>
                                    </div>
                                  </div>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {page.metaDescription}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <div className="text-center py-12">
                                <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                                <p className="text-sm text-muted-foreground">
                                  {seoSearch ? `No pages match "${seoSearch}"` : "No SEO pages yet. Create your first one!"}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Pagination */}
                          {totalPages > 1 && (
                            <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
                              <p className="text-xs text-muted-foreground">
                                {(seoPage - 1) * SEO_PAGE_SIZE + 1}–{Math.min(seoPage * SEO_PAGE_SIZE, filtered.length)} of {filtered.length}
                              </p>
                              <div className="flex items-center gap-1 flex-wrap">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSeoPage(1)}
                                  disabled={seoPage === 1}
                                >
                                  «
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSeoPage(p => Math.max(1, p - 1))}
                                  disabled={seoPage === 1}
                                >
                                  ‹
                                </Button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                  .filter(p => p === 1 || p === totalPages || Math.abs(p - seoPage) <= 2)
                                  .reduce<(number | "...")[]>((acc, p, i, arr) => {
                                    if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("...");
                                    acc.push(p);
                                    return acc;
                                  }, [])
                                  .map((p, i) =>
                                    p === "..." ? (
                                      <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-sm">…</span>
                                    ) : (
                                      <Button
                                        key={p}
                                        variant={seoPage === p ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setSeoPage(p as number)}
                                        className="min-w-[32px]"
                                      >
                                        {p}
                                      </Button>
                                    )
                                  )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSeoPage(p => Math.min(totalPages, p + 1))}
                                  disabled={seoPage === totalPages}
                                >
                                  ›
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSeoPage(totalPages)}
                                  disabled={seoPage === totalPages}
                                >
                                  »
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                        <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">
                          💡 SEO Benefits:
                        </p>
                        <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                          <li>• Unique URLs for each language improve search rankings</li>
                          <li>• Pre-selected language improves user experience</li>
                          <li>• Auto-updates sitemap at /api/sitemap.xml</li>
                          <li>• Captures language-specific search queries</li>
                        </ul>
                      </div>
                    </div>
                  </div>{/* end List card */}
                  </div>{/* end right column wrapper */}
                </div>{/* end 2-col grid */}

                {/* AI Generated FAQ & Suggestions — shown after generation */}
                {seoAiResult && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* FAQ Items */}
                    <div className="bg-card rounded-xl border border-purple-300/50 dark:border-purple-700/40 p-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                          <span>❓</span> AI-Generated FAQ
                        </h3>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {seoAiResult.faqItems?.length || 0} items
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Add these FAQ items to your page to boost rich results in Google Search. Copy and use them in your page's FAQ schema or description.
                      </p>
                      <div className="space-y-3">
                        {seoAiResult.faqItems?.map((item, i) => (
                          <div key={i} className="bg-muted/40 rounded-lg p-3 space-y-1">
                            <p className="text-sm font-medium text-foreground">Q: {item.q}</p>
                            <p className="text-xs text-muted-foreground">A: {item.a}</p>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          const text = seoAiResult.faqItems?.map(f => `Q: ${f.q}\nA: ${f.a}`).join("\n\n") || "";
                          navigator.clipboard.writeText(text);
                          toast.success("FAQs copied to clipboard");
                        }}
                        className="w-full mt-2 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                      >
                        📋 Copy All FAQs
                      </button>
                    </div>

                    {/* Suggested Internal Links + Full Content Preview */}
                    <div className="space-y-4">
                      {seoAiResult.suggestedInternalLinks?.length ? (
                        <div className="bg-card rounded-xl border border-purple-300/50 dark:border-purple-700/40 p-5 space-y-3">
                          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                            <span>🔗</span> Suggested Internal Links
                          </h3>
                          <p className="text-xs text-muted-foreground">Link to these related pages from the current page to improve site structure and SEO.</p>
                          <div className="space-y-2">
                            {seoAiResult.suggestedInternalLinks.map((slug, i) => (
                              <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                                <span className="text-xs text-blue-600 dark:text-blue-400 font-mono">correctnow.app/{slug}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Content Preview for both variants */}
                      <div className="bg-card rounded-xl border border-purple-300/50 dark:border-purple-700/40 p-5 space-y-3">
                        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                          <span>👁</span> Content Preview
                        </h3>
                        <div className="flex gap-2 mb-3">
                          {seoAiResult.variants.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setSeoAiVariantIdx(i)}
                              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                                seoAiVariantIdx === i
                                  ? "bg-purple-600 text-white border-purple-600"
                                  : "border-border hover:border-purple-400"
                              }`}
                            >
                              Variant {i + 1}
                            </button>
                          ))}
                        </div>
                        {seoAiResult.variants[seoAiVariantIdx] && (
                          <div className="space-y-2 text-sm">
                            <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Title</p>
                              <p className="font-semibold">{seoAiResult.variants[seoAiVariantIdx].title}</p>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">H1</p>
                              <p className="font-semibold text-lg">{seoAiResult.variants[seoAiVariantIdx].h1}</p>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Meta Description</p>
                              <p className="text-muted-foreground">{seoAiResult.variants[seoAiVariantIdx].metaDescription}</p>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Page Description</p>
                              <p className="text-muted-foreground whitespace-pre-line">{seoAiResult.variants[seoAiVariantIdx].description}</p>
                            </div>
                            <Button
                              onClick={() => applySeoAiVariant(seoAiVariantIdx)}
                              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                            >
                              ✓ Apply Variant {seoAiVariantIdx + 1} to Form
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Google Indexing API */}
                <div className="bg-card rounded-xl border border-border p-6 space-y-5">
                  <div>
                    <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                      <Globe className="w-4 h-4 text-blue-500" />
                      Google Indexing API
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">Submit up to 200 URLs per day directly to Google for fast indexing. Requires a Google Cloud service account with Search Console owner access.</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Service Account JSON */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground block">Service Account JSON</label>
                      <p className="text-xs text-muted-foreground">Paste your downloaded service account key JSON here. It is saved only in your browser (localStorage).</p>
                      <textarea
                        value={indexingServiceJson}
                        onChange={e => {
                          setIndexingServiceJson(e.target.value);
                          try { localStorage.setItem("gIndexServiceJson", e.target.value); } catch {}
                        }}
                        rows={8}
                        placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  "private_key": "...",\n  "client_email": "...@....gserviceaccount.com"\n}'}
                        className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                      />
                      {indexingServiceJson && (() => {
                        try {
                          const sa = JSON.parse(indexingServiceJson);
                          return sa.client_email ? (
                            <p className="text-xs text-green-600 dark:text-green-400">✓ Valid JSON — {sa.client_email}</p>
                          ) : <p className="text-xs text-red-500">⚠ Missing client_email field</p>;
                        } catch {
                          return <p className="text-xs text-red-500">⚠ Invalid JSON</p>;
                        }
                      })()}
                      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-1">
                        <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Setup steps:</p>
                        <ol className="text-xs text-blue-600 dark:text-blue-400 space-y-0.5 list-decimal list-inside">
                          <li>Google Cloud Console → APIs &amp; Services → Enable "Indexing API"</li>
                          <li>Credentials → Create Service Account → Download JSON key</li>
                          <li>Search Console → Settings → Users → Add service account email as Owner</li>
                        </ol>
                      </div>
                    </div>

                    {/* URLs */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-foreground">URLs to Submit</label>
                        <button
                          onClick={() => {
                            const urls = seoPages
                              .filter(p => p.active)
                              .map(p => `https://correctnow.app/${p.urlSlug || p.languageCode}`)
                              .join("\n");
                            setIndexingUrlsText(urls);
                          }}
                          className="text-xs text-primary hover:underline"
                        >
                          Load all active SEO pages
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">One full URL per line. Max 200 per submission.</p>
                      <textarea
                        value={indexingUrlsText}
                        onChange={e => setIndexingUrlsText(e.target.value)}
                        rows={8}
                        placeholder="https://correctnow.app/tamil-grammar\nhttps://correctnow.app/hindi-grammar\nhttps://correctnow.app/"
                        className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                      />
                      {(() => {
                        const urls = indexingUrlsText.split("\n").map(u => u.trim()).filter(Boolean);
                        return urls.length > 0 && (
                          <p className="text-xs text-muted-foreground">{urls.length} URL{urls.length > 1 ? "s" : ""} detected{urls.length > 200 ? " (first 200 will be submitted)" : ""}</p>
                        );
                      })()}
                      <Button
                        onClick={async () => {
                          const urls = indexingUrlsText.split("\n").map(u => u.trim()).filter(u => u.startsWith("http"));
                          if (!indexingServiceJson) { toast.error("Paste your service account JSON first"); return; }
                          if (!urls.length) { toast.error("Enter at least one URL"); return; }
                          let sa;
                          try { sa = JSON.parse(indexingServiceJson); } catch { toast.error("Invalid service account JSON"); return; }
                          if (!sa.client_email || !sa.private_key) { toast.error("Service account JSON is missing client_email or private_key"); return; }
                          setIndexingLoading(true);
                          setIndexingResults([]);
                          try {
                            const res = await fetch("/api/google-index", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ serviceAccountJson: indexingServiceJson, urls }),
                            });
                            const data = await res.json();
                            if (!res.ok) { toast.error(data.error || "Submission failed"); return; }
                            setIndexingResults(data.results || []);
                            const ok = (data.results || []).filter((r: { ok: boolean }) => r.ok).length;
                            toast.success(`Submitted ${ok} of ${data.results.length} URLs to Google`);
                          } catch (err: unknown) {
                            toast.error((err instanceof Error ? err.message : String(err)) || "Request failed");
                          } finally {
                            setIndexingLoading(false);
                          }
                        }}
                        disabled={indexingLoading}
                        className="w-full"
                      >
                        {indexingLoading ? "Submitting…" : "Submit to Google"}
                      </Button>
                    </div>
                  </div>

                  {/* Results */}
                  {indexingResults.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">Results</p>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {indexingResults.filter(r => r.ok).length} success / {indexingResults.filter(r => !r.ok).length} failed
                          </span>
                          <button
                            onClick={async () => {
                              if (!indexingServiceJson) return;
                              const urls = indexingResults.map(r => r.url);
                              setIndexingStatusLoading(true);
                              try {
                                const res = await fetch("/api/google-index-status", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ serviceAccountJson: indexingServiceJson, urls }),
                                });
                                const data = await res.json();
                                if (!res.ok) { toast.error(data.error || "Status check failed"); return; }
                                // Merge notifyTime into existing results
                                const statusMap = Object.fromEntries((data.results || []).map((r: { url: string; notifyTime?: string | null; type?: string | null; error?: string }) => [r.url, r]));
                                setIndexingResults(prev => prev.map(r => ({
                                  ...r,
                                  notifyTime: statusMap[r.url]?.notifyTime ?? r.notifyTime,
                                  type: statusMap[r.url]?.type ?? r.type,
                                  error: statusMap[r.url]?.error ?? r.error,
                                })));
                                const confirmed = (data.results || []).filter((r: { notifyTime?: string | null }) => r.notifyTime).length;
                                toast.success(`${confirmed} of ${urls.length} URLs confirmed received by Google`);
                              } catch (err: unknown) {
                                toast.error((err instanceof Error ? err.message : String(err)) || "Status check failed");
                              } finally {
                                setIndexingStatusLoading(false);
                              }
                            }}
                            disabled={indexingStatusLoading}
                            className="text-xs px-2 py-1 rounded border border-border bg-background hover:bg-muted text-foreground disabled:opacity-50"
                          >
                            {indexingStatusLoading ? "Checking…" : "Check Status"}
                          </button>
                        </div>
                      </div>
                      <div className="max-h-72 overflow-y-auto space-y-1 rounded-lg border border-border p-3 bg-muted/30">
                        {indexingResults.map((r, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs py-0.5">
                            <span className={r.ok ? "text-green-500 mt-0.5" : "text-red-500 mt-0.5"}>{r.ok ? "✓" : "✗"}</span>
                            <span className="font-mono text-foreground flex-1 truncate">{r.url}</span>
                            <div className="shrink-0 text-right space-y-0.5">
                              {r.message && <span className={r.ok ? "text-muted-foreground" : "text-red-500"}>{r.message}</span>}
                              {r.notifyTime ? (
                                <span className="block text-green-600 dark:text-green-400">
                                  ✓ Confirmed {new Date(r.notifyTime).toLocaleString()}
                                </span>
                              ) : r.notifyTime === null ? (
                                <span className="block text-amber-500">Not yet received by Google</span>
                              ) : null}
                              {r.error && <span className="block text-red-500">{r.error}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        "Submitted" = request sent. Click <strong>Check Status</strong> to confirm Google has received it. Actual indexing may take hours to days.
                      </p>
                    </div>
                  )}
                </div>

                {/* Bulk Create Dialog */}
                <Dialog open={bulkSeoDialogOpen} onOpenChange={setBulkSeoDialogOpen}>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Bulk Create SEO Pages</DialogTitle>
                      <DialogDescription>
                        Pick one language, then enter multiple URL slugs — one per line. A separate SEO page will be created for each slug.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5">

                      {/* Step 1 – Language picker */}
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold">Step 1 — Select Language</label>
                        {/* Search */}
                        <Input
                          placeholder="Search language…"
                          value={bulkLangSearch}
                          onChange={e => setBulkLangSearch(e.target.value)}
                          className="text-sm"
                        />
                        <div className="border border-border rounded-lg max-h-48 overflow-y-auto divide-y divide-border">
                          {allLanguages
                            .filter(l => l.code !== "auto")
                            .filter(l =>
                              bulkLangSearch === "" ||
                              l.name.toLowerCase().includes(bulkLangSearch.toLowerCase()) ||
                              l.code.toLowerCase().includes(bulkLangSearch.toLowerCase())
                            )
                            .map(l => (
                              <div
                                key={l.code}
                                onClick={() => setBulkLangCode(l.code)}
                                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                                  bulkLangCode === l.code
                                    ? "bg-primary/10 text-primary"
                                    : "hover:bg-muted/60"
                                }`}
                              >
                                <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                                  bulkLangCode === l.code ? "border-primary bg-primary" : "border-border"
                                }`} />
                                <span className="text-sm flex-1">{l.name}</span>
                                <span className="text-xs text-muted-foreground font-mono">{l.code}</span>
                              </div>
                            ))}
                          {allLanguages.filter(l => l.code !== "auto" && (
                            bulkLangSearch === "" ||
                            l.name.toLowerCase().includes(bulkLangSearch.toLowerCase()) ||
                            l.code.toLowerCase().includes(bulkLangSearch.toLowerCase())
                          )).length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">No languages found</p>
                          )}
                        </div>
                        {bulkLangCode && (
                          <p className="text-xs text-green-600 dark:text-green-400">
                            Selected: <span className="font-semibold">{allLanguages.find(l => l.code === bulkLangCode)?.name}</span> ({bulkLangCode})
                          </p>
                        )}
                      </div>

                      {/* Step 2 – Slugs */}
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold">Step 2 — Enter URL Slugs (one per line)</label>
                        <p className="text-xs text-muted-foreground">
                          Each slug becomes a unique page at <span className="font-mono">correctnow.app/your-slug</span>. Use only lowercase letters, numbers and hyphens.
                        </p>
                        <textarea
                          value={bulkSlugsText}
                          onChange={e => setBulkSlugsText(e.target.value)}
                          placeholder={`tamil-grammar-checker\nbest-tamil-spell-check\ntamil-proofreading-tool\nonline-tamil-grammar`}
                          rows={7}
                          className="w-full font-mono text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                        />
                        {(() => {
                          const slugs = bulkSlugsText
                            .split("\n")
                            .map(s => s.trim().toLowerCase().replace(/[^a-z0-9-]/g, ""))
                            .filter(Boolean);
                          return slugs.length > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {slugs.length} slug{slugs.length > 1 ? "s" : ""} detected —{" "}
                              {slugs.map(s => (
                                <span key={s} className="font-mono text-foreground bg-muted px-1 rounded mr-1">/{s}</span>
                              ))}
                            </p>
                          ) : null;
                        })()}
                      </div>
                    </div>

                    <DialogFooter className="mt-2">
                      <Button
                        variant="outline"
                        onClick={() => setBulkSeoDialogOpen(false)}
                        disabled={bulkSeoCreating}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={async () => {
                          if (!bulkLangCode) {
                            toast.error("Please select a language");
                            return;
                          }
                          const slugs = bulkSlugsText
                            .split("\n")
                            .map(s => s.trim().toLowerCase().replace(/[^a-z0-9-]/g, ""))
                            .filter(Boolean);
                          if (slugs.length === 0) {
                            toast.error("Please enter at least one URL slug");
                            return;
                          }

                          const db = getFirebaseDb();
                          if (!db) { toast.error("Database not available"); return; }

                          const lang = allLanguages.find(l => l.code === bulkLangCode);
                          if (!lang) return;

                          setBulkSeoCreating(true);
                          try {
                            let created = 0;
                            const autoRenamed: string[] = [];

                            for (const slug of slugs) {
                              // Find a free slug — try original, then slug1, slug2, …
                              let finalSlug = slug;
                              let attempt = 1;
                              while ((await getDoc(doc(db, "seoPages", finalSlug))).exists()) {
                                finalSlug = `${slug}${attempt}`;
                                attempt++;
                              }
                              if (finalSlug !== slug) {
                                autoRenamed.push(`${slug} → ${finalSlug}`);
                              }
                              // Build slug-based unique title/h1 for each page
                              const slugTitle = finalSlug
                                .split("-")
                                .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                                .join(" ");
                              await setDoc(doc(db, "seoPages", finalSlug), {
                                urlSlug: finalSlug,
                                languageCode: lang.code,
                                languageName: lang.name,
                                title: `${slugTitle} - CorrectNow`,
                                metaDescription: `Free online ${slugTitle} tool. Check your ${lang.name} text for spelling, grammar, and style mistakes instantly.`,
                                keywords: `${slugTitle.toLowerCase()}, ${lang.name} grammar checker, ${lang.name} spell check, ${lang.name} proofreading, online grammar check, ${lang.code} grammar`,
                                h1: slugTitle,
                                description: `Free online ${slugTitle} tool. Check your ${lang.name} text for spelling, grammar, and style mistakes instantly.`,
                                active: true,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                              });
                              created++;
                            }

                            const snapshot = await getDocs(collection(db, "seoPages"));
                            setSeoPages(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)));

                            if (autoRenamed.length > 0) {
                              toast.success(`Created ${created} page(s) for ${lang.name}. Auto-renamed: ${autoRenamed.join(", ")}`);
                            } else {
                              toast.success(`Created ${created} SEO page(s) for ${lang.name}`);
                            }
                            setBulkSeoDialogOpen(false);
                            setBulkLangCode("");
                            setBulkSlugsText("");
                          } catch (error) {
                            console.error("Failed to bulk create SEO pages:", error);
                            toast.error("Failed to create SEO pages");
                          } finally {
                            setBulkSeoCreating(false);
                          }
                        }}
                        disabled={bulkSeoCreating || !bulkLangCode || !bulkSlugsText.trim()}
                      >
                        {bulkSeoCreating ? "Creating…" : `Create Pages`}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {activeTab === "auditlog" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Audit Log</h1>
                    <p className="text-gray-500 text-sm mt-0.5">All admin actions in this session</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={clearAuditLog}>Clear log</Button>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <AuditTimeline entries={auditEntries} />
                </div>
              </div>
            )}

            {activeTab === "settings" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Settings</h1>
                  <p className="text-gray-500 text-sm mt-0.5">Platform configuration and preferences</p>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Rate Limits</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[
                      { label: "Free Plan — Words/Check", value: "200" },
                      { label: "Free Plan — Monthly Words", value: "Limited" },
                      { label: "Pro Plan — Words/Check", value: "5,000" },
                      { label: "Pro Plan — Monthly Words", value: "25,000" },
                    ].map(row => (
                      <div key={row.label} className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
                        <p className="text-xs text-gray-500 mb-1">{row.label}</p>
                        <p className="text-sm font-semibold text-gray-900">{row.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Admin user creation */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h2 className="text-base font-semibold text-gray-900 mb-1">Create Admin Account</h2>
                  <p className="text-sm text-gray-400 mb-4">Grant admin access to another email address</p>
                  <div className="space-y-3 max-w-md">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                      <Input
                        type="email"
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        placeholder="admin@example.com"
                        className="border-gray-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                      <Input
                        type="password"
                        value={newAdminPassword}
                        onChange={(e) => setNewAdminPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="border-gray-200"
                      />
                    </div>
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                      onClick={handleCreateAdmin}
                      disabled={creatingAdmin}
                    >
                      {creatingAdmin ? "Creating..." : "Create Admin"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
        </main>
      </div>

      {/* Plan Grant Duration Dialog */}
        <Dialog open={!!planGrantDialogUser} onOpenChange={(open) => { if (!open) setPlanGrantDialogUser(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Grant Pro Plan</DialogTitle>
              <DialogDescription>
                Select how long to grant Pro access for <strong>{planGrantDialogUser?.name || planGrantDialogUser?.email}</strong>. The plan will automatically expire after the selected period.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-3 py-2">
              {([30, 90, 365] as const).map((days) => {
                const label = days === 30 ? "30 Days" : days === 90 ? "3 Months" : "1 Year";
                const sub = days === 30 ? "~1 month" : days === 90 ? "~quarter" : "annual";
                return (
                  <button
                    key={days}
                    onClick={() => setPlanGrantDays(days)}
                    className={`flex flex-col items-center justify-center rounded-lg border-2 p-3 transition-colors ${
                      planGrantDays === days
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50 text-foreground"
                    }`}
                  >
                    <span className="font-semibold text-sm">{label}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">{sub}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Expires: <strong>{(() => {
                const d = new Date();
                d.setDate(d.getDate() + planGrantDays);
                return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
              })()}</strong>
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPlanGrantDialogUser(null)}>Cancel</Button>
              <Button onClick={handleConfirmPlanGrant}>Grant Pro</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                {userToDelete 
                  ? "Are you sure you want to delete this user? This action cannot be undone."
                  : `Are you sure you want to delete ${selectedUsers.size} selected user(s)? This action cannot be undone.`
                }
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setUserToDelete(null);
                }}
                disabled={isDeletingUsers}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (userToDelete) {
                    handleDeleteUser(userToDelete);
                  } else {
                    handleDeleteSelectedUsers();
                  }
                }}
                disabled={isDeletingUsers}
              >
                {isDeletingUsers ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      <BulkReasonDialog
        open={bulkReasonOpen}
        title={pendingBulkTitle}
        description={pendingBulkDesc}
        destructive={pendingBulkDestructive}
        onConfirm={async (note) => {
          setBulkReasonOpen(false);
          if (pendingBulkFn) await pendingBulkFn(note);
          setPendingBulkFn(null);
        }}
        onCancel={() => {
          setBulkReasonOpen(false);
          setPendingBulkFn(null);
        }}
      />
    </div>
  );
};

export default Admin;
