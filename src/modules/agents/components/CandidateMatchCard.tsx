import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Eye,
  Envelope,
  Phone,
  LinkSimple,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { getCvSignedUrl } from "@/modules/recruitment/services/cv-process.service";
import type { CandidateMatch } from "../types";

interface CandidateMatchCardProps {
  candidate: CandidateMatch;
  rank: number;
}

export function CandidateMatchCard({
  candidate,
  rank,
}: CandidateMatchCardProps) {
  const score = Math.round(candidate.similarity * 100);
  const scoreClass =
    score >= 70
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
      : score >= 50
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";

  const handleViewCv = async () => {
    if (!candidate.cv_url) return;
    const url = await getCvSignedUrl(candidate.cv_url);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("Não consegui gerar o link de download.");
  };

  return (
    <Card className="card-hover">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground font-mono">
                #{rank}
              </span>
              <h3 className="font-semibold text-foreground truncate">
                {candidate.name}
              </h3>
              {!candidate.is_active && (
                <Badge variant="outline" className="text-xs font-normal">
                  Pediu saída
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {candidate.email && (
                <span className="flex items-center gap-1">
                  <Envelope className="w-3 h-3" />
                  {candidate.email}
                </span>
              )}
              {candidate.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {candidate.phone}
                </span>
              )}
              {candidate.linkedin_url && (
                <a
                  href={candidate.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <LinkSimple className="w-3 h-3" />
                  LinkedIn
                </a>
              )}
              {candidate.source && (
                <span className="text-muted-foreground">
                  · {candidate.source}
                </span>
              )}
            </div>
          </div>

          <Badge
            variant="outline"
            className={`${scoreClass} border-0 text-xs font-medium shrink-0`}
          >
            {score}% match
          </Badge>
        </div>

        {candidate.cv_summary && (
          <p className="text-sm text-muted-foreground mt-3 line-clamp-3">
            {candidate.cv_summary}
          </p>
        )}

        {candidate.cv_url && (
          <div className="mt-3 pt-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={handleViewCv}>
              <Eye className="w-4 h-4 mr-2" />
              Ver CV completo
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
