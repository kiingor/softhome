import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDashboard } from '@/contexts/DashboardContext';
import RoleGuard from '@/components/dashboard/RoleGuard';
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

interface Store {
  id: string;
  store_name: string;
  store_code: string | null;
  cnpj: string | null;
  address: string | null;
  created_at: string;
}

export default function EmpresasPage() {
  const { currentCompany } = useDashboard();
  const selectedCompanyId = currentCompany?.id;
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [formData, setFormData] = useState({
    store_name: '',
    store_code: '',
    cnpj: '',
    address: '',
  });

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['stores', selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('company_id', selectedCompanyId)
        .order('store_name');
      if (error) throw error;
      return data as Store[];
    },
    enabled: !!selectedCompanyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('stores').insert({
        company_id: selectedCompanyId,
        store_name: data.store_name,
        store_code: data.store_code || null,
        cnpj: data.cnpj || null,
        address: data.address || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      toast.success('Empresa criada com sucesso!');
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error('Erro ao criar empresa: ' + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string } & typeof formData) => {
      const { error } = await supabase
        .from('stores')
        .update({
          store_name: data.store_name,
          store_code: data.store_code || null,
          cnpj: data.cnpj || null,
          address: data.address || null,
        })
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      toast.success('Empresa atualizada com sucesso!');
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar empresa: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stores').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      toast.success('Empresa excluída com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir empresa: ' + error.message);
    },
  });

  const handleOpenDialog = (store?: Store) => {
    if (store) {
      setEditingStore(store);
      setFormData({
        store_name: store.store_name,
        store_code: store.store_code || '',
        cnpj: store.cnpj || '',
        address: store.address || '',
      });
    } else {
      setEditingStore(null);
      setFormData({ store_name: '', store_code: '', cnpj: '', address: '' });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingStore(null);
    setFormData({ store_name: '', store_code: '', cnpj: '', address: '' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.store_name.trim()) {
      toast.error('Informe o nome da empresa');
      return;
    }
    if (!formData.cnpj.trim()) {
      toast.error('Informe o CNPJ da empresa');
      return;
    }

    if (editingStore) {
      updateMutation.mutate({ id: editingStore.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const formatCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    return numbers
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 18);
  };

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Empresas</h1>
            <p className="text-muted-foreground">
              Gerencie as empresas/filiais do grupo
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Empresa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingStore ? 'Editar Empresa' : 'Nova Empresa'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingStore
                      ? 'Atualize as informações da empresa.'
                      : 'Preencha as informações da nova empresa.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="store_name">Nome da Empresa *</Label>
                    <Input
                      id="store_name"
                      value={formData.store_name}
                      onChange={(e) =>
                        setFormData({ ...formData, store_name: e.target.value })
                      }
                      placeholder="Ex: Filial Centro"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ *</Label>
                    <Input
                      id="cnpj"
                      value={formData.cnpj}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          cnpj: formatCNPJ(e.target.value),
                        })
                      }
                      placeholder="00.000.000/0000-00"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="store_code">Código (opcional)</Label>
                    <Input
                      id="store_code"
                      value={formData.store_code}
                      onChange={(e) =>
                        setFormData({ ...formData, store_code: e.target.value })
                      }
                      placeholder="Ex: 001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Endereço (opcional)</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                      placeholder="Ex: Rua das Flores, 123"
                    />
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
                    {editingStore ? 'Salvar' : 'Criar'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Lista de Empresas
            </CardTitle>
            <CardDescription>
              {stores.length} empresa(s) cadastrada(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : stores.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma empresa cadastrada</p>
                <p className="text-sm">
                  Clique em "Nova Empresa" para começar
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Endereço</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stores.map((store) => (
                    <TableRow key={store.id}>
                      <TableCell className="font-medium">
                        {store.store_name}
                      </TableCell>
                      <TableCell>{store.cnpj || '-'}</TableCell>
                      <TableCell>{store.store_code || '-'}</TableCell>
                      <TableCell>{store.address || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(store)}
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
                                  Excluir Empresa
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir a empresa "
                                  {store.store_name}"? Esta ação não pode ser
                                  desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    deleteMutation.mutate(store.id)
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
    </RoleGuard>
  );
}
