const FRA = { lat: 50.0379, lon: 8.5622 };
const ADSB_API_URL = 'https://api.adsb.lol/v2/lat/50.0379/lon/8.5622/dist/80';
const API_URL = `https://developerlab.dev/api/proxy?url=${encodeURIComponent(ADSB_API_URL)}`;
const layer = document.querySelector('#aircraftLayer');
const radar = document.querySelector('#radar');
const selected = { value: null };
function cleanFlight(a) { return (a.flight || a.callsign || a.hex || 'UNKNOWN').trim(); }
function distanceNm(lat, lon) { const r=3440.069, dLat=(lat-FRA.lat)*Math.PI/180, dLon=(lon-FRA.lon)*Math.PI/180; const x=dLon*Math.cos((lat+FRA.lat)*Math.PI/360); return Math.sqrt(x*x+dLat*dLat)*r; }
function aircraftType(a) { return a.category === 'A5' || a.category === 'A6' ? 'CARGO' : a.category === 'A7' ? 'OTHER' : 'COMMERCIAL'; }
function pos(a) { const eastNm=(a.lon-FRA.lon)*60*Math.cos(FRA.lat*Math.PI/180), northNm=(a.lat-FRA.lat)*60; return { x:50+(eastNm/80)*50, y:50-(northNm/80)*50 }; }
function fmtAlt(v) { return typeof v === 'number' ? `${Math.round(v).toLocaleString()} FT` : 'GROUND'; }
function fmtSpeed(v) { return typeof v === 'number' ? `${Math.round(v)} KT` : '—'; }
function fmtHeading(v) { return typeof v === 'number' ? `${Math.round(v).toString().padStart(3,'0')}°` : '—'; }

function render(aircraft) {
  layer.innerHTML = '';
  const positionedAircraft = aircraft.filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lon));
  document.querySelector('#aircraftCount').textContent = positionedAircraft.length;
  positionedAircraft.forEach(a => {
    const p=pos(a), el=document.createElement('button');
    el.className='aircraft'; el.type='button'; el.dataset.hex=a.hex || cleanFlight(a); el.style.left=`${p.x}%`; el.style.top=`${p.y}%`; el.style.setProperty('--rotation', `${a.track || 0}deg`);
    const type=aircraftType(a); el.style.setProperty('--aircraft-color', type==='CARGO'?'var(--orange)':type==='OTHER'?'#8c9b9a':'var(--green)');
    el.innerHTML=`<span class="tag">${cleanFlight(a)}</span>`; el.setAttribute('aria-label',`Select aircraft ${cleanFlight(a)}`); el.addEventListener('click',()=>selectAircraft(a,el));
    layer.appendChild(el);
  });
  if (selected.value) { const fresh=aircraft.find(a=>(a.hex||cleanFlight(a))===selected.value.hex); if(fresh) selectAircraft(fresh, layer.querySelector(`[data-hex="${CSS.escape(selected.value.hex)}"]`), false); }
}
function selectAircraft(a, el, scroll=true) {
  selected.value={...a,hex:a.hex||cleanFlight(a)}; document.querySelectorAll('.aircraft').forEach(x=>x.classList.remove('selected')); if(el) el.classList.add('selected');
  document.querySelector('#emptyState').hidden=true; document.querySelector('#aircraftDetails').hidden=false; document.querySelector('#selectionState').textContent='TRACKING';
  document.querySelector('#detailCallsign').textContent=cleanFlight(a); document.querySelector('#detailAdsbLink').href=`https://adsb.lol/?icao=${encodeURIComponent(selected.value.hex)}`; document.querySelector('#detailCategory').textContent=aircraftType(a); document.querySelector('#detailAltitude').textContent=fmtAlt(a.alt_baro); document.querySelector('#detailSpeed').textContent=fmtSpeed(a.gs); document.querySelector('#detailHeading').textContent=fmtHeading(a.track); document.querySelector('#detailSquawk').textContent=a.squawk || '—'; document.querySelector('#detailDistance').textContent=`${distanceNm(a.lat,a.lon).toFixed(1)} NM`; document.querySelector('#detailPosition').textContent=`${Number(a.lat).toFixed(3)}° N  ·  ${Number(a.lon).toFixed(3)}° E`;
  if(scroll && innerWidth<901) document.querySelector('.details-panel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function loadAircraft() {
  const status=document.querySelector('#apiStatus'), label=document.querySelector('#connectionLabel');
  try { const res=await fetch(API_URL,{cache:'no-store'}); if(!res.ok) throw new Error(`HTTP ${res.status}`); const data=await res.json(); const aircraft=(data.ac||[]).filter(a=>a.lat!=null&&a.lon!=null); render(aircraft); label.textContent='LIVE · ADS-B.LOL'; status.textContent=`${aircraft.length} aircraft returned · ${new Date().toLocaleTimeString()}`; document.querySelector('.status-dot').style.background='var(--green)'; }
  catch(err) { render([]); label.textContent='FEED UNAVAILABLE'; status.textContent='Live ADS-B feed unavailable · no aircraft shown'; document.querySelector('.status-dot').style.background='var(--orange)'; }
  document.querySelector('#lastUpdated').textContent=new Date().toLocaleTimeString([], {hour12:false});
}
document.querySelector('#refreshBtn').addEventListener('click',loadAircraft); document.querySelector('#centerBtn').addEventListener('click',()=>{radar.scrollIntoView({behavior:'smooth',block:'center'});});
loadAircraft(); setInterval(loadAircraft,10000);
