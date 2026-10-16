const $=id=>document.getElementById(id);let current=null,history=[],weekly=null;let thermostatEditing=false;let speedEditing=false;const dirtyFields=new Set();const preserve=(id,value)=>{if(dirtyFields.has(id)||document.activeElement===$(id))return;const el=$(id);if(el.type==='checkbox')el.checked=Boolean(value);else el.value=value;};const fmt=(v,n=1)=>Number(v).toFixed(n);const token=sessionStorage.getItem('sim-token')||'';
function log(message){const line=document.createElement('div'),time=document.createElement('time');time.textContent=new Date().toLocaleTimeString();line.append(time,document.createTextNode(message));$('log').prepend(line);while($('log').children.length>50)$('log').lastChild.remove();}
async function request(path,method='GET',data){const response=await fetch(path,{method,headers:{'content-type':'application/json',...(token?{'x-sim-token':token}:{})},...(data?{body:JSON.stringify(data)}:{})});const body=await response.json();if(!response.ok)throw Error(body.error||`HTTP ${response.status}`);return body;}
function chart(){const svg=$('chart'),W=720,H=245,top=16,bottom=215,left=45,right=700;const samples=history.slice(-145);if(current)samples.push({minute:current.minutes,temperature:current.temperature,setpoint:current.setpoint});const values=samples.flatMap(s=>[s.temperature,s.setpoint]);const min=Math.floor(Math.min(7,...values)-1),max=Math.ceil(Math.max(23,...values)+1);const X=i=>left+(right-left)*(samples.length<2?.5:i/(samples.length-1)),Y=v=>bottom-(v-min)/(max-min)*(bottom-top);const ns='http://www.w3.org/2000/svg';svg.replaceChildren();const add=(name,attrs,text)=>{const el=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;svg.append(el);return el;};for(let i=0;i<5;i++){const value=min+(max-min)*i/4,y=Y(value);add('line',{x1:left,x2:right,y1:y,y2:y,stroke:'#293b50','stroke-dasharray':'4 6'});add('text',{x:4,y:y+4,fill:'#91a5bd','font-size':12},fmt(value,0)+'°');}for(const [field,color]of [['temperature','#46c8f0'],['setpoint','#f2ae5b']]){if(samples.length){const points=samples.map((s,i)=>`${X(i)},${Y(s[field])}`).join(' ');add('polyline',{points,fill:'none',stroke:color,'stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round'});}}}
function render(state){current=state;$('virtual-day-current').textContent=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][Math.floor(state.minutes/1440)%7]+' '+String(Math.floor(state.minutes%1440/60)).padStart(2,'0')+':'+String(state.minutes%60).padStart(2,'0');$('temperature').textContent=fmt(state.temperature)+' °C';$('setpoint').textContent=fmt(state.setpoint)+' °C';$('outside').textContent=fmt(state.outside)+' °C';$('heating').textContent=state.boilerFault?'FAULT':state.heating?'HEATING':'IDLE';$('heating').style.color=state.boilerFault?'#f99aa7':state.heating?'#f2ae5b':'#69d9a7';$('heat-minutes').textContent=`Heating duration: ${state.heatMinutes} min`;$('mode-label').textContent=state.mode.toUpperCase();$('clock').textContent=`Day ${Math.floor(state.minutes/1440)+1} · ${String(Math.floor(state.minutes%1440/60)).padStart(2,'0')}:${String(state.minutes%60).padStart(2,'0')}`;preserve('window',state.windowOpen);preserve('insulation',state.insulation);if(!dirtyFields.has('insulation'))$('insulation-label').textContent=fmt(state.insulation)+'×';preserve('power',state.heatingPower);if(!dirtyFields.has('power'))$('power-label').textContent=fmt(state.heatingPower)+'×';preserve('relay',state.relayOnline);preserve('fault',state.boilerFault);preserve('battery',state.battery);if(!dirtyFields.has('battery'))$('battery-label').textContent=state.battery+'%';preserve('indoor-input',state.temperature);if(!dirtyFields.has('indoor-input'))$('indoor-label').textContent=fmt(state.temperature)+' °C';preserve('outside-input',state.outside);if(!dirtyFields.has('outside-input'))$('outside-label').textContent=state.outside+' °C';if(!thermostatEditing)$('target').value=state.setpoint;if(!thermostatEditing)$('target-label').textContent=fmt(state.setpoint)+' °C';if(!thermostatEditing){$('mode').value=state.mode;$('manual-fields').hidden=false;}chart();}
function updateClockIndicator(speed){const el=$('clock-status');if(!el)return;el.textContent=speed>0?'● Running ×'+speed:'● Paused';el.dataset.running=speed>0?'true':'false';}
function setStatus(id,label,severity){const element=$(id);element.textContent=label;element.dataset.severity=severity;}
async function refreshIntegrationStatus(){
  try{
    const info=await request('/sim/integration-status');
    setStatus('sim-api-status','Connected','ok');
    const fault=info.netatmoApi.faultMode;
    setStatus('netatmo-api-status',fault==='none'?'Ready':'Fault: '+fault,fault==='none'?'ok':'error');
    $('netatmo-api-details').textContent=`Fault mode: ${fault} · API requests: ${info.netatmoApi.requestCount}`;
    const o=info.oauth;
    setStatus('oauth-status',o.activeAccessTokens>0?'Active access tokens':o.pendingAuthorizationCodes>0?'Authorization pending':'No active access tokens',o.activeAccessTokens>0?'ok':'warning');
    $('oauth-details').textContent=`Access: ${o.activeAccessTokens} · Refresh: ${o.refreshTokens} · Pending codes: ${o.pendingAuthorizationCodes}`;
    setStatus('sensorsphere-status','Not verifiable here','warning');
  }catch(e){
    setStatus('sim-api-status','Unavailable','error');
    setStatus('oauth-status','Unavailable','error');
    setStatus('netatmo-api-status','Unavailable','error');
    setStatus('sensorsphere-status','Not verifiable here','warning');
  }
}
async function refresh(){const [state,h,clock,schedule,events]=await Promise.all([request('/sim/state'),request('/sim/history'),request('/sim/clock'),request('/sim/schedule'),request('/sim/events')]);history=h.history;weekly=schedule.days;render(state);if(!speedEditing)$('speed').value=String(clock.speed);updateClockIndicator(clock.speed);$('api-fault').value=state.apiFault;$('sim-events').replaceChildren();for(const e of events.events.slice(-35).reverse()){const item=document.createElement('div');item.textContent=`Day ${Math.floor(e.minute/1440)+1} ${String(Math.floor(e.minute%1440/60)).padStart(2,'0')}:${String(e.minute%60).padStart(2,'0')} · ${e.type}: ${e.message}`;$('sim-events').append(item);}await refreshIntegrationStatus();$('api-status').textContent='● Simulator API: Connected';if(document.activeElement!==$('schedule-json'))showSchedule();}
async function action(name,fn){try{$('error').hidden=true;await fn();await refresh();log('✓ '+name);}catch(e){$('error').hidden=false;$('error').textContent=e.message;$('api-status').textContent='● Simulator API: Error';setStatus('sim-api-status','Error','error');log('✕ '+name+': '+e.message);}}
$('refresh').onclick=()=>action('State refreshed',async()=>{});$('reset').onclick=()=>{if(confirm('Reset simulated thermostat and history?'))action('Simulation reset',()=>request('/sim/reset','POST',{}));};$('advance').onclick=()=>action('Advanced '+$('step').value+' minutes',()=>request('/sim/step','POST',{minutes:Number($('step').value)}));document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>action('Advanced '+b.dataset.step+' minutes',()=>request('/sim/step','POST',{minutes:Number(b.dataset.step)})));
$('target').oninput=()=>{thermostatEditing=true;$('mode').value='manual';$('manual-fields').hidden=false;$('target-label').textContent=fmt($('target').value)+' °C';};$('indoor-input').oninput=()=>$('indoor-label').textContent=fmt($('indoor-input').value)+' °C';$('outside-input').oninput=()=>$('outside-label').textContent=$('outside-input').value+' °C';$('insulation').oninput=()=>$('insulation-label').textContent=fmt($('insulation').value)+'×';$('power').oninput=()=>$('power-label').textContent=fmt($('power').value)+'×';$('battery').oninput=()=>$('battery-label').textContent=$('battery').value+'%';$('mode').onchange=()=>{thermostatEditing=true;$('manual-fields').hidden=false;};
$('apply').onclick=()=>action('Thermostat command',async()=>{const mode=$('mode').value;if(mode==='manual'){await request('/sim/mode','POST',{mode:'manual',setpoint:Number($('target').value),duration:Number($('duration').value)});}else await request('/sim/mode','POST',{mode});thermostatEditing=false;});$('indoor-apply').onclick=()=>action('Indoor temperature set',async()=>{await request('/sim/config','POST',{temperature:Number($('indoor-input').value)});dirtyFields.delete('indoor-input');});$('weather').onclick=()=>action('Outdoor temperature updated',async()=>{await request('/sim/config','POST',{outside:Number($('outside-input').value)});dirtyFields.delete('outside-input');});$('fault-apply').onclick=()=>action('Fault scenario updated',async()=>{await request('/sim/config','POST',{relayOnline:$('relay').checked,boilerFault:$('fault').checked,windowOpen:$('window').checked,insulation:Number($('insulation').value),heatingPower:Number($('power').value),battery:Number($('battery').value)});for(const id of ['battery','insulation','power','window','relay','fault'])dirtyFields.delete(id);});$('speed').onchange=()=>{speedEditing=true;};$('clock-apply').onclick=()=>action('Clock speed updated',async()=>{await request('/sim/clock','POST',{speed:Number($('speed').value)});speedEditing=false;});function showSchedule(){if(weekly)$('schedule-json').value=weekly[Number($('schedule-day').value)].map(p=>`${String(Math.floor(p.minute/60)).padStart(2,'0')}:${String(p.minute%60).padStart(2,'0')}=${p.temp}`).join('\n');}$('schedule-day').onchange=showSchedule;$('schedule-save').onclick=()=>action('Weekly schedule saved',async()=>{const day=Number($('schedule-day').value),entries=$('schedule-json').value.trim().split(/\n+/).map(line=>{const m=/^(\d{1,2}):(\d{2})\s*=\s*(\d+(?:\.\d+)?)$/.exec(line.trim());if(!m)throw Error('Expected HH:MM=temperature');return {minute:Number(m[1])*60+Number(m[2]),temp:Number(m[3])};});const days=weekly.map(d=>d.map(e=>({...e})));days[day]=entries;await request('/sim/schedule','POST',{days});});$('scenario-apply').onclick=()=>{if(confirm('Load scenario and reset the current simulation?'))action('Scenario loaded',()=>request('/sim/scenario','POST',{name:$('scenario').value}));};$('api-fault-apply').onclick=()=>action('API fault updated',()=>request('/sim/api-fault','POST',{mode:$('api-fault').value}));$('clear-log').onclick=()=>$('log').replaceChildren();

for(const id of ['indoor-input','outside-input','battery','insulation','power','window','relay','fault'])$(id).addEventListener('input',()=>dirtyFields.add(id));
setInterval(()=>{if(document.visibilityState==='visible')refresh().catch(e=>log('Refresh: '+e.message));},3000);
refresh().then(()=>log('Simulator UI ready')).catch(e=>{log('Connection failed: '+e.message);$('error').hidden=false;$('error').textContent='Cannot connect: '+e.message;setStatus('sim-api-status','Unavailable','error');$('api-status').textContent='● Simulator API: Unavailable';});

request('/sim/identity').then(identity=>{
  $('instance-heading').textContent='SIM-'+identity.instanceId+' / HOME '+identity.instanceId;
  document.title='Netatmo Simulator · SIM-'+identity.instanceId+' · HOME '+identity.instanceId;
  $('instance-details').textContent='SIM_INSTANCE_ID: '+identity.instanceId+' · Home: '+identity.homeId+' · Room: '+identity.roomId+' · Thermostat: '+identity.thermostatId+' · Relay: '+identity.relayId;
}).catch(e=>{$('instance-details').textContent='Instance identity unavailable: '+e.message;});

// UI localization: never store credentials; only the display preference is persisted.
const localeKey='netatmo.sim.ui.language';
const translations={
'● SIMULATION ONLY':'● SIMULATION UNIQUEMENT','Heating control center':'Centre de contrôle du chauffage',
'Loading instance identity…':'Chargement de l’identité…','Thermostat Intelligent · Relay · Boiler — virtual environment':'Thermostat intelligent · Relais · Chaudière — environnement virtuel',
'↻ Refresh':'↻ Actualiser','Reset simulation':'Réinitialiser la simulation','Connectivity & integration':'Connectivité et intégration',
'Simulator-local diagnostics · no SensorSphere credentials exposed':'Diagnostic local au simulateur · aucun identifiant SensorSphere exposé',
'Simulator API':'API du simulateur','Browser ↔ simulator backend':'Navigateur ↔ serveur du simulateur',
'Netatmo API emulator':'Émulateur API Netatmo','OAuth activity':'Activité OAuth','SensorSphere integration':'Intégration SensorSphere',
'Configure and check in SensorSphere Administration → Netatmo Connections':'Configurer et contrôler dans SensorSphere Administration → Connexions Netatmo',
'OAuth tokens indicate API clients have authenticated, not necessarily that SensorSphere has a configured, active connection. This simulator cannot verify SensorSphere registration.':'Les jetons OAuth prouvent une authentification auprès du simulateur, pas nécessairement une connexion SensorSphere active. Le simulateur ne peut pas vérifier son enregistrement.',
'INDOOR TEMPERATURE':'TEMPÉRATURE INTÉRIEURE','TARGET TEMPERATURE':'TEMPÉRATURE DE CONSIGNE',
'OUTDOOR TEMPERATURE':'TEMPÉRATURE EXTÉRIEURE','BOILER STATUS':'ÉTAT DE LA CHAUDIÈRE',
'Living room':'Salon','Weather simulation':'Simulation météo','Temperature history':'Historique des températures',
'Simulated indoor temperature and target':'Température intérieure simulée et consigne','Measured':'Mesurée','Target':'Consigne',
'Thermostat control':'Commande du thermostat','Apply commands to the simulated heating system':'Appliquer des commandes au chauffage simulé',
'Heating mode':'Mode de chauffage','Scheduled program':'Programme','Manual override':'Forçage manuel','Away':'Absent','Frost protection':'Hors gel',
'Setpoint':'Consigne','Override duration':'Durée du forçage','30 minutes':'30 minutes','1 hour':'1 heure','2 hours':'2 heures','4 hours':'4 heures',
'Apply thermostat command':'Appliquer la commande','Commands affect only the virtual boiler.':'Les commandes agissent uniquement sur la chaudière virtuelle.',
'Simulation engine':'Moteur de simulation','Time increment':'Incrément de temps','6 hours':'6 heures','24 hours':'24 heures',
'▶ Advance simulation':'▶ Avancer la simulation','Auto clock speed':'Vitesse de l’horloge automatique','Paused':'En pause',
'Apply clock speed':'Appliquer la vitesse','Indoor temperature':'Température intérieure','Set indoor temperature':'Définir la température intérieure',
'Outside temperature':'Température extérieure','Update outdoor temperature':'Modifier la température extérieure',
'Fault injection':'Injection de pannes','Test failure and recovery scenarios':'Tester les pannes et leur rétablissement',
'Window open':'Fenêtre ouverte','Insulation':'Isolation','Heating power':'Puissance de chauffage',
'Relay online':'Relais connecté','Boiler failure':'Panne chaudière','Battery level':'Niveau de batterie',
'Apply fault scenario':'Appliquer le scénario de panne','Scenario presets':'Scénarios prédéfinis',
'Reset the simulated home and load a reproducible test situation':'Réinitialiser la maison et charger une situation reproductible',
'Scenario':'Scénario','Normal operation':'Fonctionnement normal','Cold snap':'Vague de froid','Open window':'Fenêtre ouverte',
'Relay disconnected':'Relais déconnecté','Low battery':'Batterie faible','API unavailable (503)':'API indisponible (503)',
'API rate limited (429)':'API limitée (429)','Load scenario':'Charger le scénario','API response simulation':'Simulation des réponses API',
'Normal':'Normal','503 Service unavailable':'503 Service indisponible','429 Rate limited':'429 Limite de requêtes',
'401 Unauthorized':'401 Non autorisé','Apply API fault':'Appliquer la panne API',
'Fault injection affects /api/* endpoints, not /sim/* controls.':'Les pannes affectent /api/*, pas les commandes /sim/*.',
'Weekly schedule':'Programme hebdomadaire','Seven days · one temperature profile per day · virtual day 1 = Monday':'Sept jours · un profil de température par jour · jour virtuel 1 = lundi',
'Day':'Jour','Monday':'Lundi','Tuesday':'Mardi','Wednesday':'Mercredi','Thursday':'Jeudi',
'Friday':'Vendredi','Saturday':'Samedi','Sunday':'Dimanche','Periods (HH:MM=°C, one per line)':'Périodes (HH:MM=°C, une par ligne)',
'Save day schedule':'Enregistrer le programme','Event log':'Journal des événements',
'Local UI activity and API responses':'Activité locale et réponses API','Clear':'Effacer',
'Simulator events':'Événements du simulateur',
'SensorSphere Netatmo Simulator · Offline test environment · No physical heating connection':'Simulateur Netatmo SensorSphere · Environnement de test isolé · Aucun chauffage réel connecté',
'Connected':'Connecté','Ready':'Prêt','Active access tokens':'Jetons d’accès actifs',
'No active access tokens':'Aucun jeton d’accès actif','Authorization pending':'Autorisation en attente',
'Not verifiable here':'Non vérifiable ici','Unavailable':'Indisponible','Error':'Erreur',
'Checking…':'Vérification…','Heating duration:':'Durée de chauffe :','Fault mode:':'Mode de panne :','API requests:':'Requêtes API :',
'Access:':'Accès :','Refresh:':'Renouvellement :','Pending codes:':'Codes en attente :'
};
const originalText=new WeakMap();
function localize(){
 const lang=$('ui-language').value;
 document.documentElement.lang=lang;
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 let node;
 while((node=walker.nextNode())){
  if(node.parentElement?.closest('#log,#sim-events,#chart,#instance-details'))continue;
  if(!originalText.has(node))originalText.set(node,node.textContent);
  const original=originalText.get(node);
  const trimmed=original.trim();
  if(!trimmed||!translations[trimmed])continue;
  node.textContent=original.replace(trimmed,lang==='fr'?translations[trimmed]:trimmed);
 }
 for(const id of ['sim-api-status','netatmo-api-status','oauth-status','sensorsphere-status']){
  const el=$(id);if(!el)continue;
  if(!el.dataset.sourceEn||el.dataset.lang!==lang){
   const en=Object.entries(translations).find(([,fr])=>fr===el.textContent)?.[0]||el.textContent;
   el.dataset.sourceEn=en;
  }
  el.textContent=lang==='fr'?(translations[el.dataset.sourceEn]||el.dataset.sourceEn):el.dataset.sourceEn;
  el.dataset.lang=lang;
 }
}
translations['● Paused']='● En pause';translations['● Running']='● En marche';
translations['Accelerated heat loss']='Perte de chaleur accélérée';translations['Communication with thermostat']='Communication avec le thermostat';translations['Prevent heating despite demand']='Empêche le chauffage malgré la demande';translations['Adjusting setpoint selects manual override; click Apply to save.']='Modifier la consigne sélectionne le mode manuel ; cliquer sur Appliquer pour enregistrer.';translations['Current virtual day and time']='Jour et heure virtuels actuels';translations['Go to day and time']='Aller au jour et à l’heure';
const selectedLanguage=localStorage.getItem(localeKey);
$('ui-language').value=selectedLanguage==='fr'?'fr':'en';
$('ui-language').addEventListener('change',()=>{localStorage.setItem(localeKey,$('ui-language').value);localize();});
const originalClockIndicator=updateClockIndicator;updateClockIndicator=function(speed){originalClockIndicator(speed);if($('ui-language').value==='fr')$('clock-status').textContent=speed>0?'● En marche ×'+speed:'● En pause';};
const setStatusBase=setStatus;
setStatus=function(id,label,severity){setStatusBase(id,label,severity);const element=$(id);element.dataset.sourceEn=label;element.dataset.lang='en';localize();};
localize();

$('seek-clock').onclick=()=>action('Virtual clock positioned',()=>request('/sim/clock/seek','POST',{day:Number($('seek-day').value),minute:Number($('seek-hour').value)*60+Number($('seek-minute').value)}));
