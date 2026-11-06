#!/usr/bin/env python3
# usage: publish_audio.py SRC_M4A SLUG TITLE DATE DESC  (run inside repo root)
import sys,re,subprocess,math
src,S,T,D,DS=sys.argv[1:6]
dur=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',src]).decode())
ln="%d min"%round(dur/60)
subprocess.check_call(['ffmpeg','-v','error','-y','-i',src,'-ac','1','-b:a','64k','-metadata','title='+T,'-metadata','artist=Etid Biblik Shekinah','assets/audio/bible-study/%s.mp3'%S])
entry='{ title: "%s", speaker: "Etid Biblik Shekinah", date: "%s", desc: "%s", lang: "ht", length: "%s", src: "/assets/audio/bible-study/%s.mp3", page: "/kreyol/etid/%s/" }'%(T,D,DS,ln,S,S)
old='const BS_AUDIO = [{ '
for f in subprocess.check_output(['grep','-rlF','--include=*.html',old,'.']).decode().split():
    s=open(f,encoding='utf-8').read()
    if S+'.mp3' in s: continue
    open(f,'w',encoding='utf-8').write(s.replace(old,'const BS_AUDIO = ['+entry+', { ',1))
f='bible-study/index.html'; s=open(f,encoding='utf-8').read()
if S+'.mp3" aria-label' not in s:
    m=re.search(r'\n\s*<article[^>]*>(?:(?!</article>).)*?eske-konstanten-te-chanje-bib-la\.mp3.*?</article>',s,re.S)
    c=m.group(0).replace('Èske Konstanten te chanje Bib la? Verite sou Konsil Nise a',T)
    c=re.sub(r'Etid Biblik Shekinah · [^<]*','Etid Biblik Shekinah · %s · %s'%(D,ln),c,count=1)
    c=re.sub(r'Yon etid an Kreyòl sou Konsil Nise a[^<]*',DS,c).replace('eske-konstanten-te-chanje-bib-la',S)
    c=re.sub(r'href="/kreyol/etid/[^"]*/"','href="/kreyol/etid/%s/"'%S,c)
    first=re.search(r'\n\s*<article[^>]*>(?:(?!</article>).)*?/assets/audio/bible-study/',s,re.S)
    s=s[:first.start()]+c+s[first.start():]
    open(f,'w',encoding='utf-8').write(s)
print(S,ln)
