import { useRef, useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Camera, CircleNotch as Loader2, Trash } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  collaboratorId: string | null;
  companyId: string;
  photoUrl: string | null;
  name: string;
  onChange: (newPath: string | null) => void;
  canEdit: boolean;
}

const BUCKET = "collaborator-photos";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function CollaboratorPhotoUploader({
  collaboratorId,
  companyId,
  photoUrl,
  name,
  onChange,
  canEdit,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!photoUrl) {
        setSignedUrl(null);
        return;
      }
      if (photoUrl.startsWith("http")) {
        setSignedUrl(photoUrl);
        return;
      }
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(photoUrl, 3600);
      if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  const handleSelectFile = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      toast.error("Só imagem (JPG, PNG ou WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Foto maior que 5MB.");
      return;
    }
    if (!collaboratorId) {
      toast.error("Salva o colaborador antes de subir a foto.");
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${companyId}/${collaboratorId}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;

      onChange(path);
      toast.success("Foto atualizada ✓");
    } catch (err) {
      toast.error("Falha ao subir: " + (err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!photoUrl || photoUrl.startsWith("http")) {
      onChange(null);
      return;
    }
    try {
      await supabase.storage.from(BUCKET).remove([photoUrl]);
    } catch {
      // se falhar, ainda limpa do registro
    }
    onChange(null);
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-20 w-20 ring-2 ring-border">
        {signedUrl ? (
          <AvatarImage src={signedUrl} alt={name} />
        ) : (
          <AvatarFallback className="text-xl">
            {initials(name) || "?"}
          </AvatarFallback>
        )}
      </Avatar>

      {canEdit && (
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSelectFile}
            disabled={isUploading || !collaboratorId}
            title={!collaboratorId ? "Salve o colaborador primeiro" : "Trocar foto"}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 mr-2" />
                {photoUrl ? "Trocar foto" : "Adicionar foto"}
              </>
            )}
          </Button>
          {photoUrl && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleRemove}
              disabled={isUploading}
            >
              <Trash className="w-4 h-4 mr-2" />
              Remover
            </Button>
          )}
          {!collaboratorId && (
            <p className="text-xs text-muted-foreground">
              Salve o colaborador para anexar a foto.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
