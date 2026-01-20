import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortal } from "@/contexts/PortalContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Download,
  FileText,
  ChevronLeft,
  ChevronRight,
  File,
} from "lucide-react";
import { toast } from "sonner";
import { getMonthName } from "@/lib/formatters";

const MeusContracheques = () => {
  const { collaborator } = usePortal();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ["my-payslips", collaborator?.id, selectedYear],
    queryFn: async () => {
      if (!collaborator?.id) return [];
      const { data, error } = await supabase
        .from("payslips")
        .select("*")
        .eq("collaborator_id", collaborator.id)
        .eq("year", selectedYear)
        .order("month", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!collaborator?.id,
  });

  const handleDownload = async (payslip: any) => {
    try {
      const { data, error } = await supabase.storage
        .from("payslips")
        .download(payslip.file_url);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = payslip.file_name || `contracheque_${payslip.month}_${payslip.year}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Download iniciado!");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Erro ao baixar o arquivo");
    }
  };

  const navigateYear = (direction: "prev" | "next") => {
    setSelectedYear(direction === "prev" ? selectedYear - 1 : selectedYear + 1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meus Contracheques</h1>
        <p className="text-muted-foreground">
          Baixe seus contracheques disponibilizados pelo RH
        </p>
      </div>

      {/* Year Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigateYear("prev")}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-center min-w-[100px]">
              <p className="font-semibold text-lg">{selectedYear}</p>
            </div>
            <Button variant="outline" size="icon" onClick={() => navigateYear("next")}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payslips List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5" />
            Contracheques de {selectedYear}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando...
            </div>
          ) : payslips.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <File className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-2">
                Nenhum contracheque disponível
              </h3>
              <p className="text-muted-foreground text-sm">
                Não há contracheques disponíveis para {selectedYear}.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Competência</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Data Upload</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslips.map((payslip) => (
                    <TableRow key={payslip.id}>
                      <TableCell>
                        <Badge variant="outline">
                          {getMonthName(payslip.month)}/{payslip.year}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {payslip.file_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(payslip.uploaded_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(payslip)}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Baixar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MeusContracheques;
