// XLSX export generator - extracted from app-core.js
// Generates styled Excel workbooks for assessment reports
// Globals resolved at call time: XLSX (SheetJS), JSZip, _rptState, _rlCtx,
//   _complianceFindings, _budrAssessments, _budrFindings, _iamReviewData,
//   _inventoryData, _appRegistry, _classificationData, _rptEnabledModules,
//   _rptFilterByAccount, _rptGetAccountFilter, _rptAccountLabel, _rptTagName,
//   _rptSlugify, _showToast, downloadBlob, _buildComplianceView, _getTierGroups,
//   _buildInventoryData, _awsConsoleUrl, _matchAppResources, _autoDiscoverApps,
//   runClassificationEngine, prepareIAMReviewData, parseIAMData, safeParse, gv,
//   _EFFORT_MAP, _EFFORT_LABELS, _FW_LABELS, _TIER_META, _PRIORITY_KEYS,
//   _TIER_RPO_RTO, _RPT_MODULES

// === XLSX EXPORT (SheetJS) ===
var _sheetJSLoaded=false;
export function loadSheetJS(){
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
  return _tryLoad('libs/xlsx.bundle.min.js').catch(function(){
    return Promise.reject(new Error('SheetJS (libs/xlsx.bundle.min.js) not found. XLSX export requires this library in the app directory.'));
  });
}

const _XLSX_COLORS={
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

export function xlsxBorder(weight){
  weight=weight||'thin';
  var clr={rgb:_XLSX_COLORS.borderClr};
  return {top:{style:weight,color:clr},bottom:{style:weight,color:clr},
    left:{style:weight,color:clr},right:{style:weight,color:clr}};
}

export function xlsxHeaderStyle(){
  return {font:{bold:true,color:{rgb:_XLSX_COLORS.headerFg},name:'Calibri',sz:11},
    fill:{fgColor:{rgb:_XLSX_COLORS.headerBg}},
    alignment:{horizontal:'center',vertical:'center',wrapText:true},
    border:xlsxBorder('thin')};
}

function _xlsxSevStyle(sev){
  var fg={CRITICAL:_XLSX_COLORS.critFg,HIGH:_XLSX_COLORS.highFg,MEDIUM:_XLSX_COLORS.medFg,LOW:_XLSX_COLORS.lowFg};
  var bg={CRITICAL:_XLSX_COLORS.critBg,HIGH:_XLSX_COLORS.highBg,MEDIUM:_XLSX_COLORS.medBg,LOW:_XLSX_COLORS.lowBg};
  return {font:{bold:true,color:{rgb:fg[sev]||'000000'},name:'Calibri',sz:10},
    fill:{fgColor:{rgb:bg[sev]||'FFFFFF'}},
    alignment:{horizontal:'center',vertical:'center'},
    border:xlsxBorder()};
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
    border:xlsxBorder()};
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
    border:xlsxBorder()};
}

function _xlsxCellStyle(isStripe){
  var s={font:{name:'Calibri',sz:10,color:{rgb:'1E293B'}},
    alignment:{vertical:'center',wrapText:true},
    border:xlsxBorder()};
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
  var hdrStyle=xlsxHeaderStyle();
  headers.forEach(function(_,i){
    var addr=XLSX.utils.encode_cell({r:0,c:i});
    if(ws[addr]) ws[addr].s=hdrStyle;
  });
  // Style severity column — colored text + tinted fill (cache by value)
  if(typeof opts.sevCol==='number'){
    var _sevCache={};
    for(let r=1;r<data.length;r++){
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
    for(let r=1;r<data.length;r++){
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
    for(let r=1;r<data.length;r++){
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
  var _border=xlsxBorder();
  for(let r=1;r<data.length;r++){
    var sty=r%2===0?_cellStripe:_cellPlain;
    for(let c=0;c<headers.length;c++){
      var addr=XLSX.utils.encode_cell({r:r,c:c});
      if(ws[addr]&&!ws[addr].s) ws[addr].s=sty;
      else if(ws[addr]&&ws[addr].s&&!ws[addr].s.border) ws[addr].s.border=_border;
    }
  }
  // Apply hyperlinks (opts.links = [{r:rowIdx, c:colIdx, url:string}])
  if(opts.links&&opts.links.length){
    var linkStyle={font:{name:'Calibri',sz:10,color:{rgb:_XLSX_COLORS.linkFg},underline:true},
      alignment:{vertical:'center',wrapText:true},border:xlsxBorder()};
    var linkStripeStyle={font:{name:'Calibri',sz:10,color:{rgb:_XLSX_COLORS.linkFg},underline:true},
      fill:{fgColor:{rgb:_XLSX_COLORS.stripeBg}},alignment:{vertical:'center',wrapText:true},border:xlsxBorder()};
    opts.links.forEach(function(lk){
      var addr=XLSX.utils.encode_cell({r:lk.r+1,c:lk.c}); // +1 for header row
      if(ws[addr]&&lk.url){
        ws[addr].l={Target:lk.url,Tooltip:'Open in AWS Console'};
        ws[addr].s=(lk.r+1)%2===0?linkStripeStyle:linkStyle;
      }
    });
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
    border:xlsxBorder()}};
  for(let c=1;c<cols;c++){
    var a2=XLSX.utils.encode_cell({r:row,c:c});
    ws[a2]={v:'',t:'s',s:{fill:{fgColor:{rgb:_XLSX_COLORS.headerBg}},border:xlsxBorder()}};
  }
  if(cols>1) ws['!merges']=(ws['!merges']||[]).concat([{s:{r:row,c:0},e:{r:row,c:cols-1}}]);
}

function _xlsxSummaryRow(ws,row,label,value,cols){
  var lAddr=XLSX.utils.encode_cell({r:row,c:0});
  ws[lAddr]={v:label,t:'s',s:{font:{bold:true,sz:10,color:{rgb:_XLSX_COLORS.labelFg},name:'Calibri'},
    alignment:{vertical:'center'},border:xlsxBorder()}};
  var vAddr=XLSX.utils.encode_cell({r:row,c:1});
  var vType=typeof value==='number'?'n':'s';
  ws[vAddr]={v:value,t:vType,s:{font:{sz:10,color:{rgb:_XLSX_COLORS.valueFg},name:'Calibri'},
    alignment:{vertical:'center'},border:xlsxBorder()}};
  if(cols>2){
    for(let c=2;c<cols;c++){
      var a=XLSX.utils.encode_cell({r:row,c:c});
      ws[a]={v:'',t:'s',s:{border:xlsxBorder()}};
    }
  }
}

function _rptBuildXlsxSummary(wb, preFilteredFindings){
  var c=_rlCtx;
  var cols=4;
  var ws={};
  var r=0;
  var hasLogo=!!_rptState.logo;
  // When logo present, offset title/subtitle to col 1 so logo gets col 0
  var tCol=hasLogo?1:0;
  // Title row — merged across columns (skip col 0 when logo present)
  var titleAddr=XLSX.utils.encode_cell({r:r,c:tCol});
  ws[titleAddr]={v:_rptState.title||'AWS Infrastructure Assessment',t:'s',
    s:{font:{bold:true,sz:18,color:{rgb:_XLSX_COLORS.titleFg},name:'Calibri'},
      alignment:{vertical:'center'},border:{bottom:{style:'medium',color:{rgb:_XLSX_COLORS.headerBg}}}}};
  for(let cc=tCol+1;cc<cols;cc++){
    ws[XLSX.utils.encode_cell({r:r,c:cc})]={v:'',t:'s',
      s:{border:{bottom:{style:'medium',color:{rgb:_XLSX_COLORS.headerBg}}}}};
  }
  if(hasLogo){
    // Empty styled cell under logo so bottom border is consistent
    ws[XLSX.utils.encode_cell({r:r,c:0})]={v:'',t:'s',
      s:{border:{bottom:{style:'medium',color:{rgb:_XLSX_COLORS.headerBg}}}}};
  }
  ws['!merges']=[{s:{r:0,c:tCol},e:{r:0,c:cols-1}}];
  // Row height: taller when logo present (logo is 0.5" = 36pt)
  ws['!rows']=[{hpx:hasLogo?42:30}];
  r++;
  // Subtitle row
  var subParts=[];
  if(_rptState.author) subParts.push('Prepared by '+_rptState.author);
  subParts.push(_rptState.date||new Date().toISOString().slice(0,10));
  var subAddr=XLSX.utils.encode_cell({r:r,c:tCol});
  ws[subAddr]={v:subParts.join('  |  '),t:'s',
    s:{font:{sz:10,color:{rgb:_XLSX_COLORS.subtitleFg},name:'Calibri',italic:true},
      alignment:{vertical:'center'}}};
  for(let cc=tCol+1;cc<cols;cc++) ws[XLSX.utils.encode_cell({r:r,c:cc})]={v:'',t:'s'};
  ws['!merges'].push({s:{r:r,c:tCol},e:{r:r,c:cols-1}});
  r+=2;
  // Infrastructure Overview section
  if(c){
    _xlsxSummarySection(ws,r,'INFRASTRUCTURE OVERVIEW',cols);r++;
    var counts=[['VPCs',(c.vpcs||[]).length],['Subnets',(c.subnets||[]).length],
      ['EC2 Instances',(c.instances||[]).length],['RDS Databases',(c.rdsInstances||[]).length],
      ['Load Balancers',(c.albs||[]).length],['ECS Services',(c.ecsServices||[]).length],
      ['Lambda Functions',(c.lambdaFns||[]).length],['Security Groups',(c.sgs||[]).length]];
    // Two-column layout: resource pairs side by side
    for(let i=0;i<counts.length;i+=2){
      var lAddr=XLSX.utils.encode_cell({r:r,c:0});
      ws[lAddr]={v:counts[i][0],t:'s',s:{font:{bold:true,sz:10,color:{rgb:_XLSX_COLORS.labelFg},name:'Calibri'},border:xlsxBorder(),alignment:{vertical:'center'}}};
      var vAddr=XLSX.utils.encode_cell({r:r,c:1});
      ws[vAddr]={v:counts[i][1],t:'n',s:{font:{bold:true,sz:11,color:{rgb:_XLSX_COLORS.valueFg},name:'Calibri'},border:xlsxBorder(),alignment:{horizontal:'center',vertical:'center'}}};
      if(i+1<counts.length){
        var l2=XLSX.utils.encode_cell({r:r,c:2});
        ws[l2]={v:counts[i+1][0],t:'s',s:{font:{bold:true,sz:10,color:{rgb:_XLSX_COLORS.labelFg},name:'Calibri'},border:xlsxBorder(),alignment:{vertical:'center'}}};
        var v2=XLSX.utils.encode_cell({r:r,c:3});
        ws[v2]={v:counts[i+1][1],t:'n',s:{font:{bold:true,sz:11,color:{rgb:_XLSX_COLORS.valueFg},name:'Calibri'},border:xlsxBorder(),alignment:{horizontal:'center',vertical:'center'}}};
      }
      r++;
    }
    // Region row
    var regions=c._regions?Array.from(c._regions):[];
    if(regions.length){
      var regLabel=XLSX.utils.encode_cell({r:r,c:0});
      ws[regLabel]={v:'Regions',t:'s',s:{font:{bold:true,sz:10,color:{rgb:_XLSX_COLORS.labelFg},name:'Calibri'},border:xlsxBorder(),alignment:{vertical:'center'}}};
      var regVal=XLSX.utils.encode_cell({r:r,c:1});
      ws[regVal]={v:regions.join(', '),t:'s',s:{font:{sz:10,color:{rgb:_XLSX_COLORS.valueFg},name:'Calibri'},border:xlsxBorder(),alignment:{vertical:'center'}}};
      ws['!merges'].push({s:{r:r,c:1},e:{r:r,c:cols-1}});
      r++;
    }
    r++;
  }
  // Compliance Findings section (use pre-filtered if provided, otherwise account-filter)
  var _sumFindings=preFilteredFindings||_rptFilterByAccount(_complianceFindings||[],_rptGetAccountFilter());
  if(_sumFindings.length){
    _xlsxSummarySection(ws,r,'COMPLIANCE FINDINGS',cols);r++;
    _xlsxSummaryRow(ws,r,'Total Findings',_sumFindings.length,cols);r++;
    var sevs={CRITICAL:0,HIGH:0,MEDIUM:0,LOW:0};
    _sumFindings.forEach(function(f){sevs[f.severity]=(sevs[f.severity]||0)+1});
    ['CRITICAL','HIGH','MEDIUM','LOW'].forEach(function(s){
      var addr=XLSX.utils.encode_cell({r:r,c:0});
      ws[addr]={v:s,t:'s',s:_xlsxSevStyle(s)};
      var vAddr=XLSX.utils.encode_cell({r:r,c:1});
      ws[vAddr]={v:sevs[s],t:'n',s:{font:{bold:true,sz:11,color:{rgb:'0F172A'},name:'Calibri'},
        alignment:{horizontal:'center',vertical:'center'},border:xlsxBorder()}};
      for(let cc=2;cc<cols;cc++) ws[XLSX.utils.encode_cell({r:r,c:cc})]={v:'',t:'s',s:{border:xlsxBorder()}};
      r++;
    });
    // Framework breakdown
    r++;
    var fws=[].concat(Object.keys(_FW_LABELS));
    var fwHdr=XLSX.utils.encode_cell({r:r,c:0});
    ws[fwHdr]={v:'Framework',t:'s',s:xlsxHeaderStyle()};
    ws[XLSX.utils.encode_cell({r:r,c:1})]={v:'Findings',t:'s',s:xlsxHeaderStyle()};
    ws[XLSX.utils.encode_cell({r:r,c:2})]={v:'Critical',t:'s',s:xlsxHeaderStyle()};
    ws[XLSX.utils.encode_cell({r:r,c:3})]={v:'High',t:'s',s:xlsxHeaderStyle()};
    r++;
    fws.forEach(function(fw){
      var ff=_sumFindings.filter(function(f){return f.framework===fw});
      if(!ff.length) return;
      var isStripe=(r%2===0);
      ws[XLSX.utils.encode_cell({r:r,c:0})]={v:_FW_LABELS[fw]||fw,t:'s',s:_xlsxCellStyle(isStripe)};
      ws[XLSX.utils.encode_cell({r:r,c:1})]={v:ff.length,t:'n',s:{font:{bold:true,sz:10,name:'Calibri'},alignment:{horizontal:'center'},border:xlsxBorder(),fill:isStripe?{fgColor:{rgb:_XLSX_COLORS.stripeBg}}:undefined}};
      var critCt=ff.filter(function(f){return f.severity==='CRITICAL'}).length;
      var highCt=ff.filter(function(f){return f.severity==='HIGH'}).length;
      ws[XLSX.utils.encode_cell({r:r,c:2})]={v:critCt,t:'n',s:critCt>0?_xlsxSevStyle('CRITICAL'):_xlsxCellStyle(isStripe)};
      ws[XLSX.utils.encode_cell({r:r,c:3})]={v:highCt,t:'n',s:highCt>0?_xlsxSevStyle('HIGH'):_xlsxCellStyle(isStripe)};
      r++;
    });
    r++;
  }
  // BUDR section (account-filtered to match detail sheets)
  var _sumBudr=_rptFilterByAccount(_budrAssessments||[],_rptGetAccountFilter());
  if(_sumBudr.length){
    _xlsxSummarySection(ws,r,'BACKUP & DISASTER RECOVERY',cols);r++;
    _xlsxSummaryRow(ws,r,'Total Assessments',_sumBudr.length,cols);r++;
    var tc={protected:0,partial:0,at_risk:0};
    _sumBudr.forEach(function(a){if(a.profile&&tc[a.profile.tier]!==undefined)tc[a.profile.tier]++});
    [['Protected',tc.protected||0,'protected'],['Partial',tc.partial||0,'partial'],['At Risk',tc.at_risk||0,'at_risk']].forEach(function(t){
      ws[XLSX.utils.encode_cell({r:r,c:0})]={v:t[0],t:'s',s:_xlsxTierStyle(t[2])};
      ws[XLSX.utils.encode_cell({r:r,c:1})]={v:t[1],t:'n',s:{font:{bold:true,sz:11,name:'Calibri'},alignment:{horizontal:'center'},border:xlsxBorder()}};
      for(let cc=2;cc<cols;cc++) ws[XLSX.utils.encode_cell({r:r,c:cc})]={v:'',t:'s',s:{border:xlsxBorder()}};
      r++;
    });
  }
  // Set sheet range
  ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:r,c:cols-1}});
  // Column widths: narrow col A for logo when present, otherwise standard
  ws['!cols']=hasLogo?[{wch:14},{wch:24},{wch:16},{wch:16}]:[{wch:24},{wch:16},{wch:16},{wch:16}];
  // !rows already set above (taller when logo present)
  XLSX.utils.book_append_sheet(wb,ws,'Summary');
}

function _rptBuildXlsxCompliance(wb, preFiltered){
  var f=preFiltered||_rptFilterByAccount(_complianceFindings||[], _rptGetAccountFilter());
  if(!f||!f.length) return;
  var headers=['Account','Region','Priority','Effort','Severity','Framework','Control','CKV','Resource','Finding','Remediation'];
  var sorted=f.slice().sort(function(a,b){
    var ta=_classifyTier(a),tb=_classifyTier(b);
    if(ta!==tb) return(_PRIORITY_ORDER[ta]||9)-(_PRIORITY_ORDER[tb]||9);
    return (_SEV_ORDER[a.severity]||9)-(_SEV_ORDER[b.severity]||9);
  });
  var rows=sorted.map(function(x){
    var tier=_classifyTier(x);
    var effort=_EFFORT_LABELS[_getEffort(x)]||'Med';
    return [_rptAccountLabel(x._accountId)||'',x._region||'',_TIER_META[tier].name,effort,x.severity,_FW_LABELS[x.framework]||x.framework||'',x.control,
      x.ckv||'',x.resourceName||x.resource,x.message,x.remediation];
  });
  _xlsxAddSheet(wb,'Compliance',headers,rows,{sevCol:4,tierCol:2,effortCol:3,
    minWidths:[16,14,14,14,12,20,14,14,28,40,40]});
}

function _rptBuildXlsxBUDR(wb){
  var filteredBudr=_rptFilterByAccount(_budrAssessments||[], _rptGetAccountFilter());
  if(!filteredBudr.length) return;
  var headers=['Account','Region','VPC','Resource Type','Resource ID','Name','DR Tier','RTO','RPO','Backup Signals'];
  var tierOrder={at_risk:0,partial:1,protected:2};
  var sorted=filteredBudr.slice().sort(function(a,b){
    return (tierOrder[a.profile?a.profile.tier:'']||9)-(tierOrder[b.profile?b.profile.tier:'']||9);
  });
  var rows=sorted.map(function(a){
    var tier=a.profile?a.profile.tier:'unknown';
    var rto=a.profile?a.profile.rto:'N/A';
    var rpo=a.profile?a.profile.rpo:'N/A';
    var sigs=a.signals?Object.keys(a.signals).map(function(k){return k+': '+a.signals[k]}).join(', '):'';
    return [_rptAccountLabel(a._accountId||a.account)||'',a.region||'',a.vpcId||'',a.type,a.id,a.name||'',tier,rto,rpo,sigs];
  });
  var budrLinks=[];
  rows.forEach(function(row,ri){
    var region=row[1],type=row[3],id=row[4];
    var url=_awsConsoleUrl(type,id,region);
    if(url) budrLinks.push({r:ri,c:4,url:url});
  });
  _xlsxAddSheet(wb,'BUDR',headers,rows,{tierCol:6,
    minWidths:[16,14,16,16,24,20,14,10,10,40],links:budrLinks});
}

function _rptBuildXlsxInventory(wb){
  var c=_rlCtx;
  if(!c) return;
  var acctFilter=_rptGetAccountFilter();
  var headers=['Account','Region','VPC','Type','ID','Name','Configuration','State / AZ','Details'];
  var rows=[];
  var links=[];
  function _af(arr){
    if(!acctFilter||acctFilter==='all') return arr||[];
    return (arr||[]).filter(function(r){return (r._accountId||'')===acctFilter});
  }
  // Shared lookups
  var _invSubVpc={};(c.subnets||[]).forEach(function(s){if(s.SubnetId)_invSubVpc[s.SubnetId]=s.VpcId||''});
  var _invInstVpc={};(c.instances||[]).forEach(function(i){if(i.InstanceId)_invInstVpc[i.InstanceId]=i.VpcId||_invSubVpc[i.SubnetId]||''});
  function _a(r){return _rptAccountLabel(r._accountId)||''}
  function _r(r){return r._region||''}
  _af(c.vpcs).forEach(function(v){
    rows.push([_a(v),_r(v),v.VpcId,'VPC',v.VpcId,_rptTagName(v),v.CidrBlock,v.State||'available','']);
  });
  _af(c.subnets).forEach(function(s){
    var pub=c.pubSubs&&c.pubSubs.has(s.SubnetId)?'Public':'Private';
    rows.push([_a(s),_r(s),s.VpcId||'','Subnet',s.SubnetId,_rptTagName(s),s.CidrBlock,s.AvailabilityZone,pub]);
  });
  _af(c.instances).forEach(function(i){
    var state=i.State?i.State.Name:'';
    var az=i.Placement?i.Placement.AvailabilityZone:'';
    rows.push([_a(i),_r(i),i.VpcId||_invSubVpc[i.SubnetId]||'','EC2',i.InstanceId,_rptTagName(i),i.InstanceType,state,az]);
  });
  _af(c.rdsInstances).forEach(function(d){
    var vpc=(d.DBSubnetGroup&&d.DBSubnetGroup.VpcId)||'';
    rows.push([_a(d),_r(d),vpc,'RDS',d.DBInstanceIdentifier,d.DBInstanceIdentifier,d.Engine+' / '+d.DBInstanceClass,d.MultiAZ?'Multi-AZ':'Single-AZ',d.StorageType||'']);
  });
  _af(c.albs).forEach(function(a){
    rows.push([_a(a),_r(a),a.VpcId||'','ALB',a.LoadBalancerName||'',a.LoadBalancerName,a.Type||'application',a.Scheme||'',(a.AvailabilityZones||[]).length+' AZs']);
  });
  _af(c.ecsServices).forEach(function(s){
    var nc=s.networkConfiguration&&s.networkConfiguration.awsvpcConfiguration;
    var sid=nc&&nc.subnets&&nc.subnets[0]?nc.subnets[0]:'';
    rows.push([_a(s),_r(s),sid?_invSubVpc[sid]||'':'','ECS',s.serviceName||'',s.serviceName,s.launchType||'FARGATE',s.runningCount+'/'+s.desiredCount+' tasks','']);
  });
  _af(c.lambdaFns).forEach(function(fn){
    var vpc=(fn.VpcConfig&&fn.VpcConfig.VpcId)||'';
    rows.push([_a(fn),_r(fn),vpc,'Lambda',fn.FunctionName||'',fn.FunctionName,fn.Runtime||'',fn.MemorySize+'MB / '+fn.Timeout+'s','']);
  });
  _af(c.sgs).forEach(function(sg){
    var rules=(sg.IpPermissions||[]).length+' inbound, '+(sg.IpPermissionsEgress||[]).length+' outbound';
    rows.push([_a(sg),_r(sg),sg.VpcId||'','Security Group',sg.GroupId,sg.GroupName||_rptTagName(sg),rules,'','']);
  });
  _af(c.nacls).forEach(function(n){
    var entries=(n.Entries||[]).length+' rules';
    rows.push([_a(n),_r(n),n.VpcId||'','NACL',n.NetworkAclId,_rptTagName(n),entries,n.IsDefault?'Default':'Custom','']);
  });
  _af(c.rts).forEach(function(rt){
    var routes=(rt.Routes||[]).length+' routes';
    rows.push([_a(rt),_r(rt),rt.VpcId||'','Route Table',rt.RouteTableId,_rptTagName(rt),routes,'','']);
  });
  _af(c.volumes).forEach(function(v){
    var att=(v.Attachments||[])[0];
    var vpc=att?_invInstVpc[att.InstanceId]||'':'';
    rows.push([_a(v),_r(v),vpc,'EBS Volume',v.VolumeId,_rptTagName(v),v.VolumeType+' / '+v.Size+'GB',v.State||'',att?att.Device||'':'unattached']);
  });
  _af(c.snapshots).forEach(function(s){
    rows.push([_a(s),_r(s),'','EBS Snapshot',s.SnapshotId,_rptTagName(s),s.VolumeSize+'GB',s.State||'',s.Description||'']);
  });
  _af(c.enis).forEach(function(e){
    rows.push([_a(e),_r(e),e.VpcId||'','ENI',e.NetworkInterfaceId,_rptTagName(e),e.InterfaceType||'',e.Status||'',e.PrivateIpAddress||'']);
  });
  _af(c.igws).forEach(function(g){
    var att=(g.Attachments||[])[0];
    rows.push([_a(g),_r(g),att?att.VpcId||'':'','IGW',g.InternetGatewayId,_rptTagName(g),'',att?att.State||'':'detached','']);
  });
  _af(c.nats).forEach(function(n){
    rows.push([_a(n),_r(n),n.VpcId||'','NAT Gateway',n.NatGatewayId,_rptTagName(n),'',n.State||'',n.SubnetId||'']);
  });
  _af(c.vpces).forEach(function(ep){
    rows.push([_a(ep),_r(ep),ep.VpcId||'','VPC Endpoint',ep.VpcEndpointId,ep.ServiceName||'',ep.VpcEndpointType||'',ep.State||'','']);
  });
  _af(c.ecacheClusters).forEach(function(ec){
    rows.push([_a(ec),_r(ec),ec.VpcId||'','ElastiCache',ec.CacheClusterId,ec.CacheClusterId,ec.Engine+' / '+ec.CacheNodeType,ec.CacheClusterStatus||'',ec.NumCacheNodes+' nodes']);
  });
  _af(c.redshiftClusters).forEach(function(rs){
    rows.push([_a(rs),_r(rs),rs.VpcId||'','Redshift',rs.ClusterIdentifier,rs.ClusterIdentifier,rs.NodeType,rs.ClusterStatus||'',rs.NumberOfNodes+' nodes']);
  });
  _af(c.s3bk).forEach(function(b){
    rows.push([_a(b),_r(b),'','S3 Bucket',b.Name,b.Name,'','',b.CreationDate||'']);
  });
  (c.peerings||[]).forEach(function(p){
    var req=p.RequesterVpcInfo||{};var acc=p.AccepterVpcInfo||{};
    rows.push([_a(p),_r(p),req.VpcId||'','VPC Peering',p.VpcPeeringConnectionId,_rptTagName(p),req.CidrBlock+' <> '+acc.CidrBlock,p.Status?p.Status.Code:'','']);
  });
  (c.zones||[]).forEach(function(z){
    var recs=c.recsByZone&&c.recsByZone[z.Id]?c.recsByZone[z.Id].length:z.ResourceRecordSetCount||0;
    var vis=z.Config&&z.Config.PrivateZone?'private':'public';
    rows.push([_a(z),_r(z),'','Route 53',z.Id,z.Name||z.Id,recs+' records',vis,'']);
  });
  (c.wafAcls||[]).forEach(function(w){
    var ruleCount=(w.Rules||[]).length;
    rows.push([_a(w),_r(w),'','WAF',w.Id||w.Name,w.Name||w.Id||'',ruleCount+' rules','','']);
  });
  (c.cfDistributions||[]).forEach(function(cf){
    rows.push([_a(cf),_r(cf),'','CloudFront',cf.Id,cf.DomainName||cf.Id,cf.Status||'','','']);
  });
  (c.vpns||[]).forEach(function(v){
    rows.push([_a(v),_r(v),'','VPN',v.VpnConnectionId,_rptTagName(v)||(v.VpnConnectionId),v.Type||'',v.State||'','']);
  });
  (c.tgwAttachments||[]).forEach(function(t){
    rows.push([_a(t),_r(t),t.VpcId||'','TGW Attachment',t.TransitGatewayAttachmentId||t.TransitGatewayId||'',_rptTagName(t)||'',t.ResourceType||'',t.State||'','']);
  });
  (c.tgs||[]).forEach(function(tg){
    rows.push([_a(tg),_r(tg),tg.VpcId||'','Target Group',tg.TargetGroupName||'',tg.TargetGroupName||'',tg.Protocol+':'+tg.Port,tg.TargetType||'','']);
  });
  if(!rows.length) return;
  // Replace empty cells with "-" so XLSX has no blank gaps
  rows.forEach(function(row){for(let i=0;i<row.length;i++){if(row[i]==='')row[i]='-'}});
  // Generate hyperlinks for ID column (4) and VPC column (2)
  rows.forEach(function(row,ri){
    var region=row[1],type=row[3],id=row[4],vpc=row[2];
    var idUrl=_awsConsoleUrl(type,id,region);
    if(idUrl) links.push({r:ri,c:4,url:idUrl});
    if(vpc&&vpc!=='-'){var vUrl=_awsConsoleUrl('VPC',vpc,region);if(vUrl) links.push({r:ri,c:2,url:vUrl})}
  });
  _xlsxAddSheet(wb,'Inventory',headers,rows,{minWidths:[16,14,16,16,24,22,22,18,14],links:links});
}

function _rptBuildXlsxActionPlan(wb, preFiltered){
  var all=preFiltered||_rptFilterByAccount((_complianceFindings||[]).concat(_budrFindings||[]), _rptGetAccountFilter());
  if(!all.length) return;
  var headers=['Account','Region','Priority','Severity','Effort','Framework','Control','Resource','Finding',
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
        rows.push([_rptAccountLabel(f._accountId)||'',f._region||'',tierName,f.severity,_EFFORT_LABELS[effort]||effort,
          _FW_LABELS[f.framework]||f.framework||'',f.control,
          f.resourceName||f.resource,f.message,f.remediation,'','','Open']);
      });
    });
  });
  _xlsxAddSheet(wb,'Action Plan',headers,rows,{sevCol:3,tierCol:2,effortCol:4,
    minWidths:[16,14,14,12,14,20,14,28,40,40,14,14,12]});
}

// Inject company logo into XLSX zip (Summary sheet, top-right corner)
async function _xlsxInjectLogo(zip){
  var logo=_rptState.logo;
  if(!logo) return;
  try{
    var base64=logo.dataUri.split(',')[1];
    var binary=atob(base64);
    var bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
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
    // Fixed size: 1" x 0.5" in EMUs (1 inch = 914400 EMUs), anchored at A1
    var w=914400,h=457200;
    var aspect=logo.width/logo.height;
    if(aspect>2){h=w/aspect;}else if(aspect<2){w=h*aspect;}
    // Drawing XML — oneCellAnchor at A1 (col 0, row 0) with padding
    var drawXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'+
      '<xdr:oneCellAnchor>'+
      '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>76200</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from>'+
      '<xdr:ext cx="'+Math.round(w)+'" cy="'+Math.round(h)+'"/>'+
      '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>'+
      '<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/>'+
      '<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'+
      '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+Math.round(w)+'" cy="'+Math.round(h)+'"/></a:xfrm>'+
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>'+
      '</xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>';
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
  for(let i=0;i<sheetNames.length;i++){
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

export async function exportComplianceXlsx(opts){
  _showToast('Generating XLSX...');
  try{
    var XLSX=await loadSheetJS();
    var wb=XLSX.utils.book_new();
    // Filter findings by selected frameworks/severities/muted
    var view=_buildComplianceView({frameworks:opts.frameworks,severities:opts.severities,includeMuted:opts.includeMuted});
    var filtered=view.filtered;
    _rptBuildXlsxSummary(wb, filtered);
    _rptBuildXlsxCompliance(wb, filtered);
    _rptBuildXlsxActionPlan(wb, filtered);
    if(wb.SheetNames.length<1){_showToast('No data to export','error');return}
    var date=new Date().toISOString().slice(0,10);
    var fname='compliance-report-'+date+'.xlsx';
    var sheetNames=wb.SheetNames.slice();
    var wbBuf=XLSX.write(wb,{type:'array',bookType:'xlsx'});
    wb=null;
    await new Promise(function(r){setTimeout(r,0)});
    var blob=await _xlsxPostProcess(wbBuf,sheetNames);
    wbBuf=null;
    downloadBlob(blob,fname);
    blob=null;
    _showToast('Compliance report exported');
  }catch(e){
    console.error('Compliance XLSX export failed:',e);
    _showToast('Export failed: '+e.message,'error');
  }
}

// === FULL ASSESSMENT EXPORTS ===
export async function exportFullXlsx(){
  _showToast('Generating full assessment XLSX...');
  try{
    var XLSX=await loadSheetJS();
    var wb=XLSX.utils.book_new();
    _rptBuildXlsxSummary(wb);
    _rptBuildXlsxClassification(wb);
    _rptBuildXlsxAppSummary(wb);
    _rptBuildXlsxIAMReview(wb);
    _rptBuildXlsxCompliance(wb);
    _rptBuildXlsxFirewall(wb);
    _rptBuildXlsxBUDR(wb);
    _rptBuildXlsxActionPlan(wb);
    _rptBuildXlsxInventory(wb);
    if(wb.SheetNames.length<2){_showToast('No data to export','error');return}
    var date=new Date().toISOString().slice(0,10);
    var fname='full-assessment-'+date+'.xlsx';
    var sheetNames=wb.SheetNames.slice();
    var wbBuf=XLSX.write(wb,{type:'array',bookType:'xlsx'});
    wb=null;
    await new Promise(function(r){setTimeout(r,0)});
    var blob=await _xlsxPostProcess(wbBuf,sheetNames);
    wbBuf=null;
    downloadBlob(blob,fname);
    blob=null;
    _showToast('Full assessment exported');
  }catch(e){
    console.error('Full XLSX export failed:',e);
    _showToast('Export failed: '+e.message,'error');
  }
}

function _rptBuildXlsxAppSummary(wb){
  if(!_classificationData.length&&_rlCtx) runClassificationEngine(_rlCtx);
  if(typeof _autoDiscoverApps==='function') _autoDiscoverApps();
  if(!_appRegistry.length) return;
  var tierPri={critical:1,high:2,medium:3,low:4};
  var sumHeaders=['Application','Type','Criticality','Resources','RPO','RTO'];
  var sumRows=[];
  var detailRows=[];
  _appRegistry.forEach(function(app){
    var matched=_matchAppResources(app);
    var bestTier='low';
    matched.forEach(function(r){if((tierPri[r.tier]||99)<(tierPri[bestTier]||99)) bestTier=r.tier});
    var tier=app.tier||bestTier;
    var meta=_TIER_RPO_RTO[tier]||_TIER_RPO_RTO.low;
    sumRows.push([app.name,app.type||'',tier.toUpperCase(),matched.length,meta.rpo,meta.rto]);
    matched.forEach(function(r){
      detailRows.push([app.name,r.name,r.type,r.tier.toUpperCase(),r.vpcName||'',r.id]);
    });
  });
  sumRows.sort(function(a,b){return(tierPri[a[2].toLowerCase()]||99)-(tierPri[b[2].toLowerCase()]||99)});
  _xlsxAddSheet(wb,'App Summary',sumHeaders,sumRows,{tierCol:2,minWidths:[25,15,12,10,10,10]});
  // Detail sheet with tier styling and console links
  var detHeaders=['Application','Resource','Type','Tier','VPC','ID'];
  var detLinks=[];
  detailRows.forEach(function(row,ri){
    var type=row[2],id=row[5];
    var url=_awsConsoleUrl(type,id,'us-east-1');
    if(url) detLinks.push({r:ri,c:5,url:url});
  });
  _xlsxAddSheet(wb,'App Resources',detHeaders,detailRows,{tierCol:3,minWidths:[25,30,15,10,20,25],links:detLinks});
}

function _rptBuildXlsxIAMReview(wb){
  if(!_iamReviewData.length){
    var raw=safeParse(gv('in_iam'));
    if(raw){var p=parseIAMData(raw);if(p)prepareIAMReviewData(p)}
  }
  if(!_iamReviewData.length) return;
  var headers=['Name','Type','Admin','MFA','Console','Policies','Findings','Cross-Account Trusts','Created','Last Used'];
  var rows=_iamReviewData.slice().sort(function(a,b){
    if(a.isAdmin!==b.isAdmin) return a.isAdmin?-1:1;
    return b.findings.length-a.findings.length;
  }).map(function(r){
    return [r.name,r.type,r.isAdmin?'YES':'No',
      r.hasMFA?'Yes':'No',r.hasConsole?'Yes':'No',
      r.policies,r.findings.length,
      r.crossAccounts.length?r.crossAccounts.join(', '):'—',
      r.created?r.created.toISOString().split('T')[0]:'—',
      r.lastUsed?r.lastUsed.toISOString().split('T')[0]:'Never'];
  });
  _xlsxAddSheet(wb,'IAM Review',headers,rows,{minWidths:[24,10,10,8,10,10,10,28,14,14]});
  // Highlight admin cells (col 2) in red
  var wsName='IAM Review';
  var ws=wb.Sheets[wsName];
  if(!ws) return;
  for(let r=1;r<=rows.length;r++){
    var addr=XLSX.utils.encode_cell({r:r,c:2});
    if(ws[addr]&&String(ws[addr].v)==='YES'){
      ws[addr].s={font:{bold:true,color:{rgb:_XLSX_COLORS.critFg},name:'Calibri',sz:10},
        fill:{fgColor:{rgb:_XLSX_COLORS.critBg}},alignment:{horizontal:'center',vertical:'center'},
        border:xlsxBorder()};
    }
  }
}

function _rptBuildXlsxClassification(wb){
  if(!_classificationData||!_classificationData.length) return;
  var headers=['Resource ID','Name','Type','Tier','RPO','RTO','VPC','Auto-Classified'];
  var tierPri={critical:1,high:2,medium:3,low:4};
  var rows=_classificationData.slice().sort(function(a,b){
    return (tierPri[a.tier]||99)-(tierPri[b.tier]||99);
  }).map(function(r){
    var meta=_TIER_RPO_RTO[r.tier]||_TIER_RPO_RTO.low;
    return [r.id,r.name||'',r.type,
      r.tier?r.tier.charAt(0).toUpperCase()+r.tier.slice(1):'',
      meta.rpo||'',meta.rto||'',r.vpcName||r.vpcId||'',
      r.auto?'Auto':'Manual'];
  });
  _xlsxAddSheet(wb,'Classification',headers,rows,{tierCol:3,minWidths:[28,22,16,12,10,10,20,14]});
}

function _rptBuildXlsxFirewall(wb){
  var c=_rlCtx;
  if(!c) return;
  var acctFilter=_rptGetAccountFilter();
  function _af(arr){
    if(!acctFilter||acctFilter==='all') return arr||[];
    return (arr||[]).filter(function(r){return (r._accountId||'')===acctFilter});
  }
  // Security Groups
  var sgs=_af(c.sgs);
  if(sgs.length){
    var sgHeaders=['Account','Region','Group ID','Name','VPC','Inbound Rules','Outbound Rules','Open to Internet'];
    var sgRows=sgs.map(function(sg){
      var inbound=(sg.IpPermissions||[]).length;
      var outbound=(sg.IpPermissionsEgress||[]).length;
      var openNet=false;
      (sg.IpPermissions||[]).forEach(function(p){
        (p.IpRanges||[]).forEach(function(r){if(r.CidrIp==='0.0.0.0/0')openNet=true});
        (p.Ipv6Ranges||[]).forEach(function(r){if(r.CidrIpv6==='::/0')openNet=true});
      });
      return [_rptAccountLabel(sg._accountId)||'',sg._region||'',sg.GroupId,sg.GroupName||_rptTagName(sg),
        sg.VpcId||'',inbound,outbound,openNet?'YES':'No'];
    });
    _xlsxAddSheet(wb,'Security Groups',sgHeaders,sgRows,{minWidths:[16,14,22,22,22,14,14,16]});
    // Highlight open-to-internet cells in red
    var ws=wb.Sheets['Security Groups'];
    if(ws){
      for(let r=1;r<=sgRows.length;r++){
        var addr=XLSX.utils.encode_cell({r:r,c:7});
        if(ws[addr]&&String(ws[addr].v)==='YES'){
          ws[addr].s={font:{bold:true,color:{rgb:_XLSX_COLORS.critFg},name:'Calibri',sz:10},
            fill:{fgColor:{rgb:_XLSX_COLORS.critBg}},alignment:{horizontal:'center',vertical:'center'},
            border:xlsxBorder()};
        }
      }
    }
  }
  // NACLs
  var nacls=_af(c.nacls);
  if(nacls.length){
    var naclHeaders=['Account','Region','NACL ID','Name','VPC','Rules','Default','Subnets'];
    var naclRows=nacls.map(function(n){
      var subs=(n.Associations||[]).map(function(a){return a.SubnetId}).filter(Boolean).join(', ');
      return [_rptAccountLabel(n._accountId)||'',n._region||'',n.NetworkAclId,_rptTagName(n),
        n.VpcId||'',(n.Entries||[]).length,n.IsDefault?'Yes':'No',subs||'—'];
    });
    _xlsxAddSheet(wb,'NACLs',naclHeaders,naclRows,{minWidths:[16,14,22,22,22,10,10,30]});
  }
  // Route Tables
  var rts=_af(c.rts);
  if(rts.length){
    var rtHeaders=['Account','Region','Route Table ID','Name','VPC','Routes','Subnets'];
    var rtRows=rts.map(function(rt){
      var subs=(rt.Associations||[]).filter(function(a){return a.SubnetId}).map(function(a){return a.SubnetId}).join(', ');
      return [_rptAccountLabel(rt._accountId)||'',rt._region||'',rt.RouteTableId,_rptTagName(rt),
        rt.VpcId||'',(rt.Routes||[]).length,subs||'(main)'];
    });
    _xlsxAddSheet(wb,'Route Tables',rtHeaders,rtRows,{minWidths:[16,14,22,22,22,10,30]});
  }
}

export async function generateXlsx(){
  var btn=document.getElementById('rptExportXLSX');
  if(btn){btn.textContent='Loading...';btn.disabled=true;}
  try{
    await loadSheetJS();
    var enabled=_rptEnabledModules();
    if(!enabled.length){_showToast('No sections enabled');return;}
    var wb=XLSX.utils.book_new();
    _rptBuildXlsxSummary(wb);
    if(enabled.indexOf('classification')>=0) _rptBuildXlsxClassification(wb);
    if(enabled.indexOf('compliance')>=0) _rptBuildXlsxCompliance(wb);
    if(enabled.indexOf('budr')>=0) _rptBuildXlsxBUDR(wb);
    if(enabled.indexOf('iam-review')>=0) _rptBuildXlsxIAMReview(wb);
    if(enabled.indexOf('firewall')>=0) _rptBuildXlsxFirewall(wb);
    if(enabled.indexOf('inventory')>=0) _rptBuildXlsxInventory(wb);
    if(enabled.indexOf('action-plan')>=0) _rptBuildXlsxActionPlan(wb);
    if(enabled.indexOf('app-summary')>=0) _rptBuildXlsxAppSummary(wb);
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
