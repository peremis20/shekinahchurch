#!/usr/bin/env python3
# usage: publish_audio.py SRC_M4A SLUG TITLE DATE DESC  (run inside repo root)
import sys,re,subprocess,math
src,S,T,D,DS=sys.argv[1:6]
dur=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',src]).decode())
ln="%d min"%round(dur/60)
subprocess.check_call(['ffmpeg','-v','error','-y','-i',src,'-ac','1','-b:a','64k','-metadata','title='+T,'-metadata','artist=Etid Biblik Shekinah','assets/audio/bible-study/%s.mp3'%S])
entry='{ title: "%s", speaker: "Etid Biblik Shekinah", date: "%s", desc: "%s", lang: "ht", length: "%s", src: "/assets/audio/bible-study/%s.mp3", page: "/kreyol/%s/" }'%(T,D,DS,ln,S,S)
old='const BS_AUDIO = [{ '
for f in subprocess.check_output(['grep','-rlF','--include=*.html',old,'.']).decode().split():
    s=open(f,encoding='utf-8').read()
    if S+'.mp3' in s: continue
    open(f,'w',encoding='utf-8').write(s.replace(old,'const BS_AUDIO = ['+entry+', { ',1))
f='bible-study/index.html'; s=open(f,encoding='utf-8').read()
ART=r'\n\s*<article[^>]*>(?:(?!</article>).)*?</article>'
def audio_cards(s): return [m for m in re.finditer(ART,s,re.S) if '/assets/audio/bible-study/' in m.group(0)]
if S+'.mp3" aria-label' not in s:
    # copy the newest baked Kreyol audio card and fill in the new study
    c=audio_cards(s)[0].group(0)
    c=re.sub(r'(<h3[^>]*><span class="sc-interp">)[^<]*',lambda m:m.group(1)+T,c,count=1)
    c=re.sub(r'Etid Biblik Shekinah · [^<]*','Etid Biblik Shekinah · %s · %s'%(D,ln),c,count=1)
    c=re.sub(r'(<p[^>]*><span class="sc-interp">)[^<]*',lambda m:m.group(1)+DS,c,count=1)
    c=re.sub(r'/assets/audio/bible-study/[^"]*\.mp3','/assets/audio/bible-study/%s.mp3'%S,c)
    c=re.sub(r'aria-label="[^"]*"','aria-label="%s"'%T.replace('"','&quot;'),c,count=1)
    c=re.sub(r'href="/kreyol/[^"]*/"','href="/kreyol/%s/"'%S,c)
    first=audio_cards(s)[0]
    s=s[:first.start()]+c+s[first.start():]
    # the Bible Study page shows only the 3 newest Kreyol audios; /kreyol/ has them all
    for m in reversed(audio_cards(s)[3:]): s=s[:m.start()]+s[m.end():]
    total=len(re.findall(r'lang: "ht", length:',s))
    s=re.sub(r'Tout \d+ etid biblik an Kreyòl yo','Tout %d etid biblik an Kreyòl yo'%total,s)
    open(f,'w',encoding='utf-8').write(s)
print(S,ln)
