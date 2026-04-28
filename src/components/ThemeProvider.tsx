import { useEffect } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.remove("theme-loading");
  }, []);

  return <>{children}</>;
}
