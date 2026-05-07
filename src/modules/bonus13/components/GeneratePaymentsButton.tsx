import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { CircleNotch as Loader2, Receipt } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useGeneratePayments } from "../hooks/use-bonus-periods";

type Props = {
  periodId: string;
  batchCount: number;
  disabled?: boolean;
};

export function GeneratePaymentsButton({ periodId, batchCount, disabled }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const generate = useGeneratePayments();

  const handleConfirm = async () => {
    try {
      const res = await generate.mutateAsync(periodId);
      toast.success(
        `Pagamentos gerados: ${res.count} colaboradores × 2 parcelas (Nov/Dez).`,
      );
      setConfirmOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar pagamentos");
    }
  };

  return (
    <>
      <Button
        onClick={() => setConfirmOpen(true)}
        disabled={disabled || batchCount === 0}
      >
        <Receipt className="w-4 h-4 mr-2" />
        Gerar Pagamentos
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar pagamentos?</AlertDialogTitle>
            <AlertDialogDescription>
              Vou criar 2 parcelas (Novembro e Dezembro) para os{" "}
              <strong>{batchCount}</strong> colaborador{batchCount === 1 ? "" : "es"}{" "}
              que estão no batch. Quem foi marcado como pago avulso ou antecipado
              não entra. Depois disso, o período fica em modo "pagamento" e você
              começa a marcar parcela por parcela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generate.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={generate.isPending}
              onClick={handleConfirm}
            >
              {generate.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Gerar pagamentos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
