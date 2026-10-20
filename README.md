# Buteco FIOTÕES 🍺

Bar 3D multiplayer em **primeira pessoa**, direto no navegador (PC e celular). Torneio de quem bebe mais cerveja entre amigos.

- **Front**: HTML + [Three.js](https://threejs.org) (vendorizado em `public/vendor`), sem build. Todas as texturas/modelos são gerados por código.
- **Hospedagem**: Vercel (site estático em `public/` + funções em `api/`).
- **Banco**: Neon (Postgres) — jogadores, visual e placar do dia. O servidor confere o tempo de cada cerveja (anti-trapaça).
- **Tempo real** (posição, chat, animações): Supabase Realtime *broadcast/presence* — não usa tabela nenhuma.

## Fluxo do jogo

1. **Guarda-roupa**: o personagem em frente a um guarda-roupa velho; o painel lateral escolhe cabelo, olhos, boca, camisa, calça, calçado, chapéu e óculos (tudo em 3D ao vivo).
2. **Buteco**: primeira pessoa. `WASD` anda, mouse olha, **segure `ESPAÇO` (ou botão esquerdo / botão na tela)** ~5 s = 1 cerveja. `E` fala com o HOMEM do canto escuro (baseado → olhos vermelhos + tela psicodélica). `Enter` chat, `Tab` placar.
3. A partir da 10ª cerveja a tela fica borrada/dobrada/balançando e o personagem anda torto. Perto da 24ª ele apaga por 10 s.

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
