# Show na Mão Plus

## Pastas

- `index.html`: estrutura e pontos de entrada da página.
- `src/app.ts`: interações, navegação e regras do app.
- `src/styles.css`: tema, componentes e estilos responsivos.
- `public/`: imagens e outros arquivos servidos sem processamento.

## Executar em desenvolvimento

Requer Node.js 18 ou superior. A pasta deve ser aberta por meio do servidor Vite: o navegador não executa TypeScript ao abrir o HTML diretamente por duplo clique.

```sh
npm install
npm run dev
```

Abra o endereço local mostrado pelo Vite, normalmente `http://localhost:5173`.
O comando inicia o front-end e um backend local, ambos ligados apenas ao computador.

## Conectar a Sympla

1. Copie `.env.example` para `.env` na raiz do projeto.
2. Em **Minha Conta → Integrações** na Sympla, gere um token e preencha `SYMPLA_TOKEN` no `.env`.
3. Reinicie `npm run dev`. Na página de um show, abra **Ingressos**, busque os eventos da Sympla, selecione o evento correspondente e atualize as vendas.

O token é lido somente pelo backend local; não o coloque no código, no navegador ou em backups. O backend fica restrito a `127.0.0.1`. Para produção ou hospedagem pública, é necessário adicionar autenticação e uma implantação de backend apropriada antes de expor a integração. As métricas da Sympla ficam separadas das vendas lançadas manualmente para evitar duplicidade no financeiro.

## Conectar um perfil de artista do Spotify

1. Crie um app no [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) e copie o Client ID e o Client Secret.
2. Copie `.env.example` para `.env` na raiz do projeto e preencha `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET`.
3. Reinicie `npm run dev`. Em **Acervo → Memória e ajustes**, cole o link do perfil de artista do Spotify e selecione **Buscar perfil no Spotify**.

As credenciais são usadas somente pelo backend local e nunca devem ser colocadas no código, no navegador ou em backups. O anúncio mostra os dados públicos do perfil e o player oficial incorporado do Spotify; isso não conecta a conta pessoal nem controla a reprodução do usuário. Em Development Mode, o Spotify exige uma conta Premium do proprietário do app e limita os usuários autorizados; esta consulta pública não pede login dos contratantes. O acesso à Web API também pode estar sujeito às regras e limites atuais do Spotify Developer Dashboard. A integração depende do backend local e não funcionará em uma publicação estática sem um backend configurado.

Para servir a compilação localmente, execute `npm run build` e depois `npm start`.

## Verificar e compilar

```sh
npm run typecheck
npm run build
```

Ou rode `npm run check` para executar o typecheck e a compilação em sequência.

No painel, o chat do Maestro reúne as áreas dos oito especialistas. As conversas antigas dos especialistas são migradas para esse chat quando o app é aberto.

Os dados do protótipo são salvos no armazenamento local do navegador. Em **Acervo → Memória e ajustes**, use **Baixar backup** para guardá-los ou **Restaurar backup** para recuperá-los.

No **Acervo → Dinheiro**, registre despesas por categoria e, quando fizer sentido, vincule-as a um show. O painel compara entradas e saídas registradas nos últimos seis meses. Em cada show, a aba **Ingressos** permite lançar vendas por quantidade, valor, data e canal; essas vendas também entram no painel financeiro.

Em **Acervo → Shows**, o calendário mensal reúne os eventos com data marcada; use as setas para mudar o mês e selecione um show para abrir seus detalhes. A página do show mostra um mapa do Google Maps com o endereço cadastrado ou, na ausência dele, com o nome do local e a cidade.

Em **Acervo → Memória e ajustes**, adicione até cinco fotos ao anúncio (a primeira é a capa), atualize os links das redes sociais e conecte até três vídeos públicos do YouTube ou Vimeo. Em **Acervo → Repertório**, envie até cinco trechos próprios/autorizados em MP3, WAV ou M4A (até 90 segundos cada) para ouvir no perfil público; os controles de áudio aparecem junto ao repertório. Fotos e áudios são armazenados neste navegador, e o backup inclui esses arquivos. Como este protótipo não tem hospedagem de mídia compartilhada, os arquivos locais só ficam disponíveis neste navegador; para que outros contratantes os ouçam pela internet, é preciso publicar o app com um serviço de armazenamento de mídia. Em **Acervo → Contatos**, os clientes e locais dos shows ficam separados de empresários, equipe e outros contatos, que podem ser cadastrados, editados ou excluídos. **Acervo → Materiais** permite organizar links, textos, vídeos e documentos por tipo, além de editar ou remover itens.
