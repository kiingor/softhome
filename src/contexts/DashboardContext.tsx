import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "rh" | "gestor" | "contador" | "colaborador";

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

        if (!currentCompany) {
          setCurrentCompany(ownedCompanies[0]);
        }

        // If owner, implicitly has admin role even if not in user_roles table yet
        if (!rolesData || rolesData.length === 0) {
          setRoles(["admin"]);
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
