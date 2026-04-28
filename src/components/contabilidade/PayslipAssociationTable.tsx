import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, WarningCircle as AlertCircle, CheckCircle, Question as HelpCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface Collaborator {
  id: string;
  name: string;
  cpf: string;
}

interface MatchResult {
  collaboratorId: string | null;
  collaboratorName: string | null;
  confidence: "high" | "medium" | "low" | "none";
  matchType: "cpf" | "name" | "none";
}

interface FileWithMatch {
  file: File;
  match: MatchResult;
}

interface AssociationRow extends FileWithMatch {
  selectedCollaboratorId: string | null;
}

interface PayslipAssociationTableProps {
  filesWithMatches: FileWithMatch[];
  collaborators: Collaborator[];
  onAssociationsChange: (associations: Map<File, string>) => void;
}

const PayslipAssociationTable = ({
  filesWithMatches,
  collaborators,
  onAssociationsChange,
}: PayslipAssociationTableProps) => {
  const [rows, setRows] = useState<AssociationRow[]>([]);

  useEffect(() => {
    const initialRows = filesWithMatches.map((item) => ({
      ...item,
      selectedCollaboratorId: item.match.collaboratorId,
    }));
    setRows(initialRows);
  }, [filesWithMatches]);

  useEffect(() => {
    const associations = new Map<File, string>();
    rows.forEach((row) => {
      if (row.selectedCollaboratorId) {
        associations.set(row.file, row.selectedCollaboratorId);
      }
    });
    onAssociationsChange(associations);
  }, [rows, onAssociationsChange]);

  const updateRow = (index: number, collaboratorId: string | null) => {
    const newRows = [...rows];
    newRows[index] = {
      ...newRows[index],
      selectedCollaboratorId: collaboratorId,
    };
    setRows(newRows);
  };

  const getConfidenceBadge = (confidence: string, matchType: string) => {
    switch (confidence) {
      case "high":
        return (
          <Badge className="bg-green-100 text-green-700">
            <CheckCircle className="w-3 h-3 mr-1" />
            Alta ({matchType === "cpf" ? "CPF" : "Nome"})
          </Badge>
        );
      case "medium":
        return (
          <Badge className="bg-yellow-100 text-yellow-700">
            <HelpCircle className="w-3 h-3 mr-1" />
            Média
          </Badge>
        );
      case "low":
        return (
          <Badge className="bg-orange-100 text-orange-700">
            <AlertCircle className="w-3 h-3 mr-1" />
            Baixa
          </Badge>
        );
      default:
        return (
          <Badge variant="destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            Não reconhecido
          </Badge>
        );
    }
  };

  const getCollaboratorName = (id: string | null) => {
    if (!id) return null;
    return collaborators.find((c) => c.id === id)?.name || null;
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[40%]">Arquivo</TableHead>
            <TableHead className="w-[20%]">Sugestão</TableHead>
            <TableHead className="w-[30%]">Colaborador</TableHead>
            <TableHead className="w-[10%] text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              key={`${row.file.name}-${index}`}
              className={cn(
                !row.selectedCollaboratorId && "bg-destructive/5"
              )}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate text-sm" title={row.file.name}>
                    {row.file.name}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {row.match.confidence !== "none" ? (
                  <span className="text-sm text-muted-foreground">
                    {row.match.collaboratorName}
                  </span>
                ) : (
                  <span className="text-sm text-destructive">-</span>
                )}
              </TableCell>
              <TableCell>
                <Select
                  value={row.selectedCollaboratorId || "none"}
                  onValueChange={(value) =>
                    updateRow(index, value === "none" ? null : value)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecionar colaborador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">Não associar</span>
                    </SelectItem>
                    {collaborators.map((collab) => (
                      <SelectItem key={collab.id} value={collab.id}>
                        {collab.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-center">
                {row.selectedCollaboratorId ? (
                  <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-destructive mx-auto" />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default PayslipAssociationTable;
