# Buteco FIOTÕES 🍺

Bar 3D multiplayer em **primeira pessoa**, direto no navegador (PC e celular). Torneio de quem bebe mais cerveja entre amigos.

- **Front**: HTML + [Three.js](https://threejs.org) (vendorizado em `public/vendor`), sem build. Todas as texturas/modelos são gerados por código.
- **Hospedagem**: Vercel (site estático em `public/` + funções em `api/`).
- **Banco**: Neon (Postgres) — contas, visual e placar do dia. O servidor confere o tempo de cada cerveja (anti-trapaça).
- **Tempo real** (posição, chat, animações): Supabase Realtime *broadcast/presence* — não usa tabela nenhuma.

## Fluxo do jogo

0. **Página inicial**: criar conta ou entrar com **nome + senha** (mínimo 3 caracteres, sem repetir; a senha é guardada com hash scrypt no Neon). Conta antiga sem senha: o primeiro login define a senha.
1. **Guarda-roupa**: o personagem em frente a um guarda-roupa velho; o painel lateral escolhe cabelo, olhos, boca, camisa, calça, calçado, chapéu e óculos (tudo em 3D ao vivo).
2. **Buteco** (primeira pessoa): `WASD` anda, mouse olha.
3. **Cerveja não é infinita**: fale com a **Bella** no balcão (`E`) e peça uma cerveja → ela deixa uma **garrafa** na mesinha ao lado → **clique na garrafa** pra servir no copo → **segure `ESPAÇO`** (ou botão esquerdo / botão na tela) ~5 s pra beber. Cada copo bebido = **1 ponto**. O servidor (Neon) controla cada etapa e o tempo.
4. **Placar**: copos do dia. O **campeão do dia** (fecha à meia-noite, fuso de SP) ganha um **cigarro eletrônico com 20 tragadas** (`F`, solta uma fumaça enorme).
5. **Loja da Bella**: um **pod** custa **20 pontos** da sua carteira (gastar não mexe no placar do dia) e dá +20 tragadas.
6. **Camarote**: sala VIP com dançarinas, só entra quem está no **TOP 5 do dia**.
7. **Jukebox** (`E` perto dela): cole um link do YouTube e a música toca pra todo mundo (volume pela distância; no camarote é mais alto). O áudio vem do player oficial do YouTube; nenhuma música é hospedada aqui.
8. A partir da 10ª cerveja a tela fica borrada/dobrada/balançando; perto da 24ª o personagem apaga por 10 s. `E` no HOMEM do canto escuro = baseado (olhos vermelhos + tela psicodélica).

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
