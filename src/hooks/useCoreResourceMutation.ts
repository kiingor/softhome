// Hook helper: orquestra mutations de stores/teams/positions via edge function
// `core-resource-mutate`, que faz PUSH pra api.softcom.cloud antes de gravar
// local.
//
// Substitui chamadas diretas tipo `supabase.from('stores').insert(...)` —
// essas NÃO sincronizam com a agenda. Use sempre este hook nas páginas
// EmpresasPage/SetoresPage/CargosPage.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";

type Resource = "stores" | "teams" | "positions";
type Action = "create" | "update" | "delete";

const RESOURCE_LABEL: Record<Resource, { singular: string; queryKey: string }> = {
  stores: { singular: "Empresa", queryKey: "stores" },
  teams: { singular: "Setor", queryKey: "teams" },
  positions: { singular: "Cargo", queryKey: "positions" },
};

interface MutateArgs {
  action: Action;
  /** uuid local — obrigatório em update/delete */
  id?: string;
  /** Campos da row em create/update */
  data?: Record<string, unknown>;
}

interface ResourceOptions {
  /**
   * Empurra a mutação pra api.softcom.cloud antes de gravar local (default true).
   * `cargos` (positions) usa false: a agenda responde 404 em escrita de cargo
   * e os campos editados aqui (periodicidade de exame, % de encargos, grupo de
   * risco) são locais — não existem no contrato remoto.
   */
  syncToRemote?: boolean;
}

export function useCoreResourceMutation(
  resource: Resource,
  options?: ResourceOptions,
) {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const meta = RESOURCE_LABEL[resource];

  return useMutation({
    mutationFn: async (args: MutateArgs) => {
      if (!currentCompany?.id) {
        throw new Error("Empresa não selecionada.");
      }
      const { data, error } = await supabase.functions.invoke("core-resource-mutate", {
        body: {
          resource,
          action: args.action,
          companyId: currentCompany.id,
          id: args.id,
          data: args.data,
          syncToRemote: options?.syncToRemote ?? true,
        },
      });
      if (error) {
        // Edge function lança via response.status — error.message já traz contexto
        throw new Error(error.message ?? "Falha na operação.");
      }
      // A edge function pode responder 4xx/5xx com error no body
      if (data && typeof data === "object" && "error" in data) {
        const errPayload = data as { error: string; details?: string };
        throw new Error(
          errPayload.details ? `${errPayload.error}: ${errPayload.details}` : errPayload.error,
        );
      }
      return data as { success: boolean; localId?: string; remote?: unknown };
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [meta.queryKey] });
      queryClient.invalidateQueries({ queryKey: [meta.queryKey, currentCompany?.id] });
      const verb =
        vars.action === "create"
          ? "criada"
          : vars.action === "update"
          ? "atualizada"
          : "removida";
      const suffix = (options?.syncToRemote ?? true) ? " (sincronizado com a agenda)" : "";
      toast.success(`${meta.singular} ${verb} ✓${suffix}`);
    },
    onError: (err: Error) => {
      toast.error("Não rolou: " + err.message);
    },
  });
}
