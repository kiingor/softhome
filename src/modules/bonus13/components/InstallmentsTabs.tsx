import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { formatCurrency } from "@/lib/formatters";
import { CheckCircle, CircleNotch as Loader2, Info } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useBonusPayments, useTogglePaymentPaid } from "../hooks/use-bonus-payments";
import type { BonusInstallment, BonusPayment } from "../lib/bonus-types";

type Props = {
  periodId: string;
  year: number;
};

export function InstallmentsTabs({ periodId, year }: Props) {
  const { data, isLoading } = useBonusPayments(periodId);
  const toggle = useTogglePaymentPaid();

  const grouped = useMemo(() => {
    const f: BonusPayment[] = [];
    const s: BonusPayment[] = [];
    const sg: BonusPayment[] = [];
    if (!data) return { first: f, second: s, single: sg };
    for (const p of data.payments) {
      if (p.installment === "first") f.push(p);
      else if (p.installment === "second") s.push(p);
      else sg.push(p);
    }
    return { first: f, second: s, single: sg };
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-16 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.payments.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Nenhuma parcela gerada ainda. Use "Gerar Pagamentos" pra criar Nov/Dez.
        </CardContent>
      </Card>
    );
  }

  const handleToggle = async (
    paymentId: string,
    paid: boolean,
    installment: BonusInstallment,
    collaboratorId: string,
    amount: number,
  ) => {
    try {
      await toggle.mutateAsync({
        paymentId,
        paid,
        installment,
        collaboratorId,
        year,
        amount,
      });
      if (paid) toast.success("Pagamento marcado e colaborador notificado.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <Tabs defaultValue="first">
      <TabsList>
        <TabsTrigger value="first">
          Novembro <Badge variant="secondary" className="ml-2">{grouped.first.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="second">
          Dezembro <Badge variant="secondary" className="ml-2">{grouped.second.length}</Badge>
        </TabsTrigger>
        {grouped.single.length > 0 && (
          <TabsTrigger value="single">
            Avulsos <Badge variant="secondary" className="ml-2">{grouped.single.length}</Badge>
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="first">
        <InstallmentList
          payments={grouped.first}
          entriesById={data.entriesById}
          installment="first"
          year={year}
          onToggle={handleToggle}
          isPending={toggle.isPending}
          label="1ª parcela (Novembro)"
        />
      </TabsContent>
      <TabsContent value="second">
        <InstallmentList
          payments={grouped.second}
          entriesById={data.entriesById}
          installment="second"
          year={year}
          onToggle={handleToggle}
          isPending={toggle.isPending}
          label="2ª parcela (Dezembro)"
        />
      </TabsContent>
      {grouped.single.length > 0 && (
        <TabsContent value="single">
          <InstallmentList
            payments={grouped.single}
            entriesById={data.entriesById}
            installment="single"
            year={year}
            onToggle={handleToggle}
            isPending={toggle.isPending}
            label="Pagamentos avulsos / antecipados"
          />
        </TabsContent>
      )}
    </Tabs>
  );
}

type ListProps = {
  payments: Array<{
    id: string;
    entry_id: string;
    amount: number;
    paid_at: string | null;
  }>;
  entriesById: Map<
    string,
    {
      id: string;
      collaborator_id: string;
      collaborator: { name: string; cpf: string; email: string | null };
    }
  >;
  installment: BonusInstallment;
  year: number;
  onToggle: (
    paymentId: string,
    paid: boolean,
    installment: BonusInstallment,
    collaboratorId: string,
    amount: number,
  ) => Promise<void>;
  isPending: boolean;
  label: string;
};

function InstallmentList({
  payments,
  entriesById,
  installment,
  onToggle,
  isPending,
  label,
}: ListProps) {
  const total = payments.length;
  const paid = payments.filter((p) => p.paid_at).length;
  const totalAmount = payments.reduce((acc, p) => acc + Number(p.amount), 0);
  const paidAmount = payments
    .filter((p) => p.paid_at)
    .reduce((acc, p) => acc + Number(p.amount), 0);
  const pct = total > 0 ? (paid / total) * 100 : 0;

  if (payments.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nada por aqui.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-6 py-4 border-b space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">{label}</h3>
              <p className="text-xs text-muted-foreground">
                {paid} de {total} pagas — {formatCurrency(paidAmount)} de{" "}
                {formatCurrency(totalAmount)}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle
                className={`w-4 h-4 ${paid === total ? "text-emerald-600" : "text-muted-foreground/40"}`}
                weight="duotone"
              />
              <span className="tabular-nums font-medium">{Math.round(pct)}%</span>
            </div>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        <ul className="divide-y">
          {payments.map((p) => {
            const entry = entriesById.get(p.entry_id);
            const isPaid = !!p.paid_at;
            return (
              <li
                key={p.id}
                className="px-6 py-3 flex items-center gap-4 hover:bg-muted/30"
              >
                <Checkbox
                  checked={isPaid}
                  disabled={isPending}
                  onCheckedChange={(checked) =>
                    entry &&
                    onToggle(
                      p.id,
                      !!checked,
                      installment,
                      entry.collaborator_id,
                      Number(p.amount),
                    )
                  }
                  aria-label="Marcar como pago"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm capitalize truncate">
                    {entry?.collaborator.name.toLowerCase() ?? "—"}
                  </div>
                  {p.paid_at && (
                    <div className="text-xs text-emerald-700">
                      Pago em {new Date(p.paid_at).toLocaleDateString("pt-BR")} às{" "}
                      {new Date(p.paid_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Hover com breakdown bruto/INSS/IRPF/líquido pra 2ª parcela com descontos */}
                  {(p as { notes?: string | null }).notes && (
                    <HoverCard openDelay={150} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                          aria-label="Ver desconto"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <Info className="w-3.5 h-3.5" weight="fill" />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent align="end" className="w-64 text-xs">
                        <PaymentBreakdown
                          notes={(p as { notes?: string | null }).notes ?? ""}
                          netAmount={Number(p.amount)}
                        />
                      </HoverCardContent>
                    </HoverCard>
                  )}
                  <div className="text-sm font-semibold tabular-nums">
                    {formatCurrency(Number(p.amount))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Renderiza o breakdown a partir do `notes` armazenado no payment.
 * Formato: "Bruto: 1234.56 − INSS: 100.00 − IRPF: 50.00"
 */
function PaymentBreakdown({
  notes,
  netAmount,
}: {
  notes: string;
  netAmount: number;
}) {
  const parse = (label: string) => {
    const m = notes.match(new RegExp(`${label}:\\s*([\\d.]+)`));
    return m ? parseFloat(m[1]) : 0;
  };
  const bruto = parse("Bruto");
  const inss = parse("INSS");
  const irpf = parse("IRPF");
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        2ª parcela (desconto integral)
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Saldo do bruto</span>
        <span className="font-mono">{formatCurrency(bruto / 2)}</span>
      </div>
      {inss > 0 && (
        <div className="flex items-center justify-between gap-2 text-rose-700 dark:text-rose-300">
          <span>− INSS (sobre {formatCurrency(bruto)})</span>
          <span className="font-mono">{formatCurrency(inss)}</span>
        </div>
      )}
      {irpf > 0 && (
        <div className="flex items-center justify-between gap-2 text-rose-700 dark:text-rose-300">
          <span>− IRPF (sobre {formatCurrency(bruto)})</span>
          <span className="font-mono">{formatCurrency(irpf)}</span>
        </div>
      )}
      <div className="border-t border-border pt-1.5 flex items-center justify-between gap-2 font-medium">
        <span>Líquido a pagar</span>
        <span className="font-mono text-orange-700 dark:text-orange-300">
          {formatCurrency(netAmount)}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground/80 pt-1 italic">
        IRPF do 13º não usa o redutor da Lei 14.973/2024.
      </p>
    </div>
  );
}
