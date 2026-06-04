import { useMemo, useState } from "react";
import {
  MagnifyingGlass as Search,
  Lock,
  ArrowsClockwise,
  ChatCircleText,
  Info,
} from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/shared/components/EmptyState";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeedbacks } from "../hooks/use-feedbacks";
import { GuardiaoSelect } from "../components/GuardiaoSelect";
import { FeedbackKpis } from "../components/FeedbackKpis";
import { FeedbackStatusColumn } from "../components/FeedbackStatusColumn";
import { ObjetivosSheet } from "../components/ObjetivosSheet";
import {
  FEEDBACK_STATUS_ORDER,
  type FeedbackColaborador,
  type FeedbackStatus,
  type Guardiao,
} from "../types";

export default function FeedbackColaboradorPage() {
  const { canView, canCreate, canEdit, canDelete, isLoading: permsLoading } =
    usePermissions("feedback");

  const [guardiao, setGuardiao] = useState<Guardiao | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [selected, setSelected] = useState<FeedbackColaborador | null>(null);

  const { data, isLoading, isError, isFetching, refetch } = useFeedbacks({
    lancamentoUsuarioId: guardiao?.id,
  });

  const grouped = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    const list = (data?.colaboradores ?? []).filter(
      (c) => !q || (c.nome ?? "").toLowerCase().includes(q),
    );
    const by: Record<FeedbackStatus, FeedbackColaborador[]> = {
      Pendente: [],
      "Em Atraso": [],
      "Em dia": [],
    };
    for (const c of list) {
      if (by[c.status]) by[c.status].push(c);
    }
    return by;
  }, [data, nameFilter]);

  const totalColaboradores = data?.colaboradores.length ?? 0;

  if (!permsLoading && !canView) {
    return (
      <EmptyState
        icon={<Lock className="w-7 h-7 text-primary" />}
        title="Sem acesso"
        description="Você ainda não tem permissão pra ver os feedbacks. Fala com o RH pra liberar."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Feedback Colaborador</h1>
          <p className="text-muted-foreground">
            Acompanhe os feedbacks do time e registre objetivos por colaborador.
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          disabled={isFetching}
          title="Atualizar"
        >
          <ArrowsClockwise className={isFetching ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row md:items-end gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label>Guardião(ã) da Cultura</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Sobre o Guardião(ã) da Cultura"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Opcional. Filtra o painel por quem lançou os feedbacks — e define quem lança ao
                  registrar um novo.
                </TooltipContent>
              </Tooltip>
            </div>
            <GuardiaoSelect value={guardiao} onChange={setGuardiao} className="w-full md:w-72" />
          </div>
          <div className="space-y-1.5 md:ml-auto">
            <Label htmlFor="name-filter">Buscar colaborador</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="name-filter"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Filtrar pelo nome..."
                className="pl-9 md:w-64"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-lg" />
          ))}
        </div>
      ) : data ? (
        <FeedbackKpis totais={data.totais} />
      ) : null}

      {/* Painel por status */}
      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {FEEDBACK_STATUS_ORDER.map((s) => (
            <Skeleton key={s} className="min-w-[280px] flex-1 h-[320px] rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={<ChatCircleText className="w-7 h-7 text-primary" />}
          title="Não consegui carregar os feedbacks"
          description="Pode ser conexão com a agenda. Tenta de novo?"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Recarregar
            </Button>
          }
        />
      ) : totalColaboradores === 0 ? (
        <EmptyState
          icon={<ChatCircleText className="w-7 h-7 text-primary" />}
          title="Nada por aqui ainda"
          description={
            guardiao
              ? "Esse Guardião não tem feedbacks lançados. Tenta tirar o filtro?"
              : "Ninguém no painel por enquanto."
          }
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {FEEDBACK_STATUS_ORDER.map((status) => (
            <FeedbackStatusColumn
              key={status}
              status={status}
              colaboradores={grouped[status]}
              onSelect={setSelected}
            />
          ))}
        </div>
      )}

      <ObjetivosSheet
        colaborador={selected}
        guardiao={guardiao}
        perms={{ canCreate, canEdit, canDelete }}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
