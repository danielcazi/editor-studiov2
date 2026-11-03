# SRT/VTT entry: one HyperFrames entry per subtitle -> words with proportional timing (scripts/transcribe.py).
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "claude-reel-editor/skills/reel-editor/scripts"))
from transcribe import split_words

out = split_words([{"text": "Olá, pessoal.", "start": 0, "end": 3}, {"text": "Bora", "start": 4, "end": 5}])
assert [w["text"] for w in out] == ["Olá,", "pessoal.", "Bora"], out
assert out[0] == {"text": "Olá,", "start": 0, "end": 1.0}, out[0]       # 4 of 12 characters -> 1 s of 3
assert out[1] == {"text": "pessoal.", "start": 1.0, "end": 3.0}, out[1]
assert out[2] == {"text": "Bora", "start": 4, "end": 5}, out[2]
assert split_words([{"text": "  ", "start": 0, "end": 1}]) == []
print("transcribe split_words: ok")

from transcribe import apply_corrections
words = [{"text": "vamos", "start": 0, "end": 1}, {"text": "pro", "start": 1, "end": 1.5}, {"text": "Conect", "start": 1.5, "end": 2.5},
         {"text": "Hub", "start": 2.5, "end": 3.5}, {"text": "agora.", "start": 3.5, "end": 4.5}]
fixed = apply_corrections(words, [{"from": "conect hub", "to": "Connect Hub"}, {"from": "pro", "to": ""}])
assert [w["text"] for w in fixed] == ["vamos", "Connect", "Hub", "agora."], fixed
assert fixed[1]["start"] == 1.5 and fixed[2]["end"] == 3.5, fixed          # the phrase keeps its span, split by length
assert apply_corrections(words, [{"from": "Agora", "to": "já"}])[-1]["text"] == "já."   # case-insensitive, keeps the full stop
print("transcribe apply_corrections: ok")
