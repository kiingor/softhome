import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Users,
  Buildings as Building2,
  UsersThree,
  Briefcase,
  Gift,
  CalendarBlank,
  ChartLine,
  Gear,
  Calculator,
  Stethoscope,
  Trophy,
  IdentificationCard,
  Megaphone,
  AddressBook,
  CurrencyDollar,
  Robot,
  Sparkle,
  House,
  TreePalm as Palmtree,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { Badge } from "@/components/ui/badge";

interface PageEntry {
  id: string;
  label: string;
  description?: string;
  path: string;
  keywords: string[];
  icon: React.ComponentType<{ className?: string }>;
}

const PAGES: PageEntry[] = [
  { id: "p-home", label: "Visão Geral", description: "Dashboard principal", path: "/dashboard", keywords: ["home", "início", "dashboard", "painel"], icon: House },
  { id: "p-collaborators", label: "Colaboradores", description: "Cadastro de colaboradores", path: "/dashboard/colaboradores", keywords: ["funcionário", "funcionario", "equipe", "time", "pessoas"], icon: Users },
  { id: "p-stores", label: "Empresas", description: "CNPJs do grupo", path: "/dashboard/empresas", keywords: ["filiais", "matriz", "cnpj", "lojas", "stores"], icon: Building2 },
  { id: "p-teams", label: "Setores", description: "Setores e equipes", path: "/dashboard/setores", keywords: ["departamento", "equipe", "team", "área"], icon: UsersThree },
  { id: "p-positions", label: "Cargos", description: "Cargos e salários", path: "/dashboard/cargos", keywords: ["função", "posição", "salário", "position"], icon: Briefcase },
  { id: "p-benefits", label: "Benefícios", description: "Tipos de benefícios", path: "/dashboard/beneficios", keywords: ["vr", "vt", "vale", "plano", "saúde", "alimentação", "transporte"], icon: Gift },
  { id: "p-vacation", label: "Férias", description: "Solicitações e calendário", path: "/dashboard/ferias", keywords: ["folga", "vacation"], icon: Palmtree },
  { id: "p-payroll", label: "Folha", description: "Períodos e lançamentos", path: "/dashboard/folha", keywords: ["holerite", "salário", "pagamento", "payroll", "competência"], icon: CurrencyDollar },
  { id: "p-exams", label: "Exames", description: "Exames ocupacionais", path: "/dashboard/exames", keywords: ["aso", "saúde ocupacional", "exam"], icon: Stethoscope },
  { id: "p-admissions", label: "Admissões", description: "Processo de admissão", path: "/dashboard/admissoes", keywords: ["contratação", "onboarding", "novo"], icon: IdentificationCard },
  { id: "p-jobs", label: "Vagas", description: "Vagas abertas", path: "/dashboard/vagas", keywords: ["recrutamento", "selecionar", "job"], icon: Megaphone },
  { id: "p-candidates", label: "Banco de Talentos", description: "Candidatos cadastrados", path: "/dashboard/candidatos", keywords: ["candidato", "currículo", "cv", "talentos"], icon: AddressBook },
  { id: "p-recruiter", label: "Recrutador (IA)", description: "Agente de busca de candidatos", path: "/dashboard/recrutador", keywords: ["agente", "ia", "matching"], icon: Robot },
  { id: "p-analyst", label: "Analista (IA)", description: "Agente analista G&C", path: "/dashboard/analista", keywords: ["agente", "ia", "análise"], icon: Sparkle },
  { id: "p-journey", label: "Jornada", description: "Jornada de conhecimento", path: "/dashboard/jornada", keywords: ["onboarding", "trilha", "milestone"], icon: Trophy },
  { id: "p-badges", label: "Insígnias", description: "Catálogo de insígnias", path: "/dashboard/jornada/badges", keywords: ["badge", "conquista", "premiação"], icon: Trophy },
  { id: "p-reports", label: "Relatórios", description: "Relatórios gerenciais", path: "/dashboard/relatorios", keywords: ["report", "dashboard", "analytics"], icon: ChartLine },
  { id: "p-accounting", label: "Contabilidade", description: "Exports pro contador", path: "/dashboard/contabilidade", keywords: ["contábil", "imposto", "fiscal"], icon: Calculator },
  { id: "p-settings", label: "Configurações", description: "Ajustes do sistema", path: "/dashboard/configuracoes", keywords: ["preferências", "config", "settings"], icon: Gear },
];

interface Hit {
  type: "page" | "collaborator" | "candidate" | "job" | "store" | "position" | "team" | "benefit";
  id: string;
  label: string;
  description?: string;
  onSelect: () => void;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GlobalSearch({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { currentCompany } = useDashboard();
  const [query, setQuery] = useState("");
  const companyId = currentCompany?.id;

  // Reset query ao fechar
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const trimmedQuery = query.trim();
  const enabled = !!companyId && open && trimmedQuery.length >= 2;

  const { data: collaborators = [] } = useQuery({
    queryKey: ["search-collaborators", companyId, trimmedQuery],
    queryFn: async () => {
      const { data } = await supabase
        .from("collaborators")
        .select("id, name, cpf, position")
        .eq("company_id", companyId!)
        .ilike("name", `%${trimmedQuery}%`)
        .limit(8);
      return data ?? [];
    },
    enabled,
    staleTime: 1000 * 30,
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ["search-candidates", companyId, trimmedQuery],
    queryFn: async () => {
      const { data } = await supabase
        .from("candidates")
        .select("id, name, email")
        .eq("company_id", companyId!)
        .ilike("name", `%${trimmedQuery}%`)
        .limit(6);
      return data ?? [];
    },
    enabled,
    staleTime: 1000 * 30,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ["search-jobs", companyId, trimmedQuery],
    queryFn: async () => {
      const { data } = await supabase
        .from("job_openings")
        .select("id, title, status")
        .eq("company_id", companyId!)
        .ilike("title", `%${trimmedQuery}%`)
        .limit(6);
      return data ?? [];
    },
    enabled,
    staleTime: 1000 * 30,
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["search-stores", companyId, trimmedQuery],
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, store_name, cnpj")
        .eq("company_id", companyId!)
        .ilike("store_name", `%${trimmedQuery}%`)
        .limit(6);
      return data ?? [];
    },
    enabled,
    staleTime: 1000 * 60,
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["search-positions", companyId, trimmedQuery],
    queryFn: async () => {
      const { data } = await supabase
        .from("positions")
        .select("id, name, salary")
        .eq("company_id", companyId!)
        .ilike("name", `%${trimmedQuery}%`)
        .limit(6);
      return data ?? [];
    },
    enabled,
    staleTime: 1000 * 60,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["search-teams", companyId, trimmedQuery],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name")
        .eq("company_id", companyId!)
        .ilike("name", `%${trimmedQuery}%`)
        .limit(6);
      return data ?? [];
    },
    enabled,
    staleTime: 1000 * 60,
  });

  const { data: benefits = [] } = useQuery({
    queryKey: ["search-benefits", companyId, trimmedQuery],
    queryFn: async () => {
      const { data } = await supabase
        .from("benefits")
        .select("id, name")
        .eq("company_id", companyId!)
        .ilike("name", `%${trimmedQuery}%`)
        .limit(6);
      return data ?? [];
    },
    enabled,
    staleTime: 1000 * 60,
  });

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  // Páginas: ranqueamento simples por match no label/keywords. cmdk já filtra
  // pelo "value", mas fortalecemos aqui pra busca em pt-BR sem acentos.
  const pageHits: Hit[] = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return PAGES
      .filter((p) => {
        if (!q) return true;
        const haystack = [p.label, p.description ?? "", ...p.keywords].map(norm).join(" ");
        return haystack.includes(norm(q));
      })
      .map<Hit>((p) => ({
        type: "page",
        id: p.id,
        label: p.label,
        description: p.description,
        keywords: [p.label, ...(p.keywords ?? []), p.description ?? ""].join(" "),
        icon: p.icon,
        onSelect: () => go(p.path),
      }));
  }, [trimmedQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const collaboratorHits: Hit[] = collaborators.map((c) => ({
    type: "collaborator",
    id: c.id,
    label: c.name,
    description: c.position ?? "Colaborador",
    icon: Users,
    onSelect: () => go(`/dashboard/colaboradores?openId=${c.id}`),
  }));

  const candidateHits: Hit[] = candidates.map((c) => ({
    type: "candidate",
    id: c.id,
    label: c.name,
    description: c.email ?? "Candidato",
    icon: AddressBook,
    onSelect: () => go(`/dashboard/candidatos`),
  }));

  const jobHits: Hit[] = jobs.map((j) => ({
    type: "job",
    id: j.id,
    label: j.title,
    description: `Vaga · ${j.status}`,
    icon: Megaphone,
    onSelect: () => go(`/dashboard/vagas/${j.id}`),
  }));

  const storeHits: Hit[] = stores.map((s) => ({
    type: "store",
    id: s.id,
    label: s.store_name,
    description: s.cnpj ?? "Empresa",
    icon: Building2,
    onSelect: () => go(`/dashboard/empresas/${s.id}/calendario`),
  }));

  const positionHits: Hit[] = positions.map((p) => ({
    type: "position",
    id: p.id,
    label: p.name,
    description: p.salary > 0 ? `Cargo · R$ ${p.salary.toFixed(2)}` : "Cargo",
    icon: Briefcase,
    onSelect: () => go(`/dashboard/cargos`),
  }));

  const teamHits: Hit[] = teams.map((t) => ({
    type: "team",
    id: t.id,
    label: t.name,
    description: "Setor",
    icon: UsersThree,
    onSelect: () => go(`/dashboard/setores`),
  }));

  const benefitHits: Hit[] = benefits.map((b) => ({
    type: "benefit",
    id: b.id,
    label: b.name,
    description: "Benefício",
    icon: Gift,
    onSelect: () => go(`/dashboard/beneficios`),
  }));

  const totalHits =
    pageHits.length +
    collaboratorHits.length +
    candidateHits.length +
    jobHits.length +
    storeHits.length +
    positionHits.length +
    teamHits.length +
    benefitHits.length;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar páginas, colaboradores, vagas, empresas..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {totalHits === 0 && trimmedQuery.length >= 2 && (
          <CommandEmpty>Nada encontrado pra "{trimmedQuery}".</CommandEmpty>
        )}
        {totalHits === 0 && trimmedQuery.length < 2 && (
          <CommandEmpty>
            Digita pelo menos 2 caracteres pra buscar colaboradores, vagas, etc.
          </CommandEmpty>
        )}

        {pageHits.length > 0 && (
          <CommandGroup heading="Páginas">
            {pageHits.map((h) => (
              <CommandItem key={h.id} value={`page-${h.id}-${h.keywords}`} onSelect={h.onSelect}>
                <h.icon className="mr-2 h-4 w-4 opacity-70" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-medium truncate">{h.label}</span>
                  {h.description && (
                    <span className="text-xs opacity-70 truncate">{h.description}</span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {collaboratorHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Colaboradores">
              {collaboratorHits.map((h) => (
                <CommandItem key={h.id} value={`collab-${h.id}-${h.label}`} onSelect={h.onSelect}>
                  <h.icon className="mr-2 h-4 w-4 opacity-70" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium truncate">{h.label}</span>
                    {h.description && (
                      <span className="text-xs opacity-70 truncate">{h.description}</span>
                    )}
                  </div>
                  <span className="text-xs opacity-60 ml-2">Abrir →</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {candidateHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Candidatos">
              {candidateHits.map((h) => (
                <CommandItem key={h.id} value={`cand-${h.id}-${h.label}`} onSelect={h.onSelect}>
                  <h.icon className="mr-2 h-4 w-4 opacity-70" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium truncate">{h.label}</span>
                    {h.description && (
                      <span className="text-xs opacity-70 truncate">{h.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {jobHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Vagas">
              {jobHits.map((h) => (
                <CommandItem key={h.id} value={`job-${h.id}-${h.label}`} onSelect={h.onSelect}>
                  <h.icon className="mr-2 h-4 w-4 opacity-70" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium truncate">{h.label}</span>
                    {h.description && (
                      <span className="text-xs opacity-70 truncate">{h.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {storeHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Empresas">
              {storeHits.map((h) => (
                <CommandItem key={h.id} value={`store-${h.id}-${h.label}`} onSelect={h.onSelect}>
                  <h.icon className="mr-2 h-4 w-4 opacity-70" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium truncate">{h.label}</span>
                    {h.description && (
                      <span className="text-xs opacity-70 truncate">{h.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {positionHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Cargos">
              {positionHits.map((h) => (
                <CommandItem key={h.id} value={`pos-${h.id}-${h.label}`} onSelect={h.onSelect}>
                  <h.icon className="mr-2 h-4 w-4 opacity-70" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium truncate">{h.label}</span>
                    {h.description && (
                      <span className="text-xs opacity-70 truncate">{h.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {teamHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Setores">
              {teamHits.map((h) => (
                <CommandItem key={h.id} value={`team-${h.id}-${h.label}`} onSelect={h.onSelect}>
                  <h.icon className="mr-2 h-4 w-4 opacity-70" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium truncate">{h.label}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {benefitHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Benefícios">
              {benefitHits.map((h) => (
                <CommandItem key={h.id} value={`ben-${h.id}-${h.label}`} onSelect={h.onSelect}>
                  <h.icon className="mr-2 h-4 w-4 opacity-70" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium truncate">{h.label}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span>esc fechar</span>
        </div>
        <CommandShortcut>Ctrl+K</CommandShortcut>
      </div>
    </CommandDialog>
  );
}
