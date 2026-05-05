/**
 * Gera o arquivo modelo de importação de colaboradores.
 * Output: public/modelo-importacao-colaboradores.xlsx
 *
 * Roda 1x e o output é commitado no repo (servido pelo Vite a partir de /).
 */
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const outputDir = path.join(__dirname, "..", "public");
const outputFile = path.join(outputDir, "modelo-importacao-colaboradores.xlsx");

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Cabeçalho exato — o parser reconhece estas chaves.
const HEADERS = [
  "Nome*",
  "CPF*",
  "RG",
  "Email",
  "Telefone",
  "Data de nascimento",
  "Endereço",
  "Bairro",
  "Cidade",
  "UF",
  "CEP",
  "Data de admissão",
  "Regime",
  "Cargo",
  "Setor",
  "Loja onde trabalha",
  "Loja contratante",
  "PCD",
  "Aprendiz",
  "Avulso",
  "Observações",
];

const EXAMPLE_ROW = {
  "Nome*": "João da Silva",
  "CPF*": "123.456.789-00",
  RG: "12.345.678-9",
  Email: "joao.silva@empresa.com.br",
  Telefone: "(11) 98765-4321",
  "Data de nascimento": "1990-05-15",
  "Endereço": "Rua das Flores, 123",
  Bairro: "Centro",
  Cidade: "São Paulo",
  UF: "SP",
  CEP: "01310-100",
  "Data de admissão": "2024-01-15",
  Regime: "clt",
  Cargo: "Analista de Software",
  Setor: "Administrativo",
  "Loja onde trabalha": "Softcom Matriz",
  "Loja contratante": "Softcom Matriz",
  PCD: "não",
  Aprendiz: "não",
  Avulso: "não",
  "Observações": "Substituir pelo dados reais — esta linha é só exemplo.",
};

// Linha vazia visual pro usuário começar a preencher (mantém só os headers — não inserimos dummy rows)
const colaboradoresRows = [EXAMPLE_ROW];

const wsCol = XLSX.utils.json_to_sheet(colaboradoresRows, { header: HEADERS });

// Largura de coluna pra ficar legível
wsCol["!cols"] = HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 18) }));

// Sheet "Instruções"
const INSTRUCTIONS = [
  ["Importação de colaboradores — Instruções"],
  [],
  ["1. Preencha a aba 'Colaboradores' a partir da linha 3 (a linha 2 é exemplo)."],
  ["2. Apenas Nome e CPF são obrigatórios. O resto é opcional."],
  ["3. Datas no formato AAAA-MM-DD (ex: 2024-03-15)."],
  ["4. Regime: 'clt', 'pj' ou 'estagiario'. Se vazio, vira 'clt'."],
  ["5. Setor / Cargo / Loja: o sistema busca pelo nome. Se não achar, importa sem."],
  ["6. PCD / Aprendiz / Avulso: 'sim' ou 'não' (vazio = 'não')."],
  ["7. UF: sigla de 2 letras (SP, RJ, MG, etc)."],
  ["8. Email: necessário pra criar login. Senha temporária = 4 primeiros dígitos do CPF + @SH."],
  [],
  ["Campo / Tipo / Notas"],
  ["Nome* / texto / Obrigatório"],
  ["CPF* / texto / Obrigatório, validado"],
  ["RG / texto /"],
  ["Email / texto / Cria auth user se preenchido"],
  ["Telefone / texto / "],
  ["Data de nascimento / data / AAAA-MM-DD"],
  ["Endereço / texto / "],
  ["Bairro / texto / "],
  ["Cidade / texto / "],
  ["UF / texto(2) / Sigla brasileira"],
  ["CEP / texto / "],
  ["Data de admissão / data / AAAA-MM-DD — gera períodos de férias"],
  ["Regime / texto / clt / pj / estagiario"],
  ["Cargo / texto / Match por nome em Cargos"],
  ["Setor / texto / Match por nome em Setores"],
  ["Loja onde trabalha / texto / Match por nome em Empresas"],
  ["Loja contratante / texto / Match por nome em Empresas"],
  ["PCD / sim/não / "],
  ["Aprendiz / sim/não / "],
  ["Avulso / sim/não / Trabalhador temporário"],
  ["Observações / texto / Notas internas"],
];

const wsInstr = XLSX.utils.aoa_to_sheet(INSTRUCTIONS);
wsInstr["!cols"] = [{ wch: 90 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsCol, "Colaboradores");
XLSX.utils.book_append_sheet(wb, wsInstr, "Instruções");

XLSX.writeFile(wb, outputFile);
console.log(`Template gerado em: ${outputFile}`);
