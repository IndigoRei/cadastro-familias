/**
 * CLUBE DE FÉRIAS: ALERGIAS (servidor), na mesma implantação do cadastro das famílias.
 *
 * Desde 29/10/2026 a inscrição no Clube é feita no sistema (sistema.indigorei.com.br/clube e a área da família;
 * planta do sistema, seção 3.5, "Inscrição pelo sistema"): vagas, Pix e confirmação do pagamento ficam lá. Aqui fica
 * só o que é dado de saúde e não entra no sistema: as alergias e restrições alimentares, numa planilha da pasta
 * restrita ("Clube de Férias dezembro 2026 (alergias)").
 *
 * A página manda as alergias com a referência da inscrição. Antes de gravar, este servidor confere no sistema que a
 * inscrição existe, é recente (2 horas) e tem estas crianças (função clube_referencia_recente, com a chave pública do
 * sistema já usada no cadastro). Nenhum outro dado vem para cá, e nada daqui vai para o sistema ou para e-mail.
 * A planilha antiga de inscrições fica como estava, só para consulta.
 *
 * Endereço antigo (cadastro.indigorei.com.br/clube): a página leva para o sistema; quem estiver com a página antiga
 * aberta recebe o recado com o endereço novo.
 */

const CLUBE = {
  PLANILHA_ALERGIAS: 'Clube de Férias dezembro 2026 (alergias)',
  ENDERECO: 'https://sistema.indigorei.com.br/clube',
  ALERGIAS_POR_HORA: 60,
  MAX_CRIANCAS: 8
};

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
  const restrita = pasta_(props.getProperty('PASTA_RESTRITA_ID'));
  if (!restrita) throw new Error('Rode configurar() do cadastro primeiro.');
  let alergias = planilha_(props.getProperty('CLUBE_ALERGIAS_ID'));
  if (!alergias) {
    alergias = SpreadsheetApp.create(CLUBE.PLANILHA_ALERGIAS);
    DriveApp.getFileById(alergias.getId()).moveTo(restrita);
    props.setProperty('CLUBE_ALERGIAS_ID', alergias.getId());
    prepararPlanilha_(alergias, [['Alergias', COL_CLUBE_ALERGIAS]]);
  }
  const resumo = [
    'Clube pronto (só as alergias; a inscrição é no sistema).',
    'Alergias (restrita): ' + alergias.getUrl(),
    props.getProperty('SISTEMA_URL') && props.getProperty('SISTEMA_CHAVE_PUBLICA')
      ? 'Ligação com o sistema: ok.' : 'Falta SISTEMA_URL ou SISTEMA_CHAVE_PUBLICA nas propriedades do script.'
  ].join('\n');
  Logger.log(resumo);
  return resumo;
}


/* ------------------------------------------------------------------ */
/* Endereço antigo                                                     */
/* ------------------------------------------------------------------ */

// GET ?clube=vagas da página antiga: as inscrições mudaram de endereço.
function clubeVagas_() {
  return { ok: false, mudou: true, endereco: CLUBE.ENDERECO, erro: 'As inscrições do Clube agora são em ' + CLUBE.ENDERECO };
}

// POST tipo clube da página antiga: o mesmo recado.
function clubeInscrever_() {
  throw new Error('As inscrições do Clube agora são em ' + CLUBE.ENDERECO + '. Abra o endereço e faça a inscrição por lá.');
}


/* ------------------------------------------------------------------ */
/* Alergias                                                            */
/* ------------------------------------------------------------------ */

// POST { tipo: 'clube_alergias', referencia, criancas: [{ nome, nascimento, alergias }] }
function clubeAlergias_(d) {
  if (!dentroDoLimite_('clube-alergias', CLUBE.ALERGIAS_POR_HORA, 3600)) {
    throw new Error('Recebemos muitos envios agora. Mande as alergias pelo WhatsApp da Índigo.');
  }
  const referencia = String((d && d.referencia) || '');
  if (!/^C\d{6}-\d{4}-[A-Z0-9]{3}$/.test(referencia)) throw new Error('Referência da inscrição inválida.');
  const lista = Array.isArray(d.criancas) ? d.criancas : [];
  if (!lista.length || lista.length > CLUBE.MAX_CRIANCAS) throw new Error('Envio inválido.');
  const criancas = lista.map(function (c) {
    return { nome: txt_(c && c.nome, 150), nascimento: txt_(c && c.nascimento, 10), alergias: txt_(c && c.alergias, 500) };
  }).filter(function (c) { return c.nome && c.alergias; });
  if (!criancas.length) return { ok: true };
  if (!inscricaoNoSistema_(referencia, criancas.map(function (c) { return c.nome; }))) {
    throw new Error('Não encontramos a inscrição. Mande as alergias pelo WhatsApp da Índigo.');
  }

  const planilha = planilha_(PropertiesService.getScriptProperties().getProperty('CLUBE_ALERGIAS_ID'));
  if (!planilha) throw new Error('A planilha das alergias não está pronta. Mande pelo WhatsApp da Índigo.');
  const aba = planilha.getSheetByName('Alergias');
  const trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    // Reenvio da mesma inscrição (a página tenta duas vezes): a mesma criança não entra em dobro.
    const ja = aba.getLastRow() >= 2
      ? aba.getRange(2, 1, aba.getLastRow() - 1, COL_CLUBE_ALERGIAS.length).getDisplayValues()
          .map(function (r) { return r[1] + '|' + r[2]; })
      : [];
    const agora = new Date();
    const novas = criancas.filter(function (c) { return ja.indexOf(referencia + '|' + c.nome) < 0; });
    if (novas.length) {
      gravar_(aba, COL_CLUBE_ALERGIAS, novas.map(function (c) {
        return { dataHora: agora, envio: referencia, crianca: c.nome, nascimento: c.nascimento, alergias: c.alergias };
      }));
    }
  } finally {
    trava.releaseLock();
  }
  return { ok: true };
}

// A inscrição existe no sistema, é recente e tem estas crianças (clube_referencia_recente). Sem a ligação configurada
// ou com o sistema fora do ar: falso, e a página pede para mandar pelo WhatsApp.
function inscricaoNoSistema_(referencia, nomes) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SISTEMA_URL');
  const publica = props.getProperty('SISTEMA_CHAVE_PUBLICA');
  if (!url || !publica) return false;
  try {
    const resposta = UrlFetchApp.fetch(url.replace(/\/+$/, '') + '/rest/v1/rpc/clube_referencia_recente', {
      method: 'post',
      contentType: 'application/json',
      headers: { apikey: publica },
      payload: JSON.stringify({ p_referencia: referencia, p_nomes: nomes }),
      muteHttpExceptions: true
    });
    return resposta.getResponseCode() < 300 && String(resposta.getContentText()).trim() === 'true';
  } catch (err) {
    registrarDiagnostico_({ evento: 'falha ao conferir inscrição do Clube', tipo: 'sistema', detalhe: String(err && err.message || err) });
    return false;
  }
}
