import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface MasterContextType {
  isMasterAdmin: boolean;
  isLoading: boolean;
  userId: string | null;
  userEmail: string | null;
}

const MasterContext = createContext<MasterContextType>({
  isMasterAdmin: false,
  isLoading: true,
  userId: null,
  userEmail: null,
});

export function MasterProvider({ children }: { children: ReactNode }) {
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    checkMasterAdmin();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkMasterAdmin();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkMasterAdmin() {
    setIsLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setIsMasterAdmin(false);
        setUserId(null);
        setUserEmail(null);
        navigate('/admin-meurh');
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email || null);

      // Check if user is a master admin
      const { data: masterAdmin, error } = await supabase
        .from('master_admins')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking master admin:', error);
        setIsMasterAdmin(false);
      } else {
        setIsMasterAdmin(!!masterAdmin);
      }
    } catch (error) {
      console.error('Error in master admin check:', error);
      setIsMasterAdmin(false);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <MasterContext.Provider value={{ isMasterAdmin, isLoading, userId, userEmail }}>
      {children}
    </MasterContext.Provider>
  );
}

export function useMaster() {
  return useContext(MasterContext);
}