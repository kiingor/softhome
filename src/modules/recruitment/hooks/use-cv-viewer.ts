import { useCallback, useState } from "react";
import { toast } from "sonner";
import { getCvSignedUrl } from "../services/cv-process.service";

export function useCvViewer() {
  const [isOpening, setIsOpening] = useState(false);

  const openCv = useCallback(async (cvUrl: string | null | undefined) => {
    if (!cvUrl) {
      toast.error("Esse candidato ainda não tem currículo anexado.");
      return;
    }
    if (cvUrl.startsWith("http")) {
      window.open(cvUrl, "_blank", "noopener");
      return;
    }
    setIsOpening(true);
    try {
      const url = await getCvSignedUrl(cvUrl);
      if (url) {
        window.open(url, "_blank", "noopener");
      } else {
        toast.error("Não consegui gerar o link de download.");
      }
    } finally {
      setIsOpening(false);
    }
  }, []);

  return { openCv, isOpening };
}
