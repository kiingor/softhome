import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { validateCPF, cleanCPF } from "@/lib/validators";
import { CircleNotch as Loader2, Question as HelpCircle } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const collaboratorSchema = z.object({
  // básico
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  cpf: z.string().refine((val) => validateCPF(val), "CPF inválido"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  position: z.string().optional(),
  admission_date: z.string().optional(),
  store_id: z.string().optional(),
  team_id: z.string().optional(),
  external_id: z.string().optional(),
  is_temp: z.boolean(),

  // ── Identificação complementar
  support_username: z.string().optional(),
  gender: z.enum(["M", "F"]).optional().or(z.literal("")),
  ethnicity: z.string().optional(),
  education_level: z.string().optional(),
  rg: z.string().optional(),
  rg_issuer: z.string().optional(),
  discord_id: z.string().optional(),
  discord_username: z.string().optional(),
  phone_extension: z.string().optional(),
  radios_freeform: z.string().optional(),
  recado_phone: z.string().optional(),
  supervisor_id: z.string().optional(),

  // ── Lotação
  internal_location: z.string().optional(),
  subsector: z.string().optional(),
  agenda: z.string().optional(),
  indicator_group: z.string().optional(),
  sales_group: z.string().optional(),
  is_homeoffice: z.boolean().optional(),
  has_agenda_access: z.boolean().optional(),
  contracted_store_id: z.string().optional(),
  contracted_cnpj: z.string().optional(),

  // ── Contratação e documentos
  inspira_date: z.string().optional(),
  inspira_value: z.coerce.number().optional(),
  current_salary: z.coerce.number().optional(),
  termination_date: z.string().optional(),
  ctps: z.string().optional(),
  ctps_series: z.string().optional(),
  ctps_uf: z.string().optional(),
  bank_account: z.string().optional(),
  pis: z.string().optional(),
  pix_key: z.string().optional(),
  accounting_code: z.string().optional(),

  // ── Comissões (em %)
  commission_monthly: z.coerce.number().optional(),
  commission_license: z.coerce.number().optional(),
  commission_upgrade: z.coerce.number().optional(),
  commission_tef_install: z.coerce.number().optional(),
  commission_tef_monthly: z.coerce.number().optional(),

  // ── Gerência
  is_manager_leader: z.boolean().optional(),
  is_manager_director: z.boolean().optional(),
  is_manager_support: z.boolean().optional(),
  is_godfather: z.boolean().optional(),
});

type CollaboratorFormData = z.infer<typeof collaboratorSchema>;

interface Store {
  id: string;
  store_name: string;
}

interface Team {
  id: string;
  name: string;
}

interface CollaboratorFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  stores: Store[];
  teams: Team[];
  editingCollaborator?: any;
}

const CollaboratorForm = ({
  open,
  onOpenChange,
  onSuccess,
  stores,
  teams,
  editingCollaborator,
}: CollaboratorFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { currentCompany } = useDashboard();

  const form = useForm<CollaboratorFormData>({
    resolver: zodResolver(collaboratorSchema),
    defaultValues: {
      name: editingCollaborator?.name || "",
      cpf: editingCollaborator?.cpf || "",
      email: editingCollaborator?.email || "",
      phone: editingCollaborator?.phone || "",
      position: editingCollaborator?.position || "",
      admission_date: editingCollaborator?.admission_date || "",
      store_id: editingCollaborator?.store_id || "",
      team_id: editingCollaborator?.team_id || "",
      external_id: editingCollaborator?.external_id || "",
      is_temp: editingCollaborator?.is_temp || false,

      support_username: editingCollaborator?.support_username || "",
      gender: editingCollaborator?.gender || "",
      ethnicity: editingCollaborator?.ethnicity || "",
      education_level: editingCollaborator?.education_level || "",
      rg: editingCollaborator?.rg || "",
      rg_issuer: editingCollaborator?.rg_issuer || "",
      discord_id: editingCollaborator?.discord_id || "",
      discord_username: editingCollaborator?.discord_username || "",
      phone_extension: editingCollaborator?.phone_extension || "",
      radios_freeform: editingCollaborator?.radios_freeform || "",
      recado_phone: editingCollaborator?.recado_phone || "",
      supervisor_id: editingCollaborator?.supervisor_id || "",

      internal_location: editingCollaborator?.internal_location || "",
      subsector: editingCollaborator?.subsector || "",
      agenda: editingCollaborator?.agenda || "",
      indicator_group: editingCollaborator?.indicator_group || "",
      sales_group: editingCollaborator?.sales_group || "",
      is_homeoffice: editingCollaborator?.is_homeoffice ?? false,
      has_agenda_access: editingCollaborator?.has_agenda_access ?? false,
      contracted_store_id: editingCollaborator?.contracted_store_id || "",
      contracted_cnpj: editingCollaborator?.contracted_cnpj || "",

      inspira_date: editingCollaborator?.inspira_date || "",
      inspira_value: editingCollaborator?.inspira_value ?? undefined,
      current_salary: editingCollaborator?.current_salary ?? undefined,
      termination_date: editingCollaborator?.termination_date || "",
      ctps: editingCollaborator?.ctps || "",
      ctps_series: editingCollaborator?.ctps_series || "",
      ctps_uf: editingCollaborator?.ctps_uf || "",
      bank_account: editingCollaborator?.bank_account || "",
      pis: editingCollaborator?.pis || "",
      pix_key: editingCollaborator?.pix_key || "",
      accounting_code: editingCollaborator?.accounting_code || "",

      commission_monthly: editingCollaborator?.commission_monthly ?? undefined,
      commission_license: editingCollaborator?.commission_license ?? undefined,
      commission_upgrade: editingCollaborator?.commission_upgrade ?? undefined,
      commission_tef_install: editingCollaborator?.commission_tef_install ?? undefined,
      commission_tef_monthly: editingCollaborator?.commission_tef_monthly ?? undefined,

      is_manager_leader: editingCollaborator?.is_manager_leader ?? false,
      is_manager_director: editingCollaborator?.is_manager_director ?? false,
      is_manager_support: editingCollaborator?.is_manager_support ?? false,
      is_godfather: editingCollaborator?.is_godfather ?? false,
    },
  });

  const onSubmit = async (data: CollaboratorFormData) => {
    if (!currentCompany) {
      toast({
        title: "Erro",
        description: "Nenhuma empresa selecionada",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const baseData = {
        name: data.name,
        cpf: cleanCPF(data.cpf),
        email: data.email || null,
        phone: data.phone || null,
        position: data.position || null,
        admission_date: data.admission_date || null,
        store_id: data.store_id || null,
        team_id: data.team_id || null,
        external_id: data.external_id?.trim() || null,
        is_temp: data.is_temp,
        company_id: currentCompany.id,

        support_username: data.support_username?.trim() || null,
        gender: data.gender || null,
        ethnicity: data.ethnicity?.trim() || null,
        education_level: data.education_level?.trim() || null,
        rg: data.rg?.trim() || null,
        rg_issuer: data.rg_issuer?.trim() || null,
        discord_id: data.discord_id?.trim() || null,
        discord_username: data.discord_username?.trim() || null,
        phone_extension: data.phone_extension?.trim() || null,
        radios_freeform: data.radios_freeform?.trim() || null,
        recado_phone: data.recado_phone?.trim() || null,
        supervisor_id: data.supervisor_id || null,

        internal_location: data.internal_location?.trim() || null,
        subsector: data.subsector?.trim() || null,
        agenda: data.agenda?.trim() || null,
        indicator_group: data.indicator_group?.trim() || null,
        sales_group: data.sales_group?.trim() || null,
        is_homeoffice: data.is_homeoffice ?? false,
        has_agenda_access: data.has_agenda_access ?? false,
        contracted_store_id: data.contracted_store_id || null,
        contracted_cnpj: data.contracted_cnpj?.trim() || null,

        inspira_date: data.inspira_date || null,
        inspira_value: data.inspira_value ?? null,
        current_salary: data.current_salary ?? null,
        termination_date: data.termination_date || null,
        ctps: data.ctps?.trim() || null,
        ctps_series: data.ctps_series?.trim() || null,
        ctps_uf: data.ctps_uf?.trim() || null,
        bank_account: data.bank_account?.trim() || null,
        pis: data.pis?.trim() || null,
        pix_key: data.pix_key?.trim() || null,
        accounting_code: data.accounting_code?.trim() || null,

        commission_monthly: data.commission_monthly ?? null,
        commission_license: data.commission_license ?? null,
        commission_upgrade: data.commission_upgrade ?? null,
        commission_tef_install: data.commission_tef_install ?? null,
        commission_tef_monthly: data.commission_tef_monthly ?? null,

        is_manager_leader: data.is_manager_leader ?? false,
        is_manager_director: data.is_manager_director ?? false,
        is_manager_support: data.is_manager_support ?? false,
        is_godfather: data.is_godfather ?? false,
      };

      const collaboratorData = editingCollaborator
        ? baseData
        : { ...baseData, status: "aguardando_documentacao" as const };

      if (editingCollaborator) {
        const { error } = await supabase
          .from("collaborators")
          .update(collaboratorData)
          .eq("id", editingCollaborator.id);

        if (error) {
          if (error.code === "23505" && /external_id/i.test(error.message || "")) {
            toast({
              title: "ID na agenda já em uso",
              description: "Já existe um colaborador com esse ID na agenda nesta empresa.",
              variant: "destructive",
            });
            return;
          }
          throw error;
        }

        toast({
          title: "Colaborador atualizado!",
          description: `${data.name} foi atualizado com sucesso.`,
        });
      } else {
        const { error } = await supabase
          .from("collaborators")
          .insert(collaboratorData);

        if (error) {
          if (error.code === "23505") {
            const isExternalIdConflict = /external_id/i.test(error.message || "");
            toast({
              title: isExternalIdConflict ? "ID na agenda já em uso" : "CPF já cadastrado",
              description: isExternalIdConflict
                ? "Já existe um colaborador com esse ID na agenda nesta empresa."
                : "Este CPF já está cadastrado nesta empresa.",
              variant: "destructive",
            });
            return;
          }
          throw error;
        }

        // If email provided and not temp, create auth user
        if (data.email && !data.is_temp) {
          // Note: In production, you'd send an invitation email instead
          toast({
            title: "Colaborador cadastrado!",
            description: `${data.name} foi cadastrado. Um convite será enviado para ${data.email}.`,
          });
        } else {
          toast({
            title: "Colaborador cadastrado!",
            description: `${data.name} foi cadastrado com sucesso.`,
          });
        }
      }

      form.reset();
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingCollaborator ? "Editar Colaborador" : "Novo Colaborador"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Nome completo *</FormLabel>
                    <FormControl>
                      <Input placeholder="João da Silva" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF *</FormLabel>
                    <FormControl>
                      <Input placeholder="000.000.000-00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="joao@empresa.com.br"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Se preenchido, o colaborador poderá acessar o portal
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input placeholder="(11) 99999-9999" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo</FormLabel>
                    <FormControl>
                      <Input placeholder="Analista de RH" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="admission_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Admissão</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="store_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loja</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma loja" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stores.map((store) => (
                          <SelectItem key={store.id} value={store.id}>
                            {store.store_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="team_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Equipe</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma equipe" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />




              <FormField
                control={form.control}
                name="external_id"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>ID na agenda</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Opcional"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Usado pra vincular ao sistema legado (api.softcom.cloud). Deixe em branco se não souber.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ──── Seções colapsáveis com campos da sincronização ──── */}
              <div className="md:col-span-2">
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer font-medium select-none">
                    Identificação complementar
                  </summary>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                    <FormField control={form.control} name="support_username" render={({ field }) => (
                      <FormItem><FormLabel>Login na agenda</FormLabel><FormControl><Input placeholder="ex: maria.s" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="gender" render={({ field }) => (
                      <FormItem><FormLabel>Sexo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="M">Masculino</SelectItem>
                            <SelectItem value="F">Feminino</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="ethnicity" render={({ field }) => (
                      <FormItem><FormLabel>Etnia</FormLabel><FormControl><Input placeholder="ex: Parda" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="education_level" render={({ field }) => (
                      <FormItem><FormLabel>Escolaridade</FormLabel><FormControl><Input placeholder="ex: Ensino Superior" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="rg" render={({ field }) => (
                      <FormItem><FormLabel>RG</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="rg_issuer" render={({ field }) => (
                      <FormItem><FormLabel>Órgão emissor</FormLabel><FormControl><Input placeholder="ex: SSP" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="recado_phone" render={({ field }) => (
                      <FormItem><FormLabel>Telefone de recado</FormLabel><FormControl><Input placeholder="(11) 98888-8888" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="phone_extension" render={({ field }) => (
                      <FormItem><FormLabel>Ramal fixo</FormLabel><FormControl><Input placeholder="3725" maxLength={4} {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="radios_freeform" render={({ field }) => (
                      <FormItem className="md:col-span-2"><FormLabel>Ramais / celulares</FormLabel><FormControl><Input placeholder="Texto livre" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="discord_id" render={({ field }) => (
                      <FormItem><FormLabel>Discord ID</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="discord_username" render={({ field }) => (
                      <FormItem><FormLabel>Usuário Discord</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </details>
              </div>

              <div className="md:col-span-2">
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer font-medium select-none">
                    Lotação e localização
                  </summary>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                    <FormField control={form.control} name="internal_location" render={({ field }) => (
                      <FormItem><FormLabel>Local interno</FormLabel><FormControl><Input placeholder="INTERNO / EXTERNO / COMERCIAL" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="subsector" render={({ field }) => (
                      <FormItem><FormLabel>Subsetor</FormLabel><FormControl><Input placeholder="EFETIVO / ESTAGIARIO" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="agenda" render={({ field }) => (
                      <FormItem><FormLabel>Agenda</FormLabel><FormControl><Input placeholder="ex: SERVICE DESK" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="indicator_group" render={({ field }) => (
                      <FormItem><FormLabel>Grupo indicador</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="sales_group" render={({ field }) => (
                      <FormItem><FormLabel>Grupo de vendas</FormLabel><FormControl><Input placeholder="ex: NOVOS" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="contracted_store_id" render={({ field }) => (
                      <FormItem><FormLabel>Empresa contratante</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {stores.map((s) => (<SelectItem key={s.id} value={s.id}>{s.store_name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="contracted_cnpj" render={({ field }) => (
                      <FormItem><FormLabel>CNPJ contratante (PJ)</FormLabel><FormControl><Input placeholder="00.000.000/0000-00" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="is_homeoffice" render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                        <FormLabel>Home office</FormLabel>
                        <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="has_agenda_access" render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                        <FormLabel>Acesso à agenda</FormLabel>
                        <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </details>
              </div>

              <div className="md:col-span-2">
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer font-medium select-none">
                    Contratação, CTPS e bancário
                  </summary>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                    <FormField control={form.control} name="inspira_date" render={({ field }) => (
                      <FormItem><FormLabel>Data Inspira</FormLabel><FormControl><Input type="date" {...field} /></FormControl>
                        <FormDescription>Base do tempo de empresa quando preenchida.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="inspira_value" render={({ field }) => (
                      <FormItem><FormLabel>Valor Inspira</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="current_salary" render={({ field }) => (
                      <FormItem><FormLabel>Salário atual</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl>
                        <FormDescription>Se vazio, usa o valor do cargo.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="termination_date" render={({ field }) => (
                      <FormItem><FormLabel>Data de demissão</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="ctps" render={({ field }) => (
                      <FormItem><FormLabel>CTPS</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="ctps_series" render={({ field }) => (
                      <FormItem><FormLabel>Série CTPS</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="ctps_uf" render={({ field }) => (
                      <FormItem><FormLabel>UF CTPS</FormLabel><FormControl><Input maxLength={2} {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="pis" render={({ field }) => (
                      <FormItem><FormLabel>PIS</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="bank_account" render={({ field }) => (
                      <FormItem className="md:col-span-2"><FormLabel>Conta bancária</FormLabel><FormControl><Input placeholder="Banco / Agência / Conta" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="pix_key" render={({ field }) => (
                      <FormItem><FormLabel>Chave PIX</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="accounting_code" render={({ field }) => (
                      <FormItem><FormLabel>Código contábil</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </details>
              </div>

              <div className="md:col-span-2">
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer font-medium select-none">
                    Comissões (%)
                  </summary>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                    <FormField control={form.control} name="commission_monthly" render={({ field }) => (
                      <FormItem><FormLabel>Mensal</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="commission_license" render={({ field }) => (
                      <FormItem><FormLabel>Licença</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="commission_upgrade" render={({ field }) => (
                      <FormItem><FormLabel>Upgrade</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="commission_tef_install" render={({ field }) => (
                      <FormItem><FormLabel>TEF instalação</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="commission_tef_monthly" render={({ field }) => (
                      <FormItem><FormLabel>TEF mensal</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </details>
              </div>

              <div className="md:col-span-2">
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer font-medium select-none">
                    Gerência e papéis
                  </summary>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                    <FormField control={form.control} name="is_manager_leader" render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                        <FormLabel>Gerente — Líder</FormLabel>
                        <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="is_manager_director" render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                        <FormLabel>Gerente — Diretor</FormLabel>
                        <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="is_manager_support" render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                        <FormLabel>Gerente — Apoio</FormLabel>
                        <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="is_godfather" render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                        <FormLabel>Padrinho</FormLabel>
                        <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </details>
              </div>

              <FormField
                control={form.control}
                name="is_temp"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <FormLabel className="text-base">
                          Colaborador Avulso
                        </FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>
                              Colaboradores avulsos não aparecem em relatórios
                              gerais, mas podem ter acesso ao Portal do
                              Colaborador se tiverem email cadastrado.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <FormDescription>
                        Não aparece em relatórios
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="hero" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingCollaborator ? "Salvar alterações" : "Cadastrar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CollaboratorForm;
