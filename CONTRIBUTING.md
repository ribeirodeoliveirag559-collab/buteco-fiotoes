# Como ajudar no Buteco FIOTÕES

Bem-vindo ao buteco! Qualquer amigo pode mexer no jogo. O jeito mais seguro de todos editarem sem quebrar o site no ar:

## 1. Pegar o projeto

```bash
git clone https://github.com/ribeirodeoliveirag559-collab/buteco-fiotoes.git
cd buteco-fiotoes
npm install
```

## 2. Montar o SEU ambiente (não use o banco de produção)

1. Crie um banco grátis no [Neon](https://neon.tech) e copie a *connection string*.
2. `cp .env.example .env.local` e preencha `DATABASE_URL` (o `.env.local` nunca vai pro git).
3. `npm run db:init` cria as tabelas no seu banco.
4. (Opcional) Chaves do [Supabase](https://supabase.com) pro multiplayer de verdade. Sem elas o jogo roda em **modo teste** (só vê outras abas do mesmo navegador: abra `/?p=ana` e `/?p=beto`).
5. `npm run dev` e abra http://localhost:5174

Dica: o celular na mesma rede Wi‑Fi abre `http://IP-DO-SEU-PC:5174` pra testar o toque.

## 3. Mexer e mandar

```bash
git checkout -b minha-ideia        # uma branch por mudança
# ...edite...
npm run check                      # confere se o JS não tem erro
git add -A && git commit -m "o que mudou"
git push -u origin minha-ideia     # e abra o Pull Request no GitHub
```

- **Não faça push direto na `main`**: ela vira o site de verdade (deploy automático na Vercel). Abra um Pull Request e peça pra alguém olhar.
- Mudou a interface? Teste no celular, **em pé e deitado**, e coloque um print no PR.
- Mudou `db/schema.sql`? Só `create table if not exists` / `add column if not exists`. Nada que apague dados. Avise no PR: o banco de produção é atualizado à mão.

## 4. Onde fica cada coisa

| Pasta/arquivo | O que é |
| --- | --- |
| `public/js/bar.js` | o salão 3D (mesas, balcão, banheiro, camarote, painel de patrocinadores) |
| `public/js/game.js` | regras: andar, beber, garrafa de 5 copos, banheiro, chat, rede |
| `public/js/avatar.js`, `sprites.js` | personagens e roupas |
| `public/js/net.js` | multiplayer (Supabase Realtime ou modo teste local) |
| `public/css/style.css` | toda a interface (celular incluso) |
| `api/*.js` | funções da Vercel (contas, placar, cerveja, loja) |
| `public/sponsors/` + `public/js/sponsors.js` | logos e lista dos patrocinadores |

## 5. Regras de convivência

- **Nunca** commite senha, token, `DATABASE_URL` ou `.env*`. Se vazar sem querer, avise na hora (a gente troca a senha do banco).
- Texto do jogo em português do Brasil; sem emoji na interface (usamos ícones Lucide, `scripts/icons.mjs`).
- As logos dos patrocinadores são das marcas deles: não redesenhe nem altere, só use a imagem original.
