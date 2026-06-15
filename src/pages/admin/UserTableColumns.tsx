/**
 * Enterprise data-table column system for the Admin user table.
 *
 * Each column header is an interactive control offering:
 *   • Sorting        — ascending / descending / clear / add-to-multi-sort
 *   • Text filters    — contains / equals / not-equals / starts / ends / empty / not-empty
 *   • Numeric filters — =, >, <, between, top N, bottom N
 *   • Date filters    — today / yesterday / last 7 / last 30 / this month / prev month / custom
 *   • Enum filters    — multi-select with select-all / clear (Plan, Status, Category)
 *
 * State + evaluation are pure and exported (useColumnQuery, applyColumnQuery) so the
 * same engine can later be moved server-side without touching the UI. The table folds
 * applyColumnQuery into its single source-of-truth memo, so pagination, counts,
 * select-all and CSV export all respect the active query automatically.
 */
import { useCallback, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Filter as FilterIcon,
  ListFilter,
  X,
} from "lucide-react";

export type ColumnType = "text" | "number" | "date" | "enum";

export interface ColumnDef<T> {
  id: string;
  label: string;
  type: ColumnType;
  /** Value used for sorting / numeric+date filtering. */
  getValue: (row: T) => string | number | null | undefined;
  /** Optional text used for text filters when different from getValue (e.g. name+email). */
  getText?: (row: T) => string;
  /** For enum columns: the option set (value === label unless provided). */
  enumOptions?: { value: string; label: string }[];
  align?: "left" | "right";
}

export type SortRule = { id: string; dir: "asc" | "desc" };

type TextFilter = { kind: "text"; op: TextOp; value: string };
type NumberFilter = { kind: "number"; op: NumOp; a: string; b: string };
type DateFilter = { kind: "date"; preset: DatePreset; from: string; to: string };
type EnumFilter = { kind: "enum"; values: string[] };
export type ColumnFilter = TextFilter | NumberFilter | DateFilter | EnumFilter;

type TextOp = "contains" | "equals" | "notEquals" | "startsWith" | "endsWith" | "empty" | "notEmpty";
type NumOp = "eq" | "gt" | "lt" | "between" | "topN" | "bottomN";
type DatePreset = "today" | "yesterday" | "7d" | "30d" | "thisMonth" | "prevMonth" | "custom";

const TEXT_OPS: { value: TextOp; label: string }[] = [
  { value: "contains", label: "Contains" },
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Not equals" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "empty", label: "Is empty" },
  { value: "notEmpty", label: "Is not empty" },
];

const NUM_OPS: { value: NumOp; label: string }[] = [
  { value: "eq", label: "Equals" },
  { value: "gt", label: "Greater than" },
  { value: "lt", label: "Less than" },
  { value: "between", label: "Between" },
  { value: "topN", label: "Top N values" },
  { value: "bottomN", label: "Bottom N values" },
];

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "prevMonth", label: "Previous month" },
  { value: "custom", label: "Custom range" },
];

// ─── Query state hook ─────────────────────────────────────────────────────────
export interface ColumnQuery {
  filters: Record<string, ColumnFilter>;
  sorts: SortRule[];
  setFilter: (id: string, filter: ColumnFilter | null) => void;
  toggleSort: (id: string, dir: "asc" | "desc", additive: boolean) => void;
  clearSort: (id: string) => void;
  clearAll: () => void;
  activeFilterCount: number;
}

export function useColumnQuery(): ColumnQuery {
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [sorts, setSorts] = useState<SortRule[]>([]);

  const setFilter = useCallback((id: string, filter: ColumnFilter | null) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (filter === null) delete next[id];
      else next[id] = filter;
      return next;
    });
  }, []);

  const toggleSort = useCallback((id: string, dir: "asc" | "desc", additive: boolean) => {
    setSorts((prev) => {
      const existing = prev.find((s) => s.id === id);
      if (additive) {
        if (existing) return prev.map((s) => (s.id === id ? { ...s, dir } : s));
        return [...prev, { id, dir }];
      }
      return [{ id, dir }];
    });
  }, []);

  const clearSort = useCallback((id: string) => {
    setSorts((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setFilters({});
    setSorts([]);
  }, []);

  const activeFilterCount = Object.keys(filters).length;

  return { filters, sorts, setFilter, toggleSort, clearSort, clearAll, activeFilterCount };
}

// ─── Pure evaluation ────────────────────────────────────────────────────────
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function dateRange(f: DateFilter): [number, number] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const dayMs = 86400000;
  switch (f.preset) {
    case "today": return [todayStart, todayStart + dayMs];
    case "yesterday": return [todayStart - dayMs, todayStart];
    case "7d": return [todayStart - 7 * dayMs, Date.now() + dayMs];
    case "30d": return [todayStart - 30 * dayMs, Date.now() + dayMs];
    case "thisMonth": return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), Date.now() + dayMs];
    case "prevMonth": return [
      new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
      new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
    ];
    case "custom": return [
      f.from ? new Date(f.from).getTime() : -Infinity,
      f.to ? new Date(f.to).getTime() + dayMs : Infinity,
    ];
    default: return [-Infinity, Infinity];
  }
}

function passesText(value: string, f: TextFilter): boolean {
  const v = value.toLowerCase();
  const q = f.value.toLowerCase();
  switch (f.op) {
    case "contains": return !q || v.includes(q);
    case "equals": return v === q;
    case "notEquals": return v !== q;
    case "startsWith": return v.startsWith(q);
    case "endsWith": return v.endsWith(q);
    case "empty": return v.trim() === "";
    case "notEmpty": return v.trim() !== "";
    default: return true;
  }
}

function passesNumber(value: number, f: NumberFilter): boolean {
  const a = Number(f.a);
  const b = Number(f.b);
  switch (f.op) {
    case "eq": return Number.isFinite(a) ? value === a : true;
    case "gt": return Number.isFinite(a) ? value > a : true;
    case "lt": return Number.isFinite(a) ? value < a : true;
    case "between":
      return (!Number.isFinite(a) || value >= a) && (!Number.isFinite(b) || value <= b);
    default: return true; // topN/bottomN handled at set level
  }
}

export function applyColumnQuery<T>(
  rows: T[],
  columns: ColumnDef<T>[],
  query: { filters: Record<string, ColumnFilter>; sorts: SortRule[] }
): T[] {
  const colById = new Map(columns.map((c) => [c.id, c]));
  let out = rows;

  for (const [id, filter] of Object.entries(query.filters)) {
    const col = colById.get(id);
    if (!col) continue;

    if (filter.kind === "text") {
      out = out.filter((r) => passesText(String((col.getText ?? col.getValue)(r) ?? ""), filter));
    } else if (filter.kind === "enum") {
      if (filter.values.length === 0) continue;
      const set = new Set(filter.values.map((v) => v.toLowerCase()));
      out = out.filter((r) => set.has(String(col.getValue(r) ?? "").toLowerCase()));
    } else if (filter.kind === "date") {
      const [from, to] = dateRange(filter);
      out = out.filter((r) => {
        const raw = col.getValue(r);
        const ts = raw ? new Date(String(raw)).getTime() : 0;
        return ts >= from && ts < to;
      });
    } else if (filter.kind === "number") {
      if (filter.op === "topN" || filter.op === "bottomN") {
        const n = Math.max(1, Number(filter.a) || 0);
        const sorted = [...out].sort((x, y) => Number(col.getValue(y) ?? 0) - Number(col.getValue(x) ?? 0));
        const slice = filter.op === "topN" ? sorted.slice(0, n) : sorted.slice(-n);
        const keep = new Set(slice);
        out = out.filter((r) => keep.has(r));
      } else {
        out = out.filter((r) => passesNumber(Number(col.getValue(r) ?? 0), filter));
      }
    }
  }

  if (query.sorts.length) {
    out = [...out].sort((a, b) => {
      for (const s of query.sorts) {
        const col = colById.get(s.id);
        if (!col) continue;
        const av = col.getValue(a);
        const bv = col.getValue(b);
        let cmp: number;
        if (col.type === "number") cmp = Number(av ?? 0) - Number(bv ?? 0);
        else if (col.type === "date") cmp = new Date(String(av ?? 0)).getTime() - new Date(String(bv ?? 0)).getTime();
        else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
        if (cmp !== 0) return s.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }

  return out;
}

// ─── Header cell ────────────────────────────────────────────────────────────
interface ColumnHeaderProps<T> {
  col: ColumnDef<T>;
  query: ColumnQuery;
}

export function ColumnHeader<T>({ col, query }: ColumnHeaderProps<T>) {
  const [open, setOpen] = useState(false);
  const sortRule = query.sorts.find((s) => s.id === col.id);
  const sortIndex = query.sorts.findIndex((s) => s.id === col.id);
  const active = !!query.filters[col.id] || !!sortRule;

  return (
    <th
      className={cn(
        "py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide select-none",
        col.align === "right" ? "text-right" : "text-left"
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-md px-1.5 -mx-1.5 py-1 transition-colors hover:bg-gray-100",
              active && "text-blue-700"
            )}
            title={`Sort & filter ${col.label}`}
          >
            <span>{col.label}</span>
            {sortRule ? (
              sortRule.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-70" />
            )}
            {query.sorts.length > 1 && sortIndex >= 0 && (
              <span className="text-[9px] font-bold text-blue-600">{sortIndex + 1}</span>
            )}
            {query.filters[col.id] && <FilterIcon className="w-3 h-3 text-blue-600" />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0 rounded-xl shadow-xl border-gray-200">
          <div className="p-2 border-b border-gray-100">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Sort</p>
            <div className="grid grid-cols-2 gap-1">
              <SortBtn label="Ascending" icon={<ArrowUp className="w-3.5 h-3.5" />} activeState={sortRule?.dir === "asc"} onClick={(e) => { query.toggleSort(col.id, "asc", e.shiftKey); }} />
              <SortBtn label="Descending" icon={<ArrowDown className="w-3.5 h-3.5" />} activeState={sortRule?.dir === "desc"} onClick={(e) => { query.toggleSort(col.id, "desc", e.shiftKey); }} />
            </div>
            <p className="px-2 pt-1.5 text-[9px] text-gray-400">Hold Shift to add to multi-sort.</p>
            {sortRule && (
              <button className="mt-1 w-full text-left px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" onClick={() => query.clearSort(col.id)}>
                Remove sort
              </button>
            )}
          </div>

          <div className="p-2">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1">
              <ListFilter className="w-3 h-3" /> Filter
            </p>
            <FilterBody col={col} query={query} onApplied={() => setOpen(false)} />
          </div>

          {query.filters[col.id] && (
            <div className="p-2 border-t border-gray-100">
              <button
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md"
                onClick={() => { query.setFilter(col.id, null); }}
              >
                <X className="w-3.5 h-3.5" /> Clear filter
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </th>
  );
}

function SortBtn({ label, icon, activeState, onClick }: { label: string; icon: React.ReactNode; activeState?: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
        activeState ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100"
      )}
    >
      {icon}{label}
    </button>
  );
}

function FilterBody<T>({ col, query, onApplied }: { col: ColumnDef<T>; query: ColumnQuery; onApplied: () => void }) {
  const current = query.filters[col.id];

  if (col.type === "enum") {
    const enumF = current?.kind === "enum" ? current : { kind: "enum" as const, values: [] };
    const options = col.enumOptions ?? [];
    const toggle = (val: string) => {
      const has = enumF.values.includes(val);
      const values = has ? enumF.values.filter((v) => v !== val) : [...enumF.values, val];
      query.setFilter(col.id, values.length ? { kind: "enum", values } : null);
    };
    return (
      <div className="space-y-0.5 max-h-56 overflow-y-auto">
        <div className="flex gap-1 px-1 pb-1">
          <button className="text-[10px] text-blue-600 hover:underline" onClick={() => query.setFilter(col.id, { kind: "enum", values: options.map((o) => o.value) })}>Select all</button>
          <span className="text-gray-300">·</span>
          <button className="text-[10px] text-gray-500 hover:underline" onClick={() => query.setFilter(col.id, null)}>Clear</button>
        </div>
        {options.map((o) => {
          const checked = enumF.values.includes(o.value);
          return (
            <button key={o.value} onClick={() => toggle(o.value)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-700 hover:bg-gray-100">
              <span className={cn("w-4 h-4 rounded border flex items-center justify-center", checked ? "bg-blue-600 border-blue-600" : "border-gray-300")}>
                {checked && <Check className="w-3 h-3 text-white" />}
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (col.type === "date") {
    const dateF = current?.kind === "date" ? current : { kind: "date" as const, preset: "7d" as DatePreset, from: "", to: "" };
    return (
      <div className="space-y-1">
        {DATE_PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => {
              if (p.value === "custom") query.setFilter(col.id, { kind: "date", preset: "custom", from: dateF.from, to: dateF.to });
              else { query.setFilter(col.id, { kind: "date", preset: p.value, from: "", to: "" }); onApplied(); }
            }}
            className={cn("w-full text-left px-2 py-1.5 rounded-md text-xs", dateF.preset === p.value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-100")}
          >
            {p.label}
          </button>
        ))}
        {dateF.preset === "custom" && (
          <div className="flex items-center gap-1 px-1 pt-1">
            <Input type="date" className="h-8 text-xs" value={dateF.from} onChange={(e) => query.setFilter(col.id, { ...dateF, from: e.target.value })} />
            <span className="text-gray-400 text-xs">–</span>
            <Input type="date" className="h-8 text-xs" value={dateF.to} onChange={(e) => query.setFilter(col.id, { ...dateF, to: e.target.value })} />
          </div>
        )}
      </div>
    );
  }

  if (col.type === "number") {
    const numF = current?.kind === "number" ? current : { kind: "number" as const, op: "gt" as NumOp, a: "", b: "" };
    return (
      <div className="space-y-2">
        <select
          className="w-full h-8 text-xs border border-gray-200 rounded-md px-2 bg-white"
          value={numF.op}
          onChange={(e) => query.setFilter(col.id, { ...numF, op: e.target.value as NumOp })}
        >
          {NUM_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            placeholder={numF.op === "topN" || numF.op === "bottomN" ? "N" : "Value"}
            className="h-8 text-xs"
            value={numF.a}
            onChange={(e) => query.setFilter(col.id, { ...numF, a: e.target.value })}
          />
          {numF.op === "between" && (
            <>
              <span className="text-gray-400 text-xs">–</span>
              <Input type="number" placeholder="Max" className="h-8 text-xs" value={numF.b} onChange={(e) => query.setFilter(col.id, { ...numF, b: e.target.value })} />
            </>
          )}
        </div>
      </div>
    );
  }

  // text
  const textF = current?.kind === "text" ? current : { kind: "text" as const, op: "contains" as TextOp, value: "" };
  const valueless = textF.op === "empty" || textF.op === "notEmpty";
  return (
    <div className="space-y-2">
      <select
        className="w-full h-8 text-xs border border-gray-200 rounded-md px-2 bg-white"
        value={textF.op}
        onChange={(e) => {
          const op = e.target.value as TextOp;
          query.setFilter(col.id, { kind: "text", op, value: op === "empty" || op === "notEmpty" ? "" : textF.value });
        }}
      >
        {TEXT_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {!valueless && (
        <Input
          autoFocus
          placeholder="Value…"
          className="h-8 text-xs"
          value={textF.value}
          onChange={(e) => query.setFilter(col.id, { kind: "text", op: textF.op, value: e.target.value })}
        />
      )}
    </div>
  );
}
