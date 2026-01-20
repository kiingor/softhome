import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMaster } from "@/contexts/MasterContext";
import { supabase } from "@/integrations/supabase/client";
import { 
  Building2, 
  LayoutDashboard, 
  LogOut, 
  Settings,
  Shield,
  CreditCard,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface MasterLayoutProps {
  children: ReactNode;
}

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/master' },
  { icon: Building2, label: 'Empresas', href: '/master/empresas' },
  { icon: CreditCard, label: 'Assinaturas', href: '/master/assinaturas' },
  { icon: Users, label: 'Admins', href: '/master/admins' },
  { icon: Settings, label: 'Configurações', href: '/master/config' },
];

export function MasterLayout({ children }: MasterLayoutProps) {
  const { userEmail } = useMaster();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  async function handleLogout() {
    await supabase.auth.signOut();
    toast({ title: 'Logout realizado com sucesso' });
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h1 className="font-bold text-foreground">Portal Master</h1>
              <p className="text-xs text-muted-foreground">RH360 Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                  isActive 
                    ? "bg-destructive/10 text-destructive font-medium" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="mb-3 px-4">
            <p className="text-sm text-muted-foreground truncate">{userEmail}</p>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}