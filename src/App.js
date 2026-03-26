/* eslint-disable */
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const C={navy:'#0F2D6B',orange:'#F97316',orangeL:'#FFF7ED',green:'#10B981',blue:'#3B82F6',gray0:'#F8FAFC',gray1:'#F1F5F9',gray2:'#E2E8F0',gray4:'#94A3B8',gray6:'#475569',white:'#FFFFFF'};
const STATUS={en_attente:{l:'En attente',c:'#92400E',bg:'#FEF3C7',dot:'#F59E0B',icon:'⏳'},recupere:{l:'Récupéré',c:'#1E40AF',bg:'#DBEAFE',dot:'#3B82F6',icon:'📦'},en_livraison:{l:'En livraison',c:'#5B21B6',bg:'#EDE9FE',dot:'#8B5CF6',icon:'🚐'},livre:{l:'Livré',c:'#065F46',bg:'#D1FAE5',dot:'#10B981',icon:'✅'}};
const NEXT={en_attente:'recupere',recupere:'en_livraison',en_livraison:'livre'};
const NEXT_L={en_attente:'Marquer récupéré',recupere:'Mettre en livraison',en_livraison:'Marquer livré'};
const JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const PRICE=5.90;
const DEPOT={rue:'28 Chemin Dozinval',ville:'Les Avirons 97425',label:'Dépôt RFC — Les Avirons',lat:-21.2167,lng:55.3167};
const COORDS={
  'saint-denis':{lat:-20.8823,lng:55.4504},'sainte-marie':{lat:-20.8986,lng:55.5358},
  'sainte-suzanne':{lat:-20.9167,lng:55.5833},'saint-andre':{lat:-20.9631,lng:55.6506},
  'bras-panon':{lat:-20.9989,lng:55.6908},'saint-benoit':{lat:-21.0389,lng:55.7119},
  'plaine-des-palmistes':{lat:-21.1167,lng:55.6333},'sainte-rose':{lat:-21.1272,lng:55.8019},
  'saint-philippe':{lat:-21.3594,lng:55.7669},'saint-joseph':{lat:-21.3806,lng:55.6194},
  'petite-ile':{lat:-21.3575,lng:55.5725},'saint-pierre':{lat:-21.3381,lng:55.4783},
  'le tampon':{lat:-21.2689,lng:55.5108},'entre-deux':{lat:-21.2167,lng:55.4833},
  'cilaos':{lat:-21.1500,lng:55.4833},'saint-louis':{lat:-21.2731,lng:55.4086},
  'etang-sale':{lat:-21.2678,lng:55.3639},'les avirons':{lat:-21.2167,lng:55.3167},
  'saint-leu':{lat:-21.1531,lng:55.2844},'trois-bassins':{lat:-21.1094,lng:55.2883},
  'saint-gilles':{lat:-21.0547,lng:55.2183},'saint-paul':{lat:-21.0078,lng:55.2714},
  'le port':{lat:-20.9333,lng:55.3000},'la possession':{lat:-20.9289,lng:55.3344},
  'salazie':{lat:-21.0333,lng:55.5167},
};

const normCity = c => c.replace(/\s*\d{5}/,'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const getCoords = city => {
  const n = normCity(city);
  if(COORDS[n]) return COORDS[n];
  const key = Object.keys(COORDS).find(k => n.includes(k) || k.includes(n.split(' ').pop()||n));
  return key ? COORDS[key] : {lat:-21.1,lng:55.5};
};
const haversine = (a, b) => {
  const R=6371, dLat=(b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
};

function nearestNeighbor(points) {
  if(!points.length) return [];
  const unvisited = [...points];
  const route = [];
  let curLat = DEPOT.lat;
  let curLng = DEPOT.lng;
  while(unvisited.length) {
    let bestIdx = 0;
    let bestDist = haversine({lat:curLat,lng:curLng}, unvisited[0].coords);
    for(let i = 1; i < unvisited.length; i++) {
      const d = haversine({lat:curLat,lng:curLng}, unvisited[i].coords);
      if(d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const best = unvisited[bestIdx];
    route.push({...best, distFromPrev: Math.round(bestDist*10)/10});
    unvisited.splice(bestIdx, 1);
    curLat = best.coords.lat;
    curLng = best.coords.lng;
  }
  return route;
}

const buildDayRoute = (orders, users, day) => {
  const collectors = users.filter(u => u.role==='ecommercant' && u.jour===day && u.adresse);
  const deliveries = orders.filter(o => o.jour===day && o.status!=='livre');
  const points = [
    ...collectors.map(c => ({type:'collecte', client:c, priority:0, coords:getCoords(c.ville||'')})),
    ...deliveries.map(o => ({type:'livraison', order:o, priority:2, coords:getCoords(o.dest.city)})),
  ];
  const optimized = nearestNeighbor(points);
  const collecteCoords = collectors.map(c => getCoords(c.ville||''));
  return optimized.map(stop => {
    if(stop.type==='livraison' && collecteCoords.some(cc => haversine(cc,stop.coords)<=5))
      return {...stop, priority:1};
    return stop;
  });
};

const buildMapsUrl = route => {
  const stops = route.map(s => s.type==='collecte'
    ? encodeURIComponent(mapsAddr(s.client.adresse, s.client.ville||''))
    : encodeURIComponent(mapsAddr(s.order.dest.rue||'', s.order.dest.city)));
  const origin = encodeURIComponent(mapsAddr(DEPOT.rue, DEPOT.ville));
  if(!stops.length) return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${origin}`;
  if(stops.length===1) return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${stops[0]}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${stops[stops.length-1]}&waypoints=${stops.slice(0,-1).join('|')}`;
};

const mapsAddr = (rue, city) => `${(rue||'').trim()}, ${city.replace(/\s*\d{5}/,'').trim()}, La Réunion`;
const totalDist = route => route.reduce((s,p) => s+(p.distFromPrev||0), 0);

const Badge=({status})=>{const s=STATUS[status];return<span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 10px',borderRadius:20,background:s.bg,color:s.c,fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}><span style={{width:6,height:6,borderRadius:'50%',background:s.dot,flexShrink:0}}/>{s.l}</span>;};
const Card=({children,style={}})=><div style={{background:C.white,borderRadius:12,padding:'20px 24px',boxShadow:'0 1px 4px rgba(0,0,0,.07)',border:`1px solid ${C.gray2}`,...style}}>{children}</div>;
const Stat=({label,value,accent,sub})=><div style={{background:'#fff',borderRadius:12,padding:'18px 22px',boxShadow:'0 1px 4px rgba(0,0,0,.07)',border:`1px solid ${C.gray2}`,flex:'1 1 120px',minWidth:120}}><div style={{fontSize:28,fontWeight:800,color:accent||C.navy,lineHeight:1}}>{value}</div><div style={{fontSize:13,fontWeight:600,color:C.navy,marginTop:4}}>{label}</div>{sub&&<div style={{fontSize:11,color:C.gray4,marginTop:3}}>{sub}</div>}</div>;
const SectionTitle=({color,label})=><div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}><div style={{width:6,height:20,background:color,borderRadius:3}}/><div style={{fontSize:11,fontWeight:800,color:C.navy,textTransform:'uppercase',letterSpacing:.5}}>{label}</div></div>;
const Logo=({size=48})=><div style={{width:size,height:size,background:'linear-gradient(135deg,#0F2D6B,#F97316)',borderRadius:size*0.22,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.55,boxShadow:'0 4px 16px rgba(249,115,22,.4)',flexShrink:0}}>⚡</div>;
const Spinner=()=><div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:60,flexDirection:'column',gap:16}}><div style={{width:40,height:40,border:`4px solid ${C.gray2}`,borderTopColor:C.orange,borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/><div style={{color:C.gray4,fontSize:13}}>Chargement...</div><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

const Inp=({label,value,onChange,placeholder='',type='text',required=false,disabled=false,hint=''})=>(
  <div style={{marginBottom:16}}>
    {label&&<label style={{display:'block',fontSize:11,fontWeight:700,color:C.gray6,marginBottom:6,textTransform:'uppercase',letterSpacing:.5}}>{label}{required&&<span style={{color:C.orange}}> *</span>}</label>}
    <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type={type} disabled={disabled}
      style={{width:'100%',padding:'10px 14px',border:`1px solid ${C.gray2}`,borderRadius:8,fontSize:14,color:C.navy,background:disabled?C.gray1:C.white,outline:'none',boxSizing:'border-box'}}
      onFocus={e=>{if(!disabled)e.target.style.borderColor=C.orange;}} onBlur={e=>e.target.style.borderColor=C.gray2}/>
    {hint&&<div style={{fontSize:10,color:C.gray4,marginTop:4,fontStyle:'italic'}}>{hint}</div>}
  </div>
);
const Sel=({label,value,onChange,options,disabled=false})=>(
  <div style={{marginBottom:16}}>
    {label&&<label style={{display:'block',fontSize:11,fontWeight:700,color:C.gray6,marginBottom:6,textTransform:'uppercase',letterSpacing:.5}}>{label}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}
      style={{width:'100%',padding:'10px 14px',border:`1px solid ${C.gray2}`,borderRadius:8,fontSize:14,color:C.navy,background:disabled?C.gray1:C.white,outline:'none',boxSizing:'border-box'}}>
      {options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  </div>
);
const AddrFields=({rue,complement,city,tel,onChange,required=true})=>(
  <>
    <Inp label="Numéro et nom de rue" value={rue} onChange={v=>onChange('rue',v)} placeholder="12 Rue de la Paix" required={required} hint="Uniquement le numéro + la rue — pour Google Maps"/>
    <Inp label="Complément d'adresse" value={complement} onChange={v=>onChange('complement',v)} placeholder="Appt 3B, Résidence Les Fleurs..." hint="Ne sera PAS envoyé à Google Maps"/>
    <Inp label="Ville / Code postal" value={city} onChange={v=>onChange('city',v)} placeholder="Saint-Denis 97400" required={required}/>
    <Inp label="Téléphone" value={tel} onChange={v=>onChange('tel',v)} placeholder="0692 00 00 00" required={required}/>
  </>
);
function FakeQR({size=72}){
  const p=[[1,1,1,1,1,1,1,0,1,0,1,1,1],[1,0,0,0,0,0,1,0,0,0,1,0,1],[1,0,1,1,1,0,1,0,1,1,1,0,1],[1,0,1,1,1,0,1,0,0,1,0,0,1],[1,0,0,0,0,0,1,0,1,0,1,0,1],[1,1,1,1,1,1,1,0,1,0,1,1,1],[0,0,0,0,0,0,0,0,1,0,0,0,0],[1,0,1,1,0,1,1,1,0,1,1,0,1],[0,1,0,0,1,0,0,1,1,0,1,1,0],[1,1,1,0,1,1,1,0,0,1,0,0,1],[0,0,0,0,0,0,0,0,1,1,0,0,0],[1,1,1,1,1,1,1,0,0,1,1,0,1],[1,0,0,0,0,0,1,0,1,0,0,1,0]];
  const cs=size/13;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
    {p.map((row,ri)=>row.map((cv,ci)=>cv?<rect key={`${ri}-${ci}`} x={ci*cs} y={ri*cs} width={cs-.5} height={cs-.5} fill="#0F172A"/>:null))}
  </svg>;
}

export default function App(){
  const [users,setUsers]=useState([]);
  const [user,setUser]=useState(null);
  const [page,setPage]=useState('landing');
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(false);
  const [view,setView]=useState('dashboard');
  const [labelOrd,setLabelOrd]=useState(null);
  const [editOrd,setEditOrd]=useState(null);
  const [notif,setNotif]=useState(null);
  const [selDay,setSelDay]=useState('Lundi');
  const [form,setForm]=useState({name:'',rue:'',complement:'',city:'',tel:'',poids:'',desc:''});
  const [loginForm,setLoginForm]=useState({email:'',password:''});
  const [loginErr,setLoginErr]=useState('');
  const [isMobile,setIsMobile]=useState(window.innerWidth<768);
  const [menuOpen,setMenuOpen]=useState(false);

  useEffect(()=>{
    const onResize=()=>setIsMobile(window.innerWidth<768);
    window.addEventListener('resize',onResize);
    return()=>window.removeEventListener('resize',onResize);
  },[]);

  const toast=(msg,type='ok')=>{setNotif({msg,type});setTimeout(()=>setNotif(null),3500);};
  const isAdmin=u=>u?.role==='livreur'||u?.role==='adminRFC';

  const loadData=async()=>{
    setLoading(true);
    const [{data:usersData},{data:ordersData}]=await Promise.all([
      supabase.from('users').select('*'),
      supabase.from('orders').select('*').order('date',{ascending:false}),
    ]);
    if(usersData) setUsers(usersData);
    if(ordersData) setOrders(ordersData.map(o=>({...o,desc:o.description})));
    setLoading(false);
  };

  useEffect(()=>{loadData();},[]);

  const doLogin=async()=>{
    const u=users.find(u=>u.email===loginForm.email&&u.password===loginForm.password);
    if(u){setUser(u);setPage('app');setView('dashboard');setLoginErr('');}
    else setLoginErr('Email ou mot de passe incorrect.');
  };
  const doLogout=()=>{setUser(null);setPage('landing');setView('dashboard');setLabelOrd(null);setEditOrd(null);};

  const submitOrder=async()=>{
    if(!form.name||!form.rue||!form.city||!form.tel){toast('Remplissez tous les champs obligatoires','err');return;}
    const jour=user.jour||'Lundi';
    const num=`RFC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    const newOrder={id:`o${Date.now()}`,num,cid:user.id,cname:user.name,
      dest:{name:form.name,rue:form.rue,complement:form.complement||'',city:form.city,tel:form.tel},
      poids:form.poids||'?',description:form.desc||'Colis',status:'en_attente',
      date:new Date().toISOString().split('T')[0],jour};
    const{error}=await supabase.from('orders').insert([newOrder]);
    if(error){toast('Erreur lors de la création','err');return;}
    setOrders(p=>[{...newOrder,desc:newOrder.description},...p]);
    setForm({name:'',rue:'',complement:'',city:'',tel:'',poids:'',desc:''});
    setLabelOrd({...newOrder,desc:newOrder.description});
    setView('label');
    toast(`Commande ${num} créée !`);
  };

  const saveEditOrder=async updated=>{
    const{error}=await supabase.from('orders').update({dest:updated.dest,poids:updated.poids,description:updated.desc}).eq('id',updated.id);
    if(error){toast('Erreur','err');return;}
    setOrders(p=>p.map(o=>o.id===updated.id?updated:o));
    toast('Commande mise à jour !');setEditOrd(null);setView('orders');
  };

  const updateStatus=async id=>{
    const o=orders.find(o=>o.id===id);if(!o)return;
    const ns=NEXT[o.status];if(!ns)return;
    const{error}=await supabase.from('orders').update({status:ns}).eq('id',id);
    if(error){toast('Erreur','err');return;}
    setOrders(p=>p.map(o=>o.id===id?{...o,status:ns}:o));
    toast(`${STATUS[ns].icon} ${STATUS[ns].l}`);
  };

  const createAccount=async newUser=>{
    if(users.find(u=>u.email===newUser.email)){toast('Email déjà utilisé','err');return false;}
    const userData={...newUser,id:`e${Date.now()}`,role:'ecommercant',initials:newUser.name.slice(0,2).toUpperCase()};
    const{error}=await supabase.from('users').insert([userData]);
    if(error){toast('Erreur','err');return false;}
    setUsers(p=>[...p,userData]);
    toast(`Compte créé !`);return true;
  };

  const updateAccount=async updated=>{
    const{error}=await supabase.from('users').update(updated).eq('id',updated.id);
    if(error){toast('Erreur','err');return;}
    setUsers(p=>p.map(u=>u.id===updated.id?updated:u));
    toast('Compte mis à jour !');
  };

  const printLabel=o=>{
    const w=window.open('','_blank','width=520,height=760');
    const desc=o.desc||o.description||'';
    w.document.write(`<!DOCTYPE html><html><head><title>Etiquette ${o.num}</title>
    <style>body{margin:0;padding:28px;font-family:monospace;}*{box-sizing:border-box;}
    .box{border:2px solid #0F2D6B;border-radius:10px;padding:22px;max-width:460px;}
    .num{background:#0F2D6B;color:#fff;padding:10px;border-radius:7px;text-align:center;font-size:20px;font-weight:700;letter-spacing:4px;margin-bottom:16px;}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;}
    .from{background:#F8FAFC;padding:13px;border-radius:7px;}.to{background:#F0FDF4;padding:13px;border-radius:7px;border:1px solid #BBF7D0;}
    .lbl{font-size:9px;text-transform:uppercase;margin-bottom:6px;font-weight:800;}.nm{font-weight:700;font-size:13px;color:#0F2D6B;}
    .info{font-size:11px;color:#475569;margin-top:3px;}.compl{font-size:10px;color:#92400E;font-style:italic;margin-top:2px;}
    .meta{display:flex;gap:14px;font-size:11px;color:#475569;border-top:1px dashed #E2E8F0;padding-top:12px;align-items:center;}
    .day{margin-left:auto;background:#FEF3C7;padding:3px 10px;border-radius:5px;color:#92400E;font-weight:800;}
    @media print{button{display:none;}}</style></head><body>
    <div class="box">
      <div style="border-bottom:2px solid #0F2D6B;padding-bottom:14px;margin-bottom:16px;">
        <div style="font-size:9px;color:#64748B;text-transform:uppercase;margin-bottom:4px">Service de livraison - Ile de La Reunion</div>
        <div style="font-size:18px;font-weight:900"><span style="color:#0F2D6B">RUN </span><span style="color:#F97316">FLASH</span><span style="color:#0F2D6B"> COLIS</span></div>
      </div>
      <div class="num">${o.num}</div>
      <div class="grid">
        <div class="from"><div class="lbl" style="color:#94A3B8">Expediteur</div><div class="nm">${o.cname}</div></div>
        <div class="to"><div class="lbl" style="color:#16A34A">Destinataire</div>
          <div class="nm">${o.dest.name}</div><div class="info">${o.dest.rue||''}</div>
          ${o.dest.complement?`<div class="compl">${o.dest.complement}</div>`:''}
          <div class="info">${o.dest.city}</div><div class="info" style="margin-top:5px">${o.dest.tel}</div>
        </div>
      </div>
      <div class="meta"><span>Poids: ${o.poids} kg</span><span>${desc}</span><span>${o.date}</span><span class="day">${o.jour}</span></div>
    </div>
    <button onclick="window.print()" style="margin-top:20px;padding:10px 24px;background:#F97316;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700">Imprimer</button>
    </body></html>`);w.document.close();
  };

  const printFacture=data=>{
    const w=window.open('','_blank');
    const rows=data.orders.map(o=>`<tr><td>${o.num}</td><td>${o.dest.name}</td><td>${o.dest.city}</td><td>${o.date}</td><td style="text-align:right;font-weight:700">${PRICE.toFixed(2)} EUR</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>Facture ${data.name}</title>
    <style>body{font-family:system-ui,sans-serif;padding:48px;max-width:720px;margin:0 auto;color:#0F172A;}
    h1{margin:0;font-size:32px;}table{width:100%;border-collapse:collapse;margin-top:24px;}
    th,td{padding:11px 14px;border-bottom:1px solid #E2E8F0;font-size:13px;text-align:left;}
    th{background:#F8FAFC;font-weight:700;font-size:11px;text-transform:uppercase;color:#475569;}
    .total-box{margin-top:24px;background:#FFF7ED;border:2px solid #F97316;border-radius:10px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;}
    @media print{button{display:none;}.no-print{display:none;}}</style></head><body>
    <div style="display:flex;justify-content:space-between;margin-bottom:40px;padding-bottom:24px;border-bottom:3px solid #0F2D6B;">
      <div><div style="font-size:11px;color:#94A3B8;text-transform:uppercase;margin-bottom:8px">Facture de prestation</div>
        <h1>FACTURE</h1><div style="color:#94A3B8;font-size:13px;margin-top:8px">Emise le ${new Date().toLocaleDateString('fr-FR')}</div></div>
      <div style="text-align:right"><div style="font-size:18px;font-weight:900"><span style="color:#0F2D6B">RUN </span><span style="color:#F97316">FLASH</span><span style="color:#0F2D6B"> COLIS</span></div>
        <div style="color:#94A3B8;font-size:13px;margin-top:4px">28 Chemin Dozinval - Les Avirons 97425</div></div>
    </div>
    <div style="margin-bottom:24px">
      <div style="font-size:11px;color:#94A3B8;text-transform:uppercase;margin-bottom:6px">Facture a</div>
      <div style="font-size:18px;font-weight:700">${data.name}</div>
      ${data.siret?`<div style="font-size:12px;color:#94A3B8;margin-top:4px">SIRET : ${data.siret}</div>`:''}
    </div>
    <table><thead><tr><th>N Suivi</th><th>Destinataire</th><th>Ville</th><th>Date</th><th style="text-align:right">Montant HT</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="total-box"><div><div style="font-weight:700;font-size:14px">Total a regler</div>
      <div style="color:#94A3B8;font-size:12px;margin-top:3px">${data.orders.length} colis x ${PRICE.toFixed(2)} EUR</div></div>
      <div style="font-size:28px;font-weight:900;color:#F97316">${(data.orders.length*PRICE).toFixed(2)} EUR</div></div>
    <div class="no-print" style="margin-top:28px"><button onclick="window.print()" style="padding:12px 28px;background:#0F2D6B;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:14px;font-weight:700">Imprimer / PDF</button></div>
    </body></html>`);w.document.close();
  };

  if(page==='landing') return <LandingPage onLogin={()=>setPage('login')}/>;
  if(page==='login') return <LoginPage lf={loginForm} setLf={setLoginForm} doLogin={doLogin} err={loginErr} onBack={()=>setPage('landing')} loading={loading}/>;

  const myOrders=user?.role==='ecommercant'?orders.filter(o=>o.cid===user.id):orders;
  const pending=orders.filter(o=>o.status==='en_attente');
  const dayRoute=buildDayRoute(orders,users,selDay);
  const livrees=orders.filter(o=>o.status==='livre');
  const byClient={};
  livrees.forEach(o=>{
    if(!byClient[o.cid]){const cl=users.find(u=>u.id===o.cid);byClient[o.cid]={name:o.cname,siret:cl?.siret||'',orders:[]};}
    byClient[o.cid].orders.push(o);
  });

  const adminSide=[
    {v:'dashboard',icon:'📊',label:'Tableau de bord'},
    {v:'tournees',icon:'🗺️',label:'Tournées'},
    {v:'statuts',icon:'🚐',label:'Statuts livraison',badge:pending.length},
    {v:'comptes',icon:'👥',label:'Gestion clients'},
    {v:'facturation',icon:'💶',label:'Facturation'},
  ];
  const ecommSide=[
    {v:'dashboard',icon:'📊',label:'Tableau de bord'},
    {v:'orders',icon:'📋',label:'Mes commandes'},
    {v:'new_order',icon:'➕',label:'Nouvelle commande'},
  ];
  const sideItems=isAdmin(user)?adminSide:ecommSide;

  let content=null;
  if(loading) content=<Spinner/>;
  else if(view==='label'&&labelOrd) content=<LabelView o={labelOrd} onBack={()=>setView('orders')} onPrint={()=>printLabel(labelOrd)}/>;
  else if(view==='edit_order'&&editOrd) content=<EditOrderForm o={editOrd} onSave={saveEditOrder} onBack={()=>{setEditOrd(null);setView('orders');}}/>;
  else if(user.role==='ecommercant'){
    if(view==='dashboard') content=<EcommDash orders={myOrders} user={user} nav={setView}/>;
    if(view==='orders') content=<EcommOrders orders={myOrders} nav={setView} setLabelOrd={setLabelOrd} setEditOrd={setEditOrd} onPrint={printLabel}/>;
    if(view==='new_order') content=<NewOrderForm form={form} setForm={setForm} onSubmit={submitOrder} nav={setView} user={user}/>;
  } else {
    if(view==='dashboard') content=<LivreurDash orders={orders} pending={pending} nav={setView}/>;
    if(view==='tournees') content=<Tournees orders={orders} users={users} selDay={selDay} setSelDay={setSelDay} dayRoute={dayRoute} buildMapsUrl={buildMapsUrl} mapsAddr={mapsAddr}/>;
    if(view==='statuts') content=<Statuts orders={orders} updateStatus={updateStatus}/>;
    if(view==='comptes') content=<GestionComptes users={users.filter(u=>u.role==='ecommercant')} createAccount={createAccount} updateAccount={updateAccount}/>;
    if(view==='facturation') content=<Facturation byClient={byClient} livrees={livrees} printFacture={printFacture}/>;
  }

  const navItem=(item)=>(
    <button key={item.v} onClick={()=>{setView(item.v);setMenuOpen(false);}}
      style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 12px',borderRadius:8,marginBottom:3,border:'none',cursor:'pointer',textAlign:'left',
        background:view===item.v?'rgba(249,115,22,.15)':'transparent',
        color:view===item.v?C.orange:'rgba(255,255,255,.55)',
        fontWeight:view===item.v?600:400,fontSize:13}}>
      <span style={{fontSize:15}}>{item.icon}</span>{item.label}
      {item.badge>0&&<span style={{marginLeft:'auto',background:C.orange,color:'#fff',borderRadius:20,padding:'0 6px',fontSize:10,fontWeight:700}}>{item.badge}</span>}
    </button>
  );

  // ── MOBILE ────────────────────────────────────────────────────────────────
  if(isMobile) return (
    <div style={{minHeight:'100vh',background:C.gray0,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',paddingBottom:70}}>
      {/* Top bar mobile */}
      <div style={{background:C.navy,padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100,boxShadow:'0 2px 8px rgba(0,0,0,.3)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <Logo size={32}/>
          <div style={{lineHeight:1.1}}>
            <span style={{color:'#fff',fontWeight:900,fontSize:13}}>RUN </span>
            <span style={{color:C.orange,fontWeight:900,fontSize:13}}>FLASH</span>
            <span style={{color:'#fff',fontWeight:900,fontSize:13}}> COLIS</span>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {pending.length>0&&<span style={{background:C.orange,color:'#fff',borderRadius:20,padding:'2px 8px',fontSize:11,fontWeight:700}}>{pending.length}</span>}
          <button onClick={()=>setMenuOpen(p=>!p)}
            style={{background:'rgba(255,255,255,.1)',border:'none',color:'#fff',borderRadius:8,padding:'8px 12px',cursor:'pointer',fontSize:18,lineHeight:1}}>
            {menuOpen?'✕':'☰'}
          </button>
        </div>
      </div>

      {/* Menu mobile overlay */}
      {menuOpen&&(
        <div style={{position:'fixed',inset:0,zIndex:200,display:'flex'}}>
          <div style={{flex:1,background:'rgba(0,0,0,.5)'}} onClick={()=>setMenuOpen(false)}/>
          <div style={{width:280,background:C.navy,height:'100%',overflowY:'auto',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'20px 16px',borderBottom:'1px solid rgba(255,255,255,.08)'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:38,height:38,borderRadius:'50%',background:C.orange,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:14,fontWeight:700}}>{user.initials}</div>
                <div>
                  <div style={{color:'#fff',fontSize:13,fontWeight:600}}>{user.name}</div>
                  <div style={{color:'rgba(255,255,255,.4)',fontSize:11}}>{user.role==='livreur'?'Livreur':user.role==='adminRFC'?'Admin RFC':'E-commercant'}</div>
                  {user.role==='ecommercant'&&<div style={{color:C.orange,fontSize:11,fontWeight:700}}>Collecte : {user.jour}</div>}
                </div>
              </div>
            </div>
            <nav style={{padding:'10px',flex:1}}>{sideItems.map(navItem)}</nav>
            {user.role==='ecommercant'&&(
              <div style={{padding:'10px',borderTop:'1px solid rgba(255,255,255,.06)'}}>
                <div style={{padding:'12px',borderRadius:8,background:'rgba(249,115,22,.1)',border:'1px solid rgba(249,115,22,.2)',textAlign:'center'}}>
                  <div style={{color:C.orange,fontWeight:800,fontSize:22}}>{PRICE.toFixed(2)} €</div>
                  <div style={{color:'rgba(255,255,255,.4)',fontSize:11}}>par colis livre</div>
                </div>
              </div>
            )}
            <div style={{padding:'12px 10px',borderTop:'1px solid rgba(255,255,255,.08)'}}>
              <button onClick={doLogout} style={{width:'100%',padding:'10px',background:'rgba(255,255,255,.06)',color:'rgba(255,255,255,.5)',border:'none',borderRadius:8,cursor:'pointer',fontSize:13}}>
                Deconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenu mobile */}
      <div style={{padding:'16px'}}>{content}</div>

      {/* Bottom nav mobile */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:C.navy,display:'flex',borderTop:'1px solid rgba(255,255,255,.1)',zIndex:99}}>
        {sideItems.slice(0,5).map(item=>(
          <button key={item.v} onClick={()=>setView(item.v)}
            style={{flex:1,padding:'8px 4px',border:'none',cursor:'pointer',background:'transparent',color:view===item.v?C.orange:'rgba(255,255,255,.4)',display:'flex',flexDirection:'column',alignItems:'center',gap:2,position:'relative'}}>
            <span style={{fontSize:18}}>{item.icon}</span>
            <span style={{fontSize:8,fontWeight:view===item.v?700:400}}>{item.label.split(' ')[0]}</span>
            {item.badge>0&&<span style={{position:'absolute',top:4,right:'calc(50% - 14px)',background:C.orange,color:'#fff',borderRadius:20,padding:'0 4px',fontSize:9,fontWeight:700}}>{item.badge}</span>}
          </button>
        ))}
      </div>

      {notif&&<div style={{position:'fixed',bottom:80,left:16,right:16,background:notif.type==='err'?'#7F1D1D':C.navy,color:'#fff',padding:'12px 16px',borderRadius:10,fontSize:13,fontWeight:500,boxShadow:'0 8px 30px rgba(0,0,0,.3)',zIndex:9999,display:'flex',alignItems:'center',gap:10}}>
        <span>{notif.type==='err'?'❌':'✅'}</span><span>{notif.msg}</span>
      </div>}
    </div>
  );

  // ── DESKTOP ───────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',minHeight:'100vh',background:C.gray0,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif'}}>
      <div style={{width:230,background:C.navy,display:'flex',flexDirection:'column',flexShrink:0,minHeight:'100vh',position:'sticky',top:0,maxHeight:'100vh',overflowY:'auto'}}>
        <div style={{padding:'22px 18px',borderBottom:'1px solid rgba(255,255,255,.08)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <Logo size={40}/>
            <div>
              <div style={{lineHeight:1.1}}>
                <span style={{color:'#fff',fontWeight:900,fontSize:13}}>RUN </span>
                <span style={{color:C.orange,fontWeight:900,fontSize:13}}>FLASH</span><br/>
                <span style={{color:'#fff',fontWeight:900,fontSize:13}}>COLIS</span>
              </div>
              <div style={{color:'rgba(255,255,255,.35)',fontSize:9,marginTop:2}}>Livraison · Ile de La Reunion</div>
            </div>
          </div>
        </div>
        <div style={{padding:'14px 16px',borderBottom:'1px solid rgba(255,255,255,.08)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:32,height:32,borderRadius:'50%',background:C.orange,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:700,flexShrink:0}}>{user.initials}</div>
            <div style={{minWidth:0}}>
              <div style={{color:'#fff',fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.name}</div>
              <div style={{color:'rgba(255,255,255,.35)',fontSize:10}}>{user.role==='livreur'?'Livreur':user.role==='adminRFC'?'Admin RFC':'E-commercant'}</div>
              {user.role==='ecommercant'&&<div style={{color:C.orange,fontSize:10,fontWeight:700}}>Collecte : {user.jour}</div>}
            </div>
          </div>
        </div>
        <nav style={{padding:'10px',flex:1}}>{sideItems.map(navItem)}</nav>
        {user.role==='ecommercant'&&(
          <div style={{padding:'10px',borderTop:'1px solid rgba(255,255,255,.06)'}}>
            <div style={{padding:'12px',borderRadius:8,background:'rgba(249,115,22,.1)',border:'1px solid rgba(249,115,22,.2)'}}>
              <div style={{color:'rgba(255,255,255,.5)',fontSize:10,textTransform:'uppercase',marginBottom:4}}>Tarif livraison</div>
              <div style={{color:C.orange,fontWeight:800,fontSize:18}}>{PRICE.toFixed(2)} €</div>
              <div style={{color:'rgba(255,255,255,.35)',fontSize:10}}>par colis livre</div>
            </div>
          </div>
        )}
        <div style={{padding:'12px 10px',borderTop:'1px solid rgba(255,255,255,.08)'}}>
          <button onClick={doLogout} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 12px',borderRadius:8,border:'none',cursor:'pointer',background:'rgba(255,255,255,.04)',color:'rgba(255,255,255,.4)',fontSize:12}}>
            Deconnexion
          </button>
        </div>
      </div>
      <div style={{flex:1,padding:28,overflowY:'auto',minWidth:0}}>{content}</div>
      {notif&&(
        <div style={{position:'fixed',bottom:22,right:22,background:notif.type==='err'?'#7F1D1D':C.navy,color:'#fff',padding:'12px 20px',borderRadius:10,fontSize:13,fontWeight:500,boxShadow:'0 8px 30px rgba(0,0,0,.3)',zIndex:9999,maxWidth:360,display:'flex',alignItems:'center',gap:10}}>
          <span>{notif.type==='err'?'❌':'✅'}</span><span>{notif.msg}</span>
        </div>
      )}
    </div>
  );
}

function LandingPage({onLogin}){
  const [cf,setCf]=useState({societe:'',nom:'',prenom:'',adresse:'',tel:'',volume:''});
  const [sent,setSent]=useState(false);
  const u=(k,v)=>setCf(p=>({...p,[k]:v}));
  return (
    <div style={{fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',minHeight:'100vh',background:'#fff'}}>
      <nav style={{background:C.navy,padding:'0 40px',height:64,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100,boxShadow:'0 2px 12px rgba(0,0,0,.2)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <Logo size={36}/>
          <span style={{color:'#fff',fontWeight:900,fontSize:15}}>RUN <span style={{color:C.orange}}>FLASH</span> COLIS</span>
        </div>
        <button onClick={onLogin} style={{padding:'9px 22px',background:C.orange,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:800,cursor:'pointer'}}>
          Connexion client
        </button>
      </nav>
      <div style={{background:'linear-gradient(135deg,#0F2D6B,#1A3A7A,#0F2D6B)',padding:'80px 40px 90px',textAlign:'center',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0,background:'radial-gradient(circle at 30% 50%,rgba(249,115,22,.15) 0%,transparent 60%)'}}/>
        <div style={{position:'relative',maxWidth:700,margin:'0 auto'}}>
          <Logo size={80}/>
          <div style={{marginTop:24,lineHeight:1.1}}>
            <div style={{color:'#fff',fontSize:48,fontWeight:900}}>RUN <span style={{color:C.orange}}>FLASH</span></div>
            <div style={{color:'#fff',fontSize:48,fontWeight:900}}>COLIS</div>
          </div>
          <div style={{color:'rgba(255,255,255,.85)',fontSize:22,fontWeight:600,marginTop:20,lineHeight:1.4}}>
            Votre solution livraison e-commerce<br/>a La Reunion
          </div>
          <div style={{display:'inline-flex',alignItems:'center',gap:10,marginTop:20,background:'rgba(249,115,22,.15)',border:'1px solid rgba(249,115,22,.4)',borderRadius:50,padding:'10px 28px'}}>
            <span style={{fontSize:28}}>⚡</span>
            <span style={{color:C.orange,fontSize:24,fontWeight:900}}>{PRICE.toFixed(2)} EUR</span>
            <span style={{color:'rgba(255,255,255,.7)',fontSize:16}}>par colis livre, partout sur l'ile</span>
          </div>
          <div style={{display:'flex',gap:12,justifyContent:'center',marginTop:32,flexWrap:'wrap'}}>
            {['Collecte a domicile','Suivi en temps reel','Tournees optimisees','Facturation automatique'].map(f=>(
              <div key={f} style={{background:'rgba(255,255,255,.1)',color:'rgba(255,255,255,.9)',padding:'8px 16px',borderRadius:20,fontSize:13,fontWeight:600}}>{f}</div>
            ))}
          </div>
          <button onClick={()=>document.getElementById('contact').scrollIntoView({behavior:'smooth'})}
            style={{marginTop:36,padding:'14px 36px',background:C.orange,color:'#fff',border:'none',borderRadius:10,fontSize:16,fontWeight:800,cursor:'pointer',boxShadow:'0 6px 20px rgba(249,115,22,.5)'}}>
            Demarrer maintenant
          </button>
        </div>
      </div>
      <div style={{padding:'72px 40px',background:'#fff',maxWidth:1100,margin:'0 auto'}}>
        <div style={{textAlign:'center',marginBottom:48}}>
          <div style={{fontSize:13,fontWeight:700,color:C.orange,textTransform:'uppercase',letterSpacing:2,marginBottom:10}}>Pourquoi nous choisir</div>
          <h2 style={{fontSize:32,fontWeight:900,color:C.navy,margin:0}}>La livraison e-commerce pensee pour La Reunion</h2>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:24}}>
          {[
            {icon:'💰',title:'Tarif unique',desc:`${PRICE.toFixed(2)} EUR par colis, sans surprise.`},
            {icon:'🗺️',title:'Tournees optimisees',desc:'Itineraires calcules par algorithme GPS.'},
            {icon:'📱',title:'Suivi en temps reel',desc:'Suivez chaque colis de la collecte a la livraison.'},
            {icon:'🧾',title:'Facturation auto',desc:'Factures PDF avec SIRET generees automatiquement.'},
          ].map(item=>(
            <div key={item.title} style={{background:C.gray0,borderRadius:16,padding:'28px 24px',border:`1px solid ${C.gray2}`}}>
              <div style={{fontSize:36,marginBottom:14}}>{item.icon}</div>
              <div style={{fontWeight:800,color:C.navy,fontSize:16,marginBottom:8}}>{item.title}</div>
              <div style={{color:C.gray6,fontSize:13,lineHeight:1.6}}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{background:'linear-gradient(135deg,#0F2D6B,#1A3A7A)',padding:'64px 40px',textAlign:'center'}}>
        <div style={{maxWidth:500,margin:'0 auto'}}>
          <div style={{background:'rgba(255,255,255,.08)',borderRadius:20,padding:'40px',border:'1px solid rgba(255,255,255,.15)'}}>
            <div style={{color:'rgba(255,255,255,.6)',fontSize:14,marginBottom:8}}>Prix par livraison</div>
            <div style={{color:C.orange,fontSize:64,fontWeight:900,lineHeight:1}}>{PRICE.toFixed(2)} EUR</div>
            <div style={{color:'rgba(255,255,255,.5)',fontSize:13,marginTop:4}}>HT · partout sur l'ile · sans engagement</div>
            <div style={{borderTop:'1px solid rgba(255,255,255,.1)',marginTop:24,paddingTop:24,display:'flex',flexDirection:'column',gap:10}}>
              {['Collecte incluse','Etiquette generee automatiquement','Suivi temps reel','Facturation mensuelle PDF'].map(f=>(
                <div key={f} style={{color:'rgba(255,255,255,.8)',fontSize:13,textAlign:'left'}}>OK {f}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div id="contact" style={{padding:'72px 40px',background:C.gray0}}>
        <div style={{maxWidth:640,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:40}}>
            <div style={{fontSize:13,fontWeight:700,color:C.orange,textTransform:'uppercase',letterSpacing:2,marginBottom:10}}>Rejoindre Run Flash Colis</div>
            <h2 style={{fontSize:32,fontWeight:900,color:C.navy,margin:0}}>Demandez votre acces</h2>
            <p style={{color:C.gray6,fontSize:15,marginTop:12}}>Remplissez ce formulaire et nous vous contacterons sous 24h.</p>
          </div>
          {sent ? (
            <div style={{background:'#D1FAE5',border:'2px solid #10B981',borderRadius:16,padding:'40px',textAlign:'center'}}>
              <div style={{fontSize:48,marginBottom:16}}>OK</div>
              <div style={{fontWeight:800,color:'#065F46',fontSize:20,marginBottom:8}}>Demande envoyee !</div>
              <div style={{color:'#047857',fontSize:14}}>Nous vous contacterons tres prochainement.</div>
              <button onClick={()=>setSent(false)} style={{marginTop:20,padding:'10px 24px',background:'#10B981',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:700}}>Nouvelle demande</button>
            </div>
          ) : (
            <div style={{background:'#fff',borderRadius:16,padding:'36px',boxShadow:'0 4px 24px rgba(0,0,0,.08)',border:`1px solid ${C.gray2}`}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                <div style={{gridColumn:'1/-1'}}><Inp label="Nom de la societe" value={cf.societe} onChange={v=>u('societe',v)} placeholder="BoutiqueMode974"/></div>
                <Inp label="Prenom" value={cf.prenom} onChange={v=>u('prenom',v)} placeholder="Marie" required/>
                <Inp label="Nom" value={cf.nom} onChange={v=>u('nom',v)} placeholder="Dupont" required/>
                <div style={{gridColumn:'1/-1'}}><Inp label="Adresse" value={cf.adresse} onChange={v=>u('adresse',v)} placeholder="12 Rue de la Paix, Saint-Denis 97400"/></div>
                <Inp label="Telephone" value={cf.tel} onChange={v=>u('tel',v)} placeholder="0692 00 00 00" required/>
                <Sel label="Volume mensuel de colis" value={cf.volume} onChange={v=>u('volume',v)} options={[
                  {v:'',l:'Selectionnez...'},
                  {v:'1-20',l:'1 a 20 colis / mois'},
                  {v:'20-50',l:'20 a 50 colis / mois'},
                  {v:'50-100',l:'50 a 100 colis / mois'},
                  {v:'100+',l:'Plus de 100 colis / mois'},
                ]}/>
              </div>
              <button onClick={()=>{if(!cf.nom||!cf.tel){alert('Merci de renseigner votre nom et telephone.');return;}setSent(true);}}
                style={{width:'100%',marginTop:8,padding:'14px',background:C.orange,color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:800,cursor:'pointer',boxShadow:'0 4px 14px rgba(249,115,22,.4)'}}>
                Envoyer ma demande
              </button>
              <div style={{textAlign:'center',marginTop:16,color:C.gray4,fontSize:12}}>
                Vous avez deja un compte ?{' '}
                <button onClick={onLogin} style={{background:'none',border:'none',color:C.orange,cursor:'pointer',fontSize:12,fontWeight:700}}>Se connecter</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <footer style={{background:C.navy,padding:'32px 40px',textAlign:'center'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:12}}>
          <Logo size={28}/>
          <span style={{color:'#fff',fontWeight:900,fontSize:14}}>RUN <span style={{color:C.orange}}>FLASH</span> COLIS</span>
        </div>
        <div style={{color:'rgba(255,255,255,.4)',fontSize:12}}>28 Chemin Dozinval - Les Avirons 97425 · Ile de La Reunion</div>
        <div style={{color:'rgba(255,255,255,.25)',fontSize:11,marginTop:8}}>2026 Run Flash Colis - Tous droits reserves</div>
      </footer>
    </div>
  );
}

function LoginPage({lf,setLf,doLogin,err,onBack,loading}){
  const demos=[
    {l:'Livreur (Jean-Marie)',e:'livreur@demo.re'},
    {l:'Admin RFC',e:'admin@demo.re'},
    {l:'BoutiqueMode974',e:'boutique@demo.re'},
    {l:'TechShop Reunion',e:'tech@demo.re'},
  ];
  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#0F172A,#1E293B,#0F172A)',display:'flex',flexDirection:'column',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif'}}>
      <div style={{padding:'16px 32px'}}>
        <button onClick={onBack} style={{background:'rgba(255,255,255,.08)',border:'none',color:'rgba(255,255,255,.6)',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:12}}>
          Retour au site
        </button>
      </div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
        <div style={{width:'100%',maxWidth:420}}>
          <div style={{textAlign:'center',marginBottom:36}}>
            <Logo size={68}/>
            <div style={{lineHeight:1.1,marginBottom:6,marginTop:16}}>
              <span style={{color:'#fff',fontSize:30,fontWeight:900}}>RUN </span>
              <span style={{color:'#F97316',fontSize:30,fontWeight:900}}>FLASH</span><br/>
              <span style={{color:'#fff',fontSize:30,fontWeight:900}}>COLIS</span>
            </div>
            <div style={{color:'rgba(255,255,255,.4)',fontSize:13,marginTop:8}}>Espace client · Ile de La Reunion</div>
          </div>
          {loading ? <Spinner/> : (
            <div style={{background:'rgba(255,255,255,.06)',borderRadius:16,padding:30,border:'1px solid rgba(255,255,255,.1)'}}>
              <div style={{marginBottom:16}}>
                <label style={{display:'block',color:'rgba(255,255,255,.45)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,marginBottom:8}}>Email</label>
                <input value={lf.email} onChange={e=>setLf(p=>({...p,email:e.target.value}))} placeholder="votre@email.re" type="email"
                  onKeyDown={e=>e.key==='Enter'&&doLogin()}
                  style={{width:'100%',padding:'12px 15px',borderRadius:9,border:'1px solid rgba(255,255,255,.12)',background:'rgba(255,255,255,.08)',color:'#fff',fontSize:14,outline:'none',boxSizing:'border-box'}}/>
              </div>
              <div style={{marginBottom:22}}>
                <label style={{display:'block',color:'rgba(255,255,255,.45)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,marginBottom:8}}>Mot de passe</label>
                <input value={lf.password} onChange={e=>setLf(p=>({...p,password:e.target.value}))} placeholder="Mot de passe" type="password"
                  onKeyDown={e=>e.key==='Enter'&&doLogin()}
                  style={{width:'100%',padding:'12px 15px',borderRadius:9,border:'1px solid rgba(255,255,255,.12)',background:'rgba(255,255,255,.08)',color:'#fff',fontSize:14,outline:'none',boxSizing:'border-box'}}/>
              </div>
              {err&&<div style={{background:'rgba(239,68,68,.15)',color:'#FCA5A5',padding:'10px 14px',borderRadius:8,fontSize:12,marginBottom:18}}>{err}</div>}
              <button onClick={doLogin} style={{width:'100%',padding:'13px',background:'#F97316',color:'#fff',border:'none',borderRadius:9,fontSize:15,fontWeight:800,cursor:'pointer',boxShadow:'0 4px 14px rgba(249,115,22,.4)'}}>
                Se connecter
              </button>
              <div style={{marginTop:22,borderTop:'1px solid rgba(255,255,255,.07)',paddingTop:20}}>
                <div style={{color:'rgba(255,255,255,.3)',fontSize:10,textTransform:'uppercase',marginBottom:10}}>Comptes demo - mot de passe : demo</div>
                {demos.map(u=>(
                  <button key={u.e} onClick={()=>setLf({email:u.e,password:'demo'})}
                    style={{display:'block',width:'100%',padding:'8px 12px',marginBottom:6,background:'rgba(255,255,255,.04)',color:'rgba(255,255,255,.6)',border:'1px solid rgba(255,255,255,.07)',borderRadius:7,fontSize:12,cursor:'pointer',textAlign:'left'}}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.08)'}
                    onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.04)'}>
                    {u.l} — <span style={{color:'rgba(255,255,255,.3)',fontSize:11}}>{u.e}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EcommDash({orders,user,nav}){
  const s={total:orders.length,livre:orders.filter(o=>o.status==='livre').length,cours:orders.filter(o=>['recupere','en_livraison'].includes(o.status)).length,attente:orders.filter(o=>o.status==='en_attente').length};
  return (
    <div>
      <div style={{marginBottom:26}}>
        <h1 style={{fontSize:24,fontWeight:900,color:C.navy,margin:0}}>Bonjour, {user.name}</h1>
        <p style={{color:C.gray4,fontSize:13,margin:'6px 0 0'}}>Collecte : <strong style={{color:C.orange}}>{user.jour}</strong>{user.adresse&&` - ${user.adresse}, ${user.ville}`}</p>
      </div>
      <div style={{display:'flex',gap:14,marginBottom:24,flexWrap:'wrap'}}>
        <Stat label="Total" value={s.total} accent={C.navy}/>
        <Stat label="En attente" value={s.attente} accent="#F59E0B"/>
        <Stat label="En cours" value={s.cours} accent="#8B5CF6"/>
        <Stat label="Livrees" value={s.livre} accent="#10B981"/>
      </div>
      <Card style={{marginBottom:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <h3 style={{margin:0,fontSize:14,fontWeight:800,color:C.navy}}>Dernieres commandes</h3>
          <button onClick={()=>nav('orders')} style={{background:'none',border:'none',color:C.orange,cursor:'pointer',fontSize:12,fontWeight:700}}>Voir tout</button>
        </div>
        <OTable orders={orders.slice(0,5)} showClient={false}/>
      </Card>
      <button onClick={()=>nav('new_order')} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'13px 26px',background:C.orange,color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:800,cursor:'pointer',boxShadow:'0 4px 12px rgba(249,115,22,.3)'}}>
        Creer une commande
      </button>
    </div>
  );
}

function EcommOrders({orders,nav,setLabelOrd,setEditOrd,onPrint}){
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:900,color:C.navy,margin:0}}>Mes commandes</h1>
          <p style={{color:C.gray4,fontSize:13,margin:'4px 0 0'}}>Modifier uniquement les commandes En attente</p>
        </div>
        <button onClick={()=>nav('new_order')} style={{padding:'10px 20px',background:C.orange,color:'#fff',border:'none',borderRadius:9,fontSize:13,fontWeight:800,cursor:'pointer'}}>
          Nouvelle commande
        </button>
      </div>
      <Card>
        <OTable orders={orders} showClient={false}
          onLabel={o=>{setLabelOrd(o);nav('label');}}
          onPrint={onPrint}
          onEdit={o=>{setEditOrd(o);nav('edit_order');}}/>
      </Card>
    </div>
  );
}

function NewOrderForm({form,setForm,onSubmit,nav,user}){
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  return (
    <div style={{maxWidth:580}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:26}}>
        <button onClick={()=>nav('orders')} style={{width:34,height:34,background:C.gray1,border:'none',borderRadius:8,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',color:C.gray6}}>
          Retour
        </button>
        <div>
          <h1 style={{fontSize:22,fontWeight:900,color:C.navy,margin:0}}>Nouvelle commande</h1>
          <p style={{color:C.gray4,fontSize:12,margin:'3px 0 0'}}>Collecte le <strong style={{color:C.orange}}>{user.jour}</strong></p>
        </div>
      </div>
      <Card>
        <SectionTitle color={C.orange} label="Destinataire"/>
        <Inp label="Nom complet" value={form.name} onChange={v=>f('name',v)} placeholder="Marie Dupont" required/>
        <AddrFields rue={form.rue} complement={form.complement} city={form.city} tel={form.tel} onChange={f}/>
        <div style={{borderTop:`1px solid ${C.gray2}`,margin:'20px 0 18px'}}/>
        <SectionTitle color={C.blue} label="Colis"/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <Inp label="Poids (kg)" value={form.poids} onChange={v=>f('poids',v)} placeholder="1.5" type="number"/>
          <Inp label="Description" value={form.desc} onChange={v=>f('desc',v)} placeholder="Vetements, chaussures..."/>
        </div>
        <div style={{background:'#EFF6FF',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:12,color:'#1D4ED8'}}>
          Collecte planifiee le <strong>{user.jour}</strong>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>nav('orders')} style={{padding:'11px 22px',background:C.gray1,color:C.gray6,border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>Annuler</button>
          <button onClick={onSubmit} style={{flex:1,padding:'11px',background:C.orange,color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:800,cursor:'pointer',boxShadow:'0 3px 10px rgba(249,115,22,.3)'}}>
            Valider et Generer etiquette
          </button>
        </div>
      </Card>
    </div>
  );
}

function EditOrderForm({o,onSave,onBack}){
  const [dest,setDest]=useState({...o.dest,rue:o.dest.rue||o.dest.addr||'',complement:o.dest.complement||''});
  const [poids,setPoids]=useState(o.poids);
  const [desc,setDesc]=useState(o.desc||o.description||'');
  const f=(k,v)=>setDest(p=>({...p,[k]:v}));
  if(o.status!=='en_attente') return (
    <Card style={{maxWidth:480}}>
      <div style={{textAlign:'center',padding:32}}>
        <div style={{fontSize:44,marginBottom:12}}>Non</div>
        <div style={{fontWeight:800,color:C.navy,fontSize:16,marginBottom:8}}>Modification impossible</div>
        <div style={{color:C.gray6,fontSize:13}}>Seules les commandes En attente peuvent etre modifiees.</div>
        <button onClick={onBack} style={{marginTop:20,padding:'10px 24px',background:C.gray1,color:C.gray6,border:'none',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:600}}>Retour</button>
      </div>
    </Card>
  );
  return (
    <div style={{maxWidth:580}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:26}}>
        <button onClick={onBack} style={{width:34,height:34,background:C.gray1,border:'none',borderRadius:8,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',color:C.gray6}}>
          Retour
        </button>
        <div>
          <h1 style={{fontSize:22,fontWeight:900,color:C.navy,margin:0}}>Modifier la commande</h1>
          <p style={{color:C.gray4,fontSize:12,margin:'3px 0 0',fontFamily:'monospace'}}>{o.num}</p>
        </div>
      </div>
      <Card>
        <div style={{background:'#FEF3C7',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:12,color:'#92400E'}}>
          Modification possible uniquement tant que la commande est En attente.
        </div>
        <SectionTitle color={C.orange} label="Destinataire"/>
        <Inp label="Nom complet" value={dest.name} onChange={v=>f('name',v)} required/>
        <AddrFields rue={dest.rue} complement={dest.complement} city={dest.city} tel={dest.tel} onChange={f}/>
        <div style={{borderTop:`1px solid ${C.gray2}`,margin:'20px 0 18px'}}/>
        <SectionTitle color={C.blue} label="Colis"/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <Inp label="Poids (kg)" value={poids} onChange={setPoids} type="number"/>
          <Inp label="Description" value={desc} onChange={setDesc}/>
        </div>
        <div style={{display:'flex',gap:10,marginTop:8}}>
          <button onClick={onBack} style={{padding:'11px 22px',background:C.gray1,color:C.gray6,border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>Annuler</button>
          <button onClick={()=>onSave({...o,dest,poids,desc})} style={{flex:1,padding:'11px',background:C.navy,color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:800,cursor:'pointer'}}>
            Enregistrer
          </button>
        </div>
      </Card>
    </div>
  );
}

function LabelView({o,onBack,onPrint}){
  const rue=o.dest.rue||o.dest.addr||'';
  const desc=o.desc||o.description||'';
  return (
    <div style={{maxWidth:520}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:22}}>
        <button onClick={onBack} style={{width:34,height:34,background:C.gray1,border:'none',borderRadius:8,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',color:C.gray6}}>
          Retour
        </button>
        <div style={{flex:1}}>
          <h1 style={{fontSize:20,fontWeight:900,color:C.navy,margin:0}}>Commande creee</h1>
          <p style={{color:C.gray4,fontSize:12,margin:'3px 0 0'}}>Etiquette prete a imprimer</p>
        </div>
        <button onClick={onPrint} style={{padding:'10px 18px',background:C.navy,color:'#fff',border:'none',borderRadius:9,fontSize:13,fontWeight:700,cursor:'pointer'}}>
          Imprimer
        </button>
      </div>
      <div style={{background:'#fff',border:'2.5px solid #0F172A',borderRadius:12,padding:24,fontFamily:'monospace'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'2px solid #0F172A',paddingBottom:14,marginBottom:16}}>
          <div>
            <div style={{fontSize:9,color:'#64748B',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>Service de livraison · Ile de La Reunion</div>
            <div style={{fontSize:18,fontWeight:900,lineHeight:1.1}}>
              <span style={{color:C.navy}}>RUN </span><span style={{color:C.orange}}>FLASH</span><br/><span style={{color:C.navy}}>COLIS</span>
            </div>
          </div>
          <FakeQR size={72}/>
        </div>
        <div style={{background:C.navy,color:'#fff',padding:'11px',borderRadius:7,textAlign:'center',fontSize:19,fontWeight:700,letterSpacing:4,marginBottom:16}}>{o.num}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
          <div style={{background:C.gray0,padding:12,borderRadius:7}}>
            <div style={{fontSize:9,textTransform:'uppercase',color:C.gray4,marginBottom:5,fontWeight:800}}>Expediteur</div>
            <div style={{fontWeight:700,color:C.navy,fontSize:13}}>{o.cname}</div>
          </div>
          <div style={{background:'#F0FDF4',padding:12,borderRadius:7,border:'1px solid #BBF7D0'}}>
            <div style={{fontSize:9,textTransform:'uppercase',color:'#16A34A',marginBottom:5,fontWeight:800}}>Destinataire</div>
            <div style={{fontWeight:700,color:C.navy,fontSize:13}}>{o.dest.name}</div>
            <div style={{color:C.gray6,fontSize:11,marginTop:3}}>{rue}</div>
            {o.dest.complement&&<div style={{color:'#92400E',fontSize:10,fontStyle:'italic',marginTop:1}}>{o.dest.complement}</div>}
            <div style={{color:C.gray6,fontSize:11}}>{o.dest.city}</div>
            <div style={{color:C.gray6,fontSize:11,marginTop:3}}>{o.dest.tel}</div>
          </div>
        </div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',fontSize:10,color:C.gray6,borderTop:`1px dashed ${C.gray2}`,paddingTop:11,alignItems:'center'}}>
          <span>{o.poids} kg</span><span>{desc}</span><span>{o.date}</span>
          <span style={{marginLeft:'auto',background:'#FEF3C7',padding:'2px 8px',borderRadius:5,color:'#92400E',fontWeight:800}}>{o.jour}</span>
        </div>
      </div>
    </div>
  );
}

function LivreurDash({orders,pending,nav}){
  const livrees=orders.filter(o=>o.status==='livre');
  const enCours=orders.filter(o=>['recupere','en_livraison'].includes(o.status));
  const clients=[...new Set(orders.map(o=>o.cid))];
  return (
    <div>
      <div style={{marginBottom:26}}>
        <h1 style={{fontSize:24,fontWeight:900,color:C.navy,margin:0}}>Tableau de bord</h1>
        <p style={{color:C.gray4,fontSize:13,margin:'6px 0 0'}}>{new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
        <div style={{display:'inline-flex',alignItems:'center',gap:8,marginTop:8,background:'#EFF6FF',borderRadius:8,padding:'6px 14px',fontSize:12,color:'#1D4ED8'}}>
          Depot : <strong>{DEPOT.rue}, {DEPOT.ville}</strong>
        </div>
      </div>
      <div style={{display:'flex',gap:14,marginBottom:24,flexWrap:'wrap'}}>
        <Stat label="Nouvelles cmds" value={pending.length} accent="#F59E0B" sub={pending.length?'Action requise':'Aucune'}/>
        <Stat label="En cours" value={enCours.length} accent="#8B5CF6"/>
        <Stat label="Total livre" value={livrees.length} accent="#10B981" sub={`${(livrees.length*PRICE).toFixed(2)} EUR generes`}/>
        <Stat label="Clients actifs" value={clients.length} accent={C.navy}/>
      </div>
      {pending.length>0&&(
        <Card style={{marginBottom:16,border:'2px solid #FDE68A',background:'#FFFBEB'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
            <div style={{width:36,height:36,background:'#FEF3C7',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>⏳</div>
            <div>
              <div style={{fontWeight:800,color:'#92400E',fontSize:14}}>{pending.length} commande(s) a recuperer</div>
              <div style={{fontSize:12,color:'#B45309'}}>Mise a jour des statuts requise</div>
            </div>
            <button onClick={()=>nav('statuts')} style={{marginLeft:'auto',padding:'8px 16px',background:C.orange,color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:700,cursor:'pointer',flexShrink:0}}>
              Gerer
            </button>
          </div>
          {pending.map(o=>(
            <div key={o.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderTop:'1px solid #FDE68A',gap:10,flexWrap:'wrap'}}>
              <div>
                <span style={{fontWeight:700,color:C.navy,fontSize:12,fontFamily:'monospace'}}>{o.num}</span>
                <span style={{color:C.gray6,fontSize:12,marginLeft:10}}>{o.cname} vers {o.dest.name}, {o.dest.city}</span>
              </div>
              <Badge status={o.status}/>
            </div>
          ))}
        </Card>
      )}
      <Card>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <h3 style={{margin:0,fontSize:14,fontWeight:800,color:C.navy}}>Toutes les livraisons</h3>
          <button onClick={()=>nav('statuts')} style={{background:'none',border:'none',color:C.orange,cursor:'pointer',fontSize:12,fontWeight:700}}>Gerer</button>
        </div>
        <OTable orders={orders.slice(0,7)} showClient={true}/>
      </Card>
    </div>
  );
}

const PBadge=({p,type})=>{
  if(type==='depot') return <span style={{padding:'2px 9px',borderRadius:20,background:'#FEF3C7',color:'#92400E',fontSize:10,fontWeight:700}}>Depot</span>;
  if(type==='collecte') return <span style={{padding:'2px 9px',borderRadius:20,background:'#DBEAFE',color:'#1E40AF',fontSize:10,fontWeight:700}}>Collecte</span>;
  if(p===1) return <span style={{padding:'2px 9px',borderRadius:20,background:'#D1FAE5',color:'#065F46',fontSize:10,fontWeight:700}}>Priorite 1</span>;
  return <span style={{padding:'2px 9px',borderRadius:20,background:C.gray1,color:C.gray6,fontSize:10,fontWeight:700}}>Livraison</span>;
};

function Tournees({orders,users,selDay,setSelDay,dayRoute,buildMapsUrl,mapsAddr}){
  const mapsUrl=buildMapsUrl(dayRoute);
  const dist=totalDist(dayRoute);
  const collectors=users.filter(u=>u.role==='ecommercant'&&u.jour===selDay&&u.adresse);
  const countByDay=j=>orders.filter(o=>o.jour===j&&o.status!=='livre').length+users.filter(u=>u.role==='ecommercant'&&u.jour===j&&u.adresse).length;
  return (
    <div>
      <h1 style={{fontSize:22,fontWeight:900,color:C.navy,margin:'0 0 4px'}}>Tournees optimisees</h1>
      <p style={{color:C.gray4,fontSize:13,margin:'0 0 10px'}}>Algorithme GPS - Depart depuis le depot</p>
      <div style={{background:'#FEF3C7',borderRadius:8,padding:'8px 14px',marginBottom:18,fontSize:12,color:'#92400E',display:'flex',alignItems:'center',gap:8}}>
        Depart fixe : <strong>{DEPOT.rue}, {DEPOT.ville}</strong>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
        {JOURS.map(j=>{
          const cnt=countByDay(j);const isActive=selDay===j;
          return (
            <button key={j} onClick={()=>setSelDay(j)}
              style={{padding:'9px 16px',borderRadius:10,border:`2px solid ${isActive?C.orange:C.gray2}`,background:isActive?C.orangeL:'#fff',color:isActive?C.orange:C.gray6,fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:7}}>
              {j}{cnt>0&&<span style={{background:isActive?C.orange:C.gray2,color:isActive?'#fff':C.gray6,borderRadius:20,padding:'0 7px',fontSize:10,fontWeight:800}}>{cnt}</span>}
            </button>
          );
        })}
      </div>
      {dayRoute.length===0 ? (
        <Card style={{textAlign:'center',padding:52}}>
          <div style={{fontSize:48,marginBottom:12}}>OK</div>
          <div style={{fontWeight:800,color:C.navy,fontSize:16}}>Aucun arret prevu le {selDay}</div>
        </Card>
      ) : (
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
            <div style={{fontSize:14,color:C.gray6}}>
              <span style={{fontWeight:800,color:C.navy}}>{dayRoute.length} arret(s)</span>
              {dist>0&&<span> · <strong style={{color:C.orange}}>{dist.toFixed(0)} km</strong></span>}
              {collectors.length>0&&<span style={{color:'#1E40AF'}}> · {collectors.length} collecte(s)</span>}
            </div>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              style={{display:'inline-flex',alignItems:'center',gap:7,padding:'10px 20px',background:'#4285F4',color:'#fff',borderRadius:9,fontSize:13,fontWeight:700,textDecoration:'none',boxShadow:'0 3px 10px rgba(66,133,244,.3)'}}>
              Ouvrir dans Google Maps
            </a>
          </div>
          <div style={{borderRadius:12,overflow:'hidden',border:`1px solid ${C.gray2}`,marginBottom:16,boxShadow:'0 2px 8px rgba(0,0,0,.08)'}}>
            <iframe title="carte" width="100%" height="280" style={{border:0,display:'block'}} loading="lazy" allowFullScreen
              src={`https://maps.google.com/maps?q=${encodeURIComponent(mapsAddr(DEPOT.rue,DEPOT.ville))}&output=embed&hl=fr&z=11`}/>
          </div>
          <Card style={{marginBottom:10,padding:'15px 20px',borderLeft:'4px solid #F59E0B',background:'#FFFBEB'}}>
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <div style={{width:32,height:32,background:'#F59E0B',color:'#fff',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:18,flexShrink:0}}>D</div>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}><PBadge type="depot"/></div>
                <div style={{fontWeight:800,color:'#92400E',fontSize:15}}>{DEPOT.label}</div>
                <div style={{color:C.gray6,fontSize:13,marginTop:2}}>{DEPOT.rue}, {DEPOT.ville}</div>
              </div>
            </div>
          </Card>
          {dayRoute.map((stop,i)=>{
            const isCollecte=stop.type==='collecte';
            const borderColor=isCollecte?C.blue:stop.priority===1?C.green:C.gray2;
            const dotBg=isCollecte?C.blue:stop.priority===1?C.green:C.navy;
            const navTarget=isCollecte?mapsAddr(stop.client.adresse,stop.client.ville||''):mapsAddr(stop.order.dest.rue||'',stop.order.dest.city);
            return (
              <Card key={i} style={{marginBottom:10,padding:'15px 20px',borderLeft:`4px solid ${borderColor}`}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:14}}>
                  <div style={{width:32,height:32,background:dotBg,color:'#fff',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:14,flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
                      <PBadge p={stop.priority} type={stop.type}/>
                      {!isCollecte&&<Badge status={stop.order.status}/>}
                      {!isCollecte&&<span style={{fontSize:10,color:C.gray4,fontFamily:'monospace'}}>{stop.order.num}</span>}
                      {stop.distFromPrev&&<span style={{fontSize:10,color:C.orange,fontWeight:700}}>{stop.distFromPrev} km</span>}
                    </div>
                    {isCollecte ? (
                      <>
                        <div style={{fontWeight:800,color:C.blue,fontSize:15}}>{stop.client.name}</div>
                        <div style={{color:C.gray6,fontSize:13,marginTop:2}}>{stop.client.adresse}{stop.client.complement&&`, ${stop.client.complement}`}</div>
                        <div style={{color:C.gray6,fontSize:13}}>{stop.client.ville}</div>
                        {stop.client.siret&&<div style={{color:C.gray4,fontSize:11,marginTop:2}}>SIRET : {stop.client.siret}</div>}
                        {stop.client.tel&&<div style={{marginTop:5}}><a href={`tel:${stop.client.tel.replace(/\s/g,'')}`} style={{color:C.blue,fontSize:12,fontWeight:700,textDecoration:'none'}}>{stop.client.tel}</a></div>}
                      </>
                    ) : (
                      <>
                        <div style={{fontWeight:700,color:C.navy,fontSize:14}}>{stop.order.dest.name}</div>
                        <div style={{color:C.gray6,fontSize:13,marginTop:2}}>{stop.order.dest.rue||stop.order.dest.addr}</div>
                        {stop.order.dest.complement&&<div style={{color:'#92400E',fontSize:11,fontStyle:'italic'}}>{stop.order.dest.complement}</div>}
                        <div style={{color:C.gray6,fontSize:13}}>{stop.order.dest.city}</div>
                        <div style={{color:C.gray4,fontSize:11,marginTop:2}}>Maps : {mapsAddr(stop.order.dest.rue||'',stop.order.dest.city)}</div>
                        <div style={{display:'flex',alignItems:'center',gap:12,marginTop:5}}>
                          <a href={`tel:${stop.order.dest.tel.replace(/\s/g,'')}`} style={{color:C.blue,fontSize:12,fontWeight:700,textDecoration:'none'}}>{stop.order.dest.tel}</a>
                          <span style={{color:C.gray4,fontSize:11}}>{stop.order.poids} kg · {stop.order.desc||stop.order.description}</span>
                        </div>
                      </>
                    )}
                  </div>
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(navTarget)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{padding:'8px 14px',background:'#EFF6FF',color:'#4285F4',borderRadius:7,fontSize:12,fontWeight:700,textDecoration:'none',flexShrink:0,border:'1px solid #BFDBFE'}}>
                    Nav
                  </a>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Statuts({orders,updateStatus}){
  const [filter,setFilter]=useState('all');
  const filtered=filter==='all'?orders:orders.filter(o=>o.status===filter);
  const cnt=s=>orders.filter(o=>o.status===s).length;
  return (
    <div>
      <h1 style={{fontSize:22,fontWeight:900,color:C.navy,margin:'0 0 6px'}}>Statuts de livraison</h1>
      <p style={{color:C.gray4,fontSize:13,margin:'0 0 20px'}}>Adresse complete et navigation directe</p>
      <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
        {[
          {v:'all',l:`Toutes (${orders.length})`},
          {v:'en_attente',l:`En attente (${cnt('en_attente')})`},
          {v:'recupere',l:`Recuperees (${cnt('recupere')})`},
          {v:'en_livraison',l:`En livraison (${cnt('en_livraison')})`},
          {v:'livre',l:`Livrees (${cnt('livre')})`},
        ].map(f=>(
          <button key={f.v} onClick={()=>setFilter(f.v)}
            style={{padding:'7px 13px',borderRadius:8,border:`2px solid ${filter===f.v?C.navy:C.gray2}`,background:filter===f.v?C.navy:'#fff',color:filter===f.v?'#fff':C.gray6,fontSize:12,fontWeight:600,cursor:'pointer'}}>
            {f.l}
          </button>
        ))}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {filtered.length===0&&<Card style={{textAlign:'center',padding:32,color:C.gray4,fontSize:13}}>Aucune commande dans cette categorie.</Card>}
        {filtered.map(o=>{
          const rue=o.dest.rue||o.dest.addr||'';
          return (
            <Card key={o.id} style={{padding:'16px 20px'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:14,flexWrap:'wrap'}}>
                <div style={{flex:1,minWidth:220}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
                    <span style={{fontFamily:'monospace',fontSize:11,fontWeight:700,color:C.navy}}>{o.num}</span>
                    <Badge status={o.status}/>
                    <span style={{fontSize:11,color:C.gray4}}>· {o.jour}</span>
                  </div>
                  <div style={{background:C.gray0,borderRadius:8,padding:'10px 14px',marginBottom:8,borderLeft:`3px solid ${C.orange}`}}>
                    <div style={{fontSize:10,textTransform:'uppercase',color:C.gray4,fontWeight:700,letterSpacing:.5,marginBottom:5}}>Adresse de livraison</div>
                    <div style={{fontWeight:800,color:C.navy,fontSize:14}}>{o.dest.name}</div>
                    <div style={{color:C.gray6,fontSize:13,marginTop:3}}>{rue}</div>
                    {o.dest.complement&&<div style={{color:'#92400E',fontSize:11,fontStyle:'italic',marginTop:1}}>{o.dest.complement}</div>}
                    <div style={{color:C.gray6,fontSize:13}}>{o.dest.city}</div>
                    <div style={{display:'flex',alignItems:'center',gap:12,marginTop:6,flexWrap:'wrap'}}>
                      <a href={`tel:${o.dest.tel.replace(/\s/g,'')}`} style={{color:C.blue,fontSize:12,fontWeight:700,textDecoration:'none'}}>{o.dest.tel}</a>
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsAddr(rue,o.dest.city))}`}
                        target="_blank" rel="noopener noreferrer" style={{color:'#4285F4',fontSize:12,fontWeight:700,textDecoration:'none'}}>
                        Naviguer
                      </a>
                    </div>
                  </div>
                  <div style={{color:C.gray4,fontSize:11}}>{o.cname} · {o.poids} kg · {o.desc||o.description} · {o.date}</div>
                </div>
                <div style={{flexShrink:0}}>
                  {NEXT[o.status] ? (
                    <button onClick={()=>updateStatus(o.id)}
                      style={{padding:'10px 16px',background:C.orange,color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:800,cursor:'pointer',whiteSpace:'nowrap',boxShadow:'0 2px 8px rgba(249,115,22,.3)'}}>
                      {STATUS[NEXT[o.status]].icon} {NEXT_L[o.status]}
                    </button>
                  ) : (
                    <span style={{fontSize:28}}>OK</span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function GestionComptes({users,createAccount,updateAccount}){
  const [showForm,setShowForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({name:'',email:'',password:'',siret:'',adresse:'',complement:'',ville:'',tel:'',jour:'Lundi'});
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const handleCreate=async()=>{
    if(!form.name||!form.email||!form.password) return;
    if(await createAccount(form)){
      setForm({name:'',email:'',password:'',siret:'',adresse:'',complement:'',ville:'',tel:'',jour:'Lundi'});
      setShowForm(false);
    }
  };
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:900,color:C.navy,margin:0}}>Gestion des clients</h1>
          <p style={{color:C.gray4,fontSize:13,margin:'4px 0 0'}}>Comptes sauvegardes dans la base de donnees</p>
        </div>
        <button onClick={()=>{setShowForm(p=>!p);setEditId(null);}}
          style={{padding:'10px 20px',background:showForm?C.gray2:C.orange,color:showForm?C.gray6:'#fff',border:'none',borderRadius:9,fontSize:13,fontWeight:700,cursor:'pointer'}}>
          {showForm?'Annuler':'Nouveau client'}
        </button>
      </div>
      {showForm&&(
        <Card style={{marginBottom:20,border:`2px solid ${C.orange}`,background:C.orangeL}}>
          <h3 style={{margin:'0 0 18px',fontSize:14,fontWeight:800,color:C.navy}}>Creer un compte e-commercant</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <Inp label="Nom de la boutique" value={form.name} onChange={v=>f('name',v)} placeholder="BoutiqueMode974" required/>
            <Inp label="SIRET" value={form.siret} onChange={v=>f('siret',v)} placeholder="12345678901234" hint="14 chiffres"/>
            <Inp label="Email" value={form.email} onChange={v=>f('email',v)} placeholder="boutique@email.re" required/>
            <Inp label="Mot de passe" value={form.password} onChange={v=>f('password',v)} placeholder="Mot de passe" type="password" required/>
            <Inp label="Telephone" value={form.tel} onChange={v=>f('tel',v)} placeholder="0262 00 00 00"/>
            <Sel label="Jour de collecte" value={form.jour} onChange={v=>f('jour',v)} options={JOURS.map(j=>({v:j,l:j}))}/>
          </div>
          <div style={{background:'#EFF6FF',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:12,color:'#1D4ED8'}}>
            Adresse point de collecte - integree dans le calcul GPS
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <Inp label="Numero et nom de rue" value={form.adresse} onChange={v=>f('adresse',v)} placeholder="5 Rue du Commerce" hint="Pour Google Maps"/>
            <Inp label="Complement" value={form.complement} onChange={v=>f('complement',v)} placeholder="Zone artisanale..." hint="Non envoye a Google Maps"/>
            <div style={{gridColumn:'1/-1'}}>
              <Inp label="Ville / Code postal" value={form.ville} onChange={v=>f('ville',v)} placeholder="Saint-Denis 97400" required/>
            </div>
          </div>
          <button onClick={handleCreate} style={{padding:'11px 28px',background:C.navy,color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:800,cursor:'pointer'}}>
            Creer le compte
          </button>
        </Card>
      )}
      {users.length===0 ? (
        <Card style={{textAlign:'center',padding:48}}>
          <div style={{fontSize:44,marginBottom:10}}>OK</div>
          <div style={{fontWeight:800,color:C.navy,fontSize:16}}>Aucun client enregistre</div>
        </Card>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {users.map(u=>(
            <Card key={u.id} style={{padding:'18px 22px'}}>
              {editId===u.id ? (
                <EditClientForm u={u} onSave={async updated=>{await updateAccount(updated);setEditId(null);}} onCancel={()=>setEditId(null)}/>
              ) : (
                <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
                  <div style={{width:44,height:44,background:C.navy,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:16,flexShrink:0}}>{u.initials}</div>
                  <div style={{flex:1,minWidth:200}}>
                    <div style={{fontWeight:800,color:C.navy,fontSize:16}}>{u.name}</div>
                    <div style={{color:C.gray4,fontSize:12,marginTop:2}}>{u.email}</div>
                    {u.siret&&<div style={{color:C.gray4,fontSize:11,marginTop:2}}>SIRET : {u.siret}</div>}
                    {u.adresse&&<div style={{marginTop:6,fontSize:12,color:C.gray6}}>{u.adresse}{u.complement&&`, ${u.complement}`}, {u.ville}</div>}
                    {u.tel&&<div style={{fontSize:12,color:C.gray6,marginTop:2}}>{u.tel}</div>}
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
                    <div style={{background:'#FEF3C7',color:'#92400E',padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:800}}>{u.jour}</div>
                    <button onClick={()=>setEditId(u.id)}
                      style={{padding:'7px 14px',background:C.gray1,color:C.gray6,border:`1px solid ${C.gray2}`,borderRadius:7,fontSize:12,cursor:'pointer',fontWeight:600}}>
                      Modifier
                    </button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EditClientForm({u,onSave,onCancel}){
  const [f,setF]=useState({...u});
  const upd=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <div>
      <div style={{fontWeight:800,color:C.navy,fontSize:14,marginBottom:14}}>Modifier : {u.name}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <Inp label="Nom boutique" value={f.name} onChange={v=>upd('name',v)}/>
        <Inp label="SIRET" value={f.siret||''} onChange={v=>upd('siret',v)} placeholder="14 chiffres"/>
        <Inp label="Email" value={f.email} onChange={v=>upd('email',v)}/>
        <Inp label="Telephone" value={f.tel||''} onChange={v=>upd('tel',v)}/>
        <Sel label="Jour de collecte" value={f.jour} onChange={v=>upd('jour',v)} options={JOURS.map(j=>({v:j,l:j}))}/>
        <Inp label="Numero et rue" value={f.adresse||''} onChange={v=>upd('adresse',v)} hint="Pour Google Maps"/>
        <Inp label="Complement" value={f.complement||''} onChange={v=>upd('complement',v)} hint="Non envoye a Maps"/>
        <Inp label="Ville / CP" value={f.ville||''} onChange={v=>upd('ville',v)}/>
      </div>
      <div style={{display:'flex',gap:10,marginTop:8}}>
        <button onClick={onCancel} style={{padding:'9px 20px',background:C.gray1,color:C.gray6,border:'none',borderRadius:7,fontSize:13,fontWeight:600,cursor:'pointer'}}>Annuler</button>
        <button onClick={()=>onSave(f)} style={{flex:1,padding:'9px',background:C.navy,color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:800,cursor:'pointer'}}>Enregistrer</button>
      </div>
    </div>
  );
}

function Facturation({byClient,livrees,printFacture}){
  const total=livrees.length*PRICE;
  const clients=Object.entries(byClient);
  return (
    <div>
      <h1 style={{fontSize:22,fontWeight:900,color:C.navy,margin:'0 0 6px'}}>Facturation</h1>
      <p style={{color:C.gray4,fontSize:13,margin:'0 0 22px'}}>Tarif : <strong style={{color:C.orange}}>{PRICE.toFixed(2)} EUR</strong> par livraison</p>
      <div style={{display:'flex',gap:14,marginBottom:24,flexWrap:'wrap'}}>
        <Stat label="Colis livres" value={livrees.length} accent="#10B981"/>
        <Stat label="Chiffre affaires" value={`${total.toFixed(2)} EUR`} accent={C.orange} sub="Total cumule"/>
        <Stat label="Clients facturables" value={clients.length} accent={C.navy}/>
      </div>
      {clients.length===0 ? (
        <Card style={{textAlign:'center',padding:48}}>
          <div style={{fontSize:44,marginBottom:10}}>OK</div>
          <div style={{fontWeight:800,color:C.navy,fontSize:16}}>Aucune livraison a facturer</div>
          <div style={{color:C.gray4,fontSize:13,marginTop:5}}>Les commandes Livrees apparaitront ici.</div>
        </Card>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {clients.map(([cid,data])=>(
            <Card key={cid}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:14}}>
                  <div style={{width:42,height:42,background:C.navy,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:18}}>S</div>
                  <div>
                    <div style={{fontWeight:800,color:C.navy,fontSize:15}}>{data.name}</div>
                    {data.siret&&<div style={{color:C.gray4,fontSize:11,marginTop:2}}>SIRET : {data.siret}</div>}
                    <div style={{color:C.gray4,fontSize:12,marginTop:2}}>{data.orders.length} livraison(s)</div>
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:14}}>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:26,fontWeight:900,color:C.orange,lineHeight:1}}>{(data.orders.length*PRICE).toFixed(2)} EUR</div>
                    <div style={{fontSize:11,color:C.gray4,marginTop:2}}>{data.orders.length} x {PRICE.toFixed(2)} EUR</div>
                  </div>
                  <button onClick={()=>printFacture(data)}
                    style={{padding:'10px 16px',background:C.navy,color:'#fff',border:'none',borderRadius:9,fontSize:13,fontWeight:700,cursor:'pointer'}}>
                    Facture PDF
                  </button>
                </div>
              </div>
              <div style={{borderTop:`1px solid ${C.gray2}`,paddingTop:14}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead>
                    <tr>
                      {['N Suivi','Destinataire','Ville','Date','Montant'].map((h,i)=>(
                        <th key={h} style={{padding:'5px 8px',textAlign:i===4?'right':'left',color:C.gray4,fontWeight:700,fontSize:10,textTransform:'uppercase',borderBottom:`1px solid ${C.gray2}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map(o=>(
                      <tr key={o.id} style={{borderBottom:`1px solid ${C.gray1}`}}>
                        <td style={{padding:'7px 8px',fontFamily:'monospace',fontWeight:700,color:C.navy}}>{o.num}</td>
                        <td style={{padding:'7px 8px',color:C.gray6}}>{o.dest.name}</td>
                        <td style={{padding:'7px 8px',color:C.gray6}}>{o.dest.city}</td>
                        <td style={{padding:'7px 8px',color:C.gray4}}>{o.date}</td>
                        <td style={{padding:'7px 8px',textAlign:'right',fontWeight:700,color:'#10B981'}}>{PRICE.toFixed(2)} EUR</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function OTable({orders,showClient,onLabel,onPrint,onEdit}){
  if(!orders.length) return <div style={{textAlign:'center',padding:28,color:C.gray4,fontSize:13}}>Aucune commande</div>;
  return (
    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead>
          <tr style={{borderBottom:`2px solid ${C.gray2}`}}>
            <th style={{padding:'7px 10px',textAlign:'left',color:C.gray4,fontWeight:600,fontSize:10,textTransform:'uppercase'}}>N Suivi</th>
            {showClient&&<th style={{padding:'7px 10px',textAlign:'left',color:C.gray4,fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Client</th>}
            <th style={{padding:'7px 10px',textAlign:'left',color:C.gray4,fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Destinataire</th>
            <th style={{padding:'7px 10px',textAlign:'left',color:C.gray4,fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Statut</th>
            <th style={{padding:'7px 10px',textAlign:'left',color:C.gray4,fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Jour</th>
            {(onLabel||onEdit)&&<th style={{padding:'7px 10px'}}/>}
          </tr>
        </thead>
        <tbody>
          {orders.map(o=>(
            <tr key={o.id} style={{borderBottom:`1px solid ${C.gray1}`}}
              onMouseEnter={e=>e.currentTarget.style.background=C.gray0}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <td style={{padding:'9px 10px',fontFamily:'monospace',fontSize:10,fontWeight:700,color:C.navy,whiteSpace:'nowrap'}}>{o.num}</td>
              {showClient&&<td style={{padding:'9px 10px',color:C.gray6,fontSize:11,whiteSpace:'nowrap'}}>{o.cname}</td>}
              <td style={{padding:'9px 10px'}}>
                <div style={{fontWeight:600,color:C.navy,fontSize:12}}>{o.dest.name}</div>
                <div style={{color:C.gray4,fontSize:10,marginTop:1}}>{o.dest.city}</div>
              </td>
              <td style={{padding:'9px 10px'}}><Badge status={o.status}/></td>
              <td style={{padding:'9px 10px',color:C.gray6,fontSize:11}}>{o.jour}</td>
              {(onLabel||onEdit)&&(
                <td style={{padding:'9px 10px',whiteSpace:'nowrap'}}>
                  {onPrint&&<button onClick={()=>onPrint(o)} style={{padding:'4px 8px',background:C.gray1,color:C.gray6,border:'none',borderRadius:5,fontSize:11,cursor:'pointer',marginRight:4}}>Impr</button>}
                  {onLabel&&<button onClick={()=>onLabel(o)} style={{padding:'4px 10px',background:C.orangeL,color:C.orange,border:'1px solid #FED7AA',borderRadius:5,fontSize:10,cursor:'pointer',fontWeight:700,marginRight:4}}>Etiquette</button>}
                  {onEdit&&o.status==='en_attente'&&<button onClick={()=>onEdit(o)} style={{padding:'4px 10px',background:'#EFF6FF',color:C.blue,border:'1px solid #BFDBFE',borderRadius:5,fontSize:10,cursor:'pointer',fontWeight:700}}>Modifier</button>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
