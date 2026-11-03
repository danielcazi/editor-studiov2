#!/usr/bin/env python3
"""Screenshot a website for a "shot" card (e.g. the homepage of a tool you mention). ~5-10 s.
Usage: screenshot.py <url> <out.png>"""
import os, shutil, statistics, subprocess, sys

url, out = sys.argv[1], sys.argv[2]
PF, PF86, LAD = os.environ.get("ProgramFiles", r"C:\Program Files"), os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), os.environ.get("LOCALAPPDATA", "")
chrome = next((c for c in [os.environ.get("CHROME_PATH"),
                           "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
                           "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                           rf"{PF}\Google\Chrome\Application\chrome.exe", rf"{PF86}\Google\Chrome\Application\chrome.exe", rf"{LAD}\Google\Chrome\Application\chrome.exe",
                           rf"{PF86}\Microsoft\Edge\Application\msedge.exe",
                           shutil.which("google-chrome"), shutil.which("chromium")] if c and os.path.isfile(c)), None)
if not chrome: sys.exit("no Chrome/Chromium/Edge found - install Chrome, or use your own screenshot")
subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1280,900", f"--screenshot={out}", url], capture_output=True)
# Some sites (claude.ai, anything behind Cloudflare) answer bots with a blank "verifying you are human" page.
# Flag near-uniform screenshots so they never land in a reel.
px = subprocess.run(["ffmpeg", "-v", "error", "-i", out, "-vf", "scale=48:32,format=gray", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
std = int(statistics.pstdev(px))
if std < 14:
    os.remove(out)
    print(f"blocked or blank screenshot (contrast {std}): try the tool's marketing site, or take the screenshot yourself", file=sys.stderr); sys.exit(2)
print(out)
