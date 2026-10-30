// Tipos espelham a saída `python api_otrs_consulta_3.py evento "..." --json`
export type Classe = "PROVAVEL_DUPLICADO" | "RELACIONADO" | "BAIXA";
export type Decisao = "JA_EXISTE_ABERTO" | "RECORRENCIA" | "REVISAR" | "NOVO";

export interface Nota { criado: string; tipo: string; autor: string; texto: string }
export interface Candidato {
  ticket_id: string; numero: string; titulo: string; estado: string; tipo_estado: string;
  aberto: boolean; criado: string; dono: string; alterado: string; causa: string;
  tipo_encerramento: string; duracao: string; palavras_iguais: string[];
  palavras_parecidas: string[]; palavras_faltando: string[]; cobertura: number;
  score: number; classe: Classe; motivos: string[]; ultimas_notas?: Nota[];
}
export interface Resultado {
  evento: string; palavras: string[]; pesos: Record<string, number>; host: string | null;
  ips: string[]; categorias: string[]; periodo: { desde?: string; ate?: string | null };
  buscas_realizadas: string[]; chamados_encontrados: number; chamados_analisados: number;
  resumo: { mesmo_evento: number; relacionados: number; ainda_abertos: number };
  decisao: Decisao; mensagem: string; candidatos: Candidato[];
}

const fndeCand = (id: string, num: string, titulo: string, dono: string, criado: string, alterado: string, dur: string): Candidato => ({
  ticket_id: id, numero: num, titulo, estado: "closed successful", tipo_estado: "closed", aberto: false,
  criado, dono, alterado, causa: "", tipo_encerramento: "2. Solução Definitiva", duracao: dur,
  palavras_iguais: ["fnde"], palavras_parecidas: [], palavras_faltando: ["temperature"],
  cobertura: 0.5, score: 20, classe: "RELACIONADO",
  motivos: ["palavras iguais: fnde (1/2)", "não encontradas: temperature"],
});

// Dados reais da execução enviada (FNDE - Temperature)
export const DEMO_FNDE: Resultado = {
  evento: "FNDE - Temperature", palavras: ["fnde", "temperature"], pesos: { fnde: 1, temperature: 1 },
  host: null, ips: [], categorias: [], periodo: { desde: "2026-01-02 09:26:03", ate: null },
  buscas_realizadas: ["fnde", "temperature"], chamados_encontrados: 7, chamados_analisados: 7,
  resumo: { mesmo_evento: 0, relacionados: 4, ainda_abertos: 0 }, decisao: "REVISAR",
  mensagem: "4 chamado(s) relacionado(s) encontrado(s); revisar antes de abrir um novo.",
  candidatos: [
    fndeCand("215827", "2026102369000565", "FNDE - Analise de trigger", "joilson.vieira", "2026-10-23 09:32:51", "2026-10-25 20:45:03", "2d 11h"),
    fndeCand("197161", "2026061869000154", "FNDE - Monitoramento sala cofre CMC", "joilson.vieira", "2026-06-18 08:46:42", "2026-06-22 10:45:01", "4d 1h"),
    fndeCand("195092", "2026060369001047", "FNDE - Liberação de acesso", "josiel.silva", "2026-06-03 18:04:23", "2026-06-18 12:45:02", "14d 18h"),
    fndeCand("185122", "2026021869000983", "FNDE - Monitoramento de equipamentos", "josiel.silva", "2026-02-18 18:00:47", "2026-05-20 16:45:01", "90d 22h"),
  ],
};

// Exemplo ilustrativo (dados fictícios) para mostrar recorrência + notas de solução
export const DEMO_BADESUL: Resultado = {
  evento: "Badesul - Host SRV01 is Down IP: 10.0.0.1", palavras: ["badesul", "srv01", "down"],
  pesos: { badesul: 0.6, srv01: 1.6, down: 0.8 }, host: "SRV01", ips: ["10.0.0.1"], categorias: ["indisponibilidade"],
  periodo: { desde: "2026-01-02 09:00:00", ate: null }, buscas_realizadas: ["srv01", "badesul", "down"],
  chamados_encontrados: 18, chamados_analisados: 18, resumo: { mesmo_evento: 2, relacionados: 1, ainda_abertos: 1 },
  decisao: "JA_EXISTE_ABERTO", mensagem: "Já existe chamado aberto provavelmente do mesmo evento: #2026103069000112 (ID 216301).",
  candidatos: [
    { ticket_id: "216301", numero: "2026103069000112", titulo: "Badesul - Host SRV01 is Down", estado: "open", tipo_estado: "open", aberto: true,
      criado: "2026-10-30 08:12:40", dono: "maria.souza", alterado: "2026-10-30 09:01:12", causa: "", tipo_encerramento: "", duracao: "",
      palavras_iguais: ["badesul", "srv01", "down"], palavras_parecidas: [], palavras_faltando: [], cobertura: 1, score: 96, classe: "PROVAVEL_DUPLICADO",
      motivos: ["palavras iguais: badesul, srv01, down (3/3)", "sequência igual em 100% dos pares de palavras"],
      ultimas_notas: [{ criado: "2026-10-30 09:01:12", tipo: "note-internal", autor: "maria.souza", texto: "Acionado cliente por telefone. Aguardando retorno do responsável local para verificar energia no rack." }] },
    { ticket_id: "209877", numero: "2026082169000431", titulo: "Badesul - Host SRV01 is down IP: 10.0.0.1", estado: "closed successful", tipo_estado: "closed", aberto: false,
      criado: "2026-08-21 02:44:10", dono: "joilson.vieira", alterado: "2026-08-21 05:10:33", causa: "2. Problema de Infraestrutura Física do Cliente", tipo_encerramento: "2. Solução Definitiva", duracao: "2h 26m",
      palavras_iguais: ["badesul", "srv01", "down"], palavras_parecidas: [], palavras_faltando: [], cobertura: 1, score: 92, classe: "PROVAVEL_DUPLICADO",
      motivos: ["palavras iguais: badesul, srv01, down (3/3)"],
      ultimas_notas: [{ criado: "2026-08-21 05:10:33", tipo: "note-internal", autor: "joilson.vieira", texto: "Queda de energia no CPD do cliente. Após retorno do nobreak, servidor SRV01 religado manualmente pelo técnico local. Serviços validados (IIS, SQL)." }] },
    { ticket_id: "201004", numero: "2026071069000088", titulo: "Badesul - Host SRV02 is Down", estado: "closed successful", tipo_estado: "closed", aberto: false,
      criado: "2026-07-10 11:02:00", dono: "josiel.silva", alterado: "2026-07-10 13:40:21", causa: "5. Ajuste de configuração", tipo_encerramento: "2. Solução Definitiva", duracao: "2h 38m",
      palavras_iguais: ["badesul", "down"], palavras_parecidas: ["srv01 (~srv02)"], palavras_faltando: [], cobertura: 0.7, score: 54, classe: "RELACIONADO",
      motivos: ["palavras iguais: badesul, down (2/3)", "parecidas: srv01 (~srv02)", "host/IP diferente do evento"],
      ultimas_notas: [{ criado: "2026-07-10 13:40:21", tipo: "note-internal", autor: "josiel.silva", texto: "Regra de firewall bloqueando ICMP após mudança. Liberado ICMP do proxy Zabbix para a VLAN de servidores." }] },
  ],
};

export const DEMO_NOVO: Resultado = {
  evento: "SWAS_SD13_03", palavras: ["swas_sd13_03"], pesos: { swas_sd13_03: 1 }, host: null, ips: [], categorias: [],
  periodo: { desde: "2026-01-02 09:16:18", ate: null }, buscas_realizadas: ["swas_sd13_03"], chamados_encontrados: 0,
  chamados_analisados: 0, resumo: { mesmo_evento: 0, relacionados: 0, ainda_abertos: 0 }, decisao: "NOVO",
  mensagem: "Nenhum chamado parecido no período; pode abrir um novo.", candidatos: [],
};

export const DEMOS = [
  { label: "FNDE - Temperature", data: DEMO_FNDE, real: true },
  { label: "Badesul - SRV01 Down", data: DEMO_BADESUL, real: false },
  { label: "SWAS_SD13_03", data: DEMO_NOVO, real: true },
];

export function parseResultado(raw: string): Resultado {
  const start = raw.indexOf("{");
  if (start < 0) throw new Error("JSON não encontrado. Rode o script com --json.");
  const obj = JSON.parse(raw.slice(start));
  if (!obj || typeof obj.evento !== "string" || !Array.isArray(obj.candidatos))
    throw new Error("Formato inesperado: esperado o JSON do comando 'evento'.");
  return obj as Resultado;
}
