import { useEffect } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Antes isto era um stub que só removia a classe de loading — a classe `.dark`
 * nunca chegava a ser aplicada, então os tokens de tema escuro existiam mas
 * ficavam inalcançáveis. O handoff exige alternância persistida, então aqui
 * montamos o provider de verdade (o `next-themes` já era dependência do
 * projeto, usado pelo toaster).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.remove("theme-loading");
  }, []);

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="dna.theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
