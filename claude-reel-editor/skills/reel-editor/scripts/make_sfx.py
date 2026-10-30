#!/usr/bin/env python3
"""Renders compose/sfx/<name>.wav from the earshot sound bank (Leon Lin, MIT) and writes compose/sfx/manifest.json with
the measured onset and peak of every file (DIRETOR.md §5). Offline step: the wavs are committed, the composer never
needs earshot. To render again (Python 3.10+, numpy + scipy + soundfile are the only deps of the bank path):
  python3 -m venv /tmp/earshot && /tmp/earshot/bin/pip install numpy scipy soundfile && \
    /tmp/earshot/bin/pip install --no-deps https://github.com/Leonxlnx/earshot/archive/refs/tags/v0.4.0.tar.gz
  /tmp/earshot/bin/python -I claude-reel-editor/skills/reel-editor/scripts/make_sfx.py
The names are the compose vocabulary (estilos/*.md §9, formats' sfxRules, scenes.py of every project): swap a sound,
keep its name. `gain` is the earshot launch preset's level for the sound's role, so the palette is balanced at vol 0.5."""
import json, os, sys
import numpy as np, soundfile as sf
from earshot.forge import bank

SR = 48000
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'compose', 'sfx')
# name: (bank id, gain dB over the -1 dBFS render, description for the composer, knobs for bank.render)
SOUNDS = {
    'click':            ('fit/click/floss_lid', 0, 'Crisp UI click: button press, toggle, selection. Sync the onset to the on-screen action.', {}),
    'click-soft':       ('pro_click/soft', -13, 'Quiet short click: low-key UI tap, soft selection, hover. Much quieter than click.', {}),
    'key-press':        ('fit/key/thock', -1, 'Single mechanical key press: one keystroke, one typed character.', {}),
    'typing':           ('pro_typing_run/standard', -3, 'Typing run (~1.4 s of keys): text being typed. Start as the typing starts.', {}),
    'pop':              ('ui_pop/soft', -8, 'Soft rounded pop: chip, tag, badge or row appearing. Sync the onset to the pop-in.', {}),
    'land':             ('pro_pop_in/round', -5.5, 'Round low thump of an element landing (card, word, logo). Onset ~30 ms after the landing frame.', {}),
    'shutter':          ('shutter/snap', -7, 'Dry camera shutter: snap zoom, whip cut, freeze frame. Sync the onset to the snap.', {}),
    'chime':            ('mallet/flourish', -8.5, 'Three-note glockenspiel flourish: success, confirmation, a gentle positive beat.', {}),
    'notification':     ('pro_notify/ding_2045', -8.5, 'Short clean notification ding: alert, message in, toast or badge appearing.', {}),
    'ping':             ('mallet/glock', -8.5, 'Single bright glockenspiel note: punchy accent on a key reveal or data point.', {}),
    'error':            ('pro_pop/double', -8, 'Two-note boop: failure state, a "wrong" beat, something denied.', {}),
    'impact-bass-1':    ('pro_impact/deep', -9, 'Deep gated sub impact with a 1.3 s tail: logo or hero slam, headline landing. Onset on the hit frame.', {}),
    'impact-bass-2':    ('pro_impact/swell', -9, 'Short swell into a deep hit: anticipation then the slam. Align peak to the reveal.', {}),
    'swish':            ('swish/flick', -5.5, 'Thin fast swish that stops dead: a card or line of text sliding in, a flick. Align peak 40 ms after the move lands.', {}),
    'snap':             ('pro_click/snap', -7, 'Bright dry snap tick: a lock-in, a latch, a crisp accent on a cut.', {}),
    'whoosh-short':     ('whoosh_fast/tight', -5.5, 'Tight fast whoosh: quick swipe or slide, a fast element move. Align peak 40 ms after the move lands.', {}),
    'whoosh':           ('whoosh_big/thump', -6.5, 'Low whoosh that lands with a thump: fast reveal, hard transition. Align peak to the cut.', {}),
    'whoosh-cinematic': ('whoosh_big/deep', -6.5, 'Big deep air whoosh (2 s): sweeping scene transition, a flood of colour. Align peak to the cut.', {}),
    'riser':            ('riser/tension', -3.5, 'Tension riser (2.8 s) that stops on its loudest moment: build into a cut or reveal. Align peak to the cut.', {}),
    'swell':            ('reverse_swell/dark', -5.5, 'Dark reverse swell that blooms just after a cut. Align peak 40 ms after the cut. At most one per reel.', {}),
    'sparkle':          ('pro_shimmer/m1', -8, 'Granular sparkle: magical reveal, a shine on a hero element. Sync the onset to the highlight.', {}),
    'glitch-1':         ('glitch/burst', -6, 'Punchy glitch burst that hits first: hard-cut accent or sudden reveal. Onset on the hit.', {}),
    'glitch-2':         ('pro_glitch/crunchy', -6, 'Crunchy stutter that ends on the cut: chaotic transition into the next shot. Align peak to the cut.', {}),
    'glitch-3':         ('glitch/mid', -6, 'Low-key short glitch texture: subtle digital shift under other audio.', {}),
}


def measure(y):
    """onset: first 1 ms window within 30 dB of the loudest; peak: centre of the loudest 5 ms (1 ms hop), like earshot's meta"""
    p = y ** 2 if y.ndim == 1 else (y ** 2).mean(axis=1)
    cs = np.concatenate([[0.0], np.cumsum(p)])
    w1, w5 = SR // 1000, SR // 200
    win = lambda w: cs[np.arange(0, len(p) - w, w1) + w] - cs[np.arange(0, len(p) - w, w1)]
    e1, e5 = win(w1), win(w5)
    return round(float(np.argmax(e1 >= e1.max() / 1000) * w1 / SR), 3), round(float((np.argmax(e5) * w1 + w5 / 2) / SR), 3)


def main():
    os.makedirs(OUT, exist_ok=True)
    man = {}
    for name, (sid, gain, desc, knobs) in SOUNDS.items():
        y, meta = bank.render(sid, peak_db=-1 + gain, **knobs)
        if not meta['checks']['ok']:
            print(f'{name} ({sid}): audit: {meta["checks"]["summary"]}', file=sys.stderr)
        sf.write(os.path.join(OUT, f'{name}.wav'), y, SR, subtype='PCM_16')
        onset, peak = measure(y)
        assert onset <= peak + 0.005, (name, onset, peak)
        man[name] = {'file': f'{name}.wav', 'duration': round(len(y) / SR, 2), 'description': desc, 'onset': onset, 'peak': peak,
                     'source': f'earshot {sid}, seed {meta["seed"]}' + (f', {knobs}' if knobs else '')}
        print(f'{name:18s} {sid:26s} {man[name]["duration"]:5.2f}s onset {onset:.3f} peak {peak:.3f}')
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf8') as f:
        f.write(json.dumps(man, indent=2, ensure_ascii=False) + '\n')
    print(len(man), 'sons em', OUT)


if __name__ == '__main__':
    main()
