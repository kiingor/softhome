import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * KPI block da folha. Usado nas abas Lançamentos e Pagamentos — cada aba mostra
 * os SEUS totais (lançamentos exclui bonificação/custo-setor; pagamentos são
 * líquidos, sem FGTS/benefícios/estornos).
 *
 * O valor sai em `.mono` (JetBrains Mono com `tnum`): números de largura fixa
 * fazem os blocos alinharem entre si mesmo com valores de tamanhos diferentes.
 */
export function StatBlock({
  label,
  value,
  tom,
}: {
  label: string;
  value: string;
  /** `positivo` = entrada/provento, `negativo` = desconto. Antes os nomes eram
   *  "emerald"/"rose" — cor de paleta virando nome de regra de negócio, o que
   *  ficou incoerente quando a paleta mudou. */
  tom?: "positivo" | "negativo";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="label-eyebrow">{label}</p>
        <p
          className={cn(
            "mono mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.02em]",
            tom === "positivo" && "text-success",
            tom === "negativo" && "text-destructive",
            !tom && "text-foreground",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
