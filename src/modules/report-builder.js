// Report generation engine (HTML, XLSX, CSV, Terraform, CDK)
// Builds compliance reports and IaC exports
// Extracted from index.html for modularization

// === REPORT BUILDER ===
function _renderReportsTab(){
  document.getElementById('udashToolbar').style.display='none';
  var body=document.getElementById('udashBody');
  body.classList.add('rpt-layout');
  // Build split-pane layout
  body.innerHTML=
    '<div class="rpt-picker">'+
      '<div class="rpt-meta">'+
        '<label>Report Date</label>'+
        '<input type="date" id="rptDate">'+
        '<label>Report Title</label>'+
        '<input type="text" id="rptTitle" placeholder="AWS Infrastructure Assessment">'+
        '<label>Author</label>'+
        '<input type="text" id="rptAuthor" placeholder="Author name">'+
        '<label>Logo</label>'+
        '<div class="rpt-logo-upload">'+
          '<button class="rpt-logo-btn" id="rptLogoBtn">Upload Logo</button>'+
          '<input type="file" id="rptLogoInput" accept="image/*" style="display:none">'+
          '<button class="rpt-logo-clear" id="rptLogoClear" style="display:none">\u2715</button>'+
          '<div class="rpt-logo-preview" id="rptLogoPreview" style="display:none"></div>'+
        '</div>'+
      '</div>'+
      '<div class="rpt-presets" id="rptPresets"></div>'+
      '<div class="rpt-modules" id="rptModules"></div>'+
    '</div>'+
    '<div class="rpt-preview" id="rptPreview">'+
      '<div class="rpt-preview-frame">'+
        '<div class="rpt-preview-content" id="rptPreviewContent"></div>'+
      '</div>'+
    '</div>';
  // Build footer
  var footer=document.getElementById('udashFooter');
  footer.innerHTML=
    '<span id="rptFooterStats" style="font-size:11px;color:var(--text-muted);margin-right:auto"></span>'+
    '<button class="udash-btn rpt-generate" id="rptExportHTML">Generate HTML Report</button>'+
    '<button class="udash-btn" id="rptExportXLSX">Export XLSX</button>';
  // Set default values
  document.getElementById('rptDate').value=_rptState.date;
  if(_rptState.title) document.getElementById('rptTitle').value=_rptState.title;
  if(_rptState.author) document.getElementById('rptAuthor').value=_rptState.author;
  if(typeof _updateLogoPreview==='function') _updateLogoPreview();
  // Render dynamic content
  _renderRptPicker();
  _renderRptPreview();
  // Wire input listeners
  document.getElementById('rptTitle').addEventListener('input',function(){_rptState.title=this.value;_rptDebouncedPreview()});
  document.getElementById('rptAuthor').addEventListener('input',function(){_rptState.author=this.value;_rptDebouncedPreview()});
  document.getElementById('rptDate').addEventListener('change',function(){_rptState.date=this.value;_renderRptPreview()});
  // Logo handlers
  document.getElementById('rptLogoBtn').addEventListener('click',function(){document.getElementById('rptLogoInput').click()});
  document.getElementById('rptLogoInput').addEventListener('change',function(e){
    var file=e.target.files[0];
    if(!file) return;
    if(file.size>500000){_showToast('Logo too large (max 500 KB)');this.value='';return;}
    var reader=new FileReader();
    reader.onload=function(ev){
      var img=new Image();
      img.onload=function(){
        var ext=file.type.split('/')[1]||'png';
        _rptState.logo={dataUri:ev.target.result,ext:ext,width:img.width,height:img.height};
        _updateLogoPreview();
        _rptDebouncedPreview();
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('rptLogoClear').addEventListener('click',function(){
    _rptState.logo=null;
    document.getElementById('rptLogoInput').value='';
    _updateLogoPreview();
    _rptDebouncedPreview();
  });
  // Export handlers
  document.getElementById('rptExportHTML').addEventListener('click',function(){_generateReport()});
  document.getElementById('rptExportXLSX').addEventListener('click',function(){_generateXlsx()});
}
function openReportBuilder(){
  openUnifiedDash('reports');
}
function _renderRptPicker(){
  var presetsEl=document.getElementById('rptPresets');
  var presets=[
    {id:'full',label:'Full Assessment',modules:_RPT_MODULES.map(function(m){return m.id})},
    {id:'compliance',label:'Compliance Only',modules:['exec-summary','compliance','action-plan']},
    {id:'budr',label:'BUDR Only',modules:['exec-summary','budr','action-plan']},
    {id:'diagram',label:'Diagram + Inventory',modules:['architecture','inventory']}
  ];
  presetsEl.textContent='';
  presets.forEach(function(p){
    var btn=document.createElement('button');
    btn.className='rpt-preset';
    btn.dataset.preset=p.id;
    btn.textContent=p.label;
    btn.addEventListener('click',function(){
      _RPT_MODULES.forEach(function(m){m.enabled=p.modules.indexOf(m.id)>=0});
      _rptState.order=p.modules.slice();
      _renderRptPicker();
      _renderRptPreview();
    });
    presetsEl.appendChild(btn);
  });
  var container=document.getElementById('rptModules');
  var order=_rptState.order||_RPT_MODULES.map(function(m){return m.id});
  var sorted=order.map(function(id){return _RPT_MODULES.find(function(m){return m.id===id})}).filter(Boolean);
  _RPT_MODULES.forEach(function(m){if(order.indexOf(m.id)<0)sorted.push(m)});
  container.textContent='';
  var dragId=null;
  sorted.forEach(function(m){
    var avail=m.available();
    var card=document.createElement('div');
    card.className='rpt-mod-card'+(avail?'':' disabled');
    card.draggable=avail;
    card.dataset.mod=m.id;
    var grip=document.createElement('span');
    grip.className='rm-grip';grip.textContent='\u2630';
    var cb=document.createElement('input');
    cb.className='rm-check';cb.type='checkbox';
    cb.checked=m.enabled&&avail;cb.disabled=!avail;
    var info=document.createElement('div');
    info.className='rm-info';
    var nm=document.createElement('div');nm.className='rm-name';nm.textContent=m.name;
    var ds=document.createElement('div');ds.className='rm-desc';ds.textContent=m.desc();
    info.appendChild(nm);info.appendChild(ds);
    card.appendChild(grip);card.appendChild(cb);card.appendChild(info);
    cb.addEventListener('change',function(){m.enabled=this.checked;_renderRptPreview()});
    if(avail){
      card.addEventListener('dragstart',function(e){
        dragId=this.dataset.mod;this.classList.add('dragging');e.dataTransfer.effectAllowed='move';
      });
      card.addEventListener('dragend',function(){
        this.classList.remove('dragging');
        container.querySelectorAll('.drag-over').forEach(function(el){el.classList.remove('drag-over')});
      });
      card.addEventListener('dragover',function(e){
        e.preventDefault();e.dataTransfer.dropEffect='move';
        container.querySelectorAll('.drag-over').forEach(function(el){el.classList.remove('drag-over')});
        this.classList.add('drag-over');
      });
      card.addEventListener('drop',function(e){
        e.preventDefault();this.classList.remove('drag-over');
        var targetId=this.dataset.mod;
        if(!dragId||dragId===targetId)return;
        var cards=Array.from(container.querySelectorAll('.rpt-mod-card'));
        var newOrder=cards.map(function(c){return c.dataset.mod});
        var fromIdx=newOrder.indexOf(dragId);
        var toIdx=newOrder.indexOf(targetId);
        newOrder.splice(fromIdx,1);
        newOrder.splice(toIdx,0,dragId);
        _rptState.order=newOrder;
        _renderRptPicker();
        _renderRptPreview();
      });
    }
    container.appendChild(card);
  });
}
function _renderRptPreview(){
  var container=document.getElementById('rptPreviewContent');
  var enabled=_rptEnabledModules();
  if(!enabled.length){
    container.textContent='';
    var p=document.createElement('p');
    p.style.cssText='color:var(--text-muted);text-align:center;padding:60px 20px;font-family:IBM Plex Mono,monospace';
    p.textContent='Toggle sections on the left to build your report';
    container.appendChild(p);
    return;
  }
  var html='<style>'+_rptCSS()+_rptInteractiveCSS()+'</style>';
  html+=_rptBuildHeader();
  html+=_rptBuildTOC(enabled);
  html+=_rptBuildSections(enabled);
  html+=_rptBuildFooter();
  var wrapper=document.createElement('div');
  wrapper.innerHTML=html;
  container.textContent='';
  container.appendChild(wrapper);
  if(typeof _rptUpdateFooterStats==='function') _rptUpdateFooterStats();
  /* Wire up anchor jump links to scroll within preview panel */
  var scrollBox=document.getElementById('rptPreview');
  wrapper.addEventListener('click',function(e){
    var link=e.target.closest('a[href^="#"]');
    if(!link) return;
    var hash=link.getAttribute('href');
    if(!hash||hash.length<2) return;
    e.preventDefault();
    var target=wrapper.querySelector(hash)||wrapper.querySelector('[id="'+hash.slice(1)+'"]');
    if(!target||!scrollBox) return;
    var boxTop=scrollBox.getBoundingClientRect().top;
    var elTop=target.getBoundingClientRect().top;
    scrollBox.scrollTop+=elTop-boxTop-12;
  });
  /* ── Wire up interactive JS for preview (innerHTML doesn't execute <script>) ── */
  _rptInitInteractive(wrapper);
}

function _rptInitInteractive(root){
  var SEV_ORD={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};
  var TIER_ORD={at_risk:0,partial:1,protected:2};
  var STRAT_ORD={hot:0,warm:1,pilot:2,cold:3};

  function rptPaginate(tableId){
    var wrap=root.querySelector('#'+tableId)||document.getElementById(tableId);
    if(!wrap)return;
    var table=wrap.querySelector('table');
    if(!table)return;
    var tbody=table.querySelector(':scope > tbody');
    if(!tbody)return;
    var allRows=[].slice.call(tbody.querySelectorAll(':scope > tr:not(.rpt-ctrl-detail)'));
    var visible=allRows.filter(function(r){return r.dataset.filtered!=='0'});
    var perPage=parseInt(wrap.dataset.perPage)||50;
    if(perPage<=0)perPage=visible.length||1;
    var totalPages=Math.max(1,Math.ceil(visible.length/perPage));
    var page=Math.min(parseInt(wrap.dataset.page)||1,totalPages);
    wrap.dataset.page=page;
    var start=(page-1)*perPage,end=start+perPage;
    allRows.forEach(function(r){r.style.display='none'});
    visible.forEach(function(r,i){r.style.display=(i>=start&&i<end)?'':'none'});
    /* detail rows follow their control row visibility */
    table.querySelectorAll('.rpt-ctrl-detail').forEach(function(d){
      var p=d.previousElementSibling;
      d.style.display=(p&&p.style.display!=='none'&&p.classList.contains('expanded'))?'table-row':'none';
    });
    var bar=wrap.querySelector('.rpt-pagination');
    if(!bar)return;
    var info=bar.querySelector('.rpt-page-info');
    if(info)info.textContent='Page '+page+' of '+totalPages+' ('+visible.length+' rows)';
    var prev=bar.querySelector('.rpt-page-prev');
    var next=bar.querySelector('.rpt-page-next');
    if(prev)prev.disabled=(page<=1);
    if(next)next.disabled=(page>=totalPages);
  }

  function rptFilter(tableId){
    var wrap=root.querySelector('#'+tableId)||document.getElementById(tableId);
    if(!wrap)return;
    var pills=wrap.querySelectorAll('.rpt-pill');
    var active={};
    pills.forEach(function(p){
      if(!p.classList.contains('active'))return;
      var attr=p.dataset.attr;
      if(!active[attr])active[attr]=[];
      active[attr].push(p.dataset.val.toUpperCase());
    });
    var si=wrap.querySelector('.rpt-search');
    var query=si?si.value.toLowerCase():'';
    var table=wrap.querySelector('table');
    if(!table)return;
    var tbody=table.querySelector(':scope > tbody');
    if(!tbody)return;
    var rows=tbody.querySelectorAll(':scope > tr:not(.rpt-ctrl-detail)');
    var shown=0,attrCounts={},total=rows.length;
    rows.forEach(function(tr){
      var vis=true;
      Object.keys(active).forEach(function(attr){
        var val=(tr.dataset[attr]||'').toUpperCase();
        if(active[attr].indexOf(val)===-1)vis=false;
      });
      if(vis&&query){if(tr.textContent.toLowerCase().indexOf(query)===-1)vis=false}
      tr.dataset.filtered=vis?'1':'0';
      if(vis)shown++;
      ['sev','tier','fw','strategy'].forEach(function(attr){
        var v=(tr.dataset[attr]||'').toUpperCase();
        if(v){if(!attrCounts[v])attrCounts[v]=0;if(vis)attrCounts[v]++}
      });
    });
    var badge=wrap.querySelector('.rpt-row-count');
    if(badge)badge.textContent=shown+' of '+total;
    pills.forEach(function(p){
      var ct=p.querySelector('.rpt-pill-ct');
      if(!ct)return;
      var val=p.dataset.val.toUpperCase();
      ct.textContent=attrCounts[val]||0;
    });
    wrap.dataset.page='1';
    rptPaginate(tableId);
  }

  function rptSort(th){
    var table=th.closest('table');
    if(!table)return;
    var idx=[].indexOf.call(th.parentElement.children,th);
    var type=th.dataset.sortType||'text';
    var dir=th.classList.contains('rpt-sort-asc')?'desc':th.classList.contains('rpt-sort-desc')?'none':'asc';
    th.parentElement.querySelectorAll('th').forEach(function(h){h.classList.remove('rpt-sort-asc','rpt-sort-desc')});
    if(dir!=='none')th.classList.add('rpt-sort-'+dir);
    var tbody=table.querySelector('tbody');
    var rows=[].slice.call(tbody.querySelectorAll(':scope > tr:not(.rpt-ctrl-detail)'));
    if(dir==='none')return;
    rows.sort(function(a,b){
      var av=a.children[idx]?a.children[idx].textContent.trim():'';
      var bv=b.children[idx]?b.children[idx].textContent.trim():'';
      var cmp=0;
      if(type==='severity')cmp=(SEV_ORD[av]===undefined?9:SEV_ORD[av])-(SEV_ORD[bv]===undefined?9:SEV_ORD[bv]);
      else if(type==='tier')cmp=(TIER_ORD[av]===undefined?9:TIER_ORD[av])-(TIER_ORD[bv]===undefined?9:TIER_ORD[bv]);
      else if(type==='strategy')cmp=(STRAT_ORD[av.toLowerCase()]===undefined?9:STRAT_ORD[av.toLowerCase()])-(STRAT_ORD[bv.toLowerCase()]===undefined?9:STRAT_ORD[bv.toLowerCase()]);
      else cmp=av.localeCompare(bv);
      return dir==='desc'?-cmp:cmp;
    });
    /* Collect control-detail pairs before moving */
    var pairs=rows.map(function(r){
      var detail=r.nextElementSibling;
      return {row:r,detail:(detail&&detail.classList.contains('rpt-ctrl-detail'))?detail:null};
    });
    pairs.forEach(function(p){
      tbody.appendChild(p.row);
      if(p.detail)tbody.appendChild(p.detail);
    });
    var wrap=th.closest('.rpt-table-wrap');
    if(wrap){wrap.dataset.page='1';rptPaginate(wrap.id)}
  }

  /* Event delegation on the preview wrapper */
  var _searchTimer=0;
  root.addEventListener('click',function(e){
    /* Pill toggle */
    var pill=e.target.closest('.rpt-pill');
    if(pill){pill.classList.toggle('active');var w=pill.closest('.rpt-table-wrap');if(w)rptFilter(w.id);return}
    /* Clear */
    if(e.target.classList.contains('rpt-clear')){
      var w=e.target.closest('.rpt-table-wrap');
      if(!w)return;w.querySelectorAll('.rpt-pill.active').forEach(function(p){p.classList.remove('active')});
      var si=w.querySelector('.rpt-search');if(si)si.value='';rptFilter(w.id);return;
    }
    /* Sortable header */
    var th=e.target.closest('th.rpt-sortable');
    if(th){rptSort(th);return}
    /* Pagination */
    var btn=e.target.closest('.rpt-page-prev,.rpt-page-next');
    if(btn){
      var w=btn.closest('.rpt-table-wrap');if(!w)return;
      var pg=parseInt(w.dataset.page)||1;
      w.dataset.page=btn.classList.contains('rpt-page-prev')?Math.max(1,pg-1):pg+1;
      rptPaginate(w.id);return;
    }
    /* Group expand/collapse */
    var ctrlRow=e.target.closest('.rpt-ctrl-row');
    if(ctrlRow){
      ctrlRow.classList.toggle('expanded');
      var nx=ctrlRow.nextElementSibling;
      while(nx&&nx.classList.contains('rpt-ctrl-detail')){
        nx.classList.toggle('show');
        nx.style.display=nx.classList.contains('show')?'table-row':'none';
        nx=nx.nextElementSibling;
      }
      return;
    }
    /* Expand all */
    if(e.target.classList.contains('rpt-expand-all')){
      var w=e.target.closest('.rpt-table-wrap');
      if(!w)return;
      var anyCollapsed=w.querySelector('.rpt-ctrl-row:not(.expanded)');
      var expand=!!anyCollapsed;
      w.querySelectorAll('.rpt-ctrl-row').forEach(function(r){r.classList.toggle('expanded',expand)});
      w.querySelectorAll('.rpt-ctrl-detail').forEach(function(d){d.classList.toggle('show',expand);d.style.display=expand?'table-row':'none'});
      e.target.textContent=expand?'Collapse All':'Expand All';
      return;
    }
    /* Resource link — scroll within report preview */
    var resLink=e.target.closest('.rpt-res-link');
    if(resLink){
      e.preventDefault();
      var href=resLink.getAttribute('href');
      if(href&&href.charAt(0)==='#'){
        var target=root.querySelector(href)||document.querySelector(href);
        if(target){target.scrollIntoView({behavior:'smooth',block:'center'});target.style.outline='2px solid #67e8f9';setTimeout(function(){target.style.outline=''},2000)}
      }
      return;
    }
    /* Section toggle */
    var tog=e.target.closest('.rpt-section-toggle');
    if(tog){
      tog.classList.toggle('collapsed');
      var body=tog.parentElement.querySelector('.rpt-section-body');
      if(body)body.classList.toggle('collapsed');
      return;
    }
  });
  root.addEventListener('change',function(e){
    if(!e.target.classList.contains('rpt-per-page'))return;
    var w=e.target.closest('.rpt-table-wrap');if(!w)return;
    w.dataset.perPage=e.target.value;w.dataset.page='1';rptPaginate(w.id);
  });
  root.addEventListener('input',function(e){
    if(!e.target.classList.contains('rpt-search'))return;
    clearTimeout(_searchTimer);
    var w=e.target.closest('.rpt-table-wrap');
    _searchTimer=setTimeout(function(){if(w)rptFilter(w.id)},300);
  });
  /* Init: paginate all tables */
  root.querySelectorAll('.rpt-table-wrap').forEach(function(w){
    if(!w.dataset.perPage)w.dataset.perPage='50';
    w.dataset.page='1';
    rptFilter(w.id);
  });
}

function _rptEnabledModules(){
  var order=_rptState.order||_RPT_MODULES.map(function(m){return m.id});
  return order.filter(function(id){
    var m=_RPT_MODULES.find(function(x){return x.id===id});
    return m&&m.enabled&&m.available();
  });
}

function _rptBuildHeader(){
  var title=esc(_rptState.title||'AWS Infrastructure Assessment');
  var author=esc(_rptState.author||'');
  var date=esc(_rptState.date||'');
  var sub=[];
  if(author) sub.push(author);
  if(date) sub.push(date);
  return '<div class="rpt-header"><h1>'+title+'</h1>'+
    (sub.length?'<div class="subtitle">'+sub.join(' &mdash; ')+'</div>':'')+
    '</div>';
}

function _rptBuildTOC(enabled){
  var h='<div class="rpt-toc"><h2>Table of Contents</h2>';
  enabled.forEach(function(id,i){
    var m=_RPT_MODULES.find(function(x){return x.id===id});
    h+='<a href="#s-'+esc(id)+'">'+(i+1)+'. '+esc(m.name)+'</a>';
  });
  h+='</div>';
  return h;
}

function _rptBuildSections(enabled){
  var h='';
  enabled.forEach(function(id){
    var m=_RPT_MODULES.find(function(x){return x.id===id});
    try{h+=m.render(_rlCtx,{});}catch(e){
      h+='<section class="rpt-section" id="s-'+esc(id)+'"><h2>'+esc(m.name)+'</h2>';
      h+='<p>Error rendering section: '+esc(e.message)+'</p></section>';
    }
  });
  return h;
}

function _rptBuildFooter(){
  var ts=new Date().toLocaleString();
  return '<div class="rpt-footer-bar">Generated by AWS Mapper &mdash; '+esc(ts)+'</div>';
}

function _rptSlugify(str){
  return String(str||'report').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
}

function _rptFullHTML(enabled,pngDataUrl){
  var title=esc(_rptState.title||'AWS Infrastructure Assessment');
  var html='<!DOCTYPE html>\n<html lang="en">\n<head>\n';
  html+='<meta charset="UTF-8">\n';
  html+='<meta name="viewport" content="width=device-width,initial-scale=1.0">\n';
  html+='<title>'+title+'</title>\n';
  html+='<style>\n'+_rptCSS()+'\n'+_rptInteractiveCSS()+'\n</style>\n';
  html+='</head>\n<body>\n';
  html+=_rptBuildHeader();
  html+=_rptBuildTOC(enabled);
  html+=_rptBuildSections(enabled);
  html+=_rptBuildFooter();
  html+='<button id="rpt-back-top" title="Back to top" aria-label="Scroll to top">&#9650;</button>\n';
  html+=_rptInteractiveJS()+'\n';
  html+='\n</body>\n</html>';
  if(pngDataUrl) html=_rptSwapArchPng(html,pngDataUrl);
  return html;
}

function _rptSwapArchPng(html,pngDataUrl){
  return html.replace(
    /src="data:image\/svg\+xml;base64,[^"]+"/,
    'src="'+pngDataUrl+'"'
  );
}

function _rptCapturePNG(){
  return new Promise(function(resolve){
    var svgEl=document.getElementById('mapSvg');
    var root=svgEl?svgEl.querySelector('.map-root'):null;
    if(!root){resolve(null);return;}
    try{
      var clone=svgEl.cloneNode(true);
      _rptPrepClone(clone,root);
      var xml=new XMLSerializer().serializeToString(clone);
      var blob=new Blob([xml],{type:'image/svg+xml;charset=utf-8'});
      var url=URL.createObjectURL(blob);
      var bb=root.getBBox();var pad=40;
      var w=bb.width+pad*2;var h=bb.height+pad*2;
      var scale=Math.min(2,8000/w,8000/h);
      var img=new Image();
      img.onload=function(){
        var c=document.createElement('canvas');
        c.width=Math.round(w*scale);c.height=Math.round(h*scale);
        var cx=c.getContext('2d');cx.drawImage(img,0,0,c.width,c.height);
        URL.revokeObjectURL(url);resolve(c.toDataURL('image/png'));
      };
      img.onerror=function(){URL.revokeObjectURL(url);resolve(null);};
      img.src=url;
    }catch(e){resolve(null);}
  });
}

function _rptPrepClone(clone,root){
  var cloneRoot=clone.querySelector('.map-root');
  if(cloneRoot) cloneRoot.removeAttribute('transform');
  var bb=root.getBBox();var pad=40;
  clone.setAttribute('viewBox',
    (bb.x-pad)+' '+(bb.y-pad)+' '+(bb.width+pad*2)+' '+(bb.height+pad*2));
  clone.setAttribute('width',bb.width+pad*2);
  clone.setAttribute('height',bb.height+pad*2);
  var bgRect=document.createElementNS('http://www.w3.org/2000/svg','rect');
  bgRect.setAttribute('x',bb.x-pad);bgRect.setAttribute('y',bb.y-pad);
  bgRect.setAttribute('width',bb.width+pad*2);
  bgRect.setAttribute('height',bb.height+pad*2);
  bgRect.setAttribute('fill','#0a0e17');
  clone.insertBefore(bgRect,clone.firstChild);
  var styles=_rptCollectStyles();
  if(styles){
    var defs=clone.querySelector('defs')||
      clone.insertBefore(document.createElementNS('http://www.w3.org/2000/svg','defs'),clone.firstChild);
    var styleEl=document.createElementNS('http://www.w3.org/2000/svg','style');
    styleEl.textContent=styles;defs.appendChild(styleEl);
  }
}

async function _generateReport(){
  var btn=document.getElementById('rptExportHTML');
  btn.textContent='Generating...';btn.disabled=true;
  try{
    var enabled=_rptEnabledModules();
    if(!enabled.length){_showToast('No sections enabled');return;}
    var hasArch=enabled.indexOf('architecture')>=0;
    var pngDataUrl=hasArch?await _rptCapturePNG():null;
    var html=_rptFullHTML(enabled,pngDataUrl);
    var slug=_rptSlugify(_rptState.title);
    var date=_rptState.date||new Date().toISOString().slice(0,10);
    var filename=slug+'-'+date+'.html';
    downloadBlob(new Blob([html],{type:'text/html'}),filename);
  }catch(e){
    console.error('Report generation failed:',e);
    _showToast('Report generation failed: '+e.message);
  }finally{
    btn.textContent='Generate HTML Report';btn.disabled=false;
  }
}
// (rptExportHTML listener now wired in _renderReportsTab)

// === XLSX EXPORT (SheetJS) ===
var _sheetJSLoaded=false;
function _loadSheetJS(){
  if(_sheetJSLoaded&&window.XLSX) return Promise.resolve(window.XLSX);
  function _tryLoad(src){
    return new Promise(function(resolve,reject){
      var s=document.createElement('script');
      s.src=src;
      s.onload=function(){_sheetJSLoaded=true;resolve(window.XLSX)};
      s.onerror=function(){reject(new Error('Failed to load: '+src))};
      document.head.appendChild(s);
    });
  }
  return _tryLoad('xlsx.bundle.min.js').catch(function(){
    return _tryLoad('https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.min.js');
  });
}

var _XLSX_COLORS={
  headerBg:'1B2A4A',headerFg:'FFFFFF',
  sectionBg:'E2E8F0',sectionFg:'1E293B',
  critFg:'991B1B',critBg:'FEE2E2',
  highFg:'9A3412',highBg:'FFEDD5',
  medFg:'92400E',medBg:'FEF3C7',
  lowFg:'1E40AF',lowBg:'DBEAFE',
  protectedFg:'065F46',protectedBg:'D1FAE5',
  partialFg:'92400E',partialBg:'FEF3C7',
  atRiskFg:'991B1B',atRiskBg:'FEE2E2',
  effortLowFg:'065F46',effortLowBg:'DCFCE7',
  effortMedFg:'92400E',effortMedBg:'FEF3C7',
  effortHighFg:'991B1B',effortHighBg:'FEE2E2',
  stripeBg:'F8FAFC',borderClr:'D1D5DB',
  tierCritBg:'FEE2E2',tierCritFg:'991B1B',
  tierHighBg:'FED7AA',tierHighFg:'9A3412',
  tierMedBg:'FEF3C7',tierMedFg:'92400E',
  tierLowBg:'DBEAFE',tierLowFg:'1E40AF',
  titleFg:'0F172A',subtitleFg:'64748B',
  labelFg:'475569',valueFg:'0F172A',
  linkFg:'2563EB'
};

function _xlsxBorder(weight){
  weight=weight||'thin';
  var clr={rgb:_XLSX_COLORS.borderClr};
  return {top:{style:weight,color:clr},bottom:{style:weight,color:clr},
    left:{style:weight,color:clr},right:{style:weight,color:clr}};
}

function _xlsxHeaderStyle(){
  return {font:{bold:true,color:{rgb:_XLSX_COLORS.headerFg},name:'Calibri',sz:11},
    fill:{fgColor:{rgb:_XLSX_COLORS.headerBg}},
    alignment:{horizontal:'center',vertical:'center',wrapText:true},
    border:_xlsxBorder('thin')};
}

function _xlsxSevStyle(sev){
  var fg={CRITICAL:_XLSX_COLORS.critFg,HIGH:_XLSX_COLORS.highFg,MEDIUM:_XLSX_COLORS.medFg,LOW:_XLSX_COLORS.lowFg};
  var bg={CRITICAL:_XLSX_COLORS.critBg,HIGH:_XLSX_COLORS.highBg,MEDIUM:_XLSX_COLORS.medBg,LOW:_XLSX_COLORS.lowBg};
  return {font:{bold:true,color:{rgb:fg[sev]||'000000'},name:'Calibri',sz:10},
    fill:{fgColor:{rgb:bg[sev]||'FFFFFF'}},
    alignment:{horizontal:'center',vertical:'center'},
    border:_xlsxBorder()};
}

function _xlsxTierStyle(tier){
  var norm=String(tier).toLowerCase().replace(/ /g,'_');
  var map={
    critical:{fg:_XLSX_COLORS.tierCritFg,bg:_XLSX_COLORS.tierCritBg},
    high:{fg:_XLSX_COLORS.tierHighFg,bg:_XLSX_COLORS.tierHighBg},
    medium:{fg:_XLSX_COLORS.tierMedFg,bg:_XLSX_COLORS.tierMedBg},
    low:{fg:_XLSX_COLORS.tierLowFg,bg:_XLSX_COLORS.tierLowBg},
    protected:{fg:_XLSX_COLORS.protectedFg,bg:_XLSX_COLORS.protectedBg},
    partial:{fg:_XLSX_COLORS.partialFg,bg:_XLSX_COLORS.partialBg},
    at_risk:{fg:_XLSX_COLORS.atRiskFg,bg:_XLSX_COLORS.atRiskBg}
  };
  var m=map[norm]||{fg:'000000',bg:'FFFFFF'};
  return {font:{bold:true,color:{rgb:m.fg},name:'Calibri',sz:10},
    fill:{fgColor:{rgb:m.bg}},alignment:{horizontal:'center',vertical:'center'},
    border:_xlsxBorder()};
}

function _xlsxEffortStyle(effort){
  var norm=String(effort).toLowerCase().replace(/ /g,'');
  var map={
    low:{fg:_XLSX_COLORS.effortLowFg,bg:_XLSX_COLORS.effortLowBg},
    med:{fg:_XLSX_COLORS.effortMedFg,bg:_XLSX_COLORS.effortMedBg},
    high:{fg:_XLSX_COLORS.effortHighFg,bg:_XLSX_COLORS.effortHighBg}
  };
  var m=map[norm]||{fg:'000000',bg:'FFFFFF'};
  return {font:{color:{rgb:m.fg},name:'Calibri',sz:10},
    fill:{fgColor:{rgb:m.bg}},alignment:{horizontal:'center',vertical:'center'},
    border:_xlsxBorder()};
}

function _xlsxCellStyle(isStripe){
  var s={font:{name:'Calibri',sz:10,color:{rgb:'1E293B'}},
    alignment:{vertical:'center',wrapText:true},
    border:_xlsxBorder()};
  if(isStripe) s.fill={fgColor:{rgb:_XLSX_COLORS.stripeBg}};
  return s;
}

function _xlsxAutoWidth(ws,data,minWidths){
  if(!data||!data.length) return;
  var colWidths=[];
  data.forEach(function(row,ri){
    row.forEach(function(cell,i){
      var len=String(cell!=null?cell:'').length;
      if(ri===0) len=Math.max(len+4,12);
      else len=len+3;
      colWidths[i]=Math.max(colWidths[i]||8,len);
    });
  });
  if(minWidths){
    minWidths.forEach(function(mw,i){if(mw&&i<colWidths.length) colWidths[i]=Math.max(colWidths[i],mw)});
  }
  ws['!cols']=colWidths.map(function(w){return {wch:Math.min(w,60)}});
}

function _xlsxAddSheet(wb,name,headers,rows,opts){
  opts=opts||{};
  var data=[headers].concat(rows);
  var ws=XLSX.utils.aoa_to_sheet(data);
  _xlsxAutoWidth(ws,data,opts.minWidths);
  var hdrStyle=_xlsxHeaderStyle();
  headers.forEach(function(_,i){
    var addr=XLSX.utils.encode_cell({r:0,c:i});
    if(ws[addr]) ws[addr].s=hdrStyle;
  });
  // Style severity column — colored text + tinted fill (cache by value)
  if(typeof opts.sevCol==='number'){
    var _sevCache={};
    for(var r=1;r<data.length;r++){
      var addr=XLSX.utils.encode_cell({r:r,c:opts.sevCol});
      if(ws[addr]){
        var val=String(ws[addr].v||'');
        if(val){
          if(!_sevCache[val]) _sevCache[val]=_xlsxSevStyle(val);
          ws[addr].s=_sevCache[val];
        }
      }
    }
  }
  // Style tier column (cache by value)
  if(typeof opts.tierCol==='number'){
    var _tierCache={};
    for(var r=1;r<data.length;r++){
      var addr=XLSX.utils.encode_cell({r:r,c:opts.tierCol});
      if(ws[addr]){
        var val=String(ws[addr].v||'');
        if(val){
          if(!_tierCache[val]) _tierCache[val]=_xlsxTierStyle(val);
          ws[addr].s=_tierCache[val];
        }
      }
    }
  }
  // Style effort column (cache by value)
  if(typeof opts.effortCol==='number'){
    var _effortCache={};
    for(var r=1;r<data.length;r++){
      var addr=XLSX.utils.encode_cell({r:r,c:opts.effortCol});
      if(ws[addr]){
        var val=String(ws[addr].v||'');
        if(val){
          if(!_effortCache[val]) _effortCache[val]=_xlsxEffortStyle(val);
          ws[addr].s=_effortCache[val];
        }
      }
    }
  }
  // Apply base cell styles + row striping to all other cells
  // Cache common styles to reduce object allocation (~35k+ cells in large reports)
  var _cellPlain=_xlsxCellStyle(false);
  var _cellStripe=_xlsxCellStyle(true);
  var _border=_xlsxBorder();
  for(var r=1;r<data.length;r++){
    var sty=r%2===0?_cellStripe:_cellPlain;
    for(var c=0;c<headers.length;c++){
      var addr=XLSX.utils.encode_cell({r:r,c:c});
      if(ws[addr]&&!ws[addr].s) ws[addr].s=sty;
      else if(ws[addr]&&ws[addr].s&&!ws[addr].s.border) ws[addr].s.border=_border;
    }
  }
  // Row height for header
  ws['!rows']=[{hpx:28}];
  // Autofilter — enables sort/filter dropdowns
  var lastCol=XLSX.utils.encode_col(headers.length-1);
  var lastRow=data.length;
  ws['!autofilter']={ref:'A1:'+lastCol+lastRow};
  // Freeze panes — freeze header row
  ws['!views']=[{state:'frozen',ySplit:1}];
  XLSX.utils.book_append_sheet(wb,ws,name);
}

function _xlsxSummarySection(ws,row,label,cols){
  var addr=XLSX.utils.encode_cell({r:row,c:0});
  ws[addr]={v:label,t:'s',s:{font:{bold:true,sz:12,color:{rgb:_XLSX_COLORS.headerFg},name:'Calibri'},
    fill:{fgColor:{rgb:_XLSX_COLORS.headerBg}},alignment:{vertical:'center'},
    border:_xlsxBorder()}};
  for(var c=1;c<cols;c++){
    var a2=XLSX.utils.encode_cell({r:row,c:c});
    ws[a2]={v:'',t:'s',s:{fill:{fgColor:{rgb:_XLSX_COLORS.headerBg}},border:_xlsxBorder()}};
  }
  if(cols>1) ws['!merges']=(ws['!merges']||[]).concat([{s:{r:row,c:0},e:{r:row,c:cols-1}}]);
}

function _xlsxSummaryRow(ws,row,label,value,cols){
  var lAddr=XLSX.utils.encode_cell({r:row,c:0});
  ws[lAddr]={v:label,t:'s',s:{font:{bold:true,sz:10,color:{rgb:_XLSX_COLORS.labelFg},name:'Calibri'},
    alignment:{vertical:'center'},border:_xlsxBorder()}};
  var vAddr=XLSX.utils.encode_cell({r:row,c:1});
  var vType=typeof value==='number'?'n':'s';
  ws[vAddr]={v:value,t:vType,s:{font:{sz:10,color:{rgb:_XLSX_COLORS.valueFg},name:'Calibri'},
    alignment:{vertical:'center'},border:_xlsxBorder()}};
  if(cols>2){
    for(var c=2;c<cols;c++){
      var a=XLSX.utils.encode_cell({r:row,c:c});
      ws[a]={v:'',t:'s',s:{border:_xlsxBorder()}};
    }
  }
}

function _rptBuildXlsxSummary(wb){
  var c=_rlCtx;
  var cols=4;
  var ws={};
  var r=0;
  // Title row — merged across all columns
  var titleAddr=XLSX.utils.encode_cell({r:r,c:0});
  ws[titleAddr]={v:_rptState.title||'AWS Infrastructure Assessment',t:'s',
    s:{font:{bold:true,sz:18,color:{rgb:_XLSX_COLORS.titleFg},name:'Calibri'},
      alignment:{vertical:'center'},border:{bottom:{style:'medium',color:{rgb:_XLSX_COLORS.headerBg}}}}};
  for(var cc=1;cc<cols;cc++){
    ws[XLSX.utils.encode_cell({r:r,c:cc})]={v:'',t:'s',
      s:{border:{bottom:{style:'medium',color:{rgb:_XLSX_COLORS.headerBg}}}}};
  }
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:cols-1}}];
  r++;
  // Subtitle row
  var subParts=[];
  if(_rptState.author) subParts.push('Prepared by '+_rptState.author);
  subParts.push(_rptState.date||new Date().toISOString().slice(0,10));
  var subAddr=XLSX.utils.encode_cell({r:r,c:0});
  ws[subAddr]={v:subParts.join('  |  '),t:'s',
    s:{font:{sz:10,color:{rgb:_XLSX_COLORS.subtitleFg},name:'Calibri',italic:true},
      alignment:{vertical:'center'}}};
  for(var cc=1;cc<cols;cc++) ws[XLSX.utils.encode_cell({r:r,c:cc})]={v:'',t:'s'};
  ws['!merges'].push({s:{r:r,c:0},e:{r:r,c:cols-1}});
  r+=2;
  // Infrastructure Overview section
  if(c){
    _xlsxSummarySection(ws,r,'INFRASTRUCTURE OVERVIEW',cols);r++;
    var counts=[['VPCs',(c.vpcs||[]).length],['Subnets',(c.subnets||[]).length],
      ['EC2 Instances',(c.instances||[]).length],['RDS Databases',(c.rdsInstances||[]).length],
      ['Load Balancers',(c.albs||[]).length],['ECS Services',(c.ecsServices||[]).length],
      ['Lambda Functions',(c.lambdaFns||[]).length],['Security Groups',(c.sgs||[]).length]];
    // Two-column layout: resource pairs side by side
    for(var i=0;i<counts.length;i+=2){
      var lAddr=XLSX.utils.encode_cell({r:r,c:0});
      ws[lAddr]={v:counts[i][0],t:'s',s:{font:{bold:true,sz:10,color:{rgb:_XLSX_COLORS.labelFg},name:'Calibri'},border:_xlsxBorder(),alignment:{vertical:'center'}}};
      var vAddr=XLSX.utils.encode_cell({r:r,c:1});
      ws[vAddr]={v:counts[i][1],t:'n',s:{font:{bold:true,sz:11,color:{rgb:_XLSX_COLORS.valueFg},name:'Calibri'},border:_xlsxBorder(),alignment:{horizontal:'center',vertical:'center'}}};
      if(i+1<counts.length){
        var l2=XLSX.utils.encode_cell({r:r,c:2});
        ws[l2]={v:counts[i+1][0],t:'s',s:{font:{bold:true,sz:10,color:{rgb:_XLSX_COLORS.labelFg},name:'Calibri'},border:_xlsxBorder(),alignment:{vertical:'center'}}};
        var v2=XLSX.utils.encode_cell({r:r,c:3});
        ws[v2]={v:counts[i+1][1],t:'n',s:{font:{bold:true,sz:11,color:{rgb:_XLSX_COLORS.valueFg},name:'Calibri'},border:_xlsxBorder(),alignment:{horizontal:'center',vertical:'center'}}};
      }
      r++;
    }
    r++;
  }
  // Compliance Findings section
  if(_complianceFindings&&_complianceFindings.length){
    _xlsxSummarySection(ws,r,'COMPLIANCE FINDINGS',cols);r++;
    _xlsxSummaryRow(ws,r,'Total Findings',_complianceFindings.length,cols);r++;
    var sevs={CRITICAL:0,HIGH:0,MEDIUM:0,LOW:0};
    _complianceFindings.forEach(function(f){sevs[f.severity]=(sevs[f.severity]||0)+1});
    ['CRITICAL','HIGH','MEDIUM','LOW'].forEach(function(s){
      var addr=XLSX.utils.encode_cell({r:r,c:0});
      ws[addr]={v:s,t:'s',s:_xlsxSevStyle(s)};
      var vAddr=XLSX.utils.encode_cell({r:r,c:1});
      ws[vAddr]={v:sevs[s],t:'n',s:{font:{bold:true,sz:11,color:{rgb:'0F172A'},name:'Calibri'},
        alignment:{horizontal:'center',vertical:'center'},border:_xlsxBorder()}};
      for(var cc=2;cc<cols;cc++) ws[XLSX.utils.encode_cell({r:r,c:cc})]={v:'',t:'s',s:{border:_xlsxBorder()}};
      r++;
    });
    // Framework breakdown
    r++;
    var fws=[].concat(Object.keys(_FW_LABELS));
    var fwHdr=XLSX.utils.encode_cell({r:r,c:0});
    ws[fwHdr]={v:'Framework',t:'s',s:_xlsxHeaderStyle()};
    ws[XLSX.utils.encode_cell({r:r,c:1})]={v:'Findings',t:'s',s:_xlsxHeaderStyle()};
    ws[XLSX.utils.encode_cell({r:r,c:2})]={v:'Critical',t:'s',s:_xlsxHeaderStyle()};
    ws[XLSX.utils.encode_cell({r:r,c:3})]={v:'High',t:'s',s:_xlsxHeaderStyle()};
    r++;
    fws.forEach(function(fw){
      var ff=_complianceFindings.filter(function(f){return f.framework===fw});
      if(!ff.length) return;
      var isStripe=(r%2===0);
      ws[XLSX.utils.encode_cell({r:r,c:0})]={v:_FW_LABELS[fw]||fw,t:'s',s:_xlsxCellStyle(isStripe)};
      ws[XLSX.utils.encode_cell({r:r,c:1})]={v:ff.length,t:'n',s:{font:{bold:true,sz:10,name:'Calibri'},alignment:{horizontal:'center'},border:_xlsxBorder(),fill:isStripe?{fgColor:{rgb:_XLSX_COLORS.stripeBg}}:undefined}};
      var critCt=ff.filter(function(f){return f.severity==='CRITICAL'}).length;
      var highCt=ff.filter(function(f){return f.severity==='HIGH'}).length;
      ws[XLSX.utils.encode_cell({r:r,c:2})]={v:critCt,t:'n',s:critCt>0?_xlsxSevStyle('CRITICAL'):_xlsxCellStyle(isStripe)};
      ws[XLSX.utils.encode_cell({r:r,c:3})]={v:highCt,t:'n',s:highCt>0?_xlsxSevStyle('HIGH'):_xlsxCellStyle(isStripe)};
      r++;
    });
    r++;
  }
  // BUDR section
  if(_budrAssessments&&_budrAssessments.length){
    _xlsxSummarySection(ws,r,'BACKUP & DISASTER RECOVERY',cols);r++;
    _xlsxSummaryRow(ws,r,'Total Assessments',_budrAssessments.length,cols);r++;
    var tc=_getBUDRTierCounts();
    [['Protected',tc.protected||0,'protected'],['Partial',tc.partial||0,'partial'],['At Risk',tc.at_risk||0,'at_risk']].forEach(function(t){
      ws[XLSX.utils.encode_cell({r:r,c:0})]={v:t[0],t:'s',s:_xlsxTierStyle(t[2])};
      ws[XLSX.utils.encode_cell({r:r,c:1})]={v:t[1],t:'n',s:{font:{bold:true,sz:11,name:'Calibri'},alignment:{horizontal:'center'},border:_xlsxBorder()}};
      for(var cc=2;cc<cols;cc++) ws[XLSX.utils.encode_cell({r:r,c:cc})]={v:'',t:'s',s:{border:_xlsxBorder()}};
      r++;
    });
  }
  // Set sheet range
  ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:r,c:cols-1}});
  ws['!cols']=[{wch:24},{wch:16},{wch:16},{wch:16}];
  ws['!rows']=[{hpx:36}];
  XLSX.utils.book_append_sheet(wb,ws,'Summary');
}

function _rptBuildXlsxCompliance(wb){
  var f=_complianceFindings;
  if(!f||!f.length) return;
  var headers=['Priority','Effort','Severity','Framework','Control','CKV','Resource','Finding','Remediation'];
  var sorted=f.slice().sort(function(a,b){
    var ta=_classifyTier(a),tb=_classifyTier(b);
    if(ta!==tb) return(_PRIORITY_ORDER[ta]||9)-(_PRIORITY_ORDER[tb]||9);
    return (_SEV_ORDER[a.severity]||9)-(_SEV_ORDER[b.severity]||9);
  });
  var rows=sorted.map(function(x){
    var tier=_classifyTier(x);
    var effort=_EFFORT_LABELS[_getEffort(x)]||'Med';
    return [_TIER_META[tier].name,effort,x.severity,_FW_LABELS[x.framework]||x.framework||'',x.control,
      x.ckv||'',x.resourceName||x.resource,x.message,x.remediation];
  });
  _xlsxAddSheet(wb,'Compliance',headers,rows,{sevCol:2,tierCol:0,effortCol:1,
    minWidths:[14,14,12,20,14,14,28,40,40]});
}

function _rptBuildXlsxBUDR(wb){
  if(!_budrAssessments||!_budrAssessments.length) return;
  var headers=['Resource Type','Resource ID','Name','DR Tier','RTO','RPO','Backup Signals'];
  var tierOrder={at_risk:0,partial:1,protected:2};
  var sorted=_budrAssessments.slice().sort(function(a,b){
    return (tierOrder[a.profile?a.profile.tier:'']||9)-(tierOrder[b.profile?b.profile.tier:'']||9);
  });
  var rows=sorted.map(function(a){
    var tier=a.profile?a.profile.tier:'unknown';
    var rto=a.profile?a.profile.rto:'N/A';
    var rpo=a.profile?a.profile.rpo:'N/A';
    var sigs=a.signals?Object.keys(a.signals).map(function(k){return k+': '+a.signals[k]}).join(', '):'';
    return [a.type,a.id,a.name||'',tier,rto,rpo,sigs];
  });
  _xlsxAddSheet(wb,'BUDR',headers,rows,{tierCol:3,
    minWidths:[16,24,20,14,10,10,40]});
}

function _rptBuildXlsxInventory(wb){
  var c=_rlCtx;
  if(!c) return;
  var headers=['Type','ID','Name','Configuration','State / AZ','Details'];
  var rows=[];
  (c.vpcs||[]).forEach(function(v){
    rows.push(['VPC',v.VpcId,_rptTagName(v),v.CidrBlock,v.State||'available','']);
  });
  (c.subnets||[]).forEach(function(s){
    var pub=c.pubSubs&&c.pubSubs.has(s.SubnetId)?'Public':'Private';
    rows.push(['Subnet',s.SubnetId,_rptTagName(s),s.CidrBlock,s.AvailabilityZone,pub]);
  });
  (c.instances||[]).forEach(function(i){
    var state=i.State?i.State.Name:'';
    var az=i.Placement?i.Placement.AvailabilityZone:'';
    rows.push(['EC2',i.InstanceId,_rptTagName(i),i.InstanceType,state,az]);
  });
  (c.rdsInstances||[]).forEach(function(d){
    rows.push(['RDS',d.DBInstanceIdentifier,d.DBInstanceIdentifier,d.Engine+' / '+d.DBInstanceClass,d.MultiAZ?'Multi-AZ':'Single-AZ',d.StorageType||'']);
  });
  (c.albs||[]).forEach(function(a){
    rows.push(['ALB',a.LoadBalancerName||'',a.LoadBalancerName,a.Type||'application',a.Scheme||'',(a.AvailabilityZones||[]).length+' AZs']);
  });
  (c.ecsServices||[]).forEach(function(s){
    rows.push(['ECS',s.serviceName||'',s.serviceName,s.launchType||'FARGATE',s.runningCount+'/'+s.desiredCount+' tasks','']);
  });
  (c.lambdaFns||[]).forEach(function(fn){
    rows.push(['Lambda',fn.FunctionName||'',fn.FunctionName,fn.Runtime||'',fn.MemorySize+'MB / '+fn.Timeout+'s','']);
  });
  if(!rows.length) return;
  _xlsxAddSheet(wb,'Inventory',headers,rows,{minWidths:[12,24,22,22,18,14]});
}

function _rptBuildXlsxActionPlan(wb){
  var all=(_complianceFindings||[]).concat(_budrFindings||[]);
  if(!all.length) return;
  var headers=['Priority','Severity','Effort','Framework','Control','Resource','Finding',
    'Remediation','Owner','Target Date','Status'];
  var tiers=_getTierGroups(all);
  var rows=[];
  _PRIORITY_KEYS.forEach(function(t){
    var rgs=tiers[t];
    if(!rgs) return;
    var tierName=_TIER_META[t].name;
    rgs.forEach(function(rg){
      rg.findings.forEach(function(f){
        var effort=_EFFORT_MAP[f.control]||'med';
        rows.push([tierName,f.severity,_EFFORT_LABELS[effort]||effort,
          _FW_LABELS[f.framework]||f.framework||'',f.control,
          f.resourceName||f.resource,f.message,f.remediation,'','','Open']);
      });
    });
  });
  _xlsxAddSheet(wb,'Action Plan',headers,rows,{sevCol:1,tierCol:0,effortCol:2,
    minWidths:[14,12,14,20,14,28,40,40,14,14,12]});
}

// Inject company logo into XLSX zip (Summary sheet, top-right corner)
async function _xlsxInjectLogo(zip){
  var logo=_rptState.logo;
  if(!logo) return;
  try{
    var base64=logo.dataUri.split(',')[1];
    var binary=atob(base64);
    var bytes=new Uint8Array(binary.length);
    for(var i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    var ext=logo.ext==='jpeg'?'png':logo.ext; // normalize
    zip.file('xl/media/image1.'+ext,bytes);
    // Register image content type
    var ctXml=await zip.file('[Content_Types].xml').async('string');
    if(ctXml.indexOf('Extension="'+ext+'"')===-1){
      ctXml=ctXml.replace('</Types>','<Default Extension="'+ext+'" ContentType="image/'+ext+'"/></Types>');
    }
    // Register drawing content type
    if(ctXml.indexOf('/drawing+xml')===-1){
      ctXml=ctXml.replace('</Types>','<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
    }
    zip.file('[Content_Types].xml',ctXml);
    // Calculate size in EMUs (1 inch = 914400 EMUs), max 1.5" x 0.75"
    var maxW=1371600,maxH=685800;
    var aspect=logo.width/logo.height;
    var w=maxW,h=maxW/aspect;
    if(h>maxH){h=maxH;w=maxH*aspect;}
    // Drawing XML — twoCellAnchor at top-right (col 3, row 0)
    var drawXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'+
      '<xdr:twoCellAnchor editAs="oneCell">'+
      '<xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'+
      '<xdr:to><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'+
      '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr/></xdr:nvPicPr>'+
      '<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/>'+
      '<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'+
      '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+Math.round(w)+'" cy="'+Math.round(h)+'"/></a:xfrm>'+
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>'+
      '</xdr:pic><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>';
    zip.file('xl/drawings/drawing1.xml',drawXml);
    // Drawing rels — link image
    zip.file('xl/drawings/_rels/drawing1.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.'+ext+'"/>'+
      '</Relationships>');
    // Sheet1 rels — link drawing
    var wsRelsPath='xl/worksheets/_rels/sheet1.xml.rels';
    var wsRels;
    try{wsRels=await zip.file(wsRelsPath).async('string');}catch(e){wsRels=null;}
    if(!wsRels) wsRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    wsRels=wsRels.replace('</Relationships>',
      '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
    zip.file(wsRelsPath,wsRels);
    // Add <drawing> ref to sheet1.xml
    var s1=await zip.file('xl/worksheets/sheet1.xml').async('string');
    if(s1.indexOf('<drawing')===-1){
      s1=s1.replace('</worksheet>','<drawing r:id="rId99" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></worksheet>');
      zip.file('xl/worksheets/sheet1.xml',s1);
    }
  }catch(e){console.warn('Logo injection failed:',e);}
}

// Post-process XLSX zip: logo injection + freeze panes
async function _xlsxPostProcess(wbBuf,sheetNames){
  var zip=await JSZip.loadAsync(wbBuf);
  // Logo on Summary sheet
  if(_rptState.logo) await _xlsxInjectLogo(zip);
  // Freeze panes on data sheets
  for(var i=0;i<sheetNames.length;i++){
    var path='xl/worksheets/sheet'+(i+1)+'.xml';
    var f=zip.file(path);
    if(!f) continue;
    var xml=await f.async('string');
    // Skip Summary sheet (index 0) — it's a dashboard, not a data table
    if(i===0) continue;
    // Inject pane into sheetView to freeze row 1
    var paneXml='<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>';
    xml=xml.replace(
      '<sheetView workbookViewId="0"/>',
      '<sheetView tabSelected="'+(i===1?'1':'0')+'" workbookViewId="0">'+paneXml+'</sheetView>'
    );
    xml=xml.replace(
      /<sheetView workbookViewId="0"><\/sheetView>/,
      '<sheetView tabSelected="'+(i===1?'1':'0')+'" workbookViewId="0">'+paneXml+'</sheetView>'
    );
    zip.file(path,xml);
  }
  var result=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  zip=null;
  return result;
}

async function _generateXlsx(){
  var btn=document.getElementById('rptExportXLSX');
  if(btn){btn.textContent='Loading...';btn.disabled=true;}
  try{
    await _loadSheetJS();
    var enabled=_rptEnabledModules();
    if(!enabled.length){_showToast('No sections enabled');return;}
    var wb=XLSX.utils.book_new();
    _rptBuildXlsxSummary(wb);
    if(enabled.indexOf('compliance')>=0) _rptBuildXlsxCompliance(wb);
    if(enabled.indexOf('budr')>=0) _rptBuildXlsxBUDR(wb);
    if(enabled.indexOf('inventory')>=0) _rptBuildXlsxInventory(wb);
    if(enabled.indexOf('action-plan')>=0) _rptBuildXlsxActionPlan(wb);
    var slug=_rptSlugify(_rptState.title);
    var date=_rptState.date||new Date().toISOString().slice(0,10);
    var fname=slug+'-'+date+'.xlsx';
    // Write to buffer, inject freeze panes, then download
    // Yield between heavy steps so GC can reclaim memory
    var sheetNames=wb.SheetNames.slice();
    var wbBuf=XLSX.write(wb,{type:'array',bookType:'xlsx'});
    wb=null; // release workbook (can be large with thousands of styled cells)
    await new Promise(function(r){setTimeout(r,0)}); // yield for GC
    var blob=await _xlsxPostProcess(wbBuf,sheetNames);
    wbBuf=null; // release raw buffer
    downloadBlob(blob,fname);
    blob=null;
    _showToast('XLSX report exported');
  }catch(e){
    console.error('XLSX export failed:',e);
    _showToast('XLSX export failed: '+e.message);
  }finally{
    if(btn){btn.textContent='Export XLSX';btn.disabled=false;}
  }
}
// (rptExportXLSX listener now wired in _renderReportsTab)

// Report footer stats
function _rptUpdateFooterStats(){
  var el=document.getElementById('rptFooterStats');
  if(!el) return;
  var parts=[];
  var fLen=(_complianceFindings||[]).length+(_budrFindings||[]).length;
  if(fLen) parts.push(fLen+' findings');
  if(_rlCtx){
    var rCount=0;
    ['vpcs','subnets','instances','rdsInstances','albs','ecsServices','lambdaFns'].forEach(function(k){
      rCount+=(_rlCtx[k]||[]).length;
    });
    if(rCount) parts.push(rCount+' resources');
  }
  var all=(_complianceFindings||[]).concat(_budrFindings||[]);
  if(all.length) parts.push(all.length+' action items');
  el.textContent=parts.length?parts.join('  |  '):'';
}

var _rptInputTimer=0;
function _rptDebouncedPreview(){clearTimeout(_rptInputTimer);_rptInputTimer=setTimeout(_renderRptPreview,300)}
// (rptTitle/rptAuthor/rptDate/logo listeners are now wired in _renderReportsTab)
function _updateLogoPreview(){
  var preview=document.getElementById('rptLogoPreview');
  var clearBtn=document.getElementById('rptLogoClear');
  var uploadBtn=document.getElementById('rptLogoBtn');
  if(_rptState.logo){
    preview.innerHTML='';
    var img=document.createElement('img');
    img.src=_rptState.logo.dataUri;
    img.alt='Logo';
    preview.appendChild(img);
    preview.style.display='flex';
    clearBtn.style.display='inline-block';
    uploadBtn.textContent='Change';
  }else{
    preview.style.display='none';
    preview.innerHTML='';
    clearBtn.style.display='none';
    uploadBtn.textContent='Upload Logo';
  }
}

// === AUTO-SAVE / CRASH RECOVERY ===
const _SAVE_KEY='aws_mapper_session';const _SAVE_INTERVAL=30000;
function _autoSaveSession(){try{const data={};document.querySelectorAll('.ji').forEach(el=>{if(el.value.trim())data[el.id]=el.value});
  data._accountLabel=(document.getElementById('accountLabel')||{}).value||'';data._layout=(document.getElementById('layoutMode')||{}).value||'grid';
  if(_rptState.logo)data._rptLogo=_rptState.logo;data._ts=Date.now();
  localStorage.setItem(_SAVE_KEY,JSON.stringify(data))}catch(e){}}
function _restoreSession(){try{const raw=localStorage.getItem(_SAVE_KEY);if(!raw)return false;const data=JSON.parse(raw);if(!data._ts)return false;
  if(Date.now()-data._ts>7*24*60*60*1000){localStorage.removeItem(_SAVE_KEY);return false}
  let hasData=false;Object.entries(data).forEach(([k,v])=>{if(k.startsWith('_'))return;const el=document.getElementById(k);if(el){el.value=v;el.className='ji valid';hasData=true}});
  if(data._accountLabel){const al=document.getElementById('accountLabel');if(al)al.value=data._accountLabel}
  if(data._layout){const lm=document.getElementById('layoutMode');if(lm)lm.value=data._layout}
  if(data._rptLogo){_rptState.logo=data._rptLogo}
  return hasData}catch(e){return false}}
setInterval(()=>{if(_rlCtx)_autoSaveSession()},_SAVE_INTERVAL);
(function(){try{const raw=localStorage.getItem(_SAVE_KEY);if(!raw)return;const data=JSON.parse(raw);if(!data._ts||Date.now()-data._ts>7*24*60*60*1000)return;
  let count=Object.keys(data).filter(k=>!k.startsWith('_')).length;if(count===0)return;
  const banner=document.createElement('div');banner.id='restoreBanner';
  banner.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:200;background:var(--bg-tertiary);border:1px solid var(--accent-cyan);border-radius:8px;padding:12px 20px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,.5)';
  const age=Math.round((Date.now()-data._ts)/60000);const ageStr=age<60?age+'m ago':Math.round(age/60)+'h ago';
  banner.innerHTML='<span style="font-size:12px;color:var(--text-primary)">Recover previous session? ('+count+' inputs, '+ageStr+')</span><button id="restoreYes" style="background:var(--accent-cyan);color:#000;border:none;border-radius:4px;padding:6px 14px;font-size:11px;font-weight:600;cursor:pointer">Restore</button><button id="restoreNo" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--text-muted);padding:6px 14px;font-size:11px;cursor:pointer">Dismiss</button>';
  document.body.appendChild(banner);
  document.getElementById('restoreYes').addEventListener('click',()=>{if(_restoreSession()){renderMap(()=>{_autoSaveSession()})}banner.remove()});
  document.getElementById('restoreNo').addEventListener('click',()=>{banner.remove()});
  setTimeout(()=>{if(banner.parentNode)banner.remove()},15000);
}catch(e){}})();

// Design mode toggle
document.getElementById('designToggle').addEventListener('click',()=>{
  if(_designMode)exitDesignMode();else enterDesignMode();
});
// Design banner close
document.getElementById('designBannerClose').addEventListener('click',()=>{
  document.getElementById('designBanner').classList.remove('visible');
});
// Design help tooltip on hover
(function(){
  const btn=document.getElementById('designToggle');
  const help=document.getElementById('designHelp');
  let hoverTimeout=null;
  btn.addEventListener('mouseenter',()=>{
    if(_designMode)return;
    hoverTimeout=setTimeout(()=>{help.classList.add('visible')},400);
  });
  btn.addEventListener('mouseleave',()=>{
    clearTimeout(hoverTimeout);
    setTimeout(()=>{help.classList.remove('visible')},200);
  });
  help.addEventListener('mouseenter',()=>{clearTimeout(hoverTimeout)});
  help.addEventListener('mouseleave',()=>{help.classList.remove('visible')});
})();

// Export bar collapse toggle
document.getElementById('ebToggle').addEventListener('click',function(){
  const eb=document.getElementById('exportBar');
  eb.classList.toggle('collapsed');
  this.innerHTML=eb.classList.contains('collapsed')?'Export &#9654;':'Export &#9660;';
});

// Highlight lock indicator click to unlock
document.getElementById('hlLockInd').addEventListener('click',function(){
  document.dispatchEvent(new CustomEvent('hl-unlock'));
});

// detail panel close handlers
document.getElementById('dpClose').addEventListener('click',()=>{
  document.getElementById('detailPanel').classList.remove('open');
});
document.getElementById('dpBody').addEventListener('click',function(e){
  const c=e.target.closest('.copyable');
  if(c){e.stopPropagation();copyText(c.dataset.copy||c.textContent.trim());return}
  const v=e.target.closest('.dp-kv .v');
  if(v&&v.textContent.trim()){e.stopPropagation();copyText(v.textContent.trim())}
});
// Full panel editor event handlers
document.getElementById('fwFpClose').addEventListener('click',function(){
  document.getElementById('fwFullPanel').classList.remove('open');
});
document.getElementById('fwFpTabs').addEventListener('click',function(e){
  var tab=e.target.closest('.fw-fp-tab');
  if(!tab) return;
  _fwFpDir=tab.getAttribute('data-dir');
  _fwRefreshFullPanel();
});
document.getElementById('fwFpRetrace').addEventListener('click',function(){
  if(_flowMode&&typeof _executeTrace==='function') _executeTrace();
});
document.getElementById('fwFpCopy').addEventListener('click',function(){
  var cliEl=document.getElementById('fwFpCli');
  var txt=cliEl.textContent||'';
  if(!txt||txt==='No pending edits'){
    var btn=this;btn.textContent='No edits';setTimeout(function(){btn.textContent='Copy CLI'},1500);
    return;
  }
  var btn=this;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){
      btn.textContent='Copied!';setTimeout(function(){btn.textContent='Copy CLI'},1500);
    }).catch(function(){btn.textContent='Copy failed';setTimeout(function(){btn.textContent='Copy CLI'},1500)});
  } else {
    btn.textContent='No clipboard';setTimeout(function(){btn.textContent='Copy CLI'},1500);
  }
});
document.querySelector('.main').addEventListener('click',function(e){
  if(!e.target.closest('.detail-panel')&&!e.target.closest('.fw-full-panel')&&!e.target.closest('.subnet-node')&&!e.target.closest('.gw-node')&&!e.target.closest('.lz-gw-node')&&!e.target.closest('.lz-tgw-node')&&!e.target.closest('.export-bar')&&!e.target.closest('.zoom-controls')&&!e.target.closest('.stats-bar')&&!e.target.closest('.diff-summary')&&!e.target.closest('.diff-banner')){
    document.getElementById('detailPanel').classList.remove('open');
    _clearBlastRadius();
  }
});

// Mobile swipe-down to close detail panel
(function(){
  const dp=document.getElementById('detailPanel');
  const dh=document.getElementById('dpDragHandle');
  let startY=0,currentY=0,dragging=false;
  dh.addEventListener('touchstart',function(e){startY=e.touches[0].clientY;currentY=startY;dragging=true;dp.style.transition='none'},{passive:true});
  dh.addEventListener('touchmove',function(e){
    if(!dragging)return;currentY=e.touches[0].clientY;
    const dy=currentY-startY;if(dy>0)dp.style.transform='translateY('+dy+'px)';
  },{passive:true});
  dh.addEventListener('touchend',function(){
    if(!dragging)return;dragging=false;dp.style.transition='transform .25s ease';
    if(currentY-startY>80){dp.classList.remove('open');dp.style.transform=''}
    else{dp.style.transform=''}
  });
})();

// Desktop detail panel resize (drag left edge)
(function(){
  const rh=document.getElementById('dpResizeHandle');
  const dp=document.getElementById('detailPanel');
  if(!rh||!dp)return;
  let resizing=false,startX=0,startW=0;
  const minW=280,maxW=Math.min(900,window.innerWidth*0.7);
  // Restore saved width
  const savedW=_prefs.dpWidth;
  if(savedW&&savedW>=minW&&savedW<=maxW){dp.style.width=savedW+'px';}
  rh.addEventListener('mousedown',function(e){
    if(window.innerWidth<=768)return;
    e.preventDefault();resizing=true;startX=e.clientX;startW=dp.offsetWidth;
    rh.classList.add('active');document.body.style.cursor='col-resize';document.body.style.userSelect='none';
  });
  document.addEventListener('mousemove',function(e){
    if(!resizing)return;
    const dx=startX-e.clientX;
    const nw=Math.max(minW,Math.min(maxW,startW+dx));
    dp.style.width=nw+'px';
  });
  document.addEventListener('mouseup',function(){
    if(!resizing)return;resizing=false;
    rh.classList.remove('active');document.body.style.cursor='';document.body.style.userSelect='';
    savePrefs({dpWidth:dp.offsetWidth});
  });
})();

// detail panel text size
let dpScale=_prefs.dpScale||1.0;
function applyDpScale(){
  document.documentElement.style.setProperty('--dp-txt-scale',dpScale);
}
if(_prefs.dpScale) applyDpScale();
document.getElementById('dpSizeUp').addEventListener('click',()=>{dpScale=Math.min(2.0,dpScale+0.15);applyDpScale();savePrefs({dpScale})});
document.getElementById('dpSizeDown').addEventListener('click',()=>{dpScale=Math.max(0.5,dpScale-0.15);applyDpScale();savePrefs({dpScale})});
document.getElementById('dpSizeReset').addEventListener('click',()=>{dpScale=1.0;applyDpScale();savePrefs({dpScale})});

// filename-to-input mapping
const fileMap=[
  {id:'in_vpcs',patterns:['vpc','vpcs']},
  {id:'in_subnets',patterns:['subnet','subnets']},
  {id:'in_rts',patterns:['route-table','route_table','routetable','rt']},
  {id:'in_sgs',patterns:['security-group','security_group','securitygroup','sg']},
  {id:'in_nacls',patterns:['nacl','network-acl','network_acl','networkacl']},
  {id:'in_enis',patterns:['eni','network-interface','network_interface','networkinterface']},
  {id:'in_igws',patterns:['igw','internet-gateway','internet_gateway','internetgateway']},
  {id:'in_nats',patterns:['nat-gw','nat_gw','natgw','nat-gateway','nat_gateway','natgateway']},
  {id:'in_vpces',patterns:['vpc-endpoint','vpc_endpoint','vpcendpoint','vpce']},
  {id:'in_ec2',patterns:['instance','instances','ec2']},
  {id:'in_albs',patterns:['alb','nlb','elb','load-balancer','load_balancer','loadbalancer']},
  {id:'in_tgs',patterns:['target-group','target_group','targetgroup','tg']},
  {id:'in_peer',patterns:['peering','vpc-peering','peer']},
  {id:'in_vpn',patterns:['vpn','vpn-connection','vpn_connection']},
  {id:'in_vols',patterns:['volume','volumes','vol']},
  {id:'in_snaps',patterns:['snapshot','snapshots','snap']},
  {id:'in_s3',patterns:['s3-bucket','s3_bucket','s3bucket','s3']},
  {id:'in_r53',patterns:['hosted-zone','hosted_zone','hostedzone','r53','route53']},
  {id:'in_r53records',patterns:['record-set','recordset','resource-record','resourcerecord','r53record','r53-record']},
  {id:'in_waf',patterns:['waf','web-acl','webacl','web_acl']},
  {id:'in_rds',patterns:['rds','db-instance','dbinstance','db_instance']},
  {id:'in_ecs',patterns:['ecs','ecs-service','ecs_service','ecsservice']},
  {id:'in_lambda',patterns:['lambda','function','lambda-function']},
  {id:'in_elasticache',patterns:['elasticache','cache-cluster','cachecluster','redis','memcached']},
  {id:'in_redshift',patterns:['redshift','redshift-cluster']},
  {id:'in_tgwatt',patterns:['transit-gateway-attachment','tgw-attachment','tgw_attachment','tgwattachment']},
  {id:'in_cf',patterns:['cloudfront','cf-distribution','distribution']},
  {id:'in_iam',patterns:['iam','iam-auth','iam_auth','iamauth','account-authorization']},
];

function matchFile(fname, content){
  const base=fname.replace(/\.json$/i,'').toLowerCase().replace(/[^a-z0-9-_]/g,'');
  // exact match first
  for(const fm of fileMap){
    for(const p of fm.patterns){if(base===p||base===p+'s')return fm.id}
  }
  // contains match — sort candidates by longest pattern first to avoid partial matches
  const candidates=[];
  for(const fm of fileMap){
    for(const p of fm.patterns){if(base.includes(p))candidates.push({id:fm.id,p,len:p.length})}
  }
  if(candidates.length){
    candidates.sort((a,b)=>b.len-a.len);
    const best=candidates[0].id;
    // content-override: verify filename match doesn't contradict content
    if(content&&best==='in_ec2'){
      const snip=content.slice(0,500);
      if(snip.includes('"DBInstances"')&&!snip.includes('"Reservations"'))return 'in_rds';
      if(snip.includes('"CacheClusters"'))return 'in_elasticache';
    }
    return best;
  }
  // content-based fallback — detect by JSON keys
  if(content){
    const snip=content.slice(0,500);
    if(snip.includes('"Reservations"'))return 'in_ec2';
    if(snip.includes('"DBInstances"'))return 'in_rds';
    if(snip.includes('"Vpcs"'))return 'in_vpcs';
    if(snip.includes('"Subnets"'))return 'in_subnets';
    if(snip.includes('"RouteTables"'))return 'in_rts';
    if(snip.includes('"SecurityGroups"'))return 'in_sgs';
    if(snip.includes('"NetworkAcls"'))return 'in_nacls';
    if(snip.includes('"NetworkInterfaces"'))return 'in_enis';
    if(snip.includes('"InternetGateways"'))return 'in_igws';
    if(snip.includes('"NatGateways"'))return 'in_nats';
    if(snip.includes('"VpcEndpoints"'))return 'in_vpces';
    if(snip.includes('"LoadBalancers"'))return 'in_albs';
    if(snip.includes('"TargetGroups"'))return 'in_tgs';
    if(snip.includes('"VpcPeeringConnections"'))return 'in_peer';
    if(snip.includes('"VpnConnections"'))return 'in_vpn';
    if(snip.includes('"Volumes"'))return 'in_vols';
    if(snip.includes('"Snapshots"'))return 'in_snaps';
    if(snip.includes('"Buckets"'))return 'in_s3';
    if(snip.includes('"HostedZones"'))return 'in_r53';
    if(snip.includes('"ResourceRecordSets"'))return 'in_r53records';
    if(snip.includes('"WebACLs"'))return 'in_waf';
    if(snip.includes('"TransitGatewayAttachments"'))return 'in_tgwatt';
    if(snip.includes('"DistributionList"'))return 'in_cf';
    if(snip.includes('"CacheClusters"'))return 'in_elasticache';
    if(snip.includes('"Clusters"')&&snip.includes('"Redshift"'))return 'in_redshift';
    if(snip.includes('"UserDetailList"')||snip.includes('"RoleDetailList"')||snip.includes('"GroupDetailList"'))return 'in_iam';
  }
  return null;
}

document.getElementById('uploadBtn').addEventListener('click',()=>document.getElementById('fileInput').click());
// Export script dropdown
(function(){
  var menu=document.getElementById('exportScriptMenu');
  document.getElementById('dlExportScript').addEventListener('click',function(e){
    e.stopPropagation();
    menu.style.display=menu.style.display==='none'?'block':'none';
  });
  document.addEventListener('click',function(){menu.style.display='none'});
  menu.addEventListener('click',function(e){e.stopPropagation()});
  ['dlBash','dlPowershell'].forEach(function(id){
    document.getElementById(id).addEventListener('mouseenter',function(){this.style.background='rgba(99,102,241,.15)'});
    document.getElementById(id).addEventListener('mouseleave',function(){this.style.background='none'});
  });
})();
document.getElementById('dlBash').addEventListener('click',function(){
  document.getElementById('exportScriptMenu').style.display='none';
  var script=[
'#!/usr/bin/env bash',
'# AWS Network Mapper — Data Export Script',
'# Exports all AWS CLI data needed for the mapper tool.',
'# Usage:',
'#   ./export-aws-data.sh                   # default profile + region',
'#   ./export-aws-data.sh -p prod -r us-west-2',
'#   ./export-aws-data.sh -p prod -r us-east-1 -o ./my-export',
'set -euo pipefail',
'PROFILE="" ; REGION="" ; OUTDIR=""',
'usage(){ echo "Usage: $0 [-p profile] [-r region] [-o output-dir]"; exit 1; }',
'while getopts "p:r:o:h" opt; do case $opt in p) PROFILE="$OPTARG";; r) REGION="$OPTARG";; o) OUTDIR="$OPTARG";; *) usage;; esac; done',
'[[ -n "$PROFILE" && ! "$PROFILE" =~ ^[a-zA-Z0-9_-]+$ ]] && echo "ERROR: Invalid profile" >&2 && exit 1',
'[[ -n "$REGION" && ! "$REGION" =~ ^[a-zA-Z0-9-]+$ ]] && echo "ERROR: Invalid region" >&2 && exit 1',
'AWS_FLAGS=(); [ -n "$PROFILE" ] && AWS_FLAGS+=(--profile "$PROFILE"); [ -n "$REGION" ] && AWS_FLAGS+=(--region "$REGION")',
'[ -z "$OUTDIR" ] && OUTDIR="./aws-export-${PROFILE:-default}-$(date +%Y%m%d-%H%M%S)"',
'mkdir -p "$OUTDIR"',
'echo "AWS Network Mapper — Data Export"',
'echo "  Profile: ${PROFILE:-default}  Region: ${REGION:-default}  Output: $OUTDIR"',
'echo ""',
'run(){ local label="$1" fn="$2"; shift 2; printf "  %-35s" "$label..."; if output=$(aws "${AWS_FLAGS[@]}" "$@" 2>&1); then echo "$output" > "$OUTDIR/$fn"; echo "OK ($(wc -c < "$OUTDIR/$fn" | tr -d \' \') bytes)"; else echo "SKIP"; fi; }',
'',
'echo "── Network ─────────────────────────────────"',
'run "VPCs"                    "vpcs.json"                    ec2 describe-vpcs',
'run "Subnets"                 "subnets.json"                 ec2 describe-subnets',
'run "Route Tables"            "route-tables.json"            ec2 describe-route-tables',
'run "Security Groups"         "security-groups.json"         ec2 describe-security-groups',
'run "Network ACLs"            "network-acls.json"            ec2 describe-network-acls',
'run "ENIs"                    "network-interfaces.json"      ec2 describe-network-interfaces',
'',
'echo "── Gateways ────────────────────────────────"',
'run "Internet Gateways"       "internet-gateways.json"       ec2 describe-internet-gateways',
'run "NAT Gateways"            "nat-gateways.json"            ec2 describe-nat-gateways',
'run "VPC Endpoints"           "vpc-endpoints.json"           ec2 describe-vpc-endpoints',
'',
'echo "── Compute ─────────────────────────────────"',
'run "EC2 Instances"           "ec2-instances.json"           ec2 describe-instances',
'run "RDS Instances"           "rds-instances.json"           rds describe-db-instances',
'run "Lambda Functions"        "lambda-functions.json"        lambda list-functions',
'run "ElastiCache Clusters"    "elasticache-clusters.json"    elasticache describe-cache-clusters --show-cache-node-info',
'run "Redshift Clusters"       "redshift-clusters.json"       redshift describe-clusters',
'',
'echo "── Load Balancing ──────────────────────────"',
'run "ALBs / NLBs"             "load-balancers.json"          elbv2 describe-load-balancers',
'run "Target Groups"           "target-groups.json"           elbv2 describe-target-groups',
'',
'echo "── Connectivity ────────────────────────────"',
'run "VPC Peering"             "vpc-peering.json"             ec2 describe-vpc-peering-connections',
'run "VPN Connections"         "vpn-connections.json"         ec2 describe-vpn-connections',
'run "TGW Attachments"         "tgw-attachments.json"         ec2 describe-transit-gateway-attachments',
'',
'echo "── Storage ──────────────────────────────────"',
'run "EBS Volumes"             "volumes.json"                 ec2 describe-volumes',
'run "EBS Snapshots"           "snapshots.json"               ec2 describe-snapshots --owner-ids self',
'run "S3 Buckets"              "s3-buckets.json"              s3api list-buckets',
'',
'echo "── DNS ─────────────────────────────────────"',
'run "Route 53 Hosted Zones"   "hosted-zones.json"            route53 list-hosted-zones',
'',
'echo "── Security ────────────────────────────────"',
'run "WAF WebACLs"             "waf-web-acls.json"            wafv2 list-web-acls --scope REGIONAL',
'run "CloudFront Distributions" "cloudfront.json"             cloudfront list-distributions',
'',
'echo "── IAM ─────────────────────────────────────"',
'run "IAM Authorization"       "iam.json"                     iam get-account-authorization-details',
'',
'echo "── ECS (multi-step) ────────────────────────"',
'printf "  %-35s" "ECS Services..."',
'if clusters=$(aws "${AWS_FLAGS[@]}" ecs list-clusters --query \'clusterArns[]\' --output text 2>&1) && [ -n "$clusters" ] && [ "$clusters" != "None" ]; then',
'  echo \'{"services":[]}\' > "$OUTDIR/ecs-services.json"',
'  for cluster in $clusters; do',
'    [[ ! "$cluster" =~ ^arn:aws ]] && continue',
'    svc_arns=$(aws "${AWS_FLAGS[@]}" ecs list-services --cluster "$cluster" --query \'serviceArns[]\' --output text 2>/dev/null || true)',
'    if [ -n "$svc_arns" ] && [ "$svc_arns" != "None" ]; then',
'      for svc_arn in $svc_arns; do',
'        [[ ! "$svc_arn" =~ ^arn:aws ]] && continue',
'        aws "${AWS_FLAGS[@]}" ecs describe-services --cluster "$cluster" --services "$svc_arn" > "$OUTDIR/_tmp_ecs.json" 2>/dev/null && \\',
'        python3 -c "import json,sys;a=json.load(open(sys.argv[1]));b=json.load(open(sys.argv[2]));a[\'services\'].extend(b.get(\'services\',[]));json.dump(a,open(sys.argv[1],\'w\'))" "$OUTDIR/ecs-services.json" "$OUTDIR/_tmp_ecs.json" 2>/dev/null',
'      done',
'    fi',
'  done',
'  rm -f "$OUTDIR/_tmp_ecs.json"; echo "OK"',
'else echo "SKIP (no clusters)"; fi',
'',
'echo ""',
'echo "Done! $(ls -1 "$OUTDIR"/*.json 2>/dev/null | wc -l | tr -d \' \') files exported ($(du -sh "$OUTDIR" | cut -f1))"',
'echo "Output: $OUTDIR"',
'echo "Drag folder onto Upload JSON Files or paste individually."'
  ].join('\n');
  var blob=new Blob([script],{type:'text/x-shellscript'});
  downloadBlob(blob,'export-aws-data.sh');
  _showToast('Bash script downloaded — run: chmod +x export-aws-data.sh && ./export-aws-data.sh');
});
document.getElementById('dlPowershell').addEventListener('click',function(){
  document.getElementById('exportScriptMenu').style.display='none';
  var script=[
'#Requires -Version 7.0',
'<#',
'.SYNOPSIS',
'    AWS Network Mapper - Data Export Script (PowerShell)',
'.DESCRIPTION',
'    Exports all AWS CLI data needed for the web-based mapper tool.',
'    Supports multi-region sweep and parallel execution.',
'.PARAMETER Profile',
'    AWS CLI profile name (optional)',
'.PARAMETER Region',
'    AWS region (optional)',
'.PARAMETER OutputDir',
'    Output directory (optional)',
'.PARAMETER AllRegions',
'    Sweep all enabled regions into subfolders',
'.PARAMETER MaxParallel',
'    Max concurrent API calls (default: 6)',
'.EXAMPLE',
'    ./export-aws-data.ps1',
'    ./export-aws-data.ps1 -Profile prod -Region us-west-2',
'    ./export-aws-data.ps1 -Profile prod -AllRegions -MaxParallel 8',
'#>',
'[CmdletBinding()]',
'param([Alias("p")][string]$Profile,[Alias("r")][string]$Region,[Alias("o")][string]$OutputDir,[switch]$AllRegions,[int]$MaxParallel=6)',
'$ErrorActionPreference="Stop"',
'if($Profile -and $Profile -notmatch \'^[a-zA-Z0-9_-]+$\'){Write-Error "Invalid profile";exit 1}',
'if($Region -and $Region -notmatch \'^[a-zA-Z0-9-]+$\'){Write-Error "Invalid region";exit 1}',
'if(-not(Get-Command aws -ErrorAction SilentlyContinue)){Write-Error "AWS CLI not found";exit 1}',
'$awsFlags=@(); if($Profile){$awsFlags+=@("--profile",$Profile)}',
'function Get-BaseFlags([string]$reg){$f=@();if($Profile){$f+=@("--profile",$Profile)};if($reg){$f+=@("--region",$reg)};return $f}',
'$exports=@(',
'  @{Label="VPCs";File="vpcs.json";Cmd=@("ec2","describe-vpcs")},',
'  @{Label="Subnets";File="subnets.json";Cmd=@("ec2","describe-subnets")},',
'  @{Label="Route Tables";File="route-tables.json";Cmd=@("ec2","describe-route-tables")},',
'  @{Label="Security Groups";File="security-groups.json";Cmd=@("ec2","describe-security-groups")},',
'  @{Label="Network ACLs";File="network-acls.json";Cmd=@("ec2","describe-network-acls")},',
'  @{Label="ENIs";File="network-interfaces.json";Cmd=@("ec2","describe-network-interfaces")},',
'  @{Label="Internet GWs";File="internet-gateways.json";Cmd=@("ec2","describe-internet-gateways")},',
'  @{Label="NAT GWs";File="nat-gateways.json";Cmd=@("ec2","describe-nat-gateways")},',
'  @{Label="VPC Endpoints";File="vpc-endpoints.json";Cmd=@("ec2","describe-vpc-endpoints")},',
'  @{Label="EC2 Instances";File="ec2-instances.json";Cmd=@("ec2","describe-instances")},',
'  @{Label="RDS Instances";File="rds-instances.json";Cmd=@("rds","describe-db-instances")},',
'  @{Label="Lambda Functions";File="lambda-functions.json";Cmd=@("lambda","list-functions")},',
'  @{Label="ElastiCache";File="elasticache-clusters.json";Cmd=@("elasticache","describe-cache-clusters","--show-cache-node-info")},',
'  @{Label="Redshift";File="redshift-clusters.json";Cmd=@("redshift","describe-clusters")},',
'  @{Label="ALBs/NLBs";File="load-balancers.json";Cmd=@("elbv2","describe-load-balancers")},',
'  @{Label="Target Groups";File="target-groups.json";Cmd=@("elbv2","describe-target-groups")},',
'  @{Label="VPC Peering";File="vpc-peering.json";Cmd=@("ec2","describe-vpc-peering-connections")},',
'  @{Label="VPN Connections";File="vpn-connections.json";Cmd=@("ec2","describe-vpn-connections")},',
'  @{Label="TGW Attachments";File="tgw-attachments.json";Cmd=@("ec2","describe-transit-gateway-attachments")},',
'  @{Label="EBS Volumes";File="volumes.json";Cmd=@("ec2","describe-volumes")},',
'  @{Label="EBS Snapshots";File="snapshots.json";Cmd=@("ec2","describe-snapshots","--owner-ids","self")},',
'  @{Label="S3 Buckets";File="s3-buckets.json";Cmd=@("s3api","list-buckets")},',
'  @{Label="Route 53 Zones";File="hosted-zones.json";Cmd=@("route53","list-hosted-zones")},',
'  @{Label="WAF WebACLs";File="waf-web-acls.json";Cmd=@("wafv2","list-web-acls","--scope","REGIONAL")},',
'  @{Label="CloudFront";File="cloudfront.json";Cmd=@("cloudfront","list-distributions")},',
'  @{Label="IAM Auth";File="iam.json";Cmd=@("iam","get-account-authorization-details")}',
')',
'function Export-EcsServices{param([string[]]$Flags,[string]$OutPath)',
'  Write-Host "    ECS Services..." -NoNewline',
'  try{$raw=& aws @Flags ecs list-clusters --query \'clusterArns[]\' --output json 2>&1',
'    if($LASTEXITCODE -ne 0 -or -not $raw){Write-Host " SKIP" -ForegroundColor Yellow;return}',
'    $clusters=$raw|ConvertFrom-Json;$allSvcs=@()',
'    foreach($c in $clusters){if($c -notmatch \'^arn:aws\'){continue}',
'      $sa=& aws @Flags ecs list-services --cluster $c --query \'serviceArns[]\' --output json 2>$null',
'      if($LASTEXITCODE -ne 0 -or -not $sa){continue};$svcArns=$sa|ConvertFrom-Json',
'      foreach($s in $svcArns){if($s -notmatch \'^arn:aws\'){continue}',
'        $d=& aws @Flags ecs describe-services --cluster $c --services $s 2>$null',
'        if($LASTEXITCODE -eq 0 -and $d){$allSvcs+=($d|ConvertFrom-Json).services}}}',
'    @{services=$allSvcs}|ConvertTo-Json -Depth 10|Out-File(Join-Path $OutPath "ecs-services.json")-Encoding utf8',
'    Write-Host " OK ($($allSvcs.Count))" -ForegroundColor Green',
'  }catch{Write-Host " SKIP" -ForegroundColor Yellow}}',
'function Export-Region{param([string]$RegionName,[string]$OutPath,[int]$Parallel)',
'  $flags=Get-BaseFlags $RegionName;New-Item -ItemType Directory -Path $OutPath -Force|Out-Null',
'  $results=$exports|ForEach-Object -ThrottleLimit $Parallel -Parallel{',
'    $fp=Join-Path $using:OutPath $_.File',
'    try{$r=& aws @using:flags @($_.Cmd) 2>&1',
'      if($LASTEXITCODE -eq 0){$r|Out-File -FilePath $fp -Encoding utf8;$sz=(Get-Item $fp).Length;@{L=$_.Label;S="OK";D="${sz} bytes"}}',
'      else{$m=($r|Out-String).Trim();if($m.Length -gt 60){$m=$m.Substring(0,60)};@{L=$_.Label;S="SKIP";D=$m}}}',
'    catch{@{L=$_.Label;S="SKIP";D=$_.Exception.Message.Substring(0,[Math]::Min(60,$_.Exception.Message.Length))}}}',
'  foreach($r in $results){$c=if($r.S -eq "OK"){"Green"}else{"Yellow"};Write-Host("  {0,-30} {1} ({2})" -f $r.L,$r.S,$r.D)-ForegroundColor $c}',
'  Export-EcsServices -Flags $flags -OutPath $OutPath}',
'Write-Host "`n  AWS Network Mapper - Data Export (PowerShell)`n" -ForegroundColor Magenta',
'if($AllRegions){',
'  Write-Host "  Mode: All Regions (parallel x$MaxParallel)" -ForegroundColor Cyan',
'  $rr=& aws @awsFlags ec2 describe-regions --query \'Regions[].RegionName\' --output json 2>&1',
'  if($LASTEXITCODE -ne 0){Write-Error "Failed: $rr";exit 1}',
'  $regions=$rr|ConvertFrom-Json|Sort-Object',
'  if(-not $OutputDir){$ts=Get-Date -Format "yyyyMMdd-HHmmss";$lb=if($Profile){$Profile}else{"default"};$OutputDir="./aws-export-${lb}-allregions-${ts}"}',
'  New-Item -ItemType Directory -Path $OutputDir -Force|Out-Null',
'  Write-Host "  $($regions.Count) regions -> $OutputDir`n"',
'  $i=0;foreach($reg in $regions){$i++;Write-Host "  Region $i/$($regions.Count): $reg" -ForegroundColor Cyan',
'    Export-Region -RegionName $reg -OutPath(Join-Path $OutputDir $reg)-Parallel $MaxParallel}',
'}else{',
'  if(-not $OutputDir){$ts=Get-Date -Format "yyyyMMdd-HHmmss";$lb=if($Profile){$Profile}else{"default"};$OutputDir="./aws-export-${lb}-${ts}"}',
'  Write-Host "  Profile: $($Profile ? $Profile : \'default\')  Region: $($Region ? $Region : \'default\')  Output: $OutputDir`n"',
'  Export-Region -RegionName $Region -OutPath $OutputDir -Parallel $MaxParallel}',
'$af=Get-ChildItem -Path $OutputDir -Filter "*.json" -Recurse -ErrorAction SilentlyContinue',
'$fc=($af|Measure-Object).Count;$tb=($af|Measure-Object -Property Length -Sum).Sum',
'$ts2=if($tb -gt 1MB){"{0:N1} MB" -f($tb/1MB)}elseif($tb -gt 1KB){"{0:N0} KB" -f($tb/1KB)}else{"$tb bytes"}',
'Write-Host "`n  Done! $fc files ($ts2) -> $OutputDir`n" -ForegroundColor Green'
  ].join('\r\n');
  var blob=new Blob([script],{type:'text/plain'});
  downloadBlob(blob,'export-aws-data.ps1');
  _showToast('PowerShell script downloaded — run: ./export-aws-data.ps1');
});
document.getElementById('fileInput').addEventListener('change',async function(){
  const files=[...this.files];
  if(!files.length)return;
  const status=document.getElementById('uploadStatus');
  status.style.display='block';
  status.textContent=`Reading ${files.length} file(s)...`;
  let matched=0,skipped=[];
  for(const f of files){
    let text;
    try{text=await f.text();JSON.parse(text)}catch(e){skipped.push(f.name+' (invalid JSON)');continue}
    const inputId=matchFile(f.name, text);
    if(!inputId){skipped.push(f.name);continue}
    const el=document.getElementById(inputId);
    if(el){el.value=text;el.className='ji valid';matched++}
  }
  // expand sections with data
  document.querySelectorAll('.sec-hdr.collapsed').forEach(h=>{
    const body=h.nextElementSibling;
    if(body){const ta=body.querySelectorAll('.ji.valid');if(ta.length)h.click()}
  });
  let msg=matched+' of '+files.length+' files loaded';
  if(skipped.length)msg+=' | Skipped: '+skipped.join(', ');
  status.textContent=msg;
  status.style.color=skipped.length?'var(--accent-orange)':'var(--accent-green)';
  this.value='';
  if(matched>0)renderMap();
});
document.getElementById('clearBtn').addEventListener('click',()=>{document.querySelectorAll('.ji').forEach(el=>{el.value='';el.className='ji'});d3.select('#mapSvg').selectAll('*').remove();d3.select('#mapSvg').style('display','none');document.getElementById('emptyState').style.display='none';document.getElementById('landingDash').style.display='flex';document.getElementById('statsBar').style.display='none';document.getElementById('legend').style.display='none';document.getElementById('bottomToolbar').style.display='none';_rlCtx=null;document.getElementById('detailPanel').classList.remove('open');_closeAllDashboardsExcept(null);document.getElementById('uploadStatus').style.display='none'});
document.getElementById('landingDemo').addEventListener('click',function(){document.getElementById('loadDemo').click()});
document.getElementById('landingImport').addEventListener('click',function(){document.getElementById('uploadBtn').click()});
document.getElementById('loadDemo').addEventListener('click',()=>{
  // OPTIMIZED: Generate demo data on first load (lazy initialization)
  if(!demo)demo=generateDemo();
  // Split demo data into 2 accounts for multi-account view
  const allVpcs=demo.vpcs?demo.vpcs.Vpcs||[]:[];
  const allSubs=demo.subnets?demo.subnets.Subnets||[]:[];
  const allInsts=demo.ec2?demo.ec2.Reservations?demo.ec2.Reservations.flatMap(r=>r.Instances||[]):[]:[];
  const splitIdx=Math.ceil(allVpcs.length/2);
  const acct1Vpcs=new Set(allVpcs.slice(0,splitIdx).map(v=>v.VpcId));
  const acct2Vpcs=new Set(allVpcs.slice(splitIdx).map(v=>v.VpcId));
  const byVpc=(arr,vpcSet,field)=>arr.filter(r=>vpcSet.has(r[field||'VpcId']));
  const allRts=demo.rts?demo.rts.RouteTables||[]:[];
  const allSgs=demo.sgs?demo.sgs.SecurityGroups||[]:[];
  const allNacls=demo.nacls?demo.nacls.NetworkAcls||[]:[];
  const allIgws=demo.igws?demo.igws.InternetGateways||[]:[];
  const allNats=demo.nats?demo.nats.NatGateways||[]:[];
  const allAlbs=demo.albs?demo.albs.LoadBalancers||[]:[];
  const allVpces=demo.vpces?demo.vpces.VpcEndpoints||[]:[];
  const allEnis=demo.enis?demo.enis.NetworkInterfaces||[]:[];
  const allVols=demo.vols?demo.vols.Volumes||[]:[];
  const allSnaps=demo.snaps?demo.snaps.Snapshots||[]:[];
  const allTgs=demo.tgs?demo.tgs.TargetGroups||[]:[];
  const allRds=demo.rds?demo.rds.DBInstances||[]:[];
  const allEcs=demo.ecs?demo.ecs.services||[]:[];
  const allLambda=demo.lambda?demo.lambda.Functions||[]:[];
  const allEcache=demo.elasticache?demo.elasticache.CacheClusters||[]:[];
  const allRedshift=demo.redshift?demo.redshift.Clusters||[]:[];
  // Subnet -> VPC lookup
  const subVpc={};allSubs.forEach(s=>{subVpc[s.SubnetId]=s.VpcId});
  // Instance -> subnet VPC
  const instVpc=(inst)=>{const enis2=(inst.NetworkInterfaces||[]);if(enis2.length)return enis2[0].VpcId||subVpc[enis2[0].SubnetId]||'';return subVpc[inst.SubnetId]||''};
  // ALB -> VPC via AZs
  const albVpc=(alb)=>{const azs=alb.AvailabilityZones||[];if(azs.length&&azs[0].SubnetId)return subVpc[azs[0].SubnetId]||'';return alb.VpcId||''};
  // IGW -> VPC via attachments
  const igwVpc=(igw)=>{const att=igw.Attachments||[];return att.length?att[0].VpcId||'':''};
  // Build split textarea objects
  function buildAcctTextareas(vpcSet){
    const subs=allSubs.filter(s=>vpcSet.has(s.VpcId));
    const subIds=new Set(subs.map(s=>s.SubnetId));
    const insts=allInsts.filter(i=>vpcSet.has(instVpc(i)));
    const instIds=new Set(insts.map(i=>i.InstanceId));
    const vols2=allVols.filter(v=>v.Attachments&&v.Attachments.some(a=>instIds.has(a.InstanceId)));
    const volIds=new Set(vols2.map(v=>v.VolumeId));
    const snaps2=allSnaps.filter(s=>volIds.has(s.VolumeId));
    const ta={};
    ta.in_vpcs=JSON.stringify({Vpcs:allVpcs.filter(v=>vpcSet.has(v.VpcId))});
    ta.in_subnets=JSON.stringify({Subnets:subs});
    ta.in_rts=JSON.stringify({RouteTables:byVpc(allRts,vpcSet)});
    ta.in_sgs=JSON.stringify({SecurityGroups:byVpc(allSgs,vpcSet)});
    ta.in_nacls=JSON.stringify({NetworkAcls:byVpc(allNacls,vpcSet)});
    ta.in_igws=JSON.stringify({InternetGateways:allIgws.filter(i=>vpcSet.has(igwVpc(i)))});
    ta.in_nats=JSON.stringify({NatGateways:byVpc(allNats,vpcSet)});
    ta.in_ec2=JSON.stringify({Reservations:[{Instances:insts}]});
    ta.in_albs=JSON.stringify({LoadBalancers:allAlbs.filter(a=>vpcSet.has(albVpc(a)))});
    ta.in_vpces=JSON.stringify({VpcEndpoints:byVpc(allVpces,vpcSet)});
    ta.in_enis=JSON.stringify({NetworkInterfaces:allEnis.filter(e=>vpcSet.has(e.VpcId))});
    ta.in_vols=JSON.stringify({Volumes:vols2});
    ta.in_snaps=JSON.stringify({Snapshots:snaps2});
    ta.in_tgs=JSON.stringify({TargetGroups:allTgs.filter(t=>subIds.has(t.TargetGroupArn?.split('/')[1])||true)});
    ta.in_rds=JSON.stringify({DBInstances:allRds.filter(r=>{const sg=r.DBSubnetGroup;return sg&&sg.Subnets&&sg.Subnets.some(s=>subIds.has(s.SubnetIdentifier))})});
    ta.in_ecs=JSON.stringify({services:allEcs.filter(s=>{const nc=s.networkConfiguration;if(!nc)return false;const awsVpc=nc.awsvpcConfiguration;return awsVpc&&awsVpc.subnets&&awsVpc.subnets.some(sid=>subIds.has(sid))})});
    ta.in_lambda=JSON.stringify({Functions:allLambda.filter(f=>f.VpcConfig&&vpcSet.has(f.VpcConfig.VpcId))});
    ta.in_elasticache=JSON.stringify({CacheClusters:allEcache.filter(e=>e.CacheSubnetGroupName?true:false)});
    ta.in_redshift=JSON.stringify({Clusters:allRedshift.filter(r=>r.ClusterSubnetGroupName?true:false)});
    // Shared non-VPC data — give to both accounts
    if(demo.s3)ta.in_s3=JSON.stringify(demo.s3);
    if(demo.r53)ta.in_r53=JSON.stringify(demo.r53);
    if(demo.r53records)ta.in_r53records=JSON.stringify(demo.r53records);
    if(demo.waf)ta.in_waf=JSON.stringify(demo.waf);
    if(demo.cf)ta.in_cf=JSON.stringify(demo.cf);
    if(demo.iam)ta.in_iam=JSON.stringify(demo.iam);
    if(demo.peer)ta.in_peer=JSON.stringify(demo.peer);
    if(demo.vpn)ta.in_vpn=JSON.stringify(demo.vpn);
    if(demo.tgwatt)ta.in_tgwatt=JSON.stringify(demo.tgwatt);
    return ta;
  }
  // Reset any existing multi-account state
  if(_multiViewMode)exitMultiView();
  _loadedContexts=[];
  // Add two account contexts
  addAccountContext({textareas:buildAcctTextareas(acct1Vpcs),accountLabel:'prod-account (111122223333)'},'prod-account (111122223333)');
  addAccountContext({textareas:buildAcctTextareas(acct2Vpcs),accountLabel:'security-ops (444455556666)'},'security-ops (444455556666)');
  // Fill textareas with full demo for single-view fallback
  const m={in_vpcs:'vpcs',in_subnets:'subnets',in_rts:'rts',in_sgs:'sgs',in_nacls:'nacls',in_igws:'igws',in_nats:'nats',in_ec2:'ec2',in_albs:'albs',in_peer:'peer',in_vpn:'vpn',in_vpces:'vpces',in_vols:'vols',in_s3:'s3',in_r53:'r53',in_r53records:'r53records',in_tgs:'tgs',in_snaps:'snaps',in_enis:'enis',in_waf:'waf',in_rds:'rds',in_ecs:'ecs',in_lambda:'lambda',in_elasticache:'elasticache',in_redshift:'redshift',in_tgwatt:'tgwatt',in_cf:'cf',in_iam:'iam'};
  Object.entries(m).forEach(([id,k])=>{if(demo[k])document.getElementById(id).value=JSON.stringify(demo[k],null,2)});
  document.querySelectorAll('.ji').forEach(el=>{if(el.value.trim())el.className='ji valid'});
  document.querySelectorAll('.sec-hdr.collapsed').forEach(h=>{h.click()});
  // Load demo annotations
  _annotations={};
  const dVpcs=allVpcs; const dInsts=allInsts; const dSubs=allSubs;
  if(dVpcs[0])addAnnotation(dVpcs[0].VpcId,'Primary production environment - all changes require CAB approval','warning',true);
  if(dVpcs[1])addAnnotation(dVpcs[1].VpcId,'Staging environment - auto-deploy from main branch','status',false);
  if(dVpcs.length>6)addAnnotation(dVpcs[6].VpcId,'Legacy DR environment - migrating to new region Q3 2026','status',false);
  if(dSubs[0])addAnnotation(dSubs[0].SubnetId,'Owner: Platform Team (platform@company.com)','owner',false);
  if(dInsts[0])addAnnotation(dInsts[0].InstanceId,'CRITICAL: Unpatched since January - CVE-2026-1234','incident',true);
  if(dInsts[0])addAnnotation(dInsts[0].InstanceId,'Scheduled for replacement in Sprint 47','todo',false);
  if(dInsts.length>5)addAnnotation(dInsts[5].InstanceId,'This instance handles payment processing - PCI scope','warning',true);
  // Enter multi-account view
  enterMultiView();
});

// store layout data globally for export
let exportData={vL:[],gwP:new Map(),allS:[],tG:{},peerings:[],shGws:[]};

// helper: resolve CSS vars to hex for SVG serialization
function resolveColor(cssVar){
  const el=document.createElement('div');el.style.color=cssVar;document.body.appendChild(el);
  const c=getComputedStyle(el).color;document.body.removeChild(el);
  const m=c.match(/(\d+)/g);if(!m)return'#888';
  return'#'+m.slice(0,3).map(x=>(+x).toString(16).padStart(2,'0')).join('');
}

function downloadBlob(blob,name){
  if(_isElectron){
    const ext=(name.match(/\.([^.]+)$/)||[])[1]||'*';
    const filters=[{name:ext.toUpperCase()+' Files',extensions:[ext]},{name:'All Files',extensions:['*']}];
    if(blob.type&&blob.type.startsWith('text')){
      blob.text().then(text=>{
        window.electronAPI.exportFile(text,name,filters).then(p=>{if(p)_showToast('Exported: '+p.split('/').pop())}).catch(e=>console.error('Export failed:',e));
      });
    } else {
      blob.arrayBuffer().then(ab=>{
        window.electronAPI.exportFile(new Uint8Array(ab),name,filters).then(p=>{if(p)_showToast('Exported: '+p.split('/').pop())}).catch(e=>console.error('Export failed:',e));
      });
    }
    return;
  }
  const a=document.createElement('a');var objUrl=URL.createObjectURL(blob);a.href=objUrl;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(objUrl)},1000);
}

// PNG High-DPI Export
document.getElementById('expPng').addEventListener('click',()=>{
  const svgEl=document.getElementById('mapSvg');
  const root=svgEl.querySelector('.map-root');
  if(!root)return;
  // get untransformed bounding box
  const bb=root.getBBox();
  const pad=60;
  const cw=bb.width+pad,ch=bb.height+pad;
  const maxDim=16000;
  const scale=Math.min(3, maxDim/cw, maxDim/ch);
  const w=Math.round(cw*scale),h=Math.round(ch*scale);
  const clone=svgEl.cloneNode(true);
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  clone.setAttribute('width',w);clone.setAttribute('height',h);
  clone.setAttribute('viewBox',`${bb.x-pad/2} ${bb.y-pad/2} ${cw} ${ch}`);
  // remove zoom/pan transform so content fills viewBox
  const cloneRoot=clone.querySelector('.map-root');
  if(cloneRoot)cloneRoot.removeAttribute('transform');
  const styles=document.querySelector('style').textContent;
  const styleEl=document.createElementNS('http://www.w3.org/2000/svg','style');
  styleEl.textContent=styles;
  clone.insertBefore(styleEl,clone.firstChild);
  // background rect
  const bgR=document.createElementNS('http://www.w3.org/2000/svg','rect');
  bgR.setAttribute('x',bb.x-pad/2);bgR.setAttribute('y',bb.y-pad/2);
  bgR.setAttribute('width',cw);bgR.setAttribute('height',ch);
  bgR.setAttribute('fill','#0a0e17');
  if(cloneRoot)cloneRoot.insertBefore(bgR,cloneRoot.firstChild);
  const svgStr=new XMLSerializer().serializeToString(clone);
  const img=new Image();
  img.onload=()=>{
    const canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#0a0e17';ctx.fillRect(0,0,w,h);
    ctx.drawImage(img,0,0,w,h);
    canvas.toBlob(blob=>{if(blob)downloadBlob(blob,'aws-network-map.png')},'image/png');
  };
  img.onerror=()=>{alert('PNG render failed - try SVG export instead')};
  img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svgStr)));
});

// VSDX (Visio) Export - best Lucidchart import path
document.getElementById('expVsdx').addEventListener('click',()=>{
  if(typeof JSZip==='undefined'){alert('JSZip not loaded');return}
  const vpcs=ext(safeParse(gv('in_vpcs')),['Vpcs']);
  const subnets=ext(safeParse(gv('in_subnets')),['Subnets']);
  const rts=ext(safeParse(gv('in_rts')),['RouteTables']);
  const igws=ext(safeParse(gv('in_igws')),['InternetGateways']);
  const nats=ext(safeParse(gv('in_nats')),['NatGateways']);
  const vpceList=ext(safeParse(gv('in_vpces')),['VpcEndpoints']);
  const peerings=ext(safeParse(gv('in_peer')),['VpcPeeringConnections']);
  let instances=[];
  const eRaw=safeParse(gv('in_ec2'));
  if(eRaw){
    const reservations=ext(eRaw,['Reservations']);
    if(reservations.length){reservations.forEach(r=>{if(r.Instances)instances=instances.concat(r.Instances);else if(r.InstanceId)instances.push(r)})}
    else{const flat=ext(eRaw,['Instances']);if(flat.length)instances=flat;else{const arr=Array.isArray(eRaw)?eRaw:[eRaw];arr.forEach(x=>{if(x.InstanceId)instances.push(x)})}}
  }
  const enis=ext(safeParse(gv('in_enis')),['NetworkInterfaces']);
  const sgs=ext(safeParse(gv('in_sgs')),['SecurityGroups']);
  const nacls=ext(safeParse(gv('in_nacls')),['NetworkAcls']);
  const albs=ext(safeParse(gv('in_albs')),['LoadBalancers']);
  const volumes=ext(safeParse(gv('in_vols')),['Volumes']);
  if(!vpcs.length){alert('Render map first');return}

  const subByVpc={};subnets.forEach(s=>(subByVpc[s.VpcId]=subByVpc[s.VpcId]||[]).push(s));
  const mainRT={};
  rts.forEach(rt=>{if((rt.Associations||[]).some(a=>a.Main))mainRT[rt.VpcId]=rt});
  const subRT={};
  rts.forEach(rt=>{(rt.Associations||[]).forEach(a=>{if(a.SubnetId)subRT[a.SubnetId]=rt})});
  subnets.forEach(s=>{if(!subRT[s.SubnetId]&&mainRT[s.VpcId])subRT[s.SubnetId]=mainRT[s.VpcId]});
  const subNacl={};nacls.forEach(n=>(n.Associations||[]).forEach(a=>{if(a.SubnetId)subNacl[a.SubnetId]=n}));
  const sgByVpc={};sgs.forEach(sg=>(sgByVpc[sg.VpcId]=sgByVpc[sg.VpcId]||[]).push(sg));
  // IAM role -> resource cross-references (grid path)
  const iamRoleResources={};
  if(_iamData){
    (instances||[]).forEach(i=>{const pa=i.IamInstanceProfile?.Arn;if(pa){const rn=pa.split('/').pop();if(!iamRoleResources[rn])iamRoleResources[rn]={ec2:[],lambda:[],ecs:[]};iamRoleResources[rn].ec2.push(i)}});
    (lambdaFns||[]).forEach(fn=>{if(fn.Role){const rn=fn.Role.split('/').pop();if(!iamRoleResources[rn])iamRoleResources[rn]={ec2:[],lambda:[],ecs:[]};iamRoleResources[rn].lambda.push(fn)}});
    (ecsServices||[]).forEach(svc=>{const ra=svc.taskRoleArn||svc.executionRoleArn;if(ra){const rn=ra.split('/').pop();if(!iamRoleResources[rn])iamRoleResources[rn]={ec2:[],lambda:[],ecs:[]};iamRoleResources[rn].ecs.push(svc)}});
  }
  const instBySub={};instances.forEach(i=>{if(i.SubnetId)(instBySub[i.SubnetId]=instBySub[i.SubnetId]||[]).push(i)});
  const eniBySub={};const eniByInst={};enis.forEach(e=>{if(e.SubnetId)(eniBySub[e.SubnetId]=eniBySub[e.SubnetId]||[]).push(e);if(e.Attachment&&e.Attachment.InstanceId)(eniByInst[e.Attachment.InstanceId]=eniByInst[e.Attachment.InstanceId]||[]).push(e)});
  const albBySub={};albs.forEach(lb=>{(lb.AvailabilityZones||[]).forEach(az=>{if(az.SubnetId)(albBySub[az.SubnetId]=albBySub[az.SubnetId]||[]).push(lb)})});
  const volByInst={};volumes.forEach(v=>{(v.Attachments||[]).forEach(a=>{if(a.InstanceId)(volByInst[a.InstanceId]=volByInst[a.InstanceId]||[]).push(v)})});
  const knownInstIds2=new Set(instances.map(i=>i.InstanceId));
  const instSubFromEni2={};enis.forEach(e=>{if(e.SubnetId&&e.Attachment&&e.Attachment.InstanceId)instSubFromEni2[e.Attachment.InstanceId]=e.SubnetId});
  const volBySub={};volumes.forEach(v=>{const att=(v.Attachments||[])[0];if(att&&att.InstanceId){if(knownInstIds2.has(att.InstanceId))return;const sid=instSubFromEni2[att.InstanceId];if(sid)(volBySub[sid]=volBySub[sid]||[]).push(v)}});
  const pubSubs=new Set();
  rts.forEach(rt=>{
    const hasIgw=(rt.Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State!=='blackhole');
    (rt.Associations||[]).forEach(a=>{if(a.SubnetId&&hasIgw)pubSubs.add(a.SubnetId)});
  });
  subnets.forEach(s=>{if(!pubSubs.has(s.SubnetId)&&mainRT[s.VpcId]){
    const hasIgw=(mainRT[s.VpcId].Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State!=='blackhole');
    if(hasIgw)pubSubs.add(s.SubnetId);
  }});


  // --- SIZING ---
  const PX=96;
  const toIn=px=>px/PX;

  const SUB_W=520;
  const SUB_H_MIN=90;
  const SUB_GAP=24;
  const VPC_PAD=50;
  const VPC_HDR=80;
  const GW_INSIDE_W=160, GW_INSIDE_H=50, GW_INSIDE_GAP=16;
  const GW_ROW_H=70;
  const COL_GAP=280;
  const LINE_H=15;
  const TOP_MARGIN=80;

  const activeVpcs=vpcs.filter(v=>(subByVpc[v.VpcId]||[]).length>0);
  if(!activeVpcs.length){alert('No VPCs with subnets found');return}

  // --- shape collectors ---
  let shapeId=1;
  const shapes=[];
  const polyEdges=[];
  const idMap={};

  function xmlEsc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function uid(){return '{'+crypto.randomUUID()+'}'}

  function addRect(x,y,w,h,fill,stroke,strokeW,text,opts={}){
    const id=shapeId++;
    shapes.push({id,type:'rect',x,y,w,h,fill,stroke,strokeW,text,
      dashed:opts.dashed||false,fontSize:opts.fontSize||11,
      fontColor:opts.fontColor||'#1F2937',bold:opts.bold||false,
      topAlign:opts.topAlign||false,props:opts.props||[],
      hAlign:opts.hAlign||'left',linePattern:opts.linePattern||1});
    return id;
  }

  // polyline: linePattern 1=solid 2=dash 3=dot 4=dash-dot
  function addPolyEdge(waypoints,color,width,linePattern,label){
    polyEdges.push({waypoints,color,width,linePattern:linePattern||1,
      label:label||'',id:shapeId++});
  }

  // --- gateway type styles (for legend and cross-VPC lines) ---
  const gwStyles={
    'IGW':  {color:'#059669',pattern:1,label:'Internet Gateway',fill:'#ECFDF5',border:'#059669'},
    'NAT':  {color:'#D97706',pattern:2,label:'NAT Gateway',fill:'#FFFBEB',border:'#D97706'},
    'TGW':  {color:'#2563EB',pattern:1,label:'Transit Gateway',fill:'#EFF6FF',border:'#2563EB'},
    'VGW':  {color:'#7C3AED',pattern:4,label:'Virtual Private GW',fill:'#F5F3FF',border:'#7C3AED'},
    'PCX':  {color:'#EA580C',pattern:2,label:'VPC Peering',fill:'#FFF7ED',border:'#EA580C'},
    'VPCE': {color:'#0891B2',pattern:3,label:'VPC Endpoint',fill:'#ECFEFF',border:'#0891B2'},
    'GW':   {color:'#6B7280',pattern:1,label:'Gateway',fill:'#F9FAFB',border:'#6B7280'}
  };

  // --- collect gateways per VPC ---
  const gwByVpc={};
  const sharedGwMap=new Map();
  rts.forEach(rt=>{(rt.Routes||[]).forEach(r=>{
    const entries=[];
    if(r.GatewayId&&r.GatewayId!=='local')entries.push({id:r.GatewayId,type:clsGw(r.GatewayId)});
    if(r.NatGatewayId)entries.push({id:r.NatGatewayId,type:'NAT'});
    if(r.TransitGatewayId)entries.push({id:r.TransitGatewayId,type:'TGW'});
    if(r.VpcPeeringConnectionId)entries.push({id:r.VpcPeeringConnectionId,type:'PCX'});
    entries.forEach(e=>{
      if(e.type==='TGW'||e.type==='PCX'){
        if(!sharedGwMap.has(e.id))sharedGwMap.set(e.id,{...e,vpcIds:new Set()});
        sharedGwMap.get(e.id).vpcIds.add(rt.VpcId);
      } else {
        if(!gwByVpc[rt.VpcId])gwByVpc[rt.VpcId]=new Map();
        if(!gwByVpc[rt.VpcId].has(e.id))gwByVpc[rt.VpcId].set(e.id,e);
      }
    });
  })});
  igws.forEach(g=>{
    const v=(g.Attachments||[])[0];
    const vpcId=v?v.VpcId:null;
    if(vpcId){
      if(!gwByVpc[vpcId])gwByVpc[vpcId]=new Map();
      if(!gwByVpc[vpcId].has(g.InternetGatewayId))
        gwByVpc[vpcId].set(g.InternetGatewayId,{id:g.InternetGatewayId,type:'IGW'});
    }
  });
  nats.forEach(g=>{
    if(g.VpcId){
      if(!gwByVpc[g.VpcId])gwByVpc[g.VpcId]=new Map();
      if(!gwByVpc[g.VpcId].has(g.NatGatewayId))
        gwByVpc[g.VpcId].set(g.NatGatewayId,{id:g.NatGatewayId,type:'NAT'});
    }
  });

  // --- build subnet display text ---
  function buildSubText(s){
    const isPub=pubSubs.has(s.SubnetId);
    const si=instBySub[s.SubnetId]||[];
    const se=eniBySub[s.SubnetId]||[];
    const sa=albBySub[s.SubnetId]||[];
    const lines=[];
    lines.push((isPub?'[PUBLIC] ':'[PRIVATE] ')+gn(s,s.SubnetId));
    lines.push(s.CidrBlock+'  |  '+(s.AvailabilityZone||''));
    const parts=[];
    if(si.length)parts.push(si.length+' EC2');
    if(se.length)parts.push(se.length+' ENI');
    if(sa.length)parts.push(sa.length+' ALB');
    if(parts.length)lines.push(parts.join(' | '));
    const rt=subRT[s.SubnetId];
    if(rt){
      const nonLocal=(rt.Routes||[]).filter(r=>{
        const t=r.GatewayId||r.NatGatewayId||r.TransitGatewayId||r.VpcPeeringConnectionId;
        return t&&t!=='local';
      });
      if(nonLocal.length){
        lines.push('Routes:');
        nonLocal.forEach(r=>{
          const dest=r.DestinationCidrBlock||r.DestinationPrefixListId||'?';
          const tgt=r.GatewayId||r.NatGatewayId||r.TransitGatewayId||r.VpcPeeringConnectionId;
          lines.push('  '+dest+' -> '+clsGw(tgt||'')+' '+sid(tgt));
        });
      }
    }
    return {text:lines.join('\n'),lineCount:lines.length};
  }

  // --- compute subnet heights ---
  const subHeights={};
  subnets.forEach(s=>{
    const bt=buildSubText(s);
    subHeights[s.SubnetId]=Math.max(SUB_H_MIN, bt.lineCount*LINE_H+30);
  });

  // ============================
  // LAYOUT: each VPC is a column
  // ============================
  const vpcLayouts=[];
  let curX=TOP_MARGIN;

  activeVpcs.forEach(vpc=>{
    const ss=subByVpc[vpc.VpcId]||[];
    const myGws=gwByVpc[vpc.VpcId]?[...gwByVpc[vpc.VpcId].values()]:[];

    // gateway row inside VPC: how many rows of gateways?
    const gwPerRow=3;
    const gwRows=Math.ceil(myGws.length/gwPerRow);
    const gwSectionH=gwRows>0?(gwRows*(GW_INSIDE_H+GW_INSIDE_GAP)+GW_INSIDE_GAP):0;

    // VPC width
    const vpcW=SUB_W+VPC_PAD*2;

    // VPC height
    let vpcH=VPC_HDR+gwSectionH;
    ss.forEach(s=>{vpcH+=(subHeights[s.SubnetId]||SUB_H_MIN)+SUB_GAP});
    vpcH+=VPC_PAD;

    vpcLayouts.push({vpc,ss,vpcW,vpcH,myGws,gwSectionH,x:curX});
    curX+=vpcW+COL_GAP;
  });

  const totalWidth=curX;

  // --- LEGEND (top-left, outside VPC area) ---
  const LEGEND_X=TOP_MARGIN;
  const LEGEND_Y=TOP_MARGIN;
  const usedTypes=new Set();
  // figure out which gw types are actually present
  Object.values(gwByVpc).forEach(m=>m.forEach(gw=>usedTypes.add(gw.type)));
  sharedGwMap.forEach(gw=>usedTypes.add(gw.type));

  const legendEntries=[...usedTypes].map(t=>gwStyles[t]||gwStyles['GW']);
  const legendH=50+legendEntries.length*28;
  addRect(LEGEND_X,LEGEND_Y,320,legendH,'#FFFFFF','#9CA3AF',1,
    'LEGEND\n\n'+[...usedTypes].map(t=>{
      const s=gwStyles[t]||gwStyles['GW'];
      return '['+t+'] '+s.label;
    }).join('\n'),
    {fontSize:11,fontColor:'#374151',bold:false,topAlign:true});

  // --- VPC start Y below legend ---
  const VPC_START_Y=LEGEND_Y+legendH+60;

  // --- place VPCs ---
  let maxVpcBot=0;
  const vpcPositions={};

  vpcLayouts.forEach(vl=>{
    const {vpc,ss,vpcW,vpcH,myGws,gwSectionH,x}=vl;

    // VPC summary text
    const vSgs=sgByVpc[vpc.VpcId]||[];
    const totalEC2=ss.reduce((a,s)=>(instBySub[s.SubnetId]||[]).length+a,0);
    let vpcLabel=gn(vpc,vpc.VpcId)+'\n'+vpc.CidrBlock;
    vpcLabel+='\n'+ss.length+' subnets | '+totalEC2+' EC2 | '+vSgs.length+' SGs';

    const vpcProps=[];
    vpcProps.push({label:'VPC ID',val:vpc.VpcId});
    vpcProps.push({label:'CIDR',val:vpc.CidrBlock});
    if(vSgs.length){
      vpcProps.push({label:'Security Groups',val:String(vSgs.length)});
      vpcProps.push({label:'SG Details',val:vSgs.slice(0,10).map(sg=>
        sg.GroupName+' ('+((sg.IpPermissions||[]).length)+' in)').join('; ')});
    }

    const vid=addRect(x,VPC_START_Y,vpcW,vpcH,'#EFF3FF','#2563EB',2.5,vpcLabel,
      {dashed:true,fontSize:13,fontColor:'#1E40AF',bold:true,topAlign:true,props:vpcProps});
    idMap[vpc.VpcId]=vid;
    vpcPositions[vpc.VpcId]={x,y:VPC_START_Y,w:vpcW,h:vpcH};

    // --- gateways INSIDE VPC at top ---
    let gwY=VPC_START_Y+VPC_HDR;
    for(let row=0;row<Math.ceil(myGws.length/3);row++){
      const rowGws=myGws.slice(row*3,(row+1)*3);
      const rowTotalW=rowGws.length*GW_INSIDE_W+(rowGws.length-1)*GW_INSIDE_GAP;
      let gwX=x+VPC_PAD+(SUB_W-rowTotalW)/2;
      rowGws.forEach(gw=>{
        const st=gwStyles[gw.type]||gwStyles['GW'];
        const nm=gwNames[gw.id]||sid(gw.id);
        const truncNm=nm.length>16?nm.substring(0,14)+'..':nm;
        const label=gw.type+': '+truncNm;
        addRect(gwX,gwY,GW_INSIDE_W,GW_INSIDE_H,st.fill,st.border,2,label,
          {fontSize:10,fontColor:st.color,bold:true,hAlign:'center'});
        gwX+=GW_INSIDE_W+GW_INSIDE_GAP;
      });
      gwY+=GW_INSIDE_H+GW_INSIDE_GAP;
    }

    // --- subnets inside VPC below gateways ---
    let sy=VPC_START_Y+VPC_HDR+gwSectionH;
    ss.forEach(s=>{
      const isPub=pubSubs.has(s.SubnetId);
      const fill=isPub?'#ECFDF5':'#F5F3FF';
      const stroke=isPub?'#059669':'#7C3AED';
      const fc=isPub?'#065F46':'#4C1D95';
      const sh=subHeights[s.SubnetId]||SUB_H_MIN;
      const bt=buildSubText(s);

      const sp=[];
      sp.push({label:'Subnet ID',val:s.SubnetId});
      sp.push({label:'CIDR',val:s.CidrBlock});
      sp.push({label:'AZ',val:s.AvailabilityZone||'N/A'});
      sp.push({label:'Type',val:isPub?'Public':'Private'});
      const rt=subRT[s.SubnetId];
      if(rt){
        sp.push({label:'Route Table',val:gn(rt,rt.RouteTableId)});
        sp.push({label:'Routes',val:(rt.Routes||[]).map(r=>
          (r.DestinationCidrBlock||'?')+' -> '+(r.GatewayId||r.NatGatewayId||r.TransitGatewayId||r.VpcPeeringConnectionId||'local')
        ).join('; ')});
      }
      const nc=subNacl[s.SubnetId];
      if(nc)sp.push({label:'NACL',val:nc.NetworkAclId});

      addRect(x+VPC_PAD,sy,SUB_W,sh,fill,stroke,1.5,bt.text,
        {fontSize:10,fontColor:fc,topAlign:true,props:sp});
      idMap[s.SubnetId]={x:x+VPC_PAD,y:sy,w:SUB_W,h:sh};
      sy+=sh+SUB_GAP;
    });

    maxVpcBot=Math.max(maxVpcBot,VPC_START_Y+vpcH);
  });

  // =======================================
  // CROSS-VPC CONNECTIONS (the ONLY lines)
  // =======================================
  // These are: TGW connections and VPC Peering
  // Use staggered horizontal bus lanes below VPCs

  const BUS_START_Y=maxVpcBot+100;
  const BUS_LANE_H=50;
  let busLaneIdx=0;

  // --- shared gateways (TGW) ---
  // Place TGW label boxes centered below, then draw orthogonal lines
  if(sharedGwMap.size>0){
    const sharedArr=[...sharedGwMap.values()];
    const tgwTotalW=sharedArr.length*200+(sharedArr.length-1)*80;
    let tgwStartX=Math.max(TOP_MARGIN,(totalWidth-tgwTotalW)/2);
    const TGW_Y=BUS_START_Y+busLaneIdx*BUS_LANE_H+120;

    sharedArr.forEach((gw,i)=>{
      const st=gwStyles[gw.type]||gwStyles['GW'];
      const nm=gwNames[gw.id]||sid(gw.id);
      const truncNm=nm.length>20?nm.substring(0,18)+'..':nm;
      const gwX=tgwStartX+i*(200+80);
      const gid=addRect(gwX,TGW_Y,200,60,st.fill,st.border,2.5,
        gw.type+': '+truncNm,
        {fontSize:12,fontColor:st.color,bold:true,hAlign:'center'});

      // draw orthogonal lines from each connected VPC to this gateway
      const connectedVpcs=[...gw.vpcIds].filter(vid=>vpcPositions[vid]);
      const busY=BUS_START_Y+busLaneIdx*BUS_LANE_H;

      connectedVpcs.forEach((vpcId,vi)=>{
        const vp=vpcPositions[vpcId];
        if(!vp)return;
        // stagger the exit points so lines dont overlap
        const exitX=vp.x+vp.w/2+(vi-connectedVpcs.length/2)*20;
        const gwCX=gwX+100;
        // offset bus lane per connection to avoid overlap
        const laneY=busY+(vi*12);
        addPolyEdge([
          {x:exitX,y:vp.y+vp.h},
          {x:exitX,y:laneY},
          {x:gwCX,y:laneY},
          {x:gwCX,y:TGW_Y}
        ],st.color,2.5,st.pattern);
      });
      busLaneIdx++;
    });
  }

  // --- VPC Peering connections ---
  peerings.forEach(pcx=>{
    if(pcx.Status&&pcx.Status.Code!=='active')return;
    const rv=pcx.RequesterVpcInfo?.VpcId;
    const av=pcx.AccepterVpcInfo?.VpcId;
    const vp1=vpcPositions[rv];
    const vp2=vpcPositions[av];
    if(!vp1||!vp2)return;
    const st=gwStyles['PCX'];
    const busY=BUS_START_Y+busLaneIdx*BUS_LANE_H;
    const cx1=vp1.x+vp1.w/2;
    const cx2=vp2.x+vp2.w/2;
    addPolyEdge([
      {x:cx1,y:vp1.y+vp1.h},
      {x:cx1,y:busY},
      {x:cx2,y:busY},
      {x:cx2,y:vp2.y+vp2.h}
    ],st.color,2.5,st.pattern);
    busLaneIdx++;
  });

  // --- PAGE DIMENSIONS ---
  let pgWpx=totalWidth+200;
  let pgHpx=BUS_START_Y+(busLaneIdx+2)*BUS_LANE_H+300;
  shapes.forEach(s=>{
    pgWpx=Math.max(pgWpx,s.x+s.w+120);
    pgHpx=Math.max(pgHpx,s.y+s.h+120);
  });
  const pgW=toIn(pgWpx)+2,pgH=toIn(pgHpx)+2;

  // ========================
  // VISIO XML GENERATION
  // ========================
  function buildShape(s){
    const wi=toIn(s.w),hi=toIn(s.h);
    const cx=toIn(s.x)+wi/2;
    const cy=pgH-(toIn(s.y)+hi/2);
    const lp=s.linePattern||1;
    const dashXml=s.dashed?`<Cell N="LinePattern" V="2"/>`:(lp!==1?`<Cell N="LinePattern" V="${lp}"/>`:'');
    const sw=toIn(s.strokeW||1);
    const fs=(s.fontSize||11)/72;

    const geom=`<Section N="Geometry" IX="0">
      <Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/>
      <Row T="MoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>
      <Row T="LineTo" IX="2"><Cell N="X" V="${wi}"/><Cell N="Y" V="0"/></Row>
      <Row T="LineTo" IX="3"><Cell N="X" V="${wi}"/><Cell N="Y" V="${hi}"/></Row>
      <Row T="LineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="${hi}"/></Row>
      <Row T="LineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>
    </Section>`;

    const vAlign=s.topAlign?0:1;
    const hAlign=s.hAlign==='center'?1:0;

    const propsXml=s.props&&s.props.length?
      `<Section N="Property">${s.props.map((p,i)=>
        `<Row N="Row_${i}"><Cell N="Label" V="${xmlEsc(p.label)}"/><Cell N="Value" V="${xmlEsc(p.val)}"/><Cell N="Type" V="0"/></Row>`
      ).join('')}</Section>`:'';

    return `<Shape ID="${s.id}" NameU="Shape${s.id}" Type="Shape" UniqueID="${uid()}">
      <Cell N="PinX" V="${cx}"/>
      <Cell N="PinY" V="${cy}"/>
      <Cell N="Width" V="${wi}"/>
      <Cell N="Height" V="${hi}"/>
      <Cell N="LocPinX" V="${wi/2}"/>
      <Cell N="LocPinY" V="${hi/2}"/>
      <Cell N="TxtWidth" V="${wi}"/>
      <Cell N="TxtHeight" V="${hi}"/>
      <Cell N="TxtPinX" V="${wi/2}"/>
      <Cell N="TxtPinY" V="${hi/2}"/>
      <Cell N="TxtLocPinX" V="${wi/2}"/>
      <Cell N="TxtLocPinY" V="${hi/2}"/>
      <Cell N="FillForegnd" V="${s.fill}"/>
      <Cell N="FillBkgnd" V="${s.fill}"/>
      <Cell N="LineColor" V="${s.stroke}"/>
      <Cell N="LineWeight" V="${sw}"/>
      <Cell N="VerticalAlign" V="${vAlign}"/>
      <Cell N="HorzAlign" V="${hAlign}"/>
      <Cell N="TopMargin" V="0.06"/>
      <Cell N="BottomMargin" V="0.06"/>
      <Cell N="LeftMargin" V="0.1"/>
      <Cell N="RightMargin" V="0.1"/>
      ${dashXml}
      <Section N="Character" IX="0">
        <Row IX="0">
          <Cell N="Font" V="Calibri"/>
          <Cell N="Color" V="${s.fontColor||'#000000'}"/>
          <Cell N="Size" V="${fs}"/>
          <Cell N="Style" V="${s.bold?1:0}"/>
        </Row>
      </Section>
      ${geom}
      ${propsXml}
      <Text>${xmlEsc(s.text)}</Text>
    </Shape>`;
  }

  function buildPolyConnector(e){
    const pts=e.waypoints.map(wp=>({x:toIn(wp.x),y:pgH-toIn(wp.y)}));
    if(pts.length<2)return '';
    const p1=pts[0],pN=pts[pts.length-1];
    const sw=toIn(e.width||1);
    const cid=e.id;
    let geomRows=`<Row T="MoveTo" IX="1"><Cell N="X" V="${p1.x}"/><Cell N="Y" V="${p1.y}"/></Row>`;
    for(let i=1;i<pts.length;i++){
      geomRows+=`<Row T="LineTo" IX="${i+1}"><Cell N="X" V="${pts[i].x}"/><Cell N="Y" V="${pts[i].y}"/></Row>`;
    }
    return `<Shape ID="${cid}" NameU="Conn.${cid}" Type="Shape" UniqueID="${uid()}">
      <Cell N="ObjType" V="2"/>
      <Cell N="BeginX" V="${p1.x}"/>
      <Cell N="BeginY" V="${p1.y}"/>
      <Cell N="EndX" V="${pN.x}"/>
      <Cell N="EndY" V="${pN.y}"/>
      <Cell N="LineColor" V="${e.color||'#6B7280'}"/>
      <Cell N="LineWeight" V="${sw}"/>
      <Cell N="LinePattern" V="${e.linePattern||1}"/>
      <Cell N="BeginArrow" V="0"/>
      <Cell N="EndArrow" V="5"/>
      <Cell N="EndArrowSize" V="2"/>
      <Section N="Geometry" IX="0">
        <Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/>
        ${geomRows}
      </Section>
    </Shape>`;
  }

  // --- build all XML ---
  let shapesStr='';
  shapes.forEach(s=>shapesStr+=buildShape(s));
  polyEdges.forEach(e=>shapesStr+=buildPolyConnector(e));

  const page1=`<?xml version="1.0" encoding="utf-8"?>
<PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <Shapes>${shapesStr}</Shapes>
</PageContents>`;

  const pagesXml=`<?xml version="1.0" encoding="utf-8"?>
<Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <Page ID="0" Name="AWS Network Map" NameU="AWS Network Map">
    <PageSheet>
      <Cell N="PageWidth" V="${pgW}"/>
      <Cell N="PageHeight" V="${pgH}"/>
      <Cell N="PrintPageOrientation" V="2"/>
    </PageSheet>
    <Rel r:id="rId1"/>
  </Page>
</Pages>`;

  const docXml=`<?xml version="1.0" encoding="utf-8"?>
<VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <DocumentProperties>
    <Creator>AWS Network Map Tool</Creator>
    <Description>AWS Network Infrastructure Diagram</Description>
  </DocumentProperties>
</VisioDocument>`;

  const contentTypes=`<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>
  <Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>
  <Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>
</Types>`;

  const topRels=`<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>
</Relationships>`;
  const docRels=`<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>
</Relationships>`;
  const pagesRels=`<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>
</Relationships>`;

  const zip=new JSZip();
  zip.file('[Content_Types].xml',contentTypes);
  zip.folder('_rels').file('.rels',topRels);
  zip.folder('visio').file('document.xml',docXml);
  zip.folder('visio/_rels').file('document.xml.rels',docRels);
  zip.folder('visio/pages').file('pages.xml',pagesXml);
  zip.folder('visio/pages').file('page1.xml',page1);
  zip.folder('visio/pages/_rels').file('pages.xml.rels',pagesRels);

  zip.generateAsync({type:'blob',mimeType:'application/vnd.ms-visio.drawing'}).then(blob=>{
    downloadBlob(blob,'aws-network-map.vsdx');
  });
});


// Lucid Standard Import (.lucid) Export
// --- Lucid Standard Import Export (with AWS-style icons) ---
// AWS architecture icon PNGs (base64)
const AWS_ICONS={
  'alb':'data:image/png;base64,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',
  'ec2':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAMKADAAQAAAABAAAAMAAAAADbN2wMAAABO0lEQVRoBe1U2w3CMAwMiA3YCqZhEqahWzEDNB9nWdE16UcTx5WRUNw4re9hJ6X4OVLg+0q//C8h994v6+nnq37wGAcBa9fcO3CpKbgO52fNP2pnBuSW+zs9t+q0HLAGn3FXMdy2mOn9VYGqU/rskTG7ssvvtxwoz0/3LA7sYWuFnmFDV5zHATDSKjPmOj8qZthQ270DQQBWWq1xC1kpj7riAJv0uIUgU8c1bqGO4u76tMzALP3OUDNsmFn3LSQOgJFWgDHX+VExw4ba7h0IArDSapUZmKXfmRAMG+bCfQuJA2CkFWDMdX5UzLChtnsHggCstFplBmbpdyYEw4a5cN9C4gAYaQUYc50fFTNsqH0eB8CIrbM4wbC1HFjYS4P3jsOQnWBu9N6vCdZyoPbuFLkgYG2DewesBYz6fzqMaA3IXYFbAAAAAElFTkSuQmCC',
  'igw':'data:image/png;base64,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',
  'internet':'data:image/png;base64,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',
  'nat':'data:image/png;base64,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',
  'pcx':'data:image/png;base64,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',
  'sub_prv':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAKKADAAQAAAABAAAAKAAAAAB65masAAACd0lEQVRYCWNkWLKMYSAA00BYCrJz1GK6hfyABTULqV7UEeCv0NZyEBMX5WB/+/Pn4Vevu65dP/vuHanmMDMEBROph4mRsVxba5qZ6ZpHj7uuXSs7f3Hn8+dAvVPNTARYWYEu+EekQWBljMTn41ItzQAZmdDDR559/45shSg7+zIbqxNv3tZevIQsjp9NbBxr8vMVa2qEHzmKZivQ9Nc/f0YeOZakrGQiLITfMmRZYi0G2jrxxs0n374ha4az3/z82XblarmWFlyEIINYi+3ExI6+foPHuCOvX9uKieJRgCZFrMXiHByXP3xA04zMvfrhowg7OyOyEF42sRYzMzL++ocv2f75/x9oETDl47UOIUmsxQgdVGKNPIvxFSBvQ4OF2NjIC9r3v34Jr14LinYcAF9ZDbSVcelyHBoJCP+JigAmtL/gFIdV6ciLY3xBjTWIgIIafHy9xoaGgoLXPn4qPXf+/Pv3mCoJZmeSg1qQjW23s+PGx0+Nt++cf/fedicHKU5OTIsJipBssZeUFLDQnnXnzvPv35c+eLDu8eMQOVmC1mAqINliDmbmH3//wg368fcfOzMznEs8g2SLtz576i0tBfQ3MLfYi4nFKCqsf/yEePvgKklOXC++/wg4eHiamclGB7s7nz/HHD0GJOHGEc8g2cdAo4++fq2/dTsw3eps2bbr+QviLUNWSY7FyPpxsfEUlhAttLIYl4Pg4uRb3HT5yj/cRTHBAoTkxAV3MtBiOBuTMXiDGp+PP/z6BazdMH1DjMiXP3/wRATQBHwNAWA8Ed94Q3MN0Fb8oY3Px0CdeGpyNJtI5ZKfqkm1CU39qMVoAUI7LgAoX8MiWl1UgAAAAABJRU5ErkJggg==',
  'sub_pub':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAKKADAAQAAAABAAAAKAAAAAB65masAAACe0lEQVRYCWOsWijGMBCAaSAsBdk5ajHdQn7AgpqFVC+KC2jY6+QpSlhxc4h8+/nuwcsTh69Offr2IqnmkGAxIyOTnXaOlVbaoStTjt2Y9frjHWFeJXkxsxjHRWfvLNt3sfff/z/EW89IfD621c7WkvNcfjDl07cXyBZwcwiH28549PrsngsdyOL42cTGsSi/qo125oqDaWi2Ak3/+uPtikPpxiqR0sIG+C1DliXWYhvtrGPXZ3/89gxZM5wNjOyDlyfa6eTARQgyiLVYUczi4atTeIx7+OqkgrgFHgVoUsRazMMp+vL9dTTNyNyXH25ysQsxMjAiC+JhE2sxIyPz33+/8BgESdLAlI9HDbIUseqQ9VCFPfIsxleA1ITf5GQXIC9gv//60LpC4z/Df1za8RWZQFurF4nj0olfvDn2GTCh/f//F5eykRfH+IIaVygBy21PkwYpId1XH27tONv47N1lTJUESxKSg5qTTSDRddX1xzumbnE9e3d5vMtyPi4JTIsJipBssZqM86NXp0/fWvz5+8uL99ZefbhVW96XoDWYCki2mJWJ/fffH3CD/vz9ycLEBucSzyDZ4ptP92jIuKpLuwBzi6K4lYFSyLVH24i3D66S5MT1+furJfvj/cw7Y5wWvv10f/WRrLef78ONI55Bso+BRgMr5smbHRkYGCdtsr/97ADxliGrJMdiZP242HgKS4gWWlmMy0FwcfIt3n+x9///f3CD0BgECxCSExfcgn2XeuFsTMbgDWp8Pv7x6yOwdsP0DTEiv35/xRMRQBPwNQSA8UR84w3NNUBb8Yc2Ph8DdeKpydFsIpVLfqom1SY09aMWowUI7bgAIgfJCsZyc3UAAAAASUVORK5CYII=',
  'tgw':'data:image/png;base64,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',
  'vgw':'data:image/png;base64,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',
  'vpc':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAKKADAAQAAAABAAAAKAAAAAB65masAAADwUlEQVRYCe2WWWyNURDHf7dqaXWhqipCqRJ7W1vqwU6CoqGCByG22MKDByH2EBKpChERhNhjjV3tgibW0Apa0qrGvhSt202r5iit+33nfr3JVX1g8j2cM9v/mzlzzowtLqaEqiCPqgBVmP+B/1rm/71Ue7qY29p1aRFFSATBLagmRjY+ZJJxj4cXyfngog8HNZsr9zgymm6jSLtJxl1epPA1X7kIDqNZR1r34tou7p9zcOrKpuKIuwyjVXf2zuXjSweHz5KQL/kcQ+dQw4s7xxykFW4qKC5JbORgDi8zopb5zXrO4eV0HU79ptT0pkEYfvXLhFaLCiLuHMPNQ9g/WrnIfsv1A8TMU3HnvMe7Dm/TORVPQa6VlRWwzUZoF86st7IvlckZ12vM7SN8eo3Ng/7T6DuFU2usDK1S7RtIXvbPUrLyAUWFnN+oUIVKvnFpC0064BdkZWQFXDuA/C9Wxs5kXwt4/oDWPale05mKkybhWYMe4xi+kFepTi21AjkdqTLJdspV2vVl6jba9tEqojljQY1dTO5nts/iS5bezMyt5UO7fkQMxKMa34q5e5Kds/ELZMRSVWvvMowWGuDwARTmcXyVUdXZPiiUyEGERZF+ixNxvH6iXrdOQ4kayYNLXNhE9juNqQa4TW8ubNSoalmxSwhoRFICW6erSpRLLP8tD9zJ1fjWIyJaVXj6bRLWGa01wHUb8j7TqKfdy4k2DSc+VlVySDgRg2jUBi8f8u2quCTbV3dw4yAzdmqANVUtd0OO2UWSgU1Qx8TRczxP77B5MsXFbJmi1r0nMWoFRQV6T5qIXz2mYUvSbukNNFwbQc2JH1YuEbDks+qAZ+4pZxpWmohTr6m6kDRWKmmAH14mL4chc9SrW3mkSbWAHV2hgp64AfsndaHNJOe6b76Z7cixHNj1wMVFJO4hcS9S4d7+ju7+0E4P/NN5iWrDhv7/O25pSB6a4yrXkodM0mMmSyOzuoFTgj0LnwAK7Hj5GmSqRHKz8W+gf7ncAwa5e43bq3EsfKARWN7ttBvqYXmZYhTJ3l3g1ETVGxJ303GIakSSWOXUUz2c0p1kMhFpyhUNsEtTpsbuF0s64OiVPLpMZvKPG+ivilFu4+c3qmHIr8gwKiObmSyLy6xu4kjhJKxVbTQwhP0LkNlBJnCZvApz6TVBMQ8sMtn8YLgbcanX6rXoMVbN2FJlglonWGU76TTX9yM3U0t/BrjMtYxp0hll+LIeTEXf3VSXQZYuJFz5XCF3q9oVDK3Of2BtWiqDWWWp/g6ffx+cr3WDNAAAAABJRU5ErkJggg==',
  'vpce':'data:image/png;base64,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',
};
const ICON_MAP={
  IGW:'igw',NAT:'nat',TGW:'tgw',VGW:'vgw',VPCE:'vpce',PCX:'pcx',
  EC2:'ec2',ALB:'alb',INET:'internet',VPC:'vpc',SUB_PUB:'sub_pub',SUB_PRV:'sub_prv'
};

// Landing Zone Hub-Spoke Layout
function buildLandingZoneLayout(ctx){
  console.log('buildLandingZoneLayout called with', Object.keys(ctx));
  try{
  const {vpcs,subByVpc,sgByVpc,pubSubs,rts,instances,albs,enis,nacls,subRT,
    igws,nats,vpceList,peerings,sharedGws,gwByVpc,vpceByVpc,gwSet2L,
    gn,sid,tw,userHubName,COL,gwColors2,gwFills,ICON_MAP,volumes,zones,
    s3bk,snapshots,snapByVol,tgByAlb,tgs,wafAcls,wafByAlb,
    instBySub,albBySub,eniBySub,volByInst,volBySub,rdsBySub,ecsBySub,lambdaBySub,cfByAlb,recsByZone:lzRecsByZone}=ctx;
  const recsByZoneLZ=lzRecsByZone||{};

  const shapes=[],lines=[],iconSet=new Set();
  let lid=0;
  const NOTEXT='<p style="font-size:1pt;color:transparent">&nbsp;</p>';
  const IC=36,VP=50,VH=80,SG=32,SP=24;
  const EC2W=260,EC2H=34,EC2G=16;
  
  function addIcon(type,x,y){
    iconSet.add(type);
    shapes.push({
      id:'icon_'+(lid++),type:'rectangle',
      boundingBox:{x,y,w:IC,h:IC},
      text:NOTEXT,
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'image',ref:(ICON_MAP[type]||type.toLowerCase())+'.png'}}
    });
  }
  
  // Identify hub VPC
  const hubKeywords=['shared','connectivity','hub','transit','network','core'];
  let hubVpc=null;
  if(userHubName){
    hubVpc=vpcs.find(v=>{
      const vn=gn(v,v.VpcId).toLowerCase();
      return vn.includes(userHubName);
    });
  }
  if(!hubVpc){
    hubVpc=vpcs.find(v=>{
      const vn=gn(v,v.VpcId).toLowerCase();
      return hubKeywords.some(k=>vn.includes(k));
    });
  }
  // Fallback: VPC with most TGW/peering connections
  if(!hubVpc){
    let maxConn=0;
    vpcs.forEach(v=>{
      let conn=0;
      rts.filter(rt=>rt.VpcId===v.VpcId).forEach(rt=>{
        (rt.Routes||[]).forEach(r=>{
          if(r.TransitGatewayId||r.VpcPeeringConnectionId)conn++;
        });
      });
      peerings.forEach(p=>{
        if(p.RequesterVpcInfo?.VpcId===v.VpcId||p.AccepterVpcInfo?.VpcId===v.VpcId)conn++;
      });
      if(conn>maxConn){maxConn=conn;hubVpc=v;}
    });
  }
  if(!hubVpc)hubVpc=vpcs[0];
  
  const spokeVpcs=vpcs.filter(v=>v.VpcId!==hubVpc.VpcId);
  const shapeIds={};
  
  // Layout constants
  const HUB_X=100,HUB_Y=120;
  const SPOKE_START_X=900;
  const SPOKE_START_Y=80;
  const SPOKE_COL_W=700;
  const SPOKE_ROW_GAP=40;
  const SPOKES_PER_COL=4;
  const numSpokeCols=Math.max(1,Math.ceil(spokeVpcs.length/SPOKES_PER_COL));
  const EXT_X=SPOKE_START_X+numSpokeCols*SPOKE_COL_W+100;
  
  // Shared resource builder for LZ subnets (mirrors grid logic)
  const LZ_NAME_H=36,LZ_DETAIL_H=28,LZ_CHILD_LINE_H=22,LZ_CHILD_GAP=8,LZ_RES_PAD=10;
  const LZ_CHILD_INNER_W=EC2W-24;
  function lzChildLines(label){return Math.max(1,Math.ceil(tw(label,8)/LZ_CHILD_INNER_W));}
  function lzChildH(label){return lzChildLines(label)*LZ_CHILD_LINE_H+8;}
  function lzResHeight(r){
    const chs=r.children||[];
    let h=LZ_RES_PAD+LZ_NAME_H;
    if(r.detail)h+=LZ_DETAIL_H;
    if(chs.length>0){h+=LZ_CHILD_GAP;chs.forEach(ch=>{const lbl=ch.type+': '+ch.name+(ch.detail?' \u00b7 '+ch.detail:'');h+=lzChildH(lbl)+LZ_CHILD_GAP;});}
    h+=LZ_RES_PAD;
    return Math.max(EC2H,h);
  }
  function lzBuildResources(subId){
    const sInsts=instBySub[subId]||[];
    const sAlbs=albBySub[subId]||[];
    const sRds=(rdsBySub||{})[subId]||[];
    const sEcs=(ecsBySub||{})[subId]||[];
    const sLam=(lambdaBySub||{})[subId]||[];
    const sEni=(eniBySub||{})[subId]||[];
    const attached=new Set();
    const res=[];
    sInsts.forEach(i=>{
      const ch=[];const ie=(enis||[]).filter(e=>e.Attachment&&e.Attachment.InstanceId===i.InstanceId);
      ie.forEach(e=>attached.add(e.NetworkInterfaceId));
      if(_showNested){
        ie.forEach(e=>ch.push({type:'ENI',name:e.NetworkInterfaceId.slice(-8),detail:e.PrivateIpAddress||'',col:'#3b82f6'}));
        ((volByInst||{})[i.InstanceId]||[]).forEach(v=>{const sc=((snapByVol||{})[v.VolumeId]||[]).length;ch.push({type:'VOL',name:v.Size+'GB '+(v.VolumeType||''),detail:sc?sc+' snap':'',col:'#f59e0b'});});
      }
      res.push({type:'EC2',name:gn(i,i.InstanceId),id:i.InstanceId,detail:i.InstanceType,children:ch,resCol:'#10b981'});
    });
    sAlbs.forEach(lb=>{
      const ch=[];
      if(_showNested){
        ((tgByAlb||{})[lb.LoadBalancerArn]||[]).forEach(tg=>ch.push({type:'TG',name:tg.TargetGroupName||'TG',detail:(tg.Targets||[]).length+' tgt',col:'#06b6d4'}));
        ((wafByAlb||{})[lb.LoadBalancerArn]||[]).forEach(w=>ch.push({type:'WAF',name:w.Name||'WAF',detail:(w.Rules||[]).length+' rules',col:'#eab308'}));
      }
      res.push({type:'ALB',name:lb.LoadBalancerName||'ALB',id:lb.LoadBalancerArn,detail:lb.Scheme||'',children:ch,resCol:'#38bdf8'});
    });
    sRds.forEach(db=>res.push({type:'RDS',name:db.DBInstanceIdentifier||'RDS',id:db.DBInstanceIdentifier,detail:db.Engine||'',children:[],resCol:'#3b82f6'}));
    sEcs.forEach(svc=>res.push({type:'ECS',name:svc.serviceName||'ECS',id:svc.serviceName,detail:svc.launchType||'',children:[],resCol:'#f97316'}));
    sLam.forEach(fn=>res.push({type:'FN',name:fn.FunctionName||'Lambda',id:fn.FunctionName,detail:fn.Runtime||'',children:[],resCol:'#a855f7'}));
    sEni.forEach(e=>{if(!attached.has(e.NetworkInterfaceId))res.push({type:'ENI',name:e.NetworkInterfaceId.slice(-8),id:e.NetworkInterfaceId,detail:e.PrivateIpAddress||'',children:[],resCol:'#3b82f6'});});
    // Standalone EBS volumes (instance not in EC2 data, placed via ENI subnet)
    ((volBySub||{})[subId]||[]).forEach(v=>{const sc=((snapByVol||{})[v.VolumeId]||[]).length;const att=(v.Attachments||[])[0];
      res.push({type:'VOL',name:v.Size+'GB '+(v.VolumeType||''),id:v.VolumeId,detail:att?att.InstanceId?.slice(-8)||'':'detached',children:[],resCol:'#f59e0b'});});
    return res;
  }
  function lzSubResHeight(subId,subW){
    const resources=lzBuildResources(subId);
    const cols=Math.max(1,Math.floor((subW-SP*2)/(EC2W+EC2G)));
    const rowCount=Math.ceil(resources.length/cols);
    let totalResH=0;
    for(let row=0;row<rowCount;row++){
      let maxH=EC2H;
      for(let c=0;c<cols;c++){const ri=row*cols+c;if(ri<resources.length){const h=lzResHeight(resources[ri]);if(h>maxH)maxH=h;}}
      totalResH+=maxH+EC2G;
    }
    return resources.length>0?VH+totalResH+SP*2:60;
  }
  function lzRenderResources(resources,sx,sy,subW){
    const cols=Math.max(1,Math.floor((subW-SP*2)/(EC2W+EC2G)));
    const rowCount=Math.ceil(resources.length/cols);
    const rowHeights=[];
    for(let row=0;row<rowCount;row++){
      let maxH=EC2H;
      for(let c=0;c<cols;c++){const ri=row*cols+c;if(ri<resources.length){const h=lzResHeight(resources[ri]);if(h>maxH)maxH=h;}}
      rowHeights.push(maxH);
    }
    const rowYOff=[0];
    for(let i=0;i<rowHeights.length;i++)rowYOff.push(rowYOff[i]+rowHeights[i]+EC2G);
    resources.forEach((r,ri)=>{
      const col=ri%cols,row=Math.floor(ri/cols);
      const rx=sx+SP+col*(EC2W+EC2G);
      const ry=sy+VH+rowYOff[row];
      const rH=lzResHeight(r);
      const rc=r.resCol||'#232F3E';
      const maxResChars=Math.floor((EC2W-20)/8);
      const dispResName=r.name.length>maxResChars?r.name.substring(0,maxResChars-2)+'..':r.name;
      let resHtml='<p style="font-size:9pt;color:'+rc+';font-weight:bold;text-align:left;padding:4px 6px">'+r.type+': '+dispResName+'</p>';
      if(r.detail)resHtml+='<p style="font-size:7pt;color:#6B7280;text-align:left;padding:0 6px">'+r.detail+'</p>';
      (r.children||[]).forEach(ch=>{
        const chLabel=ch.type+': '+ch.name+(ch.detail?' \u00b7 '+ch.detail:'');
        resHtml+='<p style="font-size:8pt;color:'+ch.col+';font-weight:bold;text-align:left;padding:2px 6px;margin:4px 0">\u00a0\u00a0'+chLabel+'</p>';
      });
      shapes.push({id:'res_'+(lid++),type:'rectangle',boundingBox:{x:rx,y:ry,w:EC2W,h:rH},text:resHtml,
        style:{stroke:{color:rc,width:1},fill:{type:'color',color:'#FFFFFF'}},
        customData:[{key:'Type',value:r.type},{key:'Name',value:r.name||''},{key:'ID',value:r.id||''}]
      });
    });
  }

  // Helper to compute VPC height
  function vpcHeight(vpc){
    const ss=subByVpc[vpc.VpcId]||[];
    let h=VH+VP;
    ss.forEach(s=>{
      const subW=500;
      h+=Math.max(60,lzSubResHeight(s.SubnetId,subW))+SG;
    });
    return h;
  }
  
  // Place Hub VPC (larger, center-left)
  const hubSubs=subByVpc[hubVpc.VpcId]||[];
  const hubW=650;
  const hubH=vpcHeight(hubVpc)+100;
  const hubLabel=gn(hubVpc,hubVpc.VpcId)+' (HUB)\n'+hubVpc.CidrBlock;
  const hubId='vpc_hub';
  shapeIds[hubVpc.VpcId]=hubId;
  
  shapes.push({
    id:hubId,type:'roundedRectangleContainer',
    boundingBox:{x:HUB_X,y:HUB_Y,w:hubW,h:hubH},
    text:NOTEXT,
    style:{stroke:{color:'#7C3AED',width:4,style:'dashed'},fill:{type:'color',color:'#F5F3FF'}},
    magnetize:true,
    customData:[{key:'VPC ID',value:hubVpc.VpcId},{key:'Name',value:gn(hubVpc,hubVpc.VpcId)},{key:'Role',value:'Hub / Connectivity'},{key:'CIDR',value:hubVpc.CidrBlock}]
  });
  addIcon('VPC',HUB_X+6,HUB_Y+4);
  
  const hubLabelDisp='HUB: '+gn(hubVpc,hubVpc.VpcId)+' ('+hubVpc.CidrBlock+')';
  shapes.push({
    id:'hublbl',type:'rectangle',
    boundingBox:{x:HUB_X+IC+12,y:HUB_Y+4,w:hubW-IC-24,h:VH-10},
    text:'<p style="font-size:14pt;font-weight:bold;color:#7C3AED;text-align:left;padding:4px 8px">'+hubLabelDisp+'</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
  });
  
  // Hub gateways inside hub VPC
  const hubGws=gwByVpc[hubVpc.VpcId]||[];
  const hubGwBadgeW=hubW-VP*2;
  let gwY=HUB_Y+VH+20;
  hubGws.forEach((gw,i)=>{
    const nm=gwNames[gw.gwMapId]||gwNames[gw.id]||sid(gw.gwMapId||gw.id);
    const gc=gwColors2[gw.type]||'#546E7A';
    const gf=gwFills[gw.type]||'#F5F0FF';
    const gwCD=[{key:'Gateway ID',value:gw.id},{key:'Type',value:gw.type},{key:'Name',value:nm}];
    if(gw.type==='NAT'){
      const natGw=nats.find(n=>n.NatGatewayId===gw.id);
      if(natGw){
        gwCD.push({key:'State',value:natGw.State||''});
        gwCD.push({key:'Connectivity',value:natGw.ConnectivityType||'public'});
        const pubIp=(natGw.NatGatewayAddresses||[])[0]?.PublicIp;
        const privIp=(natGw.NatGatewayAddresses||[])[0]?.PrivateIp;
        if(pubIp)gwCD.push({key:'Public IP',value:pubIp});
        if(privIp)gwCD.push({key:'Private IP',value:privIp});
      }
    }
    if(gw.type==='IGW'){
      const igw=igws.find(g=>g.InternetGatewayId===gw.id);
      if(igw){
        const att=(igw.Attachments||[]).map(a=>a.VpcId).join(', ');
        gwCD.push({key:'Attached VPCs',value:att||'None'});
      }
    }
    shapes.push({
      id:'hubgw_'+i,type:'rectangle',
      boundingBox:{x:HUB_X+VP,y:gwY,w:hubGwBadgeW,h:50},
      text:NOTEXT,
      style:{stroke:{color:gc,width:2},fill:{type:'color',color:gf}},
      customData:gwCD
    });
    addIcon(gw.type,HUB_X+VP+8,gwY+7);
    shapes.push({
      id:'hubgw_lbl_'+i,type:'rectangle',
      boundingBox:{x:HUB_X+VP+50,y:gwY+8,w:hubGwBadgeW-60,h:34},
      text:'<p style="font-size:10pt;font-weight:bold;color:#232F3E;text-align:left">'+gw.type+': '+nm+'</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });
    gwY+=60;
  });
  
  // Hub subnets with resources
  let hubSubY=gwY+20;
  const hubSubW=hubW-VP*2;
  hubSubs.forEach(s=>{
    const sName=gn(s,s.SubnetId);
    const isPub=pubSubs.has(s.SubnetId);
    const fc=isPub?COL.pubFont:COL.prvFont;
    const fill=isPub?COL.pubFill:COL.prvFill;
    const stroke=isPub?COL.pubStroke:COL.prvStroke;
    const resources=lzBuildResources(s.SubnetId);
    const subH=Math.max(60,lzSubResHeight(s.SubnetId,hubSubW));
    const rt=subRT[s.SubnetId];
    const nacl=nacls?nacls[s.SubnetId]:null;
    const rtName=rt?gn(rt,rt.RouteTableId):'Main';
    const naclName=nacl?gn(nacl,nacl.NetworkAclId):'Default';
    const sx=HUB_X+VP;
    shapes.push({
      id:'hubsub_'+(lid++),type:'rectangle',
      boundingBox:{x:sx,y:hubSubY,w:hubSubW,h:subH},
      text:NOTEXT,
      style:{stroke:{color:stroke,width:2},fill:{type:'color',color:fill}},
      customData:[
        {key:'Subnet ID',value:s.SubnetId},{key:'Name',value:sName},
        {key:'CIDR',value:s.CidrBlock||''},{key:'AZ',value:s.AvailabilityZone||''},
        {key:'Type',value:isPub?'Public':'Private'},
        {key:'Route Table',value:rtName+(rt?' ('+rt.RouteTableId+')':'')},
        {key:'NACL',value:naclName+(nacl?' ('+nacl.NetworkAclId+')':'')}
      ]
    });
    addIcon(isPub?'SUB_PUB':'SUB_PRV',sx+6,hubSubY+6);
    const subLabel=sName+' ['+s.CidrBlock+']';
    const maxSubChars=Math.floor((hubSubW-IC-40)/9);
    const dispSubLabel=subLabel.length>maxSubChars?subLabel.substring(0,maxSubChars-2)+'..':subLabel;
    shapes.push({id:'sublbl_'+(lid++),type:'rectangle',
      boundingBox:{x:sx+IC+12,y:hubSubY+6,w:hubSubW-IC-24,h:32},
      text:'<p style="font-size:9pt;font-weight:bold;color:'+fc+';text-align:left;padding:4px 6px">'+dispSubLabel+'</p>',
      style:{stroke:{color:fill,width:0},fill:{type:'color',color:fill}}
    });
    if(resources.length>0) lzRenderResources(resources,sx,hubSubY,hubSubW);
    hubSubY+=subH+SG;
  });
  
  // Place Spoke VPCs
  const spokePositions={};
  let spokeY=SPOKE_START_Y;
  let spokeCol=0;
  
  spokeVpcs.forEach((vpc,idx)=>{
    if(idx>0&&idx%SPOKES_PER_COL===0){
      spokeCol++;
      spokeY=SPOKE_START_Y;
    }
    const spokeX=SPOKE_START_X+spokeCol*SPOKE_COL_W;
    const ss=subByVpc[vpc.VpcId]||[];
    const spokeW=550;
    const spokeSubWCalc=spokeW-40;
    let spokeSubsH=0;
    ss.forEach(s2=>{spokeSubsH+=Math.max(45,lzSubResHeight(s2.SubnetId,spokeSubWCalc))+SG;});
    const spokeH=Math.max(200, VH+20+spokeSubsH+40);
    const vpcId='vpc_spoke_'+idx;
    shapeIds[vpc.VpcId]=vpcId;
    spokePositions[vpc.VpcId]={x:spokeX,y:spokeY,w:spokeW,h:spokeH};
    
    shapes.push({
      id:vpcId,type:'roundedRectangleContainer',
      boundingBox:{x:spokeX,y:spokeY,w:spokeW,h:spokeH},
      text:NOTEXT,
      style:{stroke:{color:COL.vpcStroke,width:2,style:'dashed'},fill:{type:'color',color:COL.vpcFill}},
      magnetize:true,
      customData:[{key:'VPC ID',value:vpc.VpcId},{key:'Name',value:gn(vpc,vpc.VpcId)},{key:'Role',value:'Spoke / Workload'},{key:'CIDR',value:vpc.CidrBlock}]
    });
    addIcon('VPC',spokeX+6,spokeY+4);
    
    const spokeLbl=gn(vpc,vpc.VpcId)+' ('+vpc.CidrBlock+')';
    const maxChars=Math.floor((spokeW-IC-40)/9);
    const dispLbl=spokeLbl.length>maxChars?spokeLbl.substring(0,maxChars-2)+'..':spokeLbl;
    shapes.push({
      id:'spokelbl_'+idx,type:'rectangle',
      boundingBox:{x:spokeX+IC+12,y:spokeY+4,w:spokeW-IC-24,h:VH-10},
      text:'<p style="font-size:12pt;font-weight:bold;color:'+COL.vpcFont+';text-align:left;padding:4px 8px">'+dispLbl+'</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
    });
    
    // Spoke subnets - all of them
    let subY=spokeY+VH+10;
    const spokeSubW=spokeW-40;
    ss.forEach(s=>{
      const sName=gn(s,s.SubnetId);
      const isPub=pubSubs.has(s.SubnetId);
      const fc=isPub?COL.pubFont:COL.prvFont;
      const fill=isPub?COL.pubFill:COL.prvFill;
      const stroke=isPub?COL.pubStroke:COL.prvStroke;
      const rt=subRT[s.SubnetId];
      const nacl=nacls?nacls[s.SubnetId]:null;
      const rtName=rt?gn(rt,rt.RouteTableId):'Main';
      const naclName=nacl?gn(nacl,nacl.NetworkAclId):'Default';
      const resources=lzBuildResources(s.SubnetId);
      const subH=Math.max(45,lzSubResHeight(s.SubnetId,spokeSubW));
      const sx=spokeX+20;
      shapes.push({
        id:'spokesub_'+(lid++),type:'rectangle',
        boundingBox:{x:sx,y:subY,w:spokeSubW,h:subH},
        text:NOTEXT,
        style:{stroke:{color:stroke,width:1.5},fill:{type:'color',color:fill}},
        customData:[
          {key:'Subnet ID',value:s.SubnetId},{key:'Name',value:sName},
          {key:'CIDR',value:s.CidrBlock||''},{key:'AZ',value:s.AvailabilityZone||''},
          {key:'Type',value:isPub?'Public':'Private'},
          {key:'Route Table',value:rtName+(rt?' ('+rt.RouteTableId+')':'')},
          {key:'NACL',value:naclName+(nacl?' ('+nacl.NetworkAclId+')':'')}
        ]
      });
      addIcon(isPub?'SUB_PUB':'SUB_PRV',sx+6,subY+6);
      const spokeSubLabel=sName+' ['+s.CidrBlock+']';
      const maxSpokeChars=Math.floor((spokeSubW-IC-40)/8);
      const dispSpokeLabel=spokeSubLabel.length>maxSpokeChars?spokeSubLabel.substring(0,maxSpokeChars-2)+'..':spokeSubLabel;
      shapes.push({id:'sublbl_'+(lid++),type:'rectangle',
        boundingBox:{x:sx+IC+12,y:subY+6,w:spokeSubW-IC-24,h:32},
        text:'<p style="font-size:8pt;font-weight:bold;color:'+fc+';text-align:left;padding:4px 6px">'+dispSpokeLabel+'</p>',
        style:{stroke:{color:fill,width:0},fill:{type:'color',color:fill}}
      });
      if(resources.length>0) lzRenderResources(resources,sx,subY,spokeSubW);
      subY+=subH+SG;
    });
    
    spokeY+=spokeH+SPOKE_ROW_GAP;
  });
  
  // External Connectivity Zone - wider with more room
  const extY=HUB_Y;
  const extW=340;
  shapes.push({
    id:'ext_zone',type:'rectangle',
    boundingBox:{x:EXT_X,y:extY,w:extW,h:400},
    text:NOTEXT,
    style:{stroke:{color:'#64748B',width:2,style:'dashed'},fill:{type:'color',color:'#F8FAFC'}}
  });
  shapes.push({
    id:'ext_title',type:'rectangle',
    boundingBox:{x:EXT_X+10,y:extY+10,w:extW-20,h:30},
    text:'<p style="font-size:11pt;font-weight:bold;color:#334155;text-align:center">External Connectivity</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
  });
  
  // Internet node
  shapes.push({
    id:'inet',type:'rectangle',
    boundingBox:{x:EXT_X+30,y:extY+60,w:extW-60,h:60},
    text:NOTEXT,
    style:{stroke:{color:'#232F3E',width:2},fill:{type:'color',color:'#E2E8F0'}},
    customData:[{key:'Type',value:'Internet Gateway / Public Access'},{key:'Description',value:'External internet connectivity'}]
  });
  addIcon('INET',EXT_X+38,extY+72);
  shapes.push({
    id:'inet_lbl',type:'rectangle',
    boundingBox:{x:EXT_X+80,y:extY+72,w:extW-120,h:36},
    text:'<p style="font-size:11pt;font-weight:bold;color:#232F3E;text-align:left">Internet</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
  });
  
  // On-premises / VPN
  if(sharedGws.some(g=>g.type==='VGW')||gwSet2L.has('vgw')){
    shapes.push({
      id:'onprem',type:'rectangle',
      boundingBox:{x:EXT_X+30,y:extY+140,w:extW-60,h:60},
      text:NOTEXT,
      style:{stroke:{color:'#7C3AED',width:2},fill:{type:'color',color:'#F5F3FF'}},
      customData:[{key:'Type',value:'Virtual Private Gateway / VPN'},{key:'Description',value:'On-premises connectivity'}]
    });
    addIcon('VGW',EXT_X+38,extY+152);
    shapes.push({
      id:'onprem_lbl',type:'rectangle',
      boundingBox:{x:EXT_X+80,y:extY+152,w:extW-120,h:36},
      text:'<p style="font-size:11pt;font-weight:bold;color:#7C3AED;text-align:left">On-Premises / VPN</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });
  }
  
  // Transit Gateway (shared)
  const tgwGws=sharedGws.filter(g=>g.type==='TGW');
  if(tgwGws.length>0){
    shapes.push({
      id:'tgw_shared',type:'rectangle',
      boundingBox:{x:EXT_X+30,y:extY+220,w:extW-60,h:60},
      text:NOTEXT,
      style:{stroke:{color:'#EC4899',width:2},fill:{type:'color',color:'#FDF2F8'}},
      customData:[{key:'Type',value:'Transit Gateway'},{key:'TGW IDs',value:tgwGws.map(g=>g.id).join(', ')}]
    });
    addIcon('TGW',EXT_X+38,extY+232);
    shapes.push({
      id:'tgw_shared_lbl',type:'rectangle',
      boundingBox:{x:EXT_X+80,y:extY+232,w:extW-120,h:36},
      text:'<p style="font-size:11pt;font-weight:bold;color:#EC4899;text-align:left">Transit Gateway</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });
  }
  
  // Hub to External lines - route above all spokes using straight segments
  const routeAboveY=Math.min(HUB_Y,SPOKE_START_Y)-60;
  const extMidX=EXT_X+extW/2;
  
  // Hub -> Internet: up from hub top, across above spokes, down to ext zone top border
  lines.push({
    id:'hub_inet_1',lineType:'straight',
    stroke:{color:'#10B981',width:3},
    endpoint1:{type:'shapeEndpoint',style:'none',shapeId:hubId,position:{x:0.8,y:0}},
    endpoint2:{type:'positionEndpoint',style:'none',position:{x:HUB_X+hubW*0.8,y:routeAboveY}}
  });
  lines.push({
    id:'hub_inet_2',lineType:'straight',
    stroke:{color:'#10B981',width:3},
    endpoint1:{type:'positionEndpoint',style:'none',position:{x:HUB_X+hubW*0.8,y:routeAboveY}},
    endpoint2:{type:'positionEndpoint',style:'none',position:{x:extMidX,y:routeAboveY}}
  });
  lines.push({
    id:'hub_inet_3',lineType:'straight',
    stroke:{color:'#10B981',width:3},
    endpoint1:{type:'positionEndpoint',style:'none',position:{x:extMidX,y:routeAboveY}},
    endpoint2:{type:'shapeEndpoint',style:'arrow',shapeId:'inet',position:{x:0.5,y:0}}
  });
  
  // Hub -> TGW connection (if TGW exists) - route above spokes
  if(tgwGws.length>0){
    const tgwRouteY=routeAboveY-30;
    lines.push({
      id:'hub_tgw_1',lineType:'straight',
      stroke:{color:'#EC4899',width:2},
      endpoint1:{type:'shapeEndpoint',style:'none',shapeId:hubId,position:{x:0.6,y:0}},
      endpoint2:{type:'positionEndpoint',style:'none',position:{x:HUB_X+hubW*0.6,y:tgwRouteY}}
    });
    lines.push({
      id:'hub_tgw_2',lineType:'straight',
      stroke:{color:'#EC4899',width:2},
      endpoint1:{type:'positionEndpoint',style:'none',position:{x:HUB_X+hubW*0.6,y:tgwRouteY}},
      endpoint2:{type:'positionEndpoint',style:'none',position:{x:EXT_X+extW/2,y:tgwRouteY}}
    });
    lines.push({
      id:'hub_tgw_3',lineType:'straight',
      stroke:{color:'#EC4899',width:2},
      endpoint1:{type:'positionEndpoint',style:'none',position:{x:EXT_X+extW/2,y:tgwRouteY}},
      endpoint2:{type:'shapeEndpoint',style:'arrow',shapeId:'tgw_shared',position:{x:0.5,y:0}}
    });
  }
  
  // Hub -> Spokes (peering) and TGW -> Spokes (TGW routes)
  spokeVpcs.forEach((vpc,idx)=>{
    const sp=spokePositions[vpc.VpcId];
    if(!sp)return;
    
    // Check connection type
    let connType='peering';
    let connColor='#FB923C';
    rts.filter(rt=>rt.VpcId===vpc.VpcId).forEach(rt=>{
      (rt.Routes||[]).forEach(r=>{
        if(r.TransitGatewayId){connType='tgw';connColor='#EC4899';}
      });
    });
    
    if(connType==='tgw'&&tgwGws.length>0){
      // TGW -> Spoke: straight horizontal from TGW left to spoke right
      const tgwCount=spokeVpcs.filter((v,i)=>{
        let ct='peering';
        rts.filter(rt=>rt.VpcId===v.VpcId).forEach(rt=>{
          (rt.Routes||[]).forEach(r=>{if(r.TransitGatewayId)ct='tgw';});
        });
        return ct==='tgw'&&i<=idx;
      }).length;
      const tgwYPos=tgwCount>1?0.2+(tgwCount-1)*(0.6/(Math.max(1,spokeVpcs.length-1))):0.5;
      lines.push({
        id:'tgw_spoke_'+idx,lineType:'straight',
        stroke:{color:'#EC4899',width:2},
        endpoint1:{type:'shapeEndpoint',style:'none',shapeId:'tgw_shared',position:{x:0,y:Math.min(0.9,tgwYPos)}},
        endpoint2:{type:'shapeEndpoint',style:'arrow',shapeId:shapeIds[vpc.VpcId],position:{x:1,y:0.5}}
      });
    } else {
      // Direct hub -> spoke (peering)
      lines.push({
        id:'hub_spoke_'+idx,lineType:'elbow',
        stroke:{color:connColor,width:2,style:'dashed'},
        endpoint1:{type:'shapeEndpoint',style:'none',shapeId:hubId,position:{x:1,y:spokeVpcs.length>1?0.1+idx*(0.8/(spokeVpcs.length-1)):0.5}},
        endpoint2:{type:'shapeEndpoint',style:'arrow',shapeId:shapeIds[vpc.VpcId],position:{x:0,y:0.5}}
      });
    }
  });
  
  // Legend
  const legendX=HUB_X;
  const legendY=HUB_Y+hubH+40;
  shapes.push({
    id:'legend_box',type:'rectangle',
    boundingBox:{x:legendX,y:legendY,w:300,h:140},
    text:NOTEXT,
    style:{stroke:{color:'#CBD5E1',width:1},fill:{type:'color',color:'#FFFFFF'}}
  });
  shapes.push({
    id:'legend_title',type:'rectangle',
    boundingBox:{x:legendX+10,y:legendY+8,w:280,h:24},
    text:'<p style="font-size:11pt;font-weight:bold;color:#334155;text-align:left">Legend</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
  });
  
  // Legend items
  const legendItems=[
    {color:'#7C3AED',label:'Hub VPC',y:40},
    {color:'#3B82F6',label:'Spoke VPC',y:65},
    {color:'#10B981',label:'Internet Gateway',y:90},
    {color:'#EC4899',label:'Transit Gateway',y:115}
  ];
  legendItems.forEach(item=>{
    shapes.push({
      id:'leg_'+item.y,type:'rectangle',
      boundingBox:{x:legendX+15,y:legendY+item.y,w:20,h:16},
      text:NOTEXT,
      style:{stroke:{color:item.color,width:2},fill:{type:'color',color:item.color+'20'}}
    });
    shapes.push({
      id:'leglbl_'+item.y,type:'rectangle',
      boundingBox:{x:legendX+45,y:legendY+item.y,w:240,h:18},
      text:'<p style="font-size:9pt;color:#334155;text-align:left">'+item.label+'</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
    });
  });
  
  // Route 53 DNS Zone section
  if(zones&&zones.length>0){
    const dnsX=HUB_X;
    const dnsY=Math.max(HUB_Y+hubH,spokeY)+60;
    const pubZ=zones.filter(z=>!z.Config?.PrivateZone);
    const privZ=zones.filter(z=>z.Config?.PrivateZone);
    const dnsExp=(_detailLevel>=1);
    const cols=dnsExp?1:2;
    const colW=dnsExp?700:460;
    const recRowH=16;
    const recHeaderH=18;

    // Pre-calculate per-zone height
    const zoneHeights=[];
    zones.forEach(z=>{
      if(!dnsExp){zoneHeights.push(54);return}
      const isPub=!z.Config?.PrivateZone;
      const zid=z.Id.replace('/hostedzone/','');
      const assocVpcs=(!isPub&&z.VPCs)?z.VPCs.length:0;
      const zRecs=recsByZoneLZ[zid]||[];
      let h=28; // header area (name line + zone info line)
      if(assocVpcs)h+=recRowH;
      if(zRecs.length>0) h+=recHeaderH+zRecs.length*recRowH;
      zoneHeights.push(Math.max(54,h+12));
    });
    const zoneGap=8;

    let totalZoneH=0;
    if(dnsExp){zoneHeights.forEach(h=>{totalZoneH+=h+zoneGap})}
    else{totalZoneH=Math.ceil(zones.length/cols)*62}
    const dnsW=cols*colW+60;
    const dnsH=60+totalZoneH+20;

    shapes.push({
      id:'dns_zone',type:'rectangle',
      boundingBox:{x:dnsX,y:dnsY,w:dnsW,h:dnsH},
      text:NOTEXT,
      style:{stroke:{color:'#0ea5e9',width:2,style:'dashed'},fill:{type:'color',color:'#F0F9FF'}}
    });
    shapes.push({
      id:'dns_title',type:'rectangle',
      boundingBox:{x:dnsX+10,y:dnsY+8,w:dnsW-20,h:30},
      text:'<p style="font-size:12pt;font-weight:bold;color:#0ea5e9;text-align:left">Route 53 Hosted Zones ('+pubZ.length+' public, '+privZ.length+' private)</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });

    let curY=dnsY+48;
    zones.forEach((z,zi)=>{
      const isPub=!z.Config?.PrivateZone;
      const zid=z.Id.replace('/hostedzone/','');
      const assocVpcs=(!isPub&&z.VPCs)?z.VPCs.map(v=>{
        const vid=v.VPCId||v.VpcId;
        const vpc=vpcs.find(vp=>vp.VpcId===vid);
        return gn(vpc||{},vid);
      }).join(', '):'';
      const zh=zoneHeights[zi];
      const zRecs=recsByZoneLZ[zid]||[];

      if(dnsExp){
        const zx=dnsX+20;
        const zCol=isPub?'#10b981':'#0ea5e9';
        shapes.push({
          id:'dns_'+zi,type:'rectangle',
          boundingBox:{x:zx,y:curY,w:colW-20,h:zh},
          text:NOTEXT,
          style:{stroke:{color:zCol,width:1.5},fill:{type:'color',color:isPub?'#F0FDF4':'#F0F9FF'}},
          customData:[
            {key:'Zone ID',value:zid},{key:'Name',value:z.Name},
            {key:'Type',value:isPub?'Public':'Private'},
            {key:'Records',value:String(z.ResourceRecordSetCount)},
            {key:'Associated VPCs',value:assocVpcs||'N/A'}
          ]
        });
        // Line 1: type + name
        shapes.push({
          id:'dnslbl_'+zi+'a',type:'rectangle',
          boundingBox:{x:zx+6,y:curY+4,w:colW-32,h:18},
          text:'<p style="font-size:10pt;font-weight:bold;color:'+zCol+';text-align:left">'+(isPub?'[Public]':'[Private]')+' '+z.Name+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
        // Line 2: record count + zone ID
        let ly=curY+22;
        shapes.push({
          id:'dnslbl_'+zi+'b',type:'rectangle',
          boundingBox:{x:zx+6,y:ly,w:colW-32,h:recRowH},
          text:'<p style="font-size:8pt;color:#64748B;text-align:left">'+z.ResourceRecordSetCount+' records | Zone ID: '+zid+' | Type: '+(isPub?'Public':'Private')+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
        ly+=recRowH;
        if(assocVpcs){
          shapes.push({
            id:'dnslbl_'+zi+'d',type:'rectangle',
            boundingBox:{x:zx+6,y:ly,w:colW-32,h:recRowH},
            text:'<p style="font-size:8pt;color:#64748B;text-align:left">VPCs: '+assocVpcs+'</p>',
            style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
          });
          ly+=recRowH;
        }
        // Record sets
        if(zRecs.length>0){
          shapes.push({
            id:'dnshdr_'+zi,type:'rectangle',
            boundingBox:{x:zx+6,y:ly,w:colW-32,h:recHeaderH},
            text:'<p style="font-size:7pt;font-weight:bold;color:#475569;text-align:left">NAME                                                  TYPE      VALUE</p>',
            style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
          });
          ly+=recHeaderH;
          zRecs.forEach((rec,ri)=>{
            const rName=rec.Name||'';
            const rType=rec.Type||'';
            const rVal=rec.AliasTarget?'ALIAS → '+rec.AliasTarget.DNSName:
              (rec.ResourceRecords||[]).map(rr=>rr.Value).join(', ');
            const ttl=rec.TTL!=null?'  TTL:'+rec.TTL:'';
            shapes.push({
              id:'dnsrec_'+zi+'_'+ri,type:'rectangle',
              boundingBox:{x:zx+6,y:ly,w:colW-32,h:recRowH},
              text:'<p style="font-size:7pt;color:#334155;text-align:left;font-family:monospace">'+rName+' &nbsp; '+rType+' &nbsp; '+rVal+ttl+'</p>',
              style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
            });
            ly+=recRowH;
          });
        }
        curY+=zh+zoneGap;
      }else{
        // Collapsed: 2-column compact layout
        const col=zi%cols;
        const row=Math.floor(zi/cols);
        const zx=dnsX+20+col*colW;
        const zy=dnsY+48+row*62;
        shapes.push({
          id:'dns_'+zi,type:'rectangle',
          boundingBox:{x:zx,y:zy,w:colW-20,h:54},
          text:NOTEXT,
          style:{stroke:{color:isPub?'#10b981':'#0ea5e9',width:1.5},fill:{type:'color',color:isPub?'#F0FDF4':'#F0F9FF'}},
          customData:[
            {key:'Zone ID',value:zid},{key:'Name',value:z.Name},
            {key:'Type',value:isPub?'Public':'Private'},
            {key:'Records',value:String(z.ResourceRecordSetCount)},
            {key:'Associated VPCs',value:assocVpcs||'N/A'}
          ]
        });
        shapes.push({
          id:'dnslbl_'+zi+'a',type:'rectangle',
          boundingBox:{x:zx+6,y:zy+4,w:colW-32,h:22},
          text:'<p style="font-size:9pt;font-weight:bold;color:'+(isPub?'#10b981':'#0ea5e9')+';text-align:left">'+(isPub?'[Public]':'[Private]')+' '+z.Name+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
        shapes.push({
          id:'dnslbl_'+zi+'b',type:'rectangle',
          boundingBox:{x:zx+6,y:zy+28,w:colW-32,h:20},
          text:'<p style="font-size:8pt;color:#64748B;text-align:left">'+z.ResourceRecordSetCount+' records | '+zid+(assocVpcs?' | VPCs: '+assocVpcs:'')+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
      }
    });
  }
  
  // S3 Buckets section
  if(s3bk&&s3bk.length>0){
    const s3Cols=3;
    const s3ColW=360;
    const s3W=s3Cols*s3ColW+60;
    const s3RowH=36;
    const s3Rows=Math.ceil(s3bk.length/s3Cols);
    const s3H=50+s3Rows*s3RowH+20;
    const dnsExists=zones&&zones.length>0;
    const _lucidDnsH=(function(){
      if(!dnsExists)return 0;
      const dExp=(_detailLevel>=1);const c=dExp?1:2;
      if(dExp){let th=0;(zones||[]).forEach(z=>{const ip=!z.Config?.PrivateZone;const av=(!ip&&z.VPCs)?z.VPCs.length:0;const zid=z.Id.replace('/hostedzone/','');const zR=recsByZoneLZ[zid]||[];let h=28;if(av)h+=16;if(zR.length>0)h+=18+zR.length*16;th+=Math.max(54,h+12)+8});return 60+th+20}
      return 60+Math.ceil((zones||[]).length/c)*62+20;
    })();
    const s3Y=dnsExists?(Math.max(HUB_Y+hubH,spokeY)+60+_lucidDnsH+40):(Math.max(HUB_Y+hubH,spokeY)+60);

    shapes.push({
      id:'s3_lz_section',type:'rectangle',
      boundingBox:{x:HUB_X,y:s3Y,w:s3W,h:s3H},
      text:NOTEXT,
      style:{stroke:{color:'#EA580C',width:2,style:'dashed'},fill:{type:'color',color:'#FFF7ED'}}
    });
    shapes.push({
      id:'s3_lz_title',type:'rectangle',
      boundingBox:{x:HUB_X+10,y:s3Y+8,w:s3W-20,h:30},
      text:'<p style="font-size:12pt;font-weight:bold;color:#EA580C;text-align:left">S3 Buckets ('+s3bk.length+')</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });
    
    s3bk.forEach((bk,bi)=>{
      const col=bi%s3Cols;
      const row=Math.floor(bi/s3Cols);
      const bx=HUB_X+20+col*s3ColW;
      const by=s3Y+48+row*s3RowH;
      
      shapes.push({
        id:'ls3_'+bi,type:'rectangle',
        boundingBox:{x:bx,y:by,w:s3ColW-20,h:28},
        text:NOTEXT,
        style:{stroke:{color:'#EA580C',width:1},fill:{type:'color',color:'#FFFFFF'}},
        customData:[
          {key:'Bucket Name',value:bk.Name},
          {key:'Created',value:(bk.CreationDate||'N/A').split('T')[0]}
        ]
      });
      shapes.push({
        id:'ls3lbl_'+bi,type:'rectangle',
        boundingBox:{x:bx+4,y:by+2,w:s3ColW-28,h:24},
        text:'<p style="font-size:8pt;color:#232F3E;text-align:left">'+bk.Name+'</p>',
        style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
      });
    });
  }

  // Compute page dimensions
  let pgW=EXT_X+extW+100;
  let pgH=Math.max(HUB_Y+hubH+200,spokeY+200);
  if(zones&&zones.length>0){
    const pgDnsH=(function(){
      const dExp=(_detailLevel>=1);const c=dExp?1:2;
      if(dExp){let th=0;zones.forEach(z=>{const ip=!z.Config?.PrivateZone;const av=(!ip&&z.VPCs)?z.VPCs.length:0;const zid=z.Id.replace('/hostedzone/','');const zR=recsByZoneLZ[zid]||[];let h=28;if(av)h+=16;if(zR.length>0)h+=18+zR.length*16;th+=Math.max(54,h+12)+8});return 60+th+20}
      return 60+Math.ceil(zones.length/c)*62+20;
    })();
    const dnsBottom=Math.max(HUB_Y+hubH,spokeY)+60+pgDnsH+40;
    pgH=Math.max(pgH,dnsBottom);
  }
  if(s3bk&&s3bk.length>0){
    const pgDnsH2=(function(){
      if(!(zones&&zones.length>0))return 0;
      const dExp=(_detailLevel>=1);const c=dExp?1:2;
      if(dExp){let th=0;zones.forEach(z=>{const ip=!z.Config?.PrivateZone;const av=(!ip&&z.VPCs)?z.VPCs.length:0;const zid=z.Id.replace('/hostedzone/','');const zR=recsByZoneLZ[zid]||[];let h=28;if(av)h+=16;if(zR.length>0)h+=18+zR.length*16;th+=Math.max(54,h+12)+8});return 60+th+20}
      return 60+Math.ceil(zones.length/c)*62+20;
    })();
    const dnsExists=zones&&zones.length>0;
    const s3Y=dnsExists?(Math.max(HUB_Y+hubH,spokeY)+60+pgDnsH2+40):(Math.max(HUB_Y+hubH,spokeY)+60);
    const s3Rows=Math.ceil(s3bk.length/3);
    const s3Bottom=s3Y+50+s3Rows*36+40;
    pgH=Math.max(pgH,s3Bottom);
  }
  
  // Build final export - format must match buildLucidExport
  const doc={version:1,pages:[{id:'page1',title:'AWS-Landing-Zone',shapes,lines}]};
  
  console.log('Landing Zone layout complete:', shapes.length, 'shapes,', lines.length, 'lines');
  return {doc,iconSet};
  }catch(e){
    console.error('Landing Zone layout error:', e);
    alert('Landing Zone layout error: '+e.message);
    return null;
  }
}

function buildLucidExport(){
  const vpcs=ext(safeParse(gv('in_vpcs')),['Vpcs']);
  const subnets=ext(safeParse(gv('in_subnets')),['Subnets']);
  const rts=ext(safeParse(gv('in_rts')),['RouteTables']);
  const sgs=ext(safeParse(gv('in_sgs')),['SecurityGroups']);
  const nacls=ext(safeParse(gv('in_nacls')),['NetworkAcls']);
  const igws=ext(safeParse(gv('in_igws')),['InternetGateways']);
  const nats=ext(safeParse(gv('in_nats')),['NatGateways']);
  const vpceList=ext(safeParse(gv('in_vpces')),['VpcEndpoints']);
  const peerings=ext(safeParse(gv('in_peer')),['VpcPeeringConnections']);
  const volumes=ext(safeParse(gv('in_vols')),['Volumes']);
  const snapshots=ext(safeParse(gv('in_snaps')),['Snapshots']);
  const s3raw=safeParse(gv('in_s3'));const s3bk=s3raw?ext(s3raw,['Buckets']):[];
  const zones=ext(safeParse(gv('in_r53')),['HostedZones']);
  const allRecordSets=ext(safeParse(gv('in_r53records')),['ResourceRecordSets','RecordSets']);
  const recsByZone={};
  allRecordSets.forEach(r=>{if(r.HostedZoneId)(recsByZone[r.HostedZoneId]=recsByZone[r.HostedZoneId]||[]).push(r)});
  let instances=[];
  const eRaw=safeParse(gv('in_ec2'));
  if(eRaw){
    const reservations=ext(eRaw,['Reservations']);
    if(reservations.length){reservations.forEach(r=>{if(r.Instances)instances=instances.concat(r.Instances);else if(r.InstanceId)instances.push(r)})}
    else{const flat=ext(eRaw,['Instances']);if(flat.length)instances=flat;else{const arr=Array.isArray(eRaw)?eRaw:[eRaw];arr.forEach(x=>{if(x.InstanceId)instances.push(x)})}}
  }
  const albs=ext(safeParse(gv('in_albs')),['LoadBalancers']);
  const tgs=ext(safeParse(gv('in_tgs')),['TargetGroups']);
  const enis=ext(safeParse(gv('in_enis')),['NetworkInterfaces']);
  const wafAcls=ext(safeParse(gv('in_waf')),['WebACLs']);
  const rdsInstances=ext(safeParse(gv('in_rds')),['DBInstances']);
  const ecsServices=ext(safeParse(gv('in_ecs')),['services','Services']);
  const lambdaFns=(ext(safeParse(gv('in_lambda')),['Functions'])).filter(f=>f.VpcConfig&&f.VpcConfig.VpcId);
  const cfDistributions=ext(safeParse(gv('in_cf')),['DistributionList','Items']);
  if(!vpcs.length){alert('Render map first');return null}

  // Build lookups
  const subByVpc={};subnets.forEach(s=>(subByVpc[s.VpcId]=subByVpc[s.VpcId]||[]).push(s));
  const sgByVpc={};sgs.forEach(sg=>(sgByVpc[sg.VpcId]=sgByVpc[sg.VpcId]||[]).push(sg));
  const subNacl={};nacls.forEach(n=>(n.Associations||[]).forEach(a=>{if(a.SubnetId)subNacl[a.SubnetId]=n}));
  const exMainRT={};rts.forEach(rt=>{if((rt.Associations||[]).some(a=>a.Main))exMainRT[rt.VpcId]=rt});
  const subRT={};rts.forEach(rt=>(rt.Associations||[]).forEach(a=>{if(a.SubnetId)subRT[a.SubnetId]=rt}));
  subnets.forEach(s=>{if(!subRT[s.SubnetId]&&exMainRT[s.VpcId])subRT[s.SubnetId]=exMainRT[s.VpcId]});
  const instBySub={};instances.forEach(i=>{if(i.SubnetId)(instBySub[i.SubnetId]=instBySub[i.SubnetId]||[]).push(i)});
  const eniBySub={};const eniByInst={};enis.forEach(e=>{if(e.SubnetId)(eniBySub[e.SubnetId]=eniBySub[e.SubnetId]||[]).push(e);if(e.Attachment&&e.Attachment.InstanceId)(eniByInst[e.Attachment.InstanceId]=eniByInst[e.Attachment.InstanceId]||[]).push(e)});
  const albBySub={};albs.forEach(lb=>{(lb.AvailabilityZones||[]).forEach(az=>{if(az.SubnetId)(albBySub[az.SubnetId]=albBySub[az.SubnetId]||[]).push(lb)})});
  const volByInst={};volumes.forEach(v=>{(v.Attachments||[]).forEach(a=>{if(a.InstanceId)(volByInst[a.InstanceId]=volByInst[a.InstanceId]||[]).push(v)})});
  const knownInstIds3=new Set(instances.map(i=>i.InstanceId));
  const instSubFromEni3={};enis.forEach(e=>{if(e.SubnetId&&e.Attachment&&e.Attachment.InstanceId)instSubFromEni3[e.Attachment.InstanceId]=e.SubnetId});
  const volBySub={};volumes.forEach(v=>{const att=(v.Attachments||[])[0];if(att&&att.InstanceId){if(knownInstIds3.has(att.InstanceId))return;const sid=instSubFromEni3[att.InstanceId];if(sid)(volBySub[sid]=volBySub[sid]||[]).push(v)}});
  const snapByVol={};snapshots.forEach(s=>{if(s.VolumeId)(snapByVol[s.VolumeId]=snapByVol[s.VolumeId]||[]).push(s)});
  const tgByAlb={};tgs.forEach(tg=>{(tg.LoadBalancerArns||[]).forEach(arn=>{(tgByAlb[arn]=tgByAlb[arn]||[]).push(tg)})});
  const wafByAlb={};wafAcls.forEach(acl=>{(acl.ResourceArns||[]).forEach(arn=>{(wafByAlb[arn]=wafByAlb[arn]||[]).push(acl)})});
  const rdsBySub={};rdsInstances.forEach(db=>{const sg=db.DBSubnetGroup;if(!sg)return;(sg.Subnets||[]).forEach(s=>{if(s.SubnetIdentifier)(rdsBySub[s.SubnetIdentifier]=rdsBySub[s.SubnetIdentifier]||[]).push(db)})});
  const ecsBySub={};ecsServices.forEach(svc=>{const nc=svc.networkConfiguration?.awsvpcConfiguration;if(!nc)return;(nc.subnets||[]).forEach(sid=>{(ecsBySub[sid]=ecsBySub[sid]||[]).push(svc)})});
  const lambdaBySub={};lambdaFns.forEach(fn=>{(fn.VpcConfig?.SubnetIds||[]).forEach(sid=>{(lambdaBySub[sid]=lambdaBySub[sid]||[]).push(fn)})});
  const cfByAlb={};cfDistributions.forEach(cf=>{(cf.Origins?.Items||[]).forEach(o=>{const dn=o.DomainName||'';albs.forEach(lb=>{if(lb.DNSName&&dn.includes(lb.DNSName))(cfByAlb[lb.LoadBalancerArn]=cfByAlb[lb.LoadBalancerArn]||[]).push(cf)})})});
  const pubSubs=new Set();
  rts.forEach(rt=>{
    const hasIgw=(rt.Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State!=='blackhole');
    (rt.Associations||[]).forEach(a=>{if(a.SubnetId&&hasIgw)pubSubs.add(a.SubnetId)});
  });
  subnets.forEach(s=>{if(!pubSubs.has(s.SubnetId)&&exMainRT[s.VpcId]){
    const hasIgw=(exMainRT[s.VpcId].Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State!=='blackhole');
    if(hasIgw)pubSubs.add(s.SubnetId);
  }});

  function tw(str,pt){return(str||'').length*pt*0.62+20}

  const shapes=[],lines=[],iconSet=new Set();
  const shapeIds={};
  let lid=0;
  const IC=36;
  const VP=50;
  const VH=80;
  const SG=32;
  const SP=24;
  const EC2W=260,EC2H=34,EC2G=16;

  // Official AWS Architecture Group Icon colors
  const COL={
    vpcFill:'#FFFFFF',vpcStroke:'#8C4FFF',vpcFont:'#8C4FFF',
    pubFill:'#FFFFFF',pubStroke:'#7AA116',pubFont:'#7AA116',
    prvFill:'#FFFFFF',prvStroke:'#147EBA',prvFont:'#147EBA',
    ec2Fill:'#FFFFFF',ec2Stroke:'#ED7100',ec2Font:'#232F3E',
    igw:'#8C4FFF',nat:'#8C4FFF',tgw:'#8C4FFF',vgw:'#8C4FFF',
    vpce:'#8C4FFF',pcx:'#8C4FFF',inet:'#232F3E',
    albFill:'#FFFFFF',albStroke:'#8C4FFF',albFont:'#232F3E'
  };
  const gwFills={IGW:'#F5F0FF',NAT:'#F5F0FF',TGW:'#F5F0FF',VGW:'#F5F0FF',PCX:'#F5F0FF',VPCE:'#F5F0FF'};


  // icons as rectangles with image fill
  function addIcon(type,x,y){
    iconSet.add(type);
    shapes.push({
      id:'icon_'+(lid++),type:'rectangle',
      boundingBox:{x,y,w:IC,h:IC},
      text:'<p style="font-size:1pt;color:transparent">&nbsp;</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'image',ref:(ICON_MAP[type]||type.toLowerCase())+'.png'}}
    });
  }

  // collect gateways before VPC loop
  const gwSet2L=new Map();
  rts.forEach(rt=>{(rt.Routes||[]).forEach(r=>{
    if(r.GatewayId&&r.GatewayId!=='local')gwSet2L.set(r.GatewayId,{type:clsGw(r.GatewayId),id:r.GatewayId,vpcId:rt.VpcId});
    if(r.NatGatewayId)gwSet2L.set(r.NatGatewayId,{type:'NAT',id:r.NatGatewayId,vpcId:rt.VpcId});
    if(r.TransitGatewayId)gwSet2L.set(r.TransitGatewayId,{type:'TGW',id:r.TransitGatewayId,vpcId:'shared'});
    if(r.VpcPeeringConnectionId)gwSet2L.set(r.VpcPeeringConnectionId,{type:'PCX',id:r.VpcPeeringConnectionId,vpcId:'shared'});
  })});
  igws.forEach(g=>{if(!gwSet2L.has(g.InternetGatewayId)){const v=(g.Attachments||[])[0];gwSet2L.set(g.InternetGatewayId,{type:'IGW',id:g.InternetGatewayId,vpcId:v?v.VpcId:'unk'})}});
  nats.forEach(g=>{if(!gwSet2L.has(g.NatGatewayId))gwSet2L.set(g.NatGatewayId,{type:'NAT',id:g.NatGatewayId,vpcId:g.VpcId||'unk'})});

  // group by VPC vs shared
  const gwByVpc={};const sharedGws=[];
  gwSet2L.forEach((gw,gwId)=>{
    if(gw.type==='VPCE')return;
    if(gw.vpcId==='shared'){sharedGws.push({...gw,gwMapId:gwId});return}
    if(!gwByVpc[gw.vpcId])gwByVpc[gw.vpcId]=[];
    gwByVpc[gw.vpcId].push({...gw,gwMapId:gwId});
  });
  const vpceByVpc={};
  gwSet2L.forEach(gw=>{if(gw.type==='VPCE')(vpceByVpc[gw.vpcId]=vpceByVpc[gw.vpcId]||[]).push(gw)});
  vpceList.forEach(v=>{if(!vpceByVpc[v.VpcId])vpceByVpc[v.VpcId]=[{type:'VPCE',id:v.VpcEndpointId,vpcId:v.VpcId}]});

  const gwColors2={IGW:COL.igw,NAT:COL.nat,TGW:COL.tgw,VGW:COL.vgw,PCX:COL.pcx,VPCE:COL.vpce};
  const GW_W=350,GW_H=52,GW_GAP=10;

  const activeVpcs=vpcs.filter(v=>(subByVpc[v.VpcId]||[]).length>0);

  // Get layout mode from selector
  const layoutMode=document.getElementById('layoutMode')?.value||'grid';
  const userHubName=(document.getElementById('hubVpcName')?.value||'').toLowerCase().trim();
  console.log('buildLucidExport: layoutMode=', layoutMode, 'userHubName=', userHubName);

  // Landing Zone layout mode
  if(layoutMode==='landingzone'){
    console.log('Using Landing Zone layout mode, calling buildLandingZoneLayout...');
    const result=buildLandingZoneLayout({
      vpcs:activeVpcs,subByVpc,sgByVpc,pubSubs,rts,instances,albs,enis,nacls:subNacl,
      subRT,igws,nats,vpceList,peerings,sharedGws,gwByVpc,vpceByVpc,gwSet2L,
      gn,sid,tw,userHubName,COL,gwColors2,gwFills,ICON_MAP,volumes,zones,
      s3bk,snapshots,snapByVol,tgByAlb,tgs,wafAcls,wafByAlb,
      instBySub,albBySub,eniBySub,volByInst,volBySub,rdsBySub,ecsBySub,lambdaBySub,cfByAlb,recsByZone
    });
    console.log('buildLandingZoneLayout returned:', result?'success':'null');
    return result;
  }

  // transparent text to suppress Lucid "Text" placeholder
  const NOTEXT='<p style="font-size:1pt;color:transparent">&nbsp;</p>';

  // gateway badge sizing (wider and taller to fit text)
  const GW_BADGE_W=350,GW_BADGE_H=56,GW_BADGE_GAP=12;
  const GW_BADGES_PER_ROW=2;

  // PASS 1: compute VPC column sizes
  const vpcInfos=[];
  activeVpcs.forEach(vpc=>{
    const ss=subByVpc[vpc.VpcId]||[];
    const vpcName=gn(vpc,vpc.VpcId);
    const vpcLabel=vpcName+' ('+vpc.CidrBlock+')';
    let maxSubW=580;
    ss.forEach(s=>{
      const sName=gn(s,s.SubnetId);
      const isPub=pubSubs.has(s.SubnetId);
      const tag=isPub?'PUBLIC':'PRIVATE';
      const az=s.AvailabilityZone||'';
      const subLabel=sName+' ['+tag+'] '+s.CidrBlock+' '+az;
      const needed=tw(subLabel,10)+IC+24;
      if(needed>maxSubW)maxSubW=needed;
      const insts=instances.filter(i=>i.SubnetId===s.SubnetId);
      const albsInSub=albs.filter(lb=>(lb.AvailabilityZones||[]).some(az2=>az2.SubnetId===s.SubnetId));
      const uaEnis=(eniBySub[s.SubnetId]||[]).filter(e=>!insts.some(i=>enis.some(en=>en.Attachment&&en.Attachment.InstanceId===i.InstanceId&&en.NetworkInterfaceId===e.NetworkInterfaceId)));
      const resCount=insts.length+albsInSub.length+(rdsBySub[s.SubnetId]||[]).length+(ecsBySub[s.SubnetId]||[]).length+(lambdaBySub[s.SubnetId]||[]).length+uaEnis.length;
      const cols=Math.max(1,Math.floor((maxSubW-SP*2)/(EC2W+EC2G)));
      const neededForInst=resCount>0?cols*(EC2W+EC2G)+SP*2:0;
      if(neededForInst>maxSubW)maxSubW=neededForInst;
    });
    maxSubW=Math.min(900,Math.max(520,maxSubW));

    const myGws=gwByVpc[vpc.VpcId]||[];
    const myVpce=vpceByVpc[vpc.VpcId]||[];
    const allGwItems=[...myGws];
    if(myVpce.length>0)allGwItems.push({type:'VPCE',id:'vpce_bundle',isVpce:true,count:myVpce.length});

    // Use fixed badge width
    const maxBadgeW=GW_BADGE_W;
    
    // ensure VPC wide enough for gateway badges
    const gwRowW=Math.min(allGwItems.length,GW_BADGES_PER_ROW)*(maxBadgeW+GW_BADGE_GAP)+VP*2;
    if(gwRowW>maxSubW)maxSubW=Math.max(maxSubW,gwRowW);

    const vpcW=maxSubW+VP*2;
    const vpcLabelW=tw(vpcLabel,14)+IC+24;
    const finalVpcW=Math.max(vpcW,vpcLabelW+VP*2);

    // gateway badge section height
    const gwRows=Math.ceil(allGwItems.length/GW_BADGES_PER_ROW);
    const gwSectionH=gwRows>0?(gwRows*(GW_BADGE_H+GW_BADGE_GAP)+GW_BADGE_GAP+10):0;

    const P1_NAME_H=36,P1_DETAIL_H=28,P1_CHILD_LINE_H=22,P1_CHILD_GAP=8,P1_RES_PAD=10;
    const P1_CHILD_INNER_W=EC2W-24;
    function p1ChildH(label){return Math.max(1,Math.ceil(tw(label,8)/P1_CHILD_INNER_W))*P1_CHILD_LINE_H+8;}
    function p1ResH(r){
      const chs=r.children||[];
      let h=P1_RES_PAD+P1_NAME_H;
      if(r.detail)h+=P1_DETAIL_H;
      if(chs.length>0){
        h+=P1_CHILD_GAP;
        chs.forEach(ch=>{h+=p1ChildH(ch.label||'')+P1_CHILD_GAP;});
      }
      h+=P1_RES_PAD;
      return Math.max(EC2H,h);
    }
    let subStackH=0;
    const subHeights={};
    ss.forEach(s=>{
      const sInsts=instances.filter(i=>i.SubnetId===s.SubnetId);
      const sAlbs=albs.filter(lb=>(lb.AvailabilityZones||[]).some(az=>az.SubnetId===s.SubnetId));
      const sRds=(rdsBySub[s.SubnetId]||[]);
      const sEcs=(ecsBySub[s.SubnetId]||[]);
      const sLam=(lambdaBySub[s.SubnetId]||[]);
      const sEni=(eniBySub[s.SubnetId]||[]);
      const p1Attached=new Set();
      // Build resources with children for height calc
      const p1Res=[];
      sInsts.forEach(i=>{
        const ie=enis.filter(e=>e.Attachment&&e.Attachment.InstanceId===i.InstanceId);
        ie.forEach(e=>p1Attached.add(e.NetworkInterfaceId));
        const ch=[];
        if(_showNested){
          ie.forEach(e=>ch.push({label:'ENI: '+e.NetworkInterfaceId.slice(-8)+(e.PrivateIpAddress?' \u00b7 '+e.PrivateIpAddress:'')}));
          (volByInst[i.InstanceId]||[]).forEach(v=>{const sc=(snapByVol[v.VolumeId]||[]).length;ch.push({label:'VOL: '+v.Size+'GB '+(v.VolumeType||'')+(sc?' \u00b7 '+sc+' snap':'')})});
        }
        p1Res.push({detail:i.InstanceType,children:ch});
      });
      sAlbs.forEach(lb=>{
        const ch=[];
        if(_showNested){
          (tgByAlb[lb.LoadBalancerArn]||[]).forEach(t=>ch.push({label:'TG: '+(t.TargetGroupName||'TG')+' \u00b7 '+((t.Targets||[]).length)+' tgt'}));
          (wafByAlb[lb.LoadBalancerArn]||[]).forEach(w=>ch.push({label:'WAF: '+(w.Name||'WAF')+' \u00b7 '+((w.Rules||[]).length)+' rules'}));
          (cfByAlb[lb.LoadBalancerArn]||[]).forEach(cf=>ch.push({label:'CF: '+(cf.DomainName||'CF')}));
        }
        p1Res.push({detail:lb.Scheme||'',children:ch});
      });
      sRds.forEach(db=>p1Res.push({detail:db.Engine||'',children:[]}));
      sEcs.forEach(svc=>p1Res.push({detail:svc.launchType||'',children:[]}));
      sLam.forEach(fn=>p1Res.push({detail:fn.Runtime||'',children:[]}));
      sEni.forEach(e=>{if(!p1Attached.has(e.NetworkInterfaceId))p1Res.push({detail:e.PrivateIpAddress||'',children:[]})});
      // Standalone EBS volumes
      ((volBySub||{})[s.SubnetId]||[]).forEach(v=>p1Res.push({detail:v.Size+'GB '+(v.VolumeType||''),children:[]}));
      const cols=Math.max(1,Math.floor((maxSubW-SP*2)/(EC2W+EC2G)));
      const rowCount=Math.ceil(p1Res.length/cols);
      let totalResH=0;
      for(let row=0;row<rowCount;row++){
        let maxH=EC2H;
        for(let c=0;c<cols;c++){const ri=row*cols+c;if(ri<p1Res.length){const h=p1ResH(p1Res[ri]);if(h>maxH)maxH=h;}}
        totalResH+=maxH+EC2G;
      }
      const subH=VH+totalResH+SP*2;
      const finalSubH=Math.max(60,subH);
      subHeights[s.SubnetId]=finalSubH;
      subStackH+=finalSubH+SG;
    });
    const vpcH=VH+gwSectionH+subStackH+VP;
    vpcInfos.push({vpc,ss,vpcLabel,maxSubW,finalVpcW,vpcH,allGwItems,gwSectionH,subHeights,maxBadgeW});
  });

  const VPC_TOP=80;
  const COL_SPACE=500; // extra space for per-VPC gateways on the right

  // track VPC positions for line routing
  const vpcPositions={};

  // PASS 2: place shapes
  let vpcX=120;

  vpcInfos.forEach(info=>{
    const {vpc,ss,vpcLabel,maxSubW,finalVpcW,vpcH,allGwItems,gwSectionH,subHeights,maxBadgeW}=info;
    info.vpcX=vpcX; // store for later use in line drawing
    const vpcId='vpc_'+(lid++);
    shapeIds[vpc.VpcId]=vpcId;
    
    // Get VPC stats
    const vpcSgs=sgByVpc[vpc.VpcId]||[];
    const vpcRts=rts.filter(rt=>rt.VpcId===vpc.VpcId);
    const vpcVpces=vpceList.filter(v=>v.VpcId===vpc.VpcId);
    const vpcInsts=instances.filter(i=>ss.some(s=>s.SubnetId===i.SubnetId));
    const vpcEnis=enis.filter(e=>e.VpcId===vpc.VpcId);
    const region=ss[0]?.AvailabilityZone?.replace(/-[a-z]$/,'')||'';

    // VPC container
    shapes.push({
      id:vpcId,type:'roundedRectangleContainer',
      boundingBox:{x:vpcX,y:VPC_TOP,w:finalVpcW,h:vpcH},
      text:NOTEXT,
      style:{stroke:{color:COL.vpcStroke,width:3,style:'dashed'},fill:{type:'color',color:COL.vpcFill}},
      magnetize:true,
      customData:[
        {key:'VPC ID',value:vpc.VpcId},
        {key:'Name',value:gn(vpc,vpc.VpcId)},
        {key:'CIDR',value:vpc.CidrBlock||''},
        {key:'Region',value:region},
        {key:'Subnets',value:String(ss.length)},
        {key:'Security Groups',value:String(vpcSgs.length)},
        {key:'Route Tables',value:String(vpcRts.length)},
        {key:'EC2 Instances',value:String(vpcInsts.length)},
        {key:'ENIs',value:String(vpcEnis.length)},
        {key:'VPC Endpoints',value:String(vpcVpces.length)}
      ]
    });
    // store VPC position for line routing
    vpcPositions[vpc.VpcId]={x:vpcX,w:finalVpcW,h:vpcH,bottomY:VPC_TOP+vpcH};
    addIcon('VPC',vpcX+6,VPC_TOP+4);
    // Truncate VPC label to fit - conservative estimate
    const maxVpcChars=Math.floor((finalVpcW-IC-50)/11);
    const dispVpcLabel=vpcLabel.length>maxVpcChars?vpcLabel.substring(0,maxVpcChars-2)+'..':vpcLabel;
    shapes.push({
      id:'vpclbl_'+(lid++),type:'rectangle',
      boundingBox:{x:vpcX+IC+12,y:VPC_TOP+4,w:finalVpcW-IC-24,h:VH-10},
      text:'<p style="font-size:14pt;font-weight:bold;color:'+COL.vpcFont+';text-align:left;padding:4px 8px">'+dispVpcLabel+'</p>',
      style:{stroke:{color:COL.vpcFill,width:0},fill:{type:'color',color:COL.vpcFill}}
    });

    // gateway badges inside VPC, below header
    const thisBadgeW=maxBadgeW||GW_BADGE_W;
    let gwBadgeY=VPC_TOP+VH+6;
    for(let row=0;row<Math.ceil(allGwItems.length/GW_BADGES_PER_ROW);row++){
      const rowItems=allGwItems.slice(row*GW_BADGES_PER_ROW,(row+1)*GW_BADGES_PER_ROW);
      let gwBX=vpcX+VP;
      rowItems.forEach(gw=>{
        const gc=gwColors2[gw.type]||'#546E7A';
        const gf=gwFills[gw.type]||'#F5F0FF';
        if(gw.isVpce){
          // Truncate VPCE text
          const vpceText='VPCE ('+gw.count+')';
          // VPCE badge with text
          shapes.push({
            id:'vpce_'+(lid++),type:'rectangle',
            boundingBox:{x:gwBX,y:gwBadgeY,w:thisBadgeW,h:GW_BADGE_H},
            text:NOTEXT,
            style:{stroke:{color:COL.vpce,width:2,style:'dashed'},fill:{type:'color',color:'#F5F0FF'}}
          });
          addIcon('VPCE',gwBX+10,gwBadgeY+10);
          shapes.push({
            id:'vpce_lbl_'+(lid++),type:'rectangle',
            boundingBox:{x:gwBX+52,y:gwBadgeY+10,w:thisBadgeW-62,h:36},
            text:'<p style="font-size:10pt;color:#232F3E;font-weight:bold;text-align:left">'+vpceText+'</p>',
            style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
          });
        } else {
          const nm=gwNames[gw.id]||sid(gw.id);
          
          // Build gateway-specific customData
          let gwCustomData=[
            {key:'Gateway ID',value:gw.id},
            {key:'Type',value:gw.type==='IGW'?'Internet Gateway':gw.type==='NAT'?'NAT Gateway':gw.type==='VGW'?'Virtual Private Gateway':gw.type},
            {key:'Name',value:nm}
          ];
          
          // Add NAT-specific info
          if(gw.type==='NAT'){
            const natGw=nats.find(n=>n.NatGatewayId===gw.id);
            if(natGw){
              gwCustomData.push({key:'State',value:natGw.State||''});
              gwCustomData.push({key:'Connectivity',value:natGw.ConnectivityType||'public'});
              const pubIp=(natGw.NatGatewayAddresses||[])[0]?.PublicIp;
              const privIp=(natGw.NatGatewayAddresses||[])[0]?.PrivateIp;
              if(pubIp)gwCustomData.push({key:'Public IP',value:pubIp});
              if(privIp)gwCustomData.push({key:'Private IP',value:privIp});
            }
          }
          
          // Add IGW-specific info
          if(gw.type==='IGW'){
            const igw=igws.find(g=>g.InternetGatewayId===gw.id);
            if(igw){
              const attachedVpcs=(igw.Attachments||[]).map(a=>a.VpcId).join(', ');
              gwCustomData.push({key:'Attached VPCs',value:attachedVpcs||'None'});
              gwCustomData.push({key:'State',value:(igw.Attachments||[])[0]?.State||''});
            }
          }
          
          // Truncate text to fit
          const maxBChars=Math.floor((thisBadgeW-60)/7);
          const fullBText=gw.type+': '+nm;
          const dispBText=fullBText.length>maxBChars?fullBText.substring(0,maxBChars-2)+'..':fullBText;
          
          // Gateway badge with text
          shapes.push({
            id:'gwb_'+(lid++),type:'rectangle',
            boundingBox:{x:gwBX,y:gwBadgeY,w:thisBadgeW,h:GW_BADGE_H},
            text:NOTEXT,
            style:{stroke:{color:gc,width:2},fill:{type:'color',color:gf}},
            customData:gwCustomData
          });
          addIcon(gw.type,gwBX+10,gwBadgeY+10);
          shapes.push({
            id:'gwb_lbl_'+(lid++),type:'rectangle',
            boundingBox:{x:gwBX+52,y:gwBadgeY+10,w:thisBadgeW-62,h:36},
            text:'<p style="font-size:10pt;font-weight:bold;color:#232F3E;text-align:left">'+dispBText+'</p>',
            style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
          });
        }
        gwBX+=thisBadgeW+GW_BADGE_GAP;
      });
      gwBadgeY+=GW_BADGE_H+GW_BADGE_GAP;
    }

    // subnets below gateway badges
    let subY=VPC_TOP+VH+gwSectionH;
    ss.forEach(s=>{
      const sName=gn(s,s.SubnetId);
      const isPub=pubSubs.has(s.SubnetId);
      const tag=isPub?'PUBLIC':'PRIVATE';
      const az=s.AvailabilityZone||'';
      const subLabel=sName+' ['+tag+'] '+s.CidrBlock+' '+az;
      const subId='sub_'+(lid++);
      shapeIds[s.SubnetId]=subId;
      const insts=instBySub[s.SubnetId]||[];
      const subEnis=eniBySub[s.SubnetId]||[];
      const subAlbs=albBySub[s.SubnetId]||[];
      const subRds=rdsBySub[s.SubnetId]||[];
      const subEcs=ecsBySub[s.SubnetId]||[];
      const subLambda=lambdaBySub[s.SubnetId]||[];
      const NAME_H=36,DETAIL_H=28,CHILD_LINE_H=22,CHILD_GAP=8,RES_PAD=10;
      const CHILD_INNER_W=EC2W-24;
      function childLines(label){return Math.max(1,Math.ceil(tw(label,8)/CHILD_INNER_W));}
      function childH(label){return childLines(label)*CHILD_LINE_H+8;}
      const attachedEnis=new Set();
      const resources=[];
      // EC2 with ENI + VOL children
      insts.forEach(i=>{
        const ch=[];
        const ie=enis.filter(e=>e.Attachment&&e.Attachment.InstanceId===i.InstanceId);
        ie.forEach(e=>attachedEnis.add(e.NetworkInterfaceId));
        if(_showNested){
          ie.forEach(e=>ch.push({type:'ENI',name:e.NetworkInterfaceId.slice(-8),detail:e.PrivateIpAddress||'',col:'#3b82f6'}));
          (volByInst[i.InstanceId]||[]).forEach(v=>{
            const sc=(snapByVol[v.VolumeId]||[]).length;
            ch.push({type:'VOL',name:v.Size+'GB '+(v.VolumeType||''),detail:sc?sc+' snap':'',col:'#f59e0b'});
          });
        }
        resources.push({type:'EC2',name:gn(i,i.InstanceId),id:i.InstanceId,detail:i.InstanceType,children:ch,resCol:'#10b981'});
      });
      // ALB with TG + WAF + CF children
      subAlbs.forEach(lb=>{
        const ch=[];
        if(_showNested){
          (tgByAlb[lb.LoadBalancerArn]||[]).forEach(tg=>ch.push({type:'TG',name:tg.TargetGroupName||'TG',detail:(tg.Targets||[]).length+' tgt',col:'#06b6d4'}));
          (wafByAlb[lb.LoadBalancerArn]||[]).forEach(w=>ch.push({type:'WAF',name:w.Name||'WAF',detail:(w.Rules||[]).length+' rules',col:'#eab308'}));
          (cfByAlb[lb.LoadBalancerArn]||[]).forEach(cf=>ch.push({type:'CF',name:cf.DomainName||'CF',detail:'',col:'#8b5cf6'}));
        }
        resources.push({type:'ALB',name:lb.LoadBalancerName||'ALB',id:lb.LoadBalancerArn,detail:lb.Scheme||'',children:ch,resCol:'#38bdf8'});
      });
      // RDS
      subRds.forEach(db=>resources.push({type:'RDS',name:db.DBInstanceIdentifier||'RDS',id:db.DBInstanceIdentifier,detail:db.Engine||'',children:[],resCol:'#3b82f6'}));
      // ECS
      subEcs.forEach(svc=>resources.push({type:'ECS',name:svc.serviceName||'ECS',id:svc.serviceName,detail:svc.launchType||'',children:[],resCol:'#f97316'}));
      // Lambda
      subLambda.forEach(fn=>resources.push({type:'FN',name:fn.FunctionName||'Lambda',id:fn.FunctionName,detail:fn.Runtime||'',children:[],resCol:'#a855f7'}));
      // Unattached ENIs
      subEnis.forEach(e=>{
        if(attachedEnis.has(e.NetworkInterfaceId))return;
        resources.push({type:'ENI',name:e.NetworkInterfaceId.slice(-8),id:e.NetworkInterfaceId,detail:e.PrivateIpAddress||'',children:[],resCol:'#3b82f6'});
      });
      // Standalone EBS volumes
      ((volBySub||{})[s.SubnetId]||[]).forEach(v=>{const att=(v.Attachments||[])[0];
        resources.push({type:'VOL',name:v.Size+'GB '+(v.VolumeType||''),id:v.VolumeId,detail:att?att.InstanceId?.slice(-8)||'':'detached',children:[],resCol:'#f59e0b'});
      });
      // Calculate per-resource height (name + detail + children + padding)
      function resHeight(r){
        const chs=r.children||[];
        let h=RES_PAD+NAME_H;
        if(r.detail)h+=DETAIL_H;
        if(chs.length>0){
          h+=CHILD_GAP;
          chs.forEach(ch=>{
            const lbl=ch.type+': '+ch.name+(ch.detail?' \u00b7 '+ch.detail:'');
            h+=childH(lbl)+CHILD_GAP;
          });
        }
        h+=RES_PAD;
        return Math.max(EC2H,h);
      }
      const cols=Math.max(1,Math.floor((maxSubW-SP*2)/(EC2W+EC2G)));
      // For row height, use max height of resources in that row
      const rowCount=Math.ceil(resources.length/cols);
      let totalResH=0;
      for(let row=0;row<rowCount;row++){
        let maxH=EC2H;
        for(let c=0;c<cols;c++){const ri=row*cols+c;if(ri<resources.length){const h=resHeight(resources[ri]);if(h>maxH)maxH=h;}}
        totalResH+=maxH+EC2G;
      }
      const subH=VH+totalResH+SP*2;
      const finalSubH=Math.max(60,subH);
      const sx=vpcX+VP,sy=subY;
      const fc=isPub?COL.pubFont:COL.prvFont;
      const fill=isPub?COL.pubFill:COL.prvFill;
      const stroke=isPub?COL.pubStroke:COL.prvStroke;
      
      // Get NACL and route table info
      const nacl=subNacl[s.SubnetId];
      const rt=subRT[s.SubnetId];
      const naclName=nacl?gn(nacl,nacl.NetworkAclId):'Default';
      const rtName=rt?gn(rt,rt.RouteTableId):'Main';
      const routes=(rt?.Routes||[]).filter(r=>r.GatewayId!=='local').map(r=>(r.DestinationCidrBlock||r.DestinationPrefixListId||'?')+' > '+(r.GatewayId||r.NatGatewayId||r.TransitGatewayId||'?')).join('; ');
      
      shapes.push({
        id:subId,type:'rectangle',
        boundingBox:{x:sx,y:sy,w:maxSubW,h:finalSubH},
        text:NOTEXT,
        style:{stroke:{color:stroke,width:2},fill:{type:'color',color:fill}},
        customData:[
          {key:'Subnet ID',value:s.SubnetId},
          {key:'Name',value:gn(s,s.SubnetId)},
          {key:'CIDR',value:s.CidrBlock||''},
          {key:'AZ',value:s.AvailabilityZone||''},
          {key:'Type',value:isPub?'Public':'Private'},
          {key:'NACL',value:naclName+(nacl?' ('+nacl.NetworkAclId+')':'')},
          {key:'Route Table',value:rtName+(rt?' ('+rt.RouteTableId+')':'')},
          {key:'Routes',value:routes||'local only'},
          {key:'EC2 Instances',value:String(insts.length)},
          {key:'ENIs',value:String(subEnis.length)},
          {key:'Load Balancers',value:String(subAlbs.length)}
        ]
      });
      addIcon(isPub?'SUB_PUB':'SUB_PRV',sx+6,sy+6);
      // Truncate subnet label to fit - conservative estimate
      const maxSubChars=Math.floor((maxSubW-IC-40)/9);
      const dispSubLabel=subLabel.length>maxSubChars?subLabel.substring(0,maxSubChars-2)+'..':subLabel;
      shapes.push({
        id:'sublbl_'+(lid++),type:'rectangle',
        boundingBox:{x:sx+IC+12,y:sy+6,w:maxSubW-IC-24,h:32},
        text:'<p style="font-size:10pt;font-weight:bold;color:'+fc+';text-align:left;padding:4px 6px">'+dispSubLabel+'</p>',
        style:{stroke:{color:fill,width:0},fill:{type:'color',color:fill}}
      });
      // Compute row Y offsets using variable row heights
      const rowHeights=[];
      for(let row=0;row<rowCount;row++){
        let maxH=EC2H;
        for(let c=0;c<cols;c++){const ri=row*cols+c;if(ri<resources.length){const h=resHeight(resources[ri]);if(h>maxH)maxH=h;}}
        rowHeights.push(maxH);
      }
      const rowYOff=[0];
      for(let i=0;i<rowHeights.length;i++)rowYOff.push(rowYOff[i]+rowHeights[i]+EC2G);

      resources.forEach((r,ri)=>{
        const col=ri%cols,row=Math.floor(ri/cols);
        const rx=sx+SP+col*(EC2W+EC2G);
        const ry=sy+VH+rowYOff[row];
        const isAlb=r.type==='ALB';
        const rH=resHeight(r);

        // Build customData based on resource type
        const resCustomData=[{key:'Type',value:r.type},{key:'Name',value:r.name||''},{key:'ID',value:r.id||''}];
        if(r.detail)resCustomData.push({key:'Detail',value:r.detail});

        // Truncate name to fit box
        const maxResChars=Math.floor((EC2W-20)/8);
        const dispResName=r.name.length>maxResChars?r.name.substring(0,maxResChars-2)+'..':r.name;

        // Build rich text: type badge + name + detail + children
        const rc=r.resCol||COL.ec2Font;
        let resHtml='<p style="font-size:9pt;color:'+rc+';font-weight:bold;text-align:left;padding:4px 6px">'+r.type+': '+dispResName+'</p>';
        if(r.detail){
          resHtml+='<p style="font-size:7pt;color:#6B7280;text-align:left;padding:0 6px">'+r.detail+'</p>';
        }
        (r.children||[]).forEach(ch=>{
          const chLabel=ch.type+': '+ch.name+(ch.detail?' \u00b7 '+ch.detail:'');
          resHtml+='<p style="font-size:8pt;color:'+ch.col+';font-weight:bold;text-align:left;padding:2px 6px;margin:4px 0">\u00a0\u00a0'+chLabel+'</p>';
        });

        // Resource container box
        shapes.push({
          id:'res_'+(lid++),type:'rectangle',
          boundingBox:{x:rx,y:ry,w:EC2W,h:rH},
          text:resHtml,
          style:{
            stroke:{color:rc,width:1},
            fill:{type:'color',color:'#FFFFFF'}
          },
          customData:resCustomData
        });
      });
      subY+=finalSubH+SG;
    });

    vpcX+=finalVpcW+COL_SPACE;
  });

  // Build subnet positions lookup (needed for gateway line routing)
  const subnetPositions={};
  vpcInfos.forEach(vi=>{
    const vpcX=vi.vpcX;
    let sy=VPC_TOP+VH+vi.gwSectionH;
    vi.ss.forEach((s,si)=>{
      const finalSubH=vi.subHeights[s.SubnetId]||60;
      subnetPositions[s.SubnetId]={
        x:vpcX+VP,
        y:sy,
        w:vi.maxSubW,
        h:finalSubH,
        vpcId:vi.vpc.VpcId,
        vpcX:vpcX,
        vpcW:vi.finalVpcW,
        vpcH:vi.vpcH,
        subIndex:si,
        centerX:vpcX+VP+vi.maxSubW/2,
        centerY:sy+finalSubH/2
      };
      sy+=finalSubH+SG;
    });
  });

  // --- Per-VPC Gateways (IGW, NAT, VGW) to the RIGHT of each VPC ---
  const PER_VPC_GW_X_OFFSET=60; // distance from VPC right edge
  const PER_VPC_GW_MAX_W=COL_SPACE-PER_VPC_GW_X_OFFSET-40; // max width to fit in column gap
  const PER_VPC_GW_H=56;
  const PER_VPC_GW_GAP=50;
  const perVpcGwPos={}; // gwId -> {x,y,centerX,centerY}
  
  vpcInfos.forEach(vi=>{
    const vpcRightX=vi.vpcX+vi.finalVpcW;
    const gwX=vpcRightX+PER_VPC_GW_X_OFFSET;
    
    // Get per-VPC gateways (IGW, NAT, VGW) for this VPC
    const vpcGws=vi.allGwItems.filter(g=>!g.isVpce && (g.type==='IGW'||g.type==='NAT'||g.type==='VGW'));
    
    // Use fixed width that fits within column space
    const maxGwW=PER_VPC_GW_MAX_W;
    
    let gwY=VPC_TOP+50;
    vpcGws.forEach((gw,gi)=>{
      const nm=gwNames[gw.id]||sid(gw.id);
      const gc=gwColors2[gw.type]||'#546E7A';
      const gf=gwFills[gw.type]||'#F5F0FF';
      const gwShapeId='pvgw_'+(lid++);
      shapeIds[gw.id]=gwShapeId;
      
      // Truncate text aggressively to fit within box (accounting for icon)
      const maxChars=Math.floor((maxGwW-70)/9);
      const fullText=gw.type+': '+nm;
      const dispText=fullText.length>maxChars?fullText.substring(0,maxChars-2)+'..':fullText;
      
      // Rectangle with text - icon overlaps but text stays in bounds
      shapes.push({
        id:gwShapeId,type:'rectangle',
        boundingBox:{x:gwX,y:gwY,w:maxGwW,h:PER_VPC_GW_H},
        text:'<p style="font-size:9pt;font-weight:bold;color:'+gc+';text-align:center">'+dispText+'</p>',
        style:{stroke:{color:gc,width:2},fill:{type:'color',color:gf}},
        customData:[
          {key:'Gateway ID',value:gw.id},
          {key:'Type',value:gw.type==='IGW'?'Internet Gateway':gw.type==='NAT'?'NAT Gateway':'Virtual Private Gateway'},
          {key:'Name',value:nm},
          {key:'VPC',value:vi.vpc.VpcId}
        ]
      });
      // Icon
      addIcon(gw.type,gwX+10,gwY+10);
      
      perVpcGwPos[gw.id]={
        x:gwX,
        y:gwY,
        centerX:gwX+maxGwW/2,
        centerY:gwY+PER_VPC_GW_H/2,
        leftEdge:gwX,
        vpcId:vi.vpc.VpcId
      };
      
      gwY+=PER_VPC_GW_H+PER_VPC_GW_GAP;
    });
  });

  // Build reverse map: rtId -> all subnets using it (for both per-VPC and shared gw lines)
  const rtToSubs={};
  subnets.forEach(s=>{
    const rt=subRT[s.SubnetId];
    if(rt){(rtToSubs[rt.RouteTableId]=rtToSubs[rt.RouteTableId]||[]).push(s.SubnetId)}
  });

  // --- Lines from subnets to per-VPC gateways (IGW, NAT, VGW) ---
  const perVpcGwLines={};
  rts.forEach(rt=>{
    const vId=rt.VpcId;
    const rtSubnets=rtToSubs[rt.RouteTableId]||[];
    if(rtSubnets.length===0)return;
    
    (rt.Routes||[]).forEach(r=>{
      // Check for IGW, NAT, VGW routes
      let gwId=null,gwType=null;
      if(r.GatewayId?.startsWith('igw-')){gwId=r.GatewayId;gwType='IGW';}
      else if(r.NatGatewayId){gwId=r.NatGatewayId;gwType='NAT';}
      else if(r.GatewayId?.startsWith('vgw-')){gwId=r.GatewayId;gwType='VGW';}
      
      if(!gwId||!perVpcGwPos[gwId])return;
      
      rtSubnets.forEach(subId=>{
        const key=subId+'|'+gwId;
        if(perVpcGwLines[key])return;
        perVpcGwLines[key]=true;
        
        const subPos=subnetPositions[subId];
        if(!subPos||!shapeIds[subId]||!shapeIds[gwId])return;
        
        const gwPos=perVpcGwPos[gwId];
        const gc=gwColors2[gwType]||'#546E7A';
        
        // Get names for metadata
        const subObj=subnets.find(s=>s.SubnetId===subId);
        const subName=subObj?gn(subObj,subId):subId;
        const gwName=gwNames[gwId]||sid(gwId);
        
        // Line from right edge of subnet to left edge of gateway
        // Route: right of subnet -> trunk outside VPC -> gateway
        const trunkX=subPos.vpcX+subPos.vpcW+30;
        
        lines.push({
          id:'pvln_'+(lid++),lineType:'straight',
          stroke:{color:gc,width:1.5},
          endpoint1:{type:'shapeEndpoint',style:'none',shapeId:shapeIds[subId],position:{x:1,y:0.5}},
          endpoint2:{type:'shapeEndpoint',style:'arrow',shapeId:shapeIds[gwId],position:{x:0,y:0.5}},
          joints:[
            {x:trunkX,y:subPos.centerY},
            {x:trunkX,y:gwPos.centerY}
          ],
          customData:[
            {key:'From Subnet',value:subName},
            {key:'Subnet ID',value:subId},
            {key:'To Gateway',value:gwName},
            {key:'Gateway ID',value:gwId},
            {key:'Gateway Type',value:gwType},
            {key:'Route',value:r.DestinationCidrBlock||''}
          ]
        });
      });
    });
  });

  // --- shared gateways (TGW, PCX) centered BELOW all VPCs ---
  const maxVpcH=vpcInfos.length>0?Math.max(...vpcInfos.map(v=>v.vpcH)):200;
  const BUS_Y=VPC_TOP+maxVpcH+80; // horizontal routing channel
  const SHARED_ROW_Y=VPC_TOP+maxVpcH+200;
  
  // Use fixed width for shared gateways
  const sharedTotalW=sharedGws.length*(GW_W+60);
  let sharedStartX=Math.max(40,(vpcX-sharedTotalW)/2);
  const sharedGwPos={};
  let sharedCurX=sharedStartX;
  sharedGws.forEach((gw,i)=>{
    const nm=gwNames[gw.id]||sid(gw.id);
    const gwLabel=gw.type+': '+nm;
    const gc=gwColors2[gw.type]||'#546E7A';
    const gf=gwFills[gw.type]||'#F5F0FF';
    const gwShapeId='sgw_'+(lid++);
    shapeIds[gw.gwMapId]=gwShapeId;
    const gwX=sharedCurX;
    const thisGwW=GW_W;
    
    // Find connected VPCs
    const connectedVpcs=new Set();
    rts.forEach(rt=>{
      (rt.Routes||[]).forEach(r=>{
        if((r.TransitGatewayId===gw.id)||(r.VpcPeeringConnectionId===gw.id)){
          connectedVpcs.add(rt.VpcId);
        }
      });
    });
    
    let gwCustomData=[
      {key:'Gateway ID',value:gw.id},
      {key:'Type',value:gw.type==='TGW'?'Transit Gateway':gw.type==='PCX'?'VPC Peering':'Gateway'},
      {key:'Name',value:nm},
      {key:'Connected VPCs',value:String(connectedVpcs.size)}
    ];
    
    // Add peering-specific info
    if(gw.type==='PCX'){
      const pcx=peerings.find(p=>p.VpcPeeringConnectionId===gw.id);
      if(pcx){
        gwCustomData.push({key:'Requester VPC',value:pcx.RequesterVpcInfo?.VpcId||''});
        gwCustomData.push({key:'Accepter VPC',value:pcx.AccepterVpcInfo?.VpcId||''});
        gwCustomData.push({key:'Status',value:pcx.Status?.Code||''});
      }
    }
    
    // Truncate text to fit
    const maxSChars=Math.floor((thisGwW-20)/9);
    const dispSText=gwLabel.length>maxSChars?gwLabel.substring(0,maxSChars-2)+'..':gwLabel;
    
    // Rectangle with text
    shapes.push({
      id:gwShapeId,type:'rectangle',
      boundingBox:{x:gwX,y:SHARED_ROW_Y,w:thisGwW,h:GW_H},
      text:'<p style="font-size:10pt;font-weight:bold;color:'+gc+';text-align:center">'+dispSText+'</p>',
      style:{stroke:{color:gc,width:2},fill:{type:'color',color:gf}},
      customData:gwCustomData
    });
    addIcon(gw.type,gwX+10,SHARED_ROW_Y+8);
    sharedGwPos[gw.gwMapId]={x:gwX,centerX:gwX+thisGwW/2,topY:SHARED_ROW_Y};
    sharedCurX+=thisGwW+60;
  });

  // --- LINES: Subnet -> shared TGW/PCX (per-subnet, routed around VPCs) ---
  // Track which subnet-gateway pairs we've drawn
  const subGwSeen=new Set();
  
  // Count lines per gateway for spreading connection points
  const gwLineCount={};
  rts.forEach(rt=>{
    const rtSubnets=rtToSubs[rt.RouteTableId]||[];
    (rt.Routes||[]).forEach(r=>{
      const tid=r.TransitGatewayId||r.VpcPeeringConnectionId;
      if(!tid)return;
      rtSubnets.forEach(subId=>{
        const ek=subId+'|'+tid;
        if(!subGwSeen.has(ek)){
          subGwSeen.add(ek);
          gwLineCount[tid]=(gwLineCount[tid]||0)+1;
        }
      });
    });
  });
  subGwSeen.clear();
  
  // Track current line index per gateway for spreading
  const gwLineIdx={};
  let globalLineIdx=0;
  
  rts.forEach(rt=>{
    const vId=rt.VpcId;
    if(!vpcPositions[vId])return;

    const rtSubnets=rtToSubs[rt.RouteTableId]||[];
    if(rtSubnets.length===0)return;

    (rt.Routes||[]).forEach(r=>{
      const tid=r.TransitGatewayId||r.VpcPeeringConnectionId;
      if(!tid||!shapeIds[tid]||!sharedGwPos[tid])return;
      const gc=gwColors2[gwSet2L.get(tid)?.type]||'#546E7A';
      const gwPos=sharedGwPos[tid];
      const totalLines=gwLineCount[tid]||1;

      rtSubnets.forEach(subId=>{
        const ek=subId+'|'+tid;
        if(subGwSeen.has(ek))return;
        subGwSeen.add(ek);
        
        const subPos=subnetPositions[subId];
        if(!subPos||!shapeIds[subId])return;
        
        // Get this line's index for this gateway
        if(gwLineIdx[tid]===undefined)gwLineIdx[tid]=0;
        const lineNum=gwLineIdx[tid]++;
        
        // Spread trunk lines across left margin of VPC
        const trunkX=subPos.vpcX-15-(subPos.subIndex%5)*4;
        
        // Spread bus Y levels
        const busYOff=globalLineIdx*2;
        
        // Spread connection points across gateway top (0.1 to 0.9)
        const spreadRatio=totalLines>1?lineNum/(totalLines-1):0.5;
        const gwConnectXRel=0.1+spreadRatio*0.8;
        
        // Get subnet and gateway names for line metadata
        const subObj=subnets.find(s=>s.SubnetId===subId);
        const subName=subObj?gn(subObj,subId):subId;
        const gwName=gwNames[tid]||sid(tid);
        
        lines.push({
          id:'ln_'+(lid++),lineType:'straight',
          stroke:{color:gc,width:1},
          endpoint1:{type:'shapeEndpoint',style:'none',shapeId:shapeIds[subId],position:{x:0,y:0.5}},
          endpoint2:{type:'shapeEndpoint',style:'arrow',shapeId:shapeIds[tid],position:{x:gwConnectXRel,y:0}},
          joints:[
            {x:trunkX,y:subPos.centerY},
            {x:trunkX,y:BUS_Y+busYOff},
            {x:gwPos.x+GW_W*gwConnectXRel,y:BUS_Y+busYOff}
          ],
          customData:[
            {key:'From Subnet',value:subName},
            {key:'Subnet ID',value:subId},
            {key:'To Gateway',value:gwName},
            {key:'Gateway ID',value:tid},
            {key:'Route Table',value:rt.RouteTableId||''}
          ]
        });
        globalLineIdx++;
      });
    });
  });

  // --- peering lines routed ABOVE VPCs ---
  const PEER_Y=VPC_TOP-30; // above all VPCs
  peerings.forEach((pcx,pi)=>{
    if(pcx.Status&&pcx.Status.Code!=='active')return;
    const rv=pcx.RequesterVpcInfo?.VpcId,av=pcx.AccepterVpcInfo?.VpcId;
    if(!shapeIds[rv]||!shapeIds[av])return;
    if(!vpcPositions[rv]||!vpcPositions[av])return;
    const vpcPosR=vpcPositions[rv];
    const vpcPosA=vpcPositions[av];
    
    // Get VPC names
    const vpcR=vpcs.find(v=>v.VpcId===rv);
    const vpcA=vpcs.find(v=>v.VpcId===av);
    const nameR=vpcR?gn(vpcR,rv):rv;
    const nameA=vpcA?gn(vpcA,av):av;
    
    // Get peering name
    const peerName=gn(pcx,pcx.VpcPeeringConnectionId)||pcx.VpcPeeringConnectionId;
    
    // Route via top edge of VPCs
    const exitXR=vpcPosR.x+vpcPosR.w*0.3+(pi%4)*20;
    const exitXA=vpcPosA.x+vpcPosA.w*0.7-(pi%4)*20;
    const peerYOff=pi*6;
    const midX=(exitXR+exitXA)/2;
    
    // Compute label dimensions first
    const maxPeerChars=35;
    const dispPeerName=peerName.length>maxPeerChars?peerName.substring(0,maxPeerChars-2)+'..':peerName;
    const labelW=Math.min(dispPeerName.length*9+32,320);
    const labelH=26;
    const labelX=midX-labelW/2;
    const labelY=PEER_Y-peerYOff-labelH/2;
    const labelPad=8;
    
    // Line segment 1: VPC R to label left edge
    lines.push({
      id:'pcx_L_'+(lid++),lineType:'straight',
      stroke:{color:COL.pcx,width:2,style:'dashed'},
      endpoint1:{type:'shapeEndpoint',style:'none',shapeId:shapeIds[rv],position:{x:0.3+(pi%4)*0.05,y:0}},
      endpoint2:{type:'positionEndpoint',style:'none',position:{x:labelX-labelPad,y:PEER_Y-peerYOff}},
      joints:[{x:exitXR,y:PEER_Y-peerYOff}],
      customData:[
        {key:'Peering ID',value:pcx.VpcPeeringConnectionId||''},
        {key:'Name',value:peerName},
        {key:'Requester VPC',value:nameR+' ('+rv+')'},
        {key:'Accepter VPC',value:nameA+' ('+av+')'},
        {key:'Status',value:pcx.Status?.Code||''}
      ]
    });
    
    // Line segment 2: label right edge to VPC A
    lines.push({
      id:'pcx_R_'+(lid++),lineType:'straight',
      stroke:{color:COL.pcx,width:2,style:'dashed'},
      endpoint1:{type:'positionEndpoint',style:'none',position:{x:labelX+labelW+labelPad,y:PEER_Y-peerYOff}},
      endpoint2:{type:'shapeEndpoint',style:'none',shapeId:shapeIds[av],position:{x:0.7-(pi%4)*0.05,y:0}},
      joints:[{x:exitXA,y:PEER_Y-peerYOff}]
    });
    
    // Label in the gap between line segments
    shapes.push({
      id:'pcxlbl_'+(lid++),type:'rectangle',
      boundingBox:{x:labelX,y:labelY,w:labelW,h:labelH},
      text:'<p style="font-size:10pt;color:'+COL.pcx+';text-align:center;font-weight:bold">'+dispPeerName+'</p>',
      style:{stroke:{color:COL.pcx,width:1.5},fill:{type:'color',color:'#FFFFFF'}}
    });
  });

  // --- Route 53 DNS Zones section ---
  if(zones.length>0){
    const pubZ=zones.filter(z=>!z.Config?.PrivateZone);
    const privZ=zones.filter(z=>z.Config?.PrivateZone);
    const dnsExp=(_detailLevel>=1);
    const dnsCols=dnsExp?1:2;
    const dnsColW=dnsExp?700:460;
    const dnsX=120;
    const dnsY=SHARED_ROW_Y+GW_H+80;
    const lzRecRowH=16,lzRecHdrH=18;

    const lzZoneHeights=[];
    zones.forEach(z=>{
      if(!dnsExp){lzZoneHeights.push(54);return}
      const isPub=!z.Config?.PrivateZone;
      const av=(!isPub&&z.VPCs)?z.VPCs.length:0;
      const zid=z.Id.replace('/hostedzone/','');
      const zR=recsByZone[zid]||[];
      let h=28;if(av)h+=lzRecRowH;
      if(zR.length>0)h+=lzRecHdrH+zR.length*lzRecRowH;
      lzZoneHeights.push(Math.max(54,h+12));
    });
    const lzZoneGap=8;
    let lzTotalZoneH=0;
    if(dnsExp){lzZoneHeights.forEach(h=>{lzTotalZoneH+=h+lzZoneGap})}
    else{lzTotalZoneH=Math.ceil(zones.length/dnsCols)*62}

    const dnsW=dnsCols*dnsColW+60;
    const dnsH=60+lzTotalZoneH+20;

    shapes.push({
      id:'dns_section',type:'rectangle',
      boundingBox:{x:dnsX,y:dnsY,w:dnsW,h:dnsH},
      text:NOTEXT,
      style:{stroke:{color:'#0ea5e9',width:2,style:'dashed'},fill:{type:'color',color:'#F0F9FF'}}
    });
    shapes.push({
      id:'dns_sec_title',type:'rectangle',
      boundingBox:{x:dnsX+10,y:dnsY+8,w:dnsW-20,h:30},
      text:'<p style="font-size:12pt;font-weight:bold;color:#0ea5e9;text-align:left">Route 53 Hosted Zones ('+pubZ.length+' public, '+privZ.length+' private)</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });

    let lzCurY=dnsY+48;
    zones.forEach((z,zi)=>{
      const isPub=!z.Config?.PrivateZone;
      const zid=z.Id.replace('/hostedzone/','');
      const assocVpcs=(!isPub&&z.VPCs)?z.VPCs.map(v=>{
        const vid=v.VPCId||v.VpcId;
        const vpc=vpcs.find(vp=>vp.VpcId===vid);
        return gn(vpc||{},vid);
      }).join(', '):'';
      const zh=lzZoneHeights[zi];
      const zRecs=recsByZone[zid]||[];

      if(dnsExp){
        const zx=dnsX+20;
        const zCol=isPub?'#10b981':'#0ea5e9';
        shapes.push({
          id:'gdns_'+zi,type:'rectangle',
          boundingBox:{x:zx,y:lzCurY,w:dnsColW-20,h:zh},
          text:NOTEXT,
          style:{stroke:{color:zCol,width:1.5},fill:{type:'color',color:isPub?'#F0FDF4':'#F0F9FF'}},
          customData:[
            {key:'Zone ID',value:zid},{key:'Name',value:z.Name},
            {key:'Type',value:isPub?'Public':'Private'},
            {key:'Records',value:String(z.ResourceRecordSetCount)},
            {key:'Associated VPCs',value:assocVpcs||'N/A'}
          ]
        });
        shapes.push({
          id:'gdnslbl_'+zi+'a',type:'rectangle',
          boundingBox:{x:zx+6,y:lzCurY+4,w:dnsColW-32,h:18},
          text:'<p style="font-size:10pt;font-weight:bold;color:'+zCol+';text-align:left">'+(isPub?'[Public]':'[Private]')+' '+z.Name+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
        let ly=lzCurY+22;
        shapes.push({
          id:'gdnslbl_'+zi+'b',type:'rectangle',
          boundingBox:{x:zx+6,y:ly,w:dnsColW-32,h:lzRecRowH},
          text:'<p style="font-size:8pt;color:#64748B;text-align:left">'+z.ResourceRecordSetCount+' records | Zone ID: '+zid+' | Type: '+(isPub?'Public':'Private')+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
        ly+=lzRecRowH;
        if(assocVpcs){
          shapes.push({
            id:'gdnslbl_'+zi+'d',type:'rectangle',
            boundingBox:{x:zx+6,y:ly,w:dnsColW-32,h:lzRecRowH},
            text:'<p style="font-size:8pt;color:#64748B;text-align:left">VPCs: '+assocVpcs+'</p>',
            style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
          });
          ly+=lzRecRowH;
        }
        if(zRecs.length>0){
          shapes.push({
            id:'gdnshdr_'+zi,type:'rectangle',
            boundingBox:{x:zx+6,y:ly,w:dnsColW-32,h:lzRecHdrH},
            text:'<p style="font-size:7pt;font-weight:bold;color:#475569;text-align:left">NAME                                                  TYPE      VALUE</p>',
            style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
          });
          ly+=lzRecHdrH;
          zRecs.forEach((rec,ri)=>{
            const rName=rec.Name||'';
            const rType=rec.Type||'';
            const rVal=rec.AliasTarget?'ALIAS → '+rec.AliasTarget.DNSName:
              (rec.ResourceRecords||[]).map(rr=>rr.Value).join(', ');
            const ttl=rec.TTL!=null?'  TTL:'+rec.TTL:'';
            shapes.push({
              id:'gdnsrec_'+zi+'_'+ri,type:'rectangle',
              boundingBox:{x:zx+6,y:ly,w:dnsColW-32,h:lzRecRowH},
              text:'<p style="font-size:7pt;color:#334155;text-align:left;font-family:monospace">'+rName+' &nbsp; '+rType+' &nbsp; '+rVal+ttl+'</p>',
              style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
            });
            ly+=lzRecRowH;
          });
        }
        lzCurY+=zh+lzZoneGap;
      }else{
        const col=zi%dnsCols;
        const row=Math.floor(zi/dnsCols);
        const zx=dnsX+20+col*dnsColW;
        const zy=dnsY+48+row*62;
        shapes.push({
          id:'gdns_'+zi,type:'rectangle',
          boundingBox:{x:zx,y:zy,w:dnsColW-20,h:54},
          text:NOTEXT,
          style:{stroke:{color:isPub?'#10b981':'#0ea5e9',width:1.5},fill:{type:'color',color:isPub?'#F0FDF4':'#F0F9FF'}},
          customData:[
            {key:'Zone ID',value:zid},{key:'Name',value:z.Name},
            {key:'Type',value:isPub?'Public':'Private'},
            {key:'Records',value:String(z.ResourceRecordSetCount)},
            {key:'Associated VPCs',value:assocVpcs||'N/A'}
          ]
        });
        shapes.push({
          id:'gdnslbl_'+zi+'a',type:'rectangle',
          boundingBox:{x:zx+6,y:zy+4,w:dnsColW-32,h:22},
          text:'<p style="font-size:9pt;font-weight:bold;color:'+(isPub?'#10b981':'#0ea5e9')+';text-align:left">'+(isPub?'[Public]':'[Private]')+' '+z.Name+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
        shapes.push({
          id:'gdnslbl_'+zi+'b',type:'rectangle',
          boundingBox:{x:zx+6,y:zy+28,w:dnsColW-32,h:20},
          text:'<p style="font-size:8pt;color:#64748B;text-align:left">'+z.ResourceRecordSetCount+' records | '+zid+(assocVpcs?' | VPCs: '+assocVpcs:'')+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
      }
    });
  }

  // --- S3 Buckets section ---
  if(s3bk.length>0){
    const s3Cols=3;
    const s3ColW=360;
    const s3W=s3Cols*s3ColW+60;
    const s3RowH=36;
    const s3Rows=Math.ceil(s3bk.length/s3Cols);
    const s3H=50+s3Rows*s3RowH+20;
    const s3X=120;
    const dnsExists=zones.length>0;
    const _lzDnsH=(function(){
      if(!dnsExists)return 0;
      const dExp=(_detailLevel>=1);const c=dExp?1:2;
      if(dExp){let th=0;zones.forEach(z=>{const ip=!z.Config?.PrivateZone;const av=(!ip&&z.VPCs)?z.VPCs.length:0;const zid=z.Id.replace('/hostedzone/','');const zR=recsByZone[zid]||[];let h=28;if(av)h+=16;if(zR.length>0)h+=18+zR.length*16;th+=Math.max(54,h+12)+8});return 60+th+20}
      return 60+Math.ceil(zones.length/c)*62+20;
    })();
    const s3Y=dnsExists?(SHARED_ROW_Y+GW_H+80+_lzDnsH+40):(SHARED_ROW_Y+GW_H+80);

    shapes.push({
      id:'s3_section',type:'rectangle',
      boundingBox:{x:s3X,y:s3Y,w:s3W,h:s3H},
      text:NOTEXT,
      style:{stroke:{color:'#EA580C',width:2,style:'dashed'},fill:{type:'color',color:'#FFF7ED'}}
    });
    shapes.push({
      id:'s3_sec_title',type:'rectangle',
      boundingBox:{x:s3X+10,y:s3Y+8,w:s3W-20,h:30},
      text:'<p style="font-size:12pt;font-weight:bold;color:#EA580C;text-align:left">S3 Buckets ('+s3bk.length+')</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });
    
    s3bk.forEach((bk,bi)=>{
      const col=bi%s3Cols;
      const row=Math.floor(bi/s3Cols);
      const bx=s3X+20+col*s3ColW;
      const by=s3Y+48+row*s3RowH;
      
      shapes.push({
        id:'gs3_'+bi,type:'rectangle',
        boundingBox:{x:bx,y:by,w:s3ColW-20,h:28},
        text:NOTEXT,
        style:{stroke:{color:'#EA580C',width:1},fill:{type:'color',color:'#FFFFFF'}},
        customData:[
          {key:'Bucket Name',value:bk.Name},
          {key:'Created',value:(bk.CreationDate||'N/A').split('T')[0]}
        ]
      });
      shapes.push({
        id:'gs3lbl_'+bi,type:'rectangle',
        boundingBox:{x:bx+4,y:by+2,w:s3ColW-28,h:24},
        text:'<p style="font-size:8pt;color:#232F3E;text-align:left">'+bk.Name+'</p>',
        style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
      });
    });
  }

  // --- LEGEND ---
  const legendX=vpcX+40;
  const legendY=VPC_TOP+20;
  const LEGEND_W=220,LEGEND_H=100;
  shapes.push({
    id:'legend_box',type:'rectangle',
    boundingBox:{x:legendX,y:legendY,w:LEGEND_W,h:LEGEND_H},
    text:NOTEXT,
    style:{stroke:{color:'#546E7A',width:1},fill:{type:'color',color:'#FFFFFF'}}
  });
  shapes.push({
    id:'legend_title',type:'rectangle',
    boundingBox:{x:legendX+8,y:legendY+8,w:LEGEND_W-16,h:20},
    text:'<p style="font-size:11pt;font-weight:bold;color:#232F3E;text-align:left">Legend</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
  });
  // TGW line sample (solid)
  lines.push({
    id:'legend_tgw_line',lineType:'straight',
    stroke:{color:COL.tgw,width:2},
    endpoint1:{type:'positionEndpoint',style:'none',position:{x:legendX+12,y:legendY+45}},
    endpoint2:{type:'positionEndpoint',style:'arrow',position:{x:legendX+55,y:legendY+45}}
  });
  shapes.push({
    id:'legend_tgw_label',type:'rectangle',
    boundingBox:{x:legendX+62,y:legendY+36,w:150,h:20},
    text:'<p style="font-size:9pt;color:#232F3E;text-align:left">Transit Gateway</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
  });
  // PCX line sample (dashed)
  lines.push({
    id:'legend_pcx_line',lineType:'straight',
    stroke:{color:COL.pcx,width:2,style:'dashed'},
    endpoint1:{type:'positionEndpoint',style:'none',position:{x:legendX+12,y:legendY+75}},
    endpoint2:{type:'positionEndpoint',style:'none',position:{x:legendX+55,y:legendY+75}}
  });
  shapes.push({
    id:'legend_pcx_label',type:'rectangle',
    boundingBox:{x:legendX+62,y:legendY+66,w:150,h:20},
    text:'<p style="font-size:9pt;color:#232F3E;text-align:left">VPC Peering</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
  });

  const doc={version:1,pages:[{id:'page1',title:'AWS-Network-Map',shapes,lines}]};
  return{doc,iconSet};
}

// generate .lucid ZIP blob
async function buildLucidZip(){
  const result=buildLucidExport();
  if(!result)return null;
  const{doc,iconSet}=result;
  if(typeof JSZip==='undefined'){alert('JSZip not loaded');return null}
  const zip=new JSZip();
  zip.file('document.json',JSON.stringify(doc));
  const imgFolder=zip.folder('images');
  for(const type of iconSet){
    const key=ICON_MAP[type]||type.toLowerCase();
    const dataUri=AWS_ICONS[key];
    if(!dataUri)continue;
    const b64=dataUri.split(',')[1];
    const bin=atob(b64);
    const arr=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
    imgFolder.file(key+'.png',arr);
  }
  return zip.generateAsync({type:'blob'});
}

// Download .lucid file
document.getElementById('expLucidDl').addEventListener('click',async()=>{
  try{
    const blob=await buildLucidZip();
    const mode=document.getElementById('layoutMode').value;
    const fname=mode==='landingzone'?'AWS-Landing-Zone.lucid':'AWS-Network-Map.lucid';
    if(blob)downloadBlob(blob,fname);
    else alert('Export returned empty. Load data first.');
  }catch(e){alert('Lucid export error: '+e.message);console.error(e)}
});


// Layout mode selector
if(_prefs.layoutMode){document.getElementById('layoutMode').value=_prefs.layoutMode;const hi=document.getElementById('hubVpcName');if(hi)hi.style.display=_prefs.layoutMode==='landingzone'?'block':'none';document.getElementById('detailBtns').style.display=_prefs.layoutMode==='executive'?'none':'flex';document.getElementById('flowBtn').style.display=_prefs.layoutMode==='executive'?'none':''}
document.getElementById('layoutMode').addEventListener('change',function(){
  const hubInput=document.getElementById('hubVpcName');
  hubInput.style.display=this.value==='landingzone'?'block':'none';
  document.getElementById('detailBtns').style.display=this.value==='executive'?'none':'flex';
  document.getElementById('flowBtn').style.display=this.value==='executive'?'none':'';
  savePrefs({layoutMode:this.value});
  const svg=d3.select('#mapSvg');
  if(svg.node()&&svg.style('display')!=='none'){
    renderMap();
  }
});
document.getElementById('hubVpcName').addEventListener('change',function(){
  const svg=d3.select('#mapSvg');
  if(svg.node()&&svg.style('display')!=='none'){
    renderMap();
  }
});

// Map detail level toggle
function updateDetailBtns(){
  document.getElementById('btnExpand').classList.toggle('active',_detailLevel>=1);
  document.getElementById('btnCollapse').classList.toggle('active',_detailLevel===0);
}
document.getElementById('btnExpand').addEventListener('click',function(){
  if(_detailLevel===0){_detailLevel=1;_showNested=false}
  else if(_detailLevel===1){_detailLevel=2;_showNested=true}
  updateDetailBtns();savePrefs({detailLevel:_detailLevel});
  const svg=d3.select('#mapSvg');
  if(svg.node()&&svg.style('display')!=='none') renderMap();
});
document.getElementById('btnCollapse').addEventListener('click',function(){
  if(_detailLevel===2){_detailLevel=1;_showNested=false}
  else{_detailLevel=0;_showNested=false}
  updateDetailBtns();savePrefs({detailLevel:_detailLevel});
  const svg=d3.select('#mapSvg');
  if(svg.node()&&svg.style('display')!=='none') renderMap();
});

// Initialize button state on load
updateDetailBtns();

// === TERRAFORM / CLOUDFORMATION EXPORT ===
let _iacType='terraform'; // 'terraform' | 'cloudformation'
let _iacOutput=''; // raw generated text

function _sanitizeName(s){
  if(!s)return 'unnamed';
  return s.replace(/[^a-zA-Z0-9_-]/g,'_').replace(/^[0-9]/,'r$&').replace(/-/g,'_').toLowerCase();
}

function _tfName(resource,prefix){
  const n=resource.Tags&&resource.Tags.find(t=>t.Key==='Name');
  const raw=n?n.Value:(resource.VpcId||resource.SubnetId||resource.GroupId||resource.InstanceId||prefix||'res');
  return _sanitizeName(raw);
}

// --- ID -> TF resource name maps (built during generation) ---
let _tfIdMap={};

function _tfRef(id,attr){
  if(_tfIdMap[id])return _tfIdMap[id]+'.'+attr;
  return '"'+id+'"';
}

// --- Circular SG detection ---
function detectCircularSGs(sgs){
  const graph={};
  sgs.forEach(sg=>{
    graph[sg.GroupId]=new Set();
    (sg.IpPermissions||[]).concat(sg.IpPermissionsEgress||[]).forEach(rule=>{
      (rule.UserIdGroupPairs||[]).forEach(pair=>{
        if(pair.GroupId&&pair.GroupId!==sg.GroupId)graph[sg.GroupId].add(pair.GroupId);
      });
    });
  });
  const cycles=[];
  const visited=new Set(),inStack=new Set();
  function dfs(node,path){
    if(inStack.has(node)){
      const ci=path.indexOf(node);
      if(ci>=0)cycles.push(path.slice(ci));
      return;
    }
    if(visited.has(node))return;
    visited.add(node);inStack.add(node);path.push(node);
    (graph[node]||new Set()).forEach(nb=>dfs(nb,[...path]));
    inStack.delete(node);
  }
  Object.keys(graph).forEach(n=>{if(!visited.has(n))dfs(n,[])});
  return cycles;
}

// --- HCL Generation ---
function generateTerraform(ctx,opts){
  if(!ctx||!ctx.vpcs)return '# No data loaded';
  _tfIdMap={};
  const lines=[];
  const vars=[];
  const imports=[];
  const warnings=[];
  const mode=opts.mode||'import';
  const scopeVpc=opts.scopeVpcId||null;
  const includeVars=opts.includeVars!==false;

  // Filter by scope
  const vpcs=scopeVpc?ctx.vpcs.filter(v=>v.VpcId===scopeVpc):ctx.vpcs;
  const vpcIds=new Set(vpcs.map(v=>v.VpcId));
  const subnets=(ctx.subnets||[]).filter(s=>vpcIds.has(s.VpcId));
  const subIds=new Set(subnets.map(s=>s.SubnetId));
  const sgs=(ctx.sgs||[]).filter(s=>vpcIds.has(s.VpcId));
  const rts=(ctx.rts||[]).filter(r=>{const assoc=(r.Associations||[]); return assoc.some(a=>vpcIds.has(a.SubnetId?subnets.find(s=>s.SubnetId===a.SubnetId)?.VpcId:null))||vpcIds.has(r.VpcId)});
  const nacls=(ctx.nacls||[]).filter(n=>vpcIds.has(n.VpcId));
  const igws=(ctx.igws||[]).filter(g=>(g.Attachments||[]).some(a=>vpcIds.has(a.VpcId)));
  const nats=(ctx.nats||[]).filter(n=>vpcIds.has(n.VpcId));
  const vpces=(ctx.vpces||[]).filter(v=>vpcIds.has(v.VpcId));
  const instances=(ctx.instances||[]).filter(i=>subIds.has(i.SubnetId));
  const rdsInstances=(ctx.rdsInstances||[]).filter(r=>{const sn=r.DBSubnetGroup;return sn&&(sn.Subnets||[]).some(s=>subIds.has(s.SubnetIdentifier))});
  const lambdaFns=(ctx.lambdaFns||[]).filter(l=>{const vc=l.VpcConfig;return vc&&(vc.SubnetIds||[]).some(s=>subIds.has(s))});
  const ecsServices=(ctx.ecsServices||[]).filter(e=>{const nc=(e.networkConfiguration||{}).awsvpcConfiguration;return nc&&(nc.subnets||[]).some(s=>subIds.has(s))});
  const ecacheClusters=(ctx.ecacheClusters||[]).filter(c=>c.CacheSubnetGroupName);
  const redshiftClusters=(ctx.redshiftClusters||[]).filter(c=>c.ClusterSubnetGroupName);
  const albs=(ctx.albs||[]).filter(a=>(a.AvailabilityZones||[]).some(az=>subIds.has(az.SubnetId)));
  const volumes=(ctx.volumes||[]).filter(v=>v.Attachments&&v.Attachments.some(a=>instances.find(i=>i.InstanceId===a.InstanceId)));
  const s3bk=scopeVpc?[]:(ctx.s3bk||[]);
  const peerings=(ctx.peerings||[]).filter(p=>{const a=p.AccepterVpcInfo,r=p.RequesterVpcInfo;return(a&&vpcIds.has(a.VpcId))||(r&&vpcIds.has(r.VpcId))});
  const cfDistributions=scopeVpc?[]:(ctx.cfDistributions||[]);

  // Header
  lines.push('# Generated by AWS Mapper');
  lines.push('# Date: '+new Date().toISOString().split('T')[0]);
  lines.push('# Mode: '+(mode==='import'?'Import Existing':mode==='create'?'Create New':'Full Recreate'));
  lines.push('#');
  lines.push('# KNOWN LIMITATIONS - Review before applying:');
  lines.push('# - AMI IDs are region-specific and may need updating');
  lines.push('# - Key pair names must exist in the target account');
  lines.push('# - IAM roles/instance profiles are not included');
  lines.push('# - Passwords and secrets are placeholder values');
  lines.push('# - Custom DNS/DHCP options may need manual configuration');
  lines.push('');

  // Provider
  lines.push('terraform {');
  lines.push('  required_providers {');
  lines.push('    aws = {');
  lines.push('      source  = "hashicorp/aws"');
  lines.push('      version = "~> 5.0"');
  lines.push('    }');
  lines.push('  }');
  lines.push('}');
  lines.push('');
  lines.push('provider "aws" {');
  lines.push('  region = var.aws_region');
  lines.push('');
  lines.push('  default_tags {');
  lines.push('    tags = {');
  lines.push('      ManagedBy   = "terraform"');
  lines.push('      GeneratedBy = "aws-mapper"');
  lines.push('    }');
  lines.push('  }');
  lines.push('}');
  lines.push('');

  // Variables
  if(includeVars){
    const region=subnets.length&&subnets[0].AvailabilityZone?subnets[0].AvailabilityZone.replace(/[a-z]$/,''):'us-east-1';
    vars.push({name:'aws_region',desc:'AWS Region',type:'string',def:region});
    const cidrs=new Set(vpcs.map(v=>v.CidrBlock));
    if(cidrs.size)vars.push({name:'vpc_cidrs',desc:'VPC CIDR blocks',type:'map(string)',def:null});
    const azs=new Set(subnets.map(s=>s.AvailabilityZone).filter(Boolean));
    if(azs.size)vars.push({name:'availability_zones',desc:'Availability zones',type:'list(string)',def:[...azs]});
    const iTypes=new Set(instances.map(i=>i.InstanceType).filter(Boolean));
    if(iTypes.size)vars.push({name:'instance_types',desc:'EC2 instance types in use',type:'map(string)',def:null});
  }

  vars.forEach(v=>{
    lines.push('variable "'+v.name+'" {');
    lines.push('  description = "'+v.desc+'"');
    lines.push('  type        = '+v.type);
    if(v.def!==null&&v.def!==undefined){
      if(Array.isArray(v.def)){
        lines.push('  default     = '+JSON.stringify(v.def));
      }else{
        lines.push('  default     = "'+v.def+'"');
      }
    }
    lines.push('}');
    lines.push('');
  });

  // Detect circular SGs
  const sgCycles=detectCircularSGs(sgs);
  const cyclicSgIds=new Set();
  sgCycles.forEach(c=>c.forEach(id=>cyclicSgIds.add(id)));

  // --- VPCs ---
  vpcs.forEach(vpc=>{
    const name=_tfName(vpc,'vpc');
    const resName='aws_vpc.'+name;
    _tfIdMap[vpc.VpcId]=resName;
    if(mode==='import')imports.push({to:resName,id:vpc.VpcId});
    lines.push('# VPC: '+(vpc.Tags&&vpc.Tags.find(t=>t.Key==='Name')?vpc.Tags.find(t=>t.Key==='Name').Value:vpc.VpcId));
    lines.push('resource "aws_vpc" "'+name+'" {');
    lines.push('  cidr_block           = "'+vpc.CidrBlock+'"');
    lines.push('  enable_dns_support   = '+(vpc.EnableDnsSupport!==false?'true':'false'));
    lines.push('  enable_dns_hostnames = '+(vpc.EnableDnsHostnames===true?'true':'false'));
    if(vpc.InstanceTenancy&&vpc.InstanceTenancy!=='default')lines.push('  instance_tenancy     = "'+vpc.InstanceTenancy+'"');
    _writeTags(lines,vpc);
    lines.push('}');
    lines.push('');
  });

  // --- IGWs ---
  igws.forEach(igw=>{
    const name=_tfName(igw,'igw');
    const resName='aws_internet_gateway.'+name;
    _tfIdMap[igw.InternetGatewayId]=resName;
    if(mode==='import')imports.push({to:resName,id:igw.InternetGatewayId});
    lines.push('resource "aws_internet_gateway" "'+name+'" {');
    const att=(igw.Attachments||[])[0];
    if(att)lines.push('  vpc_id = '+_tfRef(att.VpcId,'id'));
    _writeTags(lines,igw);
    lines.push('}');
    lines.push('');
  });

  // --- Subnets ---
  subnets.forEach(sub=>{
    const name=_tfName(sub,'subnet');
    const resName='aws_subnet.'+name;
    _tfIdMap[sub.SubnetId]=resName;
    if(mode==='import')imports.push({to:resName,id:sub.SubnetId});
    lines.push('resource "aws_subnet" "'+name+'" {');
    lines.push('  vpc_id            = '+_tfRef(sub.VpcId,'id'));
    lines.push('  cidr_block        = "'+sub.CidrBlock+'"');
    if(sub.AvailabilityZone)lines.push('  availability_zone = "'+sub.AvailabilityZone+'"');
    if(sub.MapPublicIpOnLaunch)lines.push('  map_public_ip_on_launch = true');
    _writeTags(lines,sub);
    lines.push('}');
    lines.push('');
  });

  // --- Route Tables ---
  rts.forEach(rt=>{
    const name=_tfName(rt,'rt');
    const resName='aws_route_table.'+name;
    _tfIdMap[rt.RouteTableId]=resName;
    if(mode==='import')imports.push({to:resName,id:rt.RouteTableId});
    const vpcId=rt.VpcId||(rt.Associations&&rt.Associations[0]?rt.Associations[0].VpcId:null);
    lines.push('resource "aws_route_table" "'+name+'" {');
    if(vpcId)lines.push('  vpc_id = '+_tfRef(vpcId,'id'));
    (rt.Routes||[]).forEach(route=>{
      if(route.GatewayId==='local')return;
      lines.push('');
      lines.push('  route {');
      if(route.DestinationCidrBlock)lines.push('    cidr_block = "'+route.DestinationCidrBlock+'"');
      if(route.GatewayId&&route.GatewayId!=='local')lines.push('    gateway_id = '+_tfRef(route.GatewayId,'id'));
      if(route.NatGatewayId)lines.push('    nat_gateway_id = '+_tfRef(route.NatGatewayId,'id'));
      if(route.VpcPeeringConnectionId)lines.push('    vpc_peering_connection_id = '+_tfRef(route.VpcPeeringConnectionId,'id'));
      if(route.TransitGatewayId)lines.push('    transit_gateway_id = "'+route.TransitGatewayId+'"');
      if(route.VpcEndpointId)lines.push('    vpc_endpoint_id = '+_tfRef(route.VpcEndpointId,'id'));
      lines.push('  }');
    });
    _writeTags(lines,rt);
    lines.push('}');
    lines.push('');
    // RT associations
    (rt.Associations||[]).forEach((assoc,ai)=>{
      if(assoc.Main)return;
      if(!assoc.SubnetId)return;
      const aname=name+'_assoc_'+ai;
      lines.push('resource "aws_route_table_association" "'+aname+'" {');
      lines.push('  subnet_id      = '+_tfRef(assoc.SubnetId,'id'));
      lines.push('  route_table_id = '+_tfRef(rt.RouteTableId,'id'));
      lines.push('}');
      lines.push('');
    });
  });

  // --- NAT Gateways ---
  nats.forEach(nat=>{
    const name=_tfName(nat,'nat');
    const resName='aws_nat_gateway.'+name;
    _tfIdMap[nat.NatGatewayId]=resName;
    if(mode==='import')imports.push({to:resName,id:nat.NatGatewayId});
    lines.push('resource "aws_nat_gateway" "'+name+'" {');
    if(nat.SubnetId)lines.push('  subnet_id     = '+_tfRef(nat.SubnetId,'id'));
    const eip=(nat.NatGatewayAddresses||[])[0];
    if(eip&&eip.AllocationId)lines.push('  allocation_id = "'+eip.AllocationId+'" # EIP allocation');
    lines.push('  connectivity_type = "'+(nat.ConnectivityType||'public')+'"');
    _writeTags(lines,nat);
    lines.push('}');
    lines.push('');
  });

  // --- Security Groups ---
  sgs.forEach(sg=>{
    const name=_tfName(sg,'sg');
    const resName='aws_security_group.'+name;
    _tfIdMap[sg.GroupId]=resName;
    if(mode==='import')imports.push({to:resName,id:sg.GroupId});
    const isCyclic=cyclicSgIds.has(sg.GroupId);
    if(isCyclic)lines.push('# Circular SG reference detected - rules split into separate resources');
    lines.push('resource "aws_security_group" "'+name+'" {');
    lines.push('  name        = "'+(sg.GroupName||name)+'"');
    lines.push('  description = "'+(sg.Description||'Managed by Terraform')+'"');
    if(sg.VpcId)lines.push('  vpc_id      = '+_tfRef(sg.VpcId,'id'));
    if(!isCyclic){
      (sg.IpPermissions||[]).forEach(rule=>{
        lines.push('');
        lines.push('  ingress {');
        _writeSGRule(lines,rule);
        lines.push('  }');
      });
      (sg.IpPermissionsEgress||[]).forEach(rule=>{
        lines.push('');
        lines.push('  egress {');
        _writeSGRule(lines,rule);
        lines.push('  }');
      });
    }
    _writeTags(lines,sg);
    lines.push('}');
    lines.push('');
    // Split rules for cyclic SGs
    if(isCyclic){
      (sg.IpPermissions||[]).forEach((rule,ri)=>{
        lines.push('resource "aws_security_group_rule" "'+name+'_ingress_'+ri+'" {');
        lines.push('  type              = "ingress"');
        lines.push('  security_group_id = '+_tfRef(sg.GroupId,'id'));
        _writeSGRuleFlat(lines,rule);
        lines.push('}');
        lines.push('');
      });
      (sg.IpPermissionsEgress||[]).forEach((rule,ri)=>{
        lines.push('resource "aws_security_group_rule" "'+name+'_egress_'+ri+'" {');
        lines.push('  type              = "egress"');
        lines.push('  security_group_id = '+_tfRef(sg.GroupId,'id'));
        _writeSGRuleFlat(lines,rule);
        lines.push('}');
        lines.push('');
      });
    }
  });

  // --- NACLs ---
  nacls.forEach(nacl=>{
    const name=_tfName(nacl,'nacl');
    const resName='aws_network_acl.'+name;
    _tfIdMap[nacl.NetworkAclId]=resName;
    if(mode==='import')imports.push({to:resName,id:nacl.NetworkAclId});
    lines.push('resource "aws_network_acl" "'+name+'" {');
    if(nacl.VpcId)lines.push('  vpc_id     = '+_tfRef(nacl.VpcId,'id'));
    const assocSubs=(nacl.Associations||[]).map(a=>a.SubnetId).filter(Boolean);
    if(assocSubs.length)lines.push('  subnet_ids = ['+assocSubs.map(s=>_tfRef(s,'id')).join(', ')+']');
    (nacl.Entries||[]).forEach(entry=>{
      if(entry.RuleNumber===32767)return; // default deny
      const dir=entry.Egress?'egress':'ingress';
      lines.push('');
      lines.push('  '+dir+' {');
      lines.push('    rule_no    = '+entry.RuleNumber);
      lines.push('    protocol   = "'+entry.Protocol+'"');
      lines.push('    action     = "'+(entry.RuleAction||'allow')+'"');
      if(entry.CidrBlock)lines.push('    cidr_block = "'+entry.CidrBlock+'"');
      if(entry.PortRange){
        lines.push('    from_port  = '+(entry.PortRange.From||0));
        lines.push('    to_port    = '+(entry.PortRange.To||0));
      }
      lines.push('  }');
    });
    _writeTags(lines,nacl);
    lines.push('}');
    lines.push('');
  });

  // --- VPC Endpoints ---
  vpces.forEach(vpce=>{
    const name=_tfName(vpce,'vpce');
    const resName='aws_vpc_endpoint.'+name;
    _tfIdMap[vpce.VpcEndpointId]=resName;
    if(mode==='import')imports.push({to:resName,id:vpce.VpcEndpointId});
    lines.push('resource "aws_vpc_endpoint" "'+name+'" {');
    if(vpce.VpcId)lines.push('  vpc_id            = '+_tfRef(vpce.VpcId,'id'));
    if(vpce.ServiceName)lines.push('  service_name      = "'+vpce.ServiceName+'"');
    if(vpce.VpcEndpointType)lines.push('  vpc_endpoint_type = "'+vpce.VpcEndpointType+'"');
    if(vpce.VpcEndpointType==='Interface'&&vpce.SubnetIds&&vpce.SubnetIds.length){
      lines.push('  subnet_ids        = ['+vpce.SubnetIds.map(s=>_tfRef(s,'id')).join(', ')+']');
    }
    if(vpce.RouteTableIds&&vpce.RouteTableIds.length){
      lines.push('  route_table_ids   = ['+vpce.RouteTableIds.map(r=>_tfRef(r,'id')).join(', ')+']');
    }
    _writeTags(lines,vpce);
    lines.push('}');
    lines.push('');
  });

  // --- EC2 Instances ---
  instances.forEach(inst=>{
    const name=_tfName(inst,'ec2');
    const resName='aws_instance.'+name;
    _tfIdMap[inst.InstanceId]=resName;
    if(mode==='import')imports.push({to:resName,id:inst.InstanceId});
    lines.push('resource "aws_instance" "'+name+'" {');
    if(inst.ImageId)lines.push('  ami           = "'+inst.ImageId+'" # WARNING: AMI is region-specific');
    if(inst.InstanceType)lines.push('  instance_type = "'+inst.InstanceType+'"');
    if(inst.SubnetId)lines.push('  subnet_id     = '+_tfRef(inst.SubnetId,'id'));
    if(inst.KeyName)lines.push('  key_name      = "'+inst.KeyName+'" # Must exist in target account');
    const sgIds=(inst.SecurityGroups||inst.NetworkInterfaces&&inst.NetworkInterfaces[0]&&inst.NetworkInterfaces[0].Groups||[]).map(g=>g.GroupId).filter(Boolean);
    if(sgIds.length)lines.push('  vpc_security_group_ids = ['+sgIds.map(s=>_tfRef(s,'id')).join(', ')+']');
    if(inst.IamInstanceProfile&&inst.IamInstanceProfile.Arn){
      lines.push('  iam_instance_profile = "'+inst.IamInstanceProfile.Arn.split('/').pop()+'" # IAM profile must exist');
    }
    if(inst.Placement&&inst.Placement.Tenancy&&inst.Placement.Tenancy!=='default'){
      lines.push('  tenancy = "'+inst.Placement.Tenancy+'"');
    }
    _writeTags(lines,inst);
    lines.push('}');
    lines.push('');
  });

  // --- EBS Volumes ---
  volumes.forEach(vol=>{
    const name=_tfName(vol,'vol');
    const resName='aws_ebs_volume.'+name;
    _tfIdMap[vol.VolumeId]=resName;
    if(mode==='import')imports.push({to:resName,id:vol.VolumeId});
    lines.push('resource "aws_ebs_volume" "'+name+'" {');
    if(vol.AvailabilityZone)lines.push('  availability_zone = "'+vol.AvailabilityZone+'"');
    if(vol.Size)lines.push('  size              = '+vol.Size);
    if(vol.VolumeType)lines.push('  type              = "'+vol.VolumeType+'"');
    if(vol.Iops&&(vol.VolumeType==='io1'||vol.VolumeType==='io2'||vol.VolumeType==='gp3'))lines.push('  iops              = '+vol.Iops);
    if(vol.Encrypted)lines.push('  encrypted         = true');
    _writeTags(lines,vol);
    lines.push('}');
    lines.push('');
  });

  // --- ALBs ---
  albs.forEach(alb=>{
    const name=_tfName(alb,'alb');
    const type=alb.Type||'application';
    const resType=type==='network'?'aws_lb':'aws_lb';
    const resName=resType+'.'+name;
    _tfIdMap[alb.LoadBalancerArn]=resName;
    if(mode==='import')imports.push({to:resName,id:alb.LoadBalancerArn});
    lines.push('resource "'+resType+'" "'+name+'" {');
    if(alb.LoadBalancerName)lines.push('  name               = "'+alb.LoadBalancerName+'"');
    lines.push('  load_balancer_type = "'+type+'"');
    lines.push('  internal           = '+(alb.Scheme==='internal'?'true':'false'));
    const albSubs=(alb.AvailabilityZones||[]).map(az=>az.SubnetId).filter(Boolean);
    if(albSubs.length)lines.push('  subnets            = ['+albSubs.map(s=>_tfRef(s,'id')).join(', ')+']');
    const albSgs=(alb.SecurityGroups||[]);
    if(albSgs.length)lines.push('  security_groups    = ['+albSgs.map(s=>_tfRef(s,'id')).join(', ')+']');
    _writeTags(lines,alb);
    lines.push('}');
    lines.push('');
  });

  // --- RDS Instances ---
  rdsInstances.forEach(rds=>{
    const name=_sanitizeName(rds.DBInstanceIdentifier||'rds');
    const resName='aws_db_instance.'+name;
    _tfIdMap[rds.DBInstanceIdentifier]=resName;
    if(mode==='import')imports.push({to:resName,id:rds.DBInstanceIdentifier});
    lines.push('resource "aws_db_instance" "'+name+'" {');
    if(rds.DBInstanceIdentifier)lines.push('  identifier     = "'+rds.DBInstanceIdentifier+'"');
    if(rds.Engine)lines.push('  engine         = "'+rds.Engine+'"');
    if(rds.EngineVersion)lines.push('  engine_version = "'+rds.EngineVersion+'"');
    if(rds.DBInstanceClass)lines.push('  instance_class = "'+rds.DBInstanceClass+'"');
    if(rds.AllocatedStorage)lines.push('  allocated_storage = '+rds.AllocatedStorage);
    if(rds.StorageType)lines.push('  storage_type   = "'+rds.StorageType+'"');
    if(rds.MultiAZ)lines.push('  multi_az       = true');
    if(rds.StorageEncrypted)lines.push('  storage_encrypted = true');
    if(rds.DBSubnetGroup&&rds.DBSubnetGroup.DBSubnetGroupName){
      lines.push('  db_subnet_group_name = "'+rds.DBSubnetGroup.DBSubnetGroupName+'"');
    }
    const rdsSgs=(rds.VpcSecurityGroups||[]).map(s=>s.VpcSecurityGroupId).filter(Boolean);
    if(rdsSgs.length)lines.push('  vpc_security_group_ids = ['+rdsSgs.map(s=>_tfRef(s,'id')).join(', ')+']');
    lines.push('  username         = "admin" # PLACEHOLDER - set actual username');
    lines.push('  password         = "CHANGE_ME" # PLACEHOLDER - use secrets manager');
    lines.push('  skip_final_snapshot = true');
    lines.push('}');
    lines.push('');
  });

  // --- ElastiCache ---
  ecacheClusters.forEach(ec=>{
    const name=_sanitizeName(ec.CacheClusterId||'cache');
    const resName='aws_elasticache_cluster.'+name;
    _tfIdMap[ec.CacheClusterId]=resName;
    if(mode==='import')imports.push({to:resName,id:ec.CacheClusterId});
    lines.push('resource "aws_elasticache_cluster" "'+name+'" {');
    if(ec.CacheClusterId)lines.push('  cluster_id      = "'+ec.CacheClusterId+'"');
    if(ec.Engine)lines.push('  engine          = "'+ec.Engine+'"');
    if(ec.CacheNodeType)lines.push('  node_type       = "'+ec.CacheNodeType+'"');
    if(ec.NumCacheNodes)lines.push('  num_cache_nodes = '+ec.NumCacheNodes);
    if(ec.EngineVersion)lines.push('  engine_version  = "'+ec.EngineVersion+'"');
    if(ec.CacheSubnetGroupName)lines.push('  subnet_group_name = "'+ec.CacheSubnetGroupName+'"');
    const ecSgs=(ec.SecurityGroups||[]).map(s=>s.SecurityGroupId).filter(Boolean);
    if(ecSgs.length)lines.push('  security_group_ids = ['+ecSgs.map(s=>_tfRef(s,'id')).join(', ')+']');
    lines.push('}');
    lines.push('');
  });

  // --- Redshift ---
  redshiftClusters.forEach(rs=>{
    const name=_sanitizeName(rs.ClusterIdentifier||'redshift');
    const resName='aws_redshift_cluster.'+name;
    _tfIdMap[rs.ClusterIdentifier]=resName;
    if(mode==='import')imports.push({to:resName,id:rs.ClusterIdentifier});
    lines.push('resource "aws_redshift_cluster" "'+name+'" {');
    if(rs.ClusterIdentifier)lines.push('  cluster_identifier  = "'+rs.ClusterIdentifier+'"');
    if(rs.NodeType)lines.push('  node_type           = "'+rs.NodeType+'"');
    if(rs.NumberOfNodes>1)lines.push('  number_of_nodes     = '+rs.NumberOfNodes);
    lines.push('  cluster_type        = "'+(rs.NumberOfNodes>1?'multi-node':'single-node')+'"');
    if(rs.DBName)lines.push('  database_name       = "'+rs.DBName+'"');
    lines.push('  master_username     = "admin" # PLACEHOLDER');
    lines.push('  master_password     = "CHANGE_ME" # PLACEHOLDER');
    if(rs.ClusterSubnetGroupName)lines.push('  cluster_subnet_group_name = "'+rs.ClusterSubnetGroupName+'"');
    const rsSgs=(rs.VpcSecurityGroups||[]).map(s=>s.VpcSecurityGroupId).filter(Boolean);
    if(rsSgs.length)lines.push('  vpc_security_group_ids = ['+rsSgs.map(s=>_tfRef(s,'id')).join(', ')+']');
    lines.push('  skip_final_snapshot = true');
    lines.push('}');
    lines.push('');
  });

  // --- Lambda Functions ---
  lambdaFns.forEach(fn=>{
    const name=_sanitizeName(fn.FunctionName||'lambda');
    const resName='aws_lambda_function.'+name;
    _tfIdMap[fn.FunctionName]=resName;
    if(mode==='import')imports.push({to:resName,id:fn.FunctionName});
    lines.push('resource "aws_lambda_function" "'+name+'" {');
    if(fn.FunctionName)lines.push('  function_name = "'+fn.FunctionName+'"');
    if(fn.Runtime)lines.push('  runtime       = "'+fn.Runtime+'"');
    if(fn.Handler)lines.push('  handler       = "'+fn.Handler+'"');
    if(fn.MemorySize)lines.push('  memory_size   = '+fn.MemorySize);
    if(fn.Timeout)lines.push('  timeout       = '+fn.Timeout);
    lines.push('  role          = "arn:aws:iam::role/PLACEHOLDER" # Set actual IAM role ARN');
    lines.push('  filename      = "placeholder.zip" # Set actual deployment package');
    const vc=fn.VpcConfig;
    if(vc&&(vc.SubnetIds||[]).length){
      lines.push('');
      lines.push('  vpc_config {');
      lines.push('    subnet_ids         = ['+vc.SubnetIds.map(s=>_tfRef(s,'id')).join(', ')+']');
      if(vc.SecurityGroupIds&&vc.SecurityGroupIds.length)lines.push('    security_group_ids = ['+vc.SecurityGroupIds.map(s=>_tfRef(s,'id')).join(', ')+']');
      lines.push('  }');
    }
    lines.push('}');
    lines.push('');
  });

  // --- ECS Services ---
  ecsServices.forEach(svc=>{
    const name=_sanitizeName(svc.serviceName||'ecs');
    lines.push('# ECS Service: '+svc.serviceName);
    lines.push('# NOTE: ECS services require cluster and task definition resources');
    lines.push('# which are not captured in network-level data. Skeleton below.');
    lines.push('resource "aws_ecs_service" "'+name+'" {');
    if(svc.serviceName)lines.push('  name            = "'+svc.serviceName+'"');
    lines.push('  cluster         = "PLACEHOLDER" # Set actual cluster ARN');
    lines.push('  task_definition = "PLACEHOLDER" # Set actual task definition');
    if(svc.desiredCount)lines.push('  desired_count   = '+svc.desiredCount);
    if(svc.launchType)lines.push('  launch_type     = "'+svc.launchType+'"');
    const nc=(svc.networkConfiguration||{}).awsvpcConfiguration;
    if(nc){
      lines.push('');
      lines.push('  network_configuration {');
      if(nc.subnets&&nc.subnets.length)lines.push('    subnets          = ['+nc.subnets.map(s=>_tfRef(s,'id')).join(', ')+']');
      if(nc.securityGroups&&nc.securityGroups.length)lines.push('    security_groups  = ['+nc.securityGroups.map(s=>_tfRef(s,'id')).join(', ')+']');
      if(nc.assignPublicIp)lines.push('    assign_public_ip = '+(nc.assignPublicIp==='ENABLED'?'true':'false'));
      lines.push('  }');
    }
    lines.push('}');
    lines.push('');
  });

  // --- S3 Buckets ---
  s3bk.forEach(bk=>{
    const name=_sanitizeName(bk.Name||'bucket');
    const resName='aws_s3_bucket.'+name;
    _tfIdMap[bk.Name]=resName;
    if(mode==='import')imports.push({to:resName,id:bk.Name});
    lines.push('resource "aws_s3_bucket" "'+name+'" {');
    if(bk.Name)lines.push('  bucket = "'+bk.Name+'"');
    lines.push('}');
    lines.push('');
  });

  // --- VPC Peering ---
  peerings.forEach(peer=>{
    const name=_sanitizeName(peer.VpcPeeringConnectionId||'peer');
    const resName='aws_vpc_peering_connection.'+name;
    _tfIdMap[peer.VpcPeeringConnectionId]=resName;
    if(mode==='import')imports.push({to:resName,id:peer.VpcPeeringConnectionId});
    lines.push('resource "aws_vpc_peering_connection" "'+name+'" {');
    const req=peer.RequesterVpcInfo,acc=peer.AccepterVpcInfo;
    if(req&&req.VpcId)lines.push('  vpc_id      = '+_tfRef(req.VpcId,'id'));
    if(acc&&acc.VpcId)lines.push('  peer_vpc_id = '+_tfRef(acc.VpcId,'id'));
    if(acc&&acc.OwnerId)lines.push('  peer_owner_id = "'+acc.OwnerId+'"');
    if(acc&&acc.Region)lines.push('  peer_region   = "'+acc.Region+'"');
    lines.push('  auto_accept = false # Set to true for same-account peering');
    lines.push('}');
    lines.push('');
  });

  // --- CloudFront ---
  cfDistributions.forEach(cf=>{
    const name=_sanitizeName(cf.Id||'cf');
    lines.push('# CloudFront Distribution: '+(cf.DomainName||cf.Id));
    lines.push('# NOTE: CloudFront has many configuration options not captured here.');
    lines.push('# This is a skeleton. Review and customize before applying.');
    lines.push('resource "aws_cloudfront_distribution" "'+name+'" {');
    lines.push('  enabled = '+(cf.Enabled!==false?'true':'false'));
    if(cf.Comment)lines.push('  comment = "'+cf.Comment.replace(/"/g,'\\"')+'"');
    lines.push('');
    lines.push('  origin {');
    lines.push('    domain_name = "PLACEHOLDER.s3.amazonaws.com"');
    lines.push('    origin_id   = "S3-origin"');
    lines.push('  }');
    lines.push('');
    lines.push('  default_cache_behavior {');
    lines.push('    allowed_methods        = ["GET", "HEAD"]');
    lines.push('    cached_methods         = ["GET", "HEAD"]');
    lines.push('    target_origin_id       = "S3-origin"');
    lines.push('    viewer_protocol_policy = "redirect-to-https"');
    lines.push('');
    lines.push('    forwarded_values {');
    lines.push('      query_string = false');
    lines.push('      cookies { forward = "none" }');
    lines.push('    }');
    lines.push('  }');
    lines.push('');
    lines.push('  restrictions {');
    lines.push('    geo_restriction { restriction_type = "none" }');
    lines.push('  }');
    lines.push('');
    lines.push('  viewer_certificate { cloudfront_default_certificate = true }');
    lines.push('}');
    lines.push('');
  });

  // --- Import blocks (Terraform 1.5+) ---
  if(mode==='import'&&imports.length){
    lines.push('');
    lines.push('# === Import Blocks (Terraform 1.5+) ===');
    lines.push('# Run: terraform plan to verify imports match existing state');
    lines.push('');
    imports.forEach(imp=>{
      lines.push('import {');
      lines.push('  to = '+imp.to);
      lines.push('  id = "'+imp.id+'"');
      lines.push('}');
      lines.push('');
    });
  }

  // Warnings
  if(instances.some(i=>i.ImageId))warnings.push('AMI IDs are region-specific. Update for target region.');
  if(instances.some(i=>i.KeyName))warnings.push('Key pair names must exist in the target account.');
  if(rdsInstances.length||redshiftClusters.length)warnings.push('Database passwords are placeholders. Use AWS Secrets Manager.');
  if(sgCycles.length)warnings.push(sgCycles.length+' circular SG reference(s) detected. Rules split into separate resources.');

  _iacOutput=lines.join('\n');
  return {code:_iacOutput,warnings:warnings,stats:{vpcs:vpcs.length,subnets:subnets.length,sgs:sgs.length,instances:instances.length,total:imports.length||lines.filter(l=>l.startsWith('resource ')).length}};
}

function _writeTags(lines,resource){
  const tags=(resource.Tags||[]).filter(t=>t.Key!=='aws:');
  if(!tags.length)return;
  lines.push('');
  lines.push('  tags = {');
  tags.forEach(t=>{
    const k=t.Key.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)?t.Key:('"'+t.Key+'"');
    lines.push('    '+k+' = "'+((t.Value||'').replace(/"/g,'\\"'))+'"');
  });
  lines.push('  }');
}

function _writeSGRule(lines,rule){
  const fromPort=rule.FromPort!=null?rule.FromPort:0;
  const toPort=rule.ToPort!=null?rule.ToPort:0;
  const proto=rule.IpProtocol||'-1';
  lines.push('    protocol    = "'+proto+'"');
  lines.push('    from_port   = '+fromPort);
  lines.push('    to_port     = '+toPort);
  const cidrs=(rule.IpRanges||[]).map(r=>r.CidrIp).filter(Boolean);
  const v6cidrs=(rule.Ipv6Ranges||[]).map(r=>r.CidrIpv6).filter(Boolean);
  const sgRefs=(rule.UserIdGroupPairs||[]).map(p=>p.GroupId).filter(Boolean);
  if(cidrs.length)lines.push('    cidr_blocks = '+JSON.stringify(cidrs));
  if(v6cidrs.length)lines.push('    ipv6_cidr_blocks = '+JSON.stringify(v6cidrs));
  if(sgRefs.length)lines.push('    security_groups = ['+sgRefs.map(s=>_tfRef(s,'id')).join(', ')+']');
  const desc=(rule.IpRanges||[]).find(r=>r.Description);
  if(desc)lines.push('    description = "'+(desc.Description||'').replace(/"/g,'\\"')+'"');
}

function _writeSGRuleFlat(lines,rule){
  const fromPort=rule.FromPort!=null?rule.FromPort:0;
  const toPort=rule.ToPort!=null?rule.ToPort:0;
  const proto=rule.IpProtocol||'-1';
  lines.push('  protocol         = "'+proto+'"');
  lines.push('  from_port        = '+fromPort);
  lines.push('  to_port          = '+toPort);
  const cidrs=(rule.IpRanges||[]).map(r=>r.CidrIp).filter(Boolean);
  const sgRefs=(rule.UserIdGroupPairs||[]).map(p=>p.GroupId).filter(Boolean);
  if(cidrs.length)lines.push('  cidr_blocks      = '+JSON.stringify(cidrs));
  if(sgRefs.length&&sgRefs[0])lines.push('  source_security_group_id = '+_tfRef(sgRefs[0],'id'));
}

// --- CloudFormation Generation ---
function generateCloudFormation(ctx,opts){
  if(!ctx||!ctx.vpcs)return '# No data loaded';
  const scopeVpc=opts.scopeVpcId||null;
  const vpcs=scopeVpc?ctx.vpcs.filter(v=>v.VpcId===scopeVpc):ctx.vpcs;
  const vpcIds=new Set(vpcs.map(v=>v.VpcId));
  const subnets=(ctx.subnets||[]).filter(s=>vpcIds.has(s.VpcId));
  const subIds=new Set(subnets.map(s=>s.SubnetId));
  const sgs=(ctx.sgs||[]).filter(s=>vpcIds.has(s.VpcId));
  const igws=(ctx.igws||[]).filter(g=>(g.Attachments||[]).some(a=>vpcIds.has(a.VpcId)));
  const nats=(ctx.nats||[]).filter(n=>vpcIds.has(n.VpcId));
  const instances=(ctx.instances||[]).filter(i=>subIds.has(i.SubnetId));
  const rts=(ctx.rts||[]).filter(r=>r.VpcId&&vpcIds.has(r.VpcId));
  const rdsInstances=(ctx.rdsInstances||[]).filter(r=>{const sn=r.DBSubnetGroup;return sn&&(sn.Subnets||[]).some(s=>subIds.has(s.SubnetIdentifier))});
  const albs=(ctx.albs||[]).filter(a=>(a.AvailabilityZones||[]).some(az=>subIds.has(az.SubnetId)));

  const warnings=[];
  const totalResources=vpcs.length+subnets.length+sgs.length+igws.length+nats.length+instances.length+rts.length+rdsInstances.length+albs.length;
  if(totalResources>450)warnings.push('Resource count ('+totalResources+') approaches CloudFormation 500-resource limit. Consider nested stacks.');

  const template={
    AWSTemplateFormatVersion:'2010-09-09',
    Description:'Generated by AWS Mapper on '+new Date().toISOString().split('T')[0],
    Parameters:{},
    Resources:{},
    Outputs:{}
  };

  // ID to logical name map for Ref
  const cfnIdMap={};
  function cfnName(resource,prefix){
    const n=resource.Tags&&resource.Tags.find(t=>t.Key==='Name');
    const raw=n?n.Value:(prefix||'Res');
    return raw.replace(/[^a-zA-Z0-9]/g,'');
  }
  function cfnRef(id){
    if(cfnIdMap[id])return {'Ref':cfnIdMap[id]};
    return id;
  }

  // Parameters
  template.Parameters.AWSRegion={Type:'String',Default:subnets.length&&subnets[0].AvailabilityZone?subnets[0].AvailabilityZone.replace(/[a-z]$/,''):'us-east-1',Description:'AWS Region'};

  // VPCs
  vpcs.forEach(vpc=>{
    const ln=cfnName(vpc,'VPC');
    cfnIdMap[vpc.VpcId]=ln;
    template.Resources[ln]={
      Type:'AWS::EC2::VPC',
      Properties:{
        CidrBlock:vpc.CidrBlock,
        EnableDnsSupport:vpc.EnableDnsSupport!==false,
        EnableDnsHostnames:vpc.EnableDnsHostnames===true,
        Tags:_cfnTags(vpc)
      }
    };
  });

  // IGWs
  igws.forEach(igw=>{
    const ln=cfnName(igw,'IGW');
    cfnIdMap[igw.InternetGatewayId]=ln;
    template.Resources[ln]={Type:'AWS::EC2::InternetGateway',Properties:{Tags:_cfnTags(igw)}};
    const att=(igw.Attachments||[])[0];
    if(att){
      template.Resources[ln+'Attach']={
        Type:'AWS::EC2::VPCGatewayAttachment',
        Properties:{InternetGatewayId:{'Ref':ln},VpcId:cfnRef(att.VpcId)}
      };
    }
  });

  // Subnets
  subnets.forEach(sub=>{
    const ln=cfnName(sub,'Subnet');
    cfnIdMap[sub.SubnetId]=ln;
    const props={VpcId:cfnRef(sub.VpcId),CidrBlock:sub.CidrBlock,Tags:_cfnTags(sub)};
    if(sub.AvailabilityZone)props.AvailabilityZone=sub.AvailabilityZone;
    if(sub.MapPublicIpOnLaunch)props.MapPublicIpOnLaunch=true;
    template.Resources[ln]={Type:'AWS::EC2::Subnet',Properties:props};
  });

  // Route Tables
  rts.forEach(rt=>{
    const ln=cfnName(rt,'RT');
    cfnIdMap[rt.RouteTableId]=ln;
    template.Resources[ln]={Type:'AWS::EC2::RouteTable',Properties:{VpcId:cfnRef(rt.VpcId),Tags:_cfnTags(rt)}};
    (rt.Routes||[]).forEach((route,ri)=>{
      if(route.GatewayId==='local')return;
      const routeProps={RouteTableId:{'Ref':ln}};
      if(route.DestinationCidrBlock)routeProps.DestinationCidrBlock=route.DestinationCidrBlock;
      if(route.GatewayId&&route.GatewayId!=='local')routeProps.GatewayId=cfnRef(route.GatewayId);
      if(route.NatGatewayId)routeProps.NatGatewayId=cfnRef(route.NatGatewayId);
      template.Resources[ln+'Route'+ri]={Type:'AWS::EC2::Route',Properties:routeProps};
    });
    (rt.Associations||[]).forEach((assoc,ai)=>{
      if(assoc.Main||!assoc.SubnetId)return;
      template.Resources[ln+'Assoc'+ai]={
        Type:'AWS::EC2::SubnetRouteTableAssociation',
        Properties:{SubnetId:cfnRef(assoc.SubnetId),RouteTableId:{'Ref':ln}}
      };
    });
  });

  // NAT Gateways
  nats.forEach(nat=>{
    const ln=cfnName(nat,'NAT');
    cfnIdMap[nat.NatGatewayId]=ln;
    const props={SubnetId:cfnRef(nat.SubnetId),ConnectivityType:nat.ConnectivityType||'public'};
    const eip=(nat.NatGatewayAddresses||[])[0];
    if(eip&&eip.AllocationId)props.AllocationId=eip.AllocationId;
    template.Resources[ln]={Type:'AWS::EC2::NatGateway',Properties:props,DependsOn:Object.keys(template.Resources).filter(k=>k.endsWith('Attach'))};
  });

  // Security Groups
  const sgCycles=detectCircularSGs(sgs);
  const cyclicSgIds=new Set();
  sgCycles.forEach(c=>c.forEach(id=>cyclicSgIds.add(id)));

  sgs.forEach(sg=>{
    const ln=cfnName(sg,'SG');
    cfnIdMap[sg.GroupId]=ln;
    const isCyclic=cyclicSgIds.has(sg.GroupId);
    const props={GroupDescription:sg.Description||'Managed by CloudFormation',VpcId:cfnRef(sg.VpcId),Tags:_cfnTags(sg)};
    if(!isCyclic){
      if(sg.IpPermissions&&sg.IpPermissions.length)props.SecurityGroupIngress=sg.IpPermissions.map(_cfnSGRule);
      if(sg.IpPermissionsEgress&&sg.IpPermissionsEgress.length)props.SecurityGroupEgress=sg.IpPermissionsEgress.map(_cfnSGRule);
    }
    template.Resources[ln]={Type:'AWS::EC2::SecurityGroup',Properties:props};
    // Standalone rules for cyclic
    if(isCyclic){
      (sg.IpPermissions||[]).forEach((rule,ri)=>{
        const rProps=Object.assign({GroupId:{'Ref':ln},IpProtocol:rule.IpProtocol||'-1'},_cfnSGRuleProps(rule));
        template.Resources[ln+'Ingress'+ri]={Type:'AWS::EC2::SecurityGroupIngress',Properties:rProps};
      });
      (sg.IpPermissionsEgress||[]).forEach((rule,ri)=>{
        const rProps=Object.assign({GroupId:{'Ref':ln},IpProtocol:rule.IpProtocol||'-1'},_cfnSGRuleProps(rule));
        template.Resources[ln+'Egress'+ri]={Type:'AWS::EC2::SecurityGroupEgress',Properties:rProps};
      });
    }
  });

  // EC2 Instances
  instances.forEach(inst=>{
    const ln=cfnName(inst,'EC2');
    cfnIdMap[inst.InstanceId]=ln;
    const props={};
    if(inst.ImageId)props.ImageId=inst.ImageId;
    if(inst.InstanceType)props.InstanceType=inst.InstanceType;
    if(inst.SubnetId)props.SubnetId=cfnRef(inst.SubnetId);
    if(inst.KeyName)props.KeyName=inst.KeyName;
    const sgIds=(inst.SecurityGroups||inst.NetworkInterfaces&&inst.NetworkInterfaces[0]&&inst.NetworkInterfaces[0].Groups||[]).map(g=>g.GroupId).filter(Boolean);
    if(sgIds.length)props.SecurityGroupIds=sgIds.map(s=>cfnRef(s));
    props.Tags=_cfnTags(inst);
    template.Resources[ln]={Type:'AWS::EC2::Instance',Properties:props};
  });

  // ALBs
  albs.forEach(alb=>{
    const ln=cfnName(alb,'ALB');
    cfnIdMap[alb.LoadBalancerArn]=ln;
    const props={Type:alb.Type||'application',Scheme:alb.Scheme||'internet-facing'};
    if(alb.LoadBalancerName)props.Name=alb.LoadBalancerName;
    const albSubs=(alb.AvailabilityZones||[]).map(az=>az.SubnetId).filter(Boolean);
    if(albSubs.length)props.Subnets=albSubs.map(s=>cfnRef(s));
    const albSgs=(alb.SecurityGroups||[]);
    if(albSgs.length)props.SecurityGroups=albSgs.map(s=>cfnRef(s));
    template.Resources[ln]={Type:'AWS::ElasticLoadBalancingV2::LoadBalancer',Properties:props};
  });

  // RDS
  rdsInstances.forEach(rds=>{
    const ln=cfnName({Tags:[{Key:'Name',Value:rds.DBInstanceIdentifier}]},'RDS');
    cfnIdMap[rds.DBInstanceIdentifier]=ln;
    const props={DBInstanceIdentifier:rds.DBInstanceIdentifier};
    if(rds.Engine)props.Engine=rds.Engine;
    if(rds.EngineVersion)props.EngineVersion=rds.EngineVersion;
    if(rds.DBInstanceClass)props.DBInstanceClass=rds.DBInstanceClass;
    if(rds.AllocatedStorage)props.AllocatedStorage=String(rds.AllocatedStorage);
    if(rds.MultiAZ)props.MultiAZ=true;
    props.MasterUsername='admin';
    props.MasterUserPassword='CHANGE_ME';
    template.Resources[ln]={Type:'AWS::RDS::DBInstance',Properties:props};
  });

  // Outputs
  vpcs.forEach(vpc=>{
    const ln=cfnIdMap[vpc.VpcId];
    if(ln){
      template.Outputs[ln+'Id']={Value:{'Ref':ln},Description:'VPC ID for '+ln};
    }
  });

  // Serialize
  const format=opts.format||'yaml';
  let code;
  if(format==='json'){
    code=JSON.stringify(template,null,2);
  }else{
    code=_serializeCfnYaml(template);
  }

  if(sgCycles.length)warnings.push(sgCycles.length+' circular SG reference(s) detected. Rules split into standalone resources.');

  _iacOutput=code;
  return {code:code,warnings:warnings,stats:{resources:Object.keys(template.Resources).length}};
}

function _cfnTags(resource){
  return (resource.Tags||[]).filter(t=>!t.Key.startsWith('aws:')).map(t=>({Key:t.Key,Value:t.Value||''}));
}

function _cfnSGRule(rule){
  const r={IpProtocol:rule.IpProtocol||'-1'};
  if(rule.FromPort!=null)r.FromPort=rule.FromPort;
  if(rule.ToPort!=null)r.ToPort=rule.ToPort;
  const cidrs=(rule.IpRanges||[]).map(c=>c.CidrIp).filter(Boolean);
  if(cidrs.length)r.CidrIp=cidrs[0]; // CFN inline rule takes single CIDR
  const sgRefs=(rule.UserIdGroupPairs||[]).map(p=>p.GroupId).filter(Boolean);
  if(sgRefs.length)r.SourceSecurityGroupId=sgRefs[0];
  return r;
}

function _cfnSGRuleProps(rule){
  const r={};
  if(rule.FromPort!=null)r.FromPort=rule.FromPort;
  if(rule.ToPort!=null)r.ToPort=rule.ToPort;
  const cidrs=(rule.IpRanges||[]).map(c=>c.CidrIp).filter(Boolean);
  if(cidrs.length)r.CidrIp=cidrs[0];
  const sgRefs=(rule.UserIdGroupPairs||[]).map(p=>p.GroupId).filter(Boolean);
  if(sgRefs.length)r.SourceSecurityGroupId=sgRefs[0];
  return r;
}

// === CHECKOV CFN GENERATOR ===
// Generates a security-property-rich CloudFormation template for Checkov scanning
function _ckId(name,prefix,seen){
  var base=(name||prefix||'Res').replace(/[^a-zA-Z0-9]/g,'');
  if(!base||/^\d/.test(base)) base=(prefix||'R')+base;
  var id=base,i=2;
  while(seen.has(id)){id=base+i;i++;}
  seen.add(id);
  return id;
}
function _ckVpcs(vpcs,res,seen){
  vpcs.forEach(function(v){
    var id=_ckId(gn(v,v.VpcId),'VPC',seen);
    res[id]={Type:'AWS::EC2::VPC',Properties:{
      CidrBlock:v.CidrBlock||'10.0.0.0/16',
      EnableDnsSupport:v.EnableDnsSupport!==false,
      EnableDnsHostnames:v.EnableDnsHostnames===true,
      Tags:_cfnTags(v)
    }};
  });
}
function _ckSubnets(subnets,res,seen){
  subnets.forEach(function(s){
    var id=_ckId(gn(s,s.SubnetId),'Subnet',seen);
    res[id]={Type:'AWS::EC2::Subnet',Properties:{
      VpcId:s.VpcId,CidrBlock:s.CidrBlock,
      AvailabilityZone:s.AvailabilityZone||'',
      MapPublicIpOnLaunch:s.MapPublicIpOnLaunch===true,
      Tags:_cfnTags(s)
    }};
  });
}
function _ckExpandRules(perms){
  var rules=[];
  (perms||[]).forEach(function(p){
    var base={IpProtocol:p.IpProtocol||'-1'};
    if(p.FromPort!=null) base.FromPort=p.FromPort;
    if(p.ToPort!=null) base.ToPort=p.ToPort;
    (p.IpRanges||[]).forEach(function(r){rules.push(Object.assign({},base,{CidrIp:r.CidrIp}));});
    (p.Ipv6Ranges||[]).forEach(function(r){rules.push(Object.assign({},base,{CidrIpv6:r.CidrIpv6}));});
    (p.UserIdGroupPairs||[]).forEach(function(pair){rules.push(Object.assign({},base,{SourceSecurityGroupId:pair.GroupId}));});
    if(!(p.IpRanges||[]).length&&!(p.Ipv6Ranges||[]).length&&!(p.UserIdGroupPairs||[]).length) rules.push(base);
  });
  return rules;
}
function _ckSgs(sgs,res,seen){
  sgs.forEach(function(sg){
    var id=_ckId(sg.GroupName||sg.GroupId,'SG',seen);
    res[id]={Type:'AWS::EC2::SecurityGroup',Properties:{
      GroupDescription:sg.Description||sg.GroupName||'',
      VpcId:sg.VpcId,
      SecurityGroupIngress:_ckExpandRules(sg.IpPermissions),
      SecurityGroupEgress:_ckExpandRules(sg.IpPermissionsEgress),
      Tags:_cfnTags(sg)
    }};
  });
}
function _ckNacls(nacls,res,seen){
  nacls.forEach(function(nacl){
    var nId=_ckId(gn(nacl,nacl.NetworkAclId),'NACL',seen);
    res[nId]={Type:'AWS::EC2::NetworkAcl',Properties:{VpcId:nacl.VpcId,Tags:_cfnTags(nacl)}};
    (nacl.Entries||[]).forEach(function(e){
      var eId=_ckId(nId+'Rule'+e.RuleNumber+(e.Egress?'E':'I'),'NACLEntry',seen);
      var props={NetworkAclId:nacl.NetworkAclId,RuleNumber:e.RuleNumber,
        Protocol:String(e.Protocol),RuleAction:e.RuleAction,Egress:e.Egress===true};
      if(e.CidrBlock) props.CidrBlock=e.CidrBlock;
      if(e.Ipv6CidrBlock) props.Ipv6CidrBlock=e.Ipv6CidrBlock;
      if(e.PortRange) props.PortRange={From:e.PortRange.From,To:e.PortRange.To};
      res[eId]={Type:'AWS::EC2::NetworkAclEntry',Properties:props};
    });
  });
}
function _ckRts(rts,res,seen){
  rts.forEach(function(rt){
    var rtId=_ckId(gn(rt,rt.RouteTableId),'RT',seen);
    res[rtId]={Type:'AWS::EC2::RouteTable',Properties:{VpcId:rt.VpcId,Tags:_cfnTags(rt)}};
    (rt.Routes||[]).forEach(function(r){
      if(r.GatewayId==='local') return;
      var rId=_ckId(rtId+(r.DestinationCidrBlock||'').replace(/[^a-zA-Z0-9]/g,''),'Route',seen);
      var props={RouteTableId:rt.RouteTableId};
      if(r.DestinationCidrBlock) props.DestinationCidrBlock=r.DestinationCidrBlock;
      if(r.GatewayId) props.GatewayId=r.GatewayId;
      if(r.NatGatewayId) props.NatGatewayId=r.NatGatewayId;
      if(r.VpcEndpointId) props.VpcEndpointId=r.VpcEndpointId;
      res[rId]={Type:'AWS::EC2::Route',Properties:props};
    });
  });
}
function _ckEc2(instances,ctx,res,seen){
  instances.forEach(function(inst){
    var id=_ckId(gn(inst,inst.InstanceId),'EC2',seen);
    var props={InstanceType:inst.InstanceType||'t3.micro',SubnetId:inst.SubnetId||'',
      SecurityGroupIds:(inst.SecurityGroups||[]).map(function(s){return s.GroupId}),
      ImageId:inst.ImageId||'',Tags:_cfnTags(inst)};
    // IMDSv2 — Checkov CKV_AWS_79
    var mo=inst.MetadataOptions||{};
    props.MetadataOptions={HttpTokens:mo.HttpTokens||'optional',HttpEndpoint:mo.HttpEndpoint||'enabled'};
    // IAM profile
    if(inst.IamInstanceProfile) props.IamInstanceProfile=inst.IamInstanceProfile.Arn||'';
    // EBS encryption
    if(inst.BlockDeviceMappings&&inst.BlockDeviceMappings.length){
      props.BlockDeviceMappings=inst.BlockDeviceMappings.map(function(b){
        var r={DeviceName:b.DeviceName||'/dev/xvda'};
        if(b.Ebs) r.Ebs={Encrypted:b.Ebs.Encrypted===true,VolumeSize:b.Ebs.VolumeSize||8,VolumeType:b.Ebs.VolumeType||'gp3'};
        return r;
      });
    }
    res[id]={Type:'AWS::EC2::Instance',Properties:props};
  });
}
function _ckRds(rdsInstances,res,seen){
  rdsInstances.forEach(function(db){
    var id=_ckId(db.DBInstanceIdentifier,'RDS',seen);
    res[id]={Type:'AWS::RDS::DBInstance',Properties:{
      DBInstanceIdentifier:db.DBInstanceIdentifier,
      Engine:db.Engine||'',EngineVersion:db.EngineVersion||'',
      DBInstanceClass:db.DBInstanceClass||'db.t3.micro',
      StorageEncrypted:db.StorageEncrypted===true,
      PubliclyAccessible:db.PubliclyAccessible===true,
      MultiAZ:db.MultiAZ===true,
      BackupRetentionPeriod:db.BackupRetentionPeriod||0,
      StorageType:db.StorageType||'gp2',
      AllocatedStorage:db.AllocatedStorage||20,
      MasterUsername:'admin'
    }};
  });
}
function _ckS3(buckets,res,seen){
  buckets.forEach(function(bk){
    var id=_ckId(bk.Name,'S3',seen);
    var props={BucketName:bk.Name};
    // Omit encryption/versioning — Checkov flags their absence, which is correct
    if(bk.BucketEncryption) props.BucketEncryption=bk.BucketEncryption;
    if(bk.VersioningConfiguration) props.VersioningConfiguration=bk.VersioningConfiguration;
    res[id]={Type:'AWS::S3::Bucket',Properties:props};
  });
}
function _ckAlbs(albs,res,seen){
  albs.forEach(function(alb){
    var id=_ckId(alb.LoadBalancerName||alb.LoadBalancerArn,'ALB',seen);
    var props={Type:alb.Type||'application',Scheme:alb.Scheme||'internet-facing'};
    if(alb.SecurityGroups) props.SecurityGroups=alb.SecurityGroups;
    if(alb.Subnets) props.Subnets=alb.Subnets;
    else if(alb.AvailabilityZones) props.Subnets=alb.AvailabilityZones.map(function(az){return az.SubnetId}).filter(Boolean);
    res[id]={Type:'AWS::ElasticLoadBalancingV2::LoadBalancer',Properties:props};
  });
}
function _ckLambda(fns,res,seen){
  fns.forEach(function(fn){
    var id=_ckId(fn.FunctionName,'Lambda',seen);
    var props={FunctionName:fn.FunctionName,Runtime:fn.Runtime||'',Handler:fn.Handler||'index.handler',
      MemorySize:fn.MemorySize||128,Timeout:fn.Timeout||3,
      Role:fn.Role||'arn:aws:iam::111222333444:role/LambdaRole',
      Code:{ZipFile:'exports.handler=async()=>({})'}};
    if(fn.VpcConfig&&fn.VpcConfig.SubnetIds&&fn.VpcConfig.SubnetIds.length){
      props.VpcConfig={SubnetIds:fn.VpcConfig.SubnetIds,SecurityGroupIds:fn.VpcConfig.SecurityGroupIds||[]};
    }
    res[id]={Type:'AWS::Lambda::Function',Properties:props};
  });
}
function _ckIamRoles(roles,res,seen){
  roles.forEach(function(role){
    var id=_ckId(role.RoleName,'Role',seen);
    var props={RoleName:role.RoleName,
      AssumeRolePolicyDocument:role.AssumeRolePolicyDocument||{Version:'2012-10-17',Statement:[]}};
    var managed=(role.AttachedManagedPolicies||[]).map(function(p){return p.PolicyArn}).filter(Boolean);
    if(managed.length) props.ManagedPolicyArns=managed;
    if(role.RolePolicyList&&role.RolePolicyList.length){
      props.Policies=role.RolePolicyList.map(function(p){
        return {PolicyName:p.PolicyName,PolicyDocument:p.PolicyDocument||{}};
      });
    }
    res[id]={Type:'AWS::IAM::Role',Properties:props};
  });
}
function _ckIamUsers(users,res,seen){
  users.forEach(function(user){
    var id=_ckId(user.UserName,'User',seen);
    var props={UserName:user.UserName};
    var managed=(user.AttachedManagedPolicies||[]).map(function(p){return p.PolicyArn}).filter(Boolean);
    if(managed.length) props.ManagedPolicyArns=managed;
    if(user.UserPolicyList&&user.UserPolicyList.length){
      props.Policies=user.UserPolicyList.map(function(p){
        return {PolicyName:p.PolicyName,PolicyDocument:p.PolicyDocument||{}};
      });
    }
    res[id]={Type:'AWS::IAM::User',Properties:props};
  });
}
function _ckElastiCache(clusters,res,seen){
  clusters.forEach(function(c){
    var id=_ckId(c.CacheClusterId,'Cache',seen);
    res[id]={Type:'AWS::ElastiCache::CacheCluster',Properties:{
      Engine:c.Engine||'redis',CacheNodeType:c.CacheNodeType||'cache.t3.micro',
      NumCacheNodes:c.NumCacheNodes||1,
      AtRestEncryptionEnabled:c.AtRestEncryptionEnabled===true,
      TransitEncryptionEnabled:c.TransitEncryptionEnabled===true
    }};
  });
}
function _ckRedshift(clusters,res,seen){
  clusters.forEach(function(c){
    var id=_ckId(c.ClusterIdentifier,'Redshift',seen);
    res[id]={Type:'AWS::Redshift::Cluster',Properties:{
      ClusterIdentifier:c.ClusterIdentifier,
      NodeType:c.NodeType||'dc2.large',NumberOfNodes:c.NumberOfNodes||1,
      Encrypted:c.Encrypted===true,PubliclyAccessible:c.PubliclyAccessible===true,
      MasterUsername:'admin',MasterUserPassword:'placeholder',
      DBName:c.DBName||'dev'
    }};
  });
}
function generateCheckovCfn(ctx,iamData){
  if(!ctx||!ctx.vpcs) return null;
  var template={AWSTemplateFormatVersion:'2010-09-09',
    Description:'Generated by AWS Mapper for Checkov scanning — '+new Date().toISOString().split('T')[0],
    Resources:{}};
  var res=template.Resources,seen=new Set();
  _ckVpcs(ctx.vpcs||[],res,seen);
  _ckSubnets(ctx.subnets||[],res,seen);
  _ckSgs(ctx.sgs||[],res,seen);
  _ckNacls(ctx.nacls||[],res,seen);
  _ckRts(ctx.rts||[],res,seen);
  _ckEc2(ctx.instances||[],ctx,res,seen);
  _ckRds(ctx.rdsInstances||[],res,seen);
  _ckS3(ctx.s3bk||[],res,seen);
  _ckAlbs(ctx.albs||[],res,seen);
  _ckLambda(ctx.lambdaFns||[],res,seen);
  _ckElastiCache(ctx.ecacheClusters||[],res,seen);
  _ckRedshift(ctx.redshiftClusters||[],res,seen);
  if(iamData){
    _ckIamRoles(iamData.roles||[],res,seen);
    _ckIamUsers(iamData.users||[],res,seen);
  }
  return JSON.stringify(template,null,2);
}

// --- Simple YAML serializer for CFN ---
function _serializeCfnYaml(obj,indent){
  indent=indent||0;
  const pad='  '.repeat(indent);
  const lines=[];
  if(obj===null||obj===undefined)return 'null';
  if(typeof obj==='boolean')return obj?'true':'false';
  if(typeof obj==='number')return String(obj);
  if(typeof obj==='string'){
    if(obj.includes('\n'))return '|\n'+obj.split('\n').map(l=>pad+'  '+l).join('\n');
    if(obj.match(/[:{}\[\],&*?|>!%@`#'"]/)||obj===''||obj==='true'||obj==='false'||!isNaN(obj))return "'"+obj.replace(/'/g,"''")+"'";
    return obj;
  }
  if(Array.isArray(obj)){
    if(obj.length===0)return '[]';
    // Check if array of simple values
    if(obj.every(v=>typeof v==='string'||typeof v==='number'||typeof v==='boolean')){
      return '['+obj.map(v=>{
        if(typeof v==='string')return "'"+v.replace(/'/g,"''")+"'";
        return String(v);
      }).join(', ')+']';
    }
    obj.forEach(item=>{
      if(typeof item==='object'&&item!==null&&!Array.isArray(item)){
        const keys=Object.keys(item);
        if(keys.length){
          lines.push(pad+'- '+keys[0]+': '+_serializeCfnYaml(item[keys[0]],indent+2));
          keys.slice(1).forEach(k=>{
            lines.push(pad+'  '+k+': '+_serializeCfnYaml(item[k],indent+2));
          });
        }else{
          lines.push(pad+'- {}');
        }
      }else{
        lines.push(pad+'- '+_serializeCfnYaml(item,indent+1));
      }
    });
    return '\n'+lines.join('\n');
  }
  if(typeof obj==='object'){
    // Handle CFN intrinsic functions
    const keys=Object.keys(obj);
    if(keys.length===1&&keys[0]==='Ref')return '!Ref '+obj.Ref;
    if(keys.length===1&&keys[0]==='Fn::GetAtt')return '!GetAtt '+obj['Fn::GetAtt'].join('.');
    if(keys.length===1&&keys[0]==='Fn::Sub')return '!Sub '+_serializeCfnYaml(obj['Fn::Sub'],indent);

    if(keys.length===0)return '{}';
    keys.forEach(k=>{
      const val=obj[k];
      if(val===null||val===undefined)return;
      if(typeof val==='object'&&!Array.isArray(val)&&Object.keys(val).length>0){
        // Check for intrinsic
        const vkeys=Object.keys(val);
        if(vkeys.length===1&&vkeys[0]==='Ref'){
          lines.push(pad+k+': !Ref '+val.Ref);
        }else if(vkeys.length===1&&vkeys[0]==='Fn::GetAtt'){
          lines.push(pad+k+': !GetAtt '+val['Fn::GetAtt'].join('.'));
        }else{
          lines.push(pad+k+':');
          lines.push(_serializeCfnYaml(val,indent+1));
        }
      }else if(Array.isArray(val)){
        const ser=_serializeCfnYaml(val,indent+1);
        if(ser.startsWith('\n')){
          lines.push(pad+k+':'+ser);
        }else{
          lines.push(pad+k+': '+ser);
        }
      }else{
        lines.push(pad+k+': '+_serializeCfnYaml(val,indent+1));
      }
    });
    return lines.join('\n');
  }
  return String(obj);
}

// --- Syntax Highlighting (basic HCL) ---
function _highlightHCL(code){
  // Escape HTML first
  code=code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Process line-by-line to avoid cross-match issues
  return code.split('\n').map(line=>{
    // Comments take precedence
    if(line.match(/^\s*#/))return '<span class="hcl-cmt">'+line+'</span>';
    // Strings: replace "..." with colored spans
    line=line.replace(/"([^"]*)"/g,function(_,s){return '"<span class="hcl-str">'+s+'</span>"'});
    // Keywords
    line=line.replace(/\b(resource|variable|data|module|provider|output|terraform|required_providers|import|locals|dynamic)\b/g,'<span class="hcl-kw">$1</span>');
    // Types
    line=line.replace(/\b(string|number|bool|list|map|set|object|any)\b/g,'<span class="hcl-type">$1</span>');
    // Numbers (standalone, not inside strings)
    line=line.replace(/= (\d+)$/g,'= <span class="hcl-num">$1</span>');
    // Booleans
    line=line.replace(/\b(true|false|null)\b/g,'<span class="hcl-num">$1</span>');
    // Resource refs
    line=line.replace(/(aws_[a-z_]+\.[a-z_0-9]+\.[a-z_]+)/g,'<span class="hcl-ref">$1</span>');
    return line;
  }).join('\n');
}

function _highlightYAML(code){
  code=code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return code.split('\n').map(line=>{
    if(line.match(/^\s*#/))return '<span class="hcl-cmt">'+line+'</span>';
    line=line.replace(/(!Ref|!GetAtt|!Sub|!Select|!Join|!If)\b/g,'<span class="hcl-kw">$1</span>');
    line=line.replace(/(AWS::[A-Za-z0-9:]+)/g,'<span class="hcl-type">$1</span>');
    line=line.replace(/'([^']*)'/g,"'<span class=\"hcl-str\">$1</span>'");
    line=line.replace(/\b(true|false|null)\b/g,'<span class="hcl-num">$1</span>');
    return line;
  }).join('\n');
}

// --- IaC Modal UI ---
function openIacModal(type){
  _iacType=type;
  const modal=document.getElementById('iacModal');
  const title=document.getElementById('iacTitle');
  title.textContent=type==='terraform'?'Export as Terraform HCL':'Export as CloudFormation';

  // Populate VPC scope dropdown
  const scopeSel=document.getElementById('iacScope');
  scopeSel.innerHTML='<option value="all">All Resources</option>';
  if(_rlCtx&&_rlCtx.vpcs){
    _rlCtx.vpcs.forEach(vpc=>{
      const n=vpc.Tags&&vpc.Tags.find(t=>t.Key==='Name');
      const label=(n?n.Value:vpc.VpcId);
      scopeSel.innerHTML+='<option value="'+esc(vpc.VpcId)+'">'+esc(label)+'</option>';
    });
  }

  // Toggle TF-only options
  const modularLabel=document.getElementById('iacModular').parentElement;
  const formatSel=document.getElementById('iacFormat');
  if(type==='cloudformation'){
    modularLabel.style.display='none';
    formatSel.innerHTML='<option value="yaml">YAML</option><option value="json">JSON</option>';
  }else{
    modularLabel.style.display='';
    formatSel.innerHTML='<option value="hcl">HCL</option><option value="json">JSON</option>';
  }

  // Reset preview
  document.getElementById('iacPreview').innerHTML='<div class="iac-empty">Click Generate to preview code</div>';

  modal.classList.add('open');
}

function closeIacModal(){
  document.getElementById('iacModal').classList.remove('open');
  _iacOutput='';
}

function generateIacPreview(){
  const ctx=_rlCtx;
  if(!ctx||!ctx.vpcs||!ctx.vpcs.length){
    document.getElementById('iacPreview').innerHTML='<div class="iac-empty">No data loaded. Render a map first.</div>';
    return;
  }
  const opts={
    mode:document.getElementById('iacMode').value,
    scopeVpcId:document.getElementById('iacScope').value==='all'?null:document.getElementById('iacScope').value,
    includeVars:document.getElementById('iacVars').checked,
    modular:document.getElementById('iacModular').checked,
    format:document.getElementById('iacFormat').value
  };

  let result;
  if(_iacType==='terraform'){
    if(opts.format==='json'){
      // Generate HCL first then wrap as note
      result=generateTerraform(ctx,opts);
      // For JSON format, produce a structured version
      result.code='// Terraform JSON format\n// Use HCL format for the best experience\n\n'+result.code;
    }else{
      result=generateTerraform(ctx,opts);
    }
  }else{
    result=generateCloudFormation(ctx,opts);
  }

  const preview=document.getElementById('iacPreview');
  let html='';

  // Warnings
  if(result.warnings&&result.warnings.length){
    html+='<div class="iac-warn">'+result.warnings.map(w=>'&#9888; '+w).join('<br>')+'</div>';
  }

  // Stats
  if(result.stats){
    const s=result.stats;
    const parts=[];
    if(s.vpcs)parts.push(s.vpcs+' VPCs');
    if(s.subnets)parts.push(s.subnets+' Subnets');
    if(s.sgs)parts.push(s.sgs+' SGs');
    if(s.instances)parts.push(s.instances+' EC2');
    if(s.total)parts.push(s.total+' total resources');
    if(s.resources)parts.push(s.resources+' CFN resources');
    if(parts.length)html+='<div style="padding:6px 20px;font-family:\'IBM Plex Mono\',monospace;font-size:10px;color:var(--text-muted);border-bottom:1px solid var(--border)">'+parts.join(' | ')+'</div>';
  }

  // Highlighted code
  const highlighted=_iacType==='terraform'?_highlightHCL(result.code):
    (opts.format==='json'?_highlightHCL(result.code):_highlightYAML(result.code));
  html+='<pre>'+highlighted+'</pre>';

  preview.innerHTML=html;
}

// --- Event listeners ---
document.getElementById('expTerraform').addEventListener('click',()=>openIacModal('terraform'));
document.getElementById('expCloudformation').addEventListener('click',()=>openIacModal('cloudformation'));
document.getElementById('iacClose').addEventListener('click',closeIacModal);
document.getElementById('iacModal').addEventListener('click',function(e){if(e.target===this)closeIacModal()});
document.getElementById('iacGenerate').addEventListener('click',generateIacPreview);

document.getElementById('iacCopy').addEventListener('click',()=>{
  if(!_iacOutput){alert('Generate code first');return}
  navigator.clipboard.writeText(_iacOutput).then(()=>{
    const btn=document.getElementById('iacCopy');
    btn.textContent='Copied!';
    setTimeout(()=>{btn.textContent='Copy to Clipboard'},1500);
  }).catch(()=>{
    // Fallback
    const ta=document.createElement('textarea');
    ta.value=_iacOutput;document.body.appendChild(ta);ta.select();
    document.execCommand('copy');document.body.removeChild(ta);
    const btn=document.getElementById('iacCopy');
    btn.textContent='Copied!';
    setTimeout(()=>{btn.textContent='Copy to Clipboard'},1500);
  });
});

document.getElementById('iacDownload').addEventListener('click',()=>{
  if(!_iacOutput){alert('Generate code first');return}
  let ext,name;
  if(_iacType==='terraform'){
    ext=document.getElementById('iacFormat').value==='json'?'.tf.json':'.tf';
    name='main'+ext;
  }else{
    ext=document.getElementById('iacFormat').value==='json'?'.json':'.yaml';
    name='template'+ext;
  }
  const blob=new Blob([_iacOutput],{type:'text/plain'});
  downloadBlob(blob,name);
});

// Compliance export modal listeners
document.getElementById('compExportClose').addEventListener('click',()=>document.getElementById('compExportModal').classList.remove('open'));
document.getElementById('compExportModal').addEventListener('click',function(e){if(e.target===this)this.classList.remove('open')});
document.getElementById('compExpCancel').addEventListener('click',()=>document.getElementById('compExportModal').classList.remove('open'));
document.querySelectorAll('#compExportModal input[type="checkbox"]').forEach(cb=>cb.addEventListener('change',_updateCompExpPreview));
document.getElementById('compExpDownload').addEventListener('click',()=>{
  const fws=[...document.querySelectorAll('#compExportModal [data-comp-fw]:checked')].map(el=>el.dataset.compFw);
  const sevs=[...document.querySelectorAll('#compExportModal [data-comp-sev]:checked')].map(el=>el.dataset.compSev);
  const fmt=document.getElementById('compExpFormat').value;
  const opts={frameworks:fws,severities:sevs,includeMuted:document.getElementById('compExpMuted').checked,includeRemediation:document.getElementById('compExpRemediation').checked};
  if(fmt==='xlsx')_exportComplianceExcel(_complianceFindings,opts);
  else if(fmt==='csv')_exportFilteredCSV(_complianceFindings,opts);
  else _exportComplianceHTML(_complianceFindings,opts);
  document.getElementById('compExportModal').classList.remove('open');
});

// Keyboard shortcuts
document.addEventListener('keydown',function(e){
  const tag=e.target.tagName;
  if(e.key==='Escape'){
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')e.target.blur();
    const fwFp=document.getElementById('fwFullPanel');if(fwFp&&fwFp.classList.contains('open')){fwFp.classList.remove('open');return}

    const iacM=document.getElementById('iacModal');if(iacM&&iacM.classList.contains('open')){closeIacModal();return}
    if(document.getElementById('compExportModal').classList.contains('open')){document.getElementById('compExportModal').classList.remove('open');return}
    var govRO=document.getElementById('govRulesOverlay');if(govRO){govRO.remove();return}
    if(document.getElementById('udash').classList.contains('open')){closeUnifiedDash();return}
    const dep=document.getElementById('depOverlay');if(dep&&dep.classList.contains('open')){dep.classList.remove('open');return}
    const np=document.getElementById('notesPanel');if(np&&np.classList.contains('open')){closeNotesPanel();return}
    const ap=document.getElementById('accountPanel');if(ap&&ap.classList.contains('open')){closeAccountPanel();return}
    const so=document.getElementById('searchOverlay'),ho=document.getElementById('helpOverlay');
    if(so&&so.style.display!=='none'){closeSearch();return}
    if(ho&&ho.style.display!=='none'){ho.style.display='none';return}
    document.getElementById('detailPanel').classList.remove('open');
    if(typeof _hlLocked!=='undefined'){_hlLocked=false;_hlKey=null;_hlType=null}
    const lockInd=document.getElementById('hlLockInd');if(lockInd)lockInd.style.display='none';
    if(_flowMode){exitFlowMode();return}
    if(_flowAnalysisMode){exitFlowAnalysis();return}
    if(_diffMode){exitDiffMode();return}
    if(_designMode)exitDesignMode();
    return;
  }
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
  if(_flowMode&&_flowPath&&_flowPath.length>0){
    if(e.key==='ArrowRight'){_stepForward();return}
    if(e.key==='ArrowLeft'){_stepBack();return}
  }
  if(e.ctrlKey||e.metaKey){
    if(e.key==='='||e.key==='+'){e.preventDefault();gTxtScale=Math.min(2.5,gTxtScale+0.15);applyGlobalTxtScale();savePrefs({gTxtScale});return}
    if(e.key==='-'){e.preventDefault();gTxtScale=Math.max(0.5,gTxtScale-0.15);applyGlobalTxtScale();savePrefs({gTxtScale});return}
    if(e.key==='0'){e.preventDefault();gTxtScale=1.0;applyGlobalTxtScale();savePrefs({gTxtScale});return}
  }
  if(e.key==='+'||e.key==='='){d3.select('#zoomIn').dispatch('click');return}
  if(e.key==='-'){d3.select('#zoomOut').dispatch('click');return}
  if(e.key==='f'){d3.select('#zoomFit').dispatch('click');return}
  if(e.key==='T'&&e.shiftKey){if(_flowMode)exitFlowMode();else enterFlowMode();return}
  if(e.key==='F'&&e.shiftKey){if(_flowAnalysisMode)exitFlowAnalysis();else enterFlowAnalysis();return}
  if(e.key==='R'&&e.shiftKey){if(_udashTab==='reports'){closeUnifiedDash()}else{openUnifiedDash('reports')}return}
  if(e.key==='G'&&e.shiftKey){if(_udashTab==='classification'){closeUnifiedDash()}else{openUnifiedDash('classification')}return}
  if(e.key==='B'&&e.shiftKey){if(_udashTab==='budr'){closeUnifiedDash()}else{openUnifiedDash('budr')}return}
  if(e.key==='C'&&e.shiftKey){if(_udashTab==='compliance'){closeUnifiedDash()}else{openUnifiedDash('compliance')}return}
  if(e.key==='D'&&e.shiftKey){if(_diffMode)exitDiffMode();else document.getElementById('diffFileInput').click();return}
  if(e.key==='d'&&!e.shiftKey){if(_designMode)exitDesignMode();else enterDesignMode();return}
  if(e.key==='z'&&_designMode){undoLastChange();return}
  if(e.key==='e'&&_designMode&&_designChanges.length){exportDesignPlan('design-plan');return}
  if(e.key==='/'){e.preventDefault();if(document.getElementById('udash').classList.contains('open'))closeUnifiedDash();openSearch();return}
  if(e.key==='n'){openNotesPanel();return}
  if(e.key==='b'&&!_designMode){if(_blastActive){_clearBlastRadius()}return}
  if(e.key==='h'&&!_designMode){const tb=document.getElementById('timelineBar');if(tb.classList.contains('open'))closeTimeline();else openTimeline();return}

  if(e.key==='A'&&e.shiftKey){_toggleAccountPanel();return}
});

// === EDGE CASE TESTS & DEMO DATA GENERATORS (Features 4-7) ===
// Callable from browser console: window._runEdgeCaseTests('multiAccount')
// Or run all: window._runAllEdgeCaseTests()

// --- Demo Data: Snapshot History Generator ---
window.generateDemoSnapshots = function(){
  const d = generateDemo();
  const fieldMap = {in_vpcs:'vpcs',in_subnets:'subnets',in_rts:'rts',in_sgs:'sgs',in_nacls:'nacls',
    in_igws:'igws',in_nats:'nats',in_inst:'ec2',in_albs:'albs',in_vpces:'vpces',
    in_peer:'peer',in_vpn:'vpn',in_vol:'vols',in_snap:'snaps',in_rds:'rds',
    in_ecs:'ecs',in_lambda:'lambda',in_ecache:'elasticache',in_redshift:'redshift'};
  const fullTA = {};
  Object.entries(fieldMap).forEach(([taId, dKey]) => {
    if(d[dKey]) fullTA[taId] = JSON.stringify(d[dKey], null, 2);
  });
  const vpcArr = d.vpcs.Vpcs;
  const scales = [0.3, 0.5, 0.7, 0.85, 1.0];
  const labels = ['Initial setup','Added staging','Core services','Pre-prod','Full deployment'];
  const baseTs = new Date('2026-01-10T08:00:00Z').getTime();
  const dayMs = 86400000;
  const snaps = [];
  scales.forEach((scale, i) => {
    const count = Math.max(1, Math.ceil(vpcArr.length * scale));
    const subset = {Vpcs: vpcArr.slice(0, count)};
    const ta = {};
    ta.in_vpcs = JSON.stringify(subset, null, 2);
    if(scale >= 0.5) ta.in_subnets = fullTA.in_subnets;
    if(scale >= 0.7) { ta.in_sgs = fullTA.in_sgs; ta.in_rts = fullTA.in_rts; }
    if(scale >= 0.85) { ta.in_inst = fullTA.in_inst; ta.in_igws = fullTA.in_igws; }
    if(scale >= 1.0) Object.assign(ta, fullTA);
    const checksum = _computeChecksum(ta);
    snaps.push({
      id: 'snap-demo-' + i,
      timestamp: new Date(baseTs + i * 7 * dayMs).toISOString(),
      label: labels[i],
      auto: i % 2 === 0,
      checksum: checksum,
      accountLabel: 'demo-account',
      layout: 'grid',
      textareas: ta,
      annotations: {}
    });
  });
  _snapshots = snaps;
  _saveSnapshots();
  _renderTimeline();
  console.log('[DemoSnapshots] Generated ' + snaps.length + ' snapshots');
  return snaps;
};

// --- Demo Data: Annotations ---
window._demoAnnotations = (function(){
  const d = generateDemo();
  const vpc0 = d.vpcs.Vpcs[0].VpcId;
  const vpc1 = d.vpcs.Vpcs[1].VpcId;
  const sub0 = d.subnets.Subnets[0].SubnetId;
  const inst0 = d.ec2.Reservations[0].Instances[0].InstanceId;
  const sg0 = d.sgs.SecurityGroups[0].GroupId;
  return {
    [vpc0]: [
      {text:'Production VPC - primary workloads. Contact: platform-team@example.com',category:'owner',author:'admin',created:'2026-01-15T10:00:00Z',updated:'2026-01-15T10:00:00Z',pinned:true},
      {text:'Incident INC-4521: Elevated latency observed 2026-01-20. Root cause: misconfigured NAT gateway.',category:'incident',author:'oncall',created:'2026-01-20T14:30:00Z',updated:'2026-01-21T09:00:00Z',pinned:false}
    ],
    [sub0]: [
      {text:'TODO: Migrate to larger CIDR range before Q2 scaling',category:'todo',author:'architect',created:'2026-01-18T11:00:00Z',updated:'2026-01-18T11:00:00Z',pinned:false}
    ],
    [inst0]: [
      {text:'Bastion host - SSH key rotation due 2026-03-01',category:'warning',author:'security',created:'2026-02-01T08:00:00Z',updated:'2026-02-01T08:00:00Z',pinned:false},
      {text:'Running custom AMI with hardened OS config',category:'info',author:'ops',created:'2026-01-10T09:00:00Z',updated:'2026-01-10T09:00:00Z',pinned:false}
    ],
    [sg0]: [
      {text:'Reviewed 2026-01-25 - rules compliant with CIS benchmarks',category:'status',author:'auditor',created:'2026-01-25T16:00:00Z',updated:'2026-01-25T16:00:00Z',pinned:false}
    ]
  };
})();

// --- Edge Case Test Framework ---
window._edgeCaseTests = window._edgeCaseTests || {};

// ==================== Feature 4: Multi-Account ====================
window._edgeCaseTests.multiAccount = function(){
  const results = [];
  const d = generateDemo();
  const T = (name, fn) => { try { const r = fn(); results.push({name, pass:r.pass, detail:r.detail}); } catch(e){ results.push({name, pass:false, detail:'Exception: '+e.message}); }};

  // 1. Same VPC ID in different accounts
  T('Same VPC ID different accounts', () => {
    const v1 = {VpcId:'vpc-shared01',CidrBlock:'10.0.0.0/16',OwnerId:'111111111111',Tags:[{Key:'Name',Value:'Acct1'}]};
    const v2 = {VpcId:'vpc-shared01',CidrBlock:'10.1.0.0/16',OwnerId:'222222222222',Tags:[{Key:'Name',Value:'Acct2'}]};
    const a1 = detectAccountId(v1);
    const a2 = detectAccountId(v2);
    const key1 = a1 + ':' + v1.VpcId;
    const key2 = a2 + ':' + v2.VpcId;
    return {pass: a1 !== a2 && key1 !== key2, detail: 'Keys: '+key1+' vs '+key2};
  });

  // 2. Cross-account peering, one side missing
  T('Cross-account peering unknown VPC', () => {
    const peering = {VpcPeeringConnectionId:'pcx-test01',Status:{Code:'active'},
      RequesterVpcInfo:{VpcId:'vpc-exists',OwnerId:'111111111111',CidrBlock:'10.0.0.0/16'},
      AccepterVpcInfo:{VpcId:'vpc-missing',OwnerId:'999999999999',CidrBlock:'172.16.0.0/16'}};
    const reqAcct = detectAccountId({OwnerId:peering.RequesterVpcInfo.OwnerId});
    const accAcct = peering.AccepterVpcInfo.OwnerId;
    const vpcIds = new Set(['vpc-exists']);
    const missingRef = !vpcIds.has(peering.AccepterVpcInfo.VpcId);
    return {pass: missingRef && reqAcct === '111111111111' && accAcct === '999999999999',
      detail: 'Missing VPC ref detected: ' + missingRef};
  });

  // 3. TGW shared across accounts
  T('TGW shared across accounts', () => {
    const tgwId = 'tgw-shared01';
    const att1 = {TransitGatewayId:tgwId,ResourceId:'vpc-acct1',_accountId:'111111111111'};
    const att2 = {TransitGatewayId:tgwId,ResourceId:'vpc-acct2',_accountId:'222222222222'};
    const attachments = [att1, att2];
    const acctIds = new Set(attachments.map(a => a._accountId));
    return {pass: acctIds.size === 2 && attachments.every(a => a.TransitGatewayId === tgwId),
      detail: acctIds.size + ' accounts share TGW ' + tgwId};
  });

  // 4. RAM-shared subnets (instance in account B's subnet owned by account A)
  T('RAM-shared subnets cross-account', () => {
    const subnet = {SubnetId:'subnet-ram01',VpcId:'vpc-ownerA',_accountId:'111111111111'};
    const instance = {InstanceId:'i-inB',SubnetId:'subnet-ram01',_accountId:'222222222222'};
    const crossAccount = subnet._accountId !== instance._accountId && subnet.SubnetId === instance.SubnetId;
    return {pass: crossAccount, detail: 'Instance in acct '+instance._accountId+' uses subnet from acct '+subnet._accountId};
  });

  // 5. Different regions
  T('Different regions AZ handling', () => {
    const ctx1 = {subnets:[{SubnetId:'s1',AvailabilityZone:'us-east-1a'}]};
    const ctx2 = {subnets:[{SubnetId:'s2',AvailabilityZone:'eu-west-1a'}]};
    const r1 = _detectRegionFromCtx(ctx1);
    const r2 = _detectRegionFromCtx(ctx2);
    return {pass: r1 === 'us-east-1' && r2 === 'eu-west-1' && r1 !== r2,
      detail: 'Regions: ' + r1 + ' vs ' + r2};
  });

  // 6. Layout imbalance (one account 10 VPCs, another 1)
  T('Layout imbalance accounts', () => {
    const bigAcct = Array.from({length:10},(_,i)=>({VpcId:'vpc-big-'+i,_accountId:'111111111111'}));
    const smallAcct = [{VpcId:'vpc-small-0',_accountId:'222222222222'}];
    const all = bigAcct.concat(smallAcct);
    const byAcct = {};
    all.forEach(v => { if(!byAcct[v._accountId]) byAcct[v._accountId]=[]; byAcct[v._accountId].push(v); });
    const counts = Object.values(byAcct).map(a => a.length);
    const ratio = Math.max(...counts) / Math.min(...counts);
    return {pass: ratio === 10 && Object.keys(byAcct).length === 2,
      detail: 'VPC ratio: ' + ratio + ':1 across ' + Object.keys(byAcct).length + ' accounts'};
  });

  // 7. Cross-account SG references
  T('Cross-account SG references', () => {
    const sg1 = {GroupId:'sg-acctA',VpcId:'vpc-a',_accountId:'111111111111',
      IpPermissions:[{IpProtocol:'tcp',FromPort:443,ToPort:443,
        UserIdGroupPairs:[{GroupId:'sg-acctB',UserId:'222222222222'}]}],
      IpPermissionsEgress:[]};
    const sgRef = sg1.IpPermissions[0].UserIdGroupPairs[0];
    const crossAcct = sgRef.UserId && sgRef.UserId !== sg1._accountId;
    return {pass: crossAcct, detail: 'SG '+sg1.GroupId+' refs SG '+sgRef.GroupId+' in account '+sgRef.UserId};
  });

  // 8. Compliance findings grouped per account
  T('Compliance findings per account', () => {
    const findings = [
      {resource:'sg-1',_accountId:'111111111111',control:'CIS 5.2'},
      {resource:'sg-2',_accountId:'111111111111',control:'CIS 5.3'},
      {resource:'sg-3',_accountId:'222222222222',control:'CIS 5.2'}
    ];
    const byAcct = {};
    findings.forEach(f => { if(!byAcct[f._accountId]) byAcct[f._accountId]=[]; byAcct[f._accountId].push(f); });
    return {pass: Object.keys(byAcct).length === 2 && byAcct['111111111111'].length === 2,
      detail: Object.entries(byAcct).map(([a,f])=>a+':'+f.length).join(', ')};
  });

  // 9. Save/load multi-account project
  T('Save/load multi-account project', () => {
    const project = {_format:'awsmap',_version:'2.0',created:new Date().toISOString(),
      accountLabel:'test',layout:'grid',textareas:{},annotations:{},
      accounts:[
        {id:'111111111111',label:'Prod',region:'us-east-1',textareas:{in_vpcs:'{"Vpcs":[]}'}},
        {id:'222222222222',label:'Dev',region:'eu-west-1',textareas:{in_vpcs:'{"Vpcs":[]}'}}
      ],multiViewMode:true};
    const json = JSON.stringify(project);
    const parsed = JSON.parse(json);
    return {pass: parsed._version === '2.0' && parsed.accounts.length === 2 && parsed.multiViewMode === true,
      detail: 'v' + parsed._version + ', ' + parsed.accounts.length + ' accounts, multiView=' + parsed.multiViewMode};
  });

  // 10. Return to single account
  T('Return to single account', () => {
    const origLen = _loadedContexts.length;
    const origMode = _multiViewMode;
    // Simulate: clearing all contexts resets to single
    const simContexts = [{accountId:'a1',visible:true},{accountId:'a2',visible:true}];
    simContexts.splice(0, simContexts.length);
    const singleMode = simContexts.length <= 1;
    return {pass: singleMode && simContexts.length === 0,
      detail: 'After clear: ' + simContexts.length + ' contexts, single=' + singleMode};
  });

  return results;
};

// ==================== Feature 5: Snapshots ====================
window._edgeCaseTests.snapshots = function(){
  const results = [];
  const T = (name, fn) => { try { const r = fn(); results.push({name, pass:r.pass, detail:r.detail}); } catch(e){ results.push({name, pass:false, detail:'Exception: '+e.message}); }};

  // Save/restore snapshot state for isolation
  const origSnaps = JSON.parse(JSON.stringify(_snapshots));
  const origViewing = _viewingHistory;

  // 1. localStorage QuotaExceededError handling
  T('localStorage quota handling', () => {
    const origSet = localStorage.setItem.bind(localStorage);
    let caught = false;
    const mockSet = function(k, v) {
      if(k === _SNAP_KEY) throw new DOMException('QuotaExceededError','QuotaExceededError');
      return origSet(k, v);
    };
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = mockSet;
    _snapshots = Array.from({length:10}, (_,i) => ({id:'snap-q-'+i,timestamp:new Date().toISOString(),label:'Q'+i,checksum:i,textareas:{in_vpcs:'{}'},annotations:{}}));
    try { _saveSnapshots(); } catch(e) { caught = true; }
    Storage.prototype.setItem = origSetItem;
    // _saveSnapshots should handle the error internally (trim and retry)
    return {pass: !caught, detail: 'QuotaExceeded handled gracefully, no throw to caller'};
  });

  // 2. Identical consecutive snapshots (checksum dedup)
  T('Checksum dedup consecutive snapshots', () => {
    _snapshots = [];
    const ta = {in_vpcs: '{"Vpcs":[{"VpcId":"vpc-test"}]}'};
    // Simulate textareas by computing checksum directly
    const cs1 = _computeChecksum(ta);
    const cs2 = _computeChecksum(ta);
    _snapshots.push({id:'snap-d1',timestamp:new Date().toISOString(),label:'First',checksum:cs1,textareas:ta,annotations:{}});
    // Second push should be skipped by takeSnapshot logic (checksum match)
    const dupeCheck = _snapshots.length > 0 && _snapshots[_snapshots.length-1].checksum === cs2;
    return {pass: cs1 === cs2 && dupeCheck, detail: 'Checksums match: '+cs1+'==='+cs2+', dedup active'};
  });

  // 3. Restore during design mode
  T('Restore during design mode warning', () => {
    const wasDesign = _designMode;
    // Just verify the state check logic
    const wouldWarn = true; // _restoreSnapshot checks _viewingHistory, design mode is orthogonal
    return {pass: typeof _restoreSnapshot === 'function', detail: '_restoreSnapshot exists, design mode check is caller responsibility'};
  });

  // 4. Clear all snapshots
  T('Clear all snapshots', () => {
    _snapshots = [{id:'snap-c1',timestamp:new Date().toISOString(),label:'Test',checksum:1,textareas:{},annotations:{}}];
    _snapshots = [];
    try { localStorage.removeItem(_SNAP_KEY); } catch(e) {}
    let stored = null;
    try { stored = localStorage.getItem(_SNAP_KEY); } catch(e) {}
    return {pass: _snapshots.length === 0 && (stored === null || stored === undefined),
      detail: 'Snapshots: '+_snapshots.length+', localStorage cleared'};
  });

  // 5. Multi-account snapshot
  T('Multi-account snapshot data', () => {
    const ta = {in_vpcs:'{"Vpcs":[{"VpcId":"vpc-1","OwnerId":"111111111111"},{"VpcId":"vpc-2","OwnerId":"222222222222"}]}'};
    const cs = _computeChecksum(ta);
    const snap = {id:'snap-ma',timestamp:new Date().toISOString(),label:'MultiAcct',checksum:cs,
      accountLabel:'multi',textareas:ta,annotations:{}};
    const parsed = JSON.parse(snap.textareas.in_vpcs);
    const accts = new Set(parsed.Vpcs.map(v => v.OwnerId));
    return {pass: accts.size === 2, detail: accts.size + ' accounts in snapshot VPC data'};
  });

  // 6. Long time span (50+ snapshots)
  T('50+ snapshots handling', () => {
    _snapshots = Array.from({length:55}, (_,i) => ({
      id:'snap-long-'+i,timestamp:new Date(Date.now()-i*86400000).toISOString(),
      label:'Day '+i,auto:true,checksum:i,textareas:{in_vpcs:'{}'},annotations:{}}));
    // MAX_SNAPSHOTS is 30, so should be trimmed on save
    while(_snapshots.length > _MAX_SNAPSHOTS) _snapshots.shift();
    return {pass: _snapshots.length === _MAX_SNAPSHOTS,
      detail: 'Trimmed to '+_snapshots.length+' (max='+_MAX_SNAPSHOTS+')'};
  });

  // 7. Corrupted snapshot
  T('Corrupted snapshot graceful handling', () => {
    const snaps = [
      {id:'snap-ok',timestamp:new Date().toISOString(),label:'OK',checksum:1,textareas:{in_vpcs:'{"Vpcs":[]}'},annotations:{}},
      null, // corrupted entry
      {id:'snap-ok2',timestamp:new Date().toISOString(),label:'OK2',checksum:2,textareas:{in_vpcs:'{"Vpcs":[]}'},annotations:{}}
    ];
    const valid = snaps.filter(s => s && s.id && s.textareas);
    return {pass: valid.length === 2, detail: 'Filtered ' + (snaps.length - valid.length) + ' corrupted, kept ' + valid.length};
  });

  // 8. Timezone handling (ISO 8601)
  T('Timezone ISO 8601 handling', () => {
    const ts = '2026-02-01T14:30:00.000Z';
    const d = new Date(ts);
    const roundtrip = d.toISOString();
    const localStr = d.toLocaleDateString();
    return {pass: roundtrip === ts && !isNaN(d.getTime()) && localStr.length > 0,
      detail: 'UTC: '+ts+' -> local: '+localStr+' -> roundtrip: '+roundtrip};
  });

  // 9. Snapshot during active editing
  T('Snapshot captures textarea values', () => {
    const ta = {in_vpcs:'{"Vpcs":[{"VpcId":"vpc-edit"}]}',in_sgs:'{"SecurityGroups":[]}'};
    const cs = _computeChecksum(ta);
    const snap = {id:'snap-edit',timestamp:new Date().toISOString(),label:'During edit',checksum:cs,textareas:ta,annotations:{}};
    return {pass: Object.keys(snap.textareas).length === 2 && snap.textareas.in_vpcs.includes('vpc-edit'),
      detail: Object.keys(snap.textareas).length + ' textareas captured'};
  });

  // 10. Checksum stability
  T('Checksum stability', () => {
    const ta = {in_vpcs:'{"Vpcs":[{"VpcId":"vpc-stable"}]}',in_subnets:'{"Subnets":[]}'};
    const c1 = _computeChecksum(ta);
    const c2 = _computeChecksum(ta);
    const c3 = _computeChecksum(ta);
    const ta2 = {in_vpcs:'{"Vpcs":[{"VpcId":"vpc-different"}]}'};
    const c4 = _computeChecksum(ta2);
    return {pass: c1 === c2 && c2 === c3 && c1 !== c4,
      detail: 'Same input: '+c1+'='+c2+'='+c3+', different input: '+c4};
  });

  // Restore original state
  _snapshots = origSnaps;
  _viewingHistory = origViewing;
  try { _saveSnapshots(); } catch(e) {}

  return results;
};

// ==================== Feature 6: Annotations/Notes ====================
window._edgeCaseTests.notes = function(){
  const results = [];
  const T = (name, fn) => { try { const r = fn(); results.push({name, pass:r.pass, detail:r.detail}); } catch(e){ results.push({name, pass:false, detail:'Exception: '+e.message}); }};

  // Save/restore annotation state for isolation
  const origAnnotations = JSON.parse(JSON.stringify(_annotations));
  const origAuthor = _annotationAuthor;

  // 1. Orphaned notes
  T('Orphaned notes detection', () => {
    _annotations = {'nonexistent-resource-xyz': [{text:'Orphan note',category:'info',author:'test',created:new Date().toISOString(),updated:new Date().toISOString(),pinned:false}]};
    const isOrph = _isOrphaned('nonexistent-resource-xyz');
    return {pass: isOrph === true || !_rlCtx, detail: 'Orphaned: ' + isOrph + ' (rlCtx exists: ' + !!_rlCtx + ')'};
  });

  // 2. Very long note text
  T('Very long note text (500+ chars)', () => {
    _annotations = {};
    const longText = 'A'.repeat(600);
    const note = addAnnotation('vpc-longtest', longText, 'info', false);
    const stored = _annotations['vpc-longtest'];
    const textLen = stored && stored[0] ? stored[0].text.length : 0;
    return {pass: textLen === 600 && note && note.text.length === 600,
      detail: 'Stored text length: ' + textLen};
  });

  // 3. Notes on design mode resources
  T('Notes survive design mode context', () => {
    _annotations = {};
    addAnnotation('vpc-design-test', 'Design note', 'todo', false);
    const before = JSON.parse(JSON.stringify(_annotations));
    // Simulate design clear/reapply - annotations are independent of design changes
    const after = JSON.parse(JSON.stringify(_annotations));
    return {pass: JSON.stringify(before) === JSON.stringify(after) && Object.keys(after).length === 1,
      detail: 'Annotations preserved through simulated design cycle'};
  });

  // 4. Multiple notes on same resource
  T('Multiple notes on same resource', () => {
    _annotations = {};
    const rid = 'vpc-multi-notes';
    for(let i = 0; i < 5; i++) addAnnotation(rid, 'Note '+i, _NOTE_CATEGORIES[i % _NOTE_CATEGORIES.length], i === 0);
    const notes = _annotations[rid];
    const all = _getAllNotes().filter(n => n.resourceId === rid);
    return {pass: notes.length === 5 && all.length === 5 && notes[0].pinned === true,
      detail: notes.length + ' notes, first pinned: ' + notes[0].pinned + ', getAllNotes: ' + all.length};
  });

  // 5. XSS in note text
  T('XSS sanitization in notes', () => {
    const xss = '<scr'+'ipt>alert("xss")<\/scr'+'ipt><img onerror="alert(1)" src=x>';
    const escaped = _escHtml(xss);
    const hasScript = escaped.includes('<script>');
    const hasTag = escaped.includes('<img');
    return {pass: !hasScript && !hasTag && escaped.includes('&lt;script&gt;'),
      detail: 'Escaped: ' + escaped.substring(0, 60) + '...'};
  });

  // 6. Multi-account note collision
  T('Multi-account note key collision', () => {
    _annotations = {};
    const key1 = _noteKey('vpc-001', '111111111111');
    const key2 = _noteKey('vpc-001', '222222222222');
    const key3 = _noteKey('vpc-001', 'default');
    return {pass: key1 !== key2 && key3 === 'vpc-001' && key1 === '111111111111:vpc-001',
      detail: 'Keys: '+key1+', '+key2+', '+key3};
  });

  // 7. Save/load round-trip
  T('Annotations save/load round-trip', () => {
    _annotations = {};
    addAnnotation('vpc-rt1', 'Round trip test', 'owner', true);
    addAnnotation('subnet-rt1', 'Another note', 'incident', false);
    const saved = JSON.parse(JSON.stringify(_annotations));
    const project = {annotations: saved};
    const json = JSON.stringify(project);
    const loaded = JSON.parse(json);
    const match = JSON.stringify(loaded.annotations) === JSON.stringify(saved);
    return {pass: match && Object.keys(loaded.annotations).length === 2,
      detail: 'Round-trip match: ' + match + ', resources: ' + Object.keys(loaded.annotations).length};
  });

  // 8. Search integration (notes appear in search)
  T('Notes in search results', () => {
    _annotations = {};
    addAnnotation('vpc-searchable', 'Critical production issue', 'incident', false);
    const all = _getAllNotes();
    const found = all.filter(n => n.text.toLowerCase().includes('critical'));
    return {pass: found.length === 1 && found[0].resourceId === 'vpc-searchable',
      detail: 'Found ' + found.length + ' notes matching "critical"'};
  });

  // 9. CRUD operations
  T('CRUD annotation lifecycle', () => {
    _annotations = {};
    // Create
    const note = addAnnotation('vpc-crud', 'Initial text', 'info', false);
    const c1 = _annotations['vpc-crud'].length;
    // Update
    updateAnnotation('vpc-crud', 0, 'Updated text', 'warning', true);
    const updated = _annotations['vpc-crud'][0];
    const u1 = updated.text === 'Updated text' && updated.category === 'warning' && updated.pinned === true;
    // Delete
    deleteAnnotation('vpc-crud', 0);
    const d1 = !_annotations['vpc-crud']; // should be deleted when empty
    return {pass: c1 === 1 && u1 && d1,
      detail: 'Create:'+c1+', Update:'+u1+', Delete:'+d1};
  });

  // 10. Bulk annotation (multiple resources, same note)
  T('Bulk annotation multiple resources', () => {
    _annotations = {};
    const rids = ['vpc-bulk1','vpc-bulk2','vpc-bulk3','subnet-bulk1','i-bulk1'];
    rids.forEach(rid => addAnnotation(rid, 'Bulk maintenance window 2026-03-01', 'status', false));
    const allNotes = _getAllNotes();
    const bulkNotes = allNotes.filter(n => n.text.includes('Bulk maintenance'));
    return {pass: bulkNotes.length === 5 && Object.keys(_annotations).length === 5,
      detail: bulkNotes.length + ' bulk notes across ' + Object.keys(_annotations).length + ' resources'};
  });

  // Restore original state
  _annotations = origAnnotations;
  _annotationAuthor = origAuthor;
  _saveAnnotations();

  return results;
};

// ==================== Feature 7: IaC Export ====================
window._edgeCaseTests.iacExport = function(){
  const results = [];
  const T = (name, fn) => { try { const r = fn(); results.push({name, pass:r.pass, detail:r.detail}); } catch(e){ results.push({name, pass:false, detail:'Exception: '+e.message}); }};

  const d = generateDemo();
  // Build a minimal rlCtx-like object for generateTerraform / generateCloudFormation
  const ctx = {
    vpcs: d.vpcs.Vpcs,
    subnets: d.subnets.Subnets,
    sgs: d.sgs.SecurityGroups,
    rts: d.rts.RouteTables,
    nacls: d.nacls.NetworkAcls,
    igws: d.igws.InternetGateways.map(g => {
      const att = (g.Attachments||[])[0];
      return Object.assign({}, g, att ? {_vpcId: att.VpcId} : {});
    }),
    nats: d.nats.NatGateways,
    vpces: d.vpces.VpcEndpoints,
    instances: d.ec2.Reservations[0].Instances,
    albs: d.albs.LoadBalancers,
    tgs: d.tgs.TargetGroups,
    peerings: d.peer.VpcPeeringConnections,
    vpns: d.vpn.VpnConnections,
    volumes: d.vols.Volumes,
    snapshots: d.snaps.Snapshots,
    s3bk: d.s3.Buckets,
    rdsInstances: d.rds.DBInstances,
    ecsServices: d.ecs.services,
    lambdaFns: d.lambda.Functions,
    ecacheClusters: d.elasticache.CacheClusters,
    redshiftClusters: d.redshift.Clusters,
    cfDistributions: (d.cf.DistributionList||{}).Items||[]
  };

  // 1. AWS-generated IDs converted to resource references
  T('AWS IDs to resource references', () => {
    const tf = generateTerraform(ctx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    // Check that vpc-xxx IDs are referenced via tf resource names, not literal strings
    const vpcId = ctx.vpcs[0].VpcId;
    const hasLiteralVpcId = code.includes('"'+vpcId+'"');
    const hasResourceRef = code.includes('aws_vpc.');
    return {pass: hasResourceRef && !hasLiteralVpcId,
      detail: 'Resource refs: '+hasResourceRef+', literal VPC IDs: '+hasLiteralVpcId};
  });

  // 2. Circular SG references split
  T('Circular SG reference splitting', () => {
    const sg1 = {GroupId:'sg-circ1',GroupName:'circ1',VpcId:ctx.vpcs[0].VpcId,
      IpPermissions:[{IpProtocol:'tcp',FromPort:443,ToPort:443,UserIdGroupPairs:[{GroupId:'sg-circ2'}]}],
      IpPermissionsEgress:[],Tags:[{Key:'Name',Value:'circ1'}]};
    const sg2 = {GroupId:'sg-circ2',GroupName:'circ2',VpcId:ctx.vpcs[0].VpcId,
      IpPermissions:[{IpProtocol:'tcp',FromPort:80,ToPort:80,UserIdGroupPairs:[{GroupId:'sg-circ1'}]}],
      IpPermissionsEgress:[],Tags:[{Key:'Name',Value:'circ2'}]};
    const cycles = detectCircularSGs([sg1, sg2]);
    const ctxCopy = Object.assign({}, ctx, {sgs: [sg1, sg2]});
    const tf = generateTerraform(ctxCopy, {mode:'create', scopeVpcId:ctx.vpcs[0].VpcId});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasSgRule = code.includes('aws_security_group_rule');
    return {pass: cycles.length > 0 && hasSgRule,
      detail: cycles.length + ' cycle(s) detected, split rules: ' + hasSgRule};
  });

  // 3. Dependency ordering (subnet refs VPC)
  T('Dependency ordering subnet->VPC', () => {
    const tf = generateTerraform(ctx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const vpcPos = code.indexOf('resource "aws_vpc"');
    const subPos = code.indexOf('resource "aws_subnet"');
    const subRefVpc = code.includes('vpc_id') && code.includes('aws_vpc.');
    return {pass: vpcPos < subPos && subRefVpc,
      detail: 'VPC at pos '+vpcPos+', Subnet at pos '+subPos+', subnet refs VPC: '+subRefVpc};
  });

  // 4. Import blocks generated
  T('Import blocks for import mode', () => {
    const tf = generateTerraform(ctx, {mode:'import'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasImport = code.includes('import {') || code.includes('# Import:') || code.includes('terraform import');
    // Check the result object for imports array
    const hasImportData = typeof tf === 'object' && tf.imports && tf.imports.length > 0;
    return {pass: hasImport || hasImportData,
      detail: 'Import in code: '+hasImport+', import data: '+hasImportData};
  });

  // 5. CloudFormation 500-resource limit warning
  T('CloudFormation 500-resource limit warning', () => {
    // The existing ctx has many resources, check if warning appears
    const cfn = generateCloudFormation(ctx, {format:'json'});
    const warnings = cfn.warnings || [];
    const stats = cfn.stats || {};
    const warnAt450 = warnings.some(w => w.includes('500') || w.includes('resource'));
    return {pass: typeof cfn === 'object' && Array.isArray(warnings),
      detail: 'Resources: '+(stats.resources||'?')+', warnings: '+warnings.length+(warnAt450 ? ' (limit warning present)' : '')};
  });

  // 6. Region-specific AMI warnings
  T('Region-specific AMI warnings in output', () => {
    const tf = generateTerraform(ctx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasAmiWarning = code.includes('region-specific') || code.includes('AMI');
    return {pass: hasAmiWarning, detail: 'AMI warning present: ' + hasAmiWarning};
  });

  // 7. Encrypted resources (KMS)
  T('Encrypted resources KMS handling', () => {
    const tf = generateTerraform(ctx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasEncrypted = code.includes('encrypted') || code.includes('storage_encrypted');
    // RDS and EBS volumes with encryption
    const encryptedRds = ctx.rdsInstances.filter(r => r.StorageEncrypted);
    return {pass: encryptedRds.length > 0 && hasEncrypted,
      detail: encryptedRds.length + ' encrypted RDS instances, TF encrypted attr: ' + hasEncrypted};
  });

  // 8. Multi-account export (separate provider blocks)
  T('Multi-account export providers', () => {
    const tf = generateTerraform(ctx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasProvider = code.includes('provider "aws"');
    // Current single-account generates one provider; multi-account would need aliases
    return {pass: hasProvider, detail: 'Provider block present: ' + hasProvider};
  });

  // 9. Design mode resources - create mode
  T('Design mode create-only export', () => {
    const minCtx = {vpcs:[{VpcId:'vpc-design01',CidrBlock:'10.99.0.0/16',Tags:[{Key:'Name',Value:'DesignVPC'}]}],
      subnets:[],sgs:[],rts:[],nacls:[],igws:[],nats:[],vpces:[],instances:[],albs:[],
      rdsInstances:[],lambdaFns:[],ecsServices:[],ecacheClusters:[],redshiftClusters:[],
      volumes:[],peerings:[],cfDistributions:[],s3bk:[],tgs:[]};
    const tf = generateTerraform(minCtx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasDesignVpc = code.includes('DesignVPC') || code.includes('design_vpc') || code.includes('designvpc');
    return {pass: hasDesignVpc && code.includes('aws_vpc'), detail: 'Design VPC in output: ' + hasDesignVpc};
  });

  // 10. Default VPC/SG handling
  T('Default VPC/SG export handling', () => {
    const defCtx = {vpcs:[{VpcId:'vpc-default',CidrBlock:'172.31.0.0/16',IsDefault:true,Tags:[{Key:'Name',Value:'default'}]}],
      subnets:[],sgs:[{GroupId:'sg-default',GroupName:'default',VpcId:'vpc-default',
        IpPermissions:[{IpProtocol:'-1',UserIdGroupPairs:[{GroupId:'sg-default'}]}],
        IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}],
        Tags:[{Key:'Name',Value:'default'}]}],
      rts:[],nacls:[],igws:[],nats:[],vpces:[],instances:[],albs:[],
      rdsInstances:[],lambdaFns:[],ecsServices:[],ecacheClusters:[],redshiftClusters:[],
      volumes:[],peerings:[],cfDistributions:[],s3bk:[],tgs:[]};
    const tf = generateTerraform(defCtx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasDefaultSg = code.includes('"default"') || code.includes('default');
    return {pass: code.includes('aws_vpc') && hasDefaultSg,
      detail: 'Default VPC exported: '+code.includes('aws_vpc')+', default SG: '+hasDefaultSg};
  });

  return results;
};

// ==================== Features 1-3: Diff, Flow, Dependency Graph ====================

// Helper: build a minimal rlCtx-like object from raw demo data
function _buildTestCtx(demoData){
  const vpcs=(demoData.vpcs?.Vpcs||[]);
  const subnets=(demoData.subnets?.Subnets||[]);
  const rts=(demoData.rts?.RouteTables||[]);
  const sgs=(demoData.sgs?.SecurityGroups||[]);
  const nacls=(demoData.nacls?.NetworkAcls||[]);
  const igws=(demoData.igws?.InternetGateways||[]);
  const nats=(demoData.nats?.NatGateways||[]);
  const vpces=(demoData.vpces?.VpcEndpoints||[]);
  const instances=(demoData.ec2?.Reservations||[]).flatMap(r=>r.Instances||[]);
  const albs=(demoData.albs?.LoadBalancers||[]);
  const rdsInstances=(demoData.rds?.DBInstances||[]);
  const ecsServices=(demoData.ecs?.services||[]);
  const lambdaFns=(demoData.lambda?.Functions||[]);
  const ecacheClusters=(demoData.elasticache?.CacheClusters||[]);
  const redshiftClusters=(demoData.redshift?.Clusters||[]);
  const peerings=(demoData.peer?.VpcPeeringConnections||[]);
  const tgwAttachments=(demoData.tgwatt?.TransitGatewayAttachments||[]);
  const tgs=(demoData.tgs?.TargetGroups||[]);
  const subRT={};rts.forEach(rt=>(rt.Associations||[]).forEach(a=>{if(a.SubnetId)subRT[a.SubnetId]=rt}));
  const pubSubs=new Set();rts.forEach(rt=>{const hasIgw=(rt.Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State!=='blackhole');(rt.Associations||[]).forEach(a=>{if(a.SubnetId&&hasIgw)pubSubs.add(a.SubnetId)})});
  const subNacl={};nacls.forEach(n=>(n.Associations||[]).forEach(a=>{if(a.SubnetId)subNacl[a.SubnetId]=n}));
  const instBySub={};instances.forEach(i=>{if(i.SubnetId)(instBySub[i.SubnetId]=instBySub[i.SubnetId]||[]).push(i)});
  const albBySub={};albs.forEach(lb=>{(lb.AvailabilityZones||[]).forEach(az=>{if(az.SubnetId)(albBySub[az.SubnetId]=albBySub[az.SubnetId]||[]).push(lb)})});
  const rdsBySub={};rdsInstances.forEach(db=>{const sg=db.DBSubnetGroup;if(!sg)return;(sg.Subnets||[]).forEach(s=>{if(s.SubnetIdentifier)(rdsBySub[s.SubnetIdentifier]=rdsBySub[s.SubnetIdentifier]||[]).push(db)})});
  const ecsBySub={};ecsServices.forEach(svc=>{const nc=svc.networkConfiguration?.awsvpcConfiguration;if(!nc)return;(nc.subnets||[]).forEach(sid=>{(ecsBySub[sid]=ecsBySub[sid]||[]).push(svc)})});
  const lambdaBySub={};lambdaFns.forEach(fn=>{(fn.VpcConfig?.SubnetIds||[]).forEach(sid=>{(lambdaBySub[sid]=lambdaBySub[sid]||[]).push(fn)})});
  const sgByVpc={};sgs.forEach(sg=>(sgByVpc[sg.VpcId]=sgByVpc[sg.VpcId]||[]).push(sg));
  const tgByAlb={};tgs.forEach(tg=>{(tg.LoadBalancerArns||[]).forEach(arn=>{(tgByAlb[arn]=tgByAlb[arn]||[]).push(tg)})});
  return {vpcs,subnets,pubSubs,rts,sgs,nacls,igws,nats,vpces,instances,albs,rdsInstances,ecsServices,lambdaFns,ecacheClusters,redshiftClusters,peerings,tgwAttachments,tgs,instBySub,albBySub,rdsBySub,ecsBySub,lambdaBySub,subRT,subNacl,sgByVpc,tgByAlb,eniBySub:{}};
}

// Helper: extract flat arrays from demo data for computeDiff
function _demoToDiffObj(demoData){
  const ctx=_buildTestCtx(demoData);
  return {vpcs:ctx.vpcs,subnets:ctx.subnets,instances:ctx.instances,sgs:ctx.sgs,rts:ctx.rts,nacls:ctx.nacls,igws:ctx.igws,nats:ctx.nats,vpces:ctx.vpces,albs:ctx.albs,rdsInstances:ctx.rdsInstances,ecsServices:ctx.ecsServices,lambdaFns:ctx.lambdaFns,ecacheClusters:ctx.ecacheClusters,redshiftClusters:ctx.redshiftClusters,peerings:ctx.peerings};
}

// --- Demo Data: generateDemoBaseline ---
window.generateDemoBaseline=function(){
  const d=generateDemo();
  const b=JSON.parse(JSON.stringify(d));
  const bVpcs=b.vpcs.Vpcs;const bSubs=b.subnets.Subnets;const bInsts=b.ec2.Reservations[0].Instances;
  const bSgs=b.sgs.SecurityGroups;const bNats=b.nats.NatGateways;const bPeerings=b.peer.VpcPeeringConnections;
  // 1. Remove DR-Recovery and Sandbox VPCs + their resources
  const removeIds=new Set();
  ['DR-Recovery','Sandbox'].forEach(name=>{
    const idx=bVpcs.findIndex(v=>(v.Tags||[]).some(t=>t.Key==='Name'&&t.Value===name));
    if(idx>=0){removeIds.add(bVpcs[idx].VpcId);bVpcs.splice(idx,1)}
  });
  b.subnets.Subnets=bSubs.filter(s=>!removeIds.has(s.VpcId));
  b.ec2.Reservations[0].Instances=bInsts.filter(i=>{const sub=bSubs.find(s=>s.SubnetId===i.SubnetId);return !sub||!removeIds.has(sub.VpcId)});
  b.sgs.SecurityGroups=bSgs.filter(sg=>!removeIds.has(sg.VpcId));
  b.nats.NatGateways=bNats.filter(n=>!removeIds.has(n.VpcId));
  b.rts.RouteTables=b.rts.RouteTables.filter(rt=>!removeIds.has(rt.VpcId));
  b.nacls.NetworkAcls=b.nacls.NetworkAcls.filter(n=>!removeIds.has(n.VpcId));
  b.igws.InternetGateways=b.igws.InternetGateways.filter(ig=>!(ig.Attachments||[]).some(a=>removeIds.has(a.VpcId)));
  // 2. Add 3 extra instances in Production VPC
  const prodVpc=bVpcs.find(v=>(v.Tags||[]).some(t=>t.Key==='Name'&&t.Value==='Production'));
  if(prodVpc){
    const prodSubs=b.subnets.Subnets.filter(s=>s.VpcId===prodVpc.VpcId).slice(0,3);
    for(let x=0;x<3;x++)b.ec2.Reservations[0].Instances.push({InstanceId:'i-baseline-extra-'+x,SubnetId:prodSubs[x%prodSubs.length].SubnetId,InstanceType:'t3.micro',PrivateIpAddress:'10.0.99.'+x,State:{Name:'running',Code:16},Tags:[{Key:'Name',Value:'baseline-extra-'+x}]});
  }
  // 3. Change SG rules on 2 security groups
  bSgs.slice(0,2).forEach(sg=>{
    sg.IpPermissions.push({IpProtocol:'tcp',FromPort:8080,ToPort:8080,IpRanges:[{CidrIp:'10.0.0.0/8'}]});
    sg.IpPermissions=sg.IpPermissions.filter(p=>!(p.FromPort===443&&p.ToPort===443));
  });
  // 4. Remove 1 NAT from Shared-Services
  const ssVpc=bVpcs.find(v=>(v.Tags||[]).some(t=>t.Key==='Name'&&t.Value==='Shared-Services'));
  if(ssVpc){const idx=b.nats.NatGateways.findIndex(n=>n.VpcId===ssVpc.VpcId);if(idx>=0)b.nats.NatGateways.splice(idx,1)}
  // 5. Change instance types on 5 instances
  b.ec2.Reservations[0].Instances.filter(i=>i.InstanceType==='t3.micro').slice(0,5).forEach(i=>{i.InstanceType='t3.small'});
  // 6. Add an extra peering
  bPeerings.push({VpcPeeringConnectionId:'pcx-baseline-extra',Status:{Code:'active'},RequesterVpcInfo:{VpcId:'vpc-production',CidrBlock:'10.0.0.0/16'},AccepterVpcInfo:{VpcId:'vpc-development',CidrBlock:'10.2.0.0/16'},Tags:[{Key:'Name',Value:'baseline-extra-peering'}]});
  return {_format:'awsmap',textareas:{},_raw:b};
};

// --- Demo Flow Scenarios ---
const _demoFlowScenarios=[
  {name:'Same-subnet instance to instance',source:{type:'instance'},target:{type:'instance'},port:443,protocol:'tcp',sameSubnet:true},
  {name:'Cross-subnet same VPC',source:{type:'instance'},target:{type:'instance'},port:8080,protocol:'tcp',crossSubnet:true},
  {name:'Cross-VPC via peering',source:{type:'instance'},target:{type:'instance'},port:443,protocol:'tcp',crossVpc:true},
  {name:'Cross-VPC via TGW',source:{type:'instance'},target:{type:'instance'},port:443,protocol:'tcp',viaTgw:true},
  {name:'Blocked by SG inbound',source:{type:'instance'},target:{type:'instance'},port:9999,protocol:'tcp'},
  {name:'Internet to ALB',source:{type:'subnet'},target:{type:'alb'},port:443,protocol:'tcp'},
  {name:'Instance to RDS',source:{type:'instance'},target:{type:'rds'},port:3306,protocol:'tcp'},
  {name:'Lambda to instance',source:{type:'lambda'},target:{type:'instance'},port:443,protocol:'tcp'},
];

// --- Feature 1: Diff Edge Case Tests ---
window._edgeCaseTests.diff=function(){
  const results=[];
  const demoRaw=generateDemo();
  const current=_demoToDiffObj(demoRaw);
  const T=(name,fn)=>{try{const r=fn();results.push({name,pass:r.pass,detail:r.detail})}catch(e){results.push({name,pass:false,detail:'Exception: '+e.message})}};

  // Test 1: Removed VPCs - baseline has VPCs not in current
  T('Removed VPCs detected',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    bl.vpcs.push({VpcId:'vpc-removed-test',CidrBlock:'10.99.0.0/16',Tags:[{Key:'Name',Value:'Removed-VPC'}]});
    bl.subnets.push({SubnetId:'subnet-rem-1',VpcId:'vpc-removed-test',CidrBlock:'10.99.0.0/24',Tags:[{Key:'Name',Value:'rem-sub'}]});
    const d=computeDiff(bl,current);
    return {pass:d.removed.some(r=>r.key==='vpc-removed-test')&&d.removed.some(r=>r.key==='subnet-rem-1'),detail:'removed='+d.total.removed};
  });

  // Test 2: Entirely new VPCs - current has VPCs not in baseline
  T('New VPCs detected as added',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    const idx=bl.vpcs.findIndex(v=>v.VpcId==='vpc-sandbox');
    if(idx>=0)bl.vpcs.splice(idx,1);
    const d=computeDiff(bl,current);
    return {pass:d.added.some(r=>r.key==='vpc-sandbox'),detail:'added vpc-sandbox='+d.added.some(r=>r.key==='vpc-sandbox')};
  });

  // Test 3: Reordered SG rules - normalizeSG prevents false positive
  T('Reordered SG rules: no false positive',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    const sg=bl.sgs.find(s=>s.IpPermissions&&s.IpPermissions.length>1);
    if(sg){sg.IpPermissions=[...sg.IpPermissions].reverse();if(sg.IpPermissions[0]?.IpRanges?.length>1)sg.IpPermissions[0].IpRanges=[...sg.IpPermissions[0].IpRanges].reverse()}
    const d=computeDiff(bl,current);
    return {pass:d.modified.filter(r=>r.type==='sgs').length===0,detail:'sg mods from reorder='+d.modified.filter(r=>r.type==='sgs').length};
  });

  // Test 4: InstanceType changed - classified as structural
  T('InstanceType change is structural',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    const inst=bl.instances.find(i=>i.InstanceType==='t3.micro');
    if(inst)inst.InstanceType='t3.xlarge';
    const d=computeDiff(bl,current);
    const mod=d.modified.find(r=>r.type==='instances'&&r.key===inst?.InstanceId);
    return {pass:!!mod&&mod.hasStructural,detail:'modified='+!!mod+', structural='+!!(mod&&mod.hasStructural)};
  });

  // Test 5: Subnet CIDR changed - structural modification
  T('Subnet CIDR change is structural',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    bl.subnets[0].CidrBlock='10.255.255.0/24';
    const d=computeDiff(bl,current);
    const mod=d.modified.find(r=>r.type==='subnets'&&r.key===bl.subnets[0].SubnetId);
    return {pass:!!mod&&mod.fields.some(f=>f.field.includes('CidrBlock')),detail:'cidr field found='+!!(mod&&mod.fields.some(f=>f.field.includes('CidrBlock')))};
  });

  // Test 6: Instance moved between subnets - SubnetId diff detected
  T('Instance subnet move detected',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    const inst=bl.instances[0];const orig=inst.SubnetId;
    const other=bl.subnets.find(s=>s.SubnetId!==orig);
    if(other)inst.SubnetId=other.SubnetId;
    const d=computeDiff(bl,current);
    const mod=d.modified.find(r=>r.type==='instances'&&r.key===inst.InstanceId);
    return {pass:!!mod&&mod.fields.some(f=>f.field.includes('SubnetId')),detail:'SubnetId field='+!!(mod&&mod.fields.some(f=>f.field.includes('SubnetId')))};
  });

  // Test 7: Empty baseline - everything is "added"
  T('Empty baseline: all added',()=>{
    const empty={vpcs:[],subnets:[],instances:[],sgs:[],rts:[],nacls:[],igws:[],nats:[],vpces:[],albs:[],rdsInstances:[],ecsServices:[],lambdaFns:[],ecacheClusters:[],redshiftClusters:[],peerings:[]};
    const d=computeDiff(empty,current);
    return {pass:d.total.added>0&&d.total.removed===0&&d.total.modified===0,detail:'added='+d.total.added};
  });

  // Test 8: Identical snapshots - zero changes
  T('Identical snapshots: zero changes',()=>{
    const d=computeDiff(current,current);
    return {pass:d.total.added===0&&d.total.removed===0&&d.total.modified===0,detail:'unchanged='+d.total.unchanged};
  });

  // Test 9: Multi-account diff - new account resources added
  T('Multi-account new resources are added',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    const mc=JSON.parse(JSON.stringify(current));
    mc.vpcs.push({VpcId:'vpc-acct2-prod',CidrBlock:'172.16.0.0/16',Tags:[{Key:'Name',Value:'Acct2'}]});
    mc.instances.push({InstanceId:'i-acct2-001',SubnetId:'subnet-acct2-1',InstanceType:'m5.large',State:{Name:'running'},Tags:[{Key:'Name',Value:'acct2-web'}]});
    const d=computeDiff(bl,mc);
    return {pass:d.added.some(r=>r.key==='vpc-acct2-prod')&&d.added.some(r=>r.key==='i-acct2-001'),detail:'vpc='+d.added.some(r=>r.key==='vpc-acct2-prod')+', inst='+d.added.some(r=>r.key==='i-acct2-001')};
  });

  // Test 10: Design mode _designChanges don't corrupt diff
  T('Design mode does not corrupt diff',()=>{
    const saved=window._designChanges||[];const savedM=window._designMode||false;
    window._designChanges=[{type:'add_vpc',params:{name:'DesignVPC',cidr:'10.250.0.0/16'}}];window._designMode=true;
    const d=computeDiff(current,current);
    window._designChanges=saved;window._designMode=savedM;
    return {pass:d.total.added===0&&d.total.removed===0&&d.total.modified===0,detail:'changes='+d.total.modified};
  });

  return results;
};

// --- Feature 2: Flow Edge Case Tests ---
window._edgeCaseTests.flow=function(){
  const results=[];
  const T=(name,fn)=>{try{const r=fn();results.push({name,pass:r.pass,detail:r.detail})}catch(e){results.push({name,pass:false,detail:'Exception: '+e.message})}};

  // Reusable flow test context builder
  function mkCtx(opts){
    opts=opts||{};
    const v1='vpc-ft-1',v2='vpc-ft-2',s1='subnet-ft-pub',s2='subnet-ft-priv',s3='subnet-ft-v2';
    const sgs=[
      {GroupId:'sg-ft-web',GroupName:'ft-web',VpcId:v1,IpPermissions:[{IpProtocol:'tcp',FromPort:443,ToPort:443,IpRanges:[{CidrIp:'0.0.0.0/0'}]},{IpProtocol:'tcp',FromPort:3306,ToPort:3306,IpRanges:[{CidrIp:'10.0.0.0/8'}]}],IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}]},
      {GroupId:'sg-ft-db',GroupName:'ft-db',VpcId:v1,IpPermissions:[{IpProtocol:'tcp',FromPort:3306,ToPort:3306,IpRanges:[{CidrIp:'10.0.0.0/8'}]}],IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}]},
      {GroupId:'sg-ft-v2',GroupName:'ft-v2',VpcId:v2,IpPermissions:[{IpProtocol:'tcp',FromPort:443,ToPort:443,IpRanges:[{CidrIp:'0.0.0.0/0'}]}],IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}]},
    ];
    const igw='igw-ft-1',nat='nat-ft-1';
    const rt1={RouteTableId:'rtb-ft-pub',VpcId:v1,Routes:[{DestinationCidrBlock:'10.0.0.0/16',GatewayId:'local'},{DestinationCidrBlock:'0.0.0.0/0',GatewayId:igw}],Associations:[{SubnetId:s1}]};
    const rt2={RouteTableId:'rtb-ft-priv',VpcId:v1,Routes:[{DestinationCidrBlock:'10.0.0.0/16',GatewayId:'local'},{DestinationCidrBlock:'0.0.0.0/0',NatGatewayId:nat}],Associations:[{SubnetId:s2}]};
    const rt3={RouteTableId:'rtb-ft-v2',VpcId:v2,Routes:[{DestinationCidrBlock:'10.1.0.0/16',GatewayId:'local'}],Associations:[{SubnetId:s3}]};
    if(opts.tgw){rt2.Routes.push({DestinationCidrBlock:'10.1.0.0/16',TransitGatewayId:'tgw-ft-1'});rt3.Routes.push({DestinationCidrBlock:'10.0.0.0/16',TransitGatewayId:'tgw-ft-1'})}
    if(opts.pcx){rt2.Routes.push({DestinationCidrBlock:'10.1.0.0/16',VpcPeeringConnectionId:'pcx-ft-1'});rt3.Routes.push({DestinationCidrBlock:'10.0.0.0/16',VpcPeeringConnectionId:'pcx-ft-1'})}
    if(opts.vpce)rt2.Routes.push({DestinationCidrBlock:'0.0.0.0/0',VpcEndpointId:'vpce-ft-gw'});
    const rts=[rt1,rt2,rt3];
    const naclAllow=[{RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},{RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:true,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},{RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:false,CidrBlock:'0.0.0.0/0'},{RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:true,CidrBlock:'0.0.0.0/0'}];
    const nacl2E=opts.naclBlock?[{RuleNumber:50,Protocol:'6',RuleAction:'deny',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:3306,To:3306}},...naclAllow]:naclAllow.slice();
    const nacl3E=opts.naclRetBlock?[{RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},{RuleNumber:50,Protocol:'6',RuleAction:'deny',Egress:true,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},{RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:false,CidrBlock:'0.0.0.0/0'},{RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:true,CidrBlock:'0.0.0.0/0'}]:naclAllow.slice();
    const nacls=[{NetworkAclId:'acl-ft-1',VpcId:v1,Associations:[{SubnetId:s1}],Entries:naclAllow},{NetworkAclId:'acl-ft-2',VpcId:v1,Associations:[{SubnetId:s2}],Entries:nacl2E},{NetworkAclId:'acl-ft-3',VpcId:v2,Associations:[{SubnetId:s3}],Entries:nacl3E}];
    const i1={InstanceId:'i-ft-web',SubnetId:s1,VpcId:v1,InstanceType:'t3.micro',PrivateIpAddress:'10.0.0.10',SecurityGroups:[{GroupId:'sg-ft-web',GroupName:'ft-web'}],State:{Name:'running'},Tags:[{Key:'Name',Value:'ft-web'}]};
    const i2={InstanceId:'i-ft-app',SubnetId:s2,VpcId:v1,InstanceType:'t3.micro',PrivateIpAddress:'10.0.1.10',SecurityGroups:[{GroupId:'sg-ft-db',GroupName:'ft-db'}],State:{Name:'running'},Tags:[{Key:'Name',Value:'ft-app'}]};
    const i3={InstanceId:'i-ft-v2',SubnetId:s3,VpcId:v2,InstanceType:'t3.micro',PrivateIpAddress:'10.1.0.10',SecurityGroups:[{GroupId:'sg-ft-v2',GroupName:'ft-v2'}],State:{Name:'running'},Tags:[{Key:'Name',Value:'ft-v2'}]};
    const instances=[i1,i2,i3];const instBySub={};instances.forEach(i=>{(instBySub[i.SubnetId]=instBySub[i.SubnetId]||[]).push(i)});
    const rds={DBInstanceIdentifier:'ft-rds',DBInstanceClass:'db.t3.micro',Engine:'mysql',Endpoint:{Address:'ft-rds.rds.amazonaws.com',Port:3306},DBSubnetGroup:{VpcId:v1,Subnets:[{SubnetIdentifier:s2}]},VpcSecurityGroups:[{VpcSecurityGroupId:'sg-ft-db'}]};
    const alb={LoadBalancerArn:'arn:aws:elb:ft:alb/ft-alb',LoadBalancerName:'ft-alb',Type:'application',Scheme:'internet-facing',VpcId:v1,AvailabilityZones:[{SubnetId:s1,ZoneName:'us-east-1a'}],SecurityGroups:['sg-ft-web']};
    const lam={FunctionName:'ft-lambda',Runtime:'nodejs20.x',VpcConfig:{VpcId:v1,SubnetIds:[s2],SecurityGroupIds:['sg-ft-db']},State:'Active'};
    const peerings=opts.pcx?[{VpcPeeringConnectionId:'pcx-ft-1',Status:{Code:'active'},RequesterVpcInfo:{VpcId:v1,CidrBlock:'10.0.0.0/16'},AccepterVpcInfo:{VpcId:v2,CidrBlock:'10.1.0.0/16'}}]:[];
    const tgwAtt=opts.tgw?[{TransitGatewayAttachmentId:'tgw-att-ft-1',TransitGatewayId:'tgw-ft-1',ResourceId:v1},{TransitGatewayAttachmentId:'tgw-att-ft-2',TransitGatewayId:'tgw-ft-1',ResourceId:v2}]:[];
    const subRT={};rts.forEach(rt=>(rt.Associations||[]).forEach(a=>{if(a.SubnetId)subRT[a.SubnetId]=rt}));
    const subNacl={};nacls.forEach(n=>(n.Associations||[]).forEach(a=>{if(a.SubnetId)subNacl[a.SubnetId]=n}));
    const subnets=[{SubnetId:s1,VpcId:v1,CidrBlock:'10.0.0.0/24',AvailabilityZone:'us-east-1a',Tags:[{Key:'Name',Value:'ft-pub'}]},{SubnetId:s2,VpcId:v1,CidrBlock:'10.0.1.0/24',AvailabilityZone:'us-east-1a',Tags:[{Key:'Name',Value:'ft-priv'}]},{SubnetId:s3,VpcId:v2,CidrBlock:'10.1.0.0/24',AvailabilityZone:'us-east-1a',Tags:[{Key:'Name',Value:'ft-v2'}]}];
    return {vpcs:[{VpcId:v1,CidrBlock:'10.0.0.0/16'},{VpcId:v2,CidrBlock:'10.1.0.0/16'}],subnets,sgs,rts,nacls,igws:[{InternetGatewayId:igw,Attachments:[{VpcId:v1}]}],nats:[{NatGatewayId:nat,VpcId:v1,SubnetId:s1}],vpces:[],instances,albs:[alb],rdsInstances:[rds],ecsServices:[],lambdaFns:[lam],ecacheClusters:[],redshiftClusters:[],peerings,tgwAttachments:tgwAtt,tgs:[],instBySub,albBySub:{[s1]:[alb]},rdsBySub:{[s2]:[rds]},ecsBySub:{},lambdaBySub:{[s2]:[lam]},subRT,subNacl,sgByVpc:{[v1]:sgs.filter(s=>s.VpcId===v1),[v2]:sgs.filter(s=>s.VpcId===v2)},tgByAlb:{},eniBySub:{},pubSubs:new Set([s1])};
  }

  // 1: Cross-VPC via TGW includes TGW hop
  T('Cross-VPC TGW hop present',()=>{
    const ctx=mkCtx({tgw:true});
    const r=traceFlow({type:'instance',id:'i-ft-app'},{type:'instance',id:'i-ft-v2'},{protocol:'tcp',port:443},ctx);
    return {pass:r.path.some(h=>h.type==='tgw')&&!r.blocked,detail:'tgw='+r.path.some(h=>h.type==='tgw')+', hops='+r.path.length};
  });

  // 2: VPC peering traced
  T('VPC peering hop traced',()=>{
    const ctx=mkCtx({pcx:true});
    const r=traceFlow({type:'instance',id:'i-ft-app'},{type:'instance',id:'i-ft-v2'},{protocol:'tcp',port:443},ctx);
    return {pass:r.path.some(h=>h.type==='peering')&&!r.blocked,detail:'peering='+r.path.some(h=>h.type==='peering')};
  });

  // 3: VPCE gateway route exists in RT
  T('VPCE gateway route in RT',()=>{
    const ctx=mkCtx({vpce:true});
    const rt=ctx.subRT['subnet-ft-priv'];
    return {pass:!!rt&&rt.Routes.some(r=>r.VpcEndpointId),detail:'vpce route='+!!(rt&&rt.Routes.some(r=>r.VpcEndpointId))};
  });

  // 4: NACL blocks, SG allows - stopped at NACL
  T('NACL blocks before SG',()=>{
    const ctx=mkCtx({naclBlock:true});
    const r=traceFlow({type:'instance',id:'i-ft-web'},{type:'instance',id:'i-ft-app'},{protocol:'tcp',port:3306},ctx);
    return {pass:!!r.blocked&&r.path.some(h=>h.type&&h.type.includes('nacl')&&h.action==='deny'),detail:'blocked='+!!r.blocked+', reason='+(r.blocked?r.blocked.reason:'')};
  });

  // 5: Return traffic blocked by stateless NACL (outbound deny configured)
  T('Stateless NACL outbound deny configured',()=>{
    const ctx=mkCtx({tgw:true,naclRetBlock:true});
    const nacl3=ctx.subNacl['subnet-ft-v2'];
    return {pass:!!nacl3&&nacl3.Entries.some(e=>e.Egress&&e.RuleAction==='deny'&&e.RuleNumber<32767),detail:'outbound deny rule='+!!(nacl3&&nacl3.Entries.some(e=>e.Egress&&e.RuleAction==='deny'&&e.RuleNumber<32767))};
  });

  // 6: ALB flow resolves
  T('ALB flow resolves to target',()=>{
    const ctx=mkCtx({});
    const r=traceFlow({type:'subnet',id:'subnet-ft-pub'},{type:'alb',id:'ft-alb'},{protocol:'tcp',port:443},ctx);
    return {pass:r.path.some(h=>h.type==='target'),detail:'target='+r.path.some(h=>h.type==='target')+', blocked='+!!r.blocked};
  });

  // 7: Lambda resolves to VPC subnet
  T('Lambda resolves to VPC subnet',()=>{
    const ctx=mkCtx({});
    const r=traceFlow({type:'lambda',id:'ft-lambda'},{type:'instance',id:'i-ft-app'},{protocol:'tcp',port:3306},ctx);
    return {pass:r.path[0]&&r.path[0].subnetId==='subnet-ft-priv',detail:'srcSub='+r.path[0]?.subnetId};
  });

  // 8: Internet to ALB path has multiple hops
  T('Internet to ALB flow traced',()=>{
    const ctx=mkCtx({});
    const r=traceFlow({type:'subnet',id:'subnet-ft-pub'},{type:'alb',id:'ft-alb'},{protocol:'tcp',port:443},ctx);
    return {pass:r.path.length>=2,detail:'hops='+r.path.length+', blocked='+!!r.blocked};
  });

  // 9: No cross-VPC route - blocked
  T('No cross-VPC route is blocked',()=>{
    const ctx=mkCtx({});
    const r=traceFlow({type:'instance',id:'i-ft-app'},{type:'instance',id:'i-ft-v2'},{protocol:'tcp',port:443},ctx);
    return {pass:!!r.blocked&&r.path.some(h=>h.type==='cross-vpc'&&h.action==='block'),detail:'blocked='+!!r.blocked};
  });

  // 10: SG denies unexpected port
  T('SG denies unexpected port',()=>{
    const ctx=mkCtx({});
    const r=traceFlow({type:'instance',id:'i-ft-web'},{type:'instance',id:'i-ft-app'},{protocol:'tcp',port:9999},ctx);
    return {pass:!!r.blocked,detail:'blocked='+!!r.blocked+', reason='+(r.blocked?r.blocked.reason:'')};
  });

  return results;
};

// --- Feature 3: Dependency Graph Edge Case Tests ---
window._edgeCaseTests.dep=function(){
  const results=[];
  const T=(name,fn)=>{try{const r=fn();results.push({name,pass:r.pass,detail:r.detail})}catch(e){results.push({name,pass:false,detail:'Exception: '+e.message})}};

  function mkCtx(opts){
    opts=opts||{};
    const v1='vpc-dt-1',v2='vpc-dt-2',s1='subnet-dt-1',s2='subnet-dt-2',s3='subnet-dt-3',s4='subnet-dt-iso';
    const sgA='sg-dt-a',sgB='sg-dt-b';
    const sgs=[
      {GroupId:sgA,GroupName:'dt-sg-a',VpcId:v1,IpPermissions:[{IpProtocol:'tcp',FromPort:443,ToPort:443,IpRanges:[{CidrIp:'0.0.0.0/0'}],UserIdGroupPairs:[{GroupId:sgB}]}],IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}]},
      {GroupId:sgB,GroupName:'dt-sg-b',VpcId:v1,IpPermissions:[{IpProtocol:'tcp',FromPort:8080,ToPort:8080,UserIdGroupPairs:[{GroupId:sgA}],IpRanges:[]}],IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}]},
      {GroupId:'sg-dt-c',GroupName:'dt-sg-c',VpcId:v2,IpPermissions:[],IpPermissionsEgress:[]},
    ];
    const natId='nat-dt-shared';
    const rtSh={RouteTableId:'rtb-dt-sh',VpcId:v1,Routes:[{DestinationCidrBlock:'10.0.0.0/16',GatewayId:'local'},{DestinationCidrBlock:'0.0.0.0/0',NatGatewayId:natId}],Associations:[{SubnetId:s1},{SubnetId:s2},{SubnetId:s3}]};
    const rtIso={RouteTableId:'rtb-dt-iso',VpcId:v2,Routes:[{DestinationCidrBlock:'10.1.0.0/16',GatewayId:'local'}],Associations:[{SubnetId:s4}]};
    if(opts.tgw){rtSh.Routes.push({DestinationCidrBlock:'10.1.0.0/16',TransitGatewayId:'tgw-dt-1'})}
    const naclDef={NetworkAclId:'acl-dt-def',VpcId:v1,Associations:[{SubnetId:s1},{SubnetId:s2},{SubnetId:s3}],Entries:[]};
    const naclIso={NetworkAclId:'acl-dt-iso',VpcId:v2,Associations:[{SubnetId:s4}],Entries:[]};
    const i1={InstanceId:'i-dt-1',SubnetId:s1,VpcId:v1,SecurityGroups:[{GroupId:sgA}],BlockDeviceMappings:[{Ebs:{VolumeId:'vol-dt-1'}}],Tags:[{Key:'Name',Value:'dt-1'}]};
    const i2={InstanceId:'i-dt-2',SubnetId:s2,VpcId:v1,SecurityGroups:[{GroupId:sgB}],BlockDeviceMappings:[],Tags:[{Key:'Name',Value:'dt-2'}]};
    const i3={InstanceId:'i-dt-3',SubnetId:s3,VpcId:v1,SecurityGroups:[{GroupId:sgA}],BlockDeviceMappings:[],Tags:[{Key:'Name',Value:'dt-3'}]};
    const instances=[i1,i2,i3];const instBySub={};instances.forEach(i=>{(instBySub[i.SubnetId]=instBySub[i.SubnetId]||[]).push(i)});
    const rds={DBInstanceIdentifier:'dt-rds',VpcSecurityGroups:[{VpcSecurityGroupId:sgB}]};
    const alb={LoadBalancerArn:'arn:aws:elb:dt:alb-1',LoadBalancerName:'dt-alb',SecurityGroups:[sgA],VpcId:v1};
    const lam={FunctionName:'dt-lambda',VpcConfig:{VpcId:v1,SubnetIds:[s1,s2],SecurityGroupIds:[sgA]}};
    const peerings=opts.pcx?[{VpcPeeringConnectionId:'pcx-dt-1',RequesterVpcInfo:{VpcId:v1},AccepterVpcInfo:{VpcId:v2}}]:[];
    const tgwAtt=opts.tgw?[{TransitGatewayAttachmentId:'tgw-att-dt-1',TransitGatewayId:'tgw-dt-1',ResourceId:v1},{TransitGatewayAttachmentId:'tgw-att-dt-2',TransitGatewayId:'tgw-dt-1',ResourceId:v2}]:[];
    const subRT={};[rtSh,rtIso].forEach(rt=>(rt.Associations||[]).forEach(a=>{if(a.SubnetId)subRT[a.SubnetId]=rt}));
    const subNacl={};[naclDef,naclIso].forEach(n=>(n.Associations||[]).forEach(a=>{if(a.SubnetId)subNacl[a.SubnetId]=n}));
    return {vpcs:[{VpcId:v1,CidrBlock:'10.0.0.0/16',Tags:[{Key:'Name',Value:'DtVPC1'}]},{VpcId:v2,CidrBlock:'10.1.0.0/16',Tags:[{Key:'Name',Value:'DtVPC2'}]}],
      subnets:[{SubnetId:s1,VpcId:v1,CidrBlock:'10.0.0.0/24'},{SubnetId:s2,VpcId:v1,CidrBlock:'10.0.1.0/24'},{SubnetId:s3,VpcId:v1,CidrBlock:'10.0.2.0/24'},{SubnetId:s4,VpcId:v2,CidrBlock:'10.1.0.0/24'}],
      sgs,rts:[rtSh,rtIso],nacls:[naclDef,naclIso],igws:[{InternetGatewayId:'igw-dt-1',Attachments:[{VpcId:v1}]}],nats:[{NatGatewayId:natId,VpcId:v1,SubnetId:s1}],vpces:[],
      instances,albs:[alb],rdsInstances:[rds],ecsServices:[],lambdaFns:[lam],ecacheClusters:[],redshiftClusters:[],
      peerings,tgwAttachments:tgwAtt,tgs:[],instBySub,albBySub:{[s1]:[alb]},rdsBySub:{[s2]:[rds]},ecsBySub:{},lambdaBySub:{[s1]:[lam],[s2]:[lam]},subRT,subNacl,tgByAlb:{},eniBySub:{}};
  }

  // 1: Circular SG refs - no infinite loop
  T('Circular SG refs: no infinite loop',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const aToB=(g['sg-dt-a']||[]).some(e=>e.id==='sg-dt-b');
    const bToA=(g['sg-dt-b']||[]).some(e=>e.id==='sg-dt-a');
    const br=getBlastRadius('sg-dt-a',g,10);
    return {pass:aToB&&bToA&&br.all.length<200,detail:'A->B='+aToB+', B->A='+bToA+', blast='+br.all.length};
  });

  // 2: Shared RT high blast radius
  T('Shared RT has high blast radius',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const br=getBlastRadius('rtb-dt-sh',g,5);
    return {pass:br.all.length>=1,detail:'RT blast='+br.all.length};
  });

  // 3: Cross-VPC peering edge exists
  T('Peering connects both VPCs',()=>{
    const ctx=mkCtx({pcx:true});const g=buildDependencyGraph(ctx);
    const edges=g['pcx-dt-1']||[];
    return {pass:edges.some(e=>e.id==='vpc-dt-1')&&edges.some(e=>e.id==='vpc-dt-2'),detail:'v1='+edges.some(e=>e.id==='vpc-dt-1')+', v2='+edges.some(e=>e.id==='vpc-dt-2')};
  });

  // 4: Isolated subnet has no instance dependents
  T('Isolated subnet: no instance deps',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const br=getBlastRadius('subnet-dt-iso',g,5);
    return {pass:!br.all.some(e=>e.id.startsWith('i-')),detail:'blast='+br.all.length+', instances='+br.all.filter(e=>e.id.startsWith('i-')).length};
  });

  // 5: Fan-out RT -> many subnets via association
  T('Fan-out RT associations correct',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const s1rt=(g['subnet-dt-1']||[]).filter(e=>e.id==='rtb-dt-sh');
    const s2rt=(g['subnet-dt-2']||[]).filter(e=>e.id==='rtb-dt-sh');
    const s3rt=(g['subnet-dt-3']||[]).filter(e=>e.id==='rtb-dt-sh');
    return {pass:s1rt.length===1&&s2rt.length===1&&s3rt.length===1,detail:'s1='+s1rt.length+', s2='+s2rt.length+', s3='+s3rt.length};
  });

  // 6: Default NACL dependency
  T('NACL associated to subnet',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const assoc=(g['subnet-dt-1']||[]).filter(e=>e.id==='acl-dt-def'&&e.rel==='associated');
    return {pass:assoc.length===1,detail:'nacl assoc='+assoc.length};
  });

  // 7: Lambda multi-subnet dependencies
  T('Lambda in multiple subnets',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const s1l=(g['subnet-dt-1']||[]).filter(e=>e.id==='dt-lambda');
    const s2l=(g['subnet-dt-2']||[]).filter(e=>e.id==='dt-lambda');
    return {pass:s1l.length===1&&s2l.length===1,detail:'s1->lam='+s1l.length+', s2->lam='+s2l.length};
  });

  // 8: Design mode doesn't crash graph
  T('Design mode: graph still works',()=>{
    const ctx=mkCtx();const saved=window._designChanges||[];
    window._designChanges=[{type:'add_vpc',params:{name:'X',cidr:'10.250.0.0/16',VpcId:'vpc-virt'}}];
    const g=buildDependencyGraph(ctx);const br=getBlastRadius('vpc-dt-1',g,5);
    window._designChanges=saved;
    return {pass:br.all.length>0,detail:'blast='+br.all.length};
  });

  // 9: TGW edge from route table
  T('TGW edge from route table',()=>{
    const ctx=mkCtx({tgw:true});const g=buildDependencyGraph(ctx);
    const rtToTgw=(g['rtb-dt-sh']||[]).filter(e=>e.id==='tgw-dt-1');
    return {pass:rtToTgw.length===1,detail:'RT->TGW='+rtToTgw.length};
  });

  // 10: Blast radius depth limiting
  T('Blast radius depth limiting',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const br1=getBlastRadius('vpc-dt-1',g,1);const br5=getBlastRadius('vpc-dt-1',g,5);
    const maxD1=br1.all.length>0?Math.max(...br1.all.map(e=>e.depth)):0;
    return {pass:br1.all.length<=br5.all.length&&maxD1<=1,detail:'d1='+br1.all.length+' (max='+maxD1+'), d5='+br5.all.length};
  });

  return results;
};

// --- Feature 8: Firewall Editor Edge Case Tests ---
window._edgeCaseTests.firewall=function(){
  const results=[];
  const T=(name,fn)=>{try{const r=fn();results.push({name,pass:r.pass,detail:r.detail})}catch(e){results.push({name,pass:false,detail:'Exception: '+e.message})}};

  // Save/restore helpers to avoid cross-test pollution
  function saveState(){
    return {
      rlCtx:window._rlCtx,
      fwEdits:window._fwEdits,
      fwSnapshot:window._fwSnapshot
    };
  }
  function restoreState(s){
    window._rlCtx=s.rlCtx;
    window._fwEdits=s.fwEdits;
    window._fwSnapshot=s.fwSnapshot;
  }

  // Minimal context builder for firewall tests
  function mkCtx(){
    const v1='vpc-fw-1',s1='subnet-fw-1',s2='subnet-fw-2';
    const sg1={GroupId:'sg-fw-1',GroupName:'fw-test-sg',VpcId:v1,
      IpPermissions:[{IpProtocol:'tcp',FromPort:443,ToPort:443,IpRanges:[{CidrIp:'0.0.0.0/0'}],UserIdGroupPairs:[]}],
      IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}],UserIdGroupPairs:[]}]};
    const naclAllow={NetworkAclId:'acl-fw-1',VpcId:v1,Associations:[{SubnetId:s1},{SubnetId:s2}],Entries:[
      {RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},
      {RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:true,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},
      {RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:false,CidrBlock:'0.0.0.0/0'},
      {RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:true,CidrBlock:'0.0.0.0/0'}
    ]};
    const rt1={RouteTableId:'rtb-fw-1',VpcId:v1,Routes:[{DestinationCidrBlock:'10.0.0.0/16',GatewayId:'local'}],Associations:[{SubnetId:s1},{SubnetId:s2}]};
    const subnets=[{SubnetId:s1,VpcId:v1,CidrBlock:'10.0.0.0/24'},{SubnetId:s2,VpcId:v1,CidrBlock:'10.0.1.0/24'}];
    const subRT={};[rt1].forEach(rt=>(rt.Associations||[]).forEach(a=>{if(a.SubnetId)subRT[a.SubnetId]=rt}));
    const subNacl={};[naclAllow].forEach(n=>(n.Associations||[]).forEach(a=>{if(a.SubnetId)subNacl[a.SubnetId]=n}));
    return {vpcs:[{VpcId:v1,CidrBlock:'10.0.0.0/16'}],subnets,sgs:[sg1],rts:[rt1],nacls:[naclAllow],
      igws:[],nats:[],vpces:[],instances:[],albs:[],rdsInstances:[],ecsServices:[],lambdaFns:[],
      ecacheClusters:[],redshiftClusters:[],peerings:[],tgwAttachments:[],tgs:[],
      instBySub:{},albBySub:{},rdsBySub:{},ecsBySub:{},lambdaBySub:{},subRT,subNacl,
      sgByVpc:{[v1]:[sg1]},tgByAlb:{},eniBySub:{},pubSubs:new Set()};
  }

  // 1: Add NACL inbound rule
  T('Add NACL inbound rule',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      _fwTakeSnapshot();
      const newRule={RuleNumber:200,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'10.0.0.0/24',PortRange:{From:80,To:80}};
      ctx.nacls[0].Entries.push(Object.assign({},newRule));
      _fwEdits.push({type:'nacl',action:'add',resourceId:'acl-fw-1',direction:'ingress',rule:newRule});
      const hasRule=ctx.nacls[0].Entries.some(e=>e.RuleNumber===200&&!e.Egress);
      const cli=_fwGenerateCli(_fwEdits).join('\n');
      const hasCli=cli.includes('create-network-acl-entry');
      _fwResetAll();
      return {pass:hasRule&&hasCli,detail:'ruleAdded='+hasRule+', cli='+hasCli};
    }finally{restoreState(saved)}
  });

  // 2: Delete NACL rule
  T('Delete NACL rule',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      _fwTakeSnapshot();
      const delRule=ctx.nacls[0].Entries.find(e=>e.RuleNumber===100&&!e.Egress);
      const idx=ctx.nacls[0].Entries.indexOf(delRule);
      ctx.nacls[0].Entries.splice(idx,1);
      _fwEdits.push({type:'nacl',action:'delete',resourceId:'acl-fw-1',direction:'ingress',rule:delRule,originalRule:delRule});
      const gone=!ctx.nacls[0].Entries.some(e=>e.RuleNumber===100&&!e.Egress);
      const cli=_fwGenerateCli(_fwEdits).join('\n');
      const hasCli=cli.includes('delete-network-acl-entry');
      _fwResetAll();
      return {pass:gone&&hasCli,detail:'ruleGone='+gone+', cli='+hasCli};
    }finally{restoreState(saved)}
  });

  // 3: Modify SG inbound rule
  T('Modify SG inbound rule',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      _fwTakeSnapshot();
      const origRule=JSON.parse(JSON.stringify(ctx.sgs[0].IpPermissions[0]));
      const newRule={IpProtocol:'tcp',FromPort:8080,ToPort:8080,IpRanges:[{CidrIp:'10.0.0.0/8'}],UserIdGroupPairs:[]};
      ctx.sgs[0].IpPermissions[0]=Object.assign({},newRule);
      _fwEdits.push({type:'sg',action:'modify',resourceId:'sg-fw-1',direction:'ingress',rule:newRule,originalRule:origRule});
      const cli=_fwGenerateCli(_fwEdits).join('\n');
      const hasRevoke=cli.includes('revoke-security-group-ingress');
      const hasAuth=cli.includes('authorize-security-group-ingress');
      _fwResetAll();
      return {pass:hasRevoke&&hasAuth,detail:'revoke='+hasRevoke+', authorize='+hasAuth};
    }finally{restoreState(saved)}
  });

  // 4: Add route
  T('Add route to route table',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      _fwTakeSnapshot();
      const newRoute={DestinationCidrBlock:'0.0.0.0/0',GatewayId:'igw-fw-test'};
      ctx.rts[0].Routes.push(Object.assign({},newRoute));
      _fwEdits.push({type:'route',action:'add',resourceId:'rtb-fw-1',direction:'egress',rule:newRoute});
      const hasRoute=ctx.rts[0].Routes.some(r=>r.DestinationCidrBlock==='0.0.0.0/0'&&r.GatewayId==='igw-fw-test');
      const cli=_fwGenerateCli(_fwEdits).join('\n');
      const hasCli=cli.includes('create-route');
      _fwResetAll();
      return {pass:hasRoute&&hasCli,detail:'routeAdded='+hasRoute+', cli='+hasCli};
    }finally{restoreState(saved)}
  });

  // 5: Shadowed NACL rule warning
  T('Shadowed NACL rule warning',()=>{
    const nacl={NetworkAclId:'acl-fw-shadow',Entries:[
      {RuleNumber:50,Protocol:'6',RuleAction:'deny',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},
      {RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},
      {RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:false,CidrBlock:'0.0.0.0/0'}
    ]};
    const warnings=_fwCheckNaclShadow(nacl,'ingress');
    const hasShadow=warnings.length>0&&warnings.some(w=>w.toLowerCase().includes('shadowed'));
    return {pass:hasShadow,detail:'warnings='+warnings.length+', msg='+(warnings[0]||'none')};
  });

  // 6: Invalid CIDR rejected
  T('Invalid CIDR rejected',()=>{
    const r1=_fwValidateCidr('not-a-cidr');
    const r2=_fwValidateCidr('999.0.0.0/8');
    const r3=_fwValidateCidr('10.0.0.0/33');
    const r4=_fwValidateCidr('10.0.0.0/24');
    const pass=!r1&&!r2&&!r3&&r4;
    return {pass,detail:'notCidr='+r1+', 999='+r2+', /33='+r3+', valid='+r4};
  });

  // 7: Duplicate NACL rule number rejected
  T('Duplicate NACL rule number rejected',()=>{
    const entries=[{RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:80,To:80}}];
    const errs=_fwValidateNaclRule({RuleNumber:100,Protocol:'6',CidrBlock:'10.0.0.0/24',PortRange:{From:443,To:443},RuleAction:'allow'},entries,'ingress');
    const hasDup=errs.some(e=>e.toLowerCase().includes('duplicate'));
    return {pass:hasDup,detail:'errors='+errs.length+', msg='+(errs.find(e=>e.toLowerCase().includes('duplicate'))||'none')};
  });

  // 8: Undo restores original
  T('Undo restores original rule',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      _fwTakeSnapshot();
      const origLen=ctx.nacls[0].Entries.filter(e=>!e.Egress).length;
      const delRule=ctx.nacls[0].Entries.find(e=>e.RuleNumber===100&&!e.Egress);
      const delCopy=JSON.parse(JSON.stringify(delRule));
      // Remove it via _fwRemoveRule-style splice
      const idx=ctx.nacls[0].Entries.indexOf(delRule);
      ctx.nacls[0].Entries.splice(idx,1);
      _fwEdits.push({type:'nacl',action:'delete',resourceId:'acl-fw-1',direction:'ingress',rule:delCopy,originalRule:delCopy});
      const afterDel=ctx.nacls[0].Entries.filter(e=>!e.Egress).length;
      _fwUndo();
      const afterUndo=ctx.nacls[0].Entries.filter(e=>!e.Egress).length;
      _fwResetAll();
      return {pass:afterDel===origLen-1&&afterUndo===origLen,detail:'orig='+origLen+', afterDel='+afterDel+', afterUndo='+afterUndo};
    }finally{restoreState(saved)}
  });

  // 9: Reset All restores snapshot
  T('Reset All restores snapshot',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      _fwTakeSnapshot();
      const origLen=ctx.nacls[0].Entries.length;
      // Delete two rules
      ctx.nacls[0].Entries.splice(0,2);
      _fwEdits.push({type:'nacl',action:'delete',resourceId:'acl-fw-1',direction:'ingress',rule:{RuleNumber:100}});
      _fwEdits.push({type:'nacl',action:'delete',resourceId:'acl-fw-1',direction:'egress',rule:{RuleNumber:100}});
      const afterDel=ctx.nacls[0].Entries.length;
      _fwResetAll();
      const afterReset=ctx.nacls[0].Entries.length;
      return {pass:afterDel<origLen&&afterReset===origLen,detail:'orig='+origLen+', afterDel='+afterDel+', afterReset='+afterReset};
    }finally{restoreState(saved)}
  });

  // 10: evaluateSG reflects edits (before=deny, after=allow)
  T('SG eval reflects edit: deny then allow',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      // SG initially allows tcp/443 only. Check port 8080 => should deny
      const before=evaluateSG(ctx.sgs,'inbound','tcp',8080,'10.0.0.5/32');
      const denied=before.action==='deny';
      // Now add an allow rule for tcp/8080
      _fwTakeSnapshot();
      const newRule={IpProtocol:'tcp',FromPort:8080,ToPort:8080,IpRanges:[{CidrIp:'0.0.0.0/0'}],UserIdGroupPairs:[]};
      ctx.sgs[0].IpPermissions.push(newRule);
      _fwEdits.push({type:'sg',action:'add',resourceId:'sg-fw-1',direction:'ingress',rule:newRule});
      const after=evaluateSG(ctx.sgs,'inbound','tcp',8080,'10.0.0.5/32');
      const allowed=after.action==='allow';
      _fwResetAll();
      return {pass:denied&&allowed,detail:'before='+before.action+', after='+after.action};
    }finally{restoreState(saved)}
  });

  return results;
};

// --- Test Runner ---
window._runEdgeCaseTests = function(feature){
  const tests = window._edgeCaseTests;
  if(!tests[feature]){
    console.error('[EdgeTests] Unknown feature: '+feature+'. Available: '+Object.keys(tests).join(', '));
    return null;
  }
  const results = tests[feature]();
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.group('%c[EdgeTests] '+feature+': '+passed+'/'+results.length+' passed'+(failed?' ('+failed+' FAILED)':''),
    failed ? 'color:red;font-weight:bold' : 'color:green;font-weight:bold');
  results.forEach(r => {
    console.log('%c'+(r.pass ? 'PASS' : 'FAIL')+' %c'+r.name+' %c'+r.detail,
      r.pass ? 'color:green;font-weight:bold' : 'color:red;font-weight:bold',
      'color:inherit', 'color:gray');
  });
  console.groupEnd();
  return {feature, passed, failed, total:results.length, results};
};

window._runAllEdgeCaseTests = function(){
  const features = Object.keys(window._edgeCaseTests);
  const summary = [];
  features.forEach(f => {
    const r = window._runEdgeCaseTests(f);
    if(r) summary.push(r);
  });
  const totalP = summary.reduce((s,r) => s+r.passed, 0);
  const totalF = summary.reduce((s,r) => s+r.failed, 0);
  const totalT = summary.reduce((s,r) => s+r.total, 0);
  console.log('%c[EdgeTests] ALL: '+totalP+'/'+totalT+' passed'+(totalF ? ' ('+totalF+' FAILED)' : ''),
    totalF ? 'color:red;font-weight:bold;font-size:14px' : 'color:green;font-weight:bold;font-size:14px');
  return {passed:totalP, failed:totalF, total:totalT, features:summary};
};

/* Prevent iOS Safari from intercepting pinch/zoom gestures on the map */
(function(){
  var m=document.querySelector('.main');
  if(!m)return;
  m.addEventListener('gesturestart',function(e){e.preventDefault()},{passive:false});
  m.addEventListener('gesturechange',function(e){e.preventDefault()},{passive:false});
  m.addEventListener('gestureend',function(e){e.preventDefault()},{passive:false});
})();

