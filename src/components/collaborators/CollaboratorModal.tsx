import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Save,
  Plus,
  DollarSign,
  Gift,
  Building2,
  Users,
  Loader2,
  X,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { formatCPFInput, cleanCPF, validateCPF, formatPhoneInput } from "@/lib/validators";
import { formatCurrency, formatCurrencyForInput, parseCurrencyInput, getCurrentCompetencia } from "@/lib/formatters";
import { calculateMonthlyBenefitValue, getBenefitCalculationDescription, DayAbbrev } from "@/lib/workingDays";

interface PendingEntry {
  id: string;
  type: "salario" | "adicional" | "custo" | "despesa" | "vale";
  description: string;
  value: number;
  is_fixed: boolean;
  source: "position" | "manual";
}

interface PendingBenefit {
  id: string;
  benefit_id: string;
  benefit_name: string;
  value: number;
  value_type: "monthly" | "daily";
  applicable_days: string[];
  monthly_value: number;
}

interface CollaboratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaboratorId?: string | null;
  onSuccess?: () => void;
}

const CollaboratorModal = ({
  open,
  onOpenChange,
  collaboratorId,
  onSuccess,
}: CollaboratorModalProps) => {
  const queryClient = useQueryClient();
  const { currentCompany, hasAnyRole } = useDashboard();
  const isNew = !collaboratorId;
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
    password: "",
  });
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Pending entries/benefits for new collaborators
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [pendingBenefits, setPendingBenefits] = useState<PendingBenefit[]>([]);

  // Modals
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [addBenefitOpen, setAddBenefitOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<any>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<any>(null);
  const [createStoreOpen, setCreateStoreOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newTeamName, setNewTeamName] = useState("");

  // Entry form state
  const [entryForm, setEntryForm] = useState({
    type: "adicional" as "salario" | "adicional" | "custo" | "despesa" | "vale",
    description: "",
    value: "",
    is_fixed: false,
  });

  // Benefit assignment state
  const [selectedBenefitId, setSelectedBenefitId] = useState("");

  const canManage = hasAnyRole(["admin", "rh"]);

  // Fetch collaborator data
  const { data: collaborator, isLoading: loadingCollaborator } = useQuery({
    queryKey: ["collaborator", collaboratorId],
    queryFn: async () => {
      if (!collaboratorId) return null;
      const { data, error } = await supabase
        .from("collaborators")
        .select("*")
        .eq("id", collaboratorId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!collaboratorId && open,
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
    enabled: !!currentCompany?.id && open,
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
    enabled: !!currentCompany?.id && open,
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
    enabled: !!currentCompany?.id && open,
  });

  // Fetch payroll entries for existing collaborator
  const { data: payrollEntries = [], refetch: refetchEntries } = useQuery({
    queryKey: ["payroll-entries", collaboratorId, currentMonth, currentYear],
    queryFn: async () => {
      if (!collaboratorId) return [];
      const { data, error } = await supabase
        .from("payroll_entries")
        .select("*")
        .eq("collaborator_id", collaboratorId)
        .eq("month", currentMonth)
        .eq("year", currentYear)
        .order("type");
      if (error) throw error;
      return data;
    },
    enabled: !!collaboratorId && open,
  });

  // Fetch benefit assignments for existing collaborator
  const { data: benefitAssignments = [], refetch: refetchAssignments } = useQuery({
    queryKey: ["benefit-assignments", collaboratorId],
    queryFn: async () => {
      if (!collaboratorId) return [];
      const { data, error } = await supabase
        .from("benefits_assignments")
        .select(`*, benefit:benefits(*)`)
        .eq("collaborator_id", collaboratorId);
      if (error) throw error;
      return data;
    },
    enabled: !!collaboratorId && open,
  });

  // Fetch available benefits
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
    enabled: !!currentCompany?.id && open,
  });

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
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
          password: "",
        });
        // Only show password field for collaborators without user_id
        setShowPasswordField(!collaborator.user_id);
      } else {
        setFormData({
          name: "",
          cpf: "",
          email: "",
          phone: "",
          position_id: "",
          store_id: "",
          team_id: "",
          admission_date: "",
          status: "ativo",
          is_temp: false,
          password: "",
        });
        setShowPasswordField(false);
        setPendingEntries([]);
        setPendingBenefits([]);
      }
    }
  }, [open, collaborator]);

  // When position changes, update pending salary entry (for new collaborators)
  useEffect(() => {
    if (!isNew) return;

    const position = positions.find((p) => p.id === formData.position_id);
    
    // Remove old position-based salary entry
    setPendingEntries((prev) => prev.filter((e) => e.source !== "position"));
    
    // Add new one if position has salary
    if (position && position.salary > 0) {
      setPendingEntries((prev) => [
        ...prev,
        {
          id: `position-${position.id}`,
          type: "salario",
          description: `Salário Base - ${position.name}`,
          value: position.salary,
          is_fixed: true,
          source: "position",
        },
      ]);
    }
  }, [formData.position_id, positions, isNew]);

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

    // Validate password if provided
    if (formData.password && formData.password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    setIsSaving(true);
    try {
      let userId: string | null = null;

      // Create auth user if email and password are provided
      if (formData.email.trim() && formData.password) {
        setIsCreatingUser(true);
        const normalizedEmail = formData.email.trim().toLowerCase();
        
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/colaborador`,
          },
        });

        if (authError) {
          if (authError.message?.includes("User already registered")) {
            toast.error("Este email já possui uma conta. O colaborador será cadastrado sem acesso ao portal.");
          } else {
            throw authError;
          }
        } else if (authData.user) {
          userId = authData.user.id;
          
          // Add collaborator role to the user
          await supabase.from("user_roles").insert({
            user_id: userId,
            role: "colaborador",
          });
        }
        setIsCreatingUser(false);
      }

      const saveData = {
        name: formData.name.trim(),
        cpf: cleanedCPF,
        email: formData.email.trim().toLowerCase() || null,
        phone: formData.phone.replace(/\D/g, "") || null,
        position_id: formData.position_id || null,
        store_id: formData.store_id || null,
        team_id: formData.team_id || null,
        admission_date: formData.admission_date || null,
        status: formData.status,
        is_temp: formData.is_temp,
        company_id: currentCompany!.id,
        position: positions.find((p) => p.id === formData.position_id)?.name || null,
        ...(userId && { user_id: userId }),
      };

      if (isNew) {
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

        // Create pending entries
        if (pendingEntries.length > 0) {
          const entriesToCreate = pendingEntries.map((e) => ({
            collaborator_id: newCollab.id,
            company_id: currentCompany!.id,
            type: e.type,
            value: e.value,
            description: e.description,
            month: currentMonth,
            year: currentYear,
            is_fixed: e.is_fixed,
          }));
          await supabase.from("payroll_entries").insert(entriesToCreate);
        }

        // Create pending benefit assignments (benefits are calculated dynamically, not as payroll entries)
        if (pendingBenefits.length > 0) {
          const assignmentsToCreate = pendingBenefits.map((b) => ({
            benefit_id: b.benefit_id,
            collaborator_id: newCollab.id,
          }));
          await supabase.from("benefits_assignments").insert(assignmentsToCreate);
        }

        const message = userId 
          ? `${formData.name} foi cadastrado com acesso ao Portal!`
          : "Colaborador criado com sucesso!";
        toast.success(message);
      } else {
        // Update existing collaborator
        const updateData = {
          ...saveData,
          // Only update user_id if we created a new user
          ...(userId ? { user_id: userId } : {}),
        };
        delete (updateData as any).user_id; // Remove if not set
        if (userId) {
          (updateData as any).user_id = userId;
        }
        
        const { error } = await supabase
          .from("collaborators")
          .update(updateData)
          .eq("id", collaboratorId);

        if (error) {
          if (error.code === "23505") {
            toast.error("Já existe um colaborador com este CPF");
            return;
          }
          throw error;
        }

        const message = userId 
          ? "Colaborador atualizado e acesso ao portal criado!"
          : "Colaborador atualizado!";
        toast.success(message);
      }

      queryClient.invalidateQueries({ queryKey: ["collaborators"] });
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setIsSaving(false);
      setIsCreatingUser(false);
    }
  };

  // Add pending entry (for new collaborators)
  const handleAddPendingEntry = () => {
    if (!entryForm.value) {
      toast.error("Valor é obrigatório");
      return;
    }

    const numericValue = parseCurrencyInput(entryForm.value);
    setPendingEntries((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        type: entryForm.type,
        description: entryForm.description || getEntryTypeLabel(entryForm.type),
        value: numericValue,
        is_fixed: entryForm.is_fixed,
        source: "manual",
      },
    ]);

    setAddEntryOpen(false);
    setEntryForm({ type: "adicional", description: "", value: "", is_fixed: false });
    toast.success("Lançamento adicionado!");
  };

  // Add payroll entry (for existing collaborators)
  const handleAddEntry = async () => {
    if (!entryForm.value) {
      toast.error("Valor é obrigatório");
      return;
    }

    try {
      const numericValue = parseCurrencyInput(entryForm.value);
      await supabase.from("payroll_entries").insert({
        collaborator_id: collaboratorId,
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
      setEntryForm({ type: "adicional", description: "", value: "", is_fixed: false });
      toast.success("Lançamento adicionado!");
    } catch (error) {
      toast.error("Erro ao adicionar lançamento");
    }
  };

  // Delete payroll entry
  const handleDeleteEntry = async () => {
    if (!deletingEntry) return;
    
    if (isNew) {
      // Remove from pending
      setPendingEntries((prev) => prev.filter((e) => e.id !== deletingEntry.id));
      setDeletingEntry(null);
      toast.success("Lançamento removido!");
    } else {
      try {
        await supabase.from("payroll_entries").delete().eq("id", deletingEntry.id);
        refetchEntries();
        setDeletingEntry(null);
        toast.success("Lançamento removido!");
      } catch (error) {
        toast.error("Erro ao remover lançamento");
      }
    }
  };

  // Add pending benefit (for new collaborators)
  const handleAddPendingBenefit = () => {
    if (!selectedBenefitId) {
      toast.error("Selecione um benefício");
      return;
    }

    const benefit = availableBenefits.find((b) => b.id === selectedBenefitId);
    if (!benefit) return;

    const valueType = (benefit.value_type || "monthly") as "monthly" | "daily";
    const applicableDays = benefit.applicable_days || ["mon", "tue", "wed", "thu", "fri"];

    const monthlyValue = calculateMonthlyBenefitValue(
      benefit.value || 0,
      valueType,
      applicableDays as DayAbbrev[],
      currentMonth,
      currentYear
    );

    setPendingBenefits((prev) => [
      ...prev,
      {
        id: `benefit-${benefit.id}`,
        benefit_id: benefit.id,
        benefit_name: benefit.name,
        value: benefit.value || 0,
        value_type: valueType,
        applicable_days: applicableDays,
        monthly_value: monthlyValue,
      },
    ]);

    setAddBenefitOpen(false);
    setSelectedBenefitId("");
    toast.success("Benefício adicionado!");
  };

  // Add benefit assignment (for existing collaborators)
  // Benefits are calculated dynamically from benefits_assignments, not stored as payroll_entries
  const handleAddBenefit = async () => {
    if (!selectedBenefitId) {
      toast.error("Selecione um benefício");
      return;
    }

    try {
      const { error } = await supabase.from("benefits_assignments").insert({
        benefit_id: selectedBenefitId,
        collaborator_id: collaboratorId,
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

    if (isNew) {
      setPendingBenefits((prev) => prev.filter((b) => b.id !== deletingAssignment.id));
      setDeletingAssignment(null);
      toast.success("Benefício removido!");
    } else {
      try {
        await supabase.from("benefits_assignments").delete().eq("id", deletingAssignment.id);
        refetchAssignments();
        setDeletingAssignment(null);
        toast.success("Benefício removido!");
      } catch (error) {
        toast.error("Erro ao remover benefício");
      }
    }
  };

  // Calculate totals
  const calculateTotalCost = () => {
    let entriesTotal = 0;
    let benefitsTotal = 0;

    if (isNew) {
      entriesTotal = pendingEntries.reduce((sum, e) => {
        if (e.type === "custo" || e.type === "despesa") return sum - e.value;
        return sum + e.value;
      }, 0);
      benefitsTotal = pendingBenefits.reduce((sum, b) => sum + b.monthly_value, 0);
    } else {
      entriesTotal = payrollEntries.reduce((sum, e) => {
        if (e.type === "custo" || e.type === "despesa") return sum - e.value;
        return sum + e.value;
      }, 0);
      benefitsTotal = benefitAssignments.reduce((sum, a: any) => {
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
    }

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

  // Get entry type color
  const getEntryTypeVariant = (type: string): "default" | "secondary" | "destructive" | "outline" => {
    if (type === "custo" || type === "despesa") return "destructive";
    if (type === "salario") return "default";
    return "secondary";
  };

  // Get available benefits (not already assigned)
  const assignedBenefitIds = isNew
    ? pendingBenefits.map((b) => b.benefit_id)
    : benefitAssignments.map((a: any) => a.benefit_id);
  const unassignedBenefits = availableBenefits.filter(
    (b) => !assignedBenefitIds.includes(b.id)
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl h-[85vh] max-h-[85vh] p-0 flex flex-col overflow-hidden">
          {/* Header */}
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-xl">
              {isNew ? "Novo Colaborador" : `Editar: ${formData.name || "Colaborador"}`}
            </DialogTitle>
          </DialogHeader>

          {loadingCollaborator && !isNew ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            /* Content - Two Columns */
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-x overflow-hidden">
              {/* Left Column - Dados Cadastrais */}
              <ScrollArea className="h-full">
                <div className="p-6 space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Dados Cadastrais
                  </h3>
                  
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
                        onChange={(e) => {
                          setFormData((prev) => ({ ...prev, email: e.target.value }));
                          // Show password field when email is entered (for new collaborators or those without user_id)
                          if (e.target.value.trim() && (isNew || showPasswordField)) {
                            setShowPasswordField(true);
                          }
                        }}
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

                  {/* Password Field - Only shown when email is entered and user doesn't have access yet */}
                  {formData.email.trim() && showPasswordField && (
                    <div className="space-y-2 p-4 bg-muted/50 rounded-lg border border-dashed">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="password" className="text-sm font-medium">
                          Senha de Acesso ao Portal
                        </Label>
                        <Badge variant="secondary" className="text-xs">
                          Opcional
                        </Badge>
                      </div>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="Mínimo 6 caracteres"
                        minLength={6}
                      />
                      <p className="text-xs text-muted-foreground">
                        Se preenchida, o colaborador poderá acessar o Portal do Colaborador com este email e senha.
                      </p>
                    </div>
                  )}

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
                </div>
              </ScrollArea>

              {/* Right Column - Financeiro */}
              <div className="flex flex-col h-full bg-muted/30">
                {/* Financeiro Header */}
                <div className="shrink-0 p-4 border-b bg-muted/50">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-primary" />
                    Financeiro
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Competência: {currentMonth.toString().padStart(2, "0")}/{currentYear}
                  </p>
                </div>

                {/* Scrollable Content */}
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-6">
                    {/* Payroll Entries */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-sm flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          Lançamentos
                        </h4>
                        {canManage && (
                          <Button size="sm" variant="outline" onClick={() => setAddEntryOpen(true)} className="h-7 text-xs">
                            <Plus className="w-3 h-3 mr-1" />
                            Novo
                          </Button>
                        )}
                      </div>
                      
                      {(isNew ? pendingEntries : payrollEntries).length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-6 bg-background rounded-lg border border-dashed">
                          {isNew ? "Selecione um cargo para adicionar o salário" : "Nenhum lançamento no mês atual"}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(isNew ? pendingEntries : payrollEntries).map((entry: any) => (
                            <div
                              key={entry.id}
                              className="p-3 rounded-lg bg-background border hover:border-primary/30 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-sm font-medium truncate pr-2">
                                      {entry.description || getEntryTypeLabel(entry.type)}
                                    </span>
                                    <span className="font-mono text-sm font-semibold shrink-0">
                                      {formatCurrency(entry.value)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Badge variant={getEntryTypeVariant(entry.type)} className="text-xs h-5 px-1.5">
                                      {getEntryTypeLabel(entry.type)}
                                    </Badge>
                                    {entry.is_fixed && (
                                      <Badge variant="outline" className="text-xs h-5 px-1.5">Fixo</Badge>
                                    )}
                                  </div>
                                </div>
                                {canManage && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => setDeletingEntry(entry)}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Benefits */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-sm flex items-center gap-2">
                          <Gift className="w-4 h-4 text-muted-foreground" />
                          Benefícios
                        </h4>
                        {canManage && unassignedBenefits.length > 0 && (
                          <Button size="sm" variant="outline" onClick={() => setAddBenefitOpen(true)} className="h-7 text-xs">
                            <Plus className="w-3 h-3 mr-1" />
                            Adicionar
                          </Button>
                        )}
                      </div>
                      
                      {(isNew ? pendingBenefits : benefitAssignments).length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-6 bg-background rounded-lg border border-dashed">
                          Nenhum benefício atribuído
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {isNew
                            ? pendingBenefits.map((b) => {
                                const description = getBenefitCalculationDescription(
                                  b.value,
                                  b.value_type,
                                  b.applicable_days as DayAbbrev[],
                                  currentMonth,
                                  currentYear
                                );
                                return (
                                  <div
                                    key={b.id}
                                    className="p-3 rounded-lg bg-background border hover:border-primary/30 transition-colors"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-sm font-medium truncate pr-2">{b.benefit_name}</span>
                                          <span className="font-mono text-sm font-semibold shrink-0">
                                            {formatCurrency(b.monthly_value)}
                                          </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{description}</p>
                                      </div>
                                      {canManage && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                          onClick={() => setDeletingAssignment(b)}
                                        >
                                          <X className="w-3 h-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            : benefitAssignments.map((assignment: any) => {
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
                                    className="p-3 rounded-lg bg-background border hover:border-primary/30 transition-colors"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-sm font-medium truncate pr-2">{benefit.name}</span>
                                          <span className="font-mono text-sm font-semibold shrink-0">
                                            {formatCurrency(monthlyValue)}
                                          </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{description}</p>
                                      </div>
                                      {canManage && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                          onClick={() => setDeletingAssignment(assignment)}
                                        >
                                          <X className="w-3 h-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>

                {/* Total Cost Summary - Fixed at Bottom */}
                <div className="shrink-0 p-4 border-t bg-primary/5">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium">
                      Custo Total - {currentMonth.toString().padStart(2, "0")}/{currentYear}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-primary">
                    {formatCurrency(totals.total)}
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                    <span>Lançamentos: {formatCurrency(totals.entriesTotal)}</span>
                    <span>Benefícios: {formatCurrency(totals.benefitsTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer - Always Visible */}
          <div className="shrink-0 flex justify-end gap-3 px-6 py-4 border-t bg-background">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
              <Button onClick={isNew ? handleAddPendingEntry : handleAddEntry}>
                Adicionar
              </Button>
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
              <Button onClick={isNew ? handleAddPendingBenefit : handleAddBenefit}>
                Adicionar
              </Button>
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
              Tem certeza que deseja remover este lançamento? Esta ação não pode ser desfeita.
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
              Tem certeza que deseja remover este benefício? Esta ação não pode ser desfeita.
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
    </>
  );
};

export default CollaboratorModal;
