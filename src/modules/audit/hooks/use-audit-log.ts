import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  company_id: string | null;
  action: "insert" | "update" | "delete";
  table_name: string;
  record_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogRowWithUser extends AuditLogRow {
  user_name: string | null;
  user_email: string | null;
}

export interface AuditLogFilters {
  dateFrom: string | null; // ISO date YYYY-MM-DD (inclusive)
  dateTo: string | null; // ISO date YYYY-MM-DD (inclusive — somamos 1 dia internamente)
  userId: string | null;
  tableName: string | null;
  action: "insert" | "update" | "delete" | null;
  recordId: string | null; // filtrar por ID específico (ex: colaborador)
  page: number; // 0-indexed
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 50;

export function useAuditLog(filters: AuditLogFilters) {
  const { currentCompany } = useDashboard();
  const companyId = currentCompany?.id;

  return useQuery({
    queryKey: [
      "audit-log",
      companyId,
      filters.dateFrom,
      filters.dateTo,
      filters.userId,
      filters.tableName,
      filters.action,
      filters.recordId,
      filters.page,
      filters.pageSize,
    ],
    queryFn: async () => {
      if (!companyId) return { rows: [], total: 0 };

      const from = filters.page * filters.pageSize;
      const to = from + filters.pageSize - 1;

      let q = supabase
        .from("audit_log")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filters.dateFrom) {
        q = q.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
      }
      if (filters.dateTo) {
        // Inclusivo no fim do dia
        const end = new Date(`${filters.dateTo}T00:00:00.000Z`);
        end.setUTCDate(end.getUTCDate() + 1);
        q = q.lt("created_at", end.toISOString());
      }
      if (filters.userId) q = q.eq("user_id", filters.userId);
      if (filters.tableName) q = q.eq("table_name", filters.tableName);
      if (filters.action) q = q.eq("action", filters.action);
      if (filters.recordId) q = q.eq("record_id", filters.recordId);

      const { data, error, count } = await q;
      if (error) throw error;

      const rows = (data ?? []) as AuditLogRow[];

      // Resolve nome/email dos usuários em duas queries paralelas:
      // - profiles.user_id → profiles.full_name (todos os usuários têm profile)
      // - company_users.user_id → email + full_name (cobertura adicional pra
      //   convidados via dashboard, que sempre têm email cadastrado)
      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id)),
      );

      const userMap = new Map<string, { name: string | null; email: string | null }>();
      if (userIds.length > 0) {
        const [profilesRes, cuRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", userIds),
          supabase
            .from("company_users")
            .select("user_id, full_name, email")
            .in("user_id", userIds),
        ]);

        for (const p of (profilesRes.data ?? []) as Array<{
          user_id: string;
          full_name: string | null;
        }>) {
          userMap.set(p.user_id, { name: p.full_name, email: null });
        }
        for (const cu of (cuRes.data ?? []) as Array<{
          user_id: string | null;
          full_name: string | null;
          email: string;
        }>) {
          if (!cu.user_id) continue;
          const existing = userMap.get(cu.user_id);
          userMap.set(cu.user_id, {
            name: existing?.name ?? cu.full_name ?? null,
            email: cu.email,
          });
        }
      }

      const enriched: AuditLogRowWithUser[] = rows.map((r) => {
        const u = r.user_id ? userMap.get(r.user_id) : null;
        return {
          ...r,
          user_name: u?.name ?? null,
          user_email: u?.email ?? null,
        };
      });

      return { rows: enriched, total: count ?? rows.length };
    },
    enabled: !!companyId,
  });
}

// Lista distinta de tabelas auditadas pra popular o select de filtro.
export function useAuditedTables() {
  const { currentCompany } = useDashboard();
  return useQuery({
    queryKey: ["audit-log-tables", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [] as string[];
      const { data, error } = await supabase
        .from("audit_log")
        .select("table_name")
        .eq("company_id", currentCompany.id);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of (data ?? []) as { table_name: string }[]) {
        set.add(r.table_name);
      }
      return [...set].sort();
    },
    enabled: !!currentCompany?.id,
  });
}

// Lista de usuários que aparecem como autores de alterações pra popular
// o select de filtro.
export function useAuditedUsers() {
  const { currentCompany } = useDashboard();
  return useQuery({
    queryKey: ["audit-log-users", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [] as Array<{
        id: string;
        name: string | null;
        email: string | null;
      }>;
      const { data: distinct, error } = await supabase
        .from("audit_log")
        .select("user_id")
        .eq("company_id", currentCompany.id)
        .not("user_id", "is", null);
      if (error) throw error;

      const ids = Array.from(
        new Set(
          ((distinct ?? []) as { user_id: string | null }[])
            .map((r) => r.user_id)
            .filter((id): id is string => !!id),
        ),
      );
      if (ids.length === 0) return [];

      const [profilesRes, cuRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", ids),
        supabase
          .from("company_users")
          .select("user_id, full_name, email")
          .in("user_id", ids),
      ]);

      const map = new Map<string, { id: string; name: string | null; email: string | null }>();
      for (const p of (profilesRes.data ?? []) as Array<{
        user_id: string;
        full_name: string | null;
      }>) {
        map.set(p.user_id, { id: p.user_id, name: p.full_name, email: null });
      }
      for (const cu of (cuRes.data ?? []) as Array<{
        user_id: string | null;
        full_name: string | null;
        email: string;
      }>) {
        if (!cu.user_id) continue;
        const existing = map.get(cu.user_id);
        map.set(cu.user_id, {
          id: cu.user_id,
          name: existing?.name ?? cu.full_name ?? null,
          email: cu.email,
        });
      }

      return [...map.values()].sort((a, b) =>
        (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "", "pt-BR"),
      );
    },
    enabled: !!currentCompany?.id,
  });
}

export const AUDIT_DEFAULT_PAGE_SIZE = DEFAULT_PAGE_SIZE;
