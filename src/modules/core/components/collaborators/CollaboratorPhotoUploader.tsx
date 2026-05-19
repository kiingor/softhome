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

  const canUpload = canEdit && !!collaboratorId && !isUploading;

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div className="relative">
        <Avatar className="h-32 w-32 ring-2 ring-border">
          {signedUrl ? (
            <AvatarImage src={signedUrl} alt={name} />
          ) : (
            <AvatarFallback className="text-3xl">
              {initials(name) || "?"}
            </AvatarFallback>
          )}
        </Avatar>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFile}
        />
        <button
          type="button"
          onClick={handleSelectFile}
          disabled={!canUpload}
          title={
            !canEdit
              ? "Sem permissão pra editar"
              : !collaboratorId
                ? "Salve o colaborador primeiro"
                : photoUrl
                  ? "Trocar foto"
                  : "Adicionar foto"
          }
          aria-label={photoUrl ? "Trocar foto" : "Adicionar foto"}
          className="absolute bottom-1 right-1 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md ring-2 ring-background transition hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" weight="fill" />
          )}
        </button>
      </div>

      {canEdit && photoUrl && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
          onClick={handleRemove}
          disabled={isUploading}
        >
          <Trash className="w-3.5 h-3.5 mr-1" />
          Remover
        </Button>
      )}

      {canEdit && !collaboratorId && (
        <p className="text-[10px] text-center text-muted-foreground max-w-[120px] leading-tight">
          Salva o colaborador pra anexar a foto.
        </p>
      )}
    </div>
  );
}
