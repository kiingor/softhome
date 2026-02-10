import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import PermissionGuard from "@/components/dashboard/PermissionGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Calculator,
  Upload,
  FileCheck,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { getMonthName } from "@/lib/formatters";
import { processFilesForMatching } from "@/lib/payslipMatcher";
import PayslipUploadZone from "@/components/contabilidade/PayslipUploadZone";
import PayslipAssociationTable from "@/components/contabilidade/PayslipAssociationTable";

type Step = "upload" | "associate" | "complete";

const ContabilidadePage = () => {
  const { currentCompany, user } = useDashboard();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("upload");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [files, setFiles] = useState<File[]>([]);
  const [filesWithMatches, setFilesWithMatches] = useState<
    { file: File; match: any }[]
  >([]);
  const [associations, setAssociations] = useState<Map<File, string>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [uploadResults, setUploadResults] = useState<{
    success: number;
    failed: number;
  } | null>(null);

  // Fetch collaborators
  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators-for-payslips", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, name, cpf")
        .eq("company_id", currentCompany.id)
        .eq("status", "ativo")
        .eq("is_temp", false)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompany?.id,
  });

  // Fetch existing payslips for the period
  const { data: existingPayslips = [] } = useQuery({
    queryKey: ["existing-payslips", currentCompany?.id, selectedMonth, selectedYear],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("payslips")
        .select("collaborator_id")
        .eq("company_id", currentCompany.id)
        .eq("month", selectedMonth)
        .eq("year", selectedYear);
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompany?.id,
  });

  const collaboratorsWithPayslip = new Set(
    existingPayslips.map((p) => p.collaborator_id)
  );

  const periodLabel = `${getMonthName(selectedMonth)}/${selectedYear}`;

  const navigatePeriod = (direction: "prev" | "next") => {
    if (direction === "prev") {
      if (selectedMonth === 1) {
        setSelectedMonth(12);
        setSelectedYear(selectedYear - 1);
      } else {
        setSelectedMonth(selectedMonth - 1);
      }
    } else {
      if (selectedMonth === 12) {
        setSelectedMonth(1);
        setSelectedYear(selectedYear + 1);
      } else {
        setSelectedMonth(selectedMonth + 1);
      }
    }
  };

  const handleFilesChange = (newFiles: File[]) => {
    setFiles(newFiles);
  };

  const handleProceedToAssociation = () => {
    if (files.length === 0) {
      toast.error("Selecione pelo menos um arquivo");
      return;
    }

    const matches = processFilesForMatching(files, collaborators);
    setFilesWithMatches(matches);
    setStep("associate");
  };

  const handleAssociationsChange = useCallback(
    (newAssociations: Map<File, string>) => {
      setAssociations(newAssociations);
    },
    []
  );

  const unassociatedCount = files.length - associations.size;
  const canImport = associations.size > 0;

  const handleImport = async () => {
    if (!currentCompany?.id || !user?.id) return;

    setIsUploading(true);
    let successCount = 0;
    let failedCount = 0;

    try {
      for (const [file, collaboratorId] of associations.entries()) {
        try {
          // Check if payslip already exists for this collaborator/period
          if (collaboratorsWithPayslip.has(collaboratorId)) {
            // Delete existing payslip first
            const { data: existing } = await supabase
              .from("payslips")
              .select("id, file_url")
              .eq("collaborator_id", collaboratorId)
              .eq("month", selectedMonth)
              .eq("year", selectedYear)
              .maybeSingle();

            if (existing) {
              // Delete old file from storage
              await supabase.storage.from("payslips").remove([existing.file_url]);
              // Delete record
              await supabase.from("payslips").delete().eq("id", existing.id);
            }
          }

          // Upload file to storage
          const sanitizedName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
          const filePath = `${collaboratorId}/${selectedYear}/${selectedMonth}/${sanitizedName}`;
          const { error: uploadError } = await supabase.storage
            .from("payslips")
            .upload(filePath, file, { upsert: true });

          if (uploadError) throw uploadError;

          // Create payslip record
          const { error: insertError } = await supabase.from("payslips").insert({
            collaborator_id: collaboratorId,
            company_id: currentCompany.id,
            file_url: filePath,
            file_name: file.name,
            month: selectedMonth,
            year: selectedYear,
            uploaded_by: user.id,
          });

          if (insertError) throw insertError;

          successCount++;
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          failedCount++;
        }
      }

      setUploadResults({ success: successCount, failed: failedCount });
      setStep("complete");
      queryClient.invalidateQueries({ queryKey: ["existing-payslips"] });

      if (failedCount === 0) {
        toast.success(`${successCount} contracheque(s) importado(s) com sucesso!`);
      } else {
        toast.warning(
          `${successCount} importado(s), ${failedCount} falha(s)`
        );
      }
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Erro ao importar contracheques");
    } finally {
      setIsUploading(false);
      setShowConfirmDialog(false);
    }
  };

  const handleReset = () => {
    setStep("upload");
    setFiles([]);
    setFilesWithMatches([]);
    setAssociations(new Map());
    setUploadResults(null);
  };

  return (
    <PermissionGuard module="contabilidade">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Contabilidade</h1>
            <p className="text-muted-foreground">
              Upload e associação de contracheques
            </p>
          </div>
          {step !== "upload" && (
            <Button variant="outline" onClick={handleReset}>
              Nova Importação
            </Button>
          )}
        </div>

        {/* Period Selector */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigatePeriod("prev")}
                disabled={step !== "upload"}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-center min-w-[150px]">
                <p className="font-semibold text-lg">{periodLabel}</p>
                <p className="text-sm text-muted-foreground">Competência</p>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigatePeriod("next")}
                disabled={step !== "upload"}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Step: Upload */}
        {step === "upload" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                1. Upload de Contracheques
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <PayslipUploadZone files={files} onFilesChange={handleFilesChange} />

              {collaboratorsWithPayslip.size > 0 && (
                <div className="flex items-center gap-2 p-3 bg-yellow-50 text-yellow-800 rounded-lg">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">
                    {collaboratorsWithPayslip.size} colaborador(es) já possuem
                    contracheque para {periodLabel}. Novos uploads substituirão os
                    existentes.
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={handleProceedToAssociation}
                  disabled={files.length === 0}
                >
                  Analisar Arquivos
                  <FileCheck className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Associate */}
        {step === "associate" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                2. Associação de Arquivos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4 flex-wrap">
                <Badge variant="secondary" className="text-sm py-1">
                  {files.length} arquivo(s)
                </Badge>
                <Badge
                  variant={associations.size === files.length ? "default" : "outline"}
                  className="text-sm py-1"
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  {associations.size} associado(s)
                </Badge>
                {unassociatedCount > 0 && (
                  <Badge variant="destructive" className="text-sm py-1">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {unassociatedCount} pendente(s)
                  </Badge>
                )}
              </div>

              <PayslipAssociationTable
                filesWithMatches={filesWithMatches}
                collaborators={collaborators}
                onAssociationsChange={handleAssociationsChange}
              />

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("upload")}>
                  Voltar
                </Button>
                <Button
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={!canImport || isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      Importar {associations.size} Contracheque(s)
                      <Upload className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Complete */}
        {step === "complete" && uploadResults && (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Importação Concluída!
              </h2>
              <p className="text-muted-foreground mb-6">
                {uploadResults.success} contracheque(s) importado(s) para{" "}
                {periodLabel}
              </p>
              {uploadResults.failed > 0 && (
                <p className="text-destructive mb-6">
                  {uploadResults.failed} arquivo(s) falharam
                </p>
              )}
              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={handleReset}>
                  Nova Importação
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Confirm Dialog */}
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Importação</AlertDialogTitle>
              <AlertDialogDescription>
                Você está prestes a importar {associations.size} contracheque(s)
                para a competência de {periodLabel}.
                {unassociatedCount > 0 && (
                  <>
                    <br />
                    <br />
                    <span className="text-destructive font-medium">
                      Atenção: {unassociatedCount} arquivo(s) não serão importados
                      por não estarem associados.
                    </span>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isUploading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleImport} disabled={isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  "Confirmar Importação"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PermissionGuard>
  );
};

export default ContabilidadePage;
