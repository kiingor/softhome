import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { usePortal } from "@/contexts/PortalContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { House as Home, FileText, Gift, Download, SignOut as LogOut, List as Menu, TreePalm as Palmtree, ClipboardText as ClipboardCheck } from "@phosphor-icons/react";
import { useState } from "react";

interface PortalLayoutProps {
  children: ReactNode;
}

const navItems = [
  { title: "Início", url: "/colaborador", icon: Home },
  { title: "Meu Extrato", url: "/colaborador/extrato", icon: FileText },
  { title: "Benefícios", url: "/colaborador/beneficios", icon: Gift },
  { title: "Contracheques", url: "/colaborador/contracheques", icon: Download },
  { title: "Férias", url: "/colaborador/ferias", icon: Palmtree },
  { title: "Meus Exames", url: "/colaborador/exames", icon: ClipboardCheck },
];

const PortalLayout = ({ children }: PortalLayoutProps) => {
  const { collaborator, signOut, isLoading } = usePortal();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/portal/login");
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  const isActive = (url: string) => {
    if (url === "/colaborador") {
      return location.pathname === "/colaborador";
    }
    return location.pathname.startsWith(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Mobile: User Avatar on left | Desktop: Logo */}
            <div className="flex items-center gap-3">
              {/* Desktop Logo */}
              <Link to="/colaborador" className="hidden md:flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg gradient-hero flex items-center justify-center">
                  <span className="text-primary-foreground font-bold">R</span>
                </div>
                <span className="font-bold text-foreground">
                  Portal do Colaborador
                </span>
              </Link>

              {/* Mobile: User Avatar */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Avatar className="w-9 h-9">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {collaborator?.name ? getInitials(collaborator.name) : "?"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{collaborator?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {collaborator?.email || collaborator?.position || ""}
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.url}
                  to={item.url}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.url)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.title}
                </Link>
              ))}
            </nav>

            {/* Desktop: User Menu | Mobile: Hamburger */}
            <div className="flex items-center gap-2">
              {/* Desktop User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="hidden md:flex">
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {collaborator?.name ? getInitials(collaborator.name) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium max-w-[120px] truncate">
                      {collaborator?.name || "Colaborador"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{collaborator?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {collaborator?.email || collaborator?.position || ""}
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile Hamburger Menu */}
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="icon">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72">
                  <SheetHeader className="border-b border-border pb-4 mb-4">
                    <SheetTitle className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg gradient-hero flex items-center justify-center">
                        <span className="text-primary-foreground font-bold">R</span>
                      </div>
                      <span className="font-bold text-foreground">
                        Portal do Colaborador
                      </span>
                    </SheetTitle>
                  </SheetHeader>

                  <nav className="flex flex-col gap-1">
                    {navItems.map((item) => (
                      <Link
                        key={item.url}
                        to={item.url}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                          isActive(item.url)
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        <item.icon className="w-5 h-5" />
                        {item.title}
                      </Link>
                    ))}
                  </nav>

                  <div className="absolute bottom-6 left-6 right-6">
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleSignOut();
                      }}
                    >
                      <LogOut className="w-4 h-4" />
                      Sair
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
};

export default PortalLayout;
