import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DotsThree as MoreHorizontal,
  Eye,
  CaretRight,
  Trophy,
} from "@phosphor-icons/react";
import {
  STAGE_LABELS,
  PIPELINE_STAGES,
  type ApplicationStage,
  type CandidateApplicationWithCandidate,
} from "../types";
import type { AIScoringResult } from "../types";

interface ApplicationCardProps {
  application: CandidateApplicationWithCandidate;
  onMoveStage: (stage: ApplicationStage) => void;
  onStartAdmission?: () => void;
}

export function ApplicationCard({
  application,
  onMoveStage,
  onStartAdmission,
}: ApplicationCardProps) {
  const [showFull, setShowFull] = useState(false);
  const candidate = application.candidate;

  // Tenta parsear ai_summary como JSON estruturado
  let aiResult: AIScoringResult | null = null;
  if (application.ai_summary) {
    try {
      aiResult = JSON.parse(application.ai_summary);
    } catch {
      // ai_summary é texto livre, não JSON
    }
  }

  const score = application.ai_score;
  const scoreNum = score != null ? Number(score) : null;

  return (
    <Card className="card-hover">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm text-foreground truncate">
              {candidate?.name ?? "(sem nome)"}
            </p>
            {candidate?.email && (
              <p className="text-xs text-muted-foreground truncate">
                {candidate.email}
              </p>
            )}
          </div>
          {scoreNum != null && (
            <Badge
              variant="outline"
              className={
                scoreNum >= 80
                  ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-0 text-xs"
                  : scoreNum >= 50
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0 text-xs"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-0 text-xs"
              }
            >
              {scoreNum.toFixed(0)}
            </Badge>
          )}
        </div>

        {aiResult && (
          <div>
            <p
              className={`text-xs text-muted-foreground ${
                showFull ? "" : "line-clamp-2"
              }`}
            >
              {aiResult.justificativa}
            </p>
            {aiResult.justificativa.length > 100 && (
              <button
                type="button"
                onClick={() => setShowFull(!showFull)}
                className="text-xs text-primary hover:underline mt-1"
              >
                {showFull ? "menos" : "mais"}
              </button>
            )}
            {aiResult.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {aiResult.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                  >
                    {tag.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {application.stage === "rejected" && application.rejected_reason && (
          <p className="text-xs text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20 p-1.5 rounded">
            {application.rejected_reason}
          </p>
        )}

        <div className="flex items-center justify-between gap-1 pt-1 border-t border-border">
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
            <a
              href={candidate?.cv_url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => !candidate?.cv_url && e.preventDefault()}
            >
              <Eye className="w-3 h-3 mr-1" />
              CV
            </a>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                Mover
                <CaretRight className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {PIPELINE_STAGES.filter((s) => s !== application.stage).map((stage) => (
                <DropdownMenuItem key={stage} onClick={() => onMoveStage(stage)}>
                  {STAGE_LABELS[stage]}
                </DropdownMenuItem>
              ))}
              {application.stage === "accepted" && onStartAdmission && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onStartAdmission} className="text-orange-700 dark:text-orange-300">
                    <Trophy className="w-4 h-4 mr-2" />
                    Iniciar admissão
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
