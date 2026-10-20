# FIOTÕES 🍺

Jogo online (navegador, celular ou PC) de bar com torneio de cerveja, feito em HTML + Canvas, sem build.

## Rodar local

```bash
node server.js     # http://localhost:5174
```

Sem configurar nada ele roda em **modo teste**: só enxerga outras abas do mesmo navegador.
Para simular amigos, abra `http://localhost:5174/?p=ana` e `http://localhost:5174/?p=beto` (o `?p=` separa os dados salvos).

## Ligar o multiplayer de verdade (Supabase Realtime)

1. Crie um projeto grátis em https://supabase.com
2. Project Settings → API: copie **Project URL** e a chave **anon public**
3. Cole em `js/config.js` (`SUPABASE_URL` e `SUPABASE_ANON_KEY`)

Não precisa criar tabela. O jogo usa só Realtime (broadcast + presence).

## Publicar (Vercel)

É um site estático: `vercel --prod` dentro da pasta (ou arraste a pasta no painel da Vercel).

## Como funciona

- **Personagem**: nome + visual salvos no aparelho (`localStorage`).
- **Cerveja**: segurar o botão (ou `ESPAÇO`) ~5 s = +1 cerveja. Soltar antes cancela.
- **Bebedeira**: a partir da 10ª cerveja a tela fica borrada, dobrada, balançando, e o personagem anda torto. O álcool baixa 1 cerveja a cada ~50 s (o placar não baixa). Perto da 24ª o personagem apaga por 10 s.
- **HOMEM** do cantinho escuro: clique nele, pegue o baseado, fume → olhos vermelhos (todo mundo vê) e tela psicodélica por ~1 min.
- **Placar**: cartaz na parede (clique pra abrir a lista completa). Zera à meia-noite. Cada aparelho guarda o placar do dia e os amigos online trocam entre si, então não há banco de dados.
- **Tráfego de rede**: só manda mensagem quando você muda de direção/destino (os outros simulam o resto), por isso cabe no plano grátis do Supabase.

## Limites conhecidos

- A contagem de cervejas vem do navegador de cada um, então quem entende de DevTools consegue trapacear. Para um torneio entre amigos tá ok; se quiser blindar, o próximo passo é um servidor que valide o tempo de cada cerveja.
- Teclas: `WASD`/setas andam, `Enter` chat, `E` fala com o HOMEM/fuma, `Tab` placar.
