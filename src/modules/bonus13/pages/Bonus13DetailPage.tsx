import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PermissionGuard from "@/components/dashboard/PermissionGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CircleNotch as Loader2,
  ArrowLeft,
  Confetti,
  Users,
} from "@phosphor-icons/react";
import { formatCurrency } from "@/lib/formatters";
import {
  useBonusPeriod,
  useReopenBonusPeriod,
} from "../hooks/use-bonus-periods";
import { useBonusEntries } from "../hooks/use-bonus-entries";
import { BonusEntriesTable } from "../components/BonusEntriesTable";
import { EditEntryValueDialog } from "../components/EditEntryValueDialog";
import { RequestIndividualDialog } from "../components/RequestIndividualDialog";
import { AnticipateDialog } from "../components/AnticipateDialog";
import { GeneratePaymentsButton } from "../components/GeneratePaymentsButton";
import { InstallmentsTabs } from "../components/InstallmentsTabs";
import {
  BONUS_STATUS_LABELS,
  type BonusEntryWithCollaborator,
} from "../lib/bonus-types";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  aberto: "bg-blue-100 text-blue-700",
  pagamento: "bg-amber-100 text-amber-700",
  concluido: "bg-emerald-100 text-emerald-700",
};

export default function Bonus13DetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: period, isLoading: periodLoading } = useBonusPeriod(id ?? null);
  const { data: entries = [], isLoading: entriesLoading } = useBonusEntries(
    id ?? null,
  );
  const reopen = useReopenBonusPeriod();

  const [editing, setEditing] = useState<BonusEntryWithCollaborator | null>(null);
  const [requestingIndividual, setRequestingIndividual] =
    useState<BonusEntryWithCollaborator | null>(null);
  const [anticipating, setAnticipating] =
    useState<BonusEntryWithCollaborator | null>(null);
  const [confirmingReopen, setConfirmingReopen] = useState(false);

  const stats = useMemo(() => {
    let batch = 0;
    let individual = 0;
    let anticipated = 0;
    let totalGross = 0;
    for (const e of entries) {
      if (e.mode === "batch") batch++;
      else if (e.mode === "individual") individual++;
      else if (e.mode === "anticipated") anticipated++;
      totalGross += Number(e.gross_value);
    }
    return { batch, individual, anticipated, totalGross };
  }, [entries]);

  const isLoading = periodLoading || entriesLoading;
  const isReadOnly = period?.status !== "aberto";

  const handleReopen = async () => {
    if (!period) return;
    try {
      await reopen.mutateAsync(period.id);
      toast.success("Campanha reaberta.");
      setConfirmingReopen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao reabrir");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!period) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Campanha não encontrada.</p>
        <Button asChild variant="link">
          <Link to="/dashboard/decimo-terceiro">Voltar</Link>
        </Button>
      </div>
    );
  }

  return (
    <PermissionGuard module="decimo_terceiro">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="shrink-0">
              <Link to="/dashboard/decimo-terceiro" aria-label="Voltar">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Confetti className="w-6 h-6 text-primary" weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">
                  13º Salário · {period.year}
                </h1>
                <Badge
                  variant="outline"
                  className={`font-normal border-0 ${STATUS_COLORS[period.status] ?? ""}`}
                >
                  {BONUS_STATUS_LABELS[period.status]}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                Aberto em{" "}
                {new Date(period.opened_at).toLocaleDateString("pt-BR")}
                {period.generated_at &&
                  ` · pagamentos gerados em ${new Date(period.generated_at).toLocaleDateString("pt-BR")}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {period.status === "aberto" && (
              <GeneratePaymentsButton
                periodId={period.id}
                batchCount={stats.batch}
              />
            )}
            {period.status === "pagamento" && (
              <Button
                variant="outline"
                onClick={() => setConfirmingReopen(true)}
                disabled={reopen.isPending}
              >
                {reopen.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Reabrir campanha
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="No lote"
            value={stats.batch}
            color="text-blue-700"
          />
          <StatCard
            label="Antecipados"
            value={stats.anticipated}
            color="text-emerald-700"
          />
          <StatCard
            label="Avulsos"
            value={stats.individual}
            color="text-amber-700"
          />
          <StatCard
            label="Total bruto"
            value={formatCurrency(stats.totalGross)}
            color="text-foreground"
            tabular
          />
        </div>

        {/* Conteúdo conforme status */}
        {period.status === "aberto" ? (
          <Card>
            <CardContent className="p-0">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  Colaboradores na campanha
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Use o menu (⋯) pra antecipar, solicitar pagamento individual,
                  ou ajustar valores. Quando terminar, clique em "Gerar Pagamentos".
                </p>
              </div>
              <BonusEntriesTable
                entries={entries}
                onEdit={setEditing}
                onRequestIndividual={setRequestingIndividual}
                onAnticipate={setAnticipating}
              />
            </CardContent>
          </Card>
        ) : (
          <InstallmentsTabs periodId={period.id} year={period.year} />
        )}

        {/* Dialogs */}
        <EditEntryValueDialog
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          entry={editing}
        />
        <RequestIndividualDialog
          open={!!requestingIndividual}
          onOpenChange={(open) => !open && setRequestingIndividual(null)}
          entry={requestingIndividual}
          year={period.year}
        />
        <AnticipateDialog
          open={!!anticipating}
          onOpenChange={(open) => !open && setAnticipating(null)}
          entry={anticipating}
          year={period.year}
        />

        <AlertDialog
          open={confirmingReopen}
          onOpenChange={(open) => !open && setConfirmingReopen(false)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Reabrir campanha de {period.year}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Parcelas pendentes (não pagas) serão removidas; as já pagas
                ficam preservadas. Você poderá ajustar a campanha e gerar novos
                pagamentos depois.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={reopen.isPending}>
                Voltar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleReopen();
                }}
                disabled={reopen.isPending}
              >
                {reopen.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Reabrir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PermissionGuard>
  );
}

function StatCard({
  label,
  value,
  color,
  tabular = false,
}: {
  label: string;
  value: string | number;
  color: string;
  tabular?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p
          className={`text-xl font-bold mt-1 ${color} ${tabular ? "tabular-nums" : ""}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
