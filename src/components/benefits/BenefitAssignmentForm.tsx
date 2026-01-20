import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const assignmentSchema = z.object({
  benefit_id: z.string().min(1, "Selecione um benefício"),
  collaborator_id: z.string().min(1, "Selecione um colaborador"),
  observation: z.string().optional(),
});

type AssignmentFormData = z.infer<typeof assignmentSchema>;

interface Benefit {
  id: string;
  name: string;
}

interface Collaborator {
  id: string;
  name: string;
}

interface BenefitAssignmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AssignmentFormData) => Promise<void>;
  benefits: Benefit[];
  collaborators: Collaborator[];
  isLoading?: boolean;
  defaultBenefitId?: string;
  defaultCollaboratorId?: string;
}

const BenefitAssignmentForm = ({
  open,
  onOpenChange,
  onSubmit,
  benefits,
  collaborators,
  isLoading,
  defaultBenefitId,
  defaultCollaboratorId,
}: BenefitAssignmentFormProps) => {
  const form = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      benefit_id: defaultBenefitId || "",
      collaborator_id: defaultCollaboratorId || "",
      observation: "",
    },
  });

  const handleSubmit = async (data: AssignmentFormData) => {
    await onSubmit(data);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Atribuir Benefício</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="benefit_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Benefício</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {benefits.map((benefit) => (
                          <SelectItem key={benefit.id} value={benefit.id}>
                            {benefit.name}
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
                name="collaborator_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Colaborador</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {collaborators.map((collab) => (
                          <SelectItem key={collab.id} value={collab.id}>
                            {collab.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="observation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observação (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ex: Valor proporcional, vigência específica..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Salvando..." : "Atribuir"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default BenefitAssignmentForm;
