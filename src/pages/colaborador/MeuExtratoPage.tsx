import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortal } from "@/contexts/PortalContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  DollarSign,
} from "lucide-react";
import { formatCurrency, getMonthName } from "@/lib/formatters";

const typeLabels: Record<string, string> = {
  salario: "Salário",
  vale: "Vale",
  custo: "Custo",
  despesa: "Despesa",
  adicional: "Adicional",
};

const typeColors: Record<string, string> = {
  salario: "bg-green-100 text-green-700",
  vale: "bg-blue-100 text-blue-700",
  custo: "bg-orange-100 text-orange-700",
  despesa: "bg-red-100 text-red-700",
  adicional: "bg-purple-100 text-purple-700",
};

const MeuExtratoPage = () => {
  const { collaborator } = usePortal();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["my-payroll-entries", collaborator?.id, selectedMonth, selectedYear],
    queryFn: async () => {
      if (!collaborator?.id) return [];
      const { data, error } = await supabase
        .from("payroll_entries")
        .select("*")
        .eq("collaborator_id", collaborator.id)
        .eq("month", selectedMonth)
        .eq("year", selectedYear)
        .order("type");
      if (error) throw error;
      return data;
    },
    enabled: !!collaborator?.id,
  });

  const totals = useMemo(() => {
    const byType: Record<string, number> = {};
    let total = 0;
    entries.forEach((entry) => {
      byType[entry.type] = (byType[entry.type] || 0) + Number(entry.value);
      total += Number(entry.value);
    });
    return { byType, total };
  }, [entries]);

  const navigatePeriod = (direction: "prev" | "next") => {
    if (direction === "prev") {
      if (selectedMonth === 1) {
        setSelectedMonth(12);
        setSelectedYear(selectedYear - 1);
      } else {
        setSelectedMonth(selectedMonth - 1);
      }
    } else {
      if (selectedMonth === 12) {
        setSelectedMonth(1);
        setSelectedYear(selectedYear + 1);
      } else {
        setSelectedMonth(selectedMonth + 1);
      }
    }
  };

  const periodLabel = `${getMonthName(selectedMonth)} de ${selectedYear}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meu Extrato</h1>
        <p className="text-muted-foreground">
          Acompanhe seus lançamentos financeiros por competência
        </p>
      </div>

      {/* Period Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigatePeriod("prev")}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-center min-w-[180px]">
              <p className="font-semibold text-lg">{periodLabel}</p>
            </div>
            <Button variant="outline" size="icon" onClick={() => navigatePeriod("next")}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="bg-primary/5 border-primary/20 col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total do Mês</p>
                <p className="text-xl font-bold text-primary">
                  {formatCurrency(totals.total)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        {Object.entries(totals.byType).map(([type, value]) => (
          <Card key={type}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{typeLabels[type]}</p>
              <p className="text-lg font-semibold">{formatCurrency(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5" />
            Lançamentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando...
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <DollarSign className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-2">
                Nenhum lançamento encontrado
              </h3>
              <p className="text-muted-foreground text-sm">
                Não há lançamentos registrados para {periodLabel.toLowerCase()}.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Badge className={typeColors[entry.type]}>
                          {typeLabels[entry.type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.description || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number(entry.value))}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50">
                    <TableCell colSpan={2} className="font-semibold">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">
                      {formatCurrency(totals.total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MeuExtratoPage;
