import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from '../src/server.js';
async function fixture(fn){const server=http.createServer(createApp({adminToken:'admin'}).handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;try{await fn(base);}finally{await new Promise(resolve=>server.close(resolve));}}
async function oauth(base,scope='read_thermostat write_thermostat'){const uri='http://127.0.0.1/callback';const auth=new URL(base+'/oauth2/authorize');auth.searchParams.set('client_id','sim-client');auth.searchParams.set('redirect_uri',uri);auth.searchParams.set('response_type','code');auth.searchParams.set('scope',scope);auth.searchParams.set('state','csrf-test');const r=await fetch(auth,{redirect:'manual'});assert.equal(r.status,302);const location=new URL(r.headers.get('location'));assert.equal(location.searchParams.get('state'),'csrf-test');const form=new URLSearchParams({grant_type:'authorization_code',client_id:'sim-client',client_secret:'sim-secret',redirect_uri:uri,code:location.searchParams.get('code')});const token=await fetch(base+'/oauth2/token',{method:'POST',body:form});assert.equal(token.status,200);return token.json();}
test('OAuth authorization, protected discovery, refresh and code replay',async()=>fixture(async base=>{assert.equal((await fetch(base+'/api/homesdata')).status,401);const token=await oauth(base);const headers={authorization:'Bearer '+token.access_token};const homes=await (await fetch(base+'/api/homesdata',{headers})).json();assert.equal(homes.body.homes[0].modules.length,2);const form=new URLSearchParams({grant_type:'refresh_token',client_id:'sim-client',client_secret:'sim-secret',refresh_token:token.refresh_token});const refreshed=await fetch(base+'/oauth2/token',{method:'POST',body:form});assert.equal(refreshed.status,200);assert.equal((await fetch(base+'/oauth2/token',{method:'POST',body:form})).status,400); }));
test('Read-only scopes prevent heating commands',async()=>fixture(async base=>{const token=await oauth(base,'read_thermostat');const r=await fetch(base+'/api/setthermmode',{method:'POST',headers:{authorization:'Bearer '+token.access_token,'content-type':'application/json'},body:JSON.stringify({home_id:'sim-home-01',mode:'away'})});assert.equal(r.status,403);}));
test('Manual override expires and heating responds to simulated time',async()=>fixture(async base=>{const token=await oauth(base);const headers={authorization:'Bearer '+token.access_token,'content-type':'application/json'};const r=await fetch(base+'/api/setroomthermpoint',{method:'POST',headers,body:JSON.stringify({home_id:'sim-home-01',room_id:'sim-room-01',mode:'manual',temp:23,duration:3600})});assert.equal(r.status,200);assert.equal((await (await fetch(base+'/sim/state',{headers:{'x-sim-token':'admin'}})).json()).mode,'manual');await fetch(base+'/sim/step',{method:'POST',headers:{'content-type':'application/json','x-sim-token':'admin'},body:JSON.stringify({minutes:60})});const state=await (await fetch(base+'/sim/state',{headers:{'x-sim-token':'admin'}})).json();assert.equal(state.mode,'manual');await fetch(base+'/sim/step',{method:'POST',headers:{'content-type':'application/json','x-sim-token':'admin'},body:JSON.stringify({minutes:1})});const after=await (await fetch(base+'/sim/state',{headers:{'x-sim-token':'admin'}})).json();assert.equal(after.mode,'schedule');assert.equal(after.minutes,61);assert.ok(after.heatMinutes>0);}));
test('Admin protection, validation and deterministic reset',async()=>fixture(async base=>{assert.equal((await fetch(base+'/sim/state')).status,403);const headers={'content-type':'application/json','x-sim-token':'admin'};assert.equal((await fetch(base+'/sim/config',{method:'POST',headers,body:JSON.stringify({battery:110})})).status,400);await fetch(base+'/sim/step',{method:'POST',headers,body:JSON.stringify({minutes:5})});const reset=await (await fetch(base+'/sim/reset',{method:'POST',headers})).json();assert.equal(reset.minutes,0);assert.equal(reset.temperature,18.5);}));
test('Web UI assets and mode control are available',async()=>fixture(async base=>{const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/Heating control center/);const js=await fetch(base+'/ui/app.js');assert.equal(js.status,200);assert.match(await js.text(),/temperature/);const css=await fetch(base+'/ui/style.css');assert.equal(css.status,200);const r=await fetch(base+'/sim/mode',{method:'POST',headers:{'content-type':'application/json','x-sim-token':'admin'},body:JSON.stringify({mode:'away'})});assert.equal(r.status,200);assert.equal((await r.json()).setpoint,12);}));
test('Indoor temperature can be set directly and is validated',async()=>fixture(async base=>{const headers={'content-type':'application/json','x-sim-token':'admin'};const set=await fetch(base+'/sim/config',{method:'POST',headers,body:JSON.stringify({temperature:16.5})});assert.equal(set.status,200);assert.equal((await set.json()).temperature,16.5);const bad=await fetch(base+'/sim/config',{method:'POST',headers,body:JSON.stringify({temperature:100})});assert.equal(bad.status,400);const current=await (await fetch(base+'/sim/state',{headers})).json();assert.equal(current.temperature,16.5);}));
test('Weekly schedule transitions, validation and heating loss scenario',async()=>fixture(async base=>{const headers={'content-type':'application/json','x-sim-token':'admin'};const api=(p,body)=>fetch(base+p,{method:'POST',headers,body:JSON.stringify(body)});const days=Array.from({length:7},()=>[{minute:0,temp:16},{minute:60,temp:23}]);assert.equal((await api('/sim/schedule',{days})).status,200);assert.equal((await api('/sim/schedule',{days:[{minute:0,temp:12}]})).status,400);await api('/sim/step',{minutes:61});const s=await (await fetch(base+'/sim/state',{headers})).json();assert.equal(s.setpoint,23);assert.equal(s.minutes,61);await api('/sim/config',{temperature:20,outside:0,windowOpen:true,boilerFault:true});await api('/sim/step',{minutes:10});const after=await (await fetch(base+'/sim/state',{headers})).json();assert.ok(after.temperature<19);assert.equal(after.heating,false);}));
test('Clock starts, rejects invalid speeds and pauses',async()=>fixture(async base=>{const headers={'content-type':'application/json','x-sim-token':'admin'};const api=(body)=>fetch(base+'/sim/clock',{method:'POST',headers,body:JSON.stringify(body)});assert.equal((await api({speed:2})).status,400);const started=await (await api({speed:60})).json();assert.equal(started.running,true);assert.equal(started.speed,60);const stopped=await (await api({speed:0})).json();assert.equal(stopped.running,false);}));
test('Scenario presets reset state, change environment and generate events',async()=>fixture(async base=>{const headers={'content-type':'application/json','x-sim-token':'admin'};const post=(path,body)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});assert.equal((await post('/sim/scenario',{name:'invalid'})).status,400);await post('/sim/step',{minutes:10});const r=await post('/sim/scenario',{name:'cold_snap'});assert.equal(r.status,200);const state=await r.json();assert.equal(state.minutes,0);assert.equal(state.outside,-15);const events=await (await fetch(base+'/sim/events',{headers})).json();assert.ok(events.events.some(e=>e.type==='scenario'));const window=await (await post('/sim/scenario',{name:'open_window'})).json();assert.equal(window.windowOpen,true);const boiler=await (await post('/sim/scenario',{name:'boiler_failure'})).json();assert.equal(boiler.boilerFault,true);}));
test('API fault injection affects only Netatmo endpoints and can recover',async()=>fixture(async base=>{const headers={'content-type':'application/json','x-sim-token':'admin'};const post=(path,body)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});const token=await oauth(base);const auth={authorization:'Bearer '+token.access_token};for(const [mode,status] of [['unavailable',503],['rate_limit',429],['unauthorized',401]]){assert.equal((await post('/sim/api-fault',{mode})).status,200);const r=await fetch(base+'/api/homesdata',{headers:auth});assert.equal(r.status,status);if(mode==='rate_limit')assert.equal(r.headers.get('retry-after'),'60');assert.equal((await fetch(base+'/sim/state',{headers})).status,200);}assert.equal((await post('/sim/api-fault',{mode:'bad'})).status,400);await post('/sim/api-fault',{mode:'none'});assert.equal((await fetch(base+'/api/homesdata',{headers:auth})).status,200);const metrics=await (await fetch(base+'/sim/api-fault',{headers})).json();assert.ok(metrics.requests>=4);}));
test('Boiler transitions appear in server-side events',async()=>fixture(async base=>{const headers={'content-type':'application/json','x-sim-token':'admin'};await fetch(base+'/sim/config',{method:'POST',headers,body:JSON.stringify({temperature:14})});await fetch(base+'/sim/step',{method:'POST',headers,body:JSON.stringify({minutes:5})});const events=await (await fetch(base+'/sim/events',{headers})).json();assert.ok(events.events.some(e=>e.type==='boiler'&&e.message==='Boiler ON'));}));

test('Integration diagnostics distinguish simulator, OAuth and unverified SensorSphere status', async () => {
  const {createApp} = await import('../src/server.js');
  const server = (await import('node:http')).createServer(createApp().handler);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/sim/integration-status`);
    assert.equal(response.status,200);
    const status = await response.json();
    assert.equal(status.simulatorApi,'reachable');
    assert.equal(status.oauth.activeAccessTokens,0);
    assert.equal(status.oauth.refreshTokens,0);
    assert.equal(status.sensorSphere.status,'unknown');
    assert.equal(status.netatmoApi.faultMode,'none');
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

test('OAuth errors distinguish invalid client and malformed authorization',async()=>fixture(async base=>{const url=new URL(base+'/oauth2/authorize');url.searchParams.set('client_id','wrong');url.searchParams.set('response_type','code');url.searchParams.set('redirect_uri','https://example.org/callback');const invalid=await fetch(url);assert.equal(invalid.status,401);assert.deepEqual(await invalid.json(),{error:'invalid_client',error_description:'Unknown OAuth client ID'});url.searchParams.set('client_id','sim-client');url.searchParams.set('response_type','token');const malformed=await fetch(url);assert.equal(malformed.status,400);assert.equal((await malformed.json()).error,'unsupported_response_type');}));

test('Only OAuth-authorized clients may report integration activity',async()=>fixture(async base=>{
  const body={connectionId:'sim-01',operation:'collection',assets:1,observations:6};
  const send=(authorization,payload)=>fetch(base+'/api/integration-report',{method:'POST',headers:{'content-type':'application/json',...(authorization?{authorization}:{})},body:JSON.stringify(payload)});
  assert.equal((await send(null,body)).status,401);
  const token=await oauth(base,'read_thermostat');
  const authorization='Bearer '+token.access_token;
  assert.equal((await send(authorization,{...body,connectionId:'sim-02'})).status,400);
  assert.equal((await send(authorization,{...body,observations:-1})).status,400);
  assert.equal((await send(authorization,body)).status,200);
  const status=await (await fetch(base+'/sim/integration-status',{headers:{'x-sim-token':'admin'}})).json();
  assert.equal(status.sensorSphere.status,'client_reported');
  assert.equal(status.sensorSphere.observations,6);
  assert.equal(status.sensorSphere.source,'oauth_authenticated_client');
}));

test('Automatic clock speed persists across process restart, including pause',async()=>{
  const {mkdtemp,readFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const directory=await mkdtemp(join(tmpdir(),'netatmo-clock-'));
  const previous=process.env.SIM_OAUTH_STATE_FILE;
  process.env.SIM_OAUTH_STATE_FILE=join(directory,'oauth.json');
  async function appRun(fn){
    const server=http.createServer(createApp({adminToken:'admin'}).handler);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url='http://127.0.0.1:'+server.address().port;
    try{await fn(url);}finally{await new Promise(resolve=>server.close(resolve));}
  }
  const current=async url=>(await (await fetch(url+'/sim/clock',{headers:{'x-sim-token':'admin'}})).json());
  const change=async(url,speed)=>fetch(url+'/sim/clock',{method:'POST',headers:{'content-type':'application/json','x-sim-token':'admin'},body:JSON.stringify({speed})});
  try{
    await appRun(async url=>{assert.equal((await change(url,60)).status,200);assert.equal((await current(url)).speed,60);});
    assert.equal(JSON.parse(await readFile(process.env.SIM_OAUTH_STATE_FILE,'utf8')).clockSpeed,60);
    await appRun(async url=>{
      for(let i=0;i<30&&(await current(url)).speed!==60;i++)await new Promise(resolve=>setTimeout(resolve,10));
      assert.deepEqual(await current(url),{running:true,speed:60});
      assert.equal((await change(url,0)).status,200);
    });
    await appRun(async url=>{
      await new Promise(resolve=>setTimeout(resolve,20));
      assert.deepEqual(await current(url),{running:false,speed:0});
    });
  }finally{if(previous===undefined)delete process.env.SIM_OAUTH_STATE_FILE;else process.env.SIM_OAUTH_STATE_FILE=previous;await rm(directory,{recursive:true,force:true});}
});
