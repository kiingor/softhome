import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Envelope,
  Phone,
  IdentificationCard,
  LinkSimple,
  Eye,
  CheckCircle,
} from "@phosphor-icons/react";
import { useCvViewer } from "../hooks/use-cv-viewer";
import { formatCPF } from "@/lib/validators";
import type { Candidate } from "../types";

interface Props {
  candidate: Candidate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CandidateDetailDialog({ candidate, open, onOpenChange }: Props) {
  const { openCv, isOpening } = useCvViewer();

  if (!candidate) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {candidate.name}
            {candidate.cv_processed_at && (
              <Badge
                variant="outline"
                className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-0 text-xs font-normal"
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Indexado
              </Badge>
            )}
            {!candidate.is_active && (
              <Badge variant="outline" className="text-xs font-normal">
                Pediu saída
              </Badge>
            )}
          </DialogTitle>
          {candidate.source && (
            <DialogDescription>Fonte: {candidate.source}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Contato
            </h3>
            <div className="space-y-1.5">
              {candidate.email && (
                <div className="flex items-center gap-2 text-foreground">
                  <Envelope className="w-4 h-4 text-muted-foreground" />
                  <a
                    href={`mailto:${candidate.email}`}
                    className="hover:underline"
                  >
                    {candidate.email}
                  </a>
                </div>
              )}
              {candidate.phone && (
                <div className="flex items-center gap-2 text-foreground">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  {candidate.phone}
                </div>
              )}
              {candidate.cpf && (
                <div className="flex items-center gap-2 text-foreground">
                  <IdentificationCard className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono">{formatCPF(candidate.cpf)}</span>
                </div>
              )}
              {candidate.linkedin_url && (
                <div className="flex items-center gap-2">
                  <LinkSimple className="w-4 h-4 text-muted-foreground" />
                  <a
                    href={candidate.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    LinkedIn
                  </a>
                </div>
              )}
            </div>
          </section>

          {candidate.notes && (
            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Mensagem do candidato
              </h3>
              <p className="text-foreground whitespace-pre-wrap bg-muted/50 rounded-md p-3 text-sm">
                {candidate.notes}
              </p>
            </section>
          )}

          {candidate.cv_summary && (
            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Resumo do CV (gerado por IA)
              </h3>
              <p className="text-foreground whitespace-pre-wrap text-sm">
                {candidate.cv_summary}
              </p>
            </section>
          )}

          <section className="text-xs text-muted-foreground space-y-1">
            <p>
              Recebido em{" "}
              {new Date(candidate.created_at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {candidate.consent_talent_pool === false && (
              <p>Sem consentimento para banco de talentos (LGPD).</p>
            )}
          </section>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {candidate.cv_url && (
            <Button
              variant="outline"
              onClick={() => openCv(candidate.cv_url)}
              disabled={isOpening}
            >
              <Eye className="w-4 h-4 mr-2" />
              Abrir CV
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
