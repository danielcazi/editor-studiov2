# Banco de movimentos

Helpers aprovados na aba Motion Think (`#/motion-think`). Cada helper é `<nome>.py` (uma função `def <nome>(p, ..., at=0.0, d=None, k='..') -> (html, js)`, só `p` sem valor padrão), `<nome>.jpg` (quadro aprovado da demo), `<nome>.orig.jpg` (quadro do original, referência interna, nunca entra num render) e `<nome>.md` (o que é, para qual momento, o que não fazer). `banco.json` lista todos com momento, categoria, parâmetros e medidas; `negativo.md` e `negativo/` guardam o que foi reprovado.

O `kit.py` carrega todo `*.py` daqui no `from kit import *`; `composeScaffold` copia a pasta para `compose/estilos/banco/` e o brief lista os helpers por momento. `banco.json` não vem no repositório: é dado do estúdio, escrito pela aba. Removidos vão para `_removidos/`.
