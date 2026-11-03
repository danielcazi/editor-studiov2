// Extrator e analisador de sites de referência (Landing Pages, Portais, Lojas).
// Extrai capturas (desktop/mobile), imagens de alta qualidade, iconografia, textos, dados e paleta de cores.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { ask, type Cost } from './models.ts';

export function isVideoReference(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be') ||
        host.includes('instagram.com') || host.includes('tiktok.com') ||
        host.includes('vimeo.com') || host.includes('pinterest.') || host === 'pin.it' || host.includes('twitter.com') || host.includes('x.com')) {
      return true;
    }
    if (u.pathname.match(/\.(mp4|mov|webm|m4v)$/i)) return true;
    return false;
  } catch {
    return false;
  }
}

async function captureScreenshot(url: string, outPath: string, width = 1280, height = 900, isMobile = false): Promise<boolean> {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(chromePath)) return false;
  const tempProfile = join(tmpdir(), `chrome_shot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  try {
    mkdirSync(tempProfile, { recursive: true });
    const args = [
      '--headless',
      `--user-data-dir=${tempProfile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${width},${height}`,
      `--screenshot=${outPath}`
    ];
    if (isMobile) {
      args.push('--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    }
    args.push(url);

    await new Promise<void>((resolve) => {
      const p = spawn(chromePath, args, { stdio: 'ignore' });
      const timer = setTimeout(() => {
        try { p.kill('SIGKILL'); } catch {}
        resolve();
      }, 15_000);
      p.on('close', () => { clearTimeout(timer); resolve(); });
      p.on('error', () => { clearTimeout(timer); resolve(); });
    });
    return existsSync(outPath);
  } catch {
    return false;
  } finally {
    try { rmSync(tempProfile, { recursive: true, force: true }); } catch {}
  }
}

export interface ExtractedSiteData {
  title: string;
  description: string;
  ogImage?: string;
  headings: string[];
  ctas: string[];
  keyNumbers: string[];
  colors: string[];
  downloadedImages: { filename: string; path: string; url: string; size: number }[];
  svgIconsCount: number;
}

export async function scrapeSite(url: string, projectDir: string): Promise<ExtractedSiteData> {
  const refDir = join(projectDir, 'ref');
  const refImgDir = join(refDir, 'img');
  const refIconsDir = join(refDir, 'icons');
  const refSiteDir = join(projectDir, 'ref_site');
  const assetsImgDir = join(projectDir, 'assets', 'img');

  for (const d of [refDir, refImgDir, refIconsDir, refSiteDir, assetsImgDir]) {
    mkdirSync(d, { recursive: true });
  }

  // 1. Screenshots em segundo plano
  const topDesk = join(refDir, 'top_desktop.png');
  const topMob = join(refDir, 'top_mobile.png');
  const [deskOk, mobOk] = await Promise.all([
    captureScreenshot(url, topDesk, 1280, 900, false),
    captureScreenshot(url, topMob, 430, 932, true),
  ]);

  if (deskOk) copyFileSync(topDesk, join(refSiteDir, 'top_desktop.png'));
  if (mobOk) copyFileSync(topMob, join(refSiteDir, 'top_mobile.png'));

  // 2. Fetch do HTML
  let html = '';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) html = await res.text();
  } catch {}

  const clean = (str: string) => str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Metadados
  const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim() || '';
  const description = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) || [])[1]?.trim() || '';
  const ogImgRaw = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) || [])[1]?.trim() || '';
  const ogImage = ogImgRaw ? new URL(ogImgRaw, url).href : undefined;

  // Headings
  const headings = [...html.matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map(m => clean(m[2]))
    .filter(t => t.length > 2 && t.length < 200);

  // CTAs
  const ctas = Array.from(new Set([...html.matchAll(/<(?:button|a)[^>]*class=["'][^"']*(?:btn|button|cta|assinar|comprar|quero)[^"']*["'][^>]*>([\s\S]*?)<\/(?:button|a)>/gi)]
    .map(m => clean(m[1]))
    .filter(t => t.length > 2 && t.length < 60))).slice(0, 8);

  // Números e Propostas de valor
  const paragraphs = [...html.matchAll(/<(?:p|div|span|li)[^>]*>([\s\S]*?)<\/(?:p|div|span|li)>/gi)]
    .map(m => clean(m[1]))
    .filter(t => t.length > 15 && t.length < 250 && /\b(?:\d+|mil|%|R\$|aulas|módulos|especialistas|garantia|dias|método)\b/i.test(t));
  const keyNumbers = Array.from(new Set(paragraphs)).slice(0, 15);

  // Cores
  const hexCounts: Record<string, number> = {};
  for (const m of html.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const hex = m[0].toUpperCase();
    if (!['#FFF', '#FFFFFF', '#000', '#000000', '#111', '#111111', '#222', '#222222', '#333', '#333333'].includes(hex)) {
      hexCounts[hex] = (hexCounts[hex] || 0) + 1;
    }
  }
  const colors = Object.entries(hexCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);

  // SVGs inline
  let svgIconsCount = 0;
  const svgMatches = [...html.matchAll(/<svg[\s\S]*?<\/svg>/gi)];
  for (let i = 0; i < Math.min(svgMatches.length, 10); i++) {
    const svgCode = svgMatches[i][0];
    if (svgCode.length > 100 && svgCode.length < 50_000) {
      const iconPath = join(refIconsDir, `icon_${i + 1}.svg`);
      writeFileSync(iconPath, svgCode);
      try { copyFileSync(iconPath, join(assetsImgDir, `icon_${i + 1}.svg`)); } catch {}
      svgIconsCount++;
    }
  }

  // 3. Imagens da página (FOCO PRINCIPAL)
  const candidateUrls = new Set<string>();
  if (ogImage) candidateUrls.add(ogImage);

  for (const m of html.matchAll(/<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["']/gi)) {
    if (m[1]) candidateUrls.add(m[1].trim());
  }
  for (const m of html.matchAll(/background(?:-image)?:\s*url\(['"]?([^'"\)\s]+)['"]?\)/gi)) {
    if (m[1]) candidateUrls.add(m[1].trim());
  }

  const downloadedImages: { filename: string; path: string; url: string; size: number }[] = [];
  let imgIndex = 1;

  for (const rawSrc of candidateUrls) {
    if (downloadedImages.length >= 25) break;
    try {
      const fullUrl = new URL(rawSrc, url).href;
      if (!fullUrl.startsWith('http')) continue;
      if (/facebook\.com|google-analytics|doubleclick|pixel|\.js|\.css|gravatar/i.test(fullUrl)) continue;

      const imgRes = await fetch(fullUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8_000)
      });
      if (!imgRes.ok) continue;
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.length < 1500) continue; // descarta pixels vazios

      let ext = extname(new URL(fullUrl).pathname).toLowerCase() || '.jpg';
      if (!['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'].includes(ext)) {
        ext = '.webp';
      }
      const rawBase = basename(new URL(fullUrl).pathname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || `asset_${imgIndex}`;
      const filename = `${String(imgIndex).padStart(2, '0')}_${rawBase}${ext}`;
      const savePath = join(refImgDir, filename);
      writeFileSync(savePath, buf);

      // Disponibiliza também em assets/img para uso direto no compose/motion
      try { copyFileSync(savePath, join(assetsImgDir, filename)); } catch {}

      downloadedImages.push({ filename, path: savePath, url: fullUrl, size: buf.length });
      imgIndex++;
    } catch {}
  }

  return {
    title,
    description,
    ogImage,
    headings,
    ctas,
    keyNumbers,
    colors,
    downloadedImages,
    svgIconsCount
  };
}

const OPUS_SITE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Resumo conciso da proposta de valor e estilo do site' },
    visual_summary: { type: 'string', description: 'Descrição detalhada do estilo visual e identidade da marca' },
    pacing: { type: 'string', description: 'Ritmo sugerido para animações e cortes inspirado no site' },
    cards: { type: 'string', description: 'Sugestões de cards, infográficos e elementos visuais baseados no site' },
    motion: { type: 'string', description: 'Estilo de movimento, transições e efeitos recomendados' },
    captions: { type: 'string', description: 'Estilo de legendas sugerido em harmonia com o site' },
    colors: { type: 'string', description: 'Paleta descritiva de cores (fundo, títulos, destaques, botões)' },
    fonts: { type: 'string', description: 'Tipografia dominante observada (pesos, estilo, proporções)' },
    iconography: { type: 'string', description: 'Estilo dos ícones e grafismos' },
    content_data: { type: 'string', description: 'Dados numéricos, promessas e argumentos fortes do site' },
    images: { type: 'string', description: 'Catálogo das imagens que você abriu, uma por linha: "arquivo: o que mostra (pessoa, trilha/tema, depoimento, palco, produto) → em que fala ou cena usar". Ignore logos minúsculos e imagens vazias.' },
    siteColors: {
      type: 'object',
      properties: {
        BLK: { type: 'string', description: 'Cor escura/fundo (#RRGGBB)' },
        RED: { type: 'string', description: 'Cor primária de destaque/botões (#RRGGBB)' },
        RED2: { type: 'string', description: 'Cor secundária escura (#RRGGBB)' },
        AMB: { type: 'string', description: 'Cor de ênfase/títulos em destaque (#RRGGBB)' },
        CRM: { type: 'string', description: 'Cor de texto claro (#RRGGBB)' }
      },
      required: ['BLK', 'RED', 'RED2', 'AMB', 'CRM']
    }
  },
  required: ['summary', 'visual_summary', 'pacing', 'cards', 'motion', 'captions', 'colors', 'fonts', 'iconography', 'content_data', 'images', 'siteColors']
};

export async function processSiteReference(
  id: string,
  url: string,
  userNote: string | undefined,
  projectDir: string,
  logCost: (c: Cost) => void
): Promise<any> {
  const data = await scrapeSite(url, projectDir);
  const refDir = join(projectDir, 'ref');
  const refSiteDir = join(projectDir, 'ref_site');

  // Coleta frames e imagens principais para a IA ler
  const visualFiles: string[] = [];
  const topDesk = join(refDir, 'top_desktop.png');
  const topMob = join(refDir, 'top_mobile.png');
  if (existsSync(topDesk)) { visualFiles.push(topDesk); copyFileSync(topDesk, join(refDir, '0.jpg')); }
  if (existsSync(topMob)) { visualFiles.push(topMob); copyFileSync(topMob, join(refDir, '1.jpg')); }

  // Adiciona amostra de até 16 imagens baixadas para a IA ler
  for (let i = 0; i < Math.min(data.downloadedImages.length, 16); i++) {
    visualFiles.push(data.downloadedImages[i].path);
  }

  const promptContent = [
    `URL do Site: ${url}`,
    `Título do Site: ${data.title}`,
    `Descrição: ${data.description}`,
    userNote ? `Expectativa do usuário para esta referência: ${userNote}` : '',
    `Abra com a ferramenta Read, ANTES de escrever, cada um destes arquivos (caminhos completos): ${visualFiles.join(', ')}. Não descreva uma imagem que você não abriu.`,
    `Total de Imagens Reais Baixadas em ref/img/ e assets/img/: ${data.downloadedImages.length} imagens.`,
    `Lista das principais imagens baixadas:`,
    ...data.downloadedImages.slice(0, 15).map(img => `- ${img.filename} (${Math.round(img.size / 1024)} KB)`),
    data.svgIconsCount > 0 ? `Ícones SVG extraídos: ${data.svgIconsCount} ícones em ref/icons/` : '',
    data.colors.length > 0 ? `Cores mais detectadas no CSS: ${data.colors.join(', ')}` : '',
    data.ctas.length > 0 ? `Chamadas de Botões (CTAs): ${data.ctas.join(' | ')}` : '',
    data.headings.length > 0 ? `Títulos Principais:\n- ${data.headings.slice(0, 8).join('\n- ')}` : '',
    data.keyNumbers.length > 0 ? `Dados, Estatísticas e Benefícios:\n- ${data.keyNumbers.join('\n- ')}` : ''
  ].filter(Boolean).join('\n\n');

  let opusRes: any;
  try {
    opusRes = await ask<any>('reference', 'reference:analyze_site', {
      system: 'Você é um diretor de arte e especialista em edição de vídeos curtos (Reels/Shorts/Motion). ' +
        'Você está analisando uma Landing Page / Site de referência fornecido pelo usuário. ' +
        'O foco principal são as IMAGENS REAIS baixadas do site (fotos, logos, banners, cards de trilhas), ' +
        'a linguagem visual, paleta de cores, tipografia, iconografia e argumentos-chave/dados numéricos. ' +
        'Descreva detalhadamente como reproduzir esse estilo visual nos vídeos e como aproveitar o catálogo de imagens baixadas.',
      readDir: projectDir,
      content: promptContent,
      schema: OPUS_SITE_SCHEMA
    }, logCost);
  } catch (err: any) {
    // Fallback gracioso com os dados reais caso a chamada ao modelo falhe
    const fallbackColors = {
      BLK: '#000000',
      RED: data.colors[1] || '#E61C1C',
      RED2: data.colors[2] || '#A61919',
      AMB: data.colors[0] || '#FFB600',
      CRM: '#FFFAEA'
    };
    opusRes = {
      summary: data.title ? `${data.title} - ${data.description}` : 'Site de referência analisado',
      visual_summary: 'Design profissional com tipografia contrastante, cards visuais e elementos da marca.',
      pacing: 'Dinâmico, com cortes e transições inspirados na estrutura da página.',
      cards: 'Cards informativos inspirados nas seções e tópicos do site.',
      motion: 'Movimentos limpos de entrada e saída, destacando dados e imagens.',
      captions: 'Legendas com bom contraste alinhadas à paleta do site.',
      colors: data.colors.join(', ') || '#000000, #FFB600, #E61C1C, #FFFAEA',
      fonts: 'Sans-serif moderna, títulos em caixa alta e peso bold.',
      iconography: `${data.svgIconsCount} ícones e vetores extraídos do site.`,
      content_data: data.keyNumbers.join(' | ') || data.description,
      images: `${data.downloadedImages.length} imagens baixadas prontas para uso em assets/img/.`,
      siteColors: fallbackColors
    };
  }

  // Monta o reference.json enriquecido (100% compatível com o schema do pipeline)
  const referenceData = {
    isSite: true,
    siteUrl: url,
    siteTitle: data.title,
    imagesCount: data.downloadedImages.length,
    downloadedImages: data.downloadedImages.map(d => d.filename),
    ...opusRes
  };

  const refFile = join(projectDir, 'reference.json');
  writeFileSync(refFile, JSON.stringify(referenceData, null, 2));

  // Gera o site.md no ref_site/ para documentação e para o compose-motion
  const siteMdContent = [
    `# Site de referência: ${data.title || url}`,
    `URL: ${url}`,
    '',
    `Capturas: top_desktop.png (1280x900) e top_mobile.png (430x932). ${data.downloadedImages.length} imagens extraídas e salvas em assets/img/ e ref/img/.`,
    '',
    '## Linguagem visual',
    `- ${opusRes.visual_summary || opusRes.summary}`,
    `- Pacing sugerido: ${opusRes.pacing}`,
    `- Motion: ${opusRes.motion}`,
    `- Estilo de legendas: ${opusRes.captions}`,
    '',
    '## Paleta de cores',
    `- Fundo (BLK): ${opusRes.siteColors?.BLK || '#000000'}`,
    `- Títulos/Ênfase (AMB): ${opusRes.siteColors?.AMB || '#FFB600'}`,
    `- Destaque/Botões (RED): ${opusRes.siteColors?.RED || '#E61C1C'}`,
    `- Secundária (RED2): ${opusRes.siteColors?.RED2 || '#A61919'}`,
    `- Texto claro (CRM): ${opusRes.siteColors?.CRM || '#FFFAEA'}`,
    '',
    '## Tipografia & Iconografia',
    `- Tipografia: ${opusRes.fonts}`,
    `- Iconografia: ${opusRes.iconography}`,
    '',
    '## Conteúdo e Estatísticas (para infográficos)',
    ...(data.keyNumbers.length ? data.keyNumbers.map(n => `- ${n}`) : [`- ${data.description}`]),
    ...(data.ctas.length ? ['', '## Chamadas de Ação (CTAs)', ...data.ctas.map(c => `- ${c}`)] : []),
    '',
    '## Catálogo de Imagens disponíveis (em assets/img/ e ref/img/)',
    `- Total: ${data.downloadedImages.length} imagens prontas para uso direto nos cards/motion`,
    ...data.downloadedImages.map(img => `- \`${img.filename}\` (${Math.round(img.size / 1024)} KB)`),
    '',
    '## Como usar as imagens no vídeo',
    `- ${opusRes.images}`
  ].join('\n');

  writeFileSync(join(refSiteDir, 'site.md'), siteMdContent);

  return referenceData;
}
