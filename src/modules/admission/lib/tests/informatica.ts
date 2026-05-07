import type { TestDefinition } from "./types";

// Provas de Informática — mistura de múltipla escolha (auto-corrigida) e
// 3 perguntas abertas (avaliadas pelo RH depois).
export const informaticaTest: TestDefinition = {
  slug: "informatica",
  scoring: "open_review",
  estimatedMinutes: 25,
  intro:
    "Avaliação de informática básica e Windows. São 21 perguntas — a maioria " +
    "múltipla escolha, e 3 são de resposta aberta (você escreve com suas " +
    "palavras). Boa sorte! 💻",
  questions: [
    {
      id: "q1",
      type: "single_choice",
      prompt:
        "Sobre o arquivo informatica.doc, podemos afirmar:",
      options: [
        { key: "A", label: "O nome do arquivo é doc" },
        { key: "B", label: "A extensão do arquivo é informatica" },
        { key: "C", label: "doc indica que o arquivo é uma fotografia" },
        { key: "D", label: "A extensão é doc" },
      ],
      correctKey: "D",
    },
    {
      id: "q2",
      type: "single_choice",
      prompt:
        "Os computadores atuais ainda funcionam com sistema binário. A unidade básica nesse sistema é:",
      options: [
        { key: "A", label: "byte" },
        { key: "B", label: "bit" },
        { key: "C", label: "0" },
        { key: "D", label: "1" },
      ],
      correctKey: "B",
    },
    {
      id: "q3",
      type: "open_text",
      prompt:
        "Como podemos realizar o compartilhamento de pastas no Windows 10 para todos os usuários?",
      suggestedAnswer:
        'Clicar com o botão direito na pasta → Propriedades → Compartilhamento → Compartilhar → escolher "Todos (Everyone)" e confirmar.',
    },
    {
      id: "q4",
      type: "single_choice",
      prompt: "Qual dos arquivos é uma imagem (foto)?",
      options: [
        { key: "A", label: "contrato.doc" },
        { key: "B", label: "k35.png" },
        { key: "C", label: "foto.ppt" },
        { key: "D", label: "minhafoto.img" },
        { key: "E", label: "dcmi.fot" },
      ],
      correctKey: "B",
    },
    {
      id: "q5",
      type: "open_text",
      prompt: "Como podemos descobrir o endereço IP de um computador na rede local no Windows?",
      suggestedAnswer: "Abrir o Prompt de Comando (cmd) e digitar ipconfig.",
    },
    {
      id: "q6",
      type: "single_choice",
      prompt: "Qual dos nomes tem menos chances de dar erro ao ser enviado pela Internet?",
      options: [
        { key: "A", label: "curso de informática.jpg" },
        { key: "B", label: "curso_de_informatica.jpg" },
        { key: "C", label: "curso de informática.jpg" },
        { key: "D", label: "curso-de-informática.jpg" },
        { key: "E", label: "cursodeinformática.jpg" },
      ],
      correctKey: "B",
    },
    {
      id: "q7",
      type: "single_choice",
      prompt: "Zipar significa:",
      options: [
        { key: "A", label: "Compactar em um único arquivo, um ou mais outros arquivos" },
        { key: "B", label: "Proteger um arquivo de vídeo" },
        { key: "C", label: "Renomear um arquivo para extensão .zip" },
        { key: "D", label: "Compactar o arquivo para que outras pessoas não o acessem" },
        { key: "E", label: "Proteger um arquivo de som" },
      ],
      correctKey: "A",
    },
    {
      id: "q8",
      type: "single_choice",
      prompt: "Sobre a CPU, podemos afirmar:",
      options: [
        { key: "A", label: "É unidade de entrada" },
        { key: "B", label: "É unidade de processamento" },
        { key: "C", label: "É unidade de saída" },
        { key: "D", label: "É unidade de entrada/saída" },
        { key: "E", label: "Sigla de Computer Public User" },
      ],
      correctKey: "B",
    },
    {
      id: "q9",
      type: "single_choice",
      prompt: "O hardware representa:",
      options: [
        { key: "A", label: "O sistema operacional do computador" },
        { key: "B", label: "Os programas aplicativos, como Word e Excel" },
        { key: "C", label: "Significa informática em inglês" },
        { key: "D", label: "Na informática é o termo técnico para aplicativos" },
        { key: "E", label: "Nenhuma das alternativas anteriores" },
      ],
      correctKey: "E",
    },
    {
      id: "q10",
      type: "single_choice",
      prompt: "Sobre tipos de arquivos, assinale a alternativa correta.",
      options: [
        { key: "A", label: "doc – arquivo de imagem bitmap ou documento de texto" },
        { key: "B", label: "jpg – arquivo de imagem bitmap ou documento de texto" },
        { key: "C", label: "ppt – arquivo de pasta de planilha técnica" },
        { key: "D", label: "exe – arquivo de programa" },
        { key: "E", label: "com – arquivo de comércio" },
      ],
      correctKey: "D",
    },
    {
      id: "q11",
      type: "single_choice",
      prompt: "Para criar e manipular pastas usamos o:",
      options: [
        { key: "A", label: "Paint" },
        { key: "B", label: "Bloco de Notas" },
        { key: "C", label: "Windows Explorer" },
        { key: "D", label: "Paint mesmo fora dos cursos de informática" },
        { key: "E", label: "Internet Explorer" },
      ],
      correctKey: "C",
    },
    {
      id: "q12",
      type: "single_choice",
      prompt: "Sobre pastas, podemos afirmar:",
      options: [
        { key: "A", label: "Cada pasta contém um arquivo de dados" },
        { key: "B", label: "Uma pasta pode conter vários arquivos" },
        { key: "C", label: "Não é possível criar uma pasta dentro de outra pasta" },
        { key: "D", label: "Pasta e diretório são coisas distintas" },
        { key: "E", label: "Pasta e arquivo são a mesma coisa" },
      ],
      correctKey: "B",
    },
    {
      id: "q13",
      type: "single_choice",
      prompt: "Na informática usamos o termo software para nos referirmos a:",
      options: [
        { key: "A", label: "Sistemas operacionais apenas" },
        { key: "B", label: "Aplicativos apenas" },
        { key: "C", label: "Sistemas operacionais e aplicativos" },
        { key: "D", label: "Componentes físicos do computador" },
        { key: "E", label: "Pacote Office para escritórios" },
      ],
      correctKey: "C",
    },
    {
      id: "q14",
      type: "open_text",
      prompt: "Como fazemos para descobrir o nome do computador no Windows?",
      suggestedAnswer:
        "Clicar com o botão direito em Este Computador → Propriedades → verificar Nome do computador.",
    },
    {
      id: "q15",
      type: "single_choice",
      prompt: "Sobre a tecla Print Screen (PrtScr), é correto afirmar:",
      options: [
        { key: "A", label: "Serve para imprimir um texto com a impressora" },
        { key: "B", label: "Imprime texto ou imagem com a impressora" },
        { key: "C", label: "Salva o conteúdo da tela do computador na memória" },
        { key: "D", label: "Imprime a tela na impressora" },
        { key: "E", label: "Não tem nenhuma função" },
      ],
      correctKey: "C",
    },
    {
      id: "q16",
      type: "single_choice",
      prompt: "A melhor correspondência entre aplicativo e aplicação é:",
      options: [
        { key: "A", label: "CorelDRAW para fazer planilhas de cálculos" },
        { key: "B", label: "Word para editar ilustrações vetoriais" },
        { key: "C", label: "Photoshop para editar documentos de textos" },
        { key: "D", label: "Bloco de Notas para arquivos de HTML" },
        { key: "E", label: "Word para editar bitmaps" },
      ],
      correctKey: "D",
    },
    {
      id: "q17",
      type: "single_choice",
      prompt: "Na Informática, o que são dados?",
      options: [
        { key: "A", label: "Um elemento do hardware" },
        { key: "B", label: "Nome genérico para os softwares" },
        { key: "C", label: "Elementos que serão transformados em informação" },
        { key: "D", label: "Bytes com 6 bits, em analogia com dados de jogos" },
        { key: "E", label: "São os softwares básicos" },
      ],
      correctKey: "C",
    },
    {
      id: "q18",
      type: "single_choice",
      prompt: "O que é um arquivo .APK?",
      options: [
        { key: "A", label: "Programa de computador ou hardware" },
        { key: "B", label: "Um recurso do sistema operacional Windows" },
        { key: "C", label: "Programa para smartphone Android" },
        { key: "D", label: "Um tipo de vírus que aplica golpe" },
        { key: "E", label: "Máquina que aplica funções informatizadas" },
      ],
      correctKey: "C",
    },
    {
      id: "q19",
      type: "single_choice",
      prompt: "São elementos de uma tabela de um banco de dados:",
      options: [
        { key: "A", label: "registros e campos" },
        { key: "B", label: "chaves e formulários" },
        { key: "C", label: "índices e formulários" },
        { key: "D", label: "registros e formulários" },
        { key: "E", label: "formulários e campos" },
      ],
      correctKey: "A",
    },
    {
      id: "q20",
      type: "single_choice",
      prompt: "Qual dos periféricos abaixo é de entrada de dados?",
      options: [
        { key: "A", label: "Datashow" },
        { key: "B", label: "Caixas de som" },
        { key: "C", label: "Impressora" },
        { key: "D", label: "Gabinete" },
        { key: "E", label: "Nenhuma das alternativas anteriores" },
      ],
      correctKey: "E",
    },
  ],
};
