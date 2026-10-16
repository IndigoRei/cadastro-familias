"""Testa a página equipe.indigorei.com.br com o servidor simulado (celular e computador). Uso: python3 testes-locais/equipe.py"""
import json, sys, subprocess, time, os
from playwright.sync_api import sync_playwright

import tempfile
from PIL import Image
PASTA = os.environ.get('EQ', '/home/claude/cadastro-equipe')
SAIDA = tempfile.mkdtemp(prefix='teste-equipe-')
FOTO = SAIDA + '/foto_teste.jpg'
Image.new('RGB', (1200, 1500), (180, 160, 140)).save(FOTO, quality=90)
srv = subprocess.Popen(['python3', '-m', 'http.server', '8732', '--bind', '127.0.0.1'], cwd=PASTA,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
falhas = []
def checa(c, m):
    print(('OK   ' if c else 'FALHA') + ' ' + m)
    if not c: falhas.append(m)

def preencher(pg):
    pg.fill('#nomeCompleto', 'Teste Fictício da Silva')
    pg.fill('#nomeProfissional', 'Prof.ª Teste')
    pg.click('text=Professor(a)')
    pg.fill('#whatsapp', '61999990000')
    pg.fill('#email', 'teste@exemplo.com')
    pg.fill('#graduacao', 'Pedagogia, Universidade Fictícia, 2015')
    pg.select_option('#experiencia', '5 a 10 anos')
    pg.click('text=Matemática')
    pg.set_input_files('#foto', FOTO)
    pg.wait_for_selector('#fotoPrevia.com-foto', timeout=10000)
    pg.fill('#bioCurta', 'Pedagoga há 10 anos, apaixonada por matemática e por descobrir como cada criança aprende.')
    pg.click('text=Baby look')
    pg.click('.tam:has-text("M") >> nth=0')
    pg.click('label.aceite:has(#autorizaImagem)')
    pg.click('label.aceite:has(#declaracao)')

with sync_playwright() as p:
    nav = p.chromium.launch()
    for nome, vp, mob in [('celular', {'width': 390, 'height': 844}, True), ('computador', {'width': 1280, 'height': 900}, False)]:
        ctx = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob)
        pg = ctx.new_page()
        recebido = {}
        modo = {'resposta': {'ok': True, 'primeiroNome': 'Teste', 'atualizado': False}}
        def rota(route):
            r = route.request
            if 'script.google.com' in r.url:
                if r.method == 'POST':
                    recebido['ct'] = r.headers.get('content-type')
                    recebido['dados'] = json.loads(r.post_data)
                    time.sleep(0.8)
                    return route.fulfill(status=200, content_type='application/json', body=json.dumps(modo['resposta']))
                recebido['acordar'] = r.url
                return route.fulfill(status=200, body='ok')
            if 'fonts.g' in r.url:
                return route.fulfill(status=200, body='')
            return route.continue_()
        ctx.route('**/*', rota)
        pg.goto('http://127.0.0.1:8732/', wait_until='load')
        pg.wait_for_timeout(500)
        checa(pg.title() == 'Cadastro da Equipe | Índigo Rei', f'{nome}: título')
        checa(pg.evaluate("document.querySelector('.logo').naturalWidth") > 0, f'{nome}: logo carregou')
        checa('acordar=1' in recebido.get('acordar', ''), f'{nome}: acorda o servidor ao abrir')
        pg.screenshot(path=f'{SAIDA}/eq_{nome}_topo.png')

        # envio vazio mostra erros
        pg.click('#enviar')
        pg.wait_for_timeout(500)
        checa('Confira' in pg.inner_text('#alerta'), f'{nome}: envio vazio avisa o que falta')
        checa('dados' not in recebido, f'{nome}: nada enviado com respostas faltando')

        preencher(pg)
        # erro do servidor aparece
        modo['resposta'] = {'ok': False, 'erro': 'Confira o e-mail informado.'}
        pg.click('#enviar')
        pg.wait_for_timeout(1500)
        checa('Confira o e-mail informado.' in pg.inner_text('#alerta'), f'{nome}: mensagem de erro do servidor aparece')
        checa(pg.is_enabled('#enviar'), f'{nome}: botão volta a funcionar depois do erro')

        modo['resposta'] = {'ok': True, 'primeiroNome': 'Teste', 'atualizado': False}
        pg.evaluate("window.__textos=[]; new MutationObserver(()=>window.__textos.push(document.getElementById('avisoEnvio').textContent)).observe(document.getElementById('avisoEnvio'),{childList:true,characterData:true,subtree:true})")
        pg.click('#enviar')
        pg.wait_for_selector('#sucesso.visivel', timeout=8000)
        checa(any('Não feche' in t for t in pg.evaluate('window.__textos')), f'{nome}: aviso para não fechar durante o envio')
        pg.wait_for_selector('#sucesso.visivel', timeout=8000)
        d = recebido.get('dados', {})
        checa(recebido.get('ct', '').startswith('text/plain'), f'{nome}: envio sem pré-verificação de CORS (text/plain)')
        checa(d.get('nomeCompleto') == 'Teste Fictício da Silva' and d.get('tamanho') == 'M' and d.get('modelagem') == 'Baby look', f'{nome}: dados principais no envio')
        checa(d.get('autorizaImagem') is True and d.get('declaracao') is True, f'{nome}: autorizações enviadas')
        fb = (d.get('foto') or {}).get('base64', '')
        checa(len(fb) > 10000, f'{nome}: foto enviada ({len(fb)//1024} KB em base64)')
        checa('Obrigado, Teste!' in pg.inner_text('#sucesso'), f'{nome}: tela de confirmação')
        pg.screenshot(path=f'{SAIDA}/eq_{nome}_sucesso.png')
        ctx.close()
    nav.close()
srv.terminate()
print('\n' + ('TUDO CERTO' if not falhas else f'{len(falhas)} FALHA(S)'))
sys.exit(1 if falhas else 0)
