import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { BRAZIL_STATES } from "@/lib/validators";
import {
  normalizeDate,
  normalizeCPF,
  type ImportRow,
  type Lookups,
} from "../../../utils/collaborator-import-parser";
import { SearchableSelect } from "./SearchableSelect";

type Benefit = { id: string; name: string };

type Props = {
  open: boolean;
  rowIndex: number | null;
  row: ImportRow | null;
  lookups: Lookups;
  benefits: Benefit[];
  onClose: () => void;
  onSave: (rowIndex: number, patch: Partial<ImportRow>) => void;
};

const NONE = "__none__";

export function ImportRowDrawer({
  open,
  rowIndex,
  row,
  lookups,
  benefits,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<ImportRow | null>(null);

  useEffect(() => {
    setDraft(row);
  }, [row]);

  if (!draft || rowIndex === null) {
    return null;
  }

  const update = <K extends keyof ImportRow>(key: K, value: ImportRow[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const updateMany = (patch: Partial<ImportRow>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  const toggleBenefit = (id: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.benefit_ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, benefit_ids: [...next] };
    });
  };

  const handleSave = () => {
    if (rowIndex !== null && draft) {
      onSave(rowIndex, {
        ...draft,
        cpf: normalizeCPF(draft.cpf),
        birth_date: normalizeDate(draft.birth_date),
        admission_date: normalizeDate(draft.admission_date),
      });
    }
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[500px] flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <SheetTitle>Editar linha {rowIndex + 1}</SheetTitle>
          <SheetDescription>
            Ajuste os dados deste colaborador. As alterações são aplicadas só nesta linha.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-5">
            <Section title="Identificação">
              <Field label="Nome" required>
                <Input
                  value={draft.name}
                  onChange={(e) => update("name", e.target.value)}
                />
              </Field>
              <Field label="CPF" required>
                <Input
                  value={draft.cpf}
                  onChange={(e) => update("cpf", e.target.value)}
                />
              </Field>
              <Field label="RG">
                <Input
                  value={draft.rg ?? ""}
                  onChange={(e) => update("rg", e.target.value || null)}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={draft.email ?? ""}
                  onChange={(e) => update("email", e.target.value || null)}
                />
              </Field>
              <Field label="Telefone">
                <Input
                  value={draft.phone ?? ""}
                  onChange={(e) => update("phone", e.target.value || null)}
                />
              </Field>
              <Field label="Data de nascimento (AAAA-MM-DD)">
                <Input
                  value={draft.birth_date ?? ""}
                  onChange={(e) => update("birth_date", e.target.value || null)}
                  placeholder="1990-05-15"
                />
              </Field>
            </Section>

            <Separator />

            <Section title="Endereço">
              <Field label="Endereço">
                <Input
                  value={draft.address ?? ""}
                  onChange={(e) => update("address", e.target.value || null)}
                />
              </Field>
              <Field label="Bairro">
                <Input
                  value={draft.district ?? ""}
                  onChange={(e) => update("district", e.target.value || null)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cidade">
                  <Input
                    value={draft.city ?? ""}
                    onChange={(e) => update("city", e.target.value || null)}
                  />
                </Field>
                <Field label="UF">
                  <Select
                    value={draft.state ?? NONE}
                    onValueChange={(v) => update("state", v === NONE ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {BRAZIL_STATES.map((uf) => (
                        <SelectItem key={uf} value={uf}>
                          {uf}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="CEP">
                <Input
                  value={draft.postal_code ?? ""}
                  onChange={(e) => update("postal_code", e.target.value || null)}
                />
              </Field>
            </Section>

            <Separator />

            <Section title="Vínculo">
              <Field label="Data de admissão (AAAA-MM-DD)">
                <Input
                  value={draft.admission_date ?? ""}
                  onChange={(e) => update("admission_date", e.target.value || null)}
                  placeholder="2024-01-15"
                />
              </Field>
              <Field label="Regime">
                <Select
                  value={draft.regime}
                  onValueChange={(v) => update("regime", v as ImportRow["regime"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clt">CLT</SelectItem>
                    <SelectItem value="pj">PJ</SelectItem>
                    <SelectItem value="estagiario">Estagiário</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Setor">
                <SearchableSelect
                  value={draft.team_id}
                  onChange={(v) => updateMany({ team_id: v, raw_team_name: null })}
                  options={lookups.teams.map((t) => ({ value: t.id, label: t.name }))}
                  placeholder="Selecione o setor"
                  searchPlaceholder="Buscar setor..."
                />
              </Field>
              <Field label="Cargo">
                <SearchableSelect
                  value={draft.position_id}
                  onChange={(v) => updateMany({ position_id: v, raw_position_name: null })}
                  options={lookups.positions.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="Selecione o cargo"
                  searchPlaceholder="Buscar cargo..."
                />
              </Field>
              <Field label="Loja onde trabalha">
                <SearchableSelect
                  value={draft.store_id}
                  onChange={(v) => updateMany({ store_id: v, raw_store_name: null })}
                  options={lookups.stores.map((s) => ({ value: s.id, label: s.store_name }))}
                  placeholder="Selecione a loja"
                  searchPlaceholder="Buscar loja..."
                />
              </Field>
              <Field label="Loja contratante">
                <SearchableSelect
                  value={draft.contracted_store_id}
                  onChange={(v) => updateMany({ contracted_store_id: v, raw_contracted_store_name: null })}
                  options={lookups.stores.map((s) => ({ value: s.id, label: s.store_name }))}
                  placeholder="Selecione a loja contratante"
                  searchPlaceholder="Buscar loja..."
                />
              </Field>
            </Section>

            <Separator />

            <Section title="Flags">
              <FlagRow
                label="PCD"
                value={draft.is_pcd}
                onChange={(v) => update("is_pcd", v)}
              />
              <FlagRow
                label="Jovem aprendiz"
                value={draft.is_apprentice}
                onChange={(v) => update("is_apprentice", v)}
              />
              <FlagRow
                label="Avulso (temporário)"
                value={draft.is_temp}
                onChange={(v) => update("is_temp", v)}
              />
            </Section>

            <Separator />

            <Section title={`Benefícios (${draft.benefit_ids.length})`}>
              {benefits.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum benefício cadastrado.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {benefits.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={draft.benefit_ids.includes(b.id)}
                        onCheckedChange={() => toggleBenefit(b.id)}
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
              )}
            </Section>

            <Separator />

            <Section title="Observações">
              <Textarea
                value={draft.notes ?? ""}
                onChange={(e) => update("notes", e.target.value || null)}
                rows={3}
              />
            </Section>
          </div>
        </ScrollArea>

        <SheetFooter className="px-6 py-3 border-t bg-background">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar linha</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}

function FlagRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
