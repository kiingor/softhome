import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SealCheck, Plus } from "@phosphor-icons/react";
import { formatPeriodLabel } from "../../types";
import { usePayrollValidations } from "../../hooks/use-payroll-validation";
import { ValidationUpload } from "./ValidationUpload";
import { ValidationResults } from "./ValidationResults";
import { ValidationLog } from "./ValidationLog";

interface Props {
  companyId?: string;
  referenceMonth?: string; // YYYY-MM-01
  canManage: boolean;
}

export function PayrollValidationButton({ companyId, referenceMonth, canManage }: Props) {
  const [open, setOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: validations = [], isLoading } = usePayrollValidations(
    open ? companyId : undefined,
    open ? referenceMonth : undefined,
  );

  const effective = useMemo(() => {
    if (validations.length === 0) return null;
    return validations.find((v) => v.id === selectedId) ?? validations[0];
  }, [validations, selectedId]);

  // Badge no botão: % da validação mais recente (se houver).
  const latest = validations[0];
  const pct = latest
    ? latest.items_total === 0
      ? 100
      : Math.round((latest.items_resolved / latest.items_total) * 100)
    : null;

  const showUploadView = showUpload || (!isLoading && !effective);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <SealCheck className="w-4 h-4 mr-2" weight="fill" />
        Validar folha
        {pct != null && (
          <Badge
            variant="secondary"
            className={`ml-2 ${pct === 100 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : ""}`}
          >
            {pct}%
          </Badge>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2">
              <SealCheck className="w-5 h-5 text-primary" weight="fill" />
              Validação da Folha
            </SheetTitle>
            <SheetDescription>
              {referenceMonth ? formatPeriodLabel(referenceMonth) : ""} · concilia a folha com os PDFs da contabilidade.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4">
            {showUploadView ? (
              <div className="space-y-4">
                {effective && (
                  <Button variant="ghost" size="sm" onClick={() => setShowUpload(false)}>
                    ← Voltar pra validação atual
                  </Button>
                )}
                {!canManage ? (
                  <p className="text-sm text-muted-foreground">
                    Você não tem permissão pra iniciar uma validação.
                  </p>
                ) : (
                  <ValidationUpload
                    companyId={companyId}
                    referenceMonth={referenceMonth}
                    onDone={(id) => {
                      setSelectedId(id);
                      setShowUpload(false);
                    }}
                  />
                )}
              </div>
            ) : effective ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  {validations.length > 1 ? (
                    <Select value={effective.id} onValueChange={setSelectedId}>
                      <SelectTrigger className="h-8 w-[230px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {validations.map((v) => (
                          <SelectItem key={v.id} value={v.id} className="text-xs">
                            {new Date(v.created_at).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            · {v.pdf_file_names.length} PDF(s)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {effective.pdf_file_names.length} PDF(s) ·{" "}
                      {new Date(effective.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                  {canManage && (
                    <Button size="sm" variant="outline" onClick={() => setShowUpload(true)}>
                      <Plus className="w-4 h-4 mr-1.5" /> Nova validação
                    </Button>
                  )}
                </div>

                <Tabs defaultValue="divergencias">
                  <TabsList>
                    <TabsTrigger value="divergencias">Divergências</TabsTrigger>
                    <TabsTrigger value="log">Histórico</TabsTrigger>
                  </TabsList>
                  <TabsContent value="divergencias" className="mt-3">
                    <ValidationResults
                      validation={effective}
                      companyId={companyId}
                      referenceMonth={referenceMonth}
                      canManage={canManage}
                    />
                  </TabsContent>
                  <TabsContent value="log" className="mt-3">
                    <ValidationLog validationId={effective.id} />
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
