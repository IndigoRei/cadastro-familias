# Cadastro das famílias · Índigo Rei

Formulário público em **https://cadastro.indigorei.com.br**, publicado pelo GitHub Pages a partir da branch `main`.

Este repositório tem só o código. **Nenhum dado de família fica aqui.**

## Como funciona

- `index.html` é a página (logo, cores e textos da Índigo Rei). Ela envia o cadastro para o servidor em Apps Script.
- `servidor/Codigo.gs` é o servidor. Ele roda na conta institutoindigorei@gmail.com, no projeto "Cadastro das Famílias Índigo Rei" do Apps Script, e grava:
  - Planilha **Cadastro das Famílias (respostas)**: abas Famílias e Aprendizes, só dados de cadastro. É a base que entra na importação do Sistema Índigo Rei.
  - Pasta **Saúde e laudos (restrito)**: planilha de saúde e os laudos, uma subpasta por aprendiz. Não compartilhar. Dados de saúde não entram no sistema antes da fase da área clínica (planta, seção 10).
- A cada cadastro novo, o instituto recebe um e-mail de aviso, sem nenhum dado de saúde.
- **Sistema Índigo Rei:** cada envio também vai, sem dados de saúde, para a caixa "Cadastros recebidos" do sistema (sistema.indigorei.com.br), onde o administrador importa para a família. Liga-se com três propriedades do script (`SISTEMA_URL`, `SISTEMA_CHAVE_PUBLICA`, `SISTEMA_CHAVE`), geradas no próprio sistema. A chave nunca vai para o repositório. Os envios antigos vão com a função `enviarHistoricoAoSistema()`, rodada uma vez pelo editor.

## Para mudar

- **Texto ou perguntas da página:** editar `index.html` e enviar para `main`. O site atualiza sozinho em cerca de um minuto. Se mudar um campo, mudar também `servidor/Codigo.gs`.
- **Servidor:** colar o novo `servidor/Codigo.gs` no editor do Apps Script e ir em Implantar > Gerenciar implantações > editar > Versão: Nova versão > Implantar. Assim o endereço continua o mesmo. Nunca criar uma implantação nova sem trocar o endereço em `URL_SERVIDOR` no `index.html`.

## Regras de texto

Sem travessões, sem a palavra "cobrança", sem citar outros alunos ou famílias.
