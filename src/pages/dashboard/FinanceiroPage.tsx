import { useState, useEffect, useMemo } from "react";
import RoleGuard from "@/components/dashboard/RoleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DollarSign,
  Plus,
  Filter,
  MoreHorizontal,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useDashboard } from "@/contexts/DashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  formatCurrency,
  getCurrentCompetencia,
  getMonthName,
  formatCompetencia,
} from "@/lib/formatters";
import PayrollEntryForm from "@/components/payroll/PayrollEntryForm";

interface PayrollEntry {
  id: string;
  type: "salario" | "vale" | "custo" | "despesa" | "adicional";
  description: string | null;
  value: number;
  month: number;
  year: number;
  is_fixed: boolean;
  collaborator_id: string;
  created_at: string;
}

interface Collaborator {
  id: string;
  name: string;
}

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

const FinanceiroPage = () => {
  const { currentCompany } = useDashboard();
  const { toast } = useToast();

  const currentComp = getCurrentCompetencia();

  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PayrollEntry | null>(null);

  // Filters
  const [month, setMonth] = useState(currentComp.month);
  const [year, setYear] = useState(currentComp.year);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [collaboratorFilter, setCollaboratorFilter] = useState<string>("all");

  useEffect(() => {
    if (currentCompany) {
      loadData();
    }
  }, [currentCompany, month, year]);

  const loadData = async () => {
    await Promise.all([loadEntries(), loadCollaborators()]);
  };

  const loadEntries = async () => {
    if (!currentCompany) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("payroll_entries")
        .select("*")
        .eq("company_id", currentCompany.id)
        .eq("month", month)
        .eq("year", year)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar lançamentos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadCollaborators = async () => {
    if (!currentCompany) return;

    try {
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, name")
        .eq("company_id", currentCompany.id)
        .eq("status", "ativo")
        .eq("is_temp", false)
        .order("name");

      if (error) throw error;
      setCollaborators(data || []);
    } catch (error) {
      console.error("Error loading collaborators:", error);
    }
  };

  const handleEdit = (entry: PayrollEntry) => {
    setEditingEntry(entry);
    setFormOpen(true);
  };

  const handleDelete = async (entry: PayrollEntry) => {
    if (!confirm("Tem certeza que deseja excluir este lançamento?")) return;

    try {
      const { error } = await supabase
        .from("payroll_entries")
        .delete()
        .eq("id", entry.id);

      if (error) throw error;

      toast({
        title: "Lançamento excluído",
        description: "O lançamento foi removido.",
      });

      loadEntries();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const navigateMonth = (direction: "prev" | "next") => {
    if (direction === "prev") {
      if (month === 1) {
        setMonth(12);
        setYear(year - 1);
      } else {
        setMonth(month - 1);
      }
    } else {
      if (month === 12) {
        setMonth(1);
        setYear(year + 1);
      } else {
        setMonth(month + 1);
      }
    }
  };

  const getCollaboratorName = (id: string) => {
    return collaborators.find((c) => c.id === id)?.name || "Colaborador removido";
  };

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (typeFilter !== "all" && entry.type !== typeFilter) return false;
      if (collaboratorFilter !== "all" && entry.collaborator_id !== collaboratorFilter)
        return false;
      return true;
    });
  }, [entries, typeFilter, collaboratorFilter]);

  // Calculate totals
  const totals = useMemo(() => {
    const byType: Record<string, number> = {};
    let total = 0;

    filteredEntries.forEach((entry) => {
      byType[entry.type] = (byType[entry.type] || 0) + Number(entry.value);
      total += Number(entry.value);
    });

    return { byType, total };
  }, [filteredEntries]);

  // Generate year options
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <RoleGuard allowedRoles={["admin", "rh"]}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lançamentos Financeiros</h1>
            <p className="text-muted-foreground">
              Gerencie lançamentos de folha de pagamento
            </p>
          </div>
          <Button
            variant="hero"
            onClick={() => {
              setEditingEntry(null);
              setFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Lançamento
          </Button>
        </div>

        {/* Period Selector */}
        <Card className="border border-border">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* Month/Year Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigateMonth("prev")}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="text-center min-w-[200px]">
                  <p className="font-semibold text-lg text-foreground">
                    {getMonthName(month)} {year}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatCompetencia(month, year)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigateMonth("next")}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex-1" />

              {/* Filters */}
              <div className="flex gap-2">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    {Object.entries(typeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {collaborators.length > 0 && (
                  <Select value={collaboratorFilter} onValueChange={setCollaboratorFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Colaborador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {collaborators.map((collab) => (
                        <SelectItem key={collab.id} value={collab.id}>
                          {collab.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border border-border col-span-2 md:col-span-1">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Geral</p>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(totals.total)}
              </p>
            </CardContent>
          </Card>
          {Object.entries(typeLabels).map(([type, label]) => (
            <Card key={type} className="border border-border">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatCurrency(totals.byType[type] || 0)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <Card className="border border-border">
            <CardContent className="p-12 text-center">
              <div className="animate-pulse text-muted-foreground">Carregando...</div>
            </CardContent>
          </Card>
        ) : filteredEntries.length === 0 ? (
          <Card className="border border-border">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <DollarSign className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                {entries.length === 0
                  ? "Nenhum lançamento neste período"
                  : "Nenhum lançamento encontrado"}
              </h2>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                {entries.length === 0
                  ? `Não há lançamentos para ${getMonthName(month)}/${year}.`
                  : "Tente ajustar os filtros."}
              </p>
              {entries.length === 0 && (
                <Button
                  variant="hero"
                  onClick={() => {
                    setEditingEntry(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Lançamento
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Fixo</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {getCollaboratorName(entry.collaborator_id)}
                      </TableCell>
                      <TableCell>
                        <Badge className={typeColors[entry.type]}>
                          {typeLabels[entry.type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.description || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(Number(entry.value))}
                      </TableCell>
                      <TableCell>
                        {entry.is_fixed ? (
                          <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                            Fixo
                          </Badge>
                        ) : (
                          <Badge variant="outline">Variável</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(entry)}>
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(entry)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="font-semibold">
                      Total ({filteredEntries.length} lançamentos)
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-lg">
                      {formatCurrency(totals.total)}
                    </TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </Card>
        )}

        {/* Form Modal */}
        <PayrollEntryForm
          open={formOpen}
          onOpenChange={setFormOpen}
          onSuccess={loadEntries}
          collaborators={collaborators}
          editingEntry={editingEntry}
          defaultMonth={month}
          defaultYear={year}
        />
      </div>
    </RoleGuard>
  );
};

export default FinanceiroPage;
