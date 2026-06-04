import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { FeedbacksTotais } from "../types";

const TONE: Record<string, string> = {
  amber: "text-amber-600 dark:text-amber-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  rose: "text-rose-600 dark:text-rose-400",
  default: "text-foreground",
};

export function FeedbackKpis({ totais }: { totais: FeedbacksTotais }) {
  const items: Array<{ label: string; value: number; hint: string; tone: keyof typeof TONE }> = [
    { label: "Colaboradores", value: totais.colaboradores, hint: "no painel", tone: "default" },
    { label: "Pendentes", value: totais.pendente, hint: "sem feedback", tone: "amber" },
    { label: "Em atraso", value: totais.emAtraso, hint: "+ de 120 dias", tone: "rose" },
    { label: "Em dia", value: totais.emDia, hint: "≤ 120 dias", tone: "emerald" },
    { label: "Feedbacks", value: totais.feedbacks, hint: "no total", tone: "default" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {items.map((it) => (
        <Card key={it.label}>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{it.label}</p>
            <p className={cn("text-3xl font-light mt-1", TONE[it.tone])}>{it.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{it.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
