import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Eye,
  Envelope,
  Phone,
  LinkSimple,
} from "@phosphor-icons/react";
import { useCvViewer } from "@/modules/recruitment/hooks/use-cv-viewer";
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
      ? "bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary"
      : score >= 50
      ? "bg-warning/10 text-warning dark:bg-warning/15 dark:text-warning"
      : "bg-destructive/10 text-destructive dark:bg-destructive/15 dark:text-destructive";

  const { openCv, isOpening } = useCvViewer();

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
                <Badge variant="outline" >
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => openCv(candidate.cv_url)}
              disabled={isOpening}
            >
              <Eye className="w-4 h-4 mr-2" />
              Ver CV completo
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
