import { useEffect, useMemo, useRef, useState } from "react";
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
import { signInWithEmailAndPassword } from "firebase/auth";
import { useAuthState } from "react-firebase-hooks/auth";
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
  razorpaySubscriptionId?: string;
  stripeSubscriptionId?: string;
  updatedAt?: string;
  createdAt?: string;
  status?: string;
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

const Admin = () => {
  const auth = getFirebaseAuth();
  const [user, loading] = useAuthState(auth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState<
    "overview" | "users" | "suggestions" | "checks" | "billing" | "blog" | "seo" | "languages" | "settings"
  >("overview");
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

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [couponPercent, setCouponPercent] = useState("");
  const [couponExpiry, setCouponExpiry] = useState("");
  const [couponMaxUsage, setCouponMaxUsage] = useState("");
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [billingSearch, setBillingSearch] = useState("");

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
  const [bulkLangCode, setBulkLangCode] = useState("");
  const [bulkLangSearch, setBulkLangSearch] = useState("");
  const [bulkSlugsText, setBulkSlugsText] = useState("");

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
    language: string;
    wordCount: number;
    suggestionsCount: number;
    suggestions?: Array<any>;
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
  const [creditsValue, setCreditsValue] = useState("50000");
  const [reactivatingUserId, setReactivatingUserId] = useState<string | null>(null);
  
  // Addon credits management
  const [addingCreditsUserId, setAddingCreditsUserId] = useState<string | null>(null);
  const [addonCreditsAmount, setAddonCreditsAmount] = useState("");

  // Plan toggle management
  const [togglingPlanUserId, setTogglingPlanUserId] = useState<string | null>(null);
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

    // Add UTF-8 BOM for proper Excel compatibility
    const BOM = "\uFEFF";
    const csvWithBOM = BOM + csvContent;

    // Create blob and download
    const blob = new Blob([csvWithBOM], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().split('T')[0];
    
    link.setAttribute("href", url);
    link.setAttribute("download", `correctnow-billing-${timestamp}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setSelectedUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
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
      blogEditorRef.current.innerHTML = blogContentHtml;
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
          language: d.data().language || "auto",
          wordCount: d.data().wordCount || 0,
          suggestionsCount: d.data().suggestionsCount || 0,
          suggestions: d.data().suggestions || [],
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

  const handleTogglePlan = async (userId: string, currentPlan: string) => {
    setTogglingPlanUserId(userId);
    try {
      const response = await fetch("/api/admin/toggle-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to toggle plan");
      }

      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                plan: data.newPlan === "pro" ? "Pro" : "Free",
                wordLimit: data.wordLimit,
                subscriptionStatus: data.subscriptionStatus,
              }
            : u
        )
      );

      toast.success(`User plan changed to ${data.newPlan.toUpperCase()}`);
    } catch (err: any) {
      console.error("Failed to toggle plan", err);
      toast.error(err.message || "Failed to toggle plan");
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
    // Create sample CSV content with timestamp to avoid duplicates
    const timestamp = Date.now();
    const csvContent = `name,email,phone,category,password
John Doe,john${timestamp}@example.com,+919876543210,College,password123
Jane Smith,jane${timestamp}@example.com,+919812345678,Friends,password456
Bob Wilson,bob${timestamp}@example.com,,Uncategorized,password789`;
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'sample_users.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success("Sample CSV downloaded! Edit emails before uploading.");
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
    setCreditsValue(String(userData.credits || 50000));
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

  const handleBulkUpload = async () => {
    // Prevent double-click/double submission
    if (isUploadingBulk) {
      return;
    }

    if (!bulkUploadFile) {
      toast.error("Please select a CSV file");
      return;
    }

    // Validate file type - must be CSV
    const fileName = bulkUploadFile.name.toLowerCase();
    if (!fileName.endsWith('.csv')) {
      toast.error("Please upload a CSV file (.csv), not Excel (.xlsx) or other formats");
      return;
    }

    setIsUploadingBulk(true);
    setBulkUploadProgress(0);
    setBulkUploadResults(null);

    try {
      const text = await bulkUploadFile.text();
      console.log('Raw CSV text:', text); // Debug log
      
      const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
      console.log('Total lines after split:', lines.length); // Debug log
      
      if (lines.length === 0) {
        toast.error("CSV file is empty");
        setBulkUploadResults({ success: 0, failed: 0, errors: ["CSV file is empty"] });
        return;
      }

      // Skip header if it exists (check for common header keywords)
      const firstLine = lines[0].toLowerCase();
      const hasHeader = firstLine.includes('name') || firstLine.includes('email') || firstLine.includes('phone') || firstLine.includes('category') || firstLine.includes('password');
      const startIndex = hasHeader ? 1 : 0;
      const userLines = lines.slice(startIndex);
      
      console.log('Has header:', hasHeader); // Debug log
      console.log('User lines to process:', userLines.length); // Debug log

      if (userLines.length === 0) {
        toast.error("No user data found in CSV");
        setBulkUploadResults({ success: 0, failed: 0, errors: ["No user data found (file only contains header)"] });
        return;
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (let i = 0; i < userLines.length; i++) {
        const line = userLines[i];
        console.log(`Processing line ${i + 1}:`, line); // Debug log
        
        // Split by comma and clean up whitespace and quotes
        const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
        
        console.log('Parts:', parts); // Debug log
        
        if (parts.length < 3) {
          results.failed++;
          results.errors.push(`Line ${i + startIndex + 1}: Invalid format (expected: name,email,password or name,email,phone,category,password) - got ${parts.length} field(s)`);
          continue;
        }

        const [name, email, third, fourth, fifth] = parts;
        const hasFive = parts.length >= 5;
        const hasFour = parts.length >= 4;
        const phone = hasFive || hasFour ? third : "";
        const category = hasFive ? fourth : "";
        const password = hasFive ? fifth : hasFour ? fourth : third;

        if (!name || !email || !password) {
          results.failed++;
          results.errors.push(`Line ${i + startIndex + 1}: Missing required fields (name: "${name}", email: "${email}", password: "${password}")`);
          continue;
        }

        const phoneRegex = /^\+?[0-9\s()\-]{7,20}$/;
        if (phone && !phoneRegex.test(phone)) {
          results.failed++;
          results.errors.push(`Line ${i + startIndex + 1}: Invalid phone number (${phone})`);
          continue;
        }

        try {
          const response = await fetch("/api/admin/create-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, phone: phone || undefined, category: category || undefined, password }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Failed to create user");
          }

          results.success++;
          
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
        } catch (error) {
          results.failed++;
          results.errors.push(`${email}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Update progress
        setBulkUploadProgress(Math.round(((i + 1) / userLines.length) * 100));
      }

      setBulkUploadResults(results);
      
      if (results.success > 0) {
        toast.success(`Successfully created ${results.success} user(s)`);
      }
      if (results.failed > 0) {
        toast.error(`Failed to create ${results.failed} user(s). Check details below.`);
      }
      if (results.success === 0 && results.failed === 0) {
        toast.warning("No users were processed. Check the CSV format.");
      }

      if (results.success > 0 && results.failed === 0) {
        setIsBulkUploadOpen(false);
        setBulkUploadFile(null);
        setBulkUploadProgress(0);
        setBulkUploadResults(null);
      }
    } catch (error) {
      console.error("Bulk upload error:", error);
      toast.error("Failed to process CSV file");
      setBulkUploadResults({ 
        success: 0, 
        failed: 0, 
        errors: [`File processing error: ${error instanceof Error ? error.message : 'Unknown error'}`] 
      });
    } finally {
      setIsUploadingBulk(false);
    }
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
        updates.credits = isNaN(credits) ? 50000 : credits;
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
      resetBlogForm();
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="w-full max-w-md p-8">
          <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
            <div className="flex items-center justify-center mb-8">
              <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-primary/10">
                <CheckCircle className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-center mb-2">Admin Login</h1>
            <p className="text-center text-muted-foreground mb-8">
              Sign in to access the admin panel
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium mb-2">
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-accent hover:text-accent/80"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {loginError && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                  {loginError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loggingIn}
              >
                {loggingIn ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link
                to="/"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container flex items-center justify-between py-3">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center">
              <img
                src="/Icon/correctnow logo final2.png"
                alt="CorrectNow"
                className="h-24 w-auto object-contain"
                loading="eager"
              />
            </Link>
            <Badge variant="secondary">Admin</Badge>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
              <span className="text-sm font-medium text-accent-foreground">A</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="lg:w-64 shrink-0">
            <nav className="space-y-1">
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
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as typeof activeTab)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === item.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground mb-1">Admin Dashboard</h1>
                    <p className="text-muted-foreground">Platform overview — real-time metrics</p>
                  </div>
                  <div className="text-xs text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-full">
                    {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </div>
                </div>

                {/* Primary KPI row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Total Users", value: totalUsers.toLocaleString(), sub: `+${newUsersToday} today`, icon: <Users className="w-5 h-5" />, color: "text-blue-500", bg: "bg-blue-500/10" },
                    { label: "Pro Subscribers", value: proUsers.toLocaleString(), sub: `${conversionRate}% conversion`, icon: <Crown className="w-5 h-5" />, color: "text-yellow-500", bg: "bg-yellow-500/10" },
                    { label: "Free Users", value: freeUsers.toLocaleString(), sub: "Potential upgrades", icon: <Zap className="w-5 h-5" />, color: "text-green-500", bg: "bg-green-500/10" },
                    { label: "Suspended", value: suspendedUsers.toLocaleString(), sub: "Deactivated accounts", icon: <UserX className="w-5 h-5" />, color: "text-red-500", bg: "bg-red-500/10" },
                  ].map(card => (
                    <div key={card.label} className="bg-card rounded-xl border border-border p-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-muted-foreground">{card.label}</span>
                        <div className={`${card.bg} ${card.color} p-2 rounded-lg`}>{card.icon}</div>
                      </div>
                      <p className="text-3xl font-bold text-foreground">{card.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Secondary KPI row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Checks Today", value: checksToday.toLocaleString(), sub: `${totalDocs.toLocaleString()} all time`, icon: <CheckCircle className="w-5 h-5" />, color: "text-purple-500", bg: "bg-purple-500/10" },
                    { label: "Words Today", value: wordsToday >= 1000 ? `${(wordsToday/1000).toFixed(1)}K` : wordsToday.toString(), sub: `${(totalWords/1000).toFixed(0)}K total`, icon: <FileText className="w-5 h-5" />, color: "text-indigo-500", bg: "bg-indigo-500/10" },
                    { label: "Monthly Revenue", value: `₹${monthlyRevenue.toLocaleString("en-IN")}`, sub: "Based on Pro users × ₹500", icon: <TrendingUp className="w-5 h-5" />, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                    { label: "Conversion Rate", value: `${conversionRate}%`, sub: "Free → Pro", icon: <BarChart3 className="w-5 h-5" />, color: "text-orange-500", bg: "bg-orange-500/10" },
                  ].map(card => (
                    <div key={card.label} className="bg-card rounded-xl border border-border p-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-muted-foreground">{card.label}</span>
                        <div className={`${card.bg} ${card.color} p-2 rounded-lg`}>{card.icon}</div>
                      </div>
                      <p className="text-3xl font-bold text-foreground">{card.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                    </div>
                  ))}
                </div>

                {/* User breakdown + Quick stats side-by-side */}
                <div className="grid lg:grid-cols-3 gap-4">

                  {/* User Plan Breakdown */}
                  <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">User Plan Breakdown</h3>
                    <div className="space-y-3">
                      {[
                        { label: "Pro", count: proUsers, color: "bg-yellow-500" },
                        { label: "Free", count: freeUsers, color: "bg-blue-400" },
                        { label: "Suspended", count: suspendedUsers, color: "bg-red-500" },
                      ].map(item => (
                        <div key={item.label}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-muted-foreground">{item.label}</span>
                            <span className="font-medium">{item.count}</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className={`${item.color} h-2 rounded-full transition-all`}
                              style={{ width: `${totalUsers ? Math.round((item.count / totalUsers) * 100) : 0}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {totalUsers ? Math.round((item.count / totalUsers) * 100) : 0}% of total
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Activity Summary */}
                  <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Activity Summary</h3>
                    <div className="space-y-3">
                      {[
                        { label: "New Users Today", value: `+${newUsersToday}`, color: "text-green-500" },
                        { label: "Total Documents", value: totalDocs.toLocaleString(), color: "text-blue-500" },
                        { label: "Total Words Processed", value: `${(totalWords/1000).toFixed(1)}K`, color: "text-purple-500" },
                        { label: "Words Per Check", value: totalDocs ? Math.round(totalWords / totalDocs).toLocaleString() : "—", color: "text-orange-500" },
                        { label: "Avg Credits/User", value: users.length ? Math.round(users.reduce((s,u) => s + (u.credits||0), 0) / users.length).toLocaleString() : "—", color: "text-indigo-500" },
                      ].map(item => (
                        <div key={item.label} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{item.label}</span>
                          <span className={`text-sm font-semibold ${item.color}`}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="bg-card rounded-xl border border-border p-6 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
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
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted/60 transition-colors text-left border border-border"
                        >
                          <span className="text-muted-foreground">{a.icon}</span>
                          {a.label}
                          <ChevronRight className="w-3 h-3 ml-auto text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Daily Activity row */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-foreground">Today at a Glance</h2>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: "New Signups", value: `+${newUsersToday}` },
                      { label: "Checks Run", value: checksToday.toLocaleString() },
                      { label: "Words Checked", value: wordsToday >= 1000 ? `${(wordsToday/1000).toFixed(1)}K` : wordsToday.toString() },
                      { label: "Avg Words/Check", value: checksToday ? Math.round(wordsToday / checksToday).toLocaleString() : "—" },
                    ].map(s => (
                      <div key={s.label} className="bg-muted/30 rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">{s.value}</p>
                        <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
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
                    <div className="bg-card rounded-xl border border-border p-5">
                      <h2 className="text-sm font-semibold text-foreground mb-3">⚡ Smart Insights</h2>
                      <div className="space-y-2">
                        {insights.map((ins, i) => (
                          <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-sm ${
                            ins.type === "warn" ? "bg-red-500/8 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50" :
                            ins.type === "good" ? "bg-emerald-500/8 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50" :
                            "bg-blue-500/8 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50"
                          }`}>
                            <span className="mt-0.5 shrink-0">{ins.type === "warn" ? "⚠️" : ins.type === "good" ? "✅" : "ℹ️"}</span>
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
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground mb-1">
                      Users
                    </h1>
                    <p className="text-muted-foreground">
                      Manage all registered users
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={() => setIsCreateUserOpen(true)}
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Create User
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setIsBulkUploadOpen(true)}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Bulk Upload
                    </Button>
                    {selectedUsers.size > 0 && (
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => setIsDeleteDialogOpen(true)}
                        disabled={isDeletingUsers}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Delete Selected ({selectedUsers.size})
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={exportUsersCsv}>
                      <Download className="w-4 h-4 mr-2" />
                      Export Users
                    </Button>
                  </div>
                </div>

                {/* User Segments */}
                <div className="flex flex-wrap gap-2">
                  {([
                    { label: "All Users", count: users.length, onClick: () => { setPlanFilter("all"); setStatusFilter("all"); setDateFilter("all"); setSearchQuery(""); }, active: planFilter === "all" && statusFilter === "all" && dateFilter === "all" },
                    { label: "Pro", count: proUsers, onClick: () => { setPlanFilter("pro"); setStatusFilter("all"); setDateFilter("all"); }, active: planFilter === "pro" },
                    { label: "Free", count: freeUsers, onClick: () => { setPlanFilter("free"); setStatusFilter("all"); setDateFilter("all"); }, active: planFilter === "free" && statusFilter === "all" },
                    { label: "New This Week", count: users.filter(u => u.createdAt && Date.now() - new Date(u.createdAt).getTime() < 7 * 86400000).length, onClick: () => { setPlanFilter("all"); setStatusFilter("all"); setDateFilter("7days"); }, active: dateFilter === "7days" },
                    { label: "Suspended", count: suspendedUsers, onClick: () => { setPlanFilter("all"); setStatusFilter("deactivated"); setDateFilter("all"); }, active: statusFilter === "deactivated" },
                  ] as { label: string; count: number; onClick: () => void; active: boolean }[]).map(seg => (
                    <button
                      key={seg.label}
                      onClick={seg.onClick}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        seg.active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {seg.label}
                      <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                        seg.active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>{seg.count}</span>
                    </button>
                  ))}
                </div>

                {/* Search & Filter */}
                <div className="bg-card rounded-xl border border-border p-4 space-y-3">
                  <div className="flex flex-wrap gap-3 items-center">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search name, email, phone..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-9"
                      />
                    </div>

                    {/* Category */}
                    <div className="flex items-center gap-1">
                      <Input
                        list="admin-category-filter"
                        placeholder="Category..."
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="h-9 w-36 text-sm"
                      />
                      <datalist id="admin-category-filter">
                        <option value="College" />
                        <option value="Friends" />
                        <option value="Uncategorized" />
                      </datalist>
                    </div>

                    {/* Plan filter */}
                    <select
                      value={planFilter}
                      onChange={(e) => setPlanFilter(e.target.value as "all" | "free" | "pro")}
                      className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground cursor-pointer"
                    >
                      <option value="all">All Plans</option>
                      <option value="pro">Pro Only</option>
                      <option value="free">Free Only</option>
                    </select>

                    {/* Status filter */}
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "deactivated")}
                      className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground cursor-pointer"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="deactivated">Suspended</option>
                    </select>

                    {/* Date filter */}
                    <select
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value as "all" | "7days" | "30days" | "90days")}
                      className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground cursor-pointer"
                    >
                      <option value="all">All Time</option>
                      <option value="7days">Last 7 Days</option>
                      <option value="30days">Last 30 Days</option>
                      <option value="90days">Last 90 Days</option>
                    </select>

                    {/* Sort */}
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "name" | "credits")}
                      className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground cursor-pointer"
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
                        className="h-9 text-muted-foreground hover:text-foreground"
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

                  {/* Stats summary */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1 border-t border-border">
                    <span>
                      Showing <span className="font-semibold text-foreground">{filteredUsers.length}</span> of <span className="font-semibold text-foreground">{users.length}</span> users
                    </span>
                    <span className="flex items-center gap-1"><Crown className="w-3 h-3 text-yellow-500" /> Pro: <span className="font-semibold text-foreground">{filteredUsers.filter(u => u.plan === "Pro").length}</span></span>
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-blue-400" /> Free: <span className="font-semibold text-foreground">{filteredUsers.filter(u => u.plan !== "Pro").length}</span></span>
                    <span className="flex items-center gap-1"><UserX className="w-3 h-3 text-red-500" /> Suspended: <span className="font-semibold text-foreground">{filteredUsers.filter(u => u.status === "deactivated").length}</span></span>
                  </div>
                </div>

                {/* Users Table */}
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="py-4 px-6 text-sm font-medium text-muted-foreground w-12">
                            <input
                              type="checkbox"
                              checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                              onChange={toggleSelectAll}
                              className="w-4 h-4 cursor-pointer"
                            />
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            User
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Phone
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Category
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Plan
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Status
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Credits
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Addon Credits
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Addon Used
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Usage
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Word Limit
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Joined
                          </th>
                          <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((user) => (
                          <tr
                            key={user.id}
                            className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="py-4 px-6">
                              <input
                                type="checkbox"
                                checked={selectedUsers.has(user.id)}
                                onChange={() => toggleSelectUser(user.id)}
                                className="w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                                  <span className="text-xs font-medium text-accent-foreground">
                                    {user.name.charAt(0)}
                                  </span>
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-foreground">
                                    {user.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground mb-1">
                                    {user.email}
                                  </p>
                                  <div className="flex items-center gap-1.5">
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      className="h-7 px-2.5 text-xs border-border/50 hover:bg-accent/10"
                                      onClick={() => handleEditUser(user.id, user)}
                                    >
                                      Edit
                                    </Button>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      className="h-7 px-2.5 text-xs border-border/50 hover:bg-accent/10"
                                      onClick={() => handleAddAddonCredits(user.id, user)}
                                      title="Add Addon Credits"
                                    >
                                      <Coins className="w-3.5 h-3.5 mr-1" />
                                      Credits
                                    </Button>
                                    <Button 
                                      variant={user.plan === "Pro" ? "destructive" : "default"}
                                      size="sm"
                                      className="h-7 px-2.5 text-xs"
                                      onClick={() => handleTogglePlan(user.id, user.plan)}
                                      disabled={togglingPlanUserId === user.id}
                                      title={user.plan === "Pro" ? "Downgrade to Free" : "Upgrade to Pro (Manual - No auto-renewal)"}
                                    >
                                      {togglingPlanUserId === user.id ? "..." : user.plan === "Pro" ? "↓ Free" : "↑ Pro"}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-sm text-muted-foreground">
                              {user.phone || "—"}
                            </td>
                            <td className="py-4 px-6 text-sm text-muted-foreground">
                              {user.category || "—"}
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex flex-col gap-1">
                                <Badge
                                  variant={
                                    user.plan === "Pro"
                                      ? "default"
                                      : user.plan === "Team"
                                      ? "secondary"
                                      : "outline"
                                  }
                                >
                                  {user.plan}
                                </Badge>
                                {user.plan === "Pro" && !user.razorpaySubscriptionId && !user.stripeSubscriptionId && (
                                  <span className="text-[10px] text-muted-foreground italic">Manual Grant</span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <Badge
                                variant={user.status === "deactivated" ? "destructive" : "outline"}
                              >
                                {user.status === "deactivated" ? "Deactivated" : "Active"}
                              </Badge>
                            </td>
                            <td className="py-4 px-6 text-sm text-foreground">
                              {user.credits ? user.credits.toLocaleString() : "—"}
                            </td>
                            <td className="py-4 px-6">
                              {user.addonCredits && user.addonCredits > 0 ? (
                                <div className="flex flex-col">
                                  <span className="text-sm text-foreground font-medium">
                                    {user.addonCredits.toLocaleString()}
                                  </span>
                                  {user.addonCreditsExpiryAt && (
                                    <span className="text-xs text-muted-foreground">
                                      Expires: {new Date(user.addonCreditsExpiryAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-4 px-6 text-sm text-foreground">
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
                            <td className="py-4 px-6 text-sm text-foreground">
                              {user.credits
                                ? `${(user.creditsUsed || 0).toLocaleString()} / ${user.credits.toLocaleString()}`
                                : "—"}
                            </td>
                            <td className="py-4 px-6 text-sm text-foreground">
                              {user.wordLimit ? user.wordLimit.toLocaleString() : "—"}
                            </td>
                            <td className="py-4 px-6 text-sm text-muted-foreground">
                              {user.createdAt
                                ? new Date(user.createdAt).toLocaleDateString()
                                : user.updatedAt
                                ? new Date(user.updatedAt).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setViewingUser(user)}
                                >
                                  <Info className="w-3.5 h-3.5 mr-1" />
                                  View
                                </Button>
                                {user.status === "deactivated" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleReactivateUser(user.id)}
                                    disabled={reactivatingUserId === user.id}
                                  >
                                    {reactivatingUserId === user.id ? "Reactivating..." : "Reactivate"}
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setUserToDelete(user.id);
                                    setIsDeleteDialogOpen(true);
                                  }}
                                  disabled={isDeletingUsers}
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
                </div>

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
                            <option value="College" />
                            <option value="Friends" />
                            <option value="Uncategorized" />
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
                                placeholder="50000"
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
                <Dialog open={isBulkUploadOpen} onOpenChange={setIsBulkUploadOpen}>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Bulk Upload Users</DialogTitle>
                      <DialogDescription>
                        Upload a CSV file (NOT Excel .xlsx) to create multiple users. Format: name,email,password (phone and category optional)
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            CSV Format Requirements:
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={downloadSampleCSV}
                            className="h-7 text-xs"
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Download Sample
                          </Button>
                        </div>
                        <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                          <li>• File must be .csv format (not .xlsx Excel file)</li>
                          <li>• Each line: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">name,email,password</code> (phone and category optional)</li>
                          <li>• Optional header row (will be skipped if detected)</li>
                          <li>• Example: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">John Doe,john@example.com,+919876543210,College,pass123</code></li>
                          <li>• Download sample CSV above, edit it with your users, and upload</li>
                        </ul>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Select CSV File (NOT Excel)
                        </label>
                        <Input
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              // Additional client-side validation
                              if (!file.name.toLowerCase().endsWith('.csv')) {
                                toast.error("Please select a CSV file (.csv), not Excel (.xlsx)");
                                e.target.value = '';
                                return;
                              }
                              setBulkUploadFile(file);
                              setBulkUploadResults(null);
                            }
                          }}
                          disabled={isUploadingBulk}
                        />
                        {bulkUploadFile && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Selected: {bulkUploadFile.name} ({(bulkUploadFile.size / 1024).toFixed(2)} KB)
                          </p>
                        )}
                      </div>

                      {isUploadingBulk && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Processing...</span>
                            <span className="font-medium">{bulkUploadProgress}%</span>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${bulkUploadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {bulkUploadResults && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 border border-green-200 dark:border-green-800">
                              <p className="text-xs text-green-600 dark:text-green-400">Success</p>
                              <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                                {bulkUploadResults.success}
                              </p>
                            </div>
                            <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 border border-red-200 dark:border-red-800">
                              <p className="text-xs text-red-600 dark:text-red-400">Failed</p>
                              <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                                {bulkUploadResults.failed}
                              </p>
                            </div>
                          </div>
                          
                          {bulkUploadResults.errors.length > 0 && (
                            <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 border border-red-200 dark:border-red-800 max-h-40 overflow-y-auto">
                              <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-2">
                                Errors:
                              </p>
                              <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                                {bulkUploadResults.errors.map((error, index) => (
                                  <li key={index}>• {error}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsBulkUploadOpen(false);
                          setBulkUploadFile(null);
                          setBulkUploadProgress(0);
                          setBulkUploadResults(null);
                        }}
                        disabled={isUploadingBulk}
                      >
                        Close
                      </Button>
                      <Button
                        onClick={handleBulkUpload}
                        disabled={!bulkUploadFile || isUploadingBulk || (bulkUploadResults?.success ?? 0) > 0}
                      >
                        {isUploadingBulk ? "Uploading..." : (bulkUploadResults?.success ?? 0) > 0 ? "Uploaded" : "Upload Users"}
                      </Button>
                    </DialogFooter>
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
                    <h1 className="text-2xl font-bold text-foreground mb-1">
                      Suggestions
                    </h1>
                    <p className="text-muted-foreground">
                      User ideas and product feedback
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search suggestions..."
                      value={suggestionSearch}
                      onChange={(e) => setSuggestionSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Message
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            User
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Status
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Date
                          </th>
                          <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSuggestions.length ? (
                          filteredSuggestions.map((item) => (
                            <tr
                              key={item.id}
                              className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                            >
                              <td className="py-4 px-6 text-sm text-foreground max-w-xl">
                                {item.message}
                              </td>
                              <td className="py-4 px-6 text-sm text-muted-foreground">
                                {item.email || "Anonymous"}
                              </td>
                              <td className="py-4 px-6">
                                <Badge
                                  variant={
                                    item.status === "resolved"
                                      ? "secondary"
                                      : item.status === "reviewed"
                                      ? "default"
                                      : "outline"
                                  }
                                >
                                  {item.status}
                                </Badge>
                              </td>
                              <td className="py-4 px-6 text-sm text-muted-foreground">
                                {new Date(item.createdAt).toLocaleString()}
                              </td>
                              <td className="py-4 px-6 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateSuggestionStatus(item.id, "reviewed")}
                                  >
                                    Mark reviewed
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateSuggestionStatus(item.id, "resolved")}
                                  >
                                    Resolve
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="py-8 text-center text-sm text-muted-foreground" colSpan={5}>
                              No suggestions yet.
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
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground mb-1">
                      User Grammar Checks
                    </h1>
                    <p className="text-muted-foreground">
                      Track all grammar check requests from users
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={checksFilter}
                      onChange={(e) => setChecksFilter(e.target.value as typeof checksFilter)}
                      className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    >
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="week">This Week</option>
                    </select>
                    {selectedUserId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedUserId(null)}
                      >
                        ← Back to Users
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500/10">
                        <Activity className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Total Checks</p>
                        <p className="text-2xl font-bold text-foreground">{userChecks.length}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-500/10">
                        <Users className="w-5 h-5 text-green-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Unique Users</p>
                        <p className="text-2xl font-bold text-foreground">
                          {new Set(userChecks.map(c => c.userId)).size}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-500/10">
                        <FileText className="w-5 h-5 text-purple-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Total Words</p>
                        <p className="text-2xl font-bold text-foreground">
                          {userChecks.reduce((sum, c) => sum + c.wordCount, 0).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {checksLoading ? (
                  <div className="bg-card rounded-xl border border-border py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                    <p className="text-sm text-muted-foreground">Loading checks...</p>
                  </div>
                ) : !selectedUserId ? (
                  // User List View
                  <div className="bg-card rounded-xl border border-border overflow-hidden">
                    <div className="px-6 py-4 border-b border-border">
                      <h2 className="text-lg font-semibold text-foreground">Users</h2>
                      <p className="text-sm text-muted-foreground">Click on a user to view their check history</p>
                    </div>
                    <div className="divide-y divide-border">
                      {(() => {
                        const userGroups = userChecks.reduce((groups, check) => {
                          if (!groups[check.userId]) {
                            groups[check.userId] = {
                              userId: check.userId,
                              userEmail: check.userEmail || "Anonymous",
                              checks: [],
                            };
                          }
                          groups[check.userId].checks.push(check);
                          return groups;
                        }, {} as Record<string, { userId: string; userEmail: string; checks: typeof userChecks }>);
                        
                        const sortedUsers = Object.values(userGroups).sort((a, b) => b.checks.length - a.checks.length);
                        
                        return sortedUsers.length > 0 ? (
                          sortedUsers.map((userGroup) => (
                            <div
                              key={userGroup.userId}
                              onClick={() => setSelectedUserId(userGroup.userId)}
                              className="px-6 py-4 hover:bg-muted/30 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="font-medium text-foreground">
                                    {userGroup.userEmail}
                                  </div>
                                  <div className="text-xs text-muted-foreground font-mono mt-1">
                                    ID: {userGroup.userId.slice(0, 12)}...
                                  </div>
                                </div>
                                <div className="flex items-center gap-6 text-sm">
                                  <div className="text-center">
                                    <div className="text-2xl font-bold text-primary">{userGroup.checks.length}</div>
                                    <div className="text-xs text-muted-foreground">checks</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-2xl font-bold text-blue-500">
                                      {userGroup.checks.reduce((sum, c) => sum + c.wordCount, 0).toLocaleString()}
                                    </div>
                                    <div className="text-xs text-muted-foreground">words</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-2xl font-bold text-green-500">
                                      {userGroup.checks.reduce((sum, c) => sum + c.suggestionsCount, 0)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">suggestions</div>
                                  </div>
                                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="py-12 text-center text-sm text-muted-foreground">
                            <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                            <p>No grammar checks yet.</p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  // User Detail View
                  <div className="space-y-4">
                    {(() => {
                      const userChecksFiltered = userChecks.filter(c => c.userId === selectedUserId);
                      const userEmail = userChecksFiltered[0]?.userEmail || "Unknown User";
                      
                      return (
                        <>
                          <div className="bg-card rounded-xl border border-border p-6">
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <h2 className="text-xl font-semibold text-foreground">{userEmail}</h2>
                                <p className="text-sm text-muted-foreground font-mono">ID: {selectedUserId}</p>
                              </div>
                              <div className="flex gap-4 text-center">
                                <div>
                                  <div className="text-2xl font-bold text-primary">{userChecksFiltered.length}</div>
                                  <div className="text-xs text-muted-foreground">Total Checks</div>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            {userChecksFiltered.map((check) => (
                              <div key={check.id} className="bg-card rounded-xl border border-border overflow-hidden">
                                <div
                                  onClick={() => setExpandedCheckId(expandedCheckId === check.id ? null : check.id)}
                                  className="px-6 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-3 mb-2">
                                        <Badge variant="outline">{check.language}</Badge>
                                        <span className="text-xs text-muted-foreground">
                                          {new Date(check.timestamp).toLocaleString()}
                                        </span>
                                      </div>
                                      <p className="text-sm text-foreground line-clamp-2">
                                        {check.text}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-4 shrink-0">
                                      <div className="text-center">
                                        <div className="text-lg font-semibold text-blue-500">{check.wordCount}</div>
                                        <div className="text-xs text-muted-foreground">words</div>
                                      </div>
                                      {expandedCheckId === check.id ? (
                                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                      )}
                                    </div>
                                  </div>
                                </div>
                                
                                {expandedCheckId === check.id && (
                                  <div className="border-t border-border px-6 py-4 bg-muted/20">
                                    <div>
                                      <h4 className="text-sm font-semibold text-foreground mb-2">User Input:</h4>
                                      <div className="bg-background rounded-lg p-4 text-sm text-foreground whitespace-pre-wrap border border-border">
                                        {check.text}
                                      </div>
                                    </div>
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
                    <h1 className="text-2xl font-bold text-foreground mb-1">
                      Blog
                    </h1>
                    <p className="text-muted-foreground">
                      Create, edit, and publish blog posts
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={resetBlogForm}>
                      New Post
                    </Button>
                  </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
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
                <div className="mt-6 bg-card rounded-xl border border-border p-6">
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
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No blog posts yet.</p>
                    )}
                  </div>
              </div>
            )}

            {activeTab === "languages" && (
              <div className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground mb-1">
                      Languages Management
                    </h1>
                    <p className="text-muted-foreground">
                      Add and manage custom languages for your grammar checker
                    </p>
                  </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
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
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground mb-1">Billing & Plans</h1>
                    <p className="text-muted-foreground">Revenue, subscriptions, discounts, and payment activity</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleExportBilling}>
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </div>

                {/* KPI row */}
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  {[
                    { label: "MRR", value: `₹${monthlyRevenue.toLocaleString("en-IN")}`, sub: "Monthly recurring", color: "text-emerald-500", bg: "bg-emerald-500/10", icon: <CreditCard className="w-4 h-4" /> },
                    { label: "Active Subs", value: proUsers.toLocaleString(), sub: "Pro plans", color: "text-blue-500", bg: "bg-blue-500/10", icon: <Users className="w-4 h-4" /> },
                    { label: "ARPU", value: `₹${arpu.toLocaleString("en-IN")}`, sub: "Avg revenue/user", color: "text-indigo-500", bg: "bg-indigo-500/10", icon: <BarChart3 className="w-4 h-4" /> },
                    { label: "Conversion", value: `${conversionRate}%`, sub: "Free → Pro", color: "text-orange-500", bg: "bg-orange-500/10", icon: <TrendingUp className="w-4 h-4" /> },
                    { label: "Churn Risk", value: pastDueUsers.length.toLocaleString(), sub: "Past due accounts", color: "text-red-500", bg: "bg-red-500/10", icon: <AlertTriangle className="w-4 h-4" /> },
                    { label: "Cancelled", value: cancelledUsers.length.toLocaleString(), sub: "Cancelled subs", color: "text-muted-foreground", bg: "bg-muted/60", icon: <UserX className="w-4 h-4" /> },
                  ].map(c => (
                    <div key={c.label} className="bg-card rounded-xl border border-border p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">{c.label}</span>
                        <div className={`${c.bg} ${c.color} p-1.5 rounded-md`}>{c.icon}</div>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{c.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
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

                <div className="grid lg:grid-cols-2 gap-6">

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

                {/* Subscriptions / Payments table */}
                <div className="bg-card rounded-xl border border-border">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-6 border-b border-border">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Recent Subscriptions</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Showing latest Pro &amp; subscription activity</p>
                    </div>
                    <div className="flex gap-2 items-center">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search name or ID..."
                          value={billingSearch}
                          onChange={e => setBillingSearch(e.target.value)}
                          className="pl-9 h-8 text-sm w-48"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="text-left py-3 px-5 text-xs font-medium text-muted-foreground">Customer</th>
                          <th className="text-left py-3 px-5 text-xs font-medium text-muted-foreground">Plan</th>
                          <th className="text-left py-3 px-5 text-xs font-medium text-muted-foreground">Amount</th>
                          <th className="text-left py-3 px-5 text-xs font-medium text-muted-foreground">Status</th>
                          <th className="text-left py-3 px-5 text-xs font-medium text-muted-foreground">Sub Date</th>
                          <th className="text-left py-3 px-5 text-xs font-medium text-muted-foreground">Last Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBilling.length ? (
                          filteredBilling.map((payment) => (
                            <tr key={`${payment.name}-${payment.date}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                              <td className="py-3 px-5 text-sm text-foreground font-medium max-w-[200px] truncate">{payment.name}</td>
                              <td className="py-3 px-5">
                                <Badge variant={payment.plan === "Pro" ? "default" : "outline"}>
                                  {payment.plan}
                                </Badge>
                              </td>
                              <td className="py-3 px-5 text-sm font-semibold text-foreground">{payment.amount}</td>
                              <td className="py-3 px-5">
                                <Badge variant={
                                  payment.status === "Paid" ? "secondary" :
                                  payment.status === "Past Due" ? "destructive" :
                                  "outline"
                                }>
                                  {payment.status}
                                </Badge>
                              </td>
                              <td className="py-3 px-5 text-sm text-muted-foreground">
                                {payment.subscriptionUpdatedAt
                                  ? new Date(payment.subscriptionUpdatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                                  : "—"}
                              </td>
                              <td className="py-3 px-5 text-sm text-muted-foreground">
                                {new Date(payment.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="py-8 text-center text-sm text-muted-foreground" colSpan={6}>
                              {billingSearch ? `No results for "${billingSearch}"` : "No billing activity yet."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              );
            })()}

            {activeTab === "seo" && (
              <div className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground mb-1">
                      SEO Language Pages
                    </h1>
                    <p className="text-muted-foreground">
                      Create SEO-optimized landing pages for each language
                    </p>
                  </div>
                  <div className="flex gap-3">
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

                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Form */}
                  <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-foreground">
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
                      {seoUrlSlug && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          ✓ URL: correctnow.app/{seoUrlSlug}
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
                            if (!seoUrlSlug) {
                              setSeoUrlSlug(code); // Default URL to language code
                            }
                            setSeoTitle(`${lang.name} Grammar Checker - CorrectNow`);
                            setSeoH1(`${lang.name} Grammar Checker`);
                            setSeoMetaDescription(`Free online ${lang.name} grammar checker and proofreading tool. Check your ${lang.name} text for spelling, grammar, and style mistakes instantly.`);
                            setSeoKeywords(`${lang.name} grammar checker, ${lang.name} spell check, ${lang.name} proofreading, online grammar check, ${code} grammar`);
                            setSeoDescription(`Free online ${lang.name} grammar checker and proofreading tool. Check your ${lang.name} text for spelling, grammar, and style mistakes instantly.`);
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

                    <div className="flex gap-3 pt-2">
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
                          } catch (error) {
                            console.error("Failed to save SEO page:", error);
                            toast.error("Failed to save SEO page");
                          } finally {
                            setSeoSaving(false);
                          }
                        }}
                        disabled={seoSaving || !seoUrlSlug || !seoLanguageCode || !seoTitle}
                        className="flex-1"
                      >
                        {seoSaving ? "Saving..." : seoEditingId ? "Update Page" : "Create Page"}
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
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* List */}
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-foreground">
                        Existing SEO Pages ({seoPages.length})
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
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
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-medium text-foreground">
                                          {page.languageName}
                                        </h4>
                                        <Badge variant={page.active ? "default" : "secondary"}>
                                          {page.active ? "Active" : "Inactive"}
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-muted-foreground">
                                        /{page.urlSlug || page.languageCode}
                                      </p>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => window.open(`/${page.urlSlug || page.languageCode}`, '_blank')}
                                        title="Open in new tab"
                                      >
                                        <ExternalLink className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
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
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
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
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                      </Button>
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground line-clamp-2">
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
                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                              <p className="text-xs text-muted-foreground">
                                Showing {(seoPage - 1) * SEO_PAGE_SIZE + 1}–{Math.min(seoPage * SEO_PAGE_SIZE, filtered.length)} of {filtered.length}
                              </p>
                              <div className="flex items-center gap-1">
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
                  </div>
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
                              await setDoc(doc(db, "seoPages", finalSlug), {
                                urlSlug: finalSlug,
                                languageCode: lang.code,
                                languageName: lang.name,
                                title: `${lang.name} Grammar Checker - CorrectNow`,
                                metaDescription: `Free online ${lang.name} grammar checker and proofreading tool. Check your ${lang.name} text for spelling, grammar, and style mistakes instantly.`,
                                keywords: `${lang.name} grammar checker, ${lang.name} spell check, ${lang.name} proofreading, online grammar check, ${lang.code} grammar`,
                                h1: `${lang.name} Grammar Checker`,
                                description: `Free online ${lang.name} grammar checker and proofreading tool. Check your ${lang.name} text for spelling, grammar, and style mistakes instantly.`,
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

            {activeTab === "settings" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-foreground mb-1">
                    Settings
                  </h1>
                  <p className="text-muted-foreground">
                    Platform configuration and preferences
                  </p>
                </div>

                <div className="bg-card rounded-xl border border-border p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">
                    API Configuration
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-muted-foreground">
                        Gemini API Status
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-foreground">Connected</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      Update API Key
                    </Button>
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">
                    Rate Limits
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">
                        Free Plan - Words/Check
                      </label>
                      <p className="text-foreground font-medium">200</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">
                        Free Plan - Monthly Words
                      </label>
                      <p className="text-foreground font-medium">Limited</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">
                        Pro Plan - Words/Check
                      </label>
                      <p className="text-foreground font-medium">5,000</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">
                        Pro Plan - Monthly Words
                      </label>
                      <p className="text-foreground font-medium">50,000</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

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
      </div>
    </div>
  );
};

export default Admin;
