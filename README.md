# Buteco FIOTÕES 🍺

Bar 3D multiplayer em **primeira pessoa**, direto no navegador (PC e celular). Torneio de quem bebe mais cerveja entre amigos.

- **Front**: HTML + [Three.js](https://threejs.org) (vendorizado em `public/vendor`), sem build. Todas as texturas/modelos são gerados por código.
- **Hospedagem**: Vercel (site estático em `public/` + funções em `api/`).
- **Banco**: Neon (Postgres) — contas, visual e placar do dia. O servidor confere o tempo de cada cerveja (anti-trapaça).
- **Tempo real** (posição, chat, animações): Supabase Realtime *broadcast/presence* — não usa tabela nenhuma. O cliente (`public/vendor/supabase.js`, v2.118) é **vendorizado**: versões antigas (≤ 2.45) não conectam com as chaves novas `sb_publishable_…` e o jogo caía em silêncio no "modo teste".

## Fluxo do jogo

0. **Página inicial**: criar conta ou entrar com **nome + senha** (mínimo 3 caracteres, sem repetir; a senha é guardada com hash scrypt no Neon). Conta antiga sem senha: o primeiro login define a senha.
1. **Guarda-roupa**: o personagem em frente a um guarda-roupa velho; o painel lateral escolhe cabelo, olhos, boca, camisa, calça, calçado, chapéu e óculos (tudo em 3D ao vivo).
2. **Buteco** (primeira pessoa): `WASD` anda, mouse olha.
3. **Cerveja não é infinita**: fale com a **Bella** atrás do balcão (`E`) e peça uma cerveja → ela **te entrega a garrafa** → fique com ela na mão ou deixe numa mesa/balcão (`G`) e pegue de volta (`E`) → com a garrafa na mão, **clique** pra encher o copo → **segure `ESPAÇO`** (ou botão esquerdo / botão na tela) ~5 s pra beber. **Cada garrafa rende até 5 copos** (o contador `3/5` aparece no HUD; vazia, é só pedir outra). Cada copo bebido = **1 ponto**. O servidor (Neon) controla cada etapa e o tempo.
4. **Placar**: copos do dia. O **campeão do dia** (fecha à meia-noite, fuso de SP) ganha um **cigarro eletrônico com 20 tragadas** (`F`, solta uma fumaça enorme).
4b. **Cervejas grátis**: algumas garrafas ficam em cima das mesas; olhe pra uma e aperte `E`/clique pra pegar (volta pra mesa depois de ~75 s).
5. **Loja da Bella**: um **pod** custa **20 pontos** da sua carteira (gastar não mexe no placar do dia) e dá +20 tragadas.
6. **Camarote**: sala VIP com dançarinas, só entra quem está no **TOP 5 do dia**.
7. **Jukebox** (`E` perto dela): cole um link do YouTube e a música toca pra todo mundo (volume pela distância; no camarote é mais alto). O áudio vem do player oficial do YouTube; nenhuma música é hospedada aqui.
7b. **Banheiro** (porta com a placa WC na parede oeste, perto do balcão): olhe pro vaso e aperte `E` (ou **URINAR** no celular). Dura ~5 s e **baixa 4 pontos do nível de embriaguez** (de 20). Só vale se você já bebeu um pouco; depois de ir, espere ~25 s pra ir de novo. Os outros veem "fulano foi ao banheiro" no chat.
8. A partir da 10ª cerveja a tela fica borrada/dobrada/balançando; com ~12 o personagem anda torto e tropeça; no nível máximo (20) ele cai no chão e levanta sem parar até o álcool baixar. `E` no HOMEM do canto escuro = baseado (olhos vermelhos + tela psicodélica).

## Celular (iPhone e Android)

- Funciona **em pé e deitado**. HUD respeita o notch / Dynamic Island / barra do iPhone (`env(safe-area-inset-*)`).
- Guarda-roupa: deitado a gaveta fica ao lado; em pé ela é uma gaveta embaixo que fecha, com uma barra **Roupas | ENTRAR NO BUTECO**.
- iPhone não tem tela cheia no Safari: use **Compartilhar → Adicionar à Tela de Início** (há `manifest.webmanifest` + ícones) e ele abre sem barra do navegador.
- Sem zoom de pinça / duplo toque durante o jogo. Teste em `?q=low` se o aparelho for fraco.

## Visual

- Ícones: [Lucide](https://lucide.dev) (ISC), gerados em `public/icons.svg` por `node scripts/icons.mjs`. Nada de emoji na interface.
- Iluminação: mapa de ambiente procedural (`public/js/env.js`, RoomEnvironment) dá reflexo ao metal (torneiras, dourado) — sem ele o metal fica preto — e luz ambiente suave; exposição 1.35.
- **Roupas e calçados 3D** (`public/js/gear-*.js`): tudo procedural, sem imagens. Camisas com ombros, golas, mangas e punhos, estampas em vetor (folha, AURA, BABY DOW...), 6 xadrezes diferentes (búfalo, tartan, guingão, madras...), calças de jeans com brim, costuras, bolsos e cinto com fivela, bermudas e shorts com acabamento próprio. Calçados com construção própria (bota americana, bico fino com bordado, botina de camurça com cadarço, chinelo e sandália com tiras). Chapéus moldados (copa com vinco e pinça, aba curvada) que **cobrem o cabelo**, e bonés com emblemas diferentes. As miniaturas do guarda-roupa são renders desses mesmos modelos 3D.
- Pra criar uma peça nova: camisas e calças em `gear-cloth-art.js` (desenho) + `gear-cloth.js` (forma); calçados em `gear-shoes.js`; chapéus em `gear-hats.js`. As peças escondidas das NPCs (top, vestido, sobretudo) ainda usam o modelo antigo em blocos.
- Formas arredondadas (RoundedBoxGeometry), roupas com textura de tecido/jeans em alta, relevo nas paredes e no piso.
- No celular o bar pede a tela na horizontal (no Android tenta travar sozinho).

## Patrocinadores

Painel iluminado na parede sul do salão (olhe pra ele e aperte `E`, ou use o botão de mãos com coração no HUD / na página inicial) com as logos originais de quem apoiou o jogo: Primetek, Cyber Tech, DSIL, PH Informática, Mylamaq, Classic Construtora e Imobiliária e Agropecuária Jesuíno. Os arquivos ficam em `public/sponsors/` e a lista em `public/js/sponsors.js` — adicionar um patrocinador é pôr a imagem lá e uma linha na lista.

## Contribuir

Veja o [CONTRIBUTING.md](CONTRIBUTING.md): cada um monta o seu banco grátis (`.env.example` + `npm run db:init`), trabalha numa branch e abre Pull Request; a `main` é o site no ar. Licença MIT (exceto as logos dos patrocinadores, que são das marcas).

## Rodar local

```bash
npm install
npm run dev      # http://localhost:5174
```

Crie `.env.local` (não vai pro git):

```
DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
SUPABASE_URL=https://xxxx.supabase.co            # opcional
SUPABASE_ANON_KEY=eyJ...                          # opcional
```

Sem as chaves do Supabase o jogo roda em **modo teste**: só enxerga outras abas do mesmo navegador
(abra `/?p=ana` e `/?p=beto` — o `?p=` separa os dados salvos de cada aba).
Sem `DATABASE_URL` ele joga offline, sem placar online.

## Banco (Neon)

`db/schema.sql` — tabelas `players` e `scores`.

## Deploy (Vercel)

Variáveis de ambiente do projeto: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (a anon key é pública por natureza).

## Realtime — limites do plano grátis

O cliente só manda mensagem de movimento ~4×/s enquanto você anda (os outros interpolam), então ~20 pessoas cabem folgado no plano grátis do Supabase.

## Qualidade gráfica

Automática: celular/PC fraco usa `low` (sem bloom nem sombras, resolução 1×). Force com `?q=low` ou `?q=high`. Se o FPS cair abaixo de 28 no modo `high`, ele baixa sozinho.
