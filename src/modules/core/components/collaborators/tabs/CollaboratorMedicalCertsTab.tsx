import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  CircleNotch as Loader2,
  Stethoscope,
  FileText,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";

interface Props {
  collaboratorId: string;
  companyId: string;
  canEdit: boolean;
}

interface MedicalCert {
  id: string;
  issued_at: string;
  days_off: number;
  cid_code: string | null;
  doctor_name: string | null;
  doctor_crm: string | null;
  document_url: string | null;
  notes: string | null;
}

const BUCKET = "medical-certificates";

export function CollaboratorMedicalCertsTab({
  collaboratorId,
  companyId,
  canEdit,
}: Props) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    issued_at: new Date().toISOString().slice(0, 10),
    days_off: 1,
    cid_code: "",
    doctor_name: "",
    doctor_crm: "",
    notes: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const { data: certs = [], isLoading } = useQuery({
    queryKey: ["collaborator-medical-certs", collaboratorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborator_medical_certificates")
        .select("*")
        .eq("collaborator_id", collaboratorId)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MedicalCert[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      let documentPath: string | null = null;
      if (file) {
        setIsUploading(true);
        const ext = file.name.split(".").pop() || "pdf";
        const path = `${companyId}/${collaboratorId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        documentPath = path;
      }
      const { error } = await supabase
        .from("collaborator_medical_certificates")
        .insert({
          collaborator_id: collaboratorId,
          company_id: companyId,
          issued_at: form.issued_at,
          days_off: form.days_off,
          cid_code: form.cid_code || null,
          doctor_name: form.doctor_name || null,
          doctor_crm: form.doctor_crm || null,
          document_url: documentPath,
          notes: form.notes || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["collaborator-medical-certs", collaboratorId],
      });
      setIsOpen(false);
      setForm({
        issued_at: new Date().toISOString().slice(0, 10),
        days_off: 1,
        cid_code: "",
        doctor_name: "",
        doctor_crm: "",
        notes: "",
      });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Atestado registrado ✓");
    },
    onError: (err: Error) => toast.error("Não rolou. " + err.message),
    onSettled: () => setIsUploading(false),
  });

  const remove = useMutation({
    mutationFn: async (cert: MedicalCert) => {
      if (cert.document_url) {
        await supabase.storage.from(BUCKET).remove([cert.document_url]);
      }
      const { error } = await supabase
        .from("collaborator_medical_certificates")
        .delete()
        .eq("id", cert.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["collaborator-medical-certs", collaboratorId],
      });
      toast.success("Removido ✓");
    },
  });

  const handleViewDoc = async (path: string) => {
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener");
    } else {
      toast.error("Não consegui abrir o documento.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Atestados médicos. CID e dados são protegidos por LGPD (acesso só RH).
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => setIsOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Registrar
          </Button>
        )}
      </div>

      {certs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Sem atestados registrados.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {certs.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">
                      {new Date(c.issued_at).toLocaleDateString("pt-BR")}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      · {c.days_off} dia{c.days_off === 1 ? "" : "s"} de afastamento
                    </span>
                    {c.cid_code && (
                      <span className="text-xs text-muted-foreground font-mono">
                        CID: {c.cid_code}
                      </span>
                    )}
                  </div>
                  {(c.doctor_name || c.doctor_crm) && (
                    <p className="text-xs text-muted-foreground">
                      {c.doctor_name}
                      {c.doctor_name && c.doctor_crm && " · "}
                      {c.doctor_crm && `CRM ${c.doctor_crm}`}
                    </p>
                  )}
                  {c.notes && (
                    <p className="text-xs text-muted-foreground italic">{c.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {c.document_url && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleViewDoc(c.document_url!)}
                      title="Ver documento"
                    >
                      <FileText className="w-4 h-4" />
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove.mutate(c)}
                      disabled={remove.isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar atestado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cert-date">Emitido em *</Label>
                <Input
                  id="cert-date"
                  type="date"
                  value={form.issued_at}
                  onChange={(e) =>
                    setForm({ ...form, issued_at: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cert-days">Dias de afastamento *</Label>
                <Input
                  id="cert-days"
                  type="number"
                  min={0}
                  value={form.days_off}
                  onChange={(e) =>
                    setForm({ ...form, days_off: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cert-cid">CID (opcional)</Label>
              <Input
                id="cert-cid"
                value={form.cid_code}
                onChange={(e) => setForm({ ...form, cid_code: e.target.value })}
                placeholder="ex: J11.1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cert-doctor">Médico</Label>
                <Input
                  id="cert-doctor"
                  value={form.doctor_name}
                  onChange={(e) =>
                    setForm({ ...form, doctor_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cert-crm">CRM</Label>
                <Input
                  id="cert-crm"
                  value={form.doctor_crm}
                  onChange={(e) =>
                    setForm({ ...form, doctor_crm: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cert-notes">Observações</Label>
              <Textarea
                id="cert-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cert-file">Anexo (PDF/imagem)</Label>
              <Input
                id="cert-file"
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || isUploading || form.days_off < 0}
            >
              {(create.isPending || isUploading) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
