/**
 * CADASTRO DAS FAMÍLIAS ÍNDIGO REI (servidor)
 *
 * A página fica em cadastro.indigorei.com.br (GitHub Pages) e envia os dados para cá.
 * Este script roda na conta institutoindigorei@gmail.com e grava:
 *
 *   Planilha "Cadastro das Famílias (respostas)"   abas Famílias e Aprendizes
 *     Só dados de cadastro. É a base que entra na importação do Sistema Índigo Rei.
 *
 *   Pasta "Saúde e laudos (restrito)"
 *     Planilha "Cadastro das Famílias (saúde)" e uma subpasta de laudos por aprendiz.
 *     Dados de saúde NUNCA entram no sistema antes da fase da área clínica (planta, seção 10).
 *     Não compartilhe esta pasta.
 *
 * PRIMEIRA VEZ:
 *   1. Executar a função configurar() e autorizar.
 *   2. Implantar > Nova implantação > App da Web
 *      Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 *   3. Copiar a URL /exec para a constante URL_SERVIDOR do index.html.
 *
 * Para mudar o código depois: Implantar > Gerenciar implantações > editar > Nova versão.
 * Assim a URL continua a mesma.
 */

const CONFIG = {
  PASTA: 'Cadastro das Famílias Índigo Rei',
  PASTA_RESTRITA: 'Saúde e laudos (restrito)',
  PLANILHA: 'Cadastro das Famílias (respostas)',
  PLANILHA_SAUDE: 'Cadastro das Famílias (saúde)',
  AVISO_EMAIL: 'institutoindigorei@gmail.com',
  FUSO: 'America/Sao_Paulo',
  MAX_APRENDIZES: 4,
  MAX_ARQUIVOS_POR_APRENDIZ: 5,
  MAX_MB_POR_ARQUIVO: 10,
  MAX_MB_TOTAL: 25,
  TIPOS_ARQUIVO: ['application/pdf', 'image/jpeg', 'image/png']
};

const COL_FAMILIAS = [
  ['dataHora', 'Data e hora do envio'],
  ['envio', 'Código do envio'],
  ['aprendizes', 'Aprendizes'],
  ['respNome', 'Responsável: nome completo'],
  ['respParentesco', 'Responsável: parentesco'],
  ['respCpf', 'Responsável: CPF'],
  ['respRg', 'Responsável: RG'],
  ['respProfissao', 'Responsável: profissão'],
  ['respEstadoCivil', 'Responsável: estado civil'],
  ['respTelefone', 'Responsável: WhatsApp'],
  ['respEmail', 'Responsável: e-mail'],
  ['cep', 'CEP'],
  ['logradouro', 'Endereço'],
  ['numero', 'Número'],
  ['complemento', 'Complemento'],
  ['bairro', 'Bairro'],
  ['cidade', 'Cidade'],
  ['uf', 'UF'],
  ['c2Nome', 'Segundo contato: nome'],
  ['c2Parentesco', 'Segundo contato: parentesco'],
  ['c2Telefone', 'Segundo contato: WhatsApp'],
  ['c2Email', 'Segundo contato: e-mail'],
  ['finQuem', 'Responsável financeiro é'],
  ['finNome', 'Financeiro: nome completo'],
  ['finCpf', 'Financeiro: CPF'],
  ['finTelefone', 'Financeiro: WhatsApp'],
  ['finEmail', 'Financeiro: e-mail'],
  ['autorizaImagem', 'Autoriza uso de imagem'],
  ['consentimento', 'Consentimento LGPD (dados e saúde)'],
  ['declaracao', 'Declarou informações verdadeiras']
];

const COL_APRENDIZES = [
  ['dataHora', 'Data e hora do envio'],
  ['envio', 'Código do envio'],
  ['nome', 'Aprendiz: nome completo'],
  ['nascimento', 'Data de nascimento'],
  ['naturalidade', 'Naturalidade (cidade/UF)'],
  ['escola', 'Escola'],
  ['serie', 'Ano/série'],
  ['turno', 'Turno na escola'],
  ['objetivos', 'Objetivos da família'],
  ['respNome', 'Responsável'],
  ['respTelefone', 'WhatsApp do responsável'],
  ['finNome', 'Responsável financeiro']
];

const COL_SAUDE = [
  ['dataHora', 'Data e hora do envio'],
  ['envio', 'Código do envio'],
  ['nome', 'Aprendiz: nome completo'],
  ['nascimento', 'Data de nascimento'],
  ['preocupacao', 'Preocupação (comportamento/emocional)'],
  ['preocupacaoDetalhe', 'Preocupação: detalhes'],
  ['diagnostico', 'Diagnóstico'],
  ['diagnosticoQual', 'Diagnóstico: qual'],
  ['historico', 'Histórico médico'],
  ['historicoDetalhe', 'Histórico médico: detalhes'],
  ['laudos', 'Laudos anexados'],
  ['pastaLaudos', 'Pasta dos laudos']
];

const OPCOES = {
  parentesco: ['Mãe', 'Pai', 'Avó ou avô', 'Outro'],
  estadoCivil: ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)', 'Outro'],
  simNao: ['Sim', 'Não'],
  diagnostico: ['Não', 'Sim', 'Em investigação'],
  finQuem: ['Responsável principal', 'Segundo contato', 'Outra pessoa'],
  imagem: ['Sim, autorizo', 'Não autorizo'],
  turno: ['', 'Manhã', 'Tarde', 'Integral'],
  uf: ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
};


/* ------------------------------------------------------------------ */
/* Entradas web                                                        */
/* ------------------------------------------------------------------ */

function doGet() {
  // Usado pela página para "acordar" o servidor antes do envio.
  return json_({ ok: true, servico: 'cadastro-familias' });
}

function doPost(e) {
  try {
    const dados = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return json_(registrar_(dados));
  } catch (err) {
    return json_({ ok: false, erro: String(err && err.message ? err.message : err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}


/* ------------------------------------------------------------------ */
/* Configuração (rodar uma vez pelo editor)                            */
/* ------------------------------------------------------------------ */

function configurar() {
  const props = PropertiesService.getScriptProperties();

  let pasta = pasta_(props.getProperty('PASTA_ID'));
  if (!pasta) { pasta = DriveApp.createFolder(CONFIG.PASTA); props.setProperty('PASTA_ID', pasta.getId()); }

  let restrita = pasta_(props.getProperty('PASTA_RESTRITA_ID'));
  if (!restrita) { restrita = pasta.createFolder(CONFIG.PASTA_RESTRITA); props.setProperty('PASTA_RESTRITA_ID', restrita.getId()); }

  let planilha = planilha_(props.getProperty('PLANILHA_ID'));
  if (!planilha) {
    planilha = SpreadsheetApp.create(CONFIG.PLANILHA);
    DriveApp.getFileById(planilha.getId()).moveTo(pasta);
    props.setProperty('PLANILHA_ID', planilha.getId());
    prepararPlanilha_(planilha, [['Famílias', COL_FAMILIAS], ['Aprendizes', COL_APRENDIZES]]);
  }

  let saude = planilha_(props.getProperty('PLANILHA_SAUDE_ID'));
  if (!saude) {
    saude = SpreadsheetApp.create(CONFIG.PLANILHA_SAUDE);
    DriveApp.getFileById(saude.getId()).moveTo(restrita);
    props.setProperty('PLANILHA_SAUDE_ID', saude.getId());
    prepararPlanilha_(saude, [['Saúde', COL_SAUDE]]);
  }

  const resumo = [
    'Tudo pronto.',
    'Planilha de cadastro: ' + planilha.getUrl(),
    'Planilha de saúde (restrita): ' + saude.getUrl(),
    'Pasta restrita de laudos: ' + restrita.getUrl(),
    'Próximo passo: Implantar > Nova implantação > App da Web (Executar como: Eu; Quem pode acessar: Qualquer pessoa).'
  ].join('\n');
  Logger.log(resumo);
  return resumo;
}

function prepararPlanilha_(planilha, abas) {
  planilha.setSpreadsheetTimeZone(CONFIG.FUSO);
  planilha.setSpreadsheetLocale('pt_BR');
  abas.forEach(function (par, i) {
    const nome = par[0], colunas = par[1];
    const aba = i === 0 ? planilha.getSheets()[0].setName(nome) : planilha.insertSheet(nome);
    const titulos = colunas.map(function (c) { return c[1]; });
    aba.getRange(1, 1, 1, titulos.length).setValues([titulos])
      .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#062D56')
      .setWrap(true).setVerticalAlignment('middle');
    aba.setRowHeight(1, 52);
    aba.setFrozenRows(1);
    aba.setFrozenColumns(Math.min(3, titulos.length));
    aba.setColumnWidths(1, titulos.length, 170);
  });
}


/* ------------------------------------------------------------------ */
/* Registro de um envio                                                */
/* ------------------------------------------------------------------ */

function registrar_(d) {
  if (!d || typeof d !== 'object') throw new Error('Envio inválido. Recarregue a página e tente de novo.');
  // Proteção simples contra robôs: campo escondido preenchido ou envio rápido demais.
  if (d.site) return { ok: true };
  if (typeof d.tempo === 'number' && d.tempo < 8000) throw new Error('Envio muito rápido. Confira os dados e envie de novo.');

  const props = PropertiesService.getScriptProperties();
  const planilha = planilha_(props.getProperty('PLANILHA_ID'));
  const saude = planilha_(props.getProperty('PLANILHA_SAUDE_ID'));
  const restrita = pasta_(props.getProperty('PASTA_RESTRITA_ID'));
  if (!planilha || !saude || !restrita) throw new Error('O cadastro ainda não está configurado. Avise a equipe da Índigo Rei.');

  const f = validarFamilia_(d);
  const lista = validarAprendizes_(d.aprendizes);

  const agora = new Date();
  const envio = 'F' + Utilities.formatDate(agora, CONFIG.FUSO, 'yyMMdd-HHmmss') + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();

  // Laudos: uma subpasta por aprendiz, dentro da pasta restrita.
  lista.forEach(function (a) {
    a.links = [];
    a.pasta = '';
    if (!a.arquivos.length) return;
    const sub = restrita.createFolder(nomeArquivo_(a.nome) + ' (' + envio + ')');
    a.pasta = sub.getUrl();
    a.arquivos.forEach(function (arq, i) {
      const blob = Utilities.newBlob(arq.bytes, arq.tipo, nomeArquivo_(arq.nome) || ('laudo-' + (i + 1)));
      a.links.push(sub.createFile(blob).getUrl());
    });
  });

  const nomes = lista.map(function (a) { return a.nome; }).join(', ');
  const linhaFamilia = Object.assign({}, f, { dataHora: agora, envio: envio, aprendizes: nomes });

  const trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    gravar_(planilha.getSheetByName('Famílias'), COL_FAMILIAS, [linhaFamilia]);
    gravar_(planilha.getSheetByName('Aprendizes'), COL_APRENDIZES, lista.map(function (a) {
      return {
        dataHora: agora, envio: envio, nome: a.nome, nascimento: a.nascimento, naturalidade: a.naturalidade,
        escola: a.escola, serie: a.serie, turno: a.turno, objetivos: a.objetivos,
        respNome: f.respNome, respTelefone: f.respTelefone, finNome: f.finNome
      };
    }));
    gravar_(saude.getSheetByName('Saúde'), COL_SAUDE, lista.map(function (a) {
      return {
        dataHora: agora, envio: envio, nome: a.nome, nascimento: a.nascimento,
        preocupacao: a.preocupacao, preocupacaoDetalhe: a.preocupacaoDetalhe,
        diagnostico: a.diagnostico, diagnosticoQual: a.diagnosticoQual,
        historico: a.historico, historicoDetalhe: a.historicoDetalhe,
        laudos: a.links.length ? a.links.join('\n') : '', pastaLaudos: a.pasta
      };
    }));
  } finally {
    trava.releaseLock();
  }

  avisar_(envio, nomes, f, lista, planilha.getUrl());
  return { ok: true, envio: envio, primeiroNome: f.respNome.split(/\s+/)[0] };
}

function validarFamilia_(d) {
  const f = {
    respNome: txt_(d.respNome, 150),
    respParentesco: txt_(d.respParentesco, 60),
    respCpf: soDigitos_(d.respCpf),
    respRg: txt_(d.respRg, 40),
    respProfissao: txt_(d.respProfissao, 80),
    respEstadoCivil: txt_(d.respEstadoCivil, 40),
    respTelefone: txt_(d.respTelefone, 30),
    respEmail: txt_(d.respEmail, 150).toLowerCase(),
    cep: soDigitos_(d.cep),
    logradouro: txt_(d.logradouro, 150),
    numero: txt_(d.numero, 20),
    complemento: txt_(d.complemento, 80),
    bairro: txt_(d.bairro, 80),
    cidade: txt_(d.cidade, 80),
    uf: txt_(d.uf, 2).toUpperCase(),
    c2Nome: txt_(d.c2Nome, 150),
    c2Parentesco: txt_(d.c2Parentesco, 60),
    c2Telefone: txt_(d.c2Telefone, 30),
    c2Email: txt_(d.c2Email, 150).toLowerCase(),
    finQuem: txt_(d.finQuem, 30),
    autorizaImagem: txt_(d.autorizaImagem, 20),
    consentimento: d.consentimento === true ? 'Sim' : '',
    declaracao: d.declaracao === true ? 'Sim' : ''
  };

  const falta = [];
  if (palavras_(f.respNome) < 2) falta.push('nome completo do responsável');
  if (!f.respParentesco) falta.push('parentesco');
  if (!cpfValido_(f.respCpf)) falta.push('CPF do responsável válido');
  if (!f.respRg) falta.push('RG do responsável');
  if (OPCOES.estadoCivil.indexOf(f.respEstadoCivil.split(':')[0]) < 0) falta.push('estado civil');
  if (soDigitos_(f.respTelefone).length < 10) falta.push('WhatsApp do responsável com DDD');
  if (!emailValido_(f.respEmail)) falta.push('e-mail do responsável');
  if (f.cep.length !== 8) falta.push('CEP');
  if (!f.logradouro || !f.numero || !f.bairro || !f.cidade) falta.push('endereço completo');
  if (OPCOES.uf.indexOf(f.uf) < 0) falta.push('UF');
  const temC2 = !!(f.c2Nome || f.c2Telefone);
  if (temC2) {
    if (palavras_(f.c2Nome) < 2) falta.push('nome completo do segundo contato');
    if (soDigitos_(f.c2Telefone).length < 10) falta.push('WhatsApp do segundo contato');
    if (f.c2Email && !emailValido_(f.c2Email)) falta.push('e-mail do segundo contato');
  }
  if (OPCOES.finQuem.indexOf(f.finQuem) < 0) falta.push('responsável financeiro');
  if (OPCOES.imagem.indexOf(f.autorizaImagem) < 0) falta.push('resposta sobre uso de imagem');
  if (!f.consentimento) falta.push('consentimento de uso dos dados');
  if (!f.declaracao) falta.push('declaração');

  // Responsável financeiro
  if (f.finQuem === 'Responsável principal') {
    f.finNome = f.respNome; f.finCpf = f.respCpf; f.finTelefone = f.respTelefone; f.finEmail = f.respEmail;
  } else if (f.finQuem === 'Segundo contato') {
    if (!temC2) falta.push('segundo contato (marcado como responsável financeiro)');
    f.finNome = f.c2Nome; f.finCpf = soDigitos_(d.finCpf); f.finTelefone = f.c2Telefone; f.finEmail = f.c2Email;
    if (!cpfValido_(f.finCpf)) falta.push('CPF do responsável financeiro válido');
  } else if (f.finQuem === 'Outra pessoa') {
    f.finNome = txt_(d.finNome, 150); f.finCpf = soDigitos_(d.finCpf);
    f.finTelefone = txt_(d.finTelefone, 30); f.finEmail = txt_(d.finEmail, 150).toLowerCase();
    if (palavras_(f.finNome) < 2) falta.push('nome completo do responsável financeiro');
    if (!cpfValido_(f.finCpf)) falta.push('CPF do responsável financeiro válido');
    if (soDigitos_(f.finTelefone).length < 10) falta.push('WhatsApp do responsável financeiro');
    if (!emailValido_(f.finEmail)) falta.push('e-mail do responsável financeiro');
  }

  if (falta.length) throw new Error('Confira: ' + falta.join(', ') + '.');
  f.respCpf = formatarCpf_(f.respCpf);
  f.finCpf = formatarCpf_(f.finCpf || '');
  f.cep = f.cep.slice(0, 5) + '-' + f.cep.slice(5);
  return f;
}

function validarAprendizes_(lista) {
  if (!Array.isArray(lista) || !lista.length) throw new Error('Informe ao menos um aprendiz.');
  if (lista.length > CONFIG.MAX_APRENDIZES) throw new Error('No máximo ' + CONFIG.MAX_APRENDIZES + ' aprendizes por envio.');
  let totalBytes = 0;
  return lista.map(function (x, i) {
    const n = 'aprendiz ' + (i + 1);
    const a = {
      nome: txt_(x.nome, 150),
      nascimento: txt_(x.nascimento, 10),
      naturalidade: txt_(x.naturalidade, 80),
      escola: txt_(x.escola, 150),
      serie: txt_(x.serie, 60),
      turno: txt_(x.turno, 20),
      objetivos: txt_(x.objetivos, 2000),
      preocupacao: txt_(x.preocupacao, 5),
      preocupacaoDetalhe: txt_(x.preocupacaoDetalhe, 2000),
      diagnostico: txt_(x.diagnostico, 20),
      diagnosticoQual: txt_(x.diagnosticoQual, 500),
      historico: txt_(x.historico, 5),
      historicoDetalhe: txt_(x.historicoDetalhe, 2000),
      arquivos: []
    };
    const falta = [];
    if (palavras_(a.nome) < 2) falta.push('nome e sobrenome');
    if (!dataValida_(a.nascimento)) falta.push('data de nascimento');
    if (!a.naturalidade) falta.push('naturalidade');
    if (!a.escola) falta.push('escola');
    if (!a.serie) falta.push('ano/série');
    if (OPCOES.turno.indexOf(a.turno) < 0) a.turno = '';
    if (!a.objetivos) falta.push('objetivos');
    if (OPCOES.simNao.indexOf(a.preocupacao) < 0) falta.push('pergunta sobre preocupações');
    else if (a.preocupacao === 'Sim' && !a.preocupacaoDetalhe) falta.push('detalhes da preocupação');
    if (OPCOES.diagnostico.indexOf(a.diagnostico) < 0) falta.push('pergunta sobre diagnóstico');
    else if (a.diagnostico !== 'Não' && !a.diagnosticoQual) falta.push('qual diagnóstico');
    if (OPCOES.simNao.indexOf(a.historico) < 0) falta.push('pergunta sobre histórico médico');
    else if (a.historico === 'Sim' && !a.historicoDetalhe) falta.push('detalhes do histórico médico');
    if (a.preocupacao === 'Não') a.preocupacaoDetalhe = '';
    if (a.diagnostico === 'Não') a.diagnosticoQual = '';
    if (a.historico === 'Não') a.historicoDetalhe = '';

    const arqs = Array.isArray(x.arquivos) ? x.arquivos : [];
    if (arqs.length > CONFIG.MAX_ARQUIVOS_POR_APRENDIZ) falta.push('no máximo ' + CONFIG.MAX_ARQUIVOS_POR_APRENDIZ + ' arquivos');
    arqs.slice(0, CONFIG.MAX_ARQUIVOS_POR_APRENDIZ).forEach(function (arq) {
      if (!arq || CONFIG.TIPOS_ARQUIVO.indexOf(arq.tipo) < 0 || !arq.base64) { falta.push('arquivo em PDF, JPG ou PNG'); return; }
      const bytes = Utilities.base64Decode(String(arq.base64));
      if (bytes.length > CONFIG.MAX_MB_POR_ARQUIVO * 1048576) { falta.push('arquivo de até ' + CONFIG.MAX_MB_POR_ARQUIVO + ' MB'); return; }
      totalBytes += bytes.length;
      a.arquivos.push({ nome: txt_(arq.nome, 100), tipo: arq.tipo, bytes: bytes });
    });
    if (totalBytes > CONFIG.MAX_MB_TOTAL * 1048576) falta.push('anexos de até ' + CONFIG.MAX_MB_TOTAL + ' MB somados');
    if (falta.length) throw new Error('Confira no ' + n + ': ' + falta.join(', ') + '.');
    return a;
  });
}

// Formata a linha como texto ANTES de gravar (appendRow apaga a formatação e
// "07/03" viraria data americana). A primeira coluna é a data do envio.
function gravar_(aba, colunas, objetos) {
  if (!objetos.length) return;
  const linhas = objetos.map(function (o) {
    return colunas.map(function (c) {
      const v = o[c[0]];
      if (v instanceof Date) return v;
      return protegerCelula_(v === undefined || v === null ? '' : v);
    });
  });
  const inicio = Math.max(aba.getLastRow(), 1) + 1;
  aba.getRange(inicio, 1, linhas.length, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  aba.getRange(inicio, 2, linhas.length, colunas.length - 1).setNumberFormat('@');
  aba.getRange(inicio, 1, linhas.length, colunas.length).setValues(linhas).setWrap(true).setVerticalAlignment('top');
}

// Aviso por e-mail sem nenhum dado de saúde: só quem se cadastrou e o link da planilha.
function avisar_(envio, nomes, f, lista, urlPlanilha) {
  try {
    const anexos = lista.reduce(function (s, a) { return s + a.links.length; }, 0);
    MailApp.sendEmail({
      to: CONFIG.AVISO_EMAIL,
      subject: 'Novo cadastro: ' + nomes,
      body: [
        'Chegou um cadastro novo pelo formulário das famílias.',
        '',
        'Aprendizes: ' + nomes,
        'Responsável: ' + f.respNome + ' (' + f.respTelefone + ')',
        'Responsável financeiro: ' + f.finNome,
        anexos ? 'Laudos anexados: ' + anexos + ' (na pasta restrita)' : 'Sem laudos anexados.',
        'Código do envio: ' + envio,
        '',
        'Planilha de cadastro: ' + urlPlanilha
      ].join('\n')
    });
  } catch (e) {
    // O aviso é cortesia: se falhar, o cadastro já foi gravado.
  }
}


/* ------------------------------------------------------------------ */
/* Utilitários                                                         */
/* ------------------------------------------------------------------ */

function pasta_(id) {
  if (!id) return null;
  try { const p = DriveApp.getFolderById(id); return p.isTrashed() ? null : p; } catch (e) { return null; }
}

function planilha_(id) {
  if (!id) return null;
  try { if (DriveApp.getFileById(id).isTrashed()) return null; return SpreadsheetApp.openById(id); } catch (e) { return null; }
}

function txt_(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\r\n/g, '\n').trim().slice(0, max || 200);
}

function soDigitos_(v) { return String(v || '').replace(/\D/g, ''); }

function palavras_(s) { return String(s || '').split(/\s+/).filter(Boolean).length; }

function emailValido_(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')); }

function dataValida_(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || ''));
  if (!m) return false;
  const dt = new Date(+m[3], +m[2] - 1, +m[1]);
  const ano = new Date().getFullYear();
  return dt.getDate() === +m[1] && dt.getMonth() === +m[2] - 1 && +m[3] >= ano - 30 && +m[3] <= ano;
}

function cpfValido_(c) {
  c = soDigitos_(c);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0;
    for (let i = 0; i < t; i++) s += +c[i] * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== +c[t]) return false;
  }
  return true;
}

function formatarCpf_(c) {
  c = soDigitos_(c);
  return c.length === 11 ? c.slice(0, 3) + '.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-' + c.slice(9) : c;
}

// Impede que um texto começado por = + - @ vire fórmula na planilha
function protegerCelula_(s) {
  s = String(s);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function nomeArquivo_(s) {
  return String(s || '').replace(/[\\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
}
