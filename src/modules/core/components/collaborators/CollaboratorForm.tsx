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
import { Loader2, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const collaboratorSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  cpf: z.string().refine((val) => validateCPF(val), "CPF inválido"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  position: z.string().optional(),
  admission_date: z.string().optional(),
  store_id: z.string().optional(),
  team_id: z.string().optional(),
  
  is_temp: z.boolean(),
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
      
      is_temp: editingCollaborator?.is_temp || false,
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
        is_temp: data.is_temp,
        company_id: currentCompany.id,
      };

      const collaboratorData = editingCollaborator
        ? baseData
        : { ...baseData, status: "aguardando_documentacao" as const };

      if (editingCollaborator) {
        const { error } = await supabase
          .from("collaborators")
          .update(collaboratorData)
          .eq("id", editingCollaborator.id);

        if (error) throw error;

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
            toast({
              title: "CPF já cadastrado",
              description: "Este CPF já está cadastrado nesta empresa.",
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
