#!/usr/bin/env python3
# usage: publish_audio.py SRC_AUDIO SLUG TITLE [DATE DESC]   (run inside repo root)
# Makes the 64k mono MP3 at assets/audio/bible-study/SLUG.mp3 and prints "SLUG N min".
# Since Nov 10, 2026 every Kreyol audio lives ONLY on /kreyol/ (hub and its own study page, built by
# _build/kreyol_pages.py from _build/kreyol-studies.json). The Bible Study page is English reading
# studies only, so this script no longer adds a card or a BS_AUDIO entry there. DATE and DESC are ignored.
import subprocess, sys

src, S, T = sys.argv[1:4]
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).decode())
ln = '%d min' % round(dur / 60)
subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '1', '-b:a', '64k', '-metadata', 'title=' + T,
                       '-metadata', 'artist=Etid Biblik Shekinah', 'assets/audio/bible-study/%s.mp3' % S])
print(S, ln)
