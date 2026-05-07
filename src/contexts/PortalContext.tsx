import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin_gc" | "gestor_gc" | "gestor" | "contador" | "colaborador";

interface Collaborator {
  id: string;
  name: string;
  email: string | null;
  cpf: string;
  position: string | null;
  company_id: string;
  store_id: string | null;
}

interface PortalContextType {
  user: User | null;
  session: Session | null;
  collaborator: Collaborator | null;
  roles: AppRole[];
  isLoading: boolean;
  isCollaborator: boolean;
  signOut: () => Promise<void>;
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

export const usePortal = () => {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error("usePortal must be used within a PortalProvider");
  }
  return context;
};

interface PortalProviderProps {
  children: ReactNode;
}

export const PortalProvider: React.FC<PortalProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [collaborator, setCollaborator] = useState<Collaborator | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
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
    setCollaborator(null);
    setRoles([]);
    setIsLoading(false);
  };

  const loadUserData = async (userId: string) => {
    try {
      // Load roles
      const { data: rolesData } = await supabase.rpc("get_user_roles", {
        _user_id: userId,
      });

      if (rolesData) {
        setRoles(rolesData as AppRole[]);
      }

      // Load collaborator data linked to this user
      const { data: collabData } = await supabase
        .from("collaborators")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (collabData) {
        setCollaborator(collabData);
      }
    } catch (error) {
      console.error("Error loading portal data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (error) {
      console.error("Sign out error:", error);
    }
    resetState();
  };

  const isCollaborator = roles.includes("colaborador");

  return (
    <PortalContext.Provider
      value={{
        user,
        session,
        collaborator,
        roles,
        isLoading,
        isCollaborator,
        signOut,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
};
