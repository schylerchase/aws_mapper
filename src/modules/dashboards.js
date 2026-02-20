// Dashboard components (Compliance, BUDR, Governance, Unified)
// Manages dashboard tabs, filtering, sorting, and rendering
// Extracted from index.html for modularization

// === UNIFIED DASHBOARD TAB REGISTRY ===
var _udashTab = null;
var _UDASH_TABS = [
  {id:'classification', label:'Classification', color:'#a78bfa', icon:'', prereq:function(){
    if(!_rlCtx){_showToast('Render map data first','warn');return false}
    if(!_classificationData.length) runClassificationEngine(_rlCtx);
    return true;
  }, render:function(){ _renderClassificationTab(); }},
  {id:'iam', label:'IAM Review', color:'#f472b6', icon:'', prereq:function(){
    if(!_rlCtx){_showToast('Render map data first','warn');return false}
    if(!_iamReviewData.length){
      try{var iamRaw=safeParse(gv('in_iam'));
      if(iamRaw){var p=parseIAMData(iamRaw);if(p)prepareIAMReviewData(p)}}catch(e){console.warn('IAM parse error in prereq:',e)}
    }
    return true;
  }, render:function(){ _renderIAMTab(); }},
  {id:'compliance', label:'Compliance', color:'#22d3ee', icon:'', prereq:function(){
    if(!_rlCtx){_showToast('Render map data first','warn');return false}
    return true;
  }, render:function(){ _renderCompDash(); }},
  {id:'firewall', label:'Firewall', color:'#f59e0b', icon:'', prereq:function(){
    if(!_rlCtx){_showToast('Render map data first','warn');return false}
    return true;
  }, render:function(){ _renderFirewallTab(); }},
  {id:'budr', label:'BUDR', color:'#10b981', icon:'', prereq:function(){
    if(!_rlCtx){_showToast('Render map data first','warn');return false}
    if(!_budrAssessments||!_budrAssessments.length) runBUDRChecks(_rlCtx);
    if(!_budrAssessments.length){_showToast('No resources to assess');return false}
    return true;
  }, render:function(){ _renderBUDRDash(); }},
  {id:'reports', label:'Reports', color:'#6366f1', icon:'', prereq:function(){ return true; }, render:function(){ _renderReportsTab(); }}
];

function openUnifiedDash(tabId){
  var tab=_UDASH_TABS.find(function(t){return t.id===tabId});
  if(!tab) return;
  if(!tab.prereq()) return;
  var el=document.getElementById('udash');
  var wasOpen=el.classList.contains('open');
  if(wasOpen&&tabId===_udashTab) return;
  _udashTab=tabId;
  // Clean shared areas (prevents stale layout classes, hidden toolbars, wrong footers)
  document.getElementById('udashToolbar').innerHTML='';
  document.getElementById('udashBody').innerHTML='';
  document.getElementById('udashBody').className='udash-body';
  document.getElementById('udashFooter').innerHTML='';
  document.getElementById('udashToolbar').style.display='';
  _govToolbarTab=null;
  _compToolbarTab=null;
  el.classList.add('open');
  if(!wasOpen) el.offsetHeight; // force reflow only on first open
  _renderUdashTabs();
  tab.render();
}

function _switchUdashTab(tabId){
  if(tabId===_udashTab) return;
  var tab=_UDASH_TABS.find(function(t){return t.id===tabId});
  if(!tab||!tab.prereq()) return;
  _udashTab=tabId;
  _renderUdashTabs();
  // Close firewall full panel if open
  document.getElementById('fwFullPanel').classList.remove('open');
  // Clear shared areas
  document.getElementById('udashBody').onclick=null;
  document.getElementById('udashToolbar').innerHTML='';
  document.getElementById('udashBody').innerHTML='';
  document.getElementById('udashBody').className='udash-body';
  document.getElementById('udashFooter').innerHTML='';
  document.getElementById('udashToolbar').style.display='';
  // Reset toolbar tab guards
  _govToolbarTab=null;
  _compToolbarTab=null;
  tab.render();
}

function _renderUdashTabs(){
  var c=document.getElementById('udashTabs');
  c.innerHTML='';
  _UDASH_TABS.forEach(function(t){
    var btn=document.createElement('button');
    btn.className='udash-tab'+(t.id===_udashTab?' active':'');
    btn.style.setProperty('--tab-color',t.color);
    btn.textContent=t.label;
    btn.addEventListener('click',function(){_switchUdashTab(t.id)});
    c.appendChild(btn);
  });
}

function closeUnifiedDash(){
  document.getElementById('udash').classList.remove('open');
  document.getElementById('fwFullPanel').classList.remove('open');
  _udashTab=null;
}

document.getElementById('udashClose').addEventListener('click',closeUnifiedDash);

// === COMPLIANCE DASHBOARD CONTROLS ===
// (Toolbar event listeners are now attached dynamically inside _renderCompDash)

// === BUDR DASHBOARD ===
let _budrDashState={tierFilter:'all',search:'',sort:'tier'};
const _BUDR_TIER_META={
  protected:{name:'Protected',color:'#10b981',icon:''},
  partial:{name:'Partially Protected',color:'#f59e0b',icon:''},
  at_risk:{name:'At Risk',color:'#ef4444',icon:''}
};
function openBUDRDash(){
  _budrDashState={tierFilter:'all',search:'',sort:'tier'};
  openUnifiedDash('budr');
}
function _renderBUDRDash(){
  var tb=document.getElementById('udashToolbar');
  var body=document.getElementById('udashBody');
  var footer=document.getElementById('udashFooter');
  var st=_budrDashState;
  var counts=_getBUDRTierCounts();
  var total=_budrAssessments.length;
  // Toolbar: search + sort + tier pills
  var th='<input id="budrSearch" type="text" placeholder="Filter by name, ID, type..." value="'+_escHtml(st.search)+'" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:4px 10px;border-radius:4px;font-size:11px;font-family:IBM Plex Mono,monospace;width:200px">';
  th+='<select id="budrSort" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-secondary);padding:4px 8px;border-radius:4px;font-size:10px;font-family:IBM Plex Mono,monospace">';
  th+='<option value="tier"'+(st.sort==='tier'?' selected':'')+'>Sort: Tier</option>';
  th+='<option value="name"'+(st.sort==='name'?' selected':'')+'>Sort: Name</option>';
  th+='<option value="type"'+(st.sort==='type'?' selected':'')+'>Sort: Type</option>';
  th+='</select>';
  th+='<div id="budrPills" style="display:flex;gap:4px;margin-left:8px"></div>';
  tb.innerHTML=th;
  // Build tier pills
  var pillBox=document.getElementById('budrPills');
  [{tier:'all',label:'All ('+total+')'},{tier:'protected',label:'Protected ('+counts.protected+')'},{tier:'partial',label:'Partial ('+counts.partial+')'},{tier:'at_risk',label:'At Risk ('+counts.at_risk+')'}].forEach(function(p){
    var btn=document.createElement('span');btn.className='budr-pill'+(st.tierFilter===p.tier?' active':'');
    btn.dataset.tier=p.tier;btn.textContent=p.label;
    btn.addEventListener('click',function(){st.tierFilter=p.tier;_renderBUDRDash()});pillBox.appendChild(btn);
  });
  // Wire toolbar listeners
  document.getElementById('budrSearch').addEventListener('input',function(){st.search=this.value;_renderBUDRDash()});
  document.getElementById('budrSort').addEventListener('change',function(){st.sort=this.value;_renderBUDRDash()});
  // Filter assessments
  var items=_budrAssessments.slice();
  if(st.tierFilter!=='all')items=items.filter(function(a){return a.profile&&a.profile.tier===st.tierFilter});
  if(st.search){var q=st.search.toLowerCase();items=items.filter(function(a){return(a.name||'').toLowerCase().includes(q)||(a.id||'').toLowerCase().includes(q)||(a.type||'').toLowerCase().includes(q)})}
  if(st.sort==='name')items.sort(function(a,b){return(a.name||a.id||'').localeCompare(b.name||b.id||'')});
  else if(st.sort==='type')items.sort(function(a,b){return(a.type||'').localeCompare(b.type||'')});
  // Summary cards
  var h='<div class="budr-summary">';
  ['protected','partial','at_risk'].forEach(function(tier){
    var meta=_BUDR_TIER_META[tier];var c=counts[tier]||0;
    var pct=total>0?Math.round(c/total*100):0;
    h+='<div class="budr-card '+tier+'" data-tier="'+tier+'">';
    h+='<div class="bc-count">'+c+'</div>';
    h+='<div class="bc-label">'+esc(meta.name)+'</div>';
    h+='<div class="bc-rto">'+pct+'% of resources</div>';
    h+='</div>';
  });
  h+='</div>';
  // Group by tier
  var groups={protected:[],partial:[],at_risk:[]};
  items.forEach(function(a){if(a.profile)groups[a.profile.tier].push(a)});
  // Render sections
  ['at_risk','partial','protected'].forEach(function(tier){
    var grp=groups[tier];if(!grp.length)return;
    var meta=_BUDR_TIER_META[tier];
    var collapsed=tier==='protected';
    h+='<div class="budr-section" data-tier="'+tier+'">';
    h+='<div class="budr-section-hdr'+(collapsed?' collapsed':'')+'">';
    h+='<span class="bs-chevron">\u25BC</span>';
    h+='<h3 style="color:'+meta.color+'">'+meta.icon+' '+esc(meta.name)+'</h3>';
    h+='<span class="bs-count">'+grp.length+' resource'+(grp.length!==1?'s':'')+'</span>';
    h+='</div>';
    h+='<div class="budr-section-body"'+(collapsed?' style="display:none"':'')+'>';
    grp.forEach(function(a,i){
      var findings=_budrFindings.filter(function(f){return f.resource===a.id});
      var expanded=tier==='at_risk';
      h+='<div class="budr-res'+(expanded?' expanded':'')+'" data-idx="'+tier+'-'+i+'">';
      h+='<div class="budr-res-hdr">';
      h+='<span class="br-dot '+tier+'"></span>';
      h+='<span class="br-type">'+esc(a.type)+'</span>';
      h+='<span class="br-name">'+esc(a.name)+'</span>';
      h+='<span class="br-rto">RTO: '+esc(a.profile.rto)+' | RPO: '+esc(a.profile.rpo)+'</span>';
      h+='</div>';
      h+='<div class="budr-res-body">';
      // Signals
      if(a.signals){
        h+='<div class="budr-signals">';
        Object.entries(a.signals).forEach(function(entry){
          var k=entry[0],v=entry[1];
          var good=v===true||(typeof v==='number'&&v>1);
          var bad=v===false||v===0;
          var cls=good?'good':bad?'bad':'warn';
          var icon=good?'✓':bad?'✗':'!';
          h+='<span class="budr-sig-badge '+cls+'">'+icon+' '+esc(k)+': '+esc(String(v))+'</span>';
        });
        h+='</div>';
      }
      // Findings for this resource
      if(findings.length){
        h+='<div class="budr-findings">';
        findings.forEach(function(f){
          h+='<div class="budr-finding">';
          h+='<span class="bf-sev '+f.severity+'">'+f.severity+'</span>';
          h+='<span class="bf-msg">'+esc(f.message)+'</span>';
          h+='</div>';
          if(f.remediation)h+='<div class="budr-finding"><span class="bf-sev" style="visibility:hidden">.</span><span class="bf-fix">\u21B3 '+esc(f.remediation)+'</span></div>';
        });
        h+='</div>';
      }
      h+='</div></div>';
    });
    h+='</div></div>';
  });
  if(!items.length)h+='<div style="padding:40px;text-align:center;color:var(--text-muted);font-family:IBM Plex Mono,monospace">No resources match current filter</div>';
  body.innerHTML=h;
  body.scrollTop=0;
  // Event: section collapse
  body.querySelectorAll('.budr-section-hdr').forEach(function(hdr){
    hdr.addEventListener('click',function(){
      var bd=hdr.nextElementSibling;
      if(hdr.classList.contains('collapsed')){hdr.classList.remove('collapsed');bd.style.display=''}
      else{hdr.classList.add('collapsed');bd.style.display='none'}
    });
  });
  // Event: resource card expand
  body.querySelectorAll('.budr-res-hdr').forEach(function(hdr){
    hdr.addEventListener('click',function(){hdr.closest('.budr-res').classList.toggle('expanded')});
  });
  // Event: summary card click = filter
  body.querySelectorAll('.budr-card').forEach(function(card){
    card.addEventListener('click',function(){
      var t=card.dataset.tier;
      st.tierFilter=st.tierFilter===t?'all':t;
      _renderBUDRDash();
    });
  });
  // Footer: item count + export buttons
  var fh='<button id="budrExportCSV">Export CSV</button>';
  fh+='<button id="budrExportJSON">Export JSON</button>';
  if(_isElectron) fh+='<button id="budrExportXLSX">Export XLSX</button>';
  fh+='<span style="margin-left:auto;font-size:10px;color:var(--text-muted)">'+items.length+' of '+total+' resources</span>';
  footer.innerHTML=fh;
  // Wire export listeners
  document.getElementById('budrExportCSV').addEventListener('click',function(){
    if(!_budrAssessments.length){_showToast('No BUDR data');return}
    var csv='Type,Resource,Name,Tier,RTO,RPO,Signals\n';
    _budrAssessments.forEach(function(a){
      var tier=a.profile?a.profile.tier:'unknown';
      var rto=a.profile?a.profile.rto:'';
      var rpo=a.profile?a.profile.rpo:'';
      var sigs=a.signals?Object.entries(a.signals).map(function(e){return e[0]+'='+e[1]}).join('; '):'';
      var ce=function(s){return String(s||'').replace(/"/g,'""')};
      csv+='"'+ce(a.type)+'","'+ce(a.id)+'","'+ce(a.name)+'","'+ce(tier)+'","'+ce(rto)+'","'+ce(rpo)+'","'+ce(sigs)+'"\n';
    });
    downloadBlob(new Blob([csv],{type:'text/csv'}),'budr-assessment.csv');
  });
  document.getElementById('budrExportJSON').addEventListener('click',function(){
    if(!_budrAssessments.length){_showToast('No BUDR data');return}
    var data={timestamp:new Date().toISOString(),summary:_getBUDRTierCounts(),assessments:_budrAssessments,findings:_budrFindings};
    downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'budr-assessment.json');
  });
  var xlsxBtn=document.getElementById('budrExportXLSX');
  if(xlsxBtn) xlsxBtn.addEventListener('click',async function(){
    if(!_budrAssessments.length){_showToast('No BUDR data');return}
    var data={timestamp:new Date().toISOString(),summary:_getBUDRTierCounts(),assessments:_budrAssessments,findings:_budrFindings};
    var jsonStr=JSON.stringify(data,null,2);
    _showToast('Generating XLSX report\u2026');
    try{
      var result=await window.electronAPI.exportBUDRXlsx(jsonStr);
      if(!result){_showToast('Export cancelled');return}
      if(result.error){_showToast('Error: '+result.error,'error');return}
      _showToast('Saved: '+result.path);
    }catch(e){_showToast('XLSX export failed: '+e.message,'error')}
  });
}
// BUDR button
document.getElementById('budrBtn').addEventListener('click',openBUDRDash);

// === GOVERNANCE DASHBOARD ===
function _closeAllDashboardsExcept(keep){_closeAllDashboards(keep)}

function openGovernanceDashboard(tab){
  if(tab==='iam') openUnifiedDash('iam');
  else openUnifiedDash('classification');
}

var _govToolbarTab=null;
var _compToolbarTab=null;

function _renderClassificationTab(){
  var tb=document.getElementById('udashToolbar');
  var body=document.getElementById('udashBody');
  var footer=document.getElementById('udashFooter');
  var st=_govDashState;
  // Toolbar — only rebuild on tab switch
  if(_govToolbarTab!=='classification'){
    _govToolbarTab='classification';
    var th='<label>Search</label>';
    th+='<input id="govSearch" type="text" placeholder="Filter by name, type, VPC..." value="'+_escHtml(st.search)+'">';
    th+='<label>Tier</label>';
    th+='<select id="govFilter">';
    ['all','critical','high','medium','low'].forEach(function(v){th+='<option value="'+v+'"'+(st.filter===v?' selected':'')+'>'+v.charAt(0).toUpperCase()+v.slice(1)+'</option>'});
    th+='</select>';
    th+='<label>Per page</label>';
    th+='<select id="govPerPage">';
    [25,50,100,0].forEach(function(v){th+='<option value="'+v+'"'+(st.perPage===v?' selected':'')+'>'+(v||'All')+'</option>'});
    th+='</select>';
    th+='<button id="govRulesBtn" style="margin-left:auto;background:rgba(139,92,246,.1);border:1px solid #8b5cf6;color:#8b5cf6;padding:4px 12px;border-radius:4px;font-size:10px;font-family:\'IBM Plex Mono\',monospace;cursor:pointer">Configure Rules</button>';
    tb.innerHTML=th;
    document.getElementById('govSearch').addEventListener('input',function(){st.search=this.value;st.page=1;_renderClassificationTab()});
    document.getElementById('govFilter').addEventListener('change',function(){st.filter=this.value;st.page=1;_renderClassificationTab()});
    document.getElementById('govPerPage').addEventListener('change',function(){st.perPage=parseInt(this.value)||0;st.page=1;_renderClassificationTab()});
    document.getElementById('govRulesBtn').addEventListener('click',_openRulesEditor);
  }
  // Summary cards
  var counts={critical:0,high:0,medium:0,low:0};
  _classificationData.forEach(function(r){counts[r.tier]=(counts[r.tier]||0)+1});
  var bh='<div class="gov-tier-cards">';
  [{t:'critical',l:'Critical'},{t:'high',l:'High'},{t:'medium',l:'Medium'},{t:'low',l:'Low'}].forEach(function(d){
    var meta=_TIER_RPO_RTO[d.t];
    bh+='<div class="gov-tier-card" data-gov-tier="'+d.t+'" style="border-color:'+meta.color+'">';
    bh+='<h3 style="color:'+meta.color+'">'+d.l+'</h3>';
    bh+='<div class="gov-tier-count" style="color:'+meta.color+'">'+(counts[d.t]||0)+'</div>';
    bh+='<div class="gov-tier-meta">RPO: '+meta.rpo+' · RTO: '+meta.rto+'</div>';
    bh+='</div>';
  });
  bh+='</div>';
  // Filter + sort
  var items=_classificationData.slice();
  if(st.filter!=='all') items=items.filter(function(r){return r.tier===st.filter});
  if(st.search){var q=st.search.toLowerCase();items=items.filter(function(r){return(r.name||'').toLowerCase().indexOf(q)!==-1||(r.type||'').toLowerCase().indexOf(q)!==-1||(r.id||'').toLowerCase().indexOf(q)!==-1||(r.vpcName||'').toLowerCase().indexOf(q)!==-1})}
  var sortKey=st.sort;var dir=st.sortDir==='asc'?1:-1;
  items.sort(function(a,b){
    if(sortKey==='tier') return((_TIER_RPO_RTO[a.tier]||{priority:99}).priority-(_TIER_RPO_RTO[b.tier]||{priority:99}).priority)*dir;
    var av=(a[sortKey]||'').toLowerCase();var bv=(b[sortKey]||'').toLowerCase();
    return av<bv?-dir:av>bv?dir:0;
  });
  // Paginate
  var perPage=st.perPage<=0?items.length:st.perPage;
  var totalPages=Math.max(1,Math.ceil(items.length/perPage));
  st.page=Math.min(Math.max(1,st.page),totalPages);
  var start=(st.page-1)*perPage;
  var pageItems=items.slice(start,start+perPage);
  // Table
  var cols=[{key:'name',label:'Resource'},{key:'type',label:'Type'},{key:'tier',label:'Tier'},{key:'rpo',label:'RPO',nosort:true},{key:'rto',label:'RTO',nosort:true},{key:'vpcName',label:'VPC'},{key:'auto',label:'Source',nosort:true},{key:'actions',label:'',nosort:true}];
  bh+='<table class="gov-table"><thead><tr>';
  cols.forEach(function(c){
    var cls='';if(!c.nosort&&st.sort===c.key) cls=st.sortDir==='asc'?' sort-asc':' sort-desc';
    bh+='<th'+(c.nosort?'':' data-sort-col="'+c.key+'"')+' class="'+cls+'">'+c.label+'</th>';
  });
  bh+='</tr></thead><tbody>';
  if(!pageItems.length) bh+='<tr><td colspan="'+cols.length+'" style="text-align:center;padding:30px;color:var(--text-muted)">No resources match filters</td></tr>';
  pageItems.forEach(function(r){
    bh+='<tr>';
    bh+='<td><span class="gov-res-link" data-rid="'+_escHtml(r.id)+'" style="color:var(--accent-cyan);cursor:pointer">'+_escHtml(r.name)+'</span></td>';
    bh+='<td>'+_escHtml(r.type)+'</td>';
    bh+='<td><span class="gov-tier-badge '+r.tier+'">'+r.tier+'</span></td>';
    bh+='<td>'+_escHtml(r.rpo)+'</td>';
    bh+='<td>'+_escHtml(r.rto)+'</td>';
    bh+='<td style="font-size:10px;color:var(--text-muted)">'+_escHtml(r.vpcName||'—')+'</td>';
    bh+='<td style="font-size:9px;color:var(--text-muted)">'+(r.auto?'Auto':'<span style="color:#8b5cf6">Manual</span>')+'</td>';
    bh+='<td><select class="gov-override-select" data-res-id="'+_escHtml(r.id)+'">';
    ['critical','high','medium','low'].forEach(function(t){bh+='<option value="'+t+'"'+(r.tier===t?' selected':'')+'>'+t+'</option>'});
    bh+='</select></td>';
    bh+='</tr>';
  });
  bh+='</tbody></table>';
  body.innerHTML=bh;
  body.scrollTop=0;
  // Footer
  var fh='<button id="govExportCSV">Export CSV</button>';
  fh+='<button id="govExportJSON">Export JSON</button>';
  fh+='<span style="margin-left:auto;font-size:10px;color:var(--text-muted)">'+items.length+' of '+_classificationData.length+'</span>';
  if(totalPages>1){
    fh+='<button id="govPrev"'+(st.page<=1?' disabled':'')+'>← Prev</button>';
    fh+='<span style="font-size:10px;color:var(--text-muted)">Page '+st.page+' of '+totalPages+'</span>';
    fh+='<button id="govNext"'+(st.page>=totalPages?' disabled':'')+'>Next →</button>';
  }
  footer.innerHTML=fh;
  // Wire body/footer events (these get recreated each render)
  if(document.getElementById('govPrev')) document.getElementById('govPrev').addEventListener('click',function(){st.page--;_renderClassificationTab()});
  if(document.getElementById('govNext')) document.getElementById('govNext').addEventListener('click',function(){st.page++;_renderClassificationTab()});
  // Sort headers
  body.querySelectorAll('th[data-sort-col]').forEach(function(th){
    th.addEventListener('click',function(){
      var col=this.dataset.sortCol;
      if(st.sort===col) st.sortDir=st.sortDir==='asc'?'desc':'asc';
      else{st.sort=col;st.sortDir='asc'}
      st.page=1;_renderClassificationTab();
    });
  });
  // Tier card clicks
  body.querySelectorAll('.gov-tier-card[data-gov-tier]').forEach(function(card){
    card.addEventListener('click',function(){
      var tier=this.dataset.govTier;
      st.filter=st.filter===tier?'all':tier;
      document.getElementById('govFilter').value=st.filter;
      st.page=1;_renderClassificationTab();
    });
  });
  // Override selects
  body.querySelectorAll('.gov-override-select').forEach(function(sel){
    sel.addEventListener('change',function(){
      var resId=this.dataset.resId;var newTier=this.value;
      _classificationOverrides[resId]=newTier;
      var item=_classificationData.find(function(r){return r.id===resId});
      if(item){item.tier=newTier;item.rpo=_TIER_RPO_RTO[newTier].rpo;item.rto=_TIER_RPO_RTO[newTier].rto;item.auto=false}
      _renderClassificationTab();
    });
  });
  // Resource name clicks → jump to resource on map and open detail panel
  body.querySelectorAll('.gov-res-link').forEach(function(el){el.addEventListener('click',function(e){
    e.stopPropagation();var rid=this.dataset.rid;if(!rid)return;
    closeUnifiedDash();
    setTimeout(function(){_zoomAndShowDetail(rid)},250);
  })});
  // Export
  document.getElementById('govExportCSV').addEventListener('click',function(){
    var rows=[['Resource','Type','Tier','RPO','RTO','Classification','VPC']];
    items.forEach(function(r){rows.push([r.name,r.type,r.tier,r.rpo,r.rto,r.auto?'Auto':'Manual',r.vpcName||''])});
    var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"'}).join(',')}).join('\n');
    downloadBlob(new Blob([csv],{type:'text/csv'}),'asset-classification.csv');
  });
  document.getElementById('govExportJSON').addEventListener('click',function(){
    downloadBlob(new Blob([JSON.stringify(items,null,2)],{type:'application/json'}),'asset-classification.json');
  });
}

function _renderIAMTab(){
  var tb=document.getElementById('udashToolbar');
  var body=document.getElementById('udashBody');
  var footer=document.getElementById('udashFooter');
  var st=_iamDashState;
  // Toolbar — only rebuild on tab switch
  if(_govToolbarTab!=='iam'){
    _govToolbarTab='iam';
    var th='<label>Search</label>';
    th+='<input id="govSearch" type="text" placeholder="Filter by name, ARN, type..." value="'+_escHtml(st.search)+'">';
    th+='<label>Filter</label>';
    th+='<select id="govFilter">';
    [{v:'all',l:'All'},{v:'roles',l:'Roles Only'},{v:'users',l:'Users Only'},{v:'admin',l:'Admin Access'},{v:'findings',l:'With Findings'}].forEach(function(o){
      th+='<option value="'+o.v+'"'+(st.filter===o.v?' selected':'')+'>'+o.l+'</option>';
    });
    th+='</select>';
    th+='<label>Per page</label>';
    th+='<select id="govPerPage">';
    [25,50,100,0].forEach(function(v){th+='<option value="'+v+'"'+(st.perPage===v?' selected':'')+'>'+(v||'All')+'</option>'});
    th+='</select>';
    tb.innerHTML=th;
    document.getElementById('govSearch').addEventListener('input',function(){st.search=this.value;st.page=1;_renderIAMTab()});
    document.getElementById('govFilter').addEventListener('change',function(){st.filter=this.value;st.page=1;_renderIAMTab()});
    document.getElementById('govPerPage').addEventListener('change',function(){st.perPage=parseInt(this.value)||0;st.page=1;_renderIAMTab()});
  }
  if(!_iamReviewData.length){
    body.innerHTML='<div style="text-align:center;padding:60px;color:var(--text-muted);font-family:\'IBM Plex Mono\',monospace"><p style="font-size:14px">No IAM data loaded</p><p style="font-size:11px">Paste IAM auth details (from <code>aws iam get-account-authorization-details</code>) in the IAM section of the left panel, then re-render.</p></div>';
    footer.innerHTML='';
    return;
  }
  // Filter + sort
  var items=_iamReviewData.slice();
  if(st.filter==='roles') items=items.filter(function(r){return r.type==='Role'});
  else if(st.filter==='users') items=items.filter(function(r){return r.type==='User'});
  else if(st.filter==='admin') items=items.filter(function(r){return r.isAdmin});
  else if(st.filter==='findings') items=items.filter(function(r){return r.findings.length>0});
  if(st.search){var q=st.search.toLowerCase();items=items.filter(function(r){return(r.name||'').toLowerCase().indexOf(q)!==-1||(r.arn||'').toLowerCase().indexOf(q)!==-1||(r.type||'').toLowerCase().indexOf(q)!==-1})}
  var sortKey=st.sort;var dir=st.sortDir==='asc'?1:-1;
  items.sort(function(a,b){
    if(sortKey==='lastUsed'||sortKey==='created'){return((a[sortKey]||0)-(b[sortKey]||0))*dir}
    var av=(a[sortKey]||'').toString().toLowerCase();var bv=(b[sortKey]||'').toString().toLowerCase();
    return av<bv?-dir:av>bv?dir:0;
  });
  // Paginate
  var perPage=st.perPage<=0?items.length:st.perPage;
  var totalPages=Math.max(1,Math.ceil(items.length/perPage));
  st.page=Math.min(Math.max(1,st.page),totalPages);
  var start=(st.page-1)*perPage;
  var pageItems=items.slice(start,start+perPage);
  // Summary
  var roleCt=_iamReviewData.filter(function(r){return r.type==='Role'}).length;
  var userCt=_iamReviewData.filter(function(r){return r.type==='User'}).length;
  var adminCt=_iamReviewData.filter(function(r){return r.isAdmin}).length;
  var findCt=_iamReviewData.filter(function(r){return r.findings.length>0}).length;
  var bh='<div class="gov-tier-cards" style="margin-bottom:16px">';
  [{l:'Roles',c:roleCt,color:'#8b5cf6'},{l:'Users',c:userCt,color:'#22d3ee'},{l:'Admin',c:adminCt,color:'#ef4444'},{l:'With Findings',c:findCt,color:'#f59e0b'}].forEach(function(d){
    bh+='<div class="gov-tier-card" style="border-color:'+d.color+'"><h3 style="color:'+d.color+'">'+d.l+'</h3><div class="gov-tier-count" style="color:'+d.color+'">'+d.c+'</div></div>';
  });
  bh+='</div>';
  // Table
  var cols=[{key:'name',label:'Name'},{key:'type',label:'Type'},{key:'created',label:'Created'},{key:'lastUsed',label:'Last Used'},{key:'policies',label:'Policies',nosort:true},{key:'admin',label:'Admin',nosort:true},{key:'findings',label:'Findings',nosort:true},{key:'cross',label:'Cross-Acct',nosort:true}];
  bh+='<table class="gov-table"><thead><tr>';
  cols.forEach(function(c){
    var cls='';if(!c.nosort&&st.sort===c.key) cls=st.sortDir==='asc'?' sort-asc':' sort-desc';
    bh+='<th'+(c.nosort?'':' data-sort-col="'+c.key+'"')+' class="'+cls+'">'+c.label+'</th>';
  });
  bh+='</tr></thead><tbody>';
  if(!pageItems.length) bh+='<tr><td colspan="'+cols.length+'" style="text-align:center;padding:30px;color:var(--text-muted)">No IAM entities match filters</td></tr>';
  pageItems.forEach(function(r,idx){
    var rowId='iam-r-'+idx;
    bh+='<tr data-iam-row="'+rowId+'" style="cursor:pointer">';
    bh+='<td style="color:var(--accent-cyan)">'+_escHtml(r.name)+'</td>';
    bh+='<td>'+_escHtml(r.type)+'</td>';
    bh+='<td style="font-size:10px">'+(r.created?r.created.toISOString().split('T')[0]:'—')+'</td>';
    bh+='<td style="font-size:10px">'+(r.lastUsed?r.lastUsed.toISOString().split('T')[0]:'Never')+'</td>';
    bh+='<td style="text-align:center">'+r.policies+'</td>';
    bh+='<td>'+(r.isAdmin?'<span class="gov-admin-badge">Admin</span>':'—')+'</td>';
    bh+='<td>'+(r.findings.length>0?'<span class="gov-finding-badge">'+r.findings.length+'</span>':'—')+'</td>';
    bh+='<td>'+(r.crossAccounts.length>0?'<span style="color:#f59e0b">'+r.crossAccounts.length+'</span>':'—')+'</td>';
    bh+='</tr>';
    // Expandable detail row
    bh+='<tr><td colspan="'+cols.length+'" class="gov-iam-expand" id="'+rowId+'-exp">';
    bh+='<div style="margin-bottom:6px"><b>ARN:</b> <code style="font-size:10px;background:var(--bg-input);padding:2px 6px;border-radius:3px">'+_escHtml(r.arn)+'</code></div>';
    if(r.policyNames&&r.policyNames.length) bh+='<div style="margin-bottom:6px"><b>Policies:</b> '+r.policyNames.map(function(p){return '<code style="font-size:9px;background:var(--bg-input);padding:1px 4px;border-radius:2px;margin-right:3px">'+_escHtml(p)+'</code>'}).join('')+'</div>';
    if(r.permBoundary) bh+='<div style="margin-bottom:6px"><b>Permission Boundary:</b> <code style="font-size:9px">'+_escHtml(r.permBoundary)+'</code></div>';
    if(r.crossAccounts.length) bh+='<div style="margin-bottom:6px"><b>Cross-Account Trusts:</b> '+r.crossAccounts.map(function(a){return '<code style="font-size:10px;background:rgba(245,158,11,.1);padding:1px 4px;border-radius:2px;margin-right:3px">'+_escHtml(a)+'</code>'}).join('')+'</div>';
    if(r.type==='User'){
      bh+='<div style="margin-bottom:6px"><b>MFA:</b> '+(r.hasMFA?'<span style="color:#10b981">✓ Enabled</span>':'<span style="color:#ef4444">✗ Disabled</span>')+'</div>';
      if(r.hasConsole) bh+='<div style="margin-bottom:6px"><b>Console Access:</b> <span style="color:#f59e0b">Enabled</span></div>';
      if(r.activeKeys) bh+='<div style="margin-bottom:6px"><b>Active Access Keys:</b> '+r.activeKeys+'</div>';
    }
    if(r.findings.length){
      bh+='<div><b>Findings ('+r.findings.length+'):</b><ul style="margin:4px 0 0;padding-left:20px;list-style:none">';
      r.findings.forEach(function(f){
        var sColor=f.severity==='CRITICAL'?'#ef4444':f.severity==='HIGH'?'#f97316':f.severity==='MEDIUM'?'#eab308':'#3b82f6';
        bh+='<li style="font-size:10px;color:var(--text-secondary);margin:3px 0"><span style="font-size:8px;font-weight:700;padding:1px 4px;border-radius:2px;background:rgba(0,0,0,.2);color:'+sColor+';margin-right:4px">'+f.severity+'</span>'+_escHtml(f.message)+'</li>';
      });
      bh+='</ul></div>';
    }
    bh+='</td></tr>';
  });
  bh+='</tbody></table>';
  body.innerHTML=bh;
  body.scrollTop=0;
  // Footer
  var fh='<button id="govExportCSV">Export CSV</button>';
  fh+='<button id="govExportJSON">Export JSON</button>';
  fh+='<span style="margin-left:auto;font-size:10px;color:var(--text-muted)">'+items.length+' of '+_iamReviewData.length+'</span>';
  if(totalPages>1){
    fh+='<button id="govPrev"'+(st.page<=1?' disabled':'')+'>← Prev</button>';
    fh+='<span style="font-size:10px;color:var(--text-muted)">Page '+st.page+' of '+totalPages+'</span>';
    fh+='<button id="govNext"'+(st.page>=totalPages?' disabled':'')+'>Next →</button>';
  }
  footer.innerHTML=fh;
  // Wire body/footer events (these get recreated each render)
  if(document.getElementById('govPrev')) document.getElementById('govPrev').addEventListener('click',function(){st.page--;_renderIAMTab()});
  if(document.getElementById('govNext')) document.getElementById('govNext').addEventListener('click',function(){st.page++;_renderIAMTab()});
  // Sort headers
  body.querySelectorAll('th[data-sort-col]').forEach(function(th){
    th.addEventListener('click',function(){
      var col=this.dataset.sortCol;
      if(st.sort===col) st.sortDir=st.sortDir==='asc'?'desc':'asc';
      else{st.sort=col;st.sortDir='asc'}
      st.page=1;_renderIAMTab();
    });
  });
  // Row expand/collapse
  body.querySelectorAll('tr[data-iam-row]').forEach(function(tr){
    tr.addEventListener('click',function(){
      var rowId=this.dataset.iamRow;
      var exp=document.getElementById(rowId+'-exp');
      if(!exp)return;
      var isOpen=exp.classList.contains('open');
      body.querySelectorAll('.gov-iam-expand').forEach(function(e){e.classList.remove('open')});
      body.querySelectorAll('tr[data-iam-row]').forEach(function(r){r.classList.remove('expanded')});
      if(!isOpen){exp.classList.add('open');this.classList.add('expanded')}
    });
  });
  // Export
  document.getElementById('govExportCSV').addEventListener('click',function(){
    var rows=[['Name','Type','ARN','Created','Last Used','Policies','Admin','Findings','Cross-Account']];
    items.forEach(function(r){rows.push([r.name,r.type,r.arn,r.created?r.created.toISOString():'',r.lastUsed?r.lastUsed.toISOString():'',r.policies,r.isAdmin?'Yes':'No',r.findings.length,r.crossAccounts.join(';')])});
    var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"'}).join(',')}).join('\n');
    downloadBlob(new Blob([csv],{type:'text/csv'}),'iam-review.csv');
  });
  document.getElementById('govExportJSON').addEventListener('click',function(){
    downloadBlob(new Blob([JSON.stringify(items.map(function(r){return{name:r.name,type:r.type,arn:r.arn,created:r.created,lastUsed:r.lastUsed,isAdmin:r.isAdmin,policies:r.policies,policyNames:r.policyNames,crossAccounts:r.crossAccounts,findingCount:r.findings.length}}),null,2)],{type:'application/json'}),'iam-review.json');
  });
}

// Rules editor overlay
function _openRulesEditor(){
  var existing=document.getElementById('govRulesOverlay');
  if(existing) existing.remove();
  // Working copy of rules
  var workRules=JSON.parse(JSON.stringify(_classificationRules));
  workRules.forEach(function(r){if(r.enabled===undefined) r.enabled=true});
  var groupCollapsed={vpc:false,type:false,name:false};
  var scopeLabels={vpc:'VPC Name Rules',type:'Resource Type Rules',name:'Instance Name Rules'};
  var scopeOrder=['vpc','type','name'];
  var overlay=document.createElement('div');
  overlay.id='govRulesOverlay';
  overlay.className='gov-rules-overlay';

  function readRulesFromDom(){
    var rules=[];
    overlay.querySelectorAll('.gov-rule-row[data-rule-idx]').forEach(function(row){
      var idx=parseInt(row.dataset.ruleIdx);
      var r=workRules[idx];if(!r) return;
      r.pattern=row.querySelector('[data-field="pattern"]').value;
      r.scope=row.querySelector('[data-field="scope"]').value;
      r.tier=row.querySelector('[data-field="tier"]').value;
      r.weight=parseInt(row.querySelector('[data-field="weight"]').value)||0;
    });
    return workRules;
  }
  function countMatches(rule){
    if(!rule.pattern||rule.enabled===false) return 0;
    var re;try{re=new RegExp(rule.pattern,'i')}catch(e){return -1}
    var ct=0;
    (_classificationData||[]).forEach(function(res){
      var text='';
      if(rule.scope==='vpc') text=res.vpcName||'';
      else if(rule.scope==='type') text=res.type||'';
      else if(rule.scope==='name') text=res.name||'';
      if(re.test(text)) ct++;
    });
    return ct;
  }
  function buildPreview(rules){
    if(!_rlCtx) return {critical:0,high:0,medium:0,low:0,samples:[]};
    var counts={critical:0,high:0,medium:0,low:0};
    var samples=[];
    var vpcNameMap={};
    (_rlCtx.vpcs||[]).forEach(function(v){vpcNameMap[v.VpcId]=gn(v,v.VpcId)});
    function classify(name,type,vpcName,id){
      var tier=(_classificationOverrides[id]||_scoreClassification(name,type,vpcName,rules).tier);
      counts[tier]=(counts[tier]||0)+1;
      if(samples.length<12) samples.push({name:name,type:type,tier:tier});
    }
    (_rlCtx.instances||[]).forEach(function(inst){
      var name=inst.Tags?((inst.Tags.find(function(t){return t.Key==='Name'})||{}).Value||inst.InstanceId):inst.InstanceId;
      classify(name,'instance',vpcNameMap[inst.VpcId]||'',inst.InstanceId);
    });
    (_rlCtx.rdsInstances||[]).forEach(function(db){classify(db.DBInstanceIdentifier,'rds',vpcNameMap[(db.DBSubnetGroup||{}).VpcId]||'',db.DBInstanceIdentifier)});
    (_rlCtx.ecacheClusters||[]).forEach(function(ec){classify(ec.CacheClusterId,'elasticache','',ec.CacheClusterId)});
    (_rlCtx.albs||[]).forEach(function(alb){classify(alb.LoadBalancerName||'','alb',vpcNameMap[alb.VpcId]||'',alb.LoadBalancerName||'')});
    (_rlCtx.lambdaFns||[]).forEach(function(fn){classify(fn.FunctionName,'lambda',vpcNameMap[(fn.VpcConfig||{}).VpcId]||'',fn.FunctionName)});
    (_rlCtx.ecsServices||[]).forEach(function(svc){classify(svc.serviceName||'','ecs','',svc.serviceName||'')});
    (_rlCtx.redshiftClusters||[]).forEach(function(rs){classify(rs.ClusterIdentifier,'redshift',vpcNameMap[rs.VpcId]||'',rs.ClusterIdentifier)});
    return {critical:counts.critical,high:counts.high,medium:counts.medium,low:counts.low,total:counts.critical+counts.high+counts.medium+counts.low,samples:samples};
  }
  function renderPreview(){
    var el=document.getElementById('govRulesPreview');if(!el) return;
    var rules=readRulesFromDom();
    var p=buildPreview(rules);
    var total=p.total||1;
    var cur={critical:0,high:0,medium:0,low:0};
    _classificationData.forEach(function(r){cur[r.tier]=(cur[r.tier]||0)+1});
    var ph='<div class="gov-preview-card"><h5>Classification Distribution</h5><div class="gov-preview-bars">';
    [{k:'critical',l:'Critical',c:'#ef4444'},{k:'high',l:'High',c:'#f59e0b'},{k:'medium',l:'Medium',c:'#22d3ee'},{k:'low',l:'Low',c:'#64748b'}].forEach(function(d){
      var pct=Math.round((p[d.k]/total)*100);
      ph+='<div class="gov-preview-bar"><span class="gov-preview-bar-label" style="color:'+d.c+'">'+d.l+'</span>';
      ph+='<div class="gov-preview-bar-track"><div class="gov-preview-bar-fill" style="width:'+pct+'%;background:'+d.c+'"></div></div>';
      ph+='<span class="gov-preview-bar-ct">'+p[d.k]+'</span></div>';
    });
    ph+='</div></div>';
    // Delta from current
    var deltas=[];
    [{k:'critical',l:'Critical',c:'#ef4444'},{k:'high',l:'High',c:'#f59e0b'},{k:'medium',l:'Medium',c:'#22d3ee'},{k:'low',l:'Low',c:'#64748b'}].forEach(function(d){
      var diff=p[d.k]-(cur[d.k]||0);
      if(diff!==0) deltas.push('<span style="color:'+d.c+'">'+d.l+': <span class="'+(diff>0?'up':'down')+'">'+(diff>0?'+':'')+diff+'</span></span>');
    });
    if(deltas.length) ph+='<div class="gov-preview-delta">'+deltas.join(' &nbsp; ')+'</div>';
    else ph+='<div class="gov-preview-delta"><span class="same">No changes from current</span></div>';
    // Sample
    ph+='<div class="gov-preview-card" style="margin-top:10px"><h5>Sample Resources</h5><div class="gov-preview-sample">';
    p.samples.forEach(function(s){
      var tc=_TIER_RPO_RTO[s.tier]||{color:'#64748b'};
      ph+='<div class="gov-preview-sample-row"><span class="name">'+_escHtml(s.name)+'</span><span class="type">'+_escHtml(s.type)+'</span><span class="gov-tier-badge '+s.tier+'" style="font-size:8px;padding:1px 5px">'+s.tier+'</span></div>';
    });
    ph+='</div></div>';
    el.innerHTML=ph;
  }
  function renderRules(){
    var list=document.getElementById('govRulesList');if(!list) return;
    var h='';
    scopeOrder.forEach(function(scope){
      var rules=[];workRules.forEach(function(r,i){if(r.scope===scope) rules.push({rule:r,idx:i})});
      if(!rules.length&&scope!=='vpc') return;
      var collapsed=groupCollapsed[scope];
      h+='<div class="gov-rule-group" data-scope="'+scope+'">';
      h+='<div class="gov-rule-group-hdr" data-toggle-scope="'+scope+'"><span class="gov-rule-group-arrow'+(collapsed?' collapsed':'')+'">▼</span>';
      h+='<span class="gov-rule-group-label">'+(scopeLabels[scope]||scope)+'</span>';
      h+='<span class="gov-rule-group-count">'+rules.length+' rule'+(rules.length!==1?'s':'')+'</span></div>';
      h+='<div class="gov-rule-group-body'+(collapsed?' collapsed':'')+'" style="'+(collapsed?'max-height:0':'max-height:9999px')+'">';
      rules.forEach(function(d){
        var r=d.rule;var i=d.idx;
        var isValid=true;try{if(r.pattern) new RegExp(r.pattern,'i')}catch(e){isValid=false}
        var mc=countMatches(r);
        h+='<div class="gov-rule-row'+(r.enabled===false?' disabled':'')+((!isValid)?' invalid':'')+'" data-rule-idx="'+i+'">';
        h+='<span class="gov-rule-drag" title="Drag to reorder">⠿</span>';
        h+='<div class="gov-rule-toggle'+(r.enabled!==false?' on':'')+'" data-toggle-idx="'+i+'" title="'+(r.enabled!==false?'Enabled — click to disable':'Disabled — click to enable')+'"></div>';
        h+='<input class="pattern'+((!isValid)?' invalid-pattern':'')+'" type="text" value="'+_escHtml(r.pattern)+'" data-field="pattern" placeholder="regex pattern…" title="'+((!isValid)?'Invalid regex!':'Regex pattern')+'">';
        h+='<select data-field="scope" style="display:none"><option value="vpc"'+(r.scope==='vpc'?' selected':'')+'>VPC Name</option><option value="type"'+(r.scope==='type'?' selected':'')+'>Type</option><option value="name"'+(r.scope==='name'?' selected':'')+'>Name</option></select>';
        h+='<select data-field="tier"><option value="critical"'+(r.tier==='critical'?' selected':'')+'>Critical</option><option value="high"'+(r.tier==='high'?' selected':'')+'>High</option><option value="medium"'+(r.tier==='medium'?' selected':'')+'>Medium</option><option value="low"'+(r.tier==='low'?' selected':'')+'>Low</option></select>';
        h+='<input class="weight" type="number" value="'+r.weight+'" data-field="weight" title="Weight (higher wins)">';
        h+='<span class="gov-rule-match-ct'+(mc>0?' has-matches':'')+'" title="'+(mc<0?'Invalid regex':mc+' resources match')+'">'+((mc<0)?'!':mc)+'</span>';
        h+='<button class="gov-rule-del" data-del-idx="'+i+'" title="Delete rule">✕</button>';
        h+='</div>';
      });
      h+='<div style="padding:4px 0 8px 34px"><button class="gov-rule-add-scope" data-add-scope="'+scope+'" style="background:none;border:1px dashed var(--border);border-radius:3px;padding:3px 10px;font-size:9px;font-family:\'IBM Plex Mono\',monospace;color:var(--text-muted);cursor:pointer;transition:all .15s">+ Add '+((scopeLabels[scope]||scope).replace(' Rules',''))+' Rule</button></div>';
      h+='</div></div>';
    });
    list.innerHTML=h;
    wireRuleEvents();
  }
  function wireRuleEvents(){
    // Toggle enable/disable
    overlay.querySelectorAll('[data-toggle-idx]').forEach(function(el){
      el.addEventListener('click',function(){
        var idx=parseInt(this.dataset.toggleIdx);
        workRules[idx].enabled=workRules[idx].enabled===false?true:false;
        renderRules();renderPreview();
      });
    });
    // Delete
    overlay.querySelectorAll('[data-del-idx]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var idx=parseInt(this.dataset.delIdx);
        workRules.splice(idx,1);
        renderRules();renderPreview();
      });
    });
    // Group toggle
    overlay.querySelectorAll('[data-toggle-scope]').forEach(function(hdr){
      hdr.addEventListener('click',function(){
        var scope=this.dataset.toggleScope;
        groupCollapsed[scope]=!groupCollapsed[scope];
        renderRules();
      });
    });
    // Add rule per scope
    overlay.querySelectorAll('[data-add-scope]').forEach(function(btn){
      btn.addEventListener('click',function(){
        workRules.push({pattern:'',scope:this.dataset.addScope,tier:'medium',weight:50,enabled:true});
        renderRules();renderPreview();
      });
    });
    // Live preview on input change (debounced)
    var previewTimer;
    overlay.querySelectorAll('.gov-rule-row input,.gov-rule-row select').forEach(function(el){
      el.addEventListener('input',function(){
        var row=this.closest('.gov-rule-row');
        var idx=parseInt(row.dataset.ruleIdx);
        var field=this.dataset.field;
        if(field==='pattern'){
          workRules[idx].pattern=this.value;
          var valid=true;try{if(this.value) new RegExp(this.value,'i')}catch(e){valid=false}
          this.classList.toggle('invalid-pattern',!valid);
          row.classList.toggle('invalid',!valid);
          // Update match count inline
          var mc=countMatches(workRules[idx]);
          var mcEl=row.querySelector('.gov-rule-match-ct');
          if(mcEl){mcEl.textContent=mc<0?'!':mc;mcEl.classList.toggle('has-matches',mc>0)}
        } else if(field==='tier'){
          workRules[idx].tier=this.value;
        } else if(field==='weight'){
          workRules[idx].weight=parseInt(this.value)||0;
        }
        clearTimeout(previewTimer);
        previewTimer=setTimeout(renderPreview,300);
      });
      el.addEventListener('change',function(){
        var row=this.closest('.gov-rule-row');
        var idx=parseInt(row.dataset.ruleIdx);
        var field=this.dataset.field;
        if(field==='tier') workRules[idx].tier=this.value;
        else if(field==='weight') workRules[idx].weight=parseInt(this.value)||0;
        clearTimeout(previewTimer);
        previewTimer=setTimeout(renderPreview,150);
      });
    });
  }

  // Build shell
  var h='<div class="gov-rules-panel">';
  h+='<div class="gov-rules-hdr"><h3>Classification Rules</h3>';
  h+='<div class="gov-rules-hdr-actions">';
  h+='<button id="govRulesImport" title="Import rules from JSON">Import</button>';
  h+='<button id="govRulesExport" title="Export rules as JSON">Export</button>';
  h+='<button id="govRulesClose">Close</button>';
  h+='</div></div>';
  h+='<div class="gov-rules-content">';
  h+='<div class="gov-rules-left"><p style="font-size:10px;color:var(--text-muted);margin:0 0 12px;line-height:1.5">Regex patterns matched against scope. Higher weight wins when multiple rules match. Toggle rules on/off to test without deleting.</p>';
  h+='<div id="govRulesList"></div></div>';
  h+='<div class="gov-rules-right"><h4>Live Preview</h4><div id="govRulesPreview"></div></div>';
  h+='</div>';
  h+='<div class="gov-rules-foot">';
  h+='<button id="govRuleReset">Reset to Defaults</button>';
  h+='<button class="gov-rules-apply" id="govRuleApply">Apply & Re-classify</button>';
  h+='</div></div>';
  overlay.innerHTML=h;
  document.body.appendChild(overlay);
  // Render initial state
  renderRules();
  renderPreview();
  // Shell events
  document.getElementById('govRulesClose').addEventListener('click',function(){overlay.remove()});
  overlay.addEventListener('click',function(e){if(e.target===overlay) overlay.remove()});
  document.getElementById('govRuleReset').addEventListener('click',function(){
    workRules=JSON.parse(JSON.stringify(_DEFAULT_CLASS_RULES));
    workRules.forEach(function(r){r.enabled=true});
    renderRules();renderPreview();
  });
  document.getElementById('govRulesExport').addEventListener('click',function(){
    readRulesFromDom();
    var json=JSON.stringify(workRules,null,2);
    downloadBlob(new Blob([json],{type:'application/json'}),'classification-rules.json');
    _showToast('Rules exported');
  });
  document.getElementById('govRulesImport').addEventListener('click',function(){
    var inp=document.createElement('input');inp.type='file';inp.accept='.json';
    inp.addEventListener('change',function(){
      if(!this.files[0]) return;
      var reader=new FileReader();
      reader.onload=function(e){
        try{
          var imported=JSON.parse(e.target.result);
          if(!Array.isArray(imported)){_showToast('Invalid rules file','warn');return}
          workRules=imported;
          workRules.forEach(function(r){if(r.enabled===undefined) r.enabled=true});
          renderRules();renderPreview();
          _showToast(imported.length+' rules imported');
        }catch(err){_showToast('Failed to parse JSON','warn')}
      };
      reader.readAsText(this.files[0]);
    });
    inp.click();
  });
  document.getElementById('govRuleApply').addEventListener('click',function(){
    readRulesFromDom();
    _classificationRules=workRules.filter(function(r){return r.pattern});
    _classificationOverrides={};
    runClassificationEngine(_rlCtx);
    _govToolbarTab=null;
    overlay.remove();
    _renderClassificationTab();
    _showToast('Rules applied — '+_classificationData.length+' resources re-classified');
  });
}

// Governance event listeners
document.getElementById('govBtn').addEventListener('click',function(){openUnifiedDash('classification')});

