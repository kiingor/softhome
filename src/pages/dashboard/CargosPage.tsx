import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Briefcase } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDashboard } from '@/contexts/DashboardContext';
import PermissionGuard from '@/components/dashboard/PermissionGuard';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
 import { formatCurrency, formatNumberAsCurrency, parseCurrencyInput } from '@/lib/formatters';
 import { TableSkeleton } from '@/components/ui/table-skeleton';

interface Position {
  id: string;
  name: string;
  salary: number;
   inss_percent: number;
   fgts_percent: number;
   irpf_percent: number;
  created_at: string;
}

export default function CargosPage() {
  const { currentCompany } = useDashboard();
  const selectedCompanyId = currentCompany?.id;
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
   const [formData, setFormData] = useState({ 
     name: '', 
     salary: '', 
     inss_percent: '',
     fgts_percent: '',
     irpf_percent: '',
   });

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ['positions', selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .eq('company_id', selectedCompanyId)
        .order('name');
      if (error) throw error;
      return data as Position[];
    },
    enabled: !!selectedCompanyId,
  });

  const createMutation = useMutation({
     mutationFn: async (data: { name: string; salary: number; inss_percent: number; fgts_percent: number; irpf_percent: number }) => {
      const { error } = await supabase.from('positions').insert({
        company_id: selectedCompanyId,
        name: data.name,
        salary: data.salary,
         inss_percent: data.inss_percent,
         fgts_percent: data.fgts_percent,
         irpf_percent: data.irpf_percent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success('Cargo criado com sucesso!');
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error('Erro ao criar cargo: ' + error.message);
    },
  });

  const updateMutation = useMutation({
     mutationFn: async (data: { id: string; name: string; salary: number; inss_percent: number; fgts_percent: number; irpf_percent: number }) => {
      const { error } = await supabase
        .from('positions')
         .update({ 
           name: data.name, 
           salary: data.salary,
           inss_percent: data.inss_percent,
           fgts_percent: data.fgts_percent,
           irpf_percent: data.irpf_percent,
         })
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success('Cargo atualizado com sucesso!');
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar cargo: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('positions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success('Cargo excluído com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir cargo: ' + error.message);
    },
  });

  const handleOpenDialog = (position?: Position) => {
    if (position) {
      setEditingPosition(position);
      setFormData({
        name: position.name,
          salary: formatNumberAsCurrency(position.salary),
         inss_percent: (position.inss_percent || 0).toString().replace('.', ','),
         fgts_percent: (position.fgts_percent || 0).toString().replace('.', ','),
         irpf_percent: (position.irpf_percent || 0).toString().replace('.', ','),
      });
    } else {
      setEditingPosition(null);
       setFormData({ name: '', salary: '', inss_percent: '', fgts_percent: '', irpf_percent: '' });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPosition(null);
     setFormData({ name: '', salary: '', inss_percent: '', fgts_percent: '', irpf_percent: '' });
  };

   const handleSalaryChange = (value: string) => {
     // Remove tudo exceto números
     const numbers = value.replace(/\D/g, '');
     if (numbers === '') {
       setFormData({ ...formData, salary: '' });
       return;
     }
     // Converte para centavos e formata
     const cents = parseInt(numbers, 10);
     const reais = cents / 100;
      setFormData({ ...formData, salary: formatNumberAsCurrency(reais) });
   };
 
   const handlePercentChange = (field: 'inss_percent' | 'fgts_percent' | 'irpf_percent', value: string) => {
     // Permite apenas números e vírgula
     const cleaned = value.replace(/[^\d,]/g, '');
     setFormData({ ...formData, [field]: cleaned });
   };
 
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
     const salary = parseCurrencyInput(formData.salary);
    if (isNaN(salary) || salary < 0) {
      toast.error('Informe um valor de salário válido');
      return;
    }

     const inss_percent = parseFloat(formData.inss_percent.replace(',', '.')) || 0;
     const fgts_percent = parseFloat(formData.fgts_percent.replace(',', '.')) || 0;
     const irpf_percent = parseFloat(formData.irpf_percent.replace(',', '.')) || 0;
 
    if (editingPosition) {
      updateMutation.mutate({
        id: editingPosition.id,
        name: formData.name,
        salary,
         inss_percent,
         fgts_percent,
         irpf_percent,
      });
    } else {
       createMutation.mutate({ name: formData.name, salary, inss_percent, fgts_percent, irpf_percent });
    }
  };

  return (
    <PermissionGuard module="cargos">
      <div className="space-y-6 page-content">
        <div className="flex items-center justify-between animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cargos</h1>
            <p className="text-muted-foreground">
              Gerencie os cargos e salários da empresa
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Cargo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingPosition ? 'Editar Cargo' : 'Novo Cargo'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingPosition
                      ? 'Atualize as informações do cargo.'
                      : 'Preencha as informações do novo cargo.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do Cargo</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Ex: Analista de RH"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salary">Salário (R$)</Label>
                    <Input
                      id="salary"
                      value={formData.salary}
                       onChange={(e) => handleSalaryChange(e.target.value)}
                       placeholder="R$ 0,00"
                      required
                    />
                  </div>
                   
                   <div className="border-t pt-4 mt-4">
                     <p className="text-sm font-medium text-muted-foreground mb-3">Impostos (%)</p>
                     <div className="grid grid-cols-3 gap-3">
                       <div className="space-y-1">
                         <Label htmlFor="inss_percent" className="text-xs">INSS</Label>
                         <Input
                           id="inss_percent"
                           value={formData.inss_percent}
                           onChange={(e) => handlePercentChange('inss_percent', e.target.value)}
                           placeholder="0,00"
                         />
                       </div>
                       <div className="space-y-1">
                         <Label htmlFor="fgts_percent" className="text-xs">FGTS</Label>
                         <Input
                           id="fgts_percent"
                           value={formData.fgts_percent}
                           onChange={(e) => handlePercentChange('fgts_percent', e.target.value)}
                           placeholder="0,00"
                         />
                       </div>
                       <div className="space-y-1">
                         <Label htmlFor="irpf_percent" className="text-xs">IRPF</Label>
                         <Input
                           id="irpf_percent"
                           value={formData.irpf_percent}
                           onChange={(e) => handlePercentChange('irpf_percent', e.target.value)}
                           placeholder="0,00"
                         />
                       </div>
                     </div>
                   </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseDialog}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      createMutation.isPending || updateMutation.isPending
                    }
                  >
                    {editingPosition ? 'Salvar' : 'Criar'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="animate-scale-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Lista de Cargos
            </CardTitle>
            <CardDescription>
              {positions.length} cargo(s) cadastrado(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <TableSkeleton columns={3} rows={4} />
            ) : positions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum cargo cadastrado</p>
                <p className="text-sm">Clique em "Novo Cargo" para começar</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome do Cargo</TableHead>
                    <TableHead>Salário</TableHead>
                     <TableHead>INSS</TableHead>
                     <TableHead>FGTS</TableHead>
                     <TableHead>IRPF</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="stagger-animation">
                  {positions.map((position) => (
                    <TableRow key={position.id} className="table-row-animate">
                      <TableCell className="font-medium">
                        {position.name}
                      </TableCell>
                      <TableCell>{formatCurrency(position.salary)}</TableCell>
                       <TableCell>{(position.inss_percent || 0).toFixed(2).replace('.', ',')}%</TableCell>
                       <TableCell>{(position.fgts_percent || 0).toFixed(2).replace('.', ',')}%</TableCell>
                       <TableCell>{(position.irpf_percent || 0).toFixed(2).replace('.', ',')}%</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(position)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Excluir Cargo
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir o cargo "
                                  {position.name}"? Esta ação não pode ser
                                  desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    deleteMutation.mutate(position.id)
                                  }
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}
