import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortal } from "@/contexts/PortalContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DownloadSimple,
  FileText,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  FilePdf,
  Calendar,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { getMonthName } from "@/lib/formatters";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const MeusContracheques = () => {
  const { collaborator } = usePortal();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const currentYear = new Date().getFullYear();

  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ["my-payslips", collaborator?.id, selectedYear],
    queryFn: async () => {
      if (!collaborator?.id) return [];
      const { data, error } = await supabase
        .from("payslips")
        .select("*")
        .eq("collaborator_id", collaborator.id)
        .eq("year", selectedYear)
        .order("month", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!collaborator?.id,
  });

  const handleDownload = async (payslip: any) => {
    try {
      const { data, error } = await supabase.storage
        .from("payslips")
        .download(payslip.file_url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        payslip.file_name || `contracheque_${payslip.month}_${payslip.year}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Download iniciado!");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Erro ao baixar o arquivo");
    }
  };

  const navigateYear = (direction: "prev" | "next") => {
    setSelectedYear(direction === "prev" ? selectedYear - 1 : selectedYear + 1);
  };

  const payslipByMonth = new Map<number, (typeof payslips)[number]>();
  for (const p of payslips) payslipByMonth.set(p.month, p);

  const availableCount = payslips.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="w-6 h-6 text-primary" weight="duotone" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meus Contracheques</h1>
          <p className="text-muted-foreground">
            Baixe seus contracheques disponibilizados pelo RH
          </p>
        </div>
      </div>

      {/* Year Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigateYear("prev")}
              aria-label="Ano anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <p className="font-semibold text-xl tabular-nums">{selectedYear}</p>
              {!isLoading && availableCount > 0 && (
                <Badge variant="secondary" className="font-normal">
                  {availableCount}{" "}
                  {availableCount === 1 ? "disponível" : "disponíveis"}
                </Badge>
              )}
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => navigateYear("next")}
              disabled={selectedYear >= currentYear}
              aria-label="Próximo ano"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payslips Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5 text-primary" />
            Contracheques de {selectedYear}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 rounded-lg bg-muted/50 animate-pulse"
                />
              ))}
            </div>
          ) : availableCount === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
                <FilePdf
                  className="w-10 h-10 text-muted-foreground"
                  weight="duotone"
                />
              </div>
              <h3 className="font-semibold text-foreground mb-1">
                Ainda não há contracheques por aqui
              </h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                Quando o RH publicar seus contracheques de {selectedYear}, eles
                aparecerão aqui pra você baixar.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {MONTHS.map((m) => {
                const payslip = payslipByMonth.get(m);
                const monthName = getMonthName(m);
                const available = !!payslip;

                return (
                  <div
                    key={m}
                    className={`group rounded-lg border p-4 flex flex-col gap-3 transition-colors ${
                      available
                        ? "bg-card hover:border-primary/40 hover:bg-accent/30"
                        : "bg-muted/30 border-dashed"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold capitalize text-foreground">
                          {monthName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedYear}
                        </p>
                      </div>
                      {available ? (
                        <FilePdf
                          className="w-5 h-5 text-primary shrink-0"
                          weight="duotone"
                        />
                      ) : (
                        <FilePdf
                          className="w-5 h-5 text-muted-foreground/40 shrink-0"
                          weight="duotone"
                        />
                      )}
                    </div>

                    {available ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-auto group-hover:border-primary/40"
                        onClick={() => handleDownload(payslip)}
                      >
                        <DownloadSimple className="w-4 h-4 mr-1.5" />
                        Baixar
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-auto">
                        Indisponível
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MeusContracheques;
