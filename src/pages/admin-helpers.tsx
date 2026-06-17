/**
 * admin-helpers.tsx
 * Reusable hooks, types, and components for the Admin panel.
 * Keeps Admin.tsx focused on layout/data-flow rather than micro-UI logic.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditAction =
  | "login" | "logout"
  | "grant_pro" | "revoke_pro" | "grant_admin"
  | "add_credits" | "set_category"
  | "suspend" | "reactivate" | "delete" | "create_user"
  | "edit_limits" | "add_note"
  | "bulk_grant_pro" | "bulk_revoke_pro"
  | "bulk_add_credits" | "bulk_set_category"
  | "bulk_suspend" | "bulk_reactivate" | "bulk_delete"
  | "suggestion_assign" | "suggestion_tag" | "suggestion_priority"
  | "settings_rotate_key"
  // Allow any server-emitted action string without losing autocomplete above.
  | (string & {});

export type AuditEntry = {
  id: string;
  ts: string;           // ISO timestamp
  action: AuditAction;
  targetId: string;     // userId or entityId
  targetLabel: string;  // email or description
  actor: string;        // admin email
  detail: string;       // human-readable summary
  note?: string;        // optional reason/note
};

export type FilterPreset = {
  id: string;
  name: string;
  planFilter: string;
  statusFilter: string;
  dateFilter: string;
  categoryFilter: string;
  sortBy: string;
  searchQuery?: string;
};

export type SuggestionMeta = {
  id: string;
  priority: "low" | "medium" | "high" | "critical";
  tags: string[];
  owner: string;
  slaDeadline?: string;
  internalNote?: string;
};

// ─── Audit Log Hook ───────────────────────────────────────────────────────────

const AUDIT_KEY = "admin:audit_log";
const AUDIT_MAX = 1000;

/**
 * Actions that are persisted AUTHORITATIVELY server-side by their backend
 * endpoint (see writeAudit in server/index.js). The hook shows them
 * optimistically for instant feedback but does NOT re-POST them, avoiding
 * duplicate entries. They appear from the server on the next refresh().
 */
const SERVER_PERSISTED = new Set<string>([
  "grant_pro", "revoke_pro", "delete", "create_user", "grant_admin",
  "bulk_grant_pro", "bulk_revoke_pro", "bulk_add_credits",
  "bulk_suspend", "bulk_reactivate", "bulk_set_category",
]);

async function adminAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { getFirebaseAuth } = await import("@/lib/firebase");
    const auth = getFirebaseAuth();
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
    return token
      ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
      : { "Content-Type": "application/json" };
  } catch {
    return { "Content-Type": "application/json" };
  }
}

/**
 * Server-backed, tamper-resistant admin audit log.
 *  • The Firestore `auditLogs` collection (written by the server) is the source
 *    of truth; it survives cache clears and cannot be edited from the browser.
 *  • Backend mutations are logged automatically server-side.
 *  • Client-origin events (login, and client-side Firestore writes like
 *    add_credits / edit_limits / suggestion changes) are persisted via POST.
 *  • localStorage is kept only as an offline display cache.
 */
export function useAuditLog(actor: string) {
  const [entries, setEntries] = useState<AuditEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const persistCache = useCallback((list: AuditEntry[]) => {
    try { localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, AUDIT_MAX))); } catch {}
  }, []);

  // Load the authoritative server log (newest first).
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/audit?limit=500", { headers: await adminAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const server: AuditEntry[] = Array.isArray(data?.entries) ? data.entries : [];
      setEntries(server);
      persistCache(server);
    } catch {
      /* keep cached entries on network failure */
    }
  }, [persistCache]);

  // Refresh on mount and whenever the admin identity becomes known (actor
  // changes from "" → email after sign-in), so the server log loads once the
  // auth token is available.
  useEffect(() => {
    if (actor) refresh();
  }, [refresh, actor]);

  const log = useCallback(
    (action: AuditAction, targetId: string, targetLabel: string, detail: string, note?: string) => {
      const entry: AuditEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ts: new Date().toISOString(),
        action: action as string,
        targetId,
        targetLabel,
        actor,
        detail,
        note,
      };
      // Optimistic local prepend for instant UI feedback.
      setEntries((prev) => {
        const next = [entry, ...prev].slice(0, AUDIT_MAX);
        persistCache(next);
        return next;
      });
      // Persist client-origin events; server already records backend mutations.
      if (!SERVER_PERSISTED.has(action as string)) {
        (async () => {
          try {
            await fetch("/api/admin/audit", {
              method: "POST",
              headers: await adminAuthHeaders(),
              body: JSON.stringify({ action, targetId, targetLabel, detail, note }),
            });
          } catch { /* cached locally; will reconcile on next refresh */ }
        })();
      } else {
        // Pull the authoritative entry shortly after the backend writes it.
        setTimeout(() => { refresh(); }, 1200);
      }
    },
    [actor, persistCache, refresh]
  );

  const clearLog = useCallback(() => {
    // Only clears the LOCAL display cache — the server trail is immutable.
    setEntries([]);
    try { localStorage.removeItem(AUDIT_KEY); } catch {}
    refresh();
  }, [refresh]);

  return { entries, log, clearLog, refresh };
}

// ─── Saved Filter Presets Hook ────────────────────────────────────────────────

const PRESETS_KEY = "admin:filter_presets";

export function useSavedPresets() {
  const [presets, setPresets] = useState<FilterPreset[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const save = useCallback((preset: Omit<FilterPreset, "id">) => {
    const id = `preset-${Date.now()}`;
    setPresets((prev) => {
      const next = [...prev, { ...preset, id }];
      try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    toast.success(`Preset "${preset.name}" saved`);
  }, []);

  const remove = useCallback((id: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { presets, save, remove };
}

// ─── Blog Autosave Hook ───────────────────────────────────────────────────────

const BLOG_DRAFT_KEY = "admin:blog_draft";

export function useBlogAutosave(
  title: string,
  slug: string,
  contentHtml: string,
  editingId: string | null
) {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!title && !contentHtml) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(
          BLOG_DRAFT_KEY,
          JSON.stringify({ title, slug, contentHtml, editingId, savedAt: new Date().toISOString() })
        );
        setLastSaved(new Date());
      } catch {}
    }, 2000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [title, slug, contentHtml, editingId]);

  const loadDraft = useCallback((): { title: string; slug: string; contentHtml: string; editingId: string | null } | null => {
    try {
      const raw = localStorage.getItem(BLOG_DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(BLOG_DRAFT_KEY); } catch {}
    setLastSaved(null);
  }, []);

  return { lastSaved, loadDraft, clearDraft };
}

// ─── Suggestion Meta Hook ─────────────────────────────────────────────────────

const SMETA_KEY = "admin:suggestion_meta";

export function useSuggestionMeta() {
  const [metas, setMetas] = useState<Record<string, SuggestionMeta>>(() => {
    try {
      return JSON.parse(localStorage.getItem(SMETA_KEY) || "{}");
    } catch {
      return {};
    }
  });

  const update = useCallback((id: string, patch: Partial<Omit<SuggestionMeta, "id">>) => {
    setMetas((prev) => {
      const existing = prev[id] || { id, priority: "medium", tags: [], owner: "" };
      const next = { ...prev, [id]: { ...existing, ...patch } };
      try { localStorage.setItem(SMETA_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const get = useCallback(
    (id: string): SuggestionMeta =>
      metas[id] || { id, priority: "medium", tags: [], owner: "" },
    [metas]
  );

  return { get, update };
}

// ─── Keyboard Shortcuts Hook ──────────────────────────────────────────────────

type ShortcutMap = Record<string, () => void>;

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = [
        e.ctrlKey || e.metaKey ? "mod" : "",
        e.shiftKey ? "shift" : "",
        e.key.toLowerCase(),
      ]
        .filter(Boolean)
        .join("+");
      if (shortcuts[key]) {
        e.preventDefault();
        shortcuts[key]();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}

// ─── Components ───────────────────────────────────────────────────────────────

// Filter Preset Bar
export function FilterPresetBar({
  presets,
  currentFilters,
  onApply,
  onSave,
  onRemove,
}: {
  presets: FilterPreset[];
  currentFilters: Omit<FilterPreset, "id" | "name">;
  onApply: (p: FilterPreset) => void;
  onSave: (name: string) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const builtins: FilterPreset[] = [
    { id: "b1", name: "High-usage free", planFilter: "free", statusFilter: "active", dateFilter: "all", categoryFilter: "", sortBy: "credits" },
    { id: "b2", name: "New last 7d", planFilter: "all", statusFilter: "all", dateFilter: "7days", categoryFilter: "", sortBy: "newest" },
    { id: "b3", name: "Suspended", planFilter: "all", statusFilter: "deactivated", dateFilter: "all", categoryFilter: "", sortBy: "newest" },
    { id: "b4", name: "Pro users", planFilter: "pro", statusFilter: "active", dateFilter: "all", categoryFilter: "", sortBy: "newest" },
  ];

  const all = [...builtins, ...presets];

  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span className="text-xs text-muted-foreground font-medium shrink-0">Presets:</span>
      {all.map((p) => (
        <div key={p.id} className="flex items-center gap-0.5">
          <button
            onClick={() => onApply(p)}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border border-border bg-muted/50 hover:bg-muted hover:border-primary/40 transition-colors"
          >
            {p.name}
          </button>
          {!p.id.startsWith("b") && (
            <button
              onClick={() => onRemove(p.id)}
              className="text-muted-foreground hover:text-destructive text-xs px-0.5"
              title="Remove preset"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {adding ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) { onSave(name.trim()); setName(""); setAdding(false); }
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Preset name…"
            className="h-7 text-xs w-36"
          />
          <Button type="submit" size="sm" className="h-7 text-xs px-2">Save</Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setAdding(false)}>✕</Button>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          + Save current
        </button>
      )}
    </div>
  );
}

// Audit Timeline Component
export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  if (!entries.length) {
    return <p className="text-xs text-muted-foreground italic py-4 text-center">No audit events yet.</p>;
  }

  const actionColor: Record<string, string> = {
    grant_pro: "text-emerald-600",
    revoke_pro: "text-orange-600",
    add_credits: "text-blue-600",
    suspend: "text-red-600",
    reactivate: "text-emerald-600",
    delete: "text-red-700",
    set_category: "text-purple-600",
    edit_limits: "text-blue-500",
    add_note: "text-slate-500",
    bulk_grant_pro: "text-emerald-600",
    bulk_revoke_pro: "text-orange-600",
    bulk_add_credits: "text-blue-600",
    bulk_suspend: "text-red-600",
    bulk_reactivate: "text-emerald-600",
    bulk_delete: "text-red-700",
    bulk_set_category: "text-purple-600",
    settings_rotate_key: "text-amber-600",
  };

  return (
    <ol className="space-y-2 max-h-80 overflow-y-auto pr-1">
      {entries.map((e) => (
        <li key={e.id} className="flex gap-3 text-xs">
          <div className="flex flex-col items-center shrink-0 pt-0.5">
            <span className={`w-2 h-2 rounded-full mt-0.5 ${(actionColor[e.action] || "text-slate-500").replace("text-", "bg-")}`} />
            <div className="w-px flex-1 bg-border mt-1" />
          </div>
          <div className="pb-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-semibold ${actionColor[e.action] || "text-foreground"}`}>{e.action.replace(/_/g, " ")}</span>
              <span className="text-muted-foreground truncate max-w-[140px]" title={e.targetLabel}>{e.targetLabel}</span>
              <span className="text-muted-foreground ml-auto shrink-0">{new Date(e.ts).toLocaleString()}</span>
            </div>
            <p className="text-muted-foreground mt-0.5">{e.detail}</p>
            {e.note && <p className="text-slate-500 italic">Note: {e.note}</p>}
            <p className="text-slate-400">by {e.actor}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// Bulk Action Reason Dialog
export function BulkReasonDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  loading,
  destructive,
}: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
  loading?: boolean;
  destructive?: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="text-sm font-medium">Reason / Note <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Campaign promo, support request…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => { onConfirm(note); setNote(""); }}
            disabled={loading}
          >
            {loading ? "Processing…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// OG / Search Preview Panel
export function OgPreview({
  title,
  metaDescription,
  slug,
}: {
  title: string;
  metaDescription: string;
  slug: string;
}) {
  const url = `correctnow.app/${slug}`;
  const titleOk = title.length >= 30 && title.length <= 60;
  const descOk = metaDescription.length >= 70 && metaDescription.length <= 160;

  return (
    <div className="space-y-3">
      {/* Google SERP preview */}
      <div className="rounded-xl border border-border bg-background p-4 space-y-1 font-sans">
        <p className="text-xs text-muted-foreground truncate">{url}</p>
        <p
          className={`text-base font-semibold truncate leading-snug ${
            titleOk ? "text-blue-700" : "text-red-500"
          }`}
        >
          {title || <span className="italic text-muted-foreground">No title</span>}
        </p>
        <p className={`text-xs line-clamp-2 ${descOk ? "text-gray-600" : "text-red-400"}`}>
          {metaDescription || <span className="italic text-muted-foreground">No description</span>}
        </p>
      </div>

      {/* Character / pixel counters */}
      <div className="flex gap-4 text-xs">
        <SeoFieldCounter
          label="Title"
          value={title}
          minChars={30}
          maxChars={60}
          pixelsPerChar={7.5}
          maxPixels={580}
        />
        <SeoFieldCounter
          label="Description"
          value={metaDescription}
          minChars={70}
          maxChars={160}
          pixelsPerChar={6.5}
          maxPixels={920}
        />
      </div>
    </div>
  );
}

export function SeoFieldCounter({
  label,
  value,
  minChars,
  maxChars,
  pixelsPerChar,
  maxPixels,
}: {
  label: string;
  value: string;
  minChars: number;
  maxChars: number;
  pixelsPerChar: number;
  maxPixels: number;
}) {
  const chars = value.length;
  const pixels = Math.round(chars * pixelsPerChar);
  const overChars = chars > maxChars;
  const underChars = chars < minChars;
  const overPx = pixels > maxPixels;
  const color = overChars || overPx ? "text-red-500" : underChars ? "text-amber-500" : "text-emerald-600";

  return (
    <div className={`${color} flex flex-col gap-0.5`}>
      <span className="font-medium">{label}</span>
      <span>{chars}/{maxChars} chars</span>
      <span>{pixels}/{maxPixels}px</span>
    </div>
  );
}

// JSON-LD Generator Panel
export function JsonLdPanel({
  title,
  slug,
  description,
  faqItems,
}: {
  title: string;
  slug: string;
  description: string;
  faqItems?: Array<{ q: string; a: string }>;
}) {
  const baseUrl = "https://correctnow.app";
  const url = `${baseUrl}/${slug}`;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: title, item: url },
    ],
  };

  const faqLd = faqItems?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }
    : null;

  const combined = faqLd
    ? `<script type="application/ld+json">\n${JSON.stringify(breadcrumbLd, null, 2)}\n</script>\n\n<script type="application/ld+json">\n${JSON.stringify(faqLd, null, 2)}\n</script>`
    : `<script type="application/ld+json">\n${JSON.stringify(breadcrumbLd, null, 2)}\n</script>`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">JSON-LD Schema</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            navigator.clipboard.writeText(combined);
            toast.success("JSON-LD copied to clipboard");
          }}
        >
          Copy
        </Button>
      </div>
      <pre className="bg-muted/40 border border-border rounded-lg p-3 text-xs overflow-x-auto max-h-52 overflow-y-auto whitespace-pre-wrap font-mono text-muted-foreground">
        {combined}
      </pre>
    </div>
  );
}

// Priority Badge
export function PriorityBadge({ priority }: { priority: SuggestionMeta["priority"] }) {
  const map: Record<SuggestionMeta["priority"], string> = {
    low: "bg-slate-100 text-slate-600",
    medium: "bg-amber-100 text-amber-700",
    high: "bg-orange-100 text-orange-700",
    critical: "bg-red-100 text-red-700",
  };
  return (
    <Badge variant="outline" className={`text-xs font-medium border-0 ${map[priority]}`}>
      {priority}
    </Badge>
  );
}

// SLA Timer — shows how far past/before deadline
export function SlaTimer({ deadline }: { deadline?: string }) {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  const overdue = ms < 0;
  const hours = Math.abs(Math.round(ms / 3_600_000));
  const label = hours < 24
    ? `${hours}h`
    : `${Math.round(hours / 24)}d`;
  return (
    <span className={`text-xs font-medium ${overdue ? "text-red-600" : "text-emerald-600"}`}>
      {overdue ? `${label} overdue` : `${label} left`}
    </span>
  );
}

// ─── CSV Export Utilities ─────────────────────────────────────────────────────

const csvEscape = (v: string | number | null | undefined): string => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const content = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["﻿", content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.visibility = "hidden";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportChecksCsv(
  checks: Array<{
    id: string;
    userId: string;
    userEmail?: string;
    text: string;
    language: string;
    wordCount: number;
    suggestionsCount: number;
    creditsUsed?: number;
    timestamp: string;
  }>
) {
  downloadCsv(
    `checks_export_${new Date().toISOString().slice(0, 10)}.csv`,
    ["id", "userId", "userEmail", "language", "wordCount", "suggestionsCount", "creditsUsed", "timestamp", "textSnippet"],
    checks.map((c) => [
      c.id,
      c.userId,
      c.userEmail || "",
      c.language,
      c.wordCount,
      c.suggestionsCount,
      c.creditsUsed ?? c.wordCount,
      c.timestamp,
      c.text.slice(0, 120).replace(/\n/g, " "),
    ])
  );
}

export function exportSuggestionsCsv(
  suggestions: Array<{
    id: string;
    message: string;
    email?: string;
    status: string;
    createdAt: string;
  }>,
  getMeta: (id: string) => SuggestionMeta
) {
  downloadCsv(
    `suggestions_export_${new Date().toISOString().slice(0, 10)}.csv`,
    ["id", "message", "email", "status", "priority", "tags", "owner", "createdAt"],
    suggestions.map((s) => {
      const m = getMeta(s.id);
      return [s.id, s.message, s.email || "", s.status, m.priority, m.tags.join(";"), m.owner, s.createdAt];
    })
  );
}

export function exportPaymentsCsv(
  payments: Array<{
    userId: string;
    userName: string;
    userEmail: string;
    plan: string;
    amount: string;
    status: string;
    provider?: string;
    subscriptionId?: string;
    periodStart?: string;
    periodEnd?: string;
    updatedAt?: string;
  }>
) {
  downloadCsv(
    `payments_export_${new Date().toISOString().slice(0, 10)}.csv`,
    ["userId", "name", "email", "plan", "amount", "status", "provider", "subscriptionId", "periodStart", "periodEnd", "updatedAt"],
    payments.map((p) => [
      p.userId, p.userName, p.userEmail, p.plan, p.amount,
      p.status, p.provider || "", p.subscriptionId || "",
      p.periodStart || "", p.periodEnd || "", p.updatedAt || "",
    ])
  );
}
