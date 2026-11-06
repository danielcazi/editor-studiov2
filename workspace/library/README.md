# Biblioteca compartilhada

Tudo que estiver em `3d/` e `img/` é copiado para `compose/assets/lib/` de cada reel e listado no brief do compositor.

- `3d/`: objetos 3D como PNG com fundo transparente (ex.: o pacote 3dicons, CC0, baixado de https://3dicons.co — escolha o estilo "color" ou "gradient" e o ângulo "dynamic"; renomeie com o nome do objeto, ex. `pen-tool.png`, `puzzle.png`, `calendar.png`) ou modelos `.glb` (o kit carrega com `obj3d(p, 'assets/lib/3d/arquivo.glb', ...)`).
- `img/`: imagens, gravuras e texturas que servem a qualquer marca.
- `music/`: trilhas (mp3, m4a, wav) que o compositor pode usar com `music('assets/lib/music/arquivo.mp3')`, uma por reel. O que você baixa do Artlist ou de outro banco entra aqui, com nome que diga o clima (`upbeat-corporate.mp3`).
- `sfx/`: efeitos sonoros seus, somados aos 24 do kit: cada arquivo vira um nome em `assets/sfx/manifest.json` (o nome do arquivo sem extensão, ex. `whoosh-long.wav` → `whoosh-long`) para usar em `scene(sfx=[('whoosh-long', 0, .8)])`.

O nome do arquivo é o que o compositor lê antes de abrir a imagem: use nomes descritivos em inglês ou português (`laptop-mockup.png`, `red-arrow.png`).
