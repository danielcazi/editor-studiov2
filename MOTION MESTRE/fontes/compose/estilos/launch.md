# Filme de lançamento (launch)

> O produto apresentado como num keynote: página clara com névoa azul e brilho no chão, ou marinho profundo; cards brancos com sombra macia; vidro fosco; manchete grande com uma palavra em cor; o site de verdade dentro de uma moldura de navegador ou de celular; leque de fotos; pílulas de checklist com ✓; um cursor que clica; e, no fim, um cartão preto com a marca brilhando.
> Referências: Frame by Frame (@notdwd), QuickEmailVerify (@KmAsiff), Quetzal (@miskinho_), sholajegede.com (@wani_shola), BlueVisa (@thismacapital), via prompt-motion.com e Skillry. Gramática só.

**Serve para:** apresentar um produto, site ou curso; lista de benefícios; "como funciona" em três telas; oferta com checklist; depoimento em card; CTA com o site na tela. **Encaixe:** com locutor ★★★ (os cards e molduras ficam acima da cabeça e no peito; o locutor é quem apresenta) · só motion ★★★ · marcas com site e prints em `assets/img/` ★★★ (o motor usa as imagens reais).

## 1. Essência (e o que não é)
Limpeza e peso: poucas coisas por quadro, cada uma com sombra que diz que tem corpo, e **um só acento** que marca a palavra, a pílula e o botão. O quadro sempre entra em movimento (sobe, desembaça) e sai acelerando; nada aparece parado. A UI é redesenhada ou é o print real do site dentro de uma moldura, nunca um mockup genérico. Duas paletas possíveis: **clara** (página quase branca com névoa fria no alto e brilho no chão) e **escura** (marinho ou a cor escura da marca com vinheta). Não é glassmorphism roxo com gradientes neon, não é kit de ícones, não é slideshow de features com marcadores.

## 2. Com o locutor
- `back`: fundo (`LA.haze` ou `LA.dark`), manchete e rótulo de capítulo acima da cabeça (200–720 px). `front`: moldura de navegador/celular, pílulas e cursor na altura do peito, sem tocar o queixo (acima de 380 px da base).
- O cursor é "o usuário": quando a fala diz "clica", "entra", "escolhe", ele anda e clica num botão do print.
- Enquadramentos: L com manchete + uma moldura; M quando a moldura é grande (print inteiro); XXL na CTA com o cartão preto da marca atrás (`LA.wordmark` em `back`).

## 3. Materiais em `canvas()` (1080×1920)
**Motor pronto:** `canvas(p, draw, d, engine='launch')` põe `LA` no escopo (código em `engines/launch.js`, demo em `engines/demos/launch.py`).
`LA.haze(ctx,w,h,{page,fog,floor})` página com névoa e chão · `LA.dark(ctx,w,h,{c0,c1})` fundo escuro · `LA.card(ctx,t,t0,x,y,w,h,{r,shadow,tilt,draw})` card branco que sobe · `LA.glass(ctx,x,y,w,h,{bg,tint,blur,rim})` vidro fosco · `LA.headline(ctx,t,t0,linhas,x,y,font,{accent,color,light,lineH,align})` manchete; palavra `['adiar.',{accent:true}]`, `{strike:true}` risca, `{light:true}` cinza · `LA.chapter(ctx,t,t0,n,rótulo,x,y)` "01 Uma ideia." · `LA.image(src)` + `LA.browser(ctx,t,t0,img,x,y,w,h,{url,darkBar})` e `LA.phone(...)` molduras com o print · `LA.fan(ctx,t,t0,imgs,cx,cy,w,h,{spread,tilt})` leque de fotos · `LA.pill(ctx,t,t0,texto,x,y,{accent,done})` checklist · `LA.cursor(ctx,x,y,{click})` · `LA.orbit(ctx,t,t0,cx,cy,{colors})` quadrados que travam em cruz · `LA.stamp(ctx,t,t0,texto,x,y,cor)` carimbo · `LA.calendar(ctx,t,t0,x,y,w,h,{pins})` · `LA.wordmark(ctx,t,t0,texto,cx,cy,w,h)` cartão final · `LA.smear(ctx,draw,vx,vy)` borrão direcional.
- **Sombra macia:** `blur 46 px`, deslocamento 26 px para baixo, cor azul-escura a .16 na clara e preta a .4 na escura. Cards com raio 28; pílulas com raio total.
- **Vidro:** cópia borrada (18 px) do fundo em cache + véu branco .55 (claro) ou .08 (escuro) + fio de luz de 2 px.
- **Névoa:** radial fria no alto (`#B7CFEB` → transparente) e brilho de chão (`#DBEEFD`), ambos em cache; na paleta da marca, troque pela cor clara da marca a 30 %.
- **Molduras:** barra de 54 px com três pontos e pílula de URL; o print entra por `cover` ancorado no topo (nunca esticado).
- **Borrão de movimento:** `LA.smear` com 10 cópias ao longo da velocidade só em whips (> 40 px por quadro); nunca em texto que será lido.

## 4. Cor (paleta do compose.json)
Clara: página `#FDFDFB`/`CRM`, névoa fria ou `AMB` lavado, tinta `BLK`, cinza-luz para a segunda linha, **acento = `RED`** (palavra, pílula, botão, carimbo). Escura: `BLK` com vinheta (ou o escuro da marca), texto `CRM`, acento `AMB`. Um acento por reel; o segundo tom da marca só em cards pequenos. Cartão final: preto radial `#020204` → `#272729`, marca branca.

## 5. Tipografia
Fonte da marca: manchete 700 em 88–100 px, duas linhas, tracking −3 %; rótulo de capítulo em 22 px caixa-alta espaçada (+14 %) na cor do acento; texto de UI em 15–34 px. A palavra em acento é uma por manchete; o risco (`strike`) só na palavra negada.

## 6. Movimento (cenas de 1,2–3 s a 30 fps)
- Cards sobem 40 px com `eo` em 0,45 s e inclinam ±3–8°; manchete sobe linha a linha com 0,12 s de escalonamento.
- O cursor anda em 0,6 s com `eo`, encolhe 12 % no clique (0,15 s) e o que ele clicou reage (pílula marca ✓, página rola).
- Quadrados em órbita giram 1,5 volta e travam em cruz em 0,9 s (`eio`).
- Saída: o card encolhe 5 % enquanto o quadro embaça (`LA.smear` + `filter blur` 1 → 7 px em 0,25 s) e o corte cai no pico do desfoque; ou o próximo card cobre.
- Nunca um quadro parado: entre dois movimentos, a câmera de mundo faz push de 1,03.

## 7. Câmera de mundo (`world=`)
| Movimento do estilo | `world=` | Serve para |
|---|---|---|
| Zoom no cursor | `dict(scale=1.2)` em 0,5 s | "clica aqui"; o botão |
| Deriva em repouso | `dict(scale=1.04)` | enquanto a fala explica |
| Whip entre painéis | `dict(x=-110)` com `d=.3` + `LA.smear` | causa aqui, efeito ali (plano-assinatura) |
| Tilt para a página de resposta | `dict(rx=-4, y=-60)` | rolar a tela; o resultado |
| Pull para a janela inteira | `dict(scale=.92)` | o fluxo todo; resumo |
| Push + vinheta no selo | `dict(scale=1.15)` segurado | a promessa a lembrar (preço, garantia) |

## 8. Transições feitas no meio
- **Corte no pico do desfoque:** o card sai embaçando e o próximo já entra embaçado (12 px → 0 em 0,3 s).
- **Pílula de capítulo que cresce** até virar o fundo da próxima cena.
- **O print rola** (`LA.browser` com o `img` deslocado em y) e, no fim do rolar, o próximo card nasce do botão clicado.
- **Cartão preto** fecha o reel: a marca entra esticada (2,4×) e colapsa para a largura final.

## 9. Som (assets/sfx)
`click` no cursor, `pop` em cada pílula, `whoosh` no whip, `whoosh-cinematic` no corte embaçado, `notification` quando o site "responde", `chime` no ✓, `impact-bass-1` no cartão final, `key-press` baixo numa digitação. Silêncio antes do preço.

## 10. Moves nativos (menu)
- **Manchete com a palavra em acento.** *Serve:* gancho; a promessa.
- **O site de verdade na moldura.** Print real com cursor clicando. *Serve:* "entra no site"; o produto; prova.
- **Checklist que se marca.** Pílulas ✓ uma a uma. *Serve:* benefícios; o que está incluído; passos.
- **Leque de cards.** 3–5 fotos ou telas abrindo em leque. *Serve:* "em todas as plataformas"; variedade; portfólio.
- **Calendário com pinos.** *Serve:* agenda; "toda semana"; prazo.
- **Carimbo.** RESERVADO / APROVADO em cima do card. *Serve:* decisão; vaga garantida (CTA).
- **Órbita que trava em cruz.** *Serve:* "tudo se encaixa"; integração; logo.
- **Cartão preto com a marca brilhando.** *Serve:* fechamento; CTA.

## 11. Armadilhas
- Sombra dura ou preta na paleta clara vira Windows 95: sombra azulada, borrada, deslocada para baixo.
- Mais de um acento = nenhum acento.
- Print esticado ou com texto ilegível: `cover` ancorado no topo, largura mínima de 700 px para a moldura.
- `LA.smear` em texto que será lido: só em whips e saídas.
- Vidro sobre fundo liso não lê como vidro: precisa de algo atrás (névoa, print, cards).
- Cursor sobre o rosto do locutor: o cursor vive no `front`, no peito, nunca acima de 1100 px com locutor em L.
- Cards e molduras fora da zona segura (laterais 70 px): largura máxima 940 px.
