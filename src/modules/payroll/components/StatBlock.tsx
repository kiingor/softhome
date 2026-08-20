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
    <Card className="min-w-0">
      <CardContent className="p-4">
        <p className="label-eyebrow truncate">{label}</p>
        <p
          className={cn(
            // 20px em vez de 22 e leading-tight: um valor grande como
            // "R$ 784.159,50" cabe em card mais estreito. break-words como
            // rede — se ainda faltar espaço, quebra a linha em vez de CORTAR o
            // número (cortar dígito de dinheiro vira outro valor).
            "mono mt-1.5 text-xl font-semibold leading-tight tracking-[-0.02em] break-words",
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
