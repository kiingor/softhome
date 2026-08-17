import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSidebarPermissions } from "@/hooks/useSidebarPermissions";
import { supabase } from "@/integrations/supabase/client";
import {
  SignOut as LogOut, CircleNotch as Loader2, MagnifyingGlass, Star,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { menuCategories, type MenuItem } from "@/components/dashboard/menu";

const FAV_KEY = "dna.fav";

function lerFavoritos(): string[] {
  try {
    const cru = localStorage.getItem(FAV_KEY);
    return cru ? (JSON.parse(cru) as string[]) : [];
  } catch {
    return [];
  }
}

/** Item de navegação. A faixa laranja à esquerda é o único uso de cor de
 *  marca na sidebar — é o que marca "você está aqui". */
function ItemNav({
  item, ativo, favorito, onToggleFav,
}: {
  item: MenuItem;
  ativo: boolean;
  favorito: boolean;
  onToggleFav: (href: string) => void;
}) {
  return (
    <div className="group/item relative">
      <Link
        to={item.href}
        className={cn(
          "relative flex items-center gap-3 rounded-md py-2.5 pl-4 pr-9 text-sm transition-colors",
          ativo
            ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-[hsl(var(--sidebar-hover))] hover:text-sidebar-accent-foreground",
        )}
      >
        {ativo && (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-sidebar-primary"
          />
        )}
        <item.icon className="h-[18px] w-[18px] shrink-0" weight={ativo ? "fill" : "regular"} />
        <span className="truncate">{item.label}</span>
      </Link>

      <button
        type="button"
        aria-label={favorito ? `Desafixar ${item.label}` : `Fixar ${item.label} no topo`}
        onClick={() => onToggleFav(item.href)}
        className={cn(
          "absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded transition-opacity",
          "text-[hsl(var(--sidebar-faint))] hover:text-sidebar-primary",
          favorito ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover/item:opacity-100",
        )}
      >
        <Star className="h-3.5 w-3.5" weight={favorito ? "fill" : "regular"} />
      </button>
    </div>
  );
}

export default function DashboardSidebar() {
  const { canViewModule, isAdmin, isLoading } = useSidebarPermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [busca, setBusca] = useState("");
  const [favoritos, setFavoritos] = useState<string[]>(lerFavoritos);

  function alternarFavorito(href: string) {
    setFavoritos((atual) => {
      const proximo = atual.includes(href) ? atual.filter((h) => h !== href) : [...atual, href];
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(proximo));
      } catch {
        /* localStorage indisponível não pode derrubar a navegação */
      }
      return proximo;
    });
  }

  const estaAtivo = (href: string) =>
    location.pathname === href || (href !== "/dashboard" && location.pathname.startsWith(href));

  // Permissão primeiro, busca depois: o filtro de texto nunca revela um item
  // que o usuário não poderia ver.
  const categoriasVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return menuCategories
      .map((categoria) => ({
        ...categoria,
        items: categoria.items.filter((item) => {
          const permitido = item.module === null || isAdmin || canViewModule(item.module);
          if (!permitido) return false;
          return termo === "" || item.label.toLowerCase().includes(termo);
        }),
      }))
      .filter((categoria) => categoria.items.length > 0);
  }, [busca, isAdmin, canViewModule]);

  const itensFavoritos = useMemo(() => {
    if (busca.trim() !== "") return [];
    return categoriasVisiveis.flatMap((c) => c.items).filter((i) => favoritos.includes(i.href));
  }, [categoriasVisiveis, favoritos, busca]);

  async function handleLogout() {
    await supabase.auth.signOut();
    toast({ title: "Até logo!" });
    navigate("/login");
  }

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* marca */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
          <span className="text-[15px] font-extrabold leading-none text-sidebar-primary-foreground">D</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-extrabold leading-tight text-sidebar-accent-foreground">
            DNA Softcom
          </p>
          <p className="mono truncate text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--sidebar-faint))]">
            Gente &amp; Cultura
          </p>
        </div>
      </div>

      {/* busca no menu */}
      <div className="px-4 pb-3">
        <div className="relative">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--sidebar-faint))]" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar no menu..."
            aria-label="Buscar no menu"
            className={cn(
              "h-10 w-full rounded-md border border-sidebar-border bg-[hsl(var(--sidebar-hover))] pl-9 pr-3",
              "text-sm text-sidebar-accent-foreground placeholder:text-[hsl(var(--sidebar-faint))]",
              "outline-none transition-colors focus:border-sidebar-primary",
            )}
          />
        </div>
      </div>

      {/* navegação */}
      <nav className="scroll flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--sidebar-faint))]" />
          </div>
        ) : (
          <>
            {itensFavoritos.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--sidebar-faint))]">
                  Favoritos
                </p>
                <div className="space-y-0.5">
                  {itensFavoritos.map((item) => (
                    <ItemNav
                      key={`fav-${item.href}`}
                      item={item}
                      ativo={estaAtivo(item.href)}
                      favorito
                      onToggleFav={alternarFavorito}
                    />
                  ))}
                </div>
              </div>
            )}

            {categoriasVisiveis.map((categoria) => (
              <div key={categoria.label} className="mb-4">
                <p className="mb-1.5 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--sidebar-faint))]">
                  {categoria.label}
                </p>
                <div className="space-y-0.5">
                  {categoria.items.map((item) => (
                    <ItemNav
                      key={item.href}
                      item={item}
                      ativo={estaAtivo(item.href)}
                      favorito={favoritos.includes(item.href)}
                      onToggleFav={alternarFavorito}
                    />
                  ))}
                </div>
              </div>
            ))}

            {categoriasVisiveis.length === 0 && (
              <p className="px-4 py-6 text-sm text-[hsl(var(--sidebar-faint))]">
                Nada encontrado para “{busca}”.
              </p>
            )}
          </>
        )}
      </nav>

      {/* rodapé */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <button
          type="button"
          onClick={handleLogout}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-sm transition-colors",
            "text-sidebar-foreground hover:bg-[hsl(var(--sidebar-hover))] hover:text-sidebar-accent-foreground",
          )}
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sair
        </button>
        <p className="mono mt-2 px-4 pb-1 text-[10px] leading-relaxed text-[hsl(var(--sidebar-faint))]">
          Toque na estrela para fixar no topo.
        </p>
      </div>
    </aside>
  );
}
