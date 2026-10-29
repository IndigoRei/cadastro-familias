// Autoteste do Clube.gs fora do Google: node servidor/autoteste-clube.cjs
// Simula a planilha, as propriedades e os serviços do Apps Script. Desde 29/10/2026 a inscrição é no sistema: aqui ficam
// as alergias, gravadas na planilha restrita só depois de o sistema confirmar a inscrição.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function abaFalsa(nome) {
  const linhas = [];
  const aba = {
    nome, linhas,
    getLastRow: () => linhas.length,
    getRange: (l, c, nl, nc) => {
      // Encadeia como o Apps Script: todo método devolve o próprio intervalo.
      const intervalo = new Proxy({}, { get: (_, nomeMetodo) => {
        if (nomeMetodo === 'setValues') return (v) => { v.forEach((r, i) => { linhas[l - 1 + i] = r.map(String); }); return intervalo; };
        if (nomeMetodo === 'getDisplayValues') return () => linhas.slice(l - 1, l - 1 + (nl || 1)).map((r) => r.slice(c - 1, c - 1 + (nc || r.length)));
        return () => intervalo;
      } });
      return intervalo;
    },
    setName: () => aba, setRowHeight: () => {}, setFrozenRows: () => {}, setFrozenColumns: () => {}, setColumnWidths: () => {},
  };
  return aba;
}
function planilhaFalsa() {
  const abas = {};
  const p = {
    getId: () => 'id', getUrl: () => 'url', setSpreadsheetTimeZone: () => {}, setSpreadsheetLocale: () => {},
    getSheets: () => [{ setName: (n) => (abas[n] = abaFalsa(n)) }],
    insertSheet: (n) => (abas[n] = abaFalsa(n)),
    getSheetByName: (n) => abas[n],
  };
  return p;
}

const props = { PASTA_ID: 'p', PASTA_RESTRITA_ID: 'r', SISTEMA_URL: 'https://exemplo.supabase.co/', SISTEMA_CHAVE_PUBLICA: 'chave' };
const chamadas = [];
let respostaDoSistema = 'true';
const planilhas = {};
let emails = 0;
const cache = {};
const contexto = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  DriveApp: {
    getFolderById: () => ({ isTrashed: () => false }),
    getFileById: (id) => ({ isTrashed: () => false, moveTo: () => {} }),
  },
  SpreadsheetApp: {
    create: (nome) => { const p = planilhaFalsa(); p.getId = () => nome; planilhas[nome] = p; return p; },
    openById: (id) => planilhas[id],
    newDataValidation: () => ({ requireValueInList: () => ({ setAllowInvalid: () => ({ build: () => ({}) }) }) }),
  },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
  Utilities: {
    formatDate: (d, fuso, f) => {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        .formatToParts(d).reduce((o, x) => ((o[x.type] = x.value), o), {});
      return f.replace('yyyy', p.year).replace('yy', p.year.slice(2)).replace('MM', p.month).replace('dd', p.day)
        .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
    },
    newBlob: (s) => ({ getBytes: () => [...Buffer.from(s, 'utf8')].map((b) => (b > 127 ? b - 256 : b)) }),
  },
  MailApp: { sendEmail: () => { emails++; } },
  UrlFetchApp: {
    fetch: (url, o) => {
      chamadas.push({ url, corpo: JSON.parse(o.payload), apikey: o.headers.apikey });
      return { getResponseCode: () => 200, getContentText: () => respostaDoSistema };
    },
  },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
  Logger: { log: () => {} },
  ContentService: {},
  console,
};
vm.createContext(contexto);
for (const arq of ['Codigo.gs', 'Clube.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, arq), 'utf8'), contexto);
const run = (codigo) => vm.runInContext(codigo, contexto);

// Configuração: só a planilha das alergias, na pasta restrita.
assert.match(run('configurarClube()'), /Ligação com o sistema: ok/);
const linhas = () => planilhas['Clube de Férias dezembro 2026 (alergias)'].getSheetByName('Alergias').linhas;

// Endereço antigo: as vagas e a inscrição mandam para o sistema.
assert.strictEqual(run('clubeVagas_()').endereco, 'https://sistema.indigorei.com.br/clube');
assert.throws(() => run('clubeInscrever_({})'), /agora são em https:\/\/sistema\.indigorei\.com\.br\/clube/);

// Alergias: confere a inscrição no sistema e grava só as crianças com alergia.
contexto.dados = { tipo: 'clube_alergias', referencia: 'C261105-1012-K7Q', criancas: [
  { nome: 'Ana Teste Clube', nascimento: '10/03/2018', alergias: 'amendoim' },
  { nome: 'Beto Teste Clube', nascimento: '01/01/2019', alergias: '' },
] };
assert.deepStrictEqual(JSON.parse(JSON.stringify(run('clubeAlergias_(dados)'))), { ok: true });
assert.strictEqual(chamadas.length, 1);
assert.strictEqual(chamadas[0].url, 'https://exemplo.supabase.co/rest/v1/rpc/clube_referencia_recente');
assert.deepStrictEqual(chamadas[0].corpo, { p_referencia: 'C261105-1012-K7Q', p_nomes: ['Ana Teste Clube'] });
assert.strictEqual(linhas().length, 2); // título e a Ana
assert.deepStrictEqual(Array.from(linhas()[1].slice(1)), ['C261105-1012-K7Q', 'Ana Teste Clube', '10/03/2018', 'amendoim']);

// Reenvio igual não entra em dobro.
run('clubeAlergias_(dados)');
assert.strictEqual(linhas().length, 2);

// Sem alergia nenhuma: nada a conferir nem a gravar.
contexto.dados = { tipo: 'clube_alergias', referencia: 'C261105-1013-AAA', criancas: [{ nome: 'Caio Teste', nascimento: '', alergias: ' ' }] };
run('clubeAlergias_(dados)');
assert.strictEqual(chamadas.length, 2);

// O sistema não conhece a inscrição (ou é antiga): recusa, e nada é gravado.
respostaDoSistema = 'false';
contexto.dados = { tipo: 'clube_alergias', referencia: 'C261105-1014-BBB', criancas: [{ nome: 'Dora Teste', nascimento: '', alergias: 'lactose' }] };
assert.throws(() => run('clubeAlergias_(dados)'), /Não encontramos a inscrição/);
assert.strictEqual(linhas().length, 2);

// Referência fora do formato e lista grande demais.
contexto.dados = { tipo: 'clube_alergias', referencia: 'qualquer', criancas: [{ nome: 'X Y', alergias: 'z' }] };
assert.throws(() => run('clubeAlergias_(dados)'), /Referência/);
contexto.dados = { tipo: 'clube_alergias', referencia: 'C261105-1014-BBB', criancas: Array.from({ length: 9 }, () => ({ nome: 'X Y', alergias: 'z' })) };
assert.throws(() => run('clubeAlergias_(dados)'), /Envio inválido/);

// Nenhum e-mail com dado de saúde.
assert.strictEqual(emails, 0);
console.log('autoteste do Clube: ok');
