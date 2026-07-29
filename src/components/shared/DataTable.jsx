import React, { useState, useMemo } from "react";
import { Search, ArrowUp, ArrowDown, ChevronsUpDown, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./Loaders";
import { EmptyState } from "@/lib/movezw";

export default function DataTable({
  columns,
  data = [],
  loading,
  searchKeys = [],
  pageSize = 8,
  emptyTitle = "No records",
  emptySubtitle,
  emptyIcon = Inbox,
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!q.trim()) return data;
    const t = q.toLowerCase();
    return data.filter((row) => searchKeys.some((k) => String(row[k] ?? "").toLowerCase().includes(t)));
  }, [data, q, searchKeys]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, totalPages);
  const pageRows = sorted.slice((current - 1) * pageSize, current * pageSize);

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  };

  return (
    <div className="bg-card rounded-2xl border border-border card-shadow overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <span className="text-xs text-muted-foreground hidden sm:block">{sorted.length} record{sorted.length === 1 ? "" : "s"}</span>
      </div>
      <div className="overflow-x-auto scroll-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn("text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground px-4 py-3 whitespace-nowrap", c.headerClassName)}>
                  {c.sortable ? (
                    <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {c.header}
                      {sort.key === c.key ? (sort.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-50" />}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  {columns.map((c, j) => (<td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>))}
                </tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <EmptyState icon={emptyIcon} title={emptyTitle} subtitle={emptySubtitle} />
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={row.id || i} className="border-t border-border hover:bg-muted/40 transition-colors">
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3 align-middle", c.cellClassName)}>
                      {c.render ? c.render(row) : (row[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!loading && sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-2 p-3 border-t border-border text-sm">
          <span className="text-xs text-muted-foreground">Page {current} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={current === 1} aria-label="Previous page" className="w-8 h-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-40 hover:bg-muted">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={current === totalPages} aria-label="Next page" className="w-8 h-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-40 hover:bg-muted">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
