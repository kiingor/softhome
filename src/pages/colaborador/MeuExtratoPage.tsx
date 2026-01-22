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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Gift,
  Info,
} from "lucide-react";
import { formatCurrency, getMonthName } from "@/lib/formatters";
import { calculateMonthlyBenefitValue, getBenefitCalculationDescription, DayAbbrev } from "@/lib/workingDays";

const typeLabels: Record<string, string> = {
  salario: "Salário",
  vale: "Vale",
  custo: "Custo",
  despesa: "Despesa",
  adicional: "Adicional",
  beneficio: "Benefício",
};

const typeColors: Record<string, string> = {
  salario: "bg-green-100 text-green-700",
  vale: "bg-blue-100 text-blue-700",
  custo: "bg-orange-100 text-orange-700",
  despesa: "bg-red-100 text-red-700",
  adicional: "bg-purple-100 text-purple-700",
  beneficio: "bg-teal-100 text-teal-700",
};

interface BenefitAssignment {
  id: string;
  benefit: {
    id: string;
    name: string;
    value: number;
    value_type: string;
    applicable_days: string[] | null;
  } | null;
}

const MeuExtratoPage = () => {
  const { collaborator } = usePortal();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const { data: entries = [], isLoading: isLoadingEntries } = useQuery({
    queryKey: ["my-payroll-entries", collaborator?.id, selectedMonth, selectedYear],
    queryFn: async () => {
      if (!collaborator?.id) return [];
      
      // Fetch entries for the current period
      const { data: periodEntries, error: periodError } = await supabase
        .from("payroll_entries")
        .select("*")
        .eq("collaborator_id", collaborator.id)
        .eq("month", selectedMonth)
        .eq("year", selectedYear)
        .order("type");
      
      if (periodError) throw periodError;
      
      // Fetch fixed entries from previous periods
      const { data: fixedEntries, error: fixedError } = await supabase
        .from("payroll_entries")
        .select("*")
        .eq("collaborator_id", collaborator.id)
        .eq("is_fixed", true)
        .or(`year.lt.${selectedYear},and(year.eq.${selectedYear},month.lt.${selectedMonth})`);
      
      if (fixedError) throw fixedError;
      
      // Get existing types in current period
      const existingTypes = new Set(
        (periodEntries || []).map((e) => e.type)
      );
      
      // Get most recent fixed entry per type from previous periods
      const additionalFixedEntries = (fixedEntries || [])
        .filter((entry) => !existingTypes.has(entry.type))
        .reduce((acc, entry) => {
          const existing = acc.get(entry.type);
          if (!existing || 
              entry.year > existing.year || 
              (entry.year === existing.year && entry.month > existing.month)) {
            acc.set(entry.type, entry);
          }
          return acc;
        }, new Map());
      
      // Map fixed entries to current period display
      const virtualFixedEntries = Array.from(additionalFixedEntries.values()).map((entry: any) => ({
        ...entry,
        month: selectedMonth,
        year: selectedYear,
      }));
      
      return [...(periodEntries || []), ...virtualFixedEntries];
    },
    enabled: !!collaborator?.id,
  });

  // Fetch benefit assignments for the collaborator
  const { data: benefitAssignments = [], isLoading: isLoadingBenefits } = useQuery({
    queryKey: ["my-benefit-assignments", collaborator?.id],
    queryFn: async () => {
      if (!collaborator?.id) return [];
      const { data, error } = await supabase
        .from("benefits_assignments")
        .select(`
          id,
          benefit:benefits(id, name, value, value_type, applicable_days)
        `)
        .eq("collaborator_id", collaborator.id);
      
      if (error) throw error;
      return (data || []) as BenefitAssignment[];
    },
    enabled: !!collaborator?.id,
  });

  // Calculate benefit monthly value
  const calculateBenefitValue = (benefit: BenefitAssignment["benefit"]) => {
    if (!benefit) return 0;
    const valueType = (benefit.value_type || "monthly") as "monthly" | "daily";
    const applicableDays = (benefit.applicable_days || ["mon", "tue", "wed", "thu", "fri"]) as DayAbbrev[];
    return calculateMonthlyBenefitValue(
      benefit.value || 0,
      valueType,
      applicableDays,
      selectedMonth,
      selectedYear
    );
  };

  // Get benefit calculation description
  const getBenefitDescription = (benefit: BenefitAssignment["benefit"]) => {
    if (!benefit) return "";
    const valueType = (benefit.value_type || "monthly") as "monthly" | "daily";
    const applicableDays = (benefit.applicable_days || ["mon", "tue", "wed", "thu", "fri"]) as DayAbbrev[];
    return getBenefitCalculationDescription(
      benefit.value || 0,
      valueType,
      applicableDays,
      selectedMonth,
      selectedYear
    );
  };

  // Combine entries with benefit assignments as virtual entries
  const combinedEntries = useMemo(() => {
    const benefitEntries = benefitAssignments
      .filter((ba) => ba.benefit)
      .map((ba) => ({
        id: `benefit-${ba.id}`,
        type: "beneficio" as const,
        description: ba.benefit!.name,
        value: calculateBenefitValue(ba.benefit),
        month: selectedMonth,
        year: selectedYear,
        is_fixed: true,
        isBenefit: true,
        benefitDetails: ba.benefit,
      }));

    return [...entries, ...benefitEntries];
  }, [entries, benefitAssignments, selectedMonth, selectedYear]);

  const isLoading = isLoadingEntries || isLoadingBenefits;

  const totals = useMemo(() => {
    const byType: Record<string, number> = {};
    let total = 0;
    combinedEntries.forEach((entry) => {
      byType[entry.type] = (byType[entry.type] || 0) + Number(entry.value);
      total += Number(entry.value);
    });
    return { byType, total };
  }, [combinedEntries]);

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
              <div className="flex items-center gap-2">
                {type === "beneficio" && <Gift className="w-4 h-4 text-teal-600" />}
                <p className="text-sm text-muted-foreground">{typeLabels[type]}</p>
              </div>
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
          ) : combinedEntries.length === 0 ? (
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
                  {combinedEntries.map((entry: any) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={typeColors[entry.type]}>
                            {typeLabels[entry.type]}
                          </Badge>
                          {entry.isBenefit && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="w-4 h-4 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{getBenefitDescription(entry.benefitDetails)}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
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