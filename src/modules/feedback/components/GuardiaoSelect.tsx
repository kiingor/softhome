import { useEffect, useState } from "react";
import { CaretUpDown, ShieldCheck, X, User, CircleNotch as Loader2 } from "@phosphor-icons/react";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useColaboradorSearch } from "../hooks/use-feedbacks";
import type { Guardiao } from "../types";

interface Props {
  value: Guardiao | null;
  onChange: (g: Guardiao | null) => void;
  disabled?: boolean;
  className?: string;
}

export function GuardiaoSelect({ value, onChange, disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(t);
  }, [term]);

  const { data: results = [], isFetching } = useColaboradorSearch(debounced, open);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="flex items-center gap-2 truncate">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            {value ? value.nome : "Selecionar Guardião(ã)"}
          </span>
          <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder="Nome, registro ou telefone..."
          />
          <CommandList>
            {value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <X className="mr-2 h-4 w-4 opacity-70" />
                  <span className="opacity-70">Limpar seleção</span>
                </CommandItem>
              </CommandGroup>
            )}

            {isFetching ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando...
              </div>
            ) : results.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {debounced ? "Ninguém encontrado." : "Digite pra buscar."}
              </div>
            ) : (
              <CommandGroup>
                {results.map((r) => {
                  const hasFullName = !!r.nome;
                  const nome = r.nome ?? r.nomeSuporte ?? `#${r.id}`;
                  const secondary = (hasFullName ? [r.nomeSuporte, r.setor] : [r.setor])
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <CommandItem
                      key={r.id}
                      value={String(r.id)}
                      onSelect={() => {
                        onChange({ id: r.id, nome });
                        setOpen(false);
                      }}
                    >
                      <User className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-medium truncate">{nome}</span>
                        {secondary && (
                          <span className="text-xs opacity-70 truncate">{secondary}</span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
