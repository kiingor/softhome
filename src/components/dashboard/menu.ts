import {
  SquaresFour as LayoutDashboard, Users, Buildings as Building2, Briefcase, Gift, FileText,
  ChartBar as BarChart3, Gear as Settings, TreeStructure as FolderTree,
  CurrencyDollar as DollarSign, Calendar, ClipboardText as ClipboardCheck, Trophy, UserPlus,
  IdentificationCard, Robot, Confetti, ChatCircleText,
} from "@phosphor-icons/react";
import type { ModuleType } from "@/hooks/usePermissions";

export interface MenuItem {
  icon: React.ComponentType<{ className?: string; weight?: "regular" | "fill" | "bold" }>;
  label: string;
  href: string;
  module: ModuleType | null; // null = sempre visível (ex.: Visão Geral)
}

export interface MenuCategory {
  label: string;
  items: MenuItem[];
}

/** Fonte única do menu: a sidebar desenha e o header deriva daqui o
 *  breadcrumb e o título da página. Assim os dois nunca divergem. */
export const menuCategories: MenuCategory[] = [
  {
    label: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Visão Geral", href: "/dashboard", module: null },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { icon: Users, label: "Colaboradores", href: "/dashboard/colaboradores", module: "colaboradores" },
      { icon: FolderTree, label: "Setores", href: "/dashboard/setores", module: "setores" },
      { icon: Briefcase, label: "Cargos", href: "/dashboard/cargos", module: "cargos" },
      { icon: Building2, label: "Empresas", href: "/dashboard/empresas", module: "empresas" },
      { icon: Gift, label: "Benefícios", href: "/dashboard/beneficios", module: "beneficios" },
    ],
  },
  {
    label: "Recrutamento",
    items: [
      { icon: Briefcase, label: "Vagas", href: "/dashboard/vagas", module: "vagas" },
      { icon: IdentificationCard, label: "Banco de Talentos", href: "/dashboard/candidatos", module: "candidatos" },
      { icon: Robot, label: "Recrutador (IA)", href: "/dashboard/recrutador", module: "recrutador" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { icon: UserPlus, label: "Admissões", href: "/dashboard/admissoes", module: "admissoes" },
      { icon: Trophy, label: "Jornada", href: "/dashboard/jornada", module: "jornada" },
      { icon: ChatCircleText, label: "Feedback Colaborador", href: "/dashboard/feedback", module: "feedback" },
      { icon: DollarSign, label: "Folha", href: "/dashboard/folha", module: "folha" },
      { icon: Confetti, label: "13º Salário", href: "/dashboard/decimo-terceiro", module: "decimo_terceiro" },
      { icon: Calendar, label: "Férias", href: "/dashboard/ferias", module: "ferias" },
      { icon: ClipboardCheck, label: "Exames", href: "/dashboard/exames", module: "exames" },
      { icon: BarChart3, label: "Relatórios", href: "/dashboard/relatorios", module: "relatorios" },
      { icon: FileText, label: "Contabilidade", href: "/dashboard/contabilidade", module: "contabilidade" },
      { icon: Robot, label: "Analista (IA)", href: "/dashboard/analista", module: "relatorios" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { icon: Settings, label: "Configurações", href: "/dashboard/configuracoes", module: null },
    ],
  },
];

/**
 * Resolve o par (grupo, título) para o cabeçalho a partir da rota atual.
 * Casa pelo href mais longo, para que /dashboard/folha/2026-08 continue
 * exibindo "Folha" em vez de cair na Visão Geral.
 */
export function resolverCabecalho(pathname: string): { grupo: string; titulo: string } {
  let melhor: { grupo: string; titulo: string; tamanho: number } | null = null;

  for (const categoria of menuCategories) {
    for (const item of categoria.items) {
      const casa = pathname === item.href || pathname.startsWith(item.href + "/");
      if (casa && (melhor === null || item.href.length > melhor.tamanho)) {
        melhor = { grupo: categoria.label, titulo: item.label, tamanho: item.href.length };
      }
    }
  }

  return melhor
    ? { grupo: melhor.grupo, titulo: melhor.titulo }
    : { grupo: "DNA Softcom", titulo: "Gente & Cultura" };
}
