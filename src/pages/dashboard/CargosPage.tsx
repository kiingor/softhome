import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Briefcase, Info, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDashboard } from '@/contexts/DashboardContext';
import PermissionGuard from '@/components/dashboard/PermissionGuard';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { formatCurrency, formatNumberAsCurrency, parseCurrencyInput } from '@/lib/formatters';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { RISK_GROUPS, RISK_GROUP_PERIODICITY, RISK_GROUP_PERIODICITY_LABELS } from '@/lib/riskGroupDefaults';

interface Position {
  id: string;
  name: string;
  salary: number;
  inss_percent: number;
  fgts_percent: number;
  irpf_percent: number;
  risk_group: string | null;
  exam_periodicity_months: number | null;
  created_at: string;
}

interface PositionDocument {
  id: string;
  position_id: string;
  name: string;
  observation: string | null;
  file_type: string;
}

export default function CargosPage() {
  const { currentCompany } = useDashboard();
  const selectedCompanyId = currentCompany?.id;
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canDelete } = usePermissions("cargos");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [dialogTab, setDialogTab] = useState('dados');
  const [formData, setFormData] = useState({ 
    name: '', salary: '', inss_percent: '', fgts_percent: '', irpf_percent: '', risk_group: '', exam_periodicity_months: '',
  });

  // Document state
  const [isDocDialogOpen, setIsDocDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<PositionDocument | null>(null);
  const [docForm, setDocForm] = useState({ name: '', observation: '', file_type: 'pdf' });

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ['positions', selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const { data, error } = await supabase
        .from('positions').select('*').eq('company_id', selectedCompanyId).order('name');
      if (error) throw error;
      return data as Position[];
    },
    enabled: !!selectedCompanyId,
  });

  // Fetch documents for the editing position
  const { data: positionDocuments = [], isLoading: isDocsLoading } = useQuery({
    queryKey: ['position-documents', editingPosition?.id],
    queryFn: async () => {
      if (!editingPosition?.id) return [];
      const { data, error } = await supabase
        .from('position_documents').select('*').eq('position_id', editingPosition.id).order('name');
      if (error) throw error;
      return data as PositionDocument[];
    },
    enabled: !!editingPosition?.id,
  });

  // Fetch doc counts per position for the listing
  const { data: docCounts = {} } = useQuery({
    queryKey: ['position-doc-counts', selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return {};
      const { data, error } = await supabase
        .from('position_documents').select('position_id').eq('company_id', selectedCompanyId);
      if (error) return {};
      const counts: Record<string, number> = {};
      data.forEach(d => { counts[d.position_id] = (counts[d.position_id] || 0) + 1; });
      return counts;
    },
    enabled: !!selectedCompanyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; salary: number; inss_percent: number; fgts_percent: number; irpf_percent: number; risk_group: string | null; exam_periodicity_months: number | null }) => {
      const { error } = await supabase.from('positions').insert({ company_id: selectedCompanyId, ...data });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['positions'] }); toast.success('Cargo criado!'); handleCloseDialog(); },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; salary: number; inss_percent: number; fgts_percent: number; irpf_percent: number; risk_group: string | null; exam_periodicity_months: number | null }) => {
      const { id, ...rest } = data;
      const { error } = await supabase.from('positions').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['positions'] }); toast.success('Cargo atualizado!'); handleCloseDialog(); },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('positions').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['positions'] }); toast.success('Cargo excluído!'); },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  // Document mutations
  const createDocMutation = useMutation({
    mutationFn: async (data: { name: string; observation: string; file_type: string }) => {
      const { error } = await supabase.from('position_documents').insert({
        position_id: editingPosition!.id, company_id: selectedCompanyId!, ...data, observation: data.observation || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['position-documents'] }); queryClient.invalidateQueries({ queryKey: ['position-doc-counts'] }); toast.success('Documento adicionado!'); setIsDocDialogOpen(false); resetDocForm(); },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  const updateDocMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; observation: string; file_type: string }) => {
      const { id, ...rest } = data;
      const { error } = await supabase.from('position_documents').update({ ...rest, observation: rest.observation || null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['position-documents'] }); toast.success('Documento atualizado!'); setIsDocDialogOpen(false); resetDocForm(); },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('position_documents').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['position-documents'] }); queryClient.invalidateQueries({ queryKey: ['position-doc-counts'] }); toast.success('Documento removido!'); },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  const resetDocForm = () => { setEditingDoc(null); setDocForm({ name: '', observation: '', file_type: 'pdf' }); };

  const handleOpenDialog = (position?: Position) => {
    if (position) {
      setEditingPosition(position);
      setFormData({
        name: position.name, salary: formatNumberAsCurrency(position.salary),
        inss_percent: (position.inss_percent || 0).toString().replace('.', ','),
        fgts_percent: (position.fgts_percent || 0).toString().replace('.', ','),
        irpf_percent: (position.irpf_percent || 0).toString().replace('.', ','),
        risk_group: position.risk_group || '', exam_periodicity_months: position.exam_periodicity_months?.toString() || '',
      });
    } else {
      setEditingPosition(null);
      setFormData({ name: '', salary: '', inss_percent: '', fgts_percent: '', irpf_percent: '', risk_group: '', exam_periodicity_months: '' });
    }
    setDialogTab('dados');
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => { setIsDialogOpen(false); setEditingPosition(null); setDialogTab('dados'); setFormData({ name: '', salary: '', inss_percent: '', fgts_percent: '', irpf_percent: '', risk_group: '', exam_periodicity_months: '' }); };

  const handleSalaryChange = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers === '') { setFormData({ ...formData, salary: '' }); return; }
    const cents = parseInt(numbers, 10);
    const reais = cents / 100;
    setFormData({ ...formData, salary: formatNumberAsCurrency(reais) });
  };

  const handlePercentChange = (field: 'inss_percent' | 'fgts_percent' | 'irpf_percent', value: string) => {
    const cleaned = value.replace(/[^\d,]/g, '');
    setFormData({ ...formData, [field]: cleaned });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const salary = parseCurrencyInput(formData.salary);
    if (isNaN(salary) || salary < 0) { toast.error('Salário inválido'); return; }
    const inss_percent = parseFloat(formData.inss_percent.replace(',', '.')) || 0;
    const fgts_percent = parseFloat(formData.fgts_percent.replace(',', '.')) || 0;
    const irpf_percent = parseFloat(formData.irpf_percent.replace(',', '.')) || 0;
    const risk_group = formData.risk_group || null;
    const exam_periodicity_months = formData.exam_periodicity_months ? parseInt(formData.exam_periodicity_months) : null;

    if (editingPosition) {
      updateMutation.mutate({ id: editingPosition.id, name: formData.name, salary, inss_percent, fgts_percent, irpf_percent, risk_group, exam_periodicity_months });
    } else {
      createMutation.mutate({ name: formData.name, salary, inss_percent, fgts_percent, irpf_percent, risk_group, exam_periodicity_months });
    }
  };

  const handleDocSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.name.trim()) { toast.error('Nome é obrigatório'); return; }
    if (editingDoc) {
      updateDocMutation.mutate({ id: editingDoc.id, ...docForm });
    } else {
      createDocMutation.mutate(docForm);
    }
  };

  const fileTypeLabels: Record<string, string> = { pdf: 'PDF', image: 'Imagem', doc: 'Documento (DOC)' };

  return (
    <PermissionGuard module="cargos">
      <div className="space-y-6 page-content">
        <div className="flex items-center justify-between animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cargos</h1>
            <p className="text-muted-foreground">Gerencie os cargos, salários e documentos obrigatórios</p>
          </div>
          {canCreate && (
            <Button onClick={() => handleOpenDialog()}><Plus className="mr-2 h-4 w-4" />Novo Cargo</Button>
          )}
        </div>

        <Card className="animate-scale-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" />Lista de Cargos</CardTitle>
            <CardDescription>{positions.length} cargo(s) cadastrado(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <TableSkeleton columns={4} rows={4} />
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
                    <TableHead>Grupo Risco</TableHead>
                    <TableHead>Periodicidade</TableHead>
                    <TableHead>Documentos</TableHead>
                    <TableHead>INSS</TableHead>
                    <TableHead>FGTS</TableHead>
                    <TableHead>IRPF</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="stagger-animation">
                  {positions.map((position) => (
                    <TableRow
                      key={position.id}
                      className="table-row-animate cursor-pointer hover:bg-muted/50"
                      onClick={() => handleOpenDialog(position)}
                    >
                      <TableCell className="font-medium">{position.name}</TableCell>
                      <TableCell>{formatCurrency(position.salary)}</TableCell>
                      <TableCell>{position.risk_group || '-'}</TableCell>
                      <TableCell>{position.exam_periodicity_months ? `${position.exam_periodicity_months} meses` : '-'}</TableCell>
                      <TableCell>
                        {docCounts[position.id] ? (
                          <Badge variant="secondary" className="text-xs">
                            <FileText className="w-3 h-3 mr-1" />
                            {docCounts[position.id]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>{(position.inss_percent || 0).toFixed(2).replace('.', ',')}%</TableCell>
                      <TableCell>{(position.fgts_percent || 0).toFixed(2).replace('.', ',')}%</TableCell>
                      <TableCell>{(position.irpf_percent || 0).toFixed(2).replace('.', ',')}%</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {canDelete && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir Cargo</AlertDialogTitle>
                                  <AlertDialogDescription>Tem certeza que deseja excluir "{position.name}"? Esta ação não pode ser desfeita.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(position.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Position Dialog with Tabs */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else setIsDialogOpen(true); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPosition ? 'Editar Cargo' : 'Novo Cargo'}</DialogTitle>
              <DialogDescription>{editingPosition ? 'Atualize as informações do cargo.' : 'Preencha as informações do novo cargo.'}</DialogDescription>
            </DialogHeader>

            <Tabs value={dialogTab} onValueChange={setDialogTab}>
              <TabsList className="w-full">
                <TabsTrigger value="dados" className="flex-1"><Briefcase className="h-4 w-4 mr-2" />Dados do Cargo</TabsTrigger>
                {editingPosition && (
                  <TabsTrigger value="documentos" className="flex-1"><FileText className="h-4 w-4 mr-2" />Documentos ({positionDocuments.length})</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="dados">
                <form onSubmit={handleSubmit}>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome do Cargo</Label>
                      <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Analista de RH" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="salary">Salário (R$)</Label>
                      <Input id="salary" value={formData.salary} onChange={(e) => handleSalaryChange(e.target.value)} placeholder="R$ 0,00" required />
                    </div>
                    <div className="border-t pt-4 mt-4">
                      <p className="text-sm font-medium text-muted-foreground mb-3">Impostos (%)</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="inss_percent" className="text-xs">INSS</Label>
                          <Input id="inss_percent" value={formData.inss_percent} onChange={(e) => handlePercentChange('inss_percent', e.target.value)} placeholder="0,00" />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="fgts_percent" className="text-xs">FGTS</Label>
                          <Input id="fgts_percent" value={formData.fgts_percent} onChange={(e) => handlePercentChange('fgts_percent', e.target.value)} placeholder="0,00" />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="irpf_percent" className="text-xs">IRPF</Label>
                          <Input id="irpf_percent" value={formData.irpf_percent} onChange={(e) => handlePercentChange('irpf_percent', e.target.value)} placeholder="0,00" />
                        </div>
                      </div>
                    </div>
                    <div className="border-t pt-4 mt-4">
                      <p className="text-sm font-medium text-muted-foreground mb-3">Exames Ocupacionais</p>
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="risk_group">Grupo de Risco</Label>
                          <Select value={formData.risk_group} onValueChange={(v) => { const periodicity = RISK_GROUP_PERIODICITY[v]; setFormData({ ...formData, risk_group: v, exam_periodicity_months: periodicity?.toString() || '' }); }}>
                            <SelectTrigger><SelectValue placeholder="Selecione o grupo de risco" /></SelectTrigger>
                            <SelectContent>{RISK_GROUPS.map((g) => (<SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>))}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-1">
                            <Label htmlFor="exam_periodicity_months">Periodicidade (meses)</Label>
                            <Tooltip>
                              <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">Periodicidade definida pela NR-7.</p>
                                {formData.risk_group && <p className="text-xs mt-1 font-medium">{RISK_GROUP_PERIODICITY_LABELS[formData.risk_group]}</p>}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <Input id="exam_periodicity_months" type="number" min={1} value={formData.exam_periodicity_months} onChange={(e) => setFormData({ ...formData, exam_periodicity_months: e.target.value })} placeholder="Ex: 12" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <DialogFooter className="mt-4">
                    <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancelar</Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{editingPosition ? 'Salvar' : 'Criar'}</Button>
                  </DialogFooter>
                </form>
              </TabsContent>

              {editingPosition && (
                <TabsContent value="documentos" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Documentos obrigatórios para o cargo <strong>{editingPosition.name}</strong>
                    </p>
                    {canCreate && (
                      <Button size="sm" onClick={() => { resetDocForm(); setIsDocDialogOpen(true); }}>
                        <Plus className="mr-1 h-4 w-4" />Novo Documento
                      </Button>
                    )}
                  </div>

                  {isDocsLoading ? (
                    <TableSkeleton columns={4} rows={3} />
                  ) : positionDocuments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg">
                      <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Nenhum documento cadastrado</p>
                      <p className="text-xs">Adicione os documentos obrigatórios para este cargo</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Observação</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="w-[80px]">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {positionDocuments.map((doc) => (
                          <TableRow key={doc.id}>
                            <TableCell className="font-medium">{doc.name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{doc.observation || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{fileTypeLabels[doc.file_type] || doc.file_type}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {canEdit && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingDoc(doc); setDocForm({ name: doc.name, observation: doc.observation || '', file_type: doc.file_type }); setIsDocDialogOpen(true); }}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {canDelete && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Excluir Documento</AlertDialogTitle>
                                        <AlertDialogDescription>Excluir "{doc.name}"? Esta ação não pode ser desfeita.</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deleteDocMutation.mutate(doc.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              )}
            </Tabs>
          </DialogContent>
        </Dialog>

        {/* Document sub-dialog */}
        <Dialog open={isDocDialogOpen} onOpenChange={setIsDocDialogOpen}>
          <DialogContent>
            <form onSubmit={handleDocSubmit}>
              <DialogHeader>
                <DialogTitle>{editingDoc ? 'Editar Documento' : 'Novo Documento Obrigatório'}</DialogTitle>
                <DialogDescription>Defina o documento necessário para o cargo "{editingPosition?.name}"</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome do Documento</Label>
                  <Input value={docForm.name} onChange={(e) => setDocForm({ ...docForm, name: e.target.value })} placeholder="Ex: RG, CNH, Comprovante de Residência" required />
                </div>
                <div className="space-y-2">
                  <Label>Observação</Label>
                  <Textarea value={docForm.observation} onChange={(e) => setDocForm({ ...docForm, observation: e.target.value })} placeholder="Instruções adicionais para o colaborador" rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Arquivo Aceito</Label>
                  <Select value={docForm.file_type} onValueChange={(v) => setDocForm({ ...docForm, file_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="image">Imagem (JPG, PNG)</SelectItem>
                      <SelectItem value="doc">Documento (DOC, DOCX)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setIsDocDialogOpen(false); resetDocForm(); }}>Cancelar</Button>
                <Button type="submit" disabled={createDocMutation.isPending || updateDocMutation.isPending}>{editingDoc ? 'Salvar' : 'Adicionar'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}
