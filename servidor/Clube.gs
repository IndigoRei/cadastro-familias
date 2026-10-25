/**
 * CLUBE DE FÉRIAS DE DEZEMBRO (servidor), na mesma implantação do cadastro das famílias.
 * A página fica em cadastro.indigorei.com.br/clube e manda as inscrições para cá.
 *
 * Grava:
 *   Planilha "Clube de Férias dezembro 2026 (inscrições)", na pasta do cadastro: uma linha por criança.
 *     A coluna Situação é sua: Aguardando Pix, Confirmado, Cancelado ou Contraturno: conferir.
 *     Cancelado libera a vaga na hora.
 *   Planilha "Clube de Férias dezembro 2026 (alergias)", na pasta restrita: alergias e restrições.
 *     Dado de saúde: nunca vai para o sistema nem para o e-mail de aviso.
 *
 * PRIMEIRA VEZ (no editor do Apps Script do cadastro das famílias):
 *   1. Arquivo + > Script, com o nome Clube, e colar este código. Trocar também o Codigo.gs pela versão nova.
 *   2. Rodar configurarClube() e autorizar.
 *   3. Configurações do projeto > Propriedades do script: criar PIX_CHAVE com o CNPJ só com os números.
 *   4. Implantar > Gerenciar implantações > editar > Nova versão. A URL continua a mesma.
 *
 * Regras (Davi, 25/10/2026; planta 3.5): 14 a 18/12/2026, das 14h às 17h30, crianças de 3 a 12 anos,
 * 20 vagas por tarde. Semana R$ 625, tarde avulsa R$ 160. Contraturno 1 vez por semana: 3 tardes incluídas;
 * 2 vezes por semana: a semana inteira. Até 30/11, 14 vagas por tarde ficam para o Contraturno e 6 para a
 * comunidade; depois, as 20 valem para todos. A vaga fica garantida quando a Índigo confirma o Pix.
 */

const CLUBE = {
  PLANILHA: 'Clube de Férias dezembro 2026 (inscrições)',
  PLANILHA_ALERGIAS: 'Clube de Férias dezembro 2026 (alergias)',
  DIAS: ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18'],
  NOME_DIA: { '2026-12-14': 'Seg 14', '2026-12-15': 'Ter 15', '2026-12-16': 'Qua 16', '2026-12-17': 'Qui 17', '2026-12-18': 'Sex 18' },
  VAGAS: 20,
  VAGAS_CONTRATURNO: 14,
  RESERVA_ATE: '2026-11-30',
  SEMANA: 62500,
  TARDE: 16000,
  INCLUIDAS_1X: 3,
  REFERENCIA_IDADE: '2026-12-14',
  IDADE_MIN: 3,
  IDADE_MAX: 12,
  MAX_CRIANCAS: 4,
  PIX_NOME: 'INSTITUTO INDIGO REI',
  PIX_CIDADE: 'BRASILIA',
  SITUACOES: ['Aguardando Pix', 'Confirmado', 'Cancelado', 'Contraturno: conferir']
};

const CONTRATURNO_CLUBE = { nao: 'Não', '1x': '1 vez por semana', '2x': '2 vezes por semana' };

const COL_CLUBE = [
  ['dataHora', 'Data e hora'],
  ['envio', 'Código da inscrição'],
  ['situacao', 'Situação'],
  ['crianca', 'Criança: nome completo'],
  ['nascimento', 'Nascimento'],
  ['idade', 'Idade em 14/12'],
  ['grupo', 'Grupo'],
  ['escola', 'Escola'],
  ['serie', 'Ano/série'],
  ['contraturno', 'Contraturno na Índigo'],
  ['dias', 'Tardes'],
  ['valor', 'Valor da criança (R$)'],
  ['total', 'Total da inscrição (R$)'],
  ['respNome', 'Responsável'],
  ['respTelefone', 'WhatsApp'],
  ['respEmail', 'E-mail'],
  ['emergNome', 'Emergência: nome'],
  ['emergTelefone', 'Emergência: telefone'],
  ['autorizaImagem', 'Uso de imagem'],
  ['consentimento', 'Consentimento LGPD']
];

const COL_CLUBE_ALERGIAS = [
  ['dataHora', 'Data e hora'],
  ['envio', 'Código da inscrição'],
  ['crianca', 'Criança: nome completo'],
  ['nascimento', 'Nascimento'],
  ['alergias', 'Alergias e restrições alimentares']
];


/* ------------------------------------------------------------------ */
/* Configuração (rodar uma vez pelo editor)                            */
/* ------------------------------------------------------------------ */

function configurarClube() {
  const props = PropertiesService.getScriptProperties();
  const pasta = pasta_(props.getProperty('PASTA_ID'));
  const restrita = pasta_(props.getProperty('PASTA_RESTRITA_ID'));
  if (!pasta || !restrita) throw new Error('Rode configurar() do cadastro primeiro.');

  let planilha = planilha_(props.getProperty('CLUBE_PLANILHA_ID'));
  if (!planilha) {
    planilha = SpreadsheetApp.create(CLUBE.PLANILHA);
    DriveApp.getFileById(planilha.getId()).moveTo(pasta);
    props.setProperty('CLUBE_PLANILHA_ID', planilha.getId());
    prepararPlanilha_(planilha, [['Inscrições', COL_CLUBE]]);
    const regra = SpreadsheetApp.newDataValidation().requireValueInList(CLUBE.SITUACOES, true).setAllowInvalid(false).build();
    planilha.getSheetByName('Inscrições').getRange(2, 3, 999, 1).setDataValidation(regra);
  }

  let alergias = planilha_(props.getProperty('CLUBE_ALERGIAS_ID'));
  if (!alergias) {
    alergias = SpreadsheetApp.create(CLUBE.PLANILHA_ALERGIAS);
    DriveApp.getFileById(alergias.getId()).moveTo(restrita);
    props.setProperty('CLUBE_ALERGIAS_ID', alergias.getId());
    prepararPlanilha_(alergias, [['Alergias', COL_CLUBE_ALERGIAS]]);
  }

  const resumo = [
    'Clube pronto.',
    'Inscrições: ' + planilha.getUrl(),
    'Alergias (restrita): ' + alergias.getUrl(),
    props.getProperty('PIX_CHAVE') ? 'Chave Pix: ok.' : 'Falta criar a propriedade PIX_CHAVE com o CNPJ só com os números.',
    'Depois: Implantar > Gerenciar implantações > editar > Nova versão.'
  ].join('\n');
  Logger.log(resumo);
  return resumo;
}


/* ------------------------------------------------------------------ */
/* Contas: preço e vagas (as mesmas da página, que só mostra)          */
/* ------------------------------------------------------------------ */

// Centavos de uma criança: quantas tardes e se faz Contraturno.
function valorClube_(tardes, contraturno) {
  if (contraturno === '2x') return 0;
  const pagas = contraturno === '1x' ? Math.max(0, tardes - CLUBE.INCLUIDAS_1X) : tardes;
  return Math.min(pagas * CLUBE.TARDE, CLUBE.SEMANA);
}

function hojeClube_() {
  return Utilities.formatDate(new Date(), CONFIG.FUSO, 'yyyy-MM-dd');
}

// Vagas livres por tarde, para a comunidade e para o Contraturno. Cancelado não conta.
function vagasClube_(linhas, hoje) {
  const reserva = hoje <= CLUBE.RESERVA_ATE;
  return CLUBE.DIAS.map(function (dia) {
    let comunidade = 0, contraturno = 0;
    linhas.forEach(function (l) {
      if (l.situacao === 'Cancelado' || l.dias.indexOf(dia) < 0) return;
      if (l.contraturno === 'nao') comunidade++; else contraturno++;
    });
    if (!reserva) {
      const livres = Math.max(0, CLUBE.VAGAS - comunidade - contraturno);
      return { dia: dia, comunidade: livres, contraturno: livres };
    }
    return {
      dia: dia,
      comunidade: Math.max(0, CLUBE.VAGAS - CLUBE.VAGAS_CONTRATURNO - comunidade),
      contraturno: Math.max(0, CLUBE.VAGAS_CONTRATURNO - contraturno)
    };
  });
}

function lerInscricoesClube_(planilha) {
  const aba = planilha.getSheetByName('Inscrições');
  if (!aba || aba.getLastRow() < 2) return [];
  const iSit = 2, iContra = 9, iDias = 10;
  return aba.getRange(2, 1, aba.getLastRow() - 1, COL_CLUBE.length).getDisplayValues().map(function (r) {
    const contra = Object.keys(CONTRATURNO_CLUBE).filter(function (k) { return CONTRATURNO_CLUBE[k] === r[iContra]; })[0] || 'nao';
    const dias = CLUBE.DIAS.filter(function (d) { return String(r[iDias]).indexOf(CLUBE.NOME_DIA[d]) >= 0; });
    return { situacao: r[iSit], contraturno: contra, dias: dias };
  });
}

// GET ?clube=vagas
function clubeVagas_() {
  const planilha = planilha_(PropertiesService.getScriptProperties().getProperty('CLUBE_PLANILHA_ID'));
  if (!planilha) return { ok: false, erro: 'As inscrições ainda não abriram.' };
  const hoje = hojeClube_();
  return { ok: true, reservaAte: CLUBE.RESERVA_ATE, reserva: hoje <= CLUBE.RESERVA_ATE, vagas: vagasClube_(lerInscricoesClube_(planilha), hoje) };
}


/* ------------------------------------------------------------------ */
/* Inscrição                                                           */
/* ------------------------------------------------------------------ */

function idadeEm_(nascimento, referencia) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(nascimento);
  const r = referencia.split('-').map(Number);
  let idade = r[0] - +m[3];
  if (r[1] < +m[2] || (r[1] === +m[2] && r[2] < +m[1])) idade--;
  return idade;
}

function validarClube_(d) {
  if (!d || typeof d !== 'object') throw new Error('Inscrição inválida. Recarregue a página e tente de novo.');
  const lista = Array.isArray(d.criancas) ? d.criancas : [];
  if (!lista.length || lista.length > CLUBE.MAX_CRIANCAS) throw new Error('Inscreva de 1 a ' + CLUBE.MAX_CRIANCAS + ' crianças.');
  const criancas = lista.map(function (x, i) {
    const n = 'Criança ' + (i + 1) + ': ';
    const c = {
      nome: txt_(x.nome, 150),
      nascimento: txt_(x.nascimento, 10),
      escola: txt_(x.escola, 100),
      serie: txt_(x.serie, 40),
      contraturno: CONTRATURNO_CLUBE[x.contraturno] ? x.contraturno : '',
      dias: (Array.isArray(x.dias) ? x.dias : []).filter(function (dia, k, todos) { return CLUBE.DIAS.indexOf(dia) >= 0 && todos.indexOf(dia) === k; }),
      alergias: txt_(x.alergias, 500)
    };
    if (palavras_(c.nome) < 2) throw new Error(n + 'escreva o nome completo.');
    if (!dataValida_(c.nascimento)) throw new Error(n + 'confira a data de nascimento (dd/mm/aaaa).');
    c.idade = idadeEm_(c.nascimento, CLUBE.REFERENCIA_IDADE);
    if (c.idade < CLUBE.IDADE_MIN || c.idade > CLUBE.IDADE_MAX) throw new Error(n + 'o Clube é para crianças de 3 a 12 anos.');
    c.grupo = c.idade <= 7 ? '3 a 7 anos' : '8 a 12 anos';
    if (!c.contraturno) throw new Error(n + 'diga se faz Contraturno na Índigo.');
    if (!c.dias.length) throw new Error(n + 'escolha pelo menos uma tarde.');
    c.dias.sort();
    c.valor = valorClube_(c.dias.length, c.contraturno);
    return c;
  });
  const f = {
    respNome: txt_(d.respNome, 150),
    respTelefone: txt_(d.respTelefone, 30),
    respEmail: txt_(d.respEmail, 120),
    emergNome: txt_(d.emergNome, 150),
    emergTelefone: txt_(d.emergTelefone, 30),
    autorizaImagem: ['Sim, autorizo', 'Não autorizo'].indexOf(d.autorizaImagem) >= 0 ? d.autorizaImagem : '',
    consentimento: d.consentimento === true ? 'Sim' : ''
  };
  if (palavras_(f.respNome) < 2) throw new Error('Escreva o nome completo do responsável.');
  if (soDigitos_(f.respTelefone).length < 10) throw new Error('Confira o WhatsApp do responsável, com DDD.');
  if (f.respEmail && !emailValido_(f.respEmail)) throw new Error('Confira o e-mail do responsável.');
  if (palavras_(f.emergNome) < 1 || soDigitos_(f.emergTelefone).length < 10) throw new Error('Preencha o contato de emergência, com DDD.');
  if (!f.autorizaImagem) throw new Error('Responda sobre o uso de imagem.');
  if (!f.consentimento) throw new Error('Marque a autorização para usar os dados da inscrição.');
  return { f: f, criancas: criancas };
}

// Pix copia e cola (BR Code estático do Banco Central), como src/dominio/pix.ts do sistema.
function pixClube_(chave, centavos, txid) {
  const campo = function (id, v) { return id + ('0' + v.length).slice(-2) + v; };
  const valor = Math.floor(centavos / 100) + '.' + ('0' + (centavos % 100)).slice(-2);
  const semCrc = campo('00', '01') + campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', chave)) + campo('52', '0000') +
    campo('53', '986') + campo('54', valor) + campo('58', 'BR') + campo('59', CLUBE.PIX_NOME) + campo('60', CLUBE.PIX_CIDADE) +
    campo('62', campo('05', txid)) + '6304';
  let crc = 0xffff;
  Utilities.newBlob(semCrc).getBytes().forEach(function (b) {
    crc ^= (b & 0xff) << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  });
  return semCrc + ('000' + crc.toString(16).toUpperCase()).slice(-4);
}

const reaisClube_ = function (c) { return (c / 100).toFixed(2).replace('.', ','); };

function clubeInscrever_(d) {
  if (typeof d.tempo === 'number' && d.tempo < 5000) throw new Error('Envio muito rápido. Confira os dados e envie de novo.');
  if (d.site) registrarDiagnostico_({ evento: 'campo escondido preenchido (Clube)', tipo: 'aviso', detalhe: 'A inscrição foi gravada normalmente. Confira se é real.' });

  const props = PropertiesService.getScriptProperties();
  const planilha = planilha_(props.getProperty('CLUBE_PLANILHA_ID'));
  const alergias = planilha_(props.getProperty('CLUBE_ALERGIAS_ID'));
  if (!planilha || !alergias) throw new Error('As inscrições ainda não abriram. Fale com a Índigo pelo WhatsApp.');

  const v = validarClube_(d);
  const agora = new Date();
  const carimbo = Utilities.formatDate(agora, CONFIG.FUSO, 'yyMMddHHmmss');
  const sufixo = Math.random().toString(36).slice(2, 5).toUpperCase();
  const envio = 'C' + carimbo.slice(0, 6) + '-' + carimbo.slice(6) + '-' + sufixo;
  const total = v.criancas.reduce(function (s, c) { return s + c.valor; }, 0);

  const trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    // Confere as vagas de novo, com as inscrições de agora, antes de gravar.
    const vagas = vagasClube_(lerInscricoesClube_(planilha), hojeClube_());
    const pedidos = {};
    v.criancas.forEach(function (c) {
      const tipo = c.contraturno === 'nao' ? 'comunidade' : 'contraturno';
      c.dias.forEach(function (dia) { pedidos[dia + '|' + tipo] = (pedidos[dia + '|' + tipo] || 0) + 1; });
    });
    vagas.forEach(function (x) {
      ['comunidade', 'contraturno'].forEach(function (tipo) {
        if ((pedidos[x.dia + '|' + tipo] || 0) > x[tipo]) {
          throw new Error('A tarde de ' + CLUBE.NOME_DIA[x.dia].replace(/^\S+ /, '') + '/12 não tem mais vaga' +
            (x[tipo] ? ' para todas as crianças (sobram ' + x[tipo] + ')' : '') + '. Escolha outra tarde.');
        }
      });
    });
    const situacao = total > 0 ? 'Aguardando Pix' : 'Contraturno: conferir';
    gravar_(planilha.getSheetByName('Inscrições'), COL_CLUBE, v.criancas.map(function (c) {
      return {
        dataHora: agora, envio: envio, situacao: situacao, crianca: c.nome, nascimento: c.nascimento, idade: String(c.idade),
        grupo: c.grupo, escola: c.escola, serie: c.serie, contraturno: CONTRATURNO_CLUBE[c.contraturno],
        dias: c.dias.map(function (dia) { return CLUBE.NOME_DIA[dia]; }).join(', '), valor: reaisClube_(c.valor),
        total: reaisClube_(total), respNome: v.f.respNome, respTelefone: v.f.respTelefone, respEmail: v.f.respEmail,
        emergNome: v.f.emergNome, emergTelefone: v.f.emergTelefone, autorizaImagem: v.f.autorizaImagem, consentimento: v.f.consentimento
      };
    }));
    gravar_(alergias.getSheetByName('Alergias'), COL_CLUBE_ALERGIAS, v.criancas.filter(function (c) { return c.alergias; }).map(function (c) {
      return { dataHora: agora, envio: envio, crianca: c.nome, nascimento: c.nascimento, alergias: c.alergias };
    }));
  } finally {
    trava.releaseLock();
  }

  const chave = soDigitos_(props.getProperty('PIX_CHAVE'));
  const pix = total > 0 && chave.length === 14 ? pixClube_(chave, total, 'CLUBE' + carimbo + sufixo) : null;
  try {
    MailApp.sendEmail({
      to: CONFIG.AVISO_EMAIL,
      subject: ('Clube de Férias: inscrição de ' + v.criancas.map(function (c) { return c.nome.split(/\s+/)[0]; }).join(', ')).replace(/[\r\n]+/g, ' '),
      body: [
        'Chegou uma inscrição no Clube de Férias de dezembro.',
        '',
        v.criancas.map(function (c) {
          return c.nome + ' (' + c.grupo + '), Contraturno: ' + CONTRATURNO_CLUBE[c.contraturno] + ', tardes: ' +
            c.dias.map(function (dia) { return CLUBE.NOME_DIA[dia]; }).join(', ') + ', R$ ' + reaisClube_(c.valor);
        }).join('\n'),
        '',
        'Total: R$ ' + reaisClube_(total) + (total > 0 ? ' (aguardando o Pix)' : ' (só Contraturno: conferir)'),
        'Responsável: ' + v.f.respNome + ' (' + v.f.respTelefone + ')',
        v.criancas.some(function (c) { return c.alergias; }) ? 'Alergias informadas: sim, na planilha restrita.' : 'Sem alergias informadas.',
        'Código: ' + envio,
        '',
        'Planilha: ' + planilha.getUrl()
      ].join('\n')
    });
  } catch (e) {
    // O aviso é cortesia: a inscrição já foi gravada.
  }
  return { ok: true, envio: envio, total: total, pix: pix, primeiroNome: v.f.respNome.split(/\s+/)[0] };
}
