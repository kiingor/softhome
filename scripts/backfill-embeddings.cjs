// One-off: re-embedda candidate_embeddings com o novo modelo do iarouter
// (gemini-embedding-001 @ 1536), substituindo os vetores antigos da OpenAI
// (text-embedding-3-small) que ficaram num espaço vetorial incompatível.
//
// Idempotente: rodar de novo só re-escreve os mesmos vetores. Re-embedda a
// partir da coluna `content` (o cv_summary que originou o embedding).
//
// Uso (PowerShell):
//   $env:IAROUTER_KEY="sk-..."; node scripts/backfill-embeddings.cjs
// Requer no ambiente: SUPABASE_ACCESS_TOKEN (Management API), IAROUTER_KEY.

const PROJECT_REF = "mxqbawfazgvdnyhrarlz";
const IAROUTER_URL = "https://iarouter.softcomia.com/v1/embeddings";
const EMBED_MODEL = "gemini/gemini-embedding-001";
const EMBED_MODEL_LABEL = "gemini-embedding-001";
const EMBED_DIMENSIONS = 1536;
const CONCURRENCY = 4;

const sbToken = process.env.SUPABASE_ACCESS_TOKEN;
const iarouterKey = process.env.IAROUTER_KEY;
if (!sbToken) { console.error("falta SUPABASE_ACCESS_TOKEN"); process.exit(1); }
if (!iarouterKey) { console.error("falta IAROUTER_KEY"); process.exit(1); }

async function runSql(query) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sbToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await r.text();
  if (!r.ok) throw new Error(`mgmt ${r.status}: ${text}`);
  return text ? JSON.parse(text) : [];
}

async function embed(input) {
  const r = await fetch(IAROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${iarouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input, dimensions: EMBED_DIMENSIONS }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`iarouter ${r.status}: ${text.slice(0, 200)}`);
  const j = JSON.parse(text);
  let v = j?.data?.[0]?.embedding;
  // Router às vezes ignora `dimensions` e devolve 3072; gemini-embedding-001 é
  // MRL, então truncar pros primeiros 1536 é um embedding válido e consistente.
  if (Array.isArray(v) && v.length > EMBED_DIMENSIONS) v = v.slice(0, EMBED_DIMENSIONS);
  if (!Array.isArray(v) || v.length !== EMBED_DIMENSIONS) {
    throw new Error(`shape inesperado len=${v && v.length}`);
  }
  return v;
}

function sqlEscape(s) { return String(s).replace(/'/g, "''"); }

async function updateRow(id, vector) {
  const lit = "[" + vector.join(",") + "]";
  const q =
    `UPDATE public.candidate_embeddings ` +
    `SET embedding = '${lit}'::vector(${EMBED_DIMENSIONS}), ` +
    `model = '${EMBED_MODEL_LABEL}', updated_at = now() ` +
    `WHERE id = '${sqlEscape(id)}';`;
  await runSql(q);
}

(async () => {
  console.log("lendo rows…");
  const rowsRaw = await runSql(
    "select id, content from public.candidate_embeddings order by created_at;",
  );
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [rowsRaw];
  console.log(`${rows.length} embeddings pra re-gerar`);

  let ok = 0, fail = 0;
  const failures = [];
  let idx = 0;

  async function worker(wid) {
    while (idx < rows.length) {
      const i = idx++;
      const row = rows[i];
      try {
        if (!row.content || !row.content.trim()) {
          throw new Error("content vazio");
        }
        const v = await embed(row.content);
        await updateRow(row.id, v);
        ok++;
        if (ok % 10 === 0) console.log(`  ${ok}/${rows.length} ok`);
      } catch (e) {
        fail++;
        failures.push({ id: row.id, err: e.message });
        console.error(`  FALHA ${row.id}: ${e.message}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, w) => worker(w)),
  );

  console.log(`\nDONE: ${ok} ok, ${fail} falhas`);
  if (failures.length) console.log(JSON.stringify(failures, null, 2));
  process.exit(fail > 0 ? 1 : 0);
})();
