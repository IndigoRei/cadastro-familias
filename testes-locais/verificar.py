"""Testes locais dos dois formulários (não fazem parte do site; ficam só nesta branch).
Gera os arquivos de teste, compara com a versão no ar (origin/main) e testa as melhorias com servidor simulado.
Uso: python3 testes-locais/verificar.py [--rapido]
Variáveis opcionais: FAM e EQ com as pastas dos dois repositórios."""
import json, subprocess, time, sys, os, tempfile
from playwright.sync_api import sync_playwright
from PIL import Image

FAM = os.environ.get('FAM', '/home/claude/cadastro-familias')
EQ = os.environ.get('EQ', '/home/claude/cadastro-equipe')
A = tempfile.mkdtemp(prefix='teste-formularios-')
RAPIDO = '--rapido' in sys.argv
for nome, pasta in (('familias', FAM), ('equipe', EQ)):
    os.makedirs(f'{A}/antigo/{nome}')
    subprocess.run(f'git -C "{pasta}" archive origin/main | tar -x -C "{A}/antigo/{nome}"', shell=True, check=True)
with open(f'{A}/grande.pdf', 'wb') as f: f.write(b'%PDF-1.4\n' + os.urandom(11 * 1048576))
with open(f'{A}/IMG_4821.HEIC', 'wb') as f: f.write(b'\x00\x00\x00\x18ftypheic' + os.urandom(300 * 1024))
img = Image.new('RGB', (3024, 4032), (200, 180, 150))
for n in ('foto3024.jpg', 'Relatório de avaliação psicopedagógica completo - Escola Fictícia - versão final revisada (2).jpg',
          'IMG_20261016_143522_HDR_BURST001_COVER_retrato_profissional_final.jpg'):
    img.save(f'{A}/{n}', quality=90)
PASTAS = {'fam': FAM, 'eq': EQ, 'fam_antigo': f'{A}/antigo/familias', 'eq_antigo': f'{A}/antigo/equipe'}
PORTAS = {'fam': 8741, 'eq': 8742, 'fam_antigo': 8743, 'eq_antigo': 8744}
srv = [subprocess.Popen(['python3', '-m', 'http.server', str(PORTAS[k]), '--bind', '127.0.0.1'], cwd=PASTAS[k],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) for k in PASTAS]
time.sleep(1)
falhas = []
def checa(c, m):
    print(('OK    ' if c else 'FALHA ') + m)
    if not c: falhas.append(m)

ATRASO_POST = """(ms) => { const f = window.fetch; window.fetch = function (u, o) {
  if (o && o.method === 'POST') return new Promise(r => setTimeout(r, ms)).then(() => f(u, o)); return f(u, o); } }"""

def contexto(nav, largura, registro):
    ctx = nav.new_context(viewport={'width': largura, 'height': 820}, is_mobile=True, has_touch=True, device_scale_factor=2)
    def rota(route):
        r = route.request; u = r.url
        if 'script.google.com' in u:
            if r.method == 'POST':
                registro['post'] = json.loads(r.post_data)
                return route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'envio': 'X1', 'primeiroNome': 'Teste'}))
            registro.setdefault('get', []).append(u)
            return route.fulfill(status=200, body='ok')
        if 'viacep' in u:
            cep = u.split('/ws/')[1].split('/')[0]
            if cep == '70000000': return route.fulfill(status=200, content_type='application/json', body='{"erro": "true"}')
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'logradouro': 'SQS 308 Bloco A', 'bairro': 'Asa Sul', 'localidade': 'Brasília', 'uf': 'DF'}))
        if 'fonts.g' in u: return route.fulfill(status=200, body='')
        return route.continue_()
    ctx.route('**/*', rota)
    return ctx

def preencher_fam(pg, email='teste@exemplo.com'):
    pg.fill('[data-k=nome]', 'Teste Fictício'); pg.select_option('[data-k=nascDia]', '10'); pg.select_option('[data-k=nascMes]', '03'); pg.select_option('[data-k=nascAno]', '2016')
    pg.fill('[data-k=naturalidade]', 'Brasília/DF'); pg.fill('[data-k=escola]', 'Escola Fictícia'); pg.select_option('[data-k=serie]', index=3)
    pg.fill('[data-k=objetivos]', 'Mais autonomia nos estudos.')
    for k in ('preocupacao', 'diagnostico', 'historico'): pg.click(f'.aprendiz label.op:has([data-k={k}][value="Não"])')
    pg.fill('#respNome', 'Responsável Fictício'); pg.click('label.op:has([name=respParentesco][value="Mãe"])')
    pg.fill('#respCpf', '52998224725'); pg.fill('#respRg', '1234567 SSP/DF'); pg.select_option('#respEstadoCivil', 'Casado(a)')
    pg.fill('#respTelefone', '61999990000'); pg.fill('#respEmail', email); pg.fill('#cep', '70385010'); pg.wait_for_timeout(400)
    pg.fill('#numero', '10'); pg.click('label.op:has([name=finQuem][value="Responsável principal"])'); pg.click('label.op:has([name=autorizaImagem][value="Não autorizo"])')
    pg.click('label.aceite:has(#consentimento)'); pg.click('label.aceite:has(#declaracao)')

def preencher_eq(pg, email='teste@exemplo.com'):
    pg.fill('#nomeCompleto', 'Teste Fictício da Silva'); pg.fill('#nomeProfissional', 'Prof.ª Teste'); pg.click('text=Professor(a)')
    pg.fill('#whatsapp', '61999990000'); pg.fill('#email', email); pg.fill('#graduacao', 'Pedagogia, Universidade Fictícia, 2015')
    pg.select_option('#experiencia', '5 a 10 anos'); pg.click('text=Matemática')
    pg.set_input_files('#foto', f'{A}/foto3024.jpg'); pg.wait_for_selector('#fotoPrevia.com-foto', timeout=10000)
    pg.fill('#bioCurta', 'Pedagoga há 10 anos, apaixonada por matemática e por descobrir como cada criança aprende.')
    pg.click('text=Baby look'); pg.click('.tam:has-text("M") >> nth=0')
    pg.click('label.aceite:has(#autorizaImagem)'); pg.click('label.aceite:has(#declaracao)')

def envio(nav, chave, preencher, url_sucesso='#sucesso.visivel'):
    reg = {}; ctx = contexto(nav, 390, reg); pg = ctx.new_page()
    pg.goto(f'http://127.0.0.1:{PORTAS[chave]}/', wait_until='load'); pg.wait_for_timeout(300)
    preencher(pg); pg.click('#enviar'); pg.wait_for_selector(url_sucesso, timeout=10000)
    ctx.close()
    return reg

with sync_playwright() as p:
    nav = p.chromium.launch()

    # ---------- 1. o envio continua igual ao da versão no ar ----------
    for novo, antigo, preencher in (('fam', 'fam_antigo', preencher_fam), ('eq', 'eq_antigo', preencher_eq)):
        a, b = envio(nav, antigo, preencher)['post'], envio(nav, novo, preencher)['post']
        for d in (a, b): d.pop('tempo', None); d.pop('versao', None)
        if 'foto' in a: a['foto'] = bool(a['foto']); b['foto'] = bool(b['foto'])
        checa(sorted(a) == sorted(b), f'{novo}: mesmos campos no envio que a versão no ar ({len(b)} campos)')
        dif = [k for k in a if a.get(k) != b.get(k)]
        checa(not dif, f'{novo}: mesmos valores no envio que a versão no ar' + (f' (diferem: {dif})' if dif else ''))

    # ---------- 2. famílias ----------
    reg = {}; ctx = contexto(nav, 390, reg); pg = ctx.new_page()
    pg.goto(f'http://127.0.0.1:{PORTAS["fam"]}/', wait_until='load'); pg.wait_for_timeout(300)
    # Enter não envia
    pg.click('#respCpf'); pg.keyboard.type('52998224725'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    checa(not pg.is_visible('#alerta'), 'fam: Enter no CPF não envia o formulário')
    checa(pg.evaluate('document.activeElement.id') == 'respRg', 'fam: Enter no CPF leva ao RG')
    checa(pg.get_attribute('#respCpf', 'enterkeyhint') == 'next', 'fam: tecla do celular diz "seguinte" no CPF')
    pg.click('#respEmail'); pg.wait_for_timeout(50)
    checa(pg.get_attribute('#respEmail', 'enterkeyhint') == 'next', 'fam: no e-mail a tecla diz "seguinte" (vai para o CEP)')
    pg.click('#respProfissao'); pg.wait_for_timeout(50)
    checa(pg.get_attribute('#respProfissao', 'enterkeyhint') == 'done', 'fam: antes de uma lista de opções a tecla diz "OK" e só fecha o teclado')
    pg.click('[data-k=nome]'); pg.keyboard.type('Ana'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    checa(not pg.is_visible('#alerta') and pg.locator('.campo.tem-erro').count() == 0, 'fam: Enter no nome do aprendiz não acende erros')
    # data de nascimento cabe
    for larg in (360, 375, 390):
        pg.set_viewport_size({'width': larg, 'height': 820}); pg.wait_for_timeout(100)
        cab = pg.evaluate("""() => Array.from(document.querySelectorAll('.data3 select')).map(s => {
            const cs = getComputedStyle(s); const livre = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            const c = document.createElement('canvas').getContext('2d'); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
            return livre - Math.max(...Array.from(s.options).map(o => c.measureText(o.text).width)) })""")
        checa(min(cab) >= 0, f'fam {larg}px: dia, mês e ano cabem nos seletores (folga mínima {min(cab):.0f}px)')
        larg_end = pg.evaluate("document.getElementById('logradouro').getBoundingClientRect().width / document.getElementById('cep').getBoundingClientRect().width")
        checa(larg_end > 0.95, f'fam {larg}px: Endereço ocupa a largura toda')
        pequenos = pg.evaluate("""() => Array.from(document.querySelectorAll('.op span, .botao-remover, .anexos-lista button, .erro-acao')).filter(e => e.offsetParent && e.getBoundingClientRect().height < 44).length""")
        checa(pequenos == 0, f'fam {larg}px: nenhum alvo de toque abaixo de 44px')
        sw = pg.evaluate('document.documentElement.scrollWidth')
        checa(sw <= larg, f'fam {larg}px: sem rolagem lateral')
    pg.set_viewport_size({'width': 390, 'height': 820})
    pg.locator('.data3').first.screenshot(path=f'{A}/v_fam_data_390.png')
    # CEP
    pg.fill('#cep', ''); pg.type('#cep', '70000000'); pg.wait_for_timeout(400)
    checa(pg.is_visible('#cepAviso'), 'fam: CEP não encontrado mostra aviso')
    pg.fill('#cep', ''); pg.type('#cep', '70385010'); pg.wait_for_timeout(400)
    checa(not pg.is_visible('#cepAviso') and pg.input_value('#bairro') == 'Asa Sul', 'fam: CEP certo esconde o aviso e preenche o endereço')
    pg.locator('[data-campo=cep]').locator('xpath=..').screenshot(path=f'{A}/v_fam_endereco_390.png')
    # e-mail
    pg.click('#enviar'); pg.wait_for_timeout(500)
    checa(pg.inner_text('#alerta').startswith('Confira'), 'fam: alerta do envio incompleto: ' + pg.inner_text('#alerta'))
    for em, esperado in (('', 'Informe o e-mail.'), ('fulano', 'Falta o @'), ('fulano@gmail', 'Falta o final'), ('fulano@gmail,com', 'vírgula'), ('ful ano@gmail.com', 'espaços')):
        pg.fill('#respEmail', em); pg.wait_for_timeout(50)
        checa(esperado in pg.inner_text('[data-campo=respEmail] .erro-msg'), f'fam: e-mail "{em}" -> {pg.inner_text("[data-campo=respEmail] .erro-msg")}')
    for em in ('fulano@gmail.com', 'fulano@hotmail.com.br', 'fulano@yahoo.com.br', 'fulano@empresa.com.br', 'fulano@gmail.com.br', 'fulano@uol.com.br'):
        pg.fill('#respEmail', em); pg.wait_for_timeout(50)
        checa(pg.locator('[data-campo=respEmail].tem-erro').count() == 0, f'fam: e-mail certo "{em}" é aceito')
    pg.fill('#respEmail', 'Fulano.Silva@gmial.con'); pg.wait_for_timeout(50)
    checa('fulano.silva@gmail.com' in pg.inner_text('[data-campo=respEmail] .erro-msg').lower(), 'fam: sugere a correção de "gmial.con"')
    checa(pg.get_attribute('#respEmail', 'aria-invalid') == 'true' and pg.get_attribute('#respEmail', 'aria-describedby'), 'fam: leitor de tela sabe que o e-mail tem erro')
    pg.locator('[data-campo=respEmail]').screenshot(path=f'{A}/v_fam_email.png')
    pg.click('[data-campo=respEmail] .erro-acao'); pg.wait_for_timeout(100)
    checa(pg.input_value('#respEmail') == 'Fulano.Silva@gmail.com' and pg.locator('[data-campo=respEmail].tem-erro').count() == 0, 'fam: botão Corrigir troca e limpa o aviso')
    grupos = pg.evaluate("[document.querySelectorAll('.opcoes[role=radiogroup][aria-label]').length, document.querySelectorAll('.opcoes').length]")
    checa(grupos[0] == grupos[1] and grupos[0] > 0, f'fam: grupos de opção com nome ({grupos[0]} de {grupos[1]})')
    # anexos
    inp = pg.locator('.anexos-input').first
    inp.set_input_files([f'{A}/IMG_4821.HEIC']); pg.wait_for_timeout(800)
    checa('PDF ou JPG' in pg.locator('[data-campo=arquivos] .erro-msg').first.inner_text(), 'fam: HEIC ilegível explica o que fazer')
    inp.set_input_files([f'{A}/Relatório de avaliação psicopedagógica completo - Escola Fictícia - versão final revisada (2).jpg', f'{A}/foto3024.jpg'])
    pg.evaluate("document.getElementById('enviar').click()"); pg.wait_for_timeout(30)
    checa('Espere os arquivos' in pg.inner_text('#alerta'), 'fam: Enviar durante a preparação dos anexos pede para esperar')
    pg.wait_for_timeout(3000)
    checa(pg.locator('.anexos-lista li').count() == 2, 'fam: os dois anexos entram depois de preparados')
    checa(pg.evaluate('document.documentElement.scrollWidth') <= 390 and pg.evaluate("document.querySelector('.anexos-lista button').getBoundingClientRect().right") <= 390, 'fam: anexo com nome longo não alarga a página e o Remover fica na tela')
    pg.locator('.anexos-lista').first.scroll_into_view_if_needed(); pg.locator('[data-campo=arquivos]').first.screenshot(path=f'{A}/v_fam_anexos.png')
    # rascunho
    pg.wait_for_timeout(500); pg.reload(wait_until='load'); pg.wait_for_timeout(400)
    checa(pg.is_visible('#avisoRascunho'), 'fam: ao voltar, avisa que recuperou o rascunho')
    pg.screenshot(path=f'{A}/v_fam_topo.png')
    ctx.close(); reg = {}; ctx = contexto(nav, 390, reg); pg = ctx.new_page()
    pg.goto(f'http://127.0.0.1:{PORTAS["fam"]}/', wait_until='load'); pg.wait_for_timeout(300)
    checa(not pg.is_visible('#avisoRascunho'), 'fam: sem rascunho, sem aviso')
    # e-mail com erro mantido: segundo envio passa
    preencher_fam(pg, 'teste@gmail.con')
    pg.click('#enviar'); pg.wait_for_timeout(500)
    checa('gmail.com?' in pg.inner_text('[data-campo=respEmail] .erro-msg') and 'post' not in reg, 'fam: primeiro envio com "gmail.con" para e sugere')
    pg.fill('#respNome', 'Responsável Fictício Silva'); pg.wait_for_timeout(50)
    checa(pg.locator('[data-campo=respEmail].tem-erro').count() == 1, 'fam: aviso do e-mail continua enquanto a família mexe em outro campo')
    pg.wait_for_timeout(8000)  # o servidor recusa envios com menos de 8 s; o simulado não, mas mantemos realista
    pg.click('#enviar'); pg.wait_for_selector('#sucesso.visivel', timeout=8000)
    checa(reg.get('post', {}).get('respEmail') == 'teste@gmail.con', 'fam: se a família mantém o e-mail e envia de novo, ele vai como escreveu')
    checa(any('versao=3' in u for u in reg.get('get', [])), 'fam: diagnóstico identifica a versão 3 da página')
    ctx.close()
    if not RAPIDO:
        reg = {}; ctx = contexto(nav, 390, reg); pg = ctx.new_page()
        pg.goto(f'http://127.0.0.1:{PORTAS["fam"]}/', wait_until='load'); pg.evaluate('localStorage.clear()'); pg.reload(wait_until='load')
        preencher_fam(pg); pg.evaluate(ATRASO_POST, 17500); pg.click('#enviar'); pg.wait_for_timeout(16000)
        checa('Ainda enviando' in pg.inner_text('#envioNota'), 'fam: envio demorado avisa que continua: ' + pg.inner_text('#envioNota'))
        pg.wait_for_selector('#sucesso.visivel', timeout=10000); checa(True, 'fam: envio demorado termina normalmente')
        ctx.close()

    # ---------- 3. equipe ----------
    reg = {}; ctx = contexto(nav, 390, reg); pg = ctx.new_page()
    pg.goto(f'http://127.0.0.1:{PORTAS["eq"]}/', wait_until='load'); pg.wait_for_timeout(300)
    pg.click('#nomeCompleto'); pg.keyboard.type('Teste Fictício'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    checa(not pg.is_visible('#alerta') and pg.evaluate('document.activeElement.id') == 'nomeProfissional', 'eq: Enter no nome vai para o próximo campo e não envia')
    for larg in (360, 390):
        pg.set_viewport_size({'width': larg, 'height': 820}); pg.wait_for_timeout(100)
        pequenos = pg.evaluate("""() => Array.from(document.querySelectorAll('.chip span, .tam span, .opcao-card .caixa')).filter(e => e.offsetParent && e.getBoundingClientRect().height < 44).length""")
        checa(pequenos == 0, f'eq {larg}px: nenhum alvo de toque abaixo de 44px')
        checa(pg.evaluate('document.documentElement.scrollWidth') <= larg, f'eq {larg}px: sem rolagem lateral')
    pg.click('#enviar'); pg.wait_for_timeout(500)
    checa(pg.inner_text('#alerta').startswith('Confira'), 'eq: alerta do envio incompleto: ' + pg.inner_text('#alerta'))
    pg.fill('#email', 'fulano@hotmial.com'); pg.wait_for_timeout(50)
    checa('fulano@hotmail.com' in pg.inner_text('[data-campo=email] .erro-msg'), 'eq: sugere a correção de "hotmial.com"')
    pg.click('[data-campo=email] .erro-acao'); pg.wait_for_timeout(100)
    checa(pg.input_value('#email') == 'fulano@hotmail.com' and pg.locator('[data-campo=email].tem-erro').count() == 0, 'eq: Corrigir troca e limpa o aviso')
    grupos = pg.evaluate("document.querySelectorAll('[role=group][aria-label],[role=radiogroup][aria-label]').length")
    checa(grupos == 5, f'eq: grupos de opção com nome ({grupos} de 5)')
    pg.set_input_files('#foto', f'{A}/IMG_20261016_143522_HDR_BURST001_COVER_retrato_profissional_final.jpg'); pg.wait_for_selector('#fotoPrevia.com-foto')
    checa(pg.evaluate('document.documentElement.scrollWidth') <= 390, 'eq: foto com nome longo não alarga a página')
    pg.set_input_files('#foto', f'{A}/foto3024.jpg')
    pg.evaluate("document.getElementById('enviar').click()"); pg.wait_for_timeout(30)
    checa('Espere a foto' in pg.inner_text('#alerta'), 'eq: Enviar durante a preparação da foto pede para esperar')
    pg.wait_for_timeout(2000)
    pg.reload(wait_until='load'); pg.wait_for_timeout(300)
    checa(pg.is_visible('#avisoRascunho'), 'eq: ao voltar, avisa que recuperou o rascunho')
    pg.evaluate('localStorage.clear()'); pg.reload(wait_until='load'); pg.wait_for_timeout(300)
    checa(not pg.is_visible('#avisoRascunho'), 'eq: sem rascunho, sem aviso')
    preencher_eq(pg, 'teste@gmail.con'); pg.click('#enviar'); pg.wait_for_timeout(500)
    checa('post' not in reg, 'eq: primeiro envio com "gmail.con" para e sugere')
    pg.click('#enviar'); pg.wait_for_selector('#sucesso.visivel', timeout=8000)
    checa(reg.get('post', {}).get('email') == 'teste@gmail.con', 'eq: mantido o e-mail, o segundo envio vai como escrito')
    ctx.close()
    if not RAPIDO:
        reg = {}; ctx = contexto(nav, 390, reg); pg = ctx.new_page()
        pg.goto(f'http://127.0.0.1:{PORTAS["eq"]}/', wait_until='load')
        preencher_eq(pg); pg.evaluate(ATRASO_POST, 17500); pg.click('#enviar'); pg.wait_for_timeout(16000)
        checa('Ainda enviando' in pg.inner_text('#avisoEnvio'), 'eq: envio demorado avisa que continua')
        pg.wait_for_selector('#sucesso.visivel', timeout=10000); checa(True, 'eq: envio demorado termina normalmente')
        ctx.close()
    nav.close()
for s in srv: s.terminate()
print('\n' + ('TUDO CERTO' if not falhas else f'{len(falhas)} FALHA(S)'))
sys.exit(1 if falhas else 0)
