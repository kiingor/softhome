import { Link } from "react-router-dom";
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Brain,
  Lightbulb,
  Heart,
  CircleNotch as Loader2,
} from "@phosphor-icons/react";
import { useAdmissionTests, type AdmissionTest } from "../hooks/use-admission-tests";
import { getTestDefinition } from "../lib/tests";

const CATEGORY_LABELS: Record<string, { label: string; icon: typeof Brain }> = {
  aptidao: { label: "Aptidão", icon: Lightbulb },
  comportamental: { label: "Comportamental", icon: Heart },
  personalidade: { label: "Personalidade", icon: Brain },
};

export default function AdmissionTestsCatalogPage() {
  const { tests, isLoading, updateTest } = useAdmissionTests();

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, AdmissionTest[]>();
    for (const t of tests) {
      const cat = t.category ?? "outros";
      const arr = map.get(cat) ?? [];
      arr.push(t);
      map.set(cat, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [tests]);

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/dashboard/admissoes">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Admissões
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Catálogo de Testes</h1>
        <p className="text-muted-foreground text-sm">
          Ative os testes que vão aparecer pra escolher na criação da admissão.
          Cada teste pode ter limite de tempo e permitir pausa ou não.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-8">
          {groupedByCategory.map(([category, list]) => {
            const meta = CATEGORY_LABELS[category] ?? { label: category, icon: Lightbulb };
            const Icon = meta.icon;
            return (
              <section key={category} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5 text-primary" weight="duotone" />
                  <h2 className="font-semibold text-foreground">{meta.label}</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {list.map((test) => (
                    <TestRow
                      key={test.id}
                      test={test}
                      onChange={(patch) =>
                        updateTest.mutate({ id: test.id, ...patch })
                      }
                      isPending={updateTest.isPending}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TestRow({
  test,
  onChange,
  isPending,
}: {
  test: AdmissionTest;
  onChange: (patch: Partial<AdmissionTest>) => void;
  isPending: boolean;
}) {
  const def = getTestDefinition(test.slug);
  const totalQuestions = def?.questions.length ?? 0;

  return (
    <Card className={test.is_active ? "" : "opacity-60"}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground truncate">{test.name}</h3>
              {test.is_active ? (
                <Badge variant="default" className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">
                  Ativo
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  Inativo
                </Badge>
              )}
            </div>
            {test.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{test.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {totalQuestions} {totalQuestions === 1 ? "pergunta" : "perguntas"} ·
              ~{def?.estimatedMinutes ?? "?"} min
            </p>
          </div>
          <Switch
            checked={test.is_active}
            disabled={isPending}
            onCheckedChange={(v) => onChange({ is_active: v })}
            aria-label={`Ativar/desativar ${test.name}`}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap pt-2 border-t">
          <div className="space-y-1 flex-1 min-w-[140px]">
            <Label htmlFor={`time-${test.id}`} className="text-xs">
              Tempo limite (min)
            </Label>
            <Input
              id={`time-${test.id}`}
              type="number"
              min={1}
              max={120}
              placeholder="Sem limite"
              value={test.time_limit_minutes ?? ""}
              disabled={isPending}
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                onChange({ time_limit_minutes: v });
              }}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch
              id={`pause-${test.id}`}
              checked={test.allow_pause}
              disabled={isPending}
              onCheckedChange={(v) => onChange({ allow_pause: v })}
            />
            <Label htmlFor={`pause-${test.id}`} className="text-xs cursor-pointer">
              Permitir pausa
            </Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
