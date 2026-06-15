import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "admin_gc" | "gestor_gc" | "gestor" | "contador" | "colaborador";

interface Company {
  id: string;
  company_name: string;
}

interface Store {
  id: string;
  store_name: string;
  store_code: string | null;
  company_id: string;
}

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  company_id: string | null;
  store_id: string | null;
}

interface DashboardContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  companies: Company[];
  stores: Store[];
  currentCompany: Company | null;
  currentStore: Store | null;
  setCurrentCompany: (company: Company | null) => void;
  setCurrentStore: (store: Store | null) => void;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
};

interface DashboardProviderProps {
  children: ReactNode;
}

export const DashboardProvider: React.FC<DashboardProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            loadUserData(session.user.id);
          }, 0);
        } else {
          resetState();
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserData(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const resetState = () => {
    setProfile(null);
    setRoles([]);
    setCompanies([]);
    setStores([]);
    setCurrentCompany(null);
    setCurrentStore(null);
    setIsLoading(false);
  };

  const loadUserData = async (userId: string) => {
    try {
      // Rastreia se já resolvemos uma company atual nesta carga. Não dá pra
      // confiar no state `currentCompany` aqui (closure fica preso no valor
      // inicial null), então usamos uma flag local.
      let companyResolved = false;

      // Load profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData);
      }

      // Load roles using the security definer function
      const { data: rolesData } = await supabase.rpc("get_user_roles", {
        _user_id: userId,
      });

      if (rolesData) {
        setRoles(rolesData as AppRole[]);
      }

      // Load companies the user has access to
      if (profileData?.company_id) {
        const { data: companyData } = await supabase
          .from("companies")
          .select("*")
          .eq("id", profileData.company_id);

        if (companyData && companyData.length > 0) {
          setCompanies(companyData);
          setCurrentCompany(companyData[0]);
          companyResolved = true;

          // Load stores for the company
          const { data: storesData } = await supabase
            .from("stores")
            .select("*")
            .eq("company_id", companyData[0].id);

          if (storesData) {
            setStores(storesData);
            // If user has a specific store, set it as current
            if (profileData.store_id) {
              const userStore = storesData.find(s => s.id === profileData.store_id);
              if (userStore) {
                setCurrentStore(userStore);
              }
            }
          }
        }
      }

      // If user is company owner (admin) but has no role yet, they're still admin
      const { data: ownedCompanies } = await supabase
        .from("companies")
        .select("*")
        .eq("owner_id", userId);

      if (ownedCompanies && ownedCompanies.length > 0) {
        // Add companies user owns
        setCompanies(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const newCompanies = ownedCompanies.filter(c => !existingIds.has(c.id));
          return [...prev, ...newCompanies];
        });

        if (!companyResolved) {
          setCurrentCompany(ownedCompanies[0]);
          companyResolved = true;
        }

        // If owner, implicitly has admin role even if not in user_roles table yet
        if (!rolesData || rolesData.length === 0) {
          setRoles(["admin_gc"]);
        }
      }

      // admin_gc é cross-company por design (não fica preso a CNPJ).
      // Se o user tem role admin_gc mas não tem profile.company_id nem é
      // owner de nenhuma company, ainda assim precisa de currentCompany
      // pra que os hooks que dependem de companyId (useSidebarPermissions,
      // usePermissions, useMultiplePermissions, queries da UI) funcionem.
      // Carregamos TODAS as companies visíveis pra ele (a policy admin_gc
      // já libera SELECT em companies) e usamos a primeira como default.
      const rolesArr = (rolesData ?? []) as AppRole[];
      if (rolesArr.includes("admin_gc")) {
        const { data: allCompanies } = await supabase
          .from("companies")
          .select("*")
          .order("company_name", { ascending: true });

        if (allCompanies && allCompanies.length > 0) {
          setCompanies(prev => {
            const existingIds = new Set(prev.map(c => c.id));
            const newCompanies = allCompanies.filter(c => !existingIds.has(c.id));
            return [...prev, ...newCompanies];
          });
          // Só sobrescreve currentCompany se ainda não tinha um setado
          setCurrentCompany(prev => prev ?? allCompanies[0]);
          companyResolved = true;
        }
      }

      // Fallback pra papéis que NÃO são owner nem admin_gc (gestor_gc,
      // contador, colaborador) e que não têm profile.company_id setado.
      // Sem isso, currentCompany fica null e TODOS os hooks de permissão
      // (useSidebarPermissions, usePermissions, useMultiplePermissions) e
      // queries de dados ficam desabilitados (enabled: !!currentCompany?.id)
      // — o usuário loga e não vê nada, mesmo tendo permissões salvas.
      //
      // O acesso desses usuários nasce de company_users (vínculo) e/ou
      // user_permissions, ambos legíveis por RLS (own rows). Derivamos a
      // company atual dessas fontes. Tentamos ler o nome em companies (a
      // policy de membro/owner libera); se RLS bloquear (órfão sem profile),
      // ainda assim setamos a company com o id pra destravar a navegação.
      if (!companyResolved) {
        const { data: membership } = await supabase
          .from("company_users")
          .select("company_id")
          .eq("user_id", userId)
          .eq("is_active", true);

        let candidateIds = (membership ?? [])
          .map((m) => m.company_id)
          .filter(Boolean) as string[];

        if (candidateIds.length === 0) {
          const { data: perms } = await supabase
            .from("user_permissions")
            .select("company_id")
            .eq("user_id", userId);
          candidateIds = [...new Set((perms ?? []).map((p) => p.company_id).filter(Boolean))] as string[];
        }

        if (candidateIds.length > 0) {
          const { data: fallbackCompanies } = await supabase
            .from("companies")
            .select("*")
            .in("id", candidateIds);

          // Usa as companies legíveis; se nenhuma vier (RLS), constrói uma
          // mínima a partir do id derivado pra não travar a navegação.
          const resolved = (fallbackCompanies && fallbackCompanies.length > 0)
            ? fallbackCompanies
            : candidateIds.map((id) => ({ id, company_name: "" } as Company));

          setCompanies((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            return [...prev, ...resolved.filter((c) => !existingIds.has(c.id))];
          });
          setCurrentCompany((prev) => prev ?? resolved[0]);
          companyResolved = true;
        }
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const hasRole = (role: AppRole): boolean => {
    return roles.includes(role);
  };

  const hasAnyRole = (checkRoles: AppRole[]): boolean => {
    return checkRoles.some(role => roles.includes(role));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    resetState();
  };

  return (
    <DashboardContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        companies,
        stores,
        currentCompany,
        currentStore,
        setCurrentCompany,
        setCurrentStore,
        hasRole,
        hasAnyRole,
        isLoading,
        signOut,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};
