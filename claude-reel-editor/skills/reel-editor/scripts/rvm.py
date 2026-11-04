# RVM matting: source.mp4 -> webm VP9 with alpha. Usage: rvm.py model.onnx in.mp4 out.webm [downsample] [max_frames] [--windows=a-b,c-d]
# --windows (seconds): inference only inside them, alpha 0 outside (Speech Screen: the cut-out shows in three short windows)
import subprocess, sys, time
import numpy as np, onnxruntime as ort

argv = [a for a in sys.argv[1:] if not a.startswith('--')]
windows = [tuple(map(float, w.split('-'))) for a in sys.argv[1:] if a.startswith('--windows=') for w in a[10:].split(',') if w]
assert all(b > a >= 0 for a, b in windows), windows
model, src, out = argv[:3]
ds = float(argv[3]) if len(argv) > 3 else 0.4  # 0.4: upper-body close-up at 1080p
maxf = int(argv[4]) if len(argv) > 4 else 0
inside = lambda t: not windows or any(a <= t < b for a, b in windows)
W, H = 1920, 1080

# CPU on purpose: measured on an M3 Pro at 1080p, CPU 5.9 fps; CoreML 3.8 fps (MLProgram/ALL 4.4): the recurrent graph falls back node by node.
sess = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
rec = [np.zeros([1, 1, 1, 1], np.float32)] * 4
dsr = np.array([ds], np.float32)

# fit (never stretch) into the 1920x1080 stage: a vertical source becomes a centred strip, the sides stay transparent
# first line only: a .mov with a stream group makes ffprobe print the stream twice ("1920,1080\n\n1920,1080")
sw, sh = map(int, subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src], text=True).split('\n')[0].split(',')[:2])
fw = min(W, round(sw * H / sh / 2) * 2); x0 = (W - fw) // 2
dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'fps=30,scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-r', '30', '-i', '-',
                        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '6M', '-auto-alt-ref', '0', '-g', '30',
                        # 17 fps instead of 7 (same file size): the default encoder competed with the inference for the CPU
                        '-row-mt', '1', '-cpu-used', '4', '-deadline', 'good', out], stdin=subprocess.PIPE)
ZERO = bytes(W * H * 4)
n, t0 = 0, time.time()
while True:
    buf = dec.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    if inside(n / 30):
        rgb = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        x = (rgb.astype(np.float32) / 255).transpose(2, 0, 1)[None]
        fgr, pha, *rec = sess.run(None, {'src': x, 'r1i': rec[0], 'r2i': rec[1], 'r3i': rec[2], 'r4i': rec[3], 'downsample_ratio': dsr})
        a = (pha[0, 0] * 255).clip(0, 255).astype(np.uint8)
        a[:, :x0] = 0; a[:, x0 + fw:] = 0
        enc.stdin.write(np.dstack([rgb, a]).tobytes())  # original color, RVM alpha
    else:
        # outside the windows the frame is invisible anyway: a black transparent frame encodes several times faster than the picture
        enc.stdin.write(ZERO); rec = [np.zeros([1, 1, 1, 1], np.float32)] * 4   # recurrent state restarts at the next window
    n += 1
    if n % 150 == 0:
        print(f'{n} frames, {n / (time.time() - t0):.1f} fps', flush=True)
    if maxf and n >= maxf:
        break
dec.kill(); enc.stdin.close(); enc.wait()
assert n > 0, 'no frames decoded'
print('done', n, 'frames')
