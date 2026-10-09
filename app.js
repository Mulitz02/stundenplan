// Stundenplan HBC – alle Studiengänge der Hochschule Biberach, Daten aus dem öffentlichen LSF-Studiengangplan
(function(){
const DAY=864e5, WDL=["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"], WDS=["So","Mo","Di","Mi","Do","Fr","Sa"];
const $=id=>document.getElementById(id);
const P=s=>{const[y,m,d]=s.split("-").map(Number);return Date.UTC(y,m-1,d)};
const F=t=>new Date(t).toISOString().slice(0,10);
const MD=t=>F(t).slice(5).replace("-","");
const fromMD=md=>{const m=+md.slice(0,2),d=+md.slice(2);return Date.UTC(m>=8?2026:2027,m-1,d)};
const fmt=t=>{const d=new Date(t);return String(d.getUTCDate()).padStart(2,"0")+"."+String(d.getUTCMonth()+1).padStart(2,"0")+"."};
const mins=s=>{const[h,m]=s.split(":").map(Number);return h*60+m};
const BREAK=[P("2026-12-24"),P("2027-01-06")];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const store={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const code=id=>{let h=5381;for(const ch of id)h=((h*33)^ch.charCodeAt(0))>>>0;return h.toString(36).slice(0,5)};
let toastT;
function toast(msg){const t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,1800)}

// Zustand
let LIST=[], STAND="", stg=store.get("stg"), courses=[], byId={}, byCode={}, sel=new Set(), filter="all", query="", view="week";
// Übernahme der alten BPH-Auswahl aus der ersten App-Version
const old=store.get("bph-sel-v2");
if(old&&!store.get("sel-143")){store.set("sel-143",old);if(!stg){stg="143";store.set("stg","143")}}

// Kurs-Bezeichnungen
function nice(name){
  let n=name.replace(/^[A-ZÄÖÜ]{1,3}\.\s*/,"");
  n=n.replace(/ \/ [A-ZÄÖÜ]{1,3}\..*$/,"");
  const g=n.match(/^Grdl\.\s*(d\.\s*)?(.*)$/);
  if(g) n=g[2].replace(/^([a-zäöü])/,c=>c.toUpperCase())+" (Grundlagen)";
  if(/^Ü\./.test(name)) n+=" (Übung)";
  return n;
}
function bucket(name,nr){
  if(/^W\./.test(name)) return [90,"Wahlfächer"];
  const m=(nr||"").match(/^[A-ZÄÖÜ]+(\d{2})_/);
  if(!m||+m[1]===0) return [95,"Allgemein & Einführung"];
  const s=Math.ceil(+m[1]/6);
  if(s>7) return [91,"Wahlfächer & Sonstiges"];
  return [s,"ca. "+s+". Semester"];
}

// Daten laden
let DOZ={}; // Veranstaltung → Dozent/in (aus den Detailseiten im LSF)
async function loadList(){
  const r=await fetch("data/studiengaenge.json",{cache:"no-cache"});
  const j=await r.json(); LIST=j.list; STAND=j.stand;
  try{const d=await fetch("data/dozenten.json",{cache:"no-cache"});if(d.ok)DOZ=await d.json()}catch(e){}
  $("stand").textContent="Stand LSF "+STAND;
  $("standtop").textContent="Termine: Stand LSF vom "+STAND;
}
async function loadStg(id){
  $("days").innerHTML='<div class="loading">Lade Stundenplan …</div>';
  const r=await fetch("data/"+id+".json",{cache:"no-cache"});
  if(!r.ok) throw new Error("Keine Daten für diesen Studiengang");
  const j=await r.json();
  build(j.d);
  const saved=store.get("sel-"+id);
  sel=new Set((saved||[]).filter(k=>byId[k]));
  $("stgname").innerHTML="<b>"+esc(j.t)+"</b> · WS 2026/27";
  $("stgchange").textContent="wechseln";
  $("lsfplan").href="https://lsf.hochschule-bc.de/qisserver/rds?state=wplan&k_abstgv.abstgvnr="+id+"&week=-1&act=stg&pool=stg&show=liste&P.vx=lang&P.subc=plan";
  return saved;
}
function build(data){
  courses=[];
  data.forEach(([name,nr,groups])=>groups.forEach(([grp,ser,sing])=>{
    const [bo,bl]=bucket(name,nr);
    const label=nice(name)+(grp?" · "+grp:"");
    const id=name+(grp?"|"+grp:"");
    courses.push({id,name,nr,label,bo,bl,ser,sing,doz:DOZ[name]||"",h:Math.round((courses.length*137.508)%360)});
  }));
  courses.forEach(c=>{
    const ev=[], moved=new Set();
    c.sing.forEach(([f,t,r,ds,cx])=>ds.forEach(md=>{ev.push({c,d:fromMD(md),f,t,r,cancel:cx.includes(md),kind:"Einzeltermin"});moved.add(md)}));
    c.ser.forEach(([wd,f,t,step,a,b,cx,r])=>{
      if(!a||!b) return;
      for(let d=fromMD(a);d<=fromMD(b);d+=step*DAY){
        const md=MD(d);
        if(d>=BREAK[0]&&d<=BREAK[1]) continue;
        const isX=cx.includes(md);
        if(isX&&moved.has(md)){ev.forEach(e=>{if(MD(e.d)===md&&!e.cancel&&e.f===f)e.moved=true});continue}
        ev.push({c,d,f,t,r,cancel:isX,kind:step===14?"14-tägl.":""});
      }
    });
    ev.sort((x,y)=>x.d-y.d||mins(x.f)-mins(y.f));
    c.ev=ev;
    const parts=c.ser.filter(s=>s[4]).map(([wd,f,t,step,a,b,cx,r])=>WDS[wd>=0?wd:new Date(fromMD(a)).getUTCDay()]+" "+f+"–"+t+(step===14?" (14-tägl.)":"")+" · "+r);
    const n=c.sing.reduce((s,x)=>s+x[3].length,0);
    if(n&&!parts.length){const first=ev.find(e=>!e.cancel)||ev[0];parts.push(n===1?WDS[new Date(first.d).getUTCDay()]+" "+fmt(first.d)+" "+first.f+"–"+first.t+" · "+first.r:n+" Einzeltermine ab "+fmt(first.d))}
    c.summary=parts.join(" | ");
  });
  courses=courses.filter(c=>c.ev.length);
  byId=Object.fromEntries(courses.map(c=>[c.id,c]));
  byCode=Object.fromEntries(courses.map(c=>[code(c.id),c]));
}
const save=()=>store.set("sel-"+stg,[...sel]);

// Überschneidungen
function clashesOf(list){
  const live=list.filter(e=>!e.cancel), out=new Set();
  for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
    const a=live[i],b=live[j];
    if(a.d===b.d&&a.c!==b.c&&mins(a.f)<mins(b.t)&&mins(b.f)<mins(a.t)){out.add(a);out.add(b)}
  }
  return out;
}
function mineEvents(){return courses.filter(c=>sel.has(c.id)).flatMap(c=>c.ev).sort((a,b)=>a.d-b.d||mins(a.f)-mins(b.f))}
function clashPartners(c){
  const mine=c.ev.filter(e=>!e.cancel), names=new Set();
  courses.forEach(o=>{if(o===c||!sel.has(o.id))return;o.ev.forEach(e=>{if(!e.cancel&&mine.some(m=>m.d===e.d&&mins(m.f)<mins(e.t)&&mins(e.f)<mins(m.t)))names.add(o.label)})});
  return [...names];
}

// Woche
const now=new Date(), todayK=F(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
const monday=t=>t-((new Date(t).getUTCDay()+6)%7)*DAY;
const FIRST=monday(P("2026-10-05")), LAST=monday(P("2027-02-26"));
const clampW=t=>Math.min(LAST,Math.max(FIRST,t));
const homeW=clampW(monday(P(todayK)));
let week=homeW;
const isoWeek=t=>{const th=t+(3-(new Date(t).getUTCDay()+6)%7)*DAY;const y=new Date(th).getUTCFullYear();return 1+Math.round((th-monday(Date.UTC(y,0,4)))/DAY/7)};

function evHTML(e,clash){
  const tags=[];
  if(e.cancel) tags.push('<span class="tag warn">fällt aus</span>');
  if(clash) tags.push('<span class="tag warn">Überschneidung</span>');
  if(e.moved) tags.push('<span class="tag note">Raum geändert</span>');
  if(e.kind) tags.push('<span class="tag">'+e.kind+'</span>');
  return '<div class="ev'+(e.cancel?' cancel':'')+(clash?' clash':'')+'" style="--h:'+e.c.h+'">'+
    '<div class="t">'+e.f+'–'+e.t+'</div><div class="n"><i class="dot"></i><span>'+esc(e.c.label)+'</span></div>'+
    '<div class="r">'+esc(e.r||"Raum offen")+'</div>'+(e.c.doz?'<div class="r doz">'+esc(e.c.doz)+'</div>':'')+(tags.length?'<div class="tags">'+tags.join("")+'</div>':'')+'</div>';
}
// Pausen zwischen den Kursen als leerer Abstand: je länger die Pause, desto größer die Lücke
function gapHTML(m){return '<div class="gap" style="height:'+Math.round(Math.min(96,m*0.6))+'px" aria-hidden="true"></div>'}
function dayHTML(evs,cl){
  let html="",end=null;
  for(const e of evs){
    if(!e.cancel){
      if(end!==null&&mins(e.f)-end>=5) html+=gapHTML(mins(e.f)-end);
      end=Math.max(end??0,mins(e.t));
    }
    html+=evHTML(e,cl.has(e));
  }
  return html;
}
function renderWeek(){
  const all=mineEvents();
  const wk=all.filter(e=>e.d>=week&&e.d<week+7*DAY);
  const cl=clashesOf(wk);
  $("kw").innerHTML="KW "+isoWeek(week)+" <small>"+fmt(week)+" – "+fmt(week+4*DAY)+new Date(week+4*DAY).getUTCFullYear()+"</small>";
  $("banner").hidden=!(week+4*DAY>=BREAK[0]&&week<=BREAK[1]);
  $("banner").textContent="Weihnachtspause 24.12.–06.01.: wöchentliche Termine ausgeblendet, Einzeltermine laut LSF bleiben drin.";
  const hasSat=wk.some(e=>new Date(e.d).getUTCDay()===6);
  let html="";
  for(let i=0;i<(hasSat?6:5);i++){
    const d=week+i*DAY, evs=wk.filter(e=>e.d===d);
    html+='<div class="day'+(F(d)===todayK?' today':'')+'"><div class="dh"><b>'+WDL[new Date(d).getUTCDay()]+'</b><span>'+fmt(d)+'</span></div>'+
      (evs.length?dayHTML(evs,cl):'<div class="empty">Frei</div>')+'</div>';
  }
  if(!sel.size) html='<div class="day"><div class="empty">Noch keine Kurse angemeldet. Tippe unten auf „Kurse“ und melde dich für deine Fächer an.</div></div>';
  $("days").innerHTML=html;
  $("prev").disabled=week<=FIRST;
  $("fwd").disabled=week>=LAST;
  const nowMin=now.getHours()*60+now.getMinutes();
  const nx=all.find(e=>!e.cancel&&(F(e.d)>todayK||(F(e.d)===todayK&&mins(e.t)>nowMin)));
  $("next").innerHTML=nx?'<span class="lbl">Nächster Termin</span><strong>'+esc(nx.c.label)+'</strong><span>'+WDL[new Date(nx.d).getUTCDay()]+', '+fmt(nx.d)+' · '+nx.f+'–'+nx.t+' · '+esc(nx.r||"Raum offen")+'</span>':'<span class="lbl">'+(sel.size?'Keine weiteren Termine':'Noch keine Kurse angemeldet')+'</span>';
}

// Kurse
function renderCourses(){
  $("selcount").textContent=sel.size+" angemeldet";
  const q=query.trim().toLowerCase();
  const buckets=[...new Map(courses.map(c=>[c.bo,c.bl])).entries()].sort((a,b)=>a[0]-b[0]);
  let html="";
  buckets.forEach(([bo,bl])=>{
    let list=courses.filter(c=>c.bo===bo&&(filter==="all"||sel.has(c.id))&&(!q||(c.label+" "+c.name+" "+c.nr+" "+c.summary+" "+c.doz).toLowerCase().includes(q)));
    if(!list.length) return;
    list.sort((a,b)=>a.label.localeCompare(b.label,"de"));
    const nSel=list.filter(c=>sel.has(c.id)).length;
    const allOn=nSel===list.length;
    html+='<div class="group"><h3><span>'+bl+' · '+nSel+' / '+list.length+'</span><button type="button" class="all" data-b="'+bo+'" data-on="'+(allOn?0:1)+'">'+(allOn?'alle abmelden':'alle anmelden')+'</button></h3><div class="list">'+list.map(c=>{
      const on=sel.has(c.id), cp=on?clashPartners(c):[];
      return '<div class="row"><div class="info"><div class="nm"><i class="dot" style="--h:'+c.h+'"></i><span>'+esc(c.label)+'</span></div>'+
        '<div class="meta">'+(c.doz?'<span class="doz">'+esc(c.doz)+'</span><br>':'')+esc(c.summary||"Keine Termine")+(cp.length?'<br><span class="w">Überschneidung mit: '+esc(cp.join(", "))+'</span>':'')+'</div></div>'+
        '<button type="button" class="tog" data-id="'+esc(c.id)+'" aria-pressed="'+on+'">'+(on?'✓ Angemeldet':'Anmelden')+'</button></div>';
    }).join("")+'</div></div>';
  });
  $("groups").innerHTML=html||'<p class="fine">Kein Kurs gefunden.</p>';
}

// Studiengang-Auswahl
function renderPicker(){
  const q=$("stgq").value.trim().toLowerCase();
  const fac={A:"Architektur",B:"Bauingenieurwesen",BCE:"Bauingenieurwesen",BT:"Biotechnologie",EI:"Energie",EW:"Energie",iBit:"Institut für Bildungstransfer",P:"Projektmanagement",W:"Betriebswirtschaft",Akademie:"Akademie",OSF:"Sonstiges"};
  const groups={};
  LIST.filter(([id,t])=>!q||t.toLowerCase().includes(q)).forEach(x=>{const k=fac[(x[1].match(/^([^\s-]+)\s*-/)||[])[1]]||"Sonstiges";(groups[k]=groups[k]||[]).push(x)});
  let html="";
  Object.keys(groups).sort((a,b)=>a.localeCompare(b,"de")).forEach(k=>{
    html+='<div class="group"><h3><span>'+esc(k)+'</span></h3><div class="list">'+groups[k].sort((a,b)=>(b[2]>0)-(a[2]>0)||a[1].localeCompare(b[1],"de")).map(([id,t,n])=>{
      const clean=t.replace(/^[^\s-]+\s*-\s*/,"");
      return '<div class="row'+(n?'':' off')+(id===stg?' cur':'')+'" data-id="'+id+'" data-n="'+n+'"><div class="info"><div class="nm"><span>'+esc(clean)+'</span></div><div class="meta">'+(n?n+' Veranstaltungen im WS 2026/27':'Keine Termine im Studiengangplan')+'</div></div>'+(n?'<button type="button" class="pick">'+(id===stg?'✓ Gewählt':'Wählen')+'</button>':'')+'</div>';
    }).join("")+'</div></div>';
  });
  $("stglist").innerHTML=html||'<p class="fine">Kein Studiengang gefunden.</p>';
}

// Ansichten
function show(v){
  view=v;
  $("view-pick").hidden=v!=="pick";
  $("view-week").hidden=v!=="week";
  $("view-courses").hidden=v!=="courses";
  $("tabbar").hidden=v==="pick"||!stg;
  $("tab-week").setAttribute("aria-selected",v==="week");
  $("tab-courses").setAttribute("aria-selected",v==="courses");
  if(v==="pick"){welcome("");renderPicker()}
  window.scrollTo(0,0);
}
function welcome(html){const w=$("welcome");w.innerHTML=html;w.hidden=!html}
function renderAll(){renderWeek();renderCourses()}

async function chooseStg(id,{fresh}={}){
  stg=id; store.set("stg",id);
  const saved=await loadStg(id);
  renderAll();
  if(!saved||!saved.length){show("courses");if(fresh)toast("Jetzt deine Fächer anmelden")}else show("week");
}

// Ereignisse
$("stgchange").onclick=()=>show("pick");
$("stgq").addEventListener("input",renderPicker);
$("stglist").addEventListener("click",e=>{
  const r=e.target.closest(".row"); if(!r||r.dataset.n==="0") return;
  chooseStg(r.dataset.id,{fresh:true}).catch(err=>toast(err.message));
});
$("groups").addEventListener("click",e=>{
  const all=e.target.closest(".all");
  if(all){
    const bo=+all.dataset.b, on=all.dataset.on==="1";
    const q=query.trim().toLowerCase();
    courses.filter(c=>c.bo===bo&&(filter==="all"||sel.has(c.id))&&(!q||(c.label+" "+c.name+" "+c.nr+" "+c.summary+" "+c.doz).toLowerCase().includes(q))).forEach(c=>on?sel.add(c.id):sel.delete(c.id));
    save();renderAll();toast(on?"Gruppe angemeldet":"Gruppe abgemeldet");return;
  }
  const b=e.target.closest(".tog"); if(!b) return;
  const id=b.dataset.id, c=byId[id];
  if(sel.has(id)){sel.delete(id);toast("Abgemeldet: "+c.label)}else{sel.add(id);toast("Angemeldet: "+c.label)}
  save(); renderAll();
});
$("q").addEventListener("input",e=>{query=e.target.value;renderCourses()});
$("seg").addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b) return;
  filter=b.dataset.f;
  document.querySelectorAll("#seg button").forEach(x=>x.setAttribute("aria-pressed",x===b));
  renderCourses();
});
let armedC=false;
$("clear").addEventListener("click",()=>{
  const b=$("clear");
  if(!armedC){armedC=true;b.textContent="Wirklich alle abmelden? Nochmal tippen";setTimeout(()=>{armedC=false;b.textContent="Alle abmelden"},3000);return}
  armedC=false;b.textContent="Alle abmelden";
  sel.clear();save();renderAll();toast("Alle Kurse abgemeldet");
});
$("share").addEventListener("click",()=>{
  if(!sel.size){toast("Melde zuerst Kurse an");return}
  const link=location.origin+location.pathname+"#s"+stg+"k"+[...sel].map(code).join(".");
  const inp=$("sharelink"), msg=$("sharemsg");
  $("sharebox").hidden=false; inp.value=link;
  const fallback=()=>{inp.focus();inp.select();msg.textContent="Link markiert. Kopieren und per WhatsApp oder Mail verschicken."};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(link).then(()=>{msg.textContent="Link kopiert. Wer ihn öffnet, bekommt deinen Studiengang und kann deine "+sel.size+" Kurse mit einem Tipp übernehmen.";toast("Link kopiert")},fallback)}else fallback();
});
$("ics").addEventListener("click",()=>{
  const evs=mineEvents().filter(e=>!e.cancel);
  if(!evs.length){toast("Keine Termine zum Exportieren");return}
  const dt=(d,t)=>F(d).replace(/-/g,"")+"T"+t.replace(":","")+"00";
  const ex=s=>String(s).replace(/[\\,;]/g,m=>"\\"+m);
  const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//HBC//Stundenplan//DE","CALSCALE:GREGORIAN","X-WR-CALNAME:Uni","X-WR-TIMEZONE:Europe/Berlin",
  "BEGIN:VTIMEZONE","TZID:Europe/Berlin","BEGIN:DAYLIGHT","TZOFFSETFROM:+0100","TZOFFSETTO:+0200","TZNAME:CEST","DTSTART:19700329T020000","RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU","END:DAYLIGHT","BEGIN:STANDARD","TZOFFSETFROM:+0200","TZOFFSETTO:+0100","TZNAME:CET","DTSTART:19701025T030000","RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU","END:STANDARD","END:VTIMEZONE"];
  evs.forEach(e=>L.push("BEGIN:VEVENT","UID:"+stg+"-"+code(e.c.id)+"-"+dt(e.d,e.f)+"@stundenplan-hbc","DTSTAMP:20260929T080000Z","DTSTART;TZID=Europe/Berlin:"+dt(e.d,e.f),"DTEND;TZID=Europe/Berlin:"+dt(e.d,e.t),"SUMMARY:"+ex(e.c.label),"LOCATION:"+ex("HBC "+(e.r||"Raum offen")),"DESCRIPTION:"+ex("Stand LSF "+STAND),"END:VEVENT"));
  L.push("END:VCALENDAR");
  const blob=new Blob([L.join("\r\n")+"\r\n"],{type:"text/calendar"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="Stundenplan.ics";document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000);
  toast(evs.length+" Termine exportiert");
});
$("prev").onclick=()=>{week=clampW(week-7*DAY);renderWeek()};
$("fwd").onclick=()=>{week=clampW(week+7*DAY);renderWeek()};
$("now").onclick=()=>{week=homeW;renderWeek()};
$("tab-week").onclick=()=>show("week");
$("tab-courses").onclick=()=>show("courses");
// Beim Zurückkehren in die App auf die aktuelle Woche springen, falls ein neuer Tag begonnen hat
document.addEventListener("visibilitychange",()=>{if(!document.hidden){const n=new Date();if(F(Date.UTC(n.getFullYear(),n.getMonth(),n.getDate()))!==todayK)location.reload()}});

// Start
(async()=>{
  try{await loadList()}catch(e){$("days").innerHTML='<div class="loading">Keine Verbindung. Bitte später erneut öffnen.</div>';return}
  const hm=location.hash.match(/^#s(\d+)k([\w.]+)/);
  if(hm&&LIST.some(x=>x[0]===hm[1]&&x[2])){
    const sid=hm[1], codes=hm[2].split(".");
    history.replaceState(null,"",location.pathname);
    const prevStg=stg;
    stg=sid; store.set("stg",sid);
    await loadStg(sid);
    const ids=codes.map(k=>byCode[k]).filter(Boolean).map(c=>c.id);
    renderAll(); show("week");
    if(ids.length){
      const t=(LIST.find(x=>x[0]===sid)||[])[1]||"";
      welcome('<h2>Kurswahl empfangen</h2><p>Jemand hat dir '+ids.length+' Kurse aus '+esc(t.replace(/^[^\s-]+\s*-\s*/,""))+' geschickt. Übernehmen? Deine bisherige Auswahl in diesem Studiengang wird dabei ersetzt.</p><div class="actions"><button class="btn primary" id="w-yes" type="button">Übernehmen</button><button class="btn" id="w-no" type="button">Nein danke</button></div>');
      $("w-yes").onclick=()=>{sel=new Set(ids);save();welcome("");renderAll();toast(ids.length+" Kurse übernommen")};
      $("w-no").onclick=async()=>{welcome("");if(prevStg&&prevStg!==sid){await chooseStg(prevStg)}};
    }
    return;
  }
  if(stg&&LIST.some(x=>x[0]===stg&&x[2])){
    try{const saved=await loadStg(stg);renderAll();show(saved&&saved.length?"week":"courses")}catch(e){show("pick")}
  }else{
    show("pick");
    welcome('<h2>Willkommen</h2><p>Wähle deinen Studiengang. Danach meldest du dich für deine Fächer an, und die App baut dir daraus deinen Wochenplan, mit Räumen, Ausfällen und Überschneidungen aus dem LSF.</p>');
    $("welcome").hidden=false;
  }
})();
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}))}
})();
