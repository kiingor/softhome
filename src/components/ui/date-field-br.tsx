import * as React from "react";
import { Input } from "@/components/ui/input";

// Campo de data no padrão brasileiro (dd/mm/aaaa) que armazena ISO (yyyy-mm-dd).
// Máscara automática + validação. Emite onChange("") enquanto a data está
// incompleta/inválida, e o ISO quando completa e válida.

function isoToBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function brToIso(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate();
  if (day < 1 || day > lastDay) return null;
  if (year < 1900 || year > 2200) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function maskBr(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

interface DateFieldBRProps {
  /** Valor em ISO (yyyy-mm-dd) ou "". */
  value: string;
  /** Recebe ISO quando válido, "" quando incompleto/inválido. */
  onChange: (iso: string) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function DateFieldBR({
  value,
  onChange,
  id,
  disabled,
  placeholder = "dd/mm/aaaa",
  className,
}: DateFieldBRProps) {
  const [text, setText] = React.useState(() => isoToBr(value));

  // Sincroniza quando o valor externo muda (ex: reset do form, abrir modal).
  React.useEffect(() => {
    setText(isoToBr(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskBr(e.target.value);
    setText(masked);
    const iso = brToIso(masked);
    onChange(iso ?? "");
  };

  return (
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={text}
      onChange={handleChange}
      disabled={disabled}
      className={className}
    />
  );
}
