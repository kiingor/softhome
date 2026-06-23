import { Card, CardContent } from "@/components/ui/card";

/**
 * KPI block da folha. Usado nas abas Lançamentos e Pagamentos — cada aba mostra
 * os SEUS totais (lançamentos exclui bonificação/custo-setor; pagamentos são
 * líquidos, sem FGTS/benefícios/estornos).
 */
export function StatBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "rose";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p
          className={`text-xl font-light mt-1 ${
            accent === "emerald"
              ? "text-orange-700 dark:text-orange-400"
              : accent === "rose"
              ? "text-rose-700 dark:text-rose-400"
              : "text-foreground"
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
