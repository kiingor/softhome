import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Segmented control — o "filtro pílula" do design system (padrão AgendaV3).
//
// Um trilho em superfície muted; o item ativo sobe pra superfície de card com
// sombra suave. Usado onde as opções são poucas e mutuamente exclusivas (status
// da linha, período do extrato) — mais claro que botões soltos, e um só padrão
// pra tela inteira não ficar com cada filtro de um jeito.
// ─────────────────────────────────────────────────────────────────────────────

export interface SegmentedOption {
  value: string;
  label: string;
  /** Contador opcional à direita do rótulo (ex.: quantos pendentes). */
  count?: number;
}

export function Segmented({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SegmentedOption[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/60 p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[6px] px-3 h-7 text-xs font-medium transition-colors whitespace-nowrap",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              active
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
            {opt.count != null && (
              <span
                className={cn(
                  "mono text-[10px] tabular-nums",
                  active ? "text-muted-foreground" : "text-muted-foreground/70",
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
