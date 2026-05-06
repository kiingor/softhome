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
  DialogDescription,
  DialogFooter,
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
import { FloppyDisk as Save, Plus, CurrencyDollar as DollarSign, Gift, Buildings as Building2, Users, CircleNotch as Loader2, X, Wallet, TreePalm as Palmtree, ArrowsLeftRight as ArrowRightLeft, Power, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { formatCPFInput, cleanCPF, validateCPF, formatPhoneInput, formatCEPInput, cleanCEP, BRAZIL_STATES } from "@/lib/validators";
import { sendWhatsAppNotification } from "@/lib/whatsappNotifications";
import { formatCurrency, formatCurrencyForInput, parseCurrencyInput, getCurrentCompetencia } from "@/lib/formatters";
import { calculateMonthlyBenefitValue, getBenefitCalculationDescription, DayAbbrev } from "@/lib/workingDays";
import { useStoreHolidays } from "@/modules/payroll/hooks/use-store-holidays";
import CollaboratorValidationTab from "./CollaboratorValidationTab";
import { PositionChangeDialog } from "@/components/exames/PositionChangeDialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { VacationPeriodAdjustDialog } from "./VacationPeriodAdjustDialog";
import { Pencil } from "@phosphor-icons/react";

interface PendingEntry {
  id: string;
  type: "salario_base" | "hora_extra" | "custo" | "despesa" | "beneficio" | "inss" | "fgts" | "irpf";
  description: string;
  value: number;
  is_fixed: boolean;
  source: "position" | "manual" | "tax";
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

export interface CollaboratorPrefill {
  name?: string;
  cpf?: string;
  rg?: string;
  email?: string;
  phone?: string;
  birth_date?: string;
  position_id?: string;
  regime?: "clt" | "pj" | "estagiario";
  address?: string;
  district?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  notes?: string;
}

interface CollaboratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaboratorId?: string | null;
  prefill?: CollaboratorPrefill;
  onSuccess?: (collaboratorId?: string) => void;
}

const CollaboratorModal = ({
  open,
  onOpenChange,
  collaboratorId,
  prefill,
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
    rg: "",
    email: "",
    phone: "",
    birth_date: "",
    position_id: "",
    store_id: "",
    contracted_store_id: "",
    team_id: "",
    admission_date: "",
    regime: "clt" as "clt" | "pj" | "estagiario",
    status: "ativo" as "ativo" | "inativo" | "aguardando_documentacao" | "validacao_pendente" | "reprovado",
    is_temp: false,
    is_pcd: false,
    is_apprentice: false,
    address: "",
    district: "",
    city: "",
    state: "",
    postal_code: "",
    notes: "",
    password: "",
  });
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [previousPositionId, setPreviousPositionId] = useState<string | null>(null);
  const [adjustingPeriod, setAdjustingPeriod] = useState<any | null>(null);

  // Pending entries/benefits for new collaborators
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [pendingBenefits, setPendingBenefits] = useState<PendingBenefit[]>([]);

  // Modals
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [addBenefitOpen, setAddBenefitOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<any>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<any>(null);
  const [editingAssignmentValue, setEditingAssignmentValue] = useState<{
    assignment: any;
    inputValue: string;
  } | null>(null);
  const [savingCustomValue, setSavingCustomValue] = useState(false);
  const [createStoreOpen, setCreateStoreOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [positionChangeOpen, setPositionChangeOpen] = useState(false);

  // Entry form state - extended with month/year/installment
  const [entryForm, setEntryForm] = useState({
    type: "hora_extra" as "salario_base" | "hora_extra" | "custo" | "despesa" | "beneficio",
    description: "",
    value: "",
    is_fixed: false,
    month: currentMonth,
    year: currentYear,
    is_installment: false,
    installment_count: 2,
  });

  // Benefit assignment state
  const [selectedBenefitId, setSelectedBenefitId] = useState("");

  const canManage = hasAnyRole(["admin_gc", "gestor_gc"]);

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

  // Feriados da store do colaborador (pra cálculo de benefícios diários).
  // Cai pra contracted_store_id se não tem store_id.
  const benefitStoreId = formData.store_id || formData.contracted_store_id || null;
  const { holidayDates } = useStoreHolidays(
    open ? benefitStoreId : null,
    currentYear,
  );

  // Fetch vacation periods for existing collaborator
  const { data: vacationPeriods = [] } = useQuery({
    queryKey: ["vacation-periods-collaborator", collaboratorId],
    queryFn: async () => {
      if (!collaboratorId) return [];
      const { data, error } = await supabase
        .from("vacation_periods")
        .select("*")
        .eq("collaborator_id", collaboratorId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!collaboratorId && open,
  });

  // Fetch vacation requests for existing collaborator
  const { data: vacationRequests = [] } = useQuery({
    queryKey: ["vacation-requests-collaborator", collaboratorId],
    queryFn: async () => {
      if (!collaboratorId) return [];
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("*, vacation_period:vacation_periods(*)")
        .eq("collaborator_id", collaboratorId)
        .in("status", ["approved", "in_progress", "completed"])
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!collaboratorId && open,
  });

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      if (collaborator) {
        const c = collaborator as typeof collaborator & {
          rg?: string | null;
          birth_date?: string | null;
          regime?: "clt" | "pj" | "estagiario" | null;
          is_pcd?: boolean | null;
          is_apprentice?: boolean | null;
          address?: string | null;
          district?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          notes?: string | null;
        };
        setFormData({
          name: c.name || "",
          cpf: c.cpf || "",
          rg: c.rg || "",
          email: c.email || "",
          phone: c.phone || "",
          birth_date: c.birth_date || "",
          position_id: c.position_id || "",
          store_id: c.store_id || "",
          contracted_store_id: c.contracted_store_id || "",
          team_id: c.team_id || "",
          admission_date: c.admission_date || "",
          regime: (c.regime as "clt" | "pj" | "estagiario") || "clt",
          status: c.status || "ativo",
          is_temp: c.is_temp || false,
          is_pcd: c.is_pcd || false,
          is_apprentice: c.is_apprentice || false,
          address: c.address || "",
          district: c.district || "",
          city: c.city || "",
          state: c.state || "",
          postal_code: c.postal_code ? formatCEPInput(c.postal_code) : "",
          notes: c.notes || "",
          password: "",
        });
        setShowPasswordField(!c.user_id);
      } else {
        // Modal de "novo colaborador" — usa prefill se existir (vindo da
        // tela de admissão, p.ex.) pra deixar tudo preenchido.
        setFormData({
          name: prefill?.name ?? "",
          cpf: prefill?.cpf ?? "",
          rg: prefill?.rg ?? "",
          email: prefill?.email ?? "",
          phone: prefill?.phone ?? "",
          birth_date: prefill?.birth_date ?? "",
          position_id: prefill?.position_id ?? "",
          store_id: "",
          contracted_store_id: "",
          team_id: "",
          admission_date: "",
          regime: prefill?.regime ?? "clt",
          status: "ativo",
          is_temp: false,
          is_pcd: false,
          is_apprentice: false,
          address: prefill?.address ?? "",
          district: prefill?.district ?? "",
          city: prefill?.city ?? "",
          state: prefill?.state ?? "",
          postal_code: prefill?.postal_code
            ? formatCEPInput(prefill.postal_code)
            : "",
          notes: prefill?.notes ?? "",
          password: "",
        });
        setShowPasswordField(false);
        setPendingEntries([]);
        setPendingBenefits([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, collaborator]);

  // When position changes, update pending salary entry (for new collaborators)
  useEffect(() => {
    if (!open) return;

    const position = positions.find((p) => p.id === formData.position_id);
    
    if (isNew) {
      setPendingEntries((prev) => {
        const filtered = prev.filter((e) => e.source !== "position" && e.source !== "tax");
        
        if (position && position.salary > 0) {
          const newEntries: PendingEntry[] = [
            {
              id: `position-${position.id}`,
              type: "salario_base" as const,
              description: `Salário Base - ${position.name}`,
              value: position.salary,
              is_fixed: true,
              source: "position" as const,
            },
          ];
  
          if (position.inss_percent && position.inss_percent > 0) {
            const inssValue = position.salary * (position.inss_percent / 100);
            newEntries.push({
              id: `tax-inss-${position.id}`,
              type: "inss" as const,
              description: `INSS ${position.inss_percent}%`,
              value: inssValue,
              is_fixed: true,
              source: "tax" as const,
            });
          }
  
          if (position.fgts_percent && position.fgts_percent > 0) {
            const fgtsValue = position.salary * (position.fgts_percent / 100);
            newEntries.push({
              id: `tax-fgts-${position.id}`,
              type: "fgts" as const,
              description: `FGTS ${position.fgts_percent}%`,
              value: fgtsValue,
              is_fixed: true,
              source: "tax" as const,
            });
          }
  
          if (position.irpf_percent && position.irpf_percent > 0) {
            const irpfValue = position.salary * (position.irpf_percent / 100);
            newEntries.push({
              id: `tax-irpf-${position.id}`,
              type: "irpf" as const,
              description: `IRPF ${position.irpf_percent}%`,
              value: irpfValue,
              is_fixed: true,
              source: "tax" as const,
            });
          }
  
          return [...filtered, ...newEntries];
        }
        
        return filtered;
      });
    }
    // For existing collaborators, position changes are handled exclusively via PositionChangeDialog
  }, [formData.position_id, positions.length, isNew, open, collaboratorId, currentCompany, currentMonth, currentYear, previousPositionId]);

  // Handle position change via dialog (existing collaborators only)
  const handlePositionChange = async (newPositionId: string, riskGroupChanged: boolean) => {
    if (!collaboratorId || !currentCompany) return;
    const newPosition = positions.find((p) => p.id === newPositionId);
    if (!newPosition) return;

    try {
      // 1. Update collaborator position
      await supabase
        .from("collaborators")
        .update({ position_id: newPositionId, position: newPosition.name })
        .eq("id", collaboratorId);

      // 2. Delete ONLY current month salary/tax entries (preserve history)
      await supabase
        .from("payroll_entries")
        .delete()
        .eq("collaborator_id", collaboratorId)
        .eq("month", currentMonth)
        .eq("year", currentYear)
        .in("type", ["salario_base", "inss", "fgts", "irpf"]);

      // 3. Create new entries with new position values
      if (newPosition.salary > 0) {
        const entriesToCreate: any[] = [
          {
            collaborator_id: collaboratorId,
            company_id: currentCompany.id,
            type: "salario_base",
            description: `Salário Base - ${newPosition.name}`,
            value: newPosition.salary,
            month: currentMonth,
            year: currentYear,
            is_fixed: true,
          },
        ];

        if (newPosition.inss_percent && newPosition.inss_percent > 0) {
          entriesToCreate.push({
            collaborator_id: collaboratorId,
            company_id: currentCompany.id,
            type: "inss",
            description: `INSS ${newPosition.inss_percent}%`,
            value: newPosition.salary * (newPosition.inss_percent / 100),
            month: currentMonth,
            year: currentYear,
            is_fixed: true,
          });
        }

        if (newPosition.fgts_percent && newPosition.fgts_percent > 0) {
          entriesToCreate.push({
            collaborator_id: collaboratorId,
            company_id: currentCompany.id,
            type: "fgts",
            description: `FGTS ${newPosition.fgts_percent}%`,
            value: newPosition.salary * (newPosition.fgts_percent / 100),
            month: currentMonth,
            year: currentYear,
            is_fixed: true,
          });
        }

        if (newPosition.irpf_percent && newPosition.irpf_percent > 0) {
          entriesToCreate.push({
            collaborator_id: collaboratorId,
            company_id: currentCompany.id,
            type: "irpf",
            description: `IRPF ${newPosition.irpf_percent}%`,
            value: newPosition.salary * (newPosition.irpf_percent / 100),
            month: currentMonth,
            year: currentYear,
            is_fixed: true,
          });
        }

        await supabase.from("payroll_entries").insert(entriesToCreate);
      }

      // 4. Always create mudanca_funcao exam on position change
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      const { error: examError } = await supabase.from("occupational_exams").insert({
        collaborator_id: collaboratorId,
        company_id: currentCompany.id,
        exam_type: "mudanca_funcao",
        status: "pendente",
        due_date: dueDate.toISOString().slice(0, 10),
        position_id: newPositionId,
        previous_position_id: collaborator?.position_id || null,
        risk_group_at_time: newPosition.risk_group || null,
        auto_generated: true,
        notes: riskGroupChanged
          ? "Gerado automaticamente por troca de função (grupo de risco alterado)"
          : "Gerado automaticamente por troca de função",
      });
      if (examError) {
        console.error("Erro ao criar exame de mudança de função:", examError);
        throw new Error("Falha ao criar exame de mudança de função: " + examError.message);
      }

      // Send WhatsApp notification for the new exam
      sendWhatsAppNotification(currentCompany.id, collaboratorId, "exam_created", {
        tipo_exame: "Mudança de Função",
        data_exame: dueDate.toISOString().slice(0, 10),
      });

      // Update local state
      setFormData((prev) => ({ ...prev, position_id: newPositionId }));
      setPreviousPositionId(newPositionId);
      setPositionChangeOpen(false);
      refetchEntries();
      queryClient.invalidateQueries({ queryKey: ["collaborators"] });
      queryClient.invalidateQueries({ queryKey: ["collaborator", collaboratorId] });
      queryClient.invalidateQueries({ queryKey: ["occupational-exams"] });

      toast.success("Cargo atualizado! Valores de salário aplicados a partir deste mês. Um exame de Mudança de Função foi criado.");
    } catch (error: any) {
      toast.error("Erro ao trocar cargo: " + error.message);
    }
  };

  // Initialize previousPositionId when modal opens for existing collaborator
  useEffect(() => {
    if (open && collaborator && collaborator.position_id) {
      setPreviousPositionId(collaborator.position_id);
    } else if (!open) {
      setPreviousPositionId(null);
    }
  }, [open, collaborator]);

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
    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    const cleanedCPF = cleanCPF(formData.cpf);
    if (!validateCPF(cleanedCPF)) {
      toast.error("CPF inválido");
      return;
    }

    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        toast.error("Email inválido. Por favor, insira um email válido.");
        return;
      }
    }

    if (formData.password && formData.password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    setIsSaving(true);
    let savedCollabId: string | undefined;
    try {
      let userId: string | null = null;

      if (formData.email.trim() && formData.password) {
        setIsCreatingUser(true);
        const normalizedEmail = formData.email.trim().toLowerCase();
        
        const { data: createData, error: createError } = await supabase.functions.invoke(
          "create-collaborator-user",
          {
            body: {
              email: normalizedEmail,
              password: formData.password,
             full_name: formData.name,
             company_id: currentCompany!.id,
           },
          }
        );

        if (createError) {
          console.error("Edge function error:", createError);
          toast.error("Erro ao criar acesso: " + createError.message);
          setIsCreatingUser(false);
          return;
        }

        if (createData?.error) {
          toast.error(createData.error);
          setIsCreatingUser(false);
        } else if (createData?.user_id) {
          userId = createData.user_id;
        }
        
        setIsCreatingUser(false);
      }

      const baseData = {
        name: formData.name.trim(),
        cpf: cleanedCPF,
        rg: formData.rg.trim() || null,
        email: formData.email.trim().toLowerCase() || null,
        phone: formData.phone.replace(/\D/g, "") || null,
        birth_date: formData.birth_date || null,
        position_id: formData.position_id || null,
        store_id: formData.store_id || null,
        contracted_store_id: formData.contracted_store_id || null,
        team_id: formData.team_id || null,
        admission_date: formData.admission_date || null,
        regime: formData.regime,
        is_temp: formData.is_temp,
        is_pcd: formData.is_pcd,
        is_apprentice: formData.is_apprentice,
        address: formData.address.trim() || null,
        district: formData.district.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state || null,
        postal_code: cleanCEP(formData.postal_code) || null,
        notes: formData.notes.trim() || null,
        company_id: currentCompany!.id,
        position: positions.find((p) => p.id === formData.position_id)?.name || null,
        ...(userId && { user_id: userId }),
      };

      // Cadastro avulso pelo admin: já entra "ativo". Quem precisa do fluxo
      // de admissão (aguardando_documentacao) é admission-public-submit.
      const saveData = isNew
        ? { ...baseData, status: "ativo" as const }
        : baseData;

      if (isNew) {
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

        savedCollabId = newCollab.id;

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

        // Send WhatsApp notification
        sendWhatsAppNotification(currentCompany!.id, newCollab.id, "collaborator_registered");
      } else {
        const updateData = {
          ...saveData,
          ...(userId ? { user_id: userId } : {}),
        };
        delete (updateData as any).user_id;
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
      onSuccess?.(savedCollabId ?? collaboratorId ?? undefined);
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setIsSaving(false);
      setIsCreatingUser(false);
    }
  };

  // Desativar colaborador (status=inativo + termination_date)
  const handleDeactivate = async () => {
    if (!collaboratorId) return;
    setIsDeactivating(true);
    try {
      const { error } = await supabase
        .from("collaborators")
        .update({
          status: "inativo",
          termination_date: new Date().toISOString().slice(0, 10),
        })
        .eq("id", collaboratorId);
      if (error) throw error;
      toast.success("Colaborador desativado.");
      queryClient.invalidateQueries({ queryKey: ["collaborators"] });
      queryClient.invalidateQueries({ queryKey: ["collaborator", collaboratorId] });
      onSuccess?.();
      setConfirmDeactivate(false);
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao desativar: " + error.message);
    } finally {
      setIsDeactivating(false);
    }
  };

  // Excluir colaborador (chama Edge Function que apaga auth user + dados)
  const handleDelete = async () => {
    if (!collaboratorId) return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-collaborator", {
        body: { collaboratorId },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) {
        throw new Error((data as { error: string }).error);
      }
      toast.success("Colaborador excluído.");
      queryClient.invalidateQueries({ queryKey: ["collaborators"] });
      onSuccess?.();
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Add pending entry (for new collaborators)
  const handleAddPendingEntry = () => {
    if (!entryForm.value) {
      toast.error("Valor é obrigatório");
      return;
    }

    const numericValue = parseCurrencyInput(entryForm.value);

    if (entryForm.is_installment && entryForm.installment_count > 1) {
      const valuePerInstallment = numericValue / entryForm.installment_count;
      for (let i = 0; i < entryForm.installment_count; i++) {
        const entryMonth = ((entryForm.month + i - 1) % 12) + 1;
        const entryYear = entryForm.year + Math.floor((entryForm.month + i - 1) / 12);
        const desc = `${entryForm.description || getEntryTypeLabel(entryForm.type)} (${i + 1}/${entryForm.installment_count})`;
        setPendingEntries((prev) => [
          ...prev,
          {
            id: `manual-${Date.now()}-${i}`,
            type: entryForm.type,
            description: desc,
            value: valuePerInstallment,
            is_fixed: false,
            source: "manual",
          },
        ]);
      }
    } else {
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
    }

    setAddEntryOpen(false);
    setEntryForm({ type: "hora_extra", description: "", value: "", is_fixed: false, month: currentMonth, year: currentYear, is_installment: false, installment_count: 2 });
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

      if (entryForm.is_installment && entryForm.installment_count > 1) {
        const valuePerInstallment = numericValue / entryForm.installment_count;
        const groupId = crypto.randomUUID();
        const entriesToCreate = [];

        for (let i = 0; i < entryForm.installment_count; i++) {
          const entryMonth = ((entryForm.month + i - 1) % 12) + 1;
          const entryYear = entryForm.year + Math.floor((entryForm.month + i - 1) / 12);
          const desc = `${entryForm.description || ""} (${i + 1}/${entryForm.installment_count})`;
          
          entriesToCreate.push({
            collaborator_id: collaboratorId,
            company_id: currentCompany!.id,
            type: entryForm.type,
            value: valuePerInstallment,
            description: desc.trim(),
            month: entryMonth,
            year: entryYear,
            is_fixed: false,
            installment_group_id: groupId,
            installment_number: i + 1,
            installment_total: entryForm.installment_count,
          });
        }

        const { error: instErr } = await supabase
          .from("payroll_entries")
          .insert(entriesToCreate);
        if (instErr) throw instErr;
      } else {
        const { error: insErr } = await supabase
          .from("payroll_entries")
          .insert({
            collaborator_id: collaboratorId,
            company_id: currentCompany!.id,
            type: entryForm.type,
            value: numericValue,
            description: entryForm.description || null,
            month: entryForm.month,
            year: entryForm.year,
            is_fixed: entryForm.is_fixed,
          });
        if (insErr) throw insErr;
      }

      refetchEntries();
      setAddEntryOpen(false);
      setEntryForm({ type: "hora_extra", description: "", value: "", is_fixed: false, month: currentMonth, year: currentYear, is_installment: false, installment_count: 2 });
      toast.success("Lançamento adicionado!");
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Erro ao adicionar lançamento";
      toast.error(msg);
    }
  };

  // Delete payroll entry
  const handleDeleteEntry = async () => {
    if (!deletingEntry) return;
    
    if (isNew) {
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
      currentYear,
      holidayDates,
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

  // Save custom monthly value override for an assignment
  const handleSaveCustomValue = async () => {
    if (!editingAssignmentValue) return;
    const parsed = parseCurrencyInput(editingAssignmentValue.inputValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Valor inválido.");
      return;
    }
    setSavingCustomValue(true);
    try {
      const defaultValue =
        Number(editingAssignmentValue.assignment.benefit?.value ?? 0);
      // Se o valor digitado for o mesmo do default, limpa custom_value
      // pra deixar a vinculação reagir a futuras mudanças do benefício.
      const newCustom = parsed === defaultValue ? null : parsed;
      const { error } = await supabase
        .from("benefits_assignments")
        .update({ custom_value: newCustom })
        .eq("id", editingAssignmentValue.assignment.id);
      if (error) throw error;
      await refetchAssignments();
      setEditingAssignmentValue(null);
      toast.success("Valor atualizado ✓");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar valor";
      toast.error(msg);
    } finally {
      setSavingCustomValue(false);
    }
  };

  // Calculate totals
  const calculateTotalCost = () => {
    let entriesTotal = 0;
    let benefitsTotal = 0;
    let taxTotal = 0;

    if (isNew) {
      entriesTotal = pendingEntries.reduce((sum, e) => {
        if (e.type === "fgts") return sum;
        if (e.type === "inss" || e.type === "irpf") return sum - e.value;
        if (e.type === "custo" || e.type === "despesa") return sum - e.value;
        return sum + e.value;
      }, 0);
      taxTotal = pendingEntries.reduce((sum, e) => {
        if (e.type === "fgts") return sum + e.value;
        return sum;
      }, 0);
      benefitsTotal = pendingBenefits.reduce((sum, b) => sum + b.monthly_value, 0);
    } else {
      entriesTotal = payrollEntries.reduce((sum, e) => {
        if (e.type === "fgts") return sum;
        if (e.type === "inss" || e.type === "irpf") return sum - e.value;
        if (e.type === "custo" || e.type === "despesa") return sum - e.value;
        return sum + e.value;
      }, 0);
      taxTotal = payrollEntries.reduce((sum, e) => {
        if (e.type === "fgts") return sum + e.value;
        return sum;
      }, 0);
      benefitsTotal = benefitAssignments.reduce((sum, a: any) => {
        if (!a.benefit) return sum;
        const valueType = a.benefit.value_type || "monthly";
        const baseValue =
          valueType === "monthly" && a.custom_value != null
            ? Number(a.custom_value)
            : a.benefit.value || 0;
        const value = calculateMonthlyBenefitValue(
          baseValue,
          valueType,
          (a.benefit.applicable_days || ["mon", "tue", "wed", "thu", "fri"]) as DayAbbrev[],
          currentMonth,
          currentYear,
          holidayDates,
        );
        return sum + value;
      }, 0);
    }

    return { entriesTotal, benefitsTotal, taxTotal, total: entriesTotal + benefitsTotal, companyCost: entriesTotal + benefitsTotal + taxTotal };
  };

  const totals = calculateTotalCost();

  // Get entry type label
  const getEntryTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      salario_base: "Salário base",
      hora_extra: "Hora extra",
      falta: "Falta",
      atestado: "Atestado",
      beneficio: "Benefício",
      adiantamento: "Adiantamento",
      bonificacao: "Bonificação",
      gratificacao: "Gratificação",
      desconto: "Desconto",
      // Legacy
      salario: "Salário",
      adicional: "Adicional",
      custo: "Custo",
      despesa: "Despesa",
      vale: "Vale",
      inss: "INSS",
      fgts: "FGTS",
      irpf: "IRPF",
    };
    return labels[type] || type;
  };

  // Get entry type color
  const getEntryTypeVariant = (type: string): "default" | "secondary" | "destructive" | "outline" => {
    if (type === "custo" || type === "despesa" || type === "inss" || type === "irpf") return "destructive";
    if (type === "salario_base") return "default";
    if (type === "fgts" || type === "beneficio") return "outline";
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
        <DialogContent className="max-w-5xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
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
            /* Content with Tabs */
            <Tabs defaultValue="geral" className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {["validacao_pendente", "reprovado"].includes(formData.status) && collaboratorId && (
                <div className="shrink-0 px-6 pt-2">
                  <TabsList>
                    <TabsTrigger value="geral">Geral</TabsTrigger>
                    <TabsTrigger value="validacao">Validação</TabsTrigger>
                  </TabsList>
                </div>
              )}

              <TabsContent value="geral" className="flex-1 min-h-0 overflow-hidden m-0 flex flex-col">
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-x min-h-0 overflow-hidden">
              {/* Left Column - Dados Cadastrais */}
              <div className="flex flex-col min-h-0 overflow-hidden">
              <ScrollArea className="flex-1 min-h-0">
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

                  {/* Password Field */}
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

                  {/* RG + Data de Nascimento */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="rg">RG</Label>
                      <Input
                        id="rg"
                        value={formData.rg}
                        onChange={(e) => setFormData((prev) => ({ ...prev, rg: e.target.value }))}
                        placeholder="00.000.000-0"
                        maxLength={20}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="birth_date">Data de Nascimento</Label>
                      <Input
                        id="birth_date"
                        type="date"
                        value={formData.birth_date}
                        onChange={(e) => setFormData((prev) => ({ ...prev, birth_date: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Tipo de Contrato (regime) */}
                  <div className="space-y-2">
                    <Label>Tipo de Contrato</Label>
                    <Select
                      value={formData.regime}
                      onValueChange={(v) => setFormData((prev) => ({ ...prev, regime: v as typeof prev.regime }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clt">CLT</SelectItem>
                        <SelectItem value="pj">PJ</SelectItem>
                        <SelectItem value="estagiario">Estagiário</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Endereço */}
                  <div className="space-y-2">
                    <Label htmlFor="address">Endereço</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                      placeholder="Rua, número, complemento"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="district">Bairro</Label>
                      <Input
                        id="district"
                        value={formData.district}
                        onChange={(e) => setFormData((prev) => ({ ...prev, district: e.target.value }))}
                        placeholder="Bairro"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="postal_code">CEP</Label>
                      <Input
                        id="postal_code"
                        value={formData.postal_code}
                        onChange={(e) => setFormData((prev) => ({ ...prev, postal_code: formatCEPInput(e.target.value) }))}
                        placeholder="00000-000"
                        maxLength={9}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                        placeholder="Cidade"
                      />
                    </div>
                    <div className="space-y-2 w-24">
                      <Label>UF</Label>
                      <Select
                        value={formData.state}
                        onValueChange={(v) => setFormData((prev) => ({ ...prev, state: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent>
                          {BRAZIL_STATES.map((uf) => (
                            <SelectItem key={uf} value={uf}>
                              {uf}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />

                  {/* Empresa + Empresa Contratada (lado a lado) */}
                  <div className="grid grid-cols-2 gap-4">
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
                          <SelectValue placeholder="Selecione" />
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

                    <div className="space-y-2">
                      <Label>Empresa Contratada</Label>
                      <Select
                        value={formData.contracted_store_id}
                        onValueChange={(v) =>
                          setFormData((prev) => ({ ...prev, contracted_store_id: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
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
                    {!isNew && formData.position_id ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/50">
                          <span className="text-sm font-medium">
                            {positions.find((p) => p.id === formData.position_id)?.name || "—"}
                          </span>
                          {(() => {
                            const pos = positions.find((p) => p.id === formData.position_id);
                            return pos && pos.salary > 0 ? (
                              <Badge variant="secondary" className="text-xs">{formatCurrency(pos.salary)}</Badge>
                            ) : null;
                          })()}
                        </div>
                        {canManage && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPositionChangeOpen(true)}
                            className="shrink-0"
                          >
                            <ArrowRightLeft className="w-4 h-4 mr-1" />
                            Trocar Função
                          </Button>
                        )}
                      </div>
                    ) : (
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
                    )}
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

                  {/* Flags: Avulso / PCD / Aprendiz */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Avulso</Label>
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
                    <div className="space-y-2">
                      <Label>PCD</Label>
                      <div className="flex items-center space-x-2 pt-2">
                        <Switch
                          checked={formData.is_pcd}
                          onCheckedChange={(v) => setFormData((prev) => ({ ...prev, is_pcd: v }))}
                        />
                        <span className="text-sm text-muted-foreground">
                          {formData.is_pcd ? "Sim" : "Não"}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Jovem Aprendiz</Label>
                      <div className="flex items-center space-x-2 pt-2">
                        <Switch
                          checked={formData.is_apprentice}
                          onCheckedChange={(v) => setFormData((prev) => ({ ...prev, is_apprentice: v }))}
                        />
                        <span className="text-sm text-muted-foreground">
                          {formData.is_apprentice ? "Sim" : "Não"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Observações */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações</Label>
                    <textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Notas internas sobre o colaborador..."
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>
              </ScrollArea>
              </div>

              {/* Right Column - Financeiro */}
              <div className="flex flex-col min-h-0 bg-muted/30">
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
                      
                      {(() => {
                        const allEntries = isNew ? pendingEntries : payrollEntries;
                        const visibleEntries = allEntries.filter(
                          (e: any) => e.type !== "beneficio",
                        );
                        if (visibleEntries.length === 0) {
                          return (
                            <div className="text-sm text-muted-foreground text-center py-6 bg-background rounded-lg border border-dashed">
                              {isNew ? "Selecione um cargo para adicionar o salário" : "Nenhum lançamento no mês atual"}
                            </div>
                          );
                        }
                        return (
                          <div className="space-y-2">
                            {visibleEntries.map((entry: any) => (
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
                                    <span className={`font-mono text-sm font-semibold shrink-0 ${
                                      ["inss", "irpf", "despesa", "custo", "fgts"].includes(entry.type)
                                        ? "text-destructive"
                                        : "text-green-600"
                                    }`}>
                                      {["inss", "irpf", "despesa", "custo", "fgts"].includes(entry.type) ? "- " : "+ "}
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
                                    {entry.installment_number && (
                                      <Badge variant="outline" className="text-xs h-5 px-1.5">
                                        {entry.installment_number}/{entry.installment_total}
                                      </Badge>
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
                        );
                      })()}
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
                                  currentYear,
                                  holidayDates,
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

                                const valueType = benefit.value_type || "monthly";
                                const isMonthly = valueType === "monthly";
                                const hasCustom = isMonthly && assignment.custom_value != null;
                                const baseValue = hasCustom
                                  ? Number(assignment.custom_value)
                                  : benefit.value || 0;

                                const monthlyValue = calculateMonthlyBenefitValue(
                                  baseValue,
                                  valueType,
                                  (benefit.applicable_days || ["mon", "tue", "wed", "thu", "fri"]) as DayAbbrev[],
                                  currentMonth,
                                  currentYear,
                                  holidayDates,
                                );
                                const description = getBenefitCalculationDescription(
                                  baseValue,
                                  valueType,
                                  (benefit.applicable_days || ["mon", "tue", "wed", "thu", "fri"]) as DayAbbrev[],
                                  currentMonth,
                                  currentYear,
                                  holidayDates,
                                );

                                return (
                                  <div
                                    key={assignment.id}
                                    className="p-3 rounded-lg bg-background border hover:border-primary/30 transition-colors"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-sm font-medium truncate pr-2">
                                            {benefit.name}
                                            {hasCustom && (
                                              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-amber-600">
                                                · custom
                                              </span>
                                            )}
                                          </span>
                                          <span className="font-mono text-sm font-semibold shrink-0">
                                            {formatCurrency(monthlyValue)}
                                          </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{description}</p>
                                      </div>
                                      {canManage && (
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          {isMonthly && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6 text-muted-foreground hover:text-primary"
                                              title="Editar valor pra esse colaborador"
                                              onClick={() =>
                                                setEditingAssignmentValue({
                                                  assignment,
                                                  inputValue: formatCurrencyForInput(baseValue),
                                                })
                                              }
                                            >
                                              <Pencil className="w-3 h-3" />
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                            onClick={() => setDeletingAssignment(assignment)}
                                          >
                                            <X className="w-3 h-3" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                        </div>
                      )}
                    </div>

                    {/* Vacation History - only for existing collaborators */}
                    {!isNew && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium text-sm flex items-center gap-2">
                            <Palmtree className="w-4 h-4 text-muted-foreground" />
                            Férias
                          </h4>
                        </div>

                        {/* Vacation Balance */}
                        {vacationPeriods.length > 0 && (
                          <div className="mb-3 p-3 rounded-lg bg-background border">
                            <p className="text-xs text-muted-foreground mb-2">Saldo de Períodos Aquisitivos</p>
                            <div className="space-y-1.5">
                              {vacationPeriods.slice(0, 3).map((period: any) => (
                                <div key={period.id} className="flex items-center justify-between text-sm gap-2">
                                  <span className="text-muted-foreground flex-1 min-w-0 truncate">
                                    {new Date(period.start_date).toLocaleDateString("pt-BR")} - {new Date(period.end_date).toLocaleDateString("pt-BR")}
                                    {period.manual_adjustment_at && (
                                      <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-600">· ajuste manual</span>
                                    )}
                                  </span>
                                  <Badge variant={
                                    period.status === "available" ? "default" :
                                    period.status === "partially_used" ? "secondary" :
                                    period.status === "used" ? "outline" : "destructive"
                                  } className="text-xs h-5 px-1.5 shrink-0">
                                    {period.days_remaining}d restantes
                                  </Badge>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0"
                                    onClick={() => setAdjustingPeriod(period)}
                                    title="Ajustar saldo manualmente"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Vacation Requests History */}
                        {vacationRequests.length === 0 ? (
                          <div className="text-sm text-muted-foreground text-center py-6 bg-background rounded-lg border border-dashed">
                            Nenhum registro de férias
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {vacationRequests.map((request: any) => {
                              const statusLabels: Record<string, string> = {
                                approved: "Aprovada",
                                in_progress: "Em Gozo",
                                completed: "Concluída",
                              };
                              const statusColors: Record<string, "default" | "secondary" | "outline"> = {
                                approved: "default",
                                in_progress: "secondary",
                                completed: "outline",
                              };
                              return (
                                <div key={request.id} className="p-3 rounded-lg bg-background border hover:border-primary/30 transition-colors">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium">
                                      {new Date(request.start_date).toLocaleDateString("pt-BR")} - {new Date(request.end_date).toLocaleDateString("pt-BR")}
                                    </span>
                                    <Badge variant={statusColors[request.status] || "outline"} className="text-xs h-5 px-1.5">
                                      {statusLabels[request.status] || request.status}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{request.days_count} dias</span>
                                    {request.sell_days > 0 && (
                                      <span>• {request.sell_days} dias abono</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Total Cost Summary - Fixed at Bottom */}
                <div className="shrink-0 p-4 border-t bg-primary/5">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium">
                      Resumo - {currentMonth.toString().padStart(2, "0")}/{currentYear}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-primary">
                    {formatCurrency(totals.companyCost)}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                    <span>Líquido: {formatCurrency(totals.total)}</span>
                    <span>FGTS: {formatCurrency(totals.taxTotal)}</span>
                    <span>Benefícios: {formatCurrency(totals.benefitsTotal)}</span>
                  </div>
                </div>
              </div>
                </div>
              </TabsContent>

              {["validacao_pendente", "reprovado"].includes(formData.status) && collaboratorId && (
                <TabsContent value="validacao" className="flex-1 min-h-0 overflow-auto m-0 p-4">
                  <CollaboratorValidationTab
                    collaboratorId={collaboratorId}
                    companyId={currentCompany?.id || ""}
                    collaboratorStatus={formData.status}
                    onStatusChange={() => {
                      queryClient.invalidateQueries({ queryKey: ["collaborators"] });
                      onOpenChange(false);
                    }}
                  />
                </TabsContent>
              )}
            </Tabs>
          )}

          {/* Footer - Always Visible */}
          <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t bg-background">
            <div className="flex items-center gap-2">
              {!isNew && canManage && formData.status !== "inativo" && (
                <Button
                  variant="outline"
                  onClick={() => setConfirmDeactivate(true)}
                  disabled={isDeactivating || isDeleting}
                >
                  <Power className="w-4 h-4 mr-2" />
                  Desativar
                </Button>
              )}
              {!isNew && canManage && (
                <Button
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                  disabled={isDeactivating || isDeleting}
                >
                  <Trash className="w-4 h-4 mr-2" />
                  Excluir
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Deactivate */}
      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar colaborador?</AlertDialogTitle>
            <AlertDialogDescription>
              {formData.name} fica marcado como <strong>inativo</strong> e a
              data de hoje vira a data de desligamento. O histórico (folha,
              férias, exames) é preservado. Você pode reativar editando o
              status no modal depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeactivating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              disabled={isDeactivating}
            >
              {isDeactivating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Power className="w-4 h-4 mr-2" />
              )}
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Delete */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir colaborador?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação <strong>não pode ser desfeita</strong>. Vai remover{" "}
              {formData.name}, todos os lançamentos de folha, benefícios,
              exames e (se houver) o acesso dele ao Portal do Colaborador.
              Para histórico, prefira <em>Desativar</em>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash className="w-4 h-4 mr-2" />
              )}
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Entry Dialog - Extended with month/year/installment */}
      <Dialog open={addEntryOpen} onOpenChange={setAddEntryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Lançamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mês</Label>
                <Select
                  value={entryForm.month.toString()}
                  onValueChange={(v) => setEntryForm((prev) => ({ ...prev, month: parseInt(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={m.toString()}>
                        {m.toString().padStart(2, "0")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ano</Label>
                <Select
                  value={entryForm.year.toString()}
                  onValueChange={(v) => setEntryForm((prev) => ({ ...prev, year: parseInt(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
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
                  <SelectItem value="salario_base">Salário base</SelectItem>
                  <SelectItem value="hora_extra">Hora extra</SelectItem>
                  <SelectItem value="beneficio">Benefício</SelectItem>
                  <SelectItem value="bonificacao">Bonificação</SelectItem>
                  <SelectItem value="gratificacao">Gratificação</SelectItem>
                  <SelectItem value="atestado">Atestado</SelectItem>
                  <SelectItem value="adiantamento">Adiantamento</SelectItem>
                  <SelectItem value="desconto">Desconto</SelectItem>
                  <SelectItem value="falta">Falta</SelectItem>
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
              <Label>Valor Total</Label>
              <Input
                value={entryForm.value}
                onChange={handleValueChange}
                placeholder="R$ 0,00"
              />
            </div>
            
            {/* Fixed vs Installment */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={entryForm.is_fixed}
                  onCheckedChange={(v) => setEntryForm((prev) => ({ ...prev, is_fixed: v, is_installment: v ? false : prev.is_installment }))}
                  disabled={entryForm.is_installment}
                />
                <Label>Lançamento fixo (repete mensalmente)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={entryForm.is_installment}
                  onCheckedChange={(v) => setEntryForm((prev) => ({ ...prev, is_installment: v, is_fixed: v ? false : prev.is_fixed }))}
                  disabled={entryForm.is_fixed}
                />
                <Label>Parcelado</Label>
              </div>
              {entryForm.is_installment && (
                <div className="space-y-2 pl-6">
                  <Label>Número de Parcelas</Label>
                  <Input
                    type="number"
                    min={2}
                    max={48}
                    value={entryForm.installment_count}
                    onChange={(e) => setEntryForm((prev) => ({ ...prev, installment_count: Math.max(2, parseInt(e.target.value) || 2) }))}
                  />
                  {entryForm.value && (
                    <p className="text-xs text-muted-foreground">
                      {entryForm.installment_count}x de {formatCurrency(parseCurrencyInput(entryForm.value) / entryForm.installment_count)}
                    </p>
                  )}
                </div>
              )}
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

      {/* Edit Custom Benefit Value */}
      <Dialog
        open={!!editingAssignmentValue}
        onOpenChange={(open) => !open && !savingCustomValue && setEditingAssignmentValue(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Editar valor do benefício
              {editingAssignmentValue?.assignment?.benefit?.name
                ? ` — ${editingAssignmentValue.assignment.benefit.name}`
                : ""}
            </DialogTitle>
            <DialogDescription>
              Valor mensal específico pra esse colaborador. Pra voltar ao
              padrão do benefício, digite o mesmo valor cadastrado em
              Benefícios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Valor mensal (R$)</Label>
            <Input
              autoFocus
              value={editingAssignmentValue?.inputValue ?? ""}
              onChange={(e) =>
                setEditingAssignmentValue((prev) =>
                  prev ? { ...prev, inputValue: formatCurrencyForInput(e.target.value) } : prev,
                )
              }
              placeholder="0,00"
            />
            {editingAssignmentValue?.assignment?.benefit && (
              <p className="text-xs text-muted-foreground">
                Padrão do benefício:{" "}
                {formatCurrency(
                  Number(editingAssignmentValue.assignment.benefit.value ?? 0),
                )}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setEditingAssignmentValue(null)}
              disabled={savingCustomValue}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveCustomValue}
              disabled={savingCustomValue}
            >
              {savingCustomValue && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Position Change Dialog */}
      <PositionChangeDialog
        open={positionChangeOpen}
        onOpenChange={setPositionChangeOpen}
        currentPosition={positions.find((p) => p.id === formData.position_id) || null}
        positions={positions}
        onConfirm={handlePositionChange}
      />

      {/* Vacation Period Manual Adjustment */}
      <VacationPeriodAdjustDialog
        open={!!adjustingPeriod}
        onOpenChange={(v) => !v && setAdjustingPeriod(null)}
        period={adjustingPeriod}
      />
    </>
  );
};

export default CollaboratorModal;
