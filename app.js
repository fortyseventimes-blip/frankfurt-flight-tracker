const FRA = { lat: 50.0379, lon: 8.5622 };
let currentRange = 80;
let latestAircraft = [];
let deviceLocation = null;
let geoWatchId = null;
let geoRequestInFlight = false;
const layer = document.querySelector('#aircraftLayer');
const radar = document.querySelector('#radar');
const selected = { value: null };
function cleanFlight(a) { return (a.flight || a.callsign || a.hex || 'UNKNOWN').trim(); }
function distanceNm(lat, lon) { const r=3440.069, dLat=(lat-FRA.lat)*Math.PI/180, dLon=(lon-FRA.lon)*Math.PI/180; const x=dLon*Math.cos((lat+FRA.lat)*Math.PI/360); return Math.sqrt(x*x+dLat*dLat)*r; }
function aircraftType(a) {
  const t=(a.t || '').toUpperCase();
  if (/^(H|R22|R44|EC20|EC30|EC35|EC45|AS50|AS55|AW10|B06|B407|B412)/.test(t)) return 'HELICOPTER';
  if (/^(BALL|BALO|BLN|ZEPH)/.test(t)) return 'AIR BALLOON';
  if (/^(UAV|RQ|MQ|TB2|WZ10|X9)/.test(t)) return 'UAV';
  if (/^(F16|F15|F18|F22|F35|EUFI|RFAL|RAFA|GRIP|MIR4|TORN|SU27|MIG|K35R|K35)/.test(t)) return 'MILITARY JET';
  if (/^(C17|C5|C5M|C130|A400|KC10|KC13|KC46|E3|E8|IL76|AN12|AN26)/.test(t)) return 'MILITARY TRANSPORT';
  if (/^(C1[0-9]{2}|C172|C150|C152|PA|SR|DA|DV20|E55P|FA7X|GLEX|LJ35|PC12|P28A|RV|TBM)/.test(t) || /^A[01]$/.test(a.category || '')) return 'PRIVATE';
  return 'COMMERCIAL';
}
function aircraftIcon(kind) {
  const paths={
    'COMMERCIAL':'<path d="M12 2.5c.8 0 1.2.7 1.3 1.5l.8 6.1 5.1 2.4c.5.2.8.6.8 1.1v.7l-6.2-1.1-.7 7.3 2.1 1.2v.8H8.8v-.8l2.1-1.2-.7-7.3L4 14.3v-.7c0-.5.3-.9.8-1.1l5.1-2.4.8-6.1c.1-.8.5-1.5 1.3-1.5Z"/>',
    'PRIVATE':'<path d="m12 2 1.5 7.2 7.2 3.2v1.2l-6.5-.4-1.3 7.3 2 1.2v.8H9.1v-.8l2-1.2-1.3-7.3-6.5.4v-1.2l7.2-3.2L12 2Z"/>',
    'MILITARY JET':'<path d="m12 2 1.7 7.2 7.3 2.8v1.5l-6.5.4 2.4 6.5-1.1.6-3.8-4-3.8 4-1.1-.6 2.4-6.5-6.5-.4V12l7.3-2.8L12 2Z"/>',
    'MILITARY TRANSPORT':'<path d="M11 2h2l1.1 7.5 5.2 2.2c.5.2.7.6.7 1.1v1l-5.7-.3 1.3 7.5-2.6-1.4L12 16l-1 3.6-2.6 1.4 1.3-7.5-5.7.3v-1c0-.5.2-.9.7-1.1l5.2-2.2L11 2Z"/>',
    'HELICOPTER':'<path d="M4 5h16v1.3H4zM11 6.3h2v5.2h2.4c1.8 0 3.1 1.3 3.1 3.1v1.1h-1.5v-1.1c0-1-.6-1.6-1.6-1.6H13v4.5h3v1.4H8v-1.4h3V13H8.2c-1 0-1.6.6-1.6 1.6v1.1H5.1v-1.1c0-1.8 1.3-3.1 3.1-3.1H11V6.3Z"/>',
    'AIR BALLOON':'<path d="M12 2c4.1 0 6.5 2.8 6.5 6.3 0 3.5-2.4 5.8-5.4 6.5l.5 2.2h1.3v1.4H9.1V17h1.3l.5-2.2c-3-.7-5.4-3-5.4-6.5C5.5 4.8 7.9 2 12 2Z"/>',
    'UAV':'<path d="m12 3 2 5.7 6.5 2.1-.4 1.5-6.2-.5 1.9 6.3-1.2.6-2.6-4.5-2.6 4.5-1.2-.6 1.9-6.3-6.2.5-.4-1.5L10 8.7 12 3Z"/>'
  };
  return `<svg class="aircraft-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[kind] || paths.COMMERCIAL}</svg>`;
}
function pos(a) { const eastNm=(a.lon-FRA.lon)*60*Math.cos(FRA.lat*Math.PI/180), northNm=(a.lat-FRA.lat)*60; return { x:50+(eastNm/currentRange)*50, y:50-(northNm/currentRange)*50 }; }
function fmtAlt(v) { return typeof v === 'number' ? `${Math.round(v).toLocaleString()} FT` : 'GROUND'; }
function fmtSpeed(v) { return typeof v === 'number' ? `${Math.round(v)} KT` : '—'; }
function fmtHeading(v) { return typeof v === 'number' ? `${Math.round(v).toString().padStart(3,'0')}°` : '—'; }

function render(aircraft) {
  latestAircraft = aircraft;
  layer.innerHTML = '';
  const positionedAircraft = aircraft.filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lon));
  document.querySelector('#aircraftCount').textContent = positionedAircraft.length;
  positionedAircraft.forEach(a => {
    const p=pos(a), el=document.createElement('button');
    el.className='aircraft'; el.type='button'; el.dataset.hex=a.hex || cleanFlight(a); el.style.left=`${p.x}%`; el.style.top=`${p.y}%`; el.style.setProperty('--rotation', `${a.track || 0}deg`);
    const type=aircraftType(a); el.style.setProperty('--aircraft-color','#ffffff');
    el.innerHTML=`${aircraftIcon(type)}<span class="tag">${cleanFlight(a)}</span>`; el.setAttribute('aria-label',`Select aircraft ${cleanFlight(a)}`); el.addEventListener('click',()=>selectAircraft(a,el));
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
  const adsbApiUrl=`https://api.adsb.lol/v2/lat/50.0379/lon/8.5622/dist/${currentRange}`;
  const apiUrl=`https://developerlab.dev/api/proxy?url=${encodeURIComponent(adsbApiUrl)}`;
  try { const res=await fetch(apiUrl,{cache:'no-store'}); if(!res.ok) throw new Error(`HTTP ${res.status}`); const data=await res.json(); const aircraft=(data.ac||[]).filter(a=>a.lat!=null&&a.lon!=null); render(aircraft); label.textContent='LIVE · ADS-B.LOL'; status.textContent=`${aircraft.length} aircraft returned · ${new Date().toLocaleTimeString()}`; document.querySelector('.status-dot').style.background='var(--green)'; }
  catch(err) { render([]); label.textContent='FEED UNAVAILABLE'; status.textContent='Live ADS-B feed unavailable · no aircraft shown'; document.querySelector('.status-dot').style.background='var(--orange)'; }
  document.querySelector('#lastUpdated').textContent=new Date().toLocaleTimeString([], {hour12:false});
}
function renderGeoMarker() { if(!deviceLocation) return; const marker=document.querySelector('#geoMarker'), p=pos(deviceLocation), visible=p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100; marker.hidden=!visible; if(visible){marker.style.left=`${p.x}%`; marker.style.top=`${p.y}%`; document.querySelector('#geoStatus').textContent='GPS ACTIVE';} else document.querySelector('#geoStatus').textContent='OUT OF RANGE'; }
function updateRange(value) { currentRange=Math.max(5,Math.min(100,Math.round(Number(value)/5)*5)); document.querySelector('#rangeLabel').textContent=`${currentRange} NM RADIUS`; document.querySelector('#outerRange').textContent=`${currentRange} NM`; document.querySelector('#midRange').textContent=`${Math.max(1,Math.round(currentRange/2))} NM`; document.querySelector('#innerRange').textContent=`${Math.max(1,Math.round(currentRange/4))} NM`; document.querySelector('#detailRange').textContent=`${currentRange} NM`; renderGeoMarker(); }
function enableGeolocation() {
  const button=document.querySelector('#geoBtn'), status=document.querySelector('#geoStatus'), message=document.querySelector('#geoMessage');
  if(!navigator.geolocation){ status.textContent='NOT SUPPORTED'; message.textContent='This browser does not provide device location.'; return; }
  if(!window.isSecureContext){ status.textContent='HTTPS REQUIRED'; message.textContent='Safari requires HTTPS for location. Open the GitHub Pages link, not a local HTTP address.'; return; }
  if(geoWatchId!==null || geoRequestInFlight) return;
  const options={enableHighAccuracy:true,maximumAge:10000,timeout:15000};
  const applyPosition=position=>{
    deviceLocation={lat:position.coords.latitude,lon:position.coords.longitude};
    button.textContent='LOCATION ACTIVE'; status.textContent='GPS ACTIVE'; message.textContent=''; geoRequestInFlight=false; renderGeoMarker();
    if(geoWatchId===null) geoWatchId=navigator.geolocation.watchPosition(applyPosition,handleGeoError,options);
  };
  function handleGeoError(error){
    geoRequestInFlight=false;
    if(error.code===1){ button.textContent='TRY AGAIN'; status.textContent='PERMISSION BLOCKED'; message.textContent='Allow Location for this site in iPhone Settings or Safari website settings, then try again.'; }
    else if(error.code===2){ button.textContent='TRY AGAIN'; status.textContent='UNAVAILABLE'; message.textContent='Location is unavailable. Check iPhone Location Services and try again.'; }
    else { button.textContent='TRY AGAIN'; status.textContent='TIMEOUT'; message.textContent='Location timed out. Try again from a place with a clearer GPS signal.'; }
    if(geoWatchId!==null){ navigator.geolocation.clearWatch(geoWatchId); geoWatchId=null; }
  }
  geoRequestInFlight=true; button.textContent='LOCATING…'; status.textContent='REQUESTING'; message.textContent='';
  navigator.geolocation.getCurrentPosition(applyPosition,handleGeoError, {...options,maximumAge:0});
}
let zoomTimer;
function applyZoom(value) { const next=Math.max(5,Math.min(100,value)); if(next===currentRange) return; updateRange(next); render(latestAircraft); clearTimeout(zoomTimer); zoomTimer=setTimeout(loadAircraft,250); }
const pointers=new Map(); let pinchStartDistance=0; let pinchStartRange=currentRange;
function pointerDistance() { const [a,b]=[...pointers.values()]; return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY); }
radar.addEventListener('wheel',event=>{ event.preventDefault(); applyZoom(currentRange*(event.deltaY<0?.8:1.25)); },{passive:false});
radar.addEventListener('pointerdown',event=>{ pointers.set(event.pointerId,event); radar.setPointerCapture(event.pointerId); if(pointers.size===2){pinchStartDistance=pointerDistance(); pinchStartRange=currentRange;} });
radar.addEventListener('pointermove',event=>{ if(!pointers.has(event.pointerId)) return; pointers.set(event.pointerId,event); if(pointers.size===2 && pinchStartDistance) applyZoom(pinchStartRange*pinchStartDistance/pointerDistance()); });
['pointerup','pointercancel','pointerleave'].forEach(type=>radar.addEventListener(type,event=>{ pointers.delete(event.pointerId); if(pointers.size<2){pinchStartDistance=0; pinchStartRange=currentRange;} }));
document.querySelector('#refreshBtn').addEventListener('click',loadAircraft); document.querySelector('#geoBtn').addEventListener('click',enableGeolocation); document.querySelector('#centerBtn').addEventListener('click',()=>{radar.scrollIntoView({behavior:'smooth',block:'center'});});
updateRange(currentRange);
loadAircraft(); setInterval(loadAircraft,10000);
