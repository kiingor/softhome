// PostgREST/Supabase corta cada resposta em 1000 linhas (db-max-rows). Para
// telas que leem um mês inteiro de payroll_entries (~300 colabs × vários
// lançamentos passa de 1.000), buscar sem paginar fazia linhas sumirem — e,
// pior, de forma silenciosa. Este helper pagina via .range() até esgotar.
//
// Uso:
//   const rows = await fetchAllRows(() =>
//     supabase.from("payroll_entries").select("*").eq("month", m).eq("year", y),
//   );
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  build: () => {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: unknown }>;
  },
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}
