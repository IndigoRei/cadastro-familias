// Autoteste do Clube.gs fora do Google: node servidor/autoteste-clube.cjs
// Simula a planilha, as propriedades e os serviços do Apps Script, e confere preço, vagas, inscrição e Pix.
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

const props = { PASTA_ID: 'p', PASTA_RESTRITA_ID: 'r', PIX_CHAVE: '00.000.000/0001-91' };
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
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
  Logger: { log: () => {} },
  ContentService: {},
  console,
};
vm.createContext(contexto);
for (const arq of ['Codigo.gs', 'Clube.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, arq), 'utf8'), contexto);
const run = (codigo) => vm.runInContext(codigo, contexto);

// Preço
assert.strictEqual(run("valorClube_(5, 'nao')"), 62500);
assert.strictEqual(run("valorClube_(4, 'nao')"), 62500); // 4 tardes avulsas passariam da semana
assert.strictEqual(run("valorClube_(3, 'nao')"), 48000);
assert.strictEqual(run("valorClube_(5, '1x')"), 32000);
assert.strictEqual(run("valorClube_(3, '1x')"), 0);
assert.strictEqual(run("valorClube_(5, '2x')"), 0);

// Pix: o mesmo código do sistema (src/dominio/pix.ts) para os mesmos dados.
assert.strictEqual(run("pixClube_('00000000000191', 124905, 'T011126')").replace('INSTITUTO INDIGO REI', 'X'),
  '00020126360014br.gov.bcb.pix01140000000000019152040000530398654071249.055802BR5920INSTITUTO INDIGO REI6008BRASILIA62110507T01112663042E58'.replace('INSTITUTO INDIGO REI', 'X'));

// Configuração e inscrição
run('configurarClube()');
const base = {
  tipo: 'clube', tempo: 20000, respNome: 'Responsável Teste', respTelefone: '(61) 99999-0000', respEmail: '',
  emergNome: 'Avó Teste', emergTelefone: '61 98888-0000', autorizaImagem: 'Sim, autorizo', consentimento: true,
};
const crianca = (o) => Object.assign({ nome: 'Criança Teste', nascimento: '10/05/2018', escola: '', serie: '', contraturno: 'nao', dias: ['2026-12-14'], alergias: '' }, o);
contexto.dados = Object.assign({}, base, { criancas: [crianca({ dias: CLUBE_DIAS() }), crianca({ nome: 'Irmã Teste', nascimento: '01/01/2021', contraturno: '1x', dias: CLUBE_DIAS(), alergias: 'amendoim' })] });
function CLUBE_DIAS() { return ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18']; }
const r = run('clubeInscrever_(dados)');
assert.strictEqual(r.ok, true);
assert.strictEqual(r.total, 62500 + 32000);
assert.ok(r.pix.startsWith('000201') && r.pix.includes('5406945.00'));
const insc = planilhas['Clube de Férias dezembro 2026 (inscrições)'].getSheetByName('Inscrições').linhas;
assert.strictEqual(insc.length, 3); // título e duas crianças
assert.strictEqual(insc[2][6], '3 a 7 anos');
assert.ok(!insc.flat().join('|').includes('amendoim')); // alergia só na planilha restrita
assert.strictEqual(planilhas['Clube de Férias dezembro 2026 (alergias)'].getSheetByName('Alergias').linhas[1][4], 'amendoim');
assert.strictEqual(emails, 1);

// Vagas: até 30/11, 6 da comunidade por tarde.
const vagas = (hoje, agora) => JSON.parse(JSON.stringify(run(`vagasClube_(lerInscricoesClube_(planilha_('Clube de Férias dezembro 2026 (inscrições)')), '${hoje}'${agora ? `, ${agora}` : ''})`)));
assert.deepStrictEqual(vagas('2026-11-01')[0], { dia: '2026-12-14', comunidade: 5, contraturno: 13 });
assert.deepStrictEqual(vagas('2026-12-01')[0], { dia: '2026-12-14', comunidade: 18, contraturno: 18 });

// Comunidade lotada numa tarde: a inscrição é recusada com a tarde.
let erroLotado = '';
for (let i = 0; i < 6; i++) {
  contexto.dados = Object.assign({}, base, { respTelefone: '(61) 98000-000' + i, criancas: [crianca({ nome: 'Outra Criança ' + i, dias: ['2026-12-15'] })] });
  try { run('clubeInscrever_(dados)'); } catch (e) { erroLotado = e.message; }
}
if (run("hojeClube_()") <= '2026-11-30') assert.match(erroLotado, /15\/12 não tem mais vaga/);

// Vaga presa (auditoria de 29/10/2026): aguardando segura a vaga por 48 horas; Confirmado segura sempre.
const depois = Date.now() + 49 * 3600000;
assert.deepStrictEqual(vagas('2026-12-01', depois)[0], { dia: '2026-12-14', comunidade: 20, contraturno: 20 });
insc[1][2] = 'Confirmado'; // a primeira criança pagou
assert.deepStrictEqual(vagas('2026-12-01', depois)[0], { dia: '2026-12-14', comunidade: 19, contraturno: 19 });
insc[1][2] = 'Aguardando Pix';

// Um WhatsApp segura no máximo 4 crianças aguardando: já há 2 deste; mais 3 passam do limite.
contexto.dados = Object.assign({}, base, { criancas: [1, 2, 3].map((n) => crianca({ nome: 'Mais Criança ' + n, dias: ['2026-12-18'] })) });
assert.throws(() => run('clubeInscrever_(dados)'), /já tem inscrição aguardando/);

// Sem o tempo da página, o envio é recusado.
contexto.dados = Object.assign({}, base, { tempo: undefined, respTelefone: '(61) 97777-0000', criancas: [crianca({})] });
assert.throws(() => run('clubeInscrever_(dados)'), /muito rápido/);

// Validação
contexto.dados = Object.assign({}, base, { criancas: [crianca({ nascimento: '01/01/2010' })] });
assert.throws(() => run('clubeInscrever_(dados)'), /3 a 12 anos/);
contexto.dados = Object.assign({}, base, { consentimento: false, criancas: [crianca({})] });
assert.throws(() => run('clubeInscrever_(dados)'), /autorização/);

console.log('Clube.gs: tudo certo.');
