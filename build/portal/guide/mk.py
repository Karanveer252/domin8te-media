from PIL import Image
import os
P=[("Client dashboard","Home","d-home","The first page a restaurant client sees: a summary of their month."),
("Client dashboard","Work","d-work","What we are doing for them, as cards they can open."),
("Client dashboard","Results","d-results","The numbers and proof of what the work has done."),
("Client dashboard","Billing","d-billing","Their plan and invoices."),
("Client dashboard","Messages","d-messages","Talk to the Domin8te team."),
("Client dashboard","Settings","d-settings","Their details, logo and connected accounts."),
("Agency console","Needs you","c-queue","Everything waiting on Karan, approve or decline."),
("Agency console","Messages","c-messages","Client conversations in one inbox."),
("Agency console","Bot chat","c-bot","Drafts from the bots to approve, reject or snooze."),
("Agency console","Add a client","c-new","Start a new client."),
("Agency console","Clients","c-clients","All clients and their status."),
("Agency console","All work","c-board","One board of every client's cards."),
("Agency console","Billing","c-billing","Plans and invoices for each client."),
("Agency console","Revenue","c-revenue","Money in and out. Only Karan's account can see this."),
("Agency console","Settings","c-settings","Team, notifications and console options."),
("Agency console","One client: Overview","t-overview","Each client has tabs: Overview, Work, Talk, Setup, Advanced."),
("Shared","Ctrl K palette","x-ctrlk","Press Ctrl K to jump to any client or page."),
("Shared","Dark view","d-queue","Needs you in the dark theme."),
("Shared","Phone view","p-queue","Needs you at phone width."),
("Not live yet","What is not live yet","","Everything in this guide is local. Nothing is live until Karan says deploy.")]
os.makedirs('j',exist_ok=True)
h='''<!doctype html><meta charset=utf-8><title>Domin8te portal guide</title><link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;700&display=swap" rel=stylesheet>
<style>@page{size:A4 landscape;margin:12mm}body{margin:0;background:#F4F1EC;color:#1D1A16;font-family:'Schibsted Grotesk',system-ui,sans-serif}
.p{page-break-after:always;height:182mm;overflow:hidden;position:relative}.p:last-child{page-break-after:auto}
h1{margin:0;font-size:22pt}h2{margin:0 0 2mm;font-size:18pt}.k{color:#FF5B1F;font-weight:700;font-size:10pt;text-transform:uppercase}
p{margin:1mm 0 3mm;font-size:11pt}img{max-width:100%;max-height:150mm;border:1px solid #1D1A16;display:block}
.f{position:absolute;bottom:0;font-size:8pt;color:#6b655c}</style>
<div class=p><div class=k>Domin8te portal guide</div><h1 style="font-size:40pt;margin-top:50mm">Console and dashboard</h1><p>Screens and basic options, a design and software reference.</p><div class=f>Domin8te portal guide, 16 Oct 2026</div></div>'''
for k,t,i,c in P:
    h+=f'<div class=p><div class=k>{k}</div><h2>{t}</h2><p>{c}</p>'
    if i:
        im=Image.open(f'img/{i}.png').convert('RGB'); w=1100; im=im.resize((w,int(im.height*w/im.width)))
        im.save(f'j/{i}.jpg',quality=76); h+=f'<img src="j/{i}.jpg">'
    h+='<div class=f>Domin8te portal guide, 16 Oct 2026</div></div>'
open('guide.html','w',encoding='utf-8').write(h)
