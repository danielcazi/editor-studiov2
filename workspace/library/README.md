# Biblioteca compartilhada

Tudo que estiver em `3d/` e `img/` é copiado para `compose/assets/lib/` de cada reel e listado no brief do compositor.

- `3d/`: objetos 3D como PNG com fundo transparente (ex.: o pacote 3dicons, CC0, baixado de https://3dicons.co — escolha o estilo "color" ou "gradient" e o ângulo "dynamic"; renomeie com o nome do objeto, ex. `pen-tool.png`, `puzzle.png`, `calendar.png`) ou modelos `.glb` (o kit carrega com `obj3d(p, 'assets/lib/3d/arquivo.glb', ...)`).
- `img/`: imagens, gravuras e texturas que servem a qualquer marca.

O nome do arquivo é o que o compositor lê antes de abrir a imagem: use nomes descritivos em inglês ou português (`laptop-mockup.png`, `red-arrow.png`).
