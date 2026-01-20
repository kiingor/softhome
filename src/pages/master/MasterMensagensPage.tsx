import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useToast } from "@/hooks/use-toast";
import { useMaster } from "@/contexts/MasterContext";
import { Send, Trash2, CheckCircle, Clock, RefreshCw, Plus, Megaphone, ImageIcon } from "lucide-react";

export default function MasterMensagensPage() {
  const { toast } = useToast();
  const { userId } = useMaster();
  const queryClient = useQueryClient();

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [messageTitle, setMessageTitle] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageType, setMessageType] = useState<'info' | 'warning' | 'alert'>('info');
  const [imageUrl, setImageUrl] = useState("");

  // Fetch companies for dropdown
  const { data: companies } = useQuery({
    queryKey: ['master-companies-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name')
        .order('company_name');

      if (error) throw error;
      return data;
    },
  });

  // Fetch all messages
  const { data: messages, isLoading } = useQuery({
    queryKey: ['master-messages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_messages')
        .select(`
          id,
          title,
          body,
          message_type,
          created_at,
          visible_until,
          is_read,
          read_at,
          company_id,
          image_url
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('system_messages')
        .insert({
          company_id: selectedCompany === 'all' ? null : selectedCompany,
          title: messageTitle,
          body: messageBody,
          message_type: messageType,
          created_by: userId,
          visible_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          image_url: imageUrl || null,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Mensagem enviada',
        description: selectedCompany === 'all' 
          ? 'A mensagem foi enviada para todas as empresas.'
          : 'A mensagem foi enviada para a empresa selecionada.',
      });
      queryClient.invalidateQueries({ queryKey: ['master-messages'] });
      setShowNewDialog(false);
      setMessageTitle("");
      setMessageBody("");
      setMessageType('info');
      setSelectedCompany('all');
      setImageUrl("");
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao enviar mensagem',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete message mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('system_messages')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Mensagem excluída' });
      queryClient.invalidateQueries({ queryKey: ['master-messages'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  function getCompanyName(companyId: string | null): string {
    if (!companyId) return 'Todas as empresas';
    return companies?.find(c => c.id === companyId)?.company_name || 'Empresa não encontrada';
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Mensagens</h1>
          <p className="text-muted-foreground">Envie notificações para os painéis dos clientes</p>
        </div>
        <Button onClick={() => setShowNewDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Mensagem
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mensagens Enviadas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enviada em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : messages?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Megaphone className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">Nenhuma mensagem enviada</p>
                  </TableCell>
                </TableRow>
              ) : (
                messages?.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell>
                      <div className="flex items-start gap-3">
                        {message.image_url && (
                          <img 
                            src={message.image_url} 
                            alt="" 
                            className="w-10 h-10 rounded object-cover flex-shrink-0"
                          />
                        )}
                        <div>
                          <p className="font-medium">{message.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {message.body}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {getCompanyName(message.company_id)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={
                          message.message_type === 'alert' ? 'destructive' :
                          message.message_type === 'warning' ? 'secondary' : 'outline'
                        }
                      >
                        {message.message_type === 'info' && 'Informação'}
                        {message.message_type === 'warning' && 'Aviso'}
                        {message.message_type === 'alert' && 'Alerta'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {message.is_read ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-xs">Lida</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span className="text-xs">Pendente</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(message.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(message.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New Message Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Mensagem</DialogTitle>
            <DialogDescription>
              Envie uma notificação para o painel de um cliente ou para todos
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Destinatário</Label>
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as empresas</SelectItem>
                  {companies?.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de mensagem</Label>
              <Select value={messageType} onValueChange={(v) => setMessageType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Informação</SelectItem>
                  <SelectItem value="warning">Aviso</SelectItem>
                  <SelectItem value="alert">Alerta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Título</Label>
              <Input 
                placeholder="Título da mensagem"
                value={messageTitle}
                onChange={(e) => setMessageTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea 
                placeholder="Conteúdo da mensagem..."
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                URL da Imagem (opcional)
              </Label>
              <Input 
                placeholder="https://exemplo.com/imagem.png"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
              {imageUrl && (
                <img 
                  src={imageUrl} 
                  alt="Preview" 
                  className="w-20 h-20 rounded object-cover border"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending || !messageTitle || !messageBody}
            >
              {sendMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}