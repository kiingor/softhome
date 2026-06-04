import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDashboard } from "@/contexts/DashboardContext";
import { feedbackService, type ObjetivoPayload } from "../services/feedback.service";
import { todayISO } from "../lib";

/** Painel de feedbacks, opcionalmente filtrado por Guardião (lancamentoUsuarioId). */
export function useFeedbacks(filters: { lancamentoUsuarioId?: number } = {}) {
  const { currentCompany } = useDashboard();
  const companyId = currentCompany?.id;
  return useQuery({
    queryKey: ["feedbacks", companyId, filters.lancamentoUsuarioId ?? null],
    queryFn: () =>
      feedbackService.listFeedbacks(companyId!, {
        lancamentoUsuarioId: filters.lancamentoUsuarioId,
      }),
    enabled: !!companyId,
  });
}

/** Typeahead de colaboradores (busca-colaborador). `enabled` evita buscar com o popover fechado. */
export function useColaboradorSearch(q: string, enabled = true) {
  const { currentCompany } = useDashboard();
  const companyId = currentCompany?.id;
  return useQuery({
    queryKey: ["busca-colaborador", companyId, q],
    queryFn: () => feedbackService.buscaColaborador(companyId!, q),
    enabled: !!companyId && enabled,
    staleTime: 60_000,
  });
}

/** Objetivos/feedbacks de um colaborador específico. */
export function useObjetivos(colaboradorId: number | null) {
  const { currentCompany } = useDashboard();
  const companyId = currentCompany?.id;
  return useQuery({
    queryKey: ["objetivos", companyId, colaboradorId],
    queryFn: () => feedbackService.listObjetivos(companyId!, colaboradorId!),
    enabled: !!companyId && colaboradorId != null,
  });
}

/** CRUD de objetivos de um colaborador. Invalida objetivos + painel (contagens mudam). */
export function useObjetivoMutations(colaboradorId: number | null) {
  const { currentCompany } = useDashboard();
  const companyId = currentCompany?.id;
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["objetivos", companyId, colaboradorId] });
    queryClient.invalidateQueries({ queryKey: ["feedbacks", companyId] });
  };

  const ensureCtx = () => {
    if (!companyId || colaboradorId == null) {
      throw new Error("Empresa ou colaborador não definido.");
    }
    return { companyId, colaboradorId };
  };

  const create = useMutation({
    mutationFn: (input: {
      lancamentoUsuarioId: number;
      tipo: string;
      comentario?: string;
      mostrarSuporte: boolean;
    }) => {
      const { companyId, colaboradorId } = ensureCtx();
      const hoje = todayISO();
      const data: ObjetivoPayload = {
        tipo: input.tipo,
        comentario: (input.comentario ?? "").trim(),
        mostrarSuporte: input.mostrarSuporte,
        lancamentoUsuarioId: input.lancamentoUsuarioId,
        datas: hoje,
        lancamentoDatas: hoje,
      };
      return feedbackService.createObjetivo(companyId, colaboradorId, data);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Feedback registrado ✓");
    },
    onError: (e: Error) => toast.error("Não rolou. " + (e.message ?? "Tenta de novo?")),
  });

  const update = useMutation({
    mutationFn: (input: {
      itemId: number;
      tipo: string;
      comentario?: string;
      mostrarSuporte: boolean;
    }) => {
      const { companyId, colaboradorId } = ensureCtx();
      // PATCH parcial: mexe só nos 3 campos do form. Quem lançou e as datas
      // originais ficam preservados.
      const data: ObjetivoPayload = {
        tipo: input.tipo,
        comentario: (input.comentario ?? "").trim(),
        mostrarSuporte: input.mostrarSuporte,
      };
      return feedbackService.updateObjetivo(companyId, colaboradorId, input.itemId, data);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Feedback atualizado ✓");
    },
    onError: (e: Error) => toast.error("Não rolou. " + (e.message ?? "Tenta de novo?")),
  });

  const remove = useMutation({
    mutationFn: (itemId: number) => {
      const { companyId, colaboradorId } = ensureCtx();
      return feedbackService.deleteObjetivo(companyId, colaboradorId, itemId);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Feedback removido.");
    },
    onError: (e: Error) => toast.error("Não rolou. " + (e.message ?? "Tenta de novo?")),
  });

  return { create, update, remove };
}
