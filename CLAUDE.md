# CercoVR

Cerco: duelo de catapultas por turnos em VR para o Meta Quest 3 no navegador (WebXR), sem instalar nada.
Numa colina ao entardecer, uma mesa de madeira tem a maquete de um campo de batalha: o seu castelo de
blocos perto de você, o do adversário do outro lado do rio, cada um com um rei escondido na torre. Na sua
vez você pega a concha da catapulta com a mão, puxa para trás (força) e para o lado (mira) e solta. A pedra
voa, quebra blocos, e o que fica sem apoio desaba de verdade. Depois você põe 1 bloco de madeira para
consertar o seu castelo. Derrubou o rei do outro, ganhou. Partida contra 3 adversários e 10 desafios com
3 estrelas. Também joga no PC com mouse e teclado. Tudo em português.

## Como rodar / jogar

**No Quest:** depois de publicado, abrir no navegador do óculos `https://parappathe.github.io/CercoVR/` e
apertar "Entrar em VR". (Publicação: `python publicar.py CercoVR` na pasta `C:\claude code`.)

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8881` (o painel de visualização usa
`.claude/launch.json`). `python serve.py --https` serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Mirar e dar força | Apertar o botão lateral (ou pinça) na concha da catapulta (anel dourado), puxar para trás e para o lado | Arrastar com o botão esquerdo: para baixo = força, para o lado = mira. A/D mira, W/S força (Shift = fino) |
| Atirar | Soltar a concha | Soltar o mouse, ou Espaço |
| Pedra ou bomba | Tocar no cesto (ou raio + gatilho), ou A/X | Clicar no cesto ou B |
| Consertar | Pegar o bloco na bandeja à direita e soltar no castelo (o fantasma mostra onde), ou raio + gatilho no lugar | Clicar onde pôr (o fantasma amarelo mostra) |
| Não consertar | Tocar em "Pular" | Enter ou clicar em "Pular" |
| Pausa | B ou Y | Esc ou P |
| Câmera | (sua cabeça) | Botão direito arrastando, roda = zoom |
| FPS | Menu → FPS | Tecla F |

No VR você fica em pé atrás do seu castelo; a catapulta fica na beira da mesa, ao alcance da mão.

### Regras

- Grade de 11 x 10 x 30 casas (`js/rules.js`); cada castelo ocupa uma ponta, com o rio no meio.
- A catapulta lança sempre a 45°: força de 0 a 100% muda a velocidade (`speedFor`), mira até 20° para
  cada lado. O vento (-3 a 3) empurra a pedra para o lado e muda a cada tiro; a bandeira no meio do campo
  mostra. A prévia pontilhada mostra só os primeiros 35% do caminho.
- A pedra tem 2 de força: quebra madeira (1) e segue com o que sobrou; na pedra (2) ela para, mesmo
  quebrando. Pedra com 1 de vida fica escura (rachada).
- Bomba (2 por partida): quebra o bloco atingido (2 de dano) e os 6 encostados nele (1 de dano). O rei
  se abaixa: explosão não mata o rei, só tira a proteção.
- Bloco sem nada embaixo se segura até 2 casas de balanço ao lado de um bloco apoiado; mais que isso,
  cai. Madeira que cai 2 casas ou mais se quebra; pedra racha. Rei que cai, leva pedrada ou é esmagado
  por um bloco está derrubado.
- O tiro passa por cima do próprio castelo (a catapulta fica atrás dele).
- Depois de cada tiro, quem atirou põe 1 bloco de madeira no próprio castelo (no chão ou em cima de
  outro bloco), ou pula.
- Fim: rei derrubado, ou 12 tiros de cada um; aí ganha quem tem mais pontos de bloco de pé.
- Adversários (`js/ai.js`): calculam o tiro simulando na cópia da grade e erram conforme o estilo.
  **Barão Bonachão** (erra muito, conserta qualquer lugar), **Duquesa Pólvora** (gasta bomba cedo, levanta
  a frente da torre), **Mestre Arquimedes** (erra pouco, guarda bomba, tapa o buraco que mais protege).
- Desafios (`js/challenges.js`): alvo montado, sem tiro de volta; estrelas pelo número de tiros:
  1 Primeiro tiro, 2 Muralha, 3 Vento de lado, 4 Torre alta, 5 Pedra dura, 6 Atrás do morro, 7 A ponte,
  8 Vento que vira, 9 Duas camadas, 10 A fortaleza.
- Progresso salvo no navegador (localStorage, chave `cercovr.v1`).

## Como testar

- `npm test` (ou `node tests/run.js`): regras (tiro determinístico, vento, força, não bate no próprio
  castelo, madeira deixa passar e pedra segura, bomba em cruz, balanço de 2 casas, ponte que desaba, queda
  quebra madeira, bloco esmaga o rei, conserto válido, fim pelos 12 tiros); IA (tiro válido em menos de
  100 ms, Barão erra mais que Arquimedes, castelo inteiro não cai com uma pedrada); IA contra IA em 12
  partidas por dupla (Arquimedes ganha dos dois, Duquesa do Barão; mostra o placar); robô tira 3 estrelas
  nos 10 desafios; e fumaça do `main.js` (carrega o jogo no Node com navegador e WebGL de mentira: arrastar o
  mouse mira e atira, conserto clicando no chão, W/B/Espaço/Enter, controle de VR de mentira puxa a concha e
  atira, leva o bloco da bandeja ao castelo, robô termina a partida, os 10 desafios com 3 estrelas dentro do
  jogo, `dev.win()`, pausa). Tem que terminar com "Tudo certo"; sai com código 1 se algo falhar (ou 200 s).
  Não toca som. Precisa do Node 22.15 ou mais novo (`module.registerHooks`).
- No navegador (console): `dev.autoplay = true`, `dev.advance(5)`, `dev.state()`, `dev.aim(0.1, 0.7, 'bomb')`,
  `dev.fire()`, `dev.loadLevel(3)`, `dev.startMatch(2)`, `dev.win()`, `dev.screenOf('cell', x, y, z)`,
  `dev.resetSave()`. `window.cerco` tem `match`, `challenge`, `world`, `shell`, `scene`, `camera`.

## Estrutura

- `index.html`, `css/style.css`
- `js/rules.js`: grade, castelo padrão, balística, dano, apoio/desabamento, conserto, partida.
- `js/ai.js`: avaliação de tiro, melhor tiro, estilos dos 3 adversários, conserto.
- `js/challenges.js`: os 10 desafios, estrelas, robô (olha 2 tiros à frente).
- `js/scene.js`: colina, mesa, maquete, blocos (instâncias), reis, marcador de coroa, catapultas, efeitos.
- `js/main.js`: estados, menus, entrada (VR, mãos, mouse, teclado), animação do voo e da queda, `window.dev`.
- `js/shell.js`, `js/ui.js`: casca comum (render, VR, controles, painel), igual aos outros jogos web.
- `js/visual3d.js`, `js/materiais3d.js`: utilidades visuais da skill `dudu` (céu, sol, madeira, pedra).
- `js/audio.js`: sons sintetizados. `js/save.js`: progresso.
- `tests/`: `run.js`, `smoke.js`, `three-stub.js`. `vendor/three`: Three.js r170.

## Decisões

- **Direção de arte:** maquete de madeira e pedra sobre a mesa, blocos com chanfro e textura gerada;
  paleta verde-oliva da grama (dominante), madeira mel (secundária), azul x vermelho dos times e dourado
  do rei (destaque). Fim de tarde: sol baixo dourado em 3/4 por trás do jogador, sombra azulada.
- Física por regras na grade (não física de corpo rígido): o resultado é igual para a IA, o robô e os
  testes, e o desabamento continua satisfatório na animação.
- Ângulo fixo de 45° e só força + mira: dá para fazer com uma mão só puxando a concha.
- A pedra não atravessa pedra e a bomba não mata o rei: sem isso as partidas acabavam em 2 ou 3 tiros.
- Catapulta atrás do próprio castelo, ao alcance da mão no VR; o tiro ignora o próprio lado.
- Prévia de só 35% da trajetória: ajuda a mirar sem tirar a graça de errar.

## Pendências / problemas conhecidos

- Falta testar no Quest: pegar e puxar a concha (distância de 22 cm para força máxima), ver o castelo do
  outro lado (1,5 m), pegar o bloco da bandeja, FPS com as sombras.
