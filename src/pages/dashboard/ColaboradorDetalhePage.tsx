import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import RoleGuard from "@/components/dashboard/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  DollarSign,
  Gift,
  Building2,
  Users,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatCPFInput, cleanCPF, validateCPF, formatPhoneInput } from "@/lib/validators";
import { formatCurrency, formatCurrencyForInput, parseCurrencyInput, formatNumberAsCurrency, getCurrentCompetencia } from "@/lib/formatters";
import { calculateMonthlyBenefitValue, getBenefitCalculationDescription, DayAbbrev } from "@/lib/workingDays";

const ColaboradorDetalhePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentCompany, hasAnyRole } = useDashboard();
  const isNewCollaborator = id === "novo";
  const { month: currentMonth, year: currentYear } = getCurrentCompetencia();

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    cpf: "",
    email: "",
    phone: "",
    position_id: "",
    store_id: "",
    team_id: "",
    admission_date: "",
    status: "ativo" as "ativo" | "inativo",
    is_temp: false,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Modals
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [addBenefitOpen, setAddBenefitOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<any>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<any>(null);
  const [createStoreOpen, setCreateStoreOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newTeamName, setNewTeamName] = useState("");

  // Entry form state - using valid payroll_entry_type values
  const [entryForm, setEntryForm] = useState({
    type: "salario" as "salario" | "adicional" | "custo" | "despesa" | "vale",
    description: "",
    value: "",
    is_fixed: false,
  });

  // Benefit assignment state
  const [selectedBenefitId, setSelectedBenefitId] = useState("");

  const canManage = hasAnyRole(["admin", "rh"]);

  // Fetch collaborator data
  const { data: collaborator, isLoading: loadingCollaborator } = useQuery({
    queryKey: ["collaborator", id],
    queryFn: async () => {
      if (!id || isNewCollaborator) return null;
      const { data, error } = await supabase
        .from("collaborators")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !isNewCollaborator,
  });

  // Fetch positions
  const { data: positions = [] } = useQuery({
    queryKey: ["positions", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .eq("company_id", currentCompany.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompany?.id,
  });

  // Fetch stores
  const { data: stores = [], refetch: refetchStores } = useQuery({
    queryKey: ["stores", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("company_id", currentCompany.id)
        .order("store_name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompany?.id,
  });

  // Fetch teams
  const { data: teams = [], refetch: refetchTeams } = useQuery({
    queryKey: ["teams", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .eq("company_id", currentCompany.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompany?.id,
  });

  // Fetch payroll entries for current month
  const { data: payrollEntries = [], refetch: refetchEntries } = useQuery({
    queryKey: ["payroll-entries", id, currentMonth, currentYear],
    queryFn: async () => {
      if (!id || isNewCollaborator) return [];
      const { data, error } = await supabase
        .from("payroll_entries")
        .select("*")
        .eq("collaborator_id", id)
        .eq("month", currentMonth)
        .eq("year", currentYear)
        .order("type");
      if (error) throw error;
      return data;
    },
    enabled: !!id && !isNewCollaborator,
  });

  // Fetch benefit assignments
  const { data: benefitAssignments = [], refetch: refetchAssignments } = useQuery({
    queryKey: ["benefit-assignments", id],
    queryFn: async () => {
      if (!id || isNewCollaborator) return [];
      const { data, error } = await supabase
        .from("benefits_assignments")
        .select(`
          *,
          benefit:benefits(*)
        `)
        .eq("collaborator_id", id);
      if (error) throw error;
      return data;
    },
    enabled: !!id && !isNewCollaborator,
  });

  // Fetch available benefits for assignment
  const { data: availableBenefits = [] } = useQuery({
    queryKey: ["benefits", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("benefits")
        .select("*")
        .eq("company_id", currentCompany.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompany?.id,
  });

  // Set form data when collaborator loads
  useEffect(() => {
    if (collaborator) {
      setFormData({
        name: collaborator.name || "",
        cpf: collaborator.cpf || "",
        email: collaborator.email || "",
        phone: collaborator.phone || "",
        position_id: collaborator.position_id || "",
        store_id: collaborator.store_id || "",
        team_id: collaborator.team_id || "",
        admission_date: collaborator.admission_date || "",
        status: collaborator.status || "ativo",
        is_temp: collaborator.is_temp || false,
      });
    }
  }, [collaborator]);

  // Handle CPF input with mask
  const handleCPFChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCPFInput(e.target.value);
    setFormData((prev) => ({ ...prev, cpf: formatted }));
  };

  // Handle phone input with mask
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneInput(e.target.value);
    setFormData((prev) => ({ ...prev, phone: formatted }));
  };

  // Handle value input with currency mask
  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCurrencyForInput(e.target.value);
    setEntryForm((prev) => ({ ...prev, value: formatted }));
  };

  // Create store mutation
  const createStoreMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("stores")
        .insert({ store_name: name, company_id: currentCompany!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      refetchStores();
      setFormData((prev) => ({ ...prev, store_id: data.id }));
      setCreateStoreOpen(false);
      setNewStoreName("");
      toast.success("Empresa criada!");
    },
    onError: () => {
      toast.error("Erro ao criar empresa");
    },
  });

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("teams")
        .insert({ name, company_id: currentCompany!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      refetchTeams();
      setFormData((prev) => ({ ...prev, team_id: data.id }));
      setCreateTeamOpen(false);
      setNewTeamName("");
      toast.success("Setor criado!");
    },
    onError: () => {
      toast.error("Erro ao criar setor");
    },
  });

  // Save collaborator
  const handleSave = async () => {
    // Validate
    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    const cleanedCPF = cleanCPF(formData.cpf);
    if (!validateCPF(cleanedCPF)) {
      toast.error("CPF inválido");
      return;
    }

    setIsSaving(true);
    try {
      const saveData = {
        name: formData.name.trim(),
        cpf: cleanedCPF,
        email: formData.email.trim() || null,
        phone: formData.phone.replace(/\D/g, "") || null,
        position_id: formData.position_id || null,
        store_id: formData.store_id || null,
        team_id: formData.team_id || null,
        admission_date: formData.admission_date || null,
        status: formData.status,
        is_temp: formData.is_temp,
        company_id: currentCompany!.id,
        // Get position name for the position field (legacy support)
        position: positions.find((p) => p.id === formData.position_id)?.name || null,
      };

      if (isNewCollaborator) {
        // Create new collaborator
        const { data: newCollab, error } = await supabase
          .from("collaborators")
          .insert(saveData)
          .select()
          .single();

        if (error) {
          if (error.code === "23505") {
            toast.error("Já existe um colaborador com este CPF");
            return;
          }
          throw error;
        }

        // If position has salary, create fixed payroll entry
        const selectedPosition = positions.find((p) => p.id === formData.position_id);
        if (selectedPosition && selectedPosition.salary > 0) {
          await supabase.from("payroll_entries").insert({
            collaborator_id: newCollab.id,
            company_id: currentCompany!.id,
            type: "salario",
            value: selectedPosition.salary,
            description: `Salário Base - ${selectedPosition.name}`,
            month: currentMonth,
            year: currentYear,
            is_fixed: true,
          });
        }

        toast.success("Colaborador criado com sucesso!");
        navigate(`/dashboard/colaboradores/${newCollab.id}`);
      } else {
        // Update existing collaborator
        const { error } = await supabase
          .from("collaborators")
          .update(saveData)
          .eq("id", id);

        if (error) {
          if (error.code === "23505") {
            toast.error("Já existe um colaborador com este CPF");
            return;
          }
          throw error;
        }

        queryClient.invalidateQueries({ queryKey: ["collaborator", id] });
        toast.success("Colaborador atualizado!");
      }
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Add payroll entry
  const handleAddEntry = async () => {
    if (!entryForm.value) {
      toast.error("Valor é obrigatório");
      return;
    }

    try {
      const numericValue = parseCurrencyInput(entryForm.value);
      await supabase.from("payroll_entries").insert({
        collaborator_id: id,
        company_id: currentCompany!.id,
        type: entryForm.type,
        value: numericValue,
        description: entryForm.description || null,
        month: currentMonth,
        year: currentYear,
        is_fixed: entryForm.is_fixed,
      });

      refetchEntries();
      setAddEntryOpen(false);
      setEntryForm({ type: "salario", description: "", value: "", is_fixed: false });
      toast.success("Lançamento adicionado!");
    } catch (error) {
      toast.error("Erro ao adicionar lançamento");
    }
  };

  // Delete payroll entry
  const handleDeleteEntry = async () => {
    if (!deletingEntry) return;
    try {
      await supabase.from("payroll_entries").delete().eq("id", deletingEntry.id);
      refetchEntries();
      setDeletingEntry(null);
      toast.success("Lançamento removido!");
    } catch (error) {
      toast.error("Erro ao remover lançamento");
    }
  };

  // Add benefit assignment
  const handleAddBenefit = async () => {
    if (!selectedBenefitId) {
      toast.error("Selecione um benefício");
      return;
    }

    try {
      const { error } = await supabase.from("benefits_assignments").insert({
        benefit_id: selectedBenefitId,
        collaborator_id: id,
      });

      if (error) {
        if (error.code === "23505") {
          toast.error("Este benefício já está atribuído");
          return;
        }
        throw error;
      }

      refetchAssignments();
      setAddBenefitOpen(false);
      setSelectedBenefitId("");
      toast.success("Benefício atribuído!");
    } catch (error) {
      toast.error("Erro ao atribuir benefício");
    }
  };

  // Delete benefit assignment
  const handleDeleteAssignment = async () => {
    if (!deletingAssignment) return;
    try {
      await supabase.from("benefits_assignments").delete().eq("id", deletingAssignment.id);
      refetchAssignments();
      setDeletingAssignment(null);
      toast.success("Benefício removido!");
    } catch (error) {
      toast.error("Erro ao remover benefício");
    }
  };

  // Calculate totals
  const calculateTotalCost = () => {
    const entriesTotal = payrollEntries.reduce((sum, e) => {
      // custo and despesa are deductions
      if (e.type === "custo" || e.type === "despesa") return sum - e.value;
      return sum + e.value;
    }, 0);

    const benefitsTotal = benefitAssignments.reduce((sum, a: any) => {
      if (!a.benefit) return sum;
      const value = calculateMonthlyBenefitValue(
        a.benefit.value || 0,
        a.benefit.value_type || "monthly",
        (a.benefit.applicable_days || ["mon", "tue", "wed", "thu", "fri"]) as DayAbbrev[],
        currentMonth,
        currentYear
      );
      return sum + value;
    }, 0);

    return { entriesTotal, benefitsTotal, total: entriesTotal + benefitsTotal };
  };

  const totals = calculateTotalCost();

  // Get entry type label
  const getEntryTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      salario: "Salário",
      adicional: "Adicional",
      custo: "Custo",
      despesa: "Despesa",
      vale: "Vale",
    };
    return labels[type] || type;
  };

  // Get available benefits (not already assigned)
  const assignedBenefitIds = benefitAssignments.map((a: any) => a.benefit_id);
  const unassignedBenefits = availableBenefits.filter(
    (b) => !assignedBenefitIds.includes(b.id)
  );

  if (loadingCollaborator && !isNewCollaborator) {
    return (
      <RoleGuard allowedRoles={["admin", "rh", "gestor"]}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["admin", "rh", "gestor"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/colaboradores")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {isNewCollaborator ? "Novo Colaborador" : formData.name || "Colaborador"}
              </h1>
              <p className="text-muted-foreground">
                {isNewCollaborator ? "Preencha os dados do novo colaborador" : "Edite os dados e gerencie custos"}
              </p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar
          </Button>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Collaborator Data */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dados Cadastrais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Nome do colaborador"
                  />
                </div>

                {/* CPF */}
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF *</Label>
                  <Input
                    id="cpf"
                    value={formData.cpf}
                    onChange={handleCPFChange}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </div>

                {/* Email & Phone */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={handlePhoneChange}
                      placeholder="(00) 00000-0000"
                      maxLength={15}
                    />
                  </div>
                </div>

                <Separator />

                {/* Store with quick create */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Empresa</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCreateStoreOpen(true)}
                      className="h-6 text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Nova
                    </Button>
                  </div>
                  <Select
                    value={formData.store_id}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, store_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.store_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Team with quick create */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Setor</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCreateTeamOpen(true)}
                      className="h-6 text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Novo
                    </Button>
                  </div>
                  <Select
                    value={formData.team_id}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, team_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um setor" />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Position */}
                <div className="space-y-2">
                  <Label>Cargo</Label>
                  <Select
                    value={formData.position_id}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, position_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um cargo" />
                    </SelectTrigger>
                    <SelectContent>
                      {positions.map((pos) => (
                        <SelectItem key={pos.id} value={pos.id}>
                          {pos.name} {pos.salary > 0 && `(${formatCurrency(pos.salary)})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Admission Date */}
                <div className="space-y-2">
                  <Label htmlFor="admission_date">Data de Admissão</Label>
                  <Input
                    id="admission_date"
                    type="date"
                    value={formData.admission_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, admission_date: e.target.value }))}
                  />
                </div>

                <Separator />

                {/* Status & Is Temp */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(v) => setFormData((prev) => ({ ...prev, status: v as "ativo" | "inativo" }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Colaborador Avulso</Label>
                    <div className="flex items-center space-x-2 pt-2">
                      <Switch
                        checked={formData.is_temp}
                        onCheckedChange={(v) => setFormData((prev) => ({ ...prev, is_temp: v }))}
                      />
                      <span className="text-sm text-muted-foreground">
                        {formData.is_temp ? "Sim" : "Não"}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Cost Panel */}
          <div className="space-y-6">
            {/* Total Cost Summary */}
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Custo Total - {currentMonth.toString().padStart(2, "0")}/{currentYear}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">
                  {formatCurrency(totals.total)}
                </div>
                <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                  <span>Lançamentos: {formatCurrency(totals.entriesTotal)}</span>
                  <span>Benefícios: {formatCurrency(totals.benefitsTotal)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Payroll Entries */}
            {!isNewCollaborator && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Lançamentos Financeiros
                  </CardTitle>
                  {canManage && (
                    <Button size="sm" onClick={() => setAddEntryOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" />
                      Novo
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {payrollEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum lançamento no mês atual
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          {canManage && <TableHead className="w-10"></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payrollEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>
                              <Badge variant={(entry.type === "custo" || entry.type === "despesa") ? "destructive" : "default"}>
                                {getEntryTypeLabel(entry.type)}
                              </Badge>
                              {entry.is_fixed && (
                                <Badge variant="outline" className="ml-1 text-xs">
                                  Fixo
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {entry.description || "-"}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {(entry.type === "custo" || entry.type === "despesa") ? "-" : ""}
                              {formatCurrency(entry.value)}
                            </TableCell>
                            {canManage && (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeletingEntry(entry)}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Benefits */}
            {!isNewCollaborator && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Gift className="w-5 h-5" />
                    Benefícios
                  </CardTitle>
                  {canManage && unassignedBenefits.length > 0 && (
                    <Button size="sm" onClick={() => setAddBenefitOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" />
                      Adicionar
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {benefitAssignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum benefício atribuído
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {benefitAssignments.map((assignment: any) => {
                        const benefit = assignment.benefit;
                        if (!benefit) return null;
                        
                        const monthlyValue = calculateMonthlyBenefitValue(
                          benefit.value || 0,
                          benefit.value_type || "monthly",
                          (benefit.applicable_days || ["mon", "tue", "wed", "thu", "fri"]) as DayAbbrev[],
                          currentMonth,
                          currentYear
                        );
                        const description = getBenefitCalculationDescription(
                          benefit.value || 0,
                          benefit.value_type || "monthly",
                          (benefit.applicable_days || ["mon", "tue", "wed", "thu", "fri"]) as DayAbbrev[],
                          currentMonth,
                          currentYear
                        );

                        return (
                          <div
                            key={assignment.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                          >
                            <div>
                              <div className="font-medium">{benefit.name}</div>
                              <div className="text-xs text-muted-foreground">{description}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-medium">
                                {formatCurrency(monthlyValue)}
                              </span>
                              {canManage && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeletingAssignment(assignment)}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {isNewCollaborator && (
              <Card className="bg-muted/50 border-dashed">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground text-center">
                    Salve o colaborador para gerenciar lançamentos e benefícios
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Add Entry Dialog */}
      <Dialog open={addEntryOpen} onOpenChange={setAddEntryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Lançamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={entryForm.type}
                onValueChange={(v) => setEntryForm((prev) => ({ ...prev, type: v as any }))}
              >
              <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salario">Salário</SelectItem>
                  <SelectItem value="adicional">Adicional</SelectItem>
                  <SelectItem value="vale">Vale</SelectItem>
                  <SelectItem value="custo">Custo</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={entryForm.description}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Descrição do lançamento"
              />
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                value={entryForm.value}
                onChange={handleValueChange}
                placeholder="R$ 0,00"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={entryForm.is_fixed}
                onCheckedChange={(v) => setEntryForm((prev) => ({ ...prev, is_fixed: v }))}
              />
              <Label>Lançamento fixo (repete mensalmente)</Label>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setAddEntryOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddEntry}>Adicionar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Benefit Dialog */}
      <Dialog open={addBenefitOpen} onOpenChange={setAddBenefitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Benefício</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Benefício</Label>
              <Select value={selectedBenefitId} onValueChange={setSelectedBenefitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um benefício" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedBenefits.map((benefit) => (
                    <SelectItem key={benefit.id} value={benefit.id}>
                      {benefit.name} - {formatCurrency(benefit.value || 0)}{" "}
                      ({benefit.value_type === "monthly" ? "mensal" : "diário"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setAddBenefitOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddBenefit}>Adicionar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Store Dialog */}
      <Dialog open={createStoreOpen} onOpenChange={setCreateStoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Nova Empresa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Empresa</Label>
              <Input
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="Nome da empresa"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateStoreOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => createStoreMutation.mutate(newStoreName)}
                disabled={!newStoreName.trim()}
              >
                Criar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Team Dialog */}
      <Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Novo Setor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do Setor</Label>
              <Input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Nome do setor"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateTeamOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => createTeamMutation.mutate(newTeamName)}
                disabled={!newTeamName.trim()}
              >
                Criar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Entry Confirmation */}
      <AlertDialog open={!!deletingEntry} onOpenChange={(open) => !open && setDeletingEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Lançamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este lançamento?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEntry}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Assignment Confirmation */}
      <AlertDialog open={!!deletingAssignment} onOpenChange={(open) => !open && setDeletingAssignment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Benefício</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este benefício do colaborador?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAssignment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RoleGuard>
  );
};

export default ColaboradorDetalhePage;
