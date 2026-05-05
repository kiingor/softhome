import { useState } from "react";
import { CheckCircle, Warning, WarningCircle, CaretDown, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ImportRow, Lookups } from "../../../utils/collaborator-import-parser";
import type { FilterMode } from "../../../hooks/use-collaborator-import";
import { SearchableSelect } from "./SearchableSelect";

type Benefit = { id: string; name: string };

type Stats = {
  ok: number;
  warning: number;
  error: number;
  total: number;
  selected: number;
};

type Props = {
  stats: Stats;
  filter: FilterMode;
  onChangeFilter: (f: FilterMode) => void;
  lookups: Lookups;
  benefits: Benefit[];
  onApplyToSelected: (patch: Partial<ImportRow>) => void;
  onClearSelection: () => void;
  disabled?: boolean;
};

const FILTER_LABELS: Record<FilterMode, string> = {
  all: "Todos",
  valid: "Apenas válidos",
  errors: "Apenas com erro",
};

export function ImportToolbar({
  stats,
  filter,
  onChangeFilter,
  lookups,
  benefits,
  onApplyToSelected,
  onClearSelection,
  disabled,
}: Props) {
  // Em todos os bulk-fields, `null` = não tocar; `"__none__"` = limpar; `"<id>"` = atribuir
  const [bulkSetor, setBulkSetor] = useState<string | null>(null);
  const [bulkCargo, setBulkCargo] = useState<string | null>(null);
  const [bulkStore, setBulkStore] = useState<string | null>(null);
  const [bulkContractedStore, setBulkContractedStore] = useState<string | null>(null);
  const [bulkRegime, setBulkRegime] = useState<string>("");
  const [bulkBenefits, setBulkBenefits] = useState<Set<string>>(new Set());

  const NONE = "__none__";
  const KEEP = "__keep__";

  const hasAnyApply =
    bulkSetor !== null ||
    bulkCargo !== null ||
    bulkStore !== null ||
    bulkContractedStore !== null ||
    bulkRegime !== "" ||
    bulkBenefits.size > 0;

  const handleApply = () => {
    const patch: Partial<ImportRow> = {};

    if (bulkSetor !== null) {
      patch.team_id = bulkSetor === NONE ? null : bulkSetor;
      patch.raw_team_name = null;
    }
    if (bulkCargo !== null) {
      patch.position_id = bulkCargo === NONE ? null : bulkCargo;
      patch.raw_position_name = null;
    }
    if (bulkStore !== null) {
      patch.store_id = bulkStore === NONE ? null : bulkStore;
      patch.raw_store_name = null;
    }
    if (bulkContractedStore !== null) {
      patch.contracted_store_id =
        bulkContractedStore === NONE ? null : bulkContractedStore;
      patch.raw_contracted_store_name = null;
    }
    if (bulkRegime !== "" && bulkRegime !== KEEP) {
      patch.regime = bulkRegime as "clt" | "pj" | "estagiario";
    }
    if (bulkBenefits.size > 0) {
      patch.benefit_ids = [...bulkBenefits];
    }

    onApplyToSelected(patch);

    setBulkSetor(null);
    setBulkCargo(null);
    setBulkStore(null);
    setBulkContractedStore(null);
    setBulkRegime("");
    setBulkBenefits(new Set());
  };

  const toggleBenefit = (id: string) => {
    setBulkBenefits((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3">
      {/* Stats + Filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-emerald-700">
            <CheckCircle className="w-4 h-4" /> {stats.ok} válidos
          </span>
          <span className="flex items-center gap-1.5 text-amber-600">
            <Warning className="w-4 h-4" /> {stats.warning} com aviso
          </span>
          <span className="flex items-center gap-1.5 text-destructive">
            <WarningCircle className="w-4 h-4" /> {stats.error} com erro
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium">
            {stats.selected} selecionado{stats.selected === 1 ? "" : "s"}
          </span>
          {stats.selected > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="h-6 px-2 text-xs"
            >
              <X className="w-3 h-3 mr-1" /> Limpar
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {(Object.keys(FILTER_LABELS) as FilterMode[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "ghost"}
              onClick={() => onChangeFilter(f)}
              className="h-7 text-xs"
            >
              {FILTER_LABELS[f]}
            </Button>
          ))}
        </div>
      </div>

      {/* Bulk apply */}
      <div className="flex items-end gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground self-center">
          Aplicar aos selecionados:
        </span>

        <SearchableSelect
          value={bulkSetor === NONE ? null : bulkSetor}
          onChange={(v) => setBulkSetor(v ?? NONE)}
          options={lookups.teams.map((t) => ({ value: t.id, label: t.name }))}
          placeholder={bulkSetor === NONE ? "Limpar setor" : "Setor"}
          searchPlaceholder="Buscar setor..."
          emptyOptionLabel="Limpar setor"
          triggerClassName="h-8 w-[150px] text-xs"
          disabled={disabled}
        />

        <SearchableSelect
          value={bulkCargo === NONE ? null : bulkCargo}
          onChange={(v) => setBulkCargo(v ?? NONE)}
          options={lookups.positions.map((p) => ({ value: p.id, label: p.name }))}
          placeholder={bulkCargo === NONE ? "Limpar cargo" : "Cargo"}
          searchPlaceholder="Buscar cargo..."
          emptyOptionLabel="Limpar cargo"
          triggerClassName="h-8 w-[180px] text-xs"
          disabled={disabled}
        />

        <SearchableSelect
          value={bulkStore === NONE ? null : bulkStore}
          onChange={(v) => setBulkStore(v ?? NONE)}
          options={lookups.stores.map((s) => ({ value: s.id, label: s.store_name }))}
          placeholder={bulkStore === NONE ? "Limpar loja" : "Loja onde trabalha"}
          searchPlaceholder="Buscar loja..."
          emptyOptionLabel="Limpar loja"
          triggerClassName="h-8 w-[170px] text-xs"
          disabled={disabled}
        />

        <SearchableSelect
          value={bulkContractedStore === NONE ? null : bulkContractedStore}
          onChange={(v) => setBulkContractedStore(v ?? NONE)}
          options={lookups.stores.map((s) => ({ value: s.id, label: s.store_name }))}
          placeholder={bulkContractedStore === NONE ? "Limpar contratante" : "Loja contratante"}
          searchPlaceholder="Buscar loja..."
          emptyOptionLabel="Limpar loja"
          triggerClassName="h-8 w-[170px] text-xs"
          disabled={disabled}
        />

        <Select value={bulkRegime} onValueChange={setBulkRegime} disabled={disabled}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue placeholder="Regime" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clt">CLT</SelectItem>
            <SelectItem value="pj">PJ</SelectItem>
            <SelectItem value="estagiario">Estagiário</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={disabled}>
              Benefícios{" "}
              {bulkBenefits.size > 0 && (
                <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 text-[10px] font-medium">
                  {bulkBenefits.size}
                </span>
              )}
              <CaretDown className="w-3 h-3 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            {benefits.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">
                Nenhum benefício cadastrado.
              </p>
            ) : (
              <ScrollArea className="max-h-60">
                <div className="space-y-1">
                  {benefits.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={bulkBenefits.has(b.id)}
                        onCheckedChange={() => toggleBenefit(b.id)}
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
              </ScrollArea>
            )}
          </PopoverContent>
        </Popover>

        <Button
          size="sm"
          onClick={handleApply}
          disabled={disabled || stats.selected === 0 || !hasAnyApply}
          className="h-8 ml-auto"
        >
          Aplicar a {stats.selected}
        </Button>
      </div>
    </div>
  );
}
