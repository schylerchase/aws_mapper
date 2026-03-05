// DOCX export generator - extracted from app-core.js
// Generates OOXML .docx documents for assessment reports
// Globals resolved at call time: _rptEnabledModules, _rptState, _showToast,
//   downloadBlob, _rptSlugify, JSZip, _RPT_MODULES, _rlCtx, _complianceFindings,
//   _budrAssessments, _budrFindings, _iamReviewData, _inventoryData, _appRegistry,
//   _rptFilterByAccount, _rptGetAccountFilter, _rptTagName, _FW_LABELS, _SEV_ORDER,
//   _PRIORITY_KEYS, _TIER_META, _TIER_RPO_RTO, _getTierGroups, _matchAppResources,
//   _buildInventoryData, safeParse, gv, parseIAMData, prepareIAMReviewData

export async function generateDocx(tone){
  var btn=document.getElementById('rptExportDOCX');
  if(btn){btn.textContent='Generating...';btn.disabled=true;}
  try{
    var enabled=_rptEnabledModules();
    if(!enabled.length){_showToast('No sections enabled');return;}
    var isExec=(tone==='executive');
    var title=_rptState.title||'AWS Infrastructure Assessment';
    var author=_rptState.author||'';
    var date=_rptState.date||new Date().toISOString().slice(0,10);
    var body=_docxBuildBody(enabled,isExec,title,author,date);
    var stylesXml=_docxStyles();
    var docXml=_docxWrap(body);
    var zip=new JSZip();
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
      '<Default Extension="xml" ContentType="application/xml"/>'+
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'+
      '</Types>');
    zip.file('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'+
      '</Relationships>');
    zip.file('word/document.xml',docXml);
    zip.file('word/styles.xml',stylesXml);
    zip.file('word/_rels/document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+
      '</Relationships>');
    var blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    var slug=_rptSlugify(title);
    downloadBlob(blob,slug+'-'+tone+'-'+date+'.docx');
    _showToast('DOCX report exported ('+tone+')');
  }catch(e){
    console.error('DOCX export failed:',e);
    _showToast('DOCX export failed: '+e.message);
  }finally{
    if(btn){btn.textContent='Export DOCX';btn.disabled=false;}
  }
}

function _docxEsc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

function _docxP(text,style){
  var pPr=style?'<w:pPr><w:pStyle w:val="'+style+'"/></w:pPr>':'';
  return '<w:p>'+pPr+'<w:r><w:t xml:space="preserve">'+_docxEsc(text)+'</w:t></w:r></w:p>';
}

function _docxBoldP(label,value){
  return '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">'+_docxEsc(label)+': </w:t></w:r>'+
    '<w:r><w:t xml:space="preserve">'+_docxEsc(value)+'</w:t></w:r></w:p>';
}

function _docxTableRow(cells,isHeader){
  var h='<w:tr>';
  cells.forEach(function(c){
    h+='<w:tc><w:tcPr>';
    if(isHeader) h+='<w:shd w:val="clear" w:fill="1B2A4A"/>';
    h+='</w:tcPr><w:p><w:r>';
    if(isHeader) h+='<w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="18"/></w:rPr>';
    else h+='<w:rPr><w:sz w:val="18"/></w:rPr>';
    h+='<w:t xml:space="preserve">'+_docxEsc(c)+'</w:t></w:r></w:p></w:tc>';
  });
  return h+'</w:tr>';
}

function _docxTable(headers,rows,maxRows){
  if(maxRows&&rows.length>maxRows) rows=rows.slice(0,maxRows);
  var h='<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>'+
    '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D1D5DB"/>'+
    '<w:left w:val="single" w:sz="4" w:color="D1D5DB"/>'+
    '<w:bottom w:val="single" w:sz="4" w:color="D1D5DB"/>'+
    '<w:right w:val="single" w:sz="4" w:color="D1D5DB"/>'+
    '<w:insideH w:val="single" w:sz="4" w:color="D1D5DB"/>'+
    '<w:insideV w:val="single" w:sz="4" w:color="D1D5DB"/>'+
    '</w:tblBorders></w:tblPr>';
  h+=_docxTableRow(headers,true);
  rows.forEach(function(r){h+=_docxTableRow(r,false)});
  h+='</w:tbl>';
  return h;
}

function _docxBuildBody(enabled,isExec,title,author,date){
  var h='';
  // Title page
  h+=_docxP(title,'Title');
  var sub=[];
  if(author) sub.push('Prepared by '+author);
  sub.push(date);
  sub.push(isExec?'Executive Summary':'Technical Assessment');
  h+=_docxP(sub.join('  |  '),'Subtitle');
  h+='<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:color="1B2A4A"/></w:pBdr></w:pPr></w:p>';
  // TOC
  h+=_docxP('Table of Contents','Heading1');
  enabled.forEach(function(id,i){
    var m=_RPT_MODULES.find(function(x){return x.id===id});
    if(m) h+=_docxP((i+1)+'. '+m.name,'TOCEntry');
  });
  h+='<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  // Sections
  enabled.forEach(function(id){
    if(id==='exec-summary') h+=_docxExecSummary(isExec);
    else if(id==='compliance') h+=_docxCompliance(isExec);
    else if(id==='budr') h+=_docxBUDR(isExec);
    else if(id==='iam-review') h+=_docxIAMReview(isExec);
    else if(id==='inventory') h+=_docxInventory(isExec);
    else if(id==='action-plan') h+=_docxActionPlan(isExec);
    else if(id==='app-summary') h+=_docxAppSummary(isExec);
    else if(id==='architecture') h+=_docxP('(Architecture diagram — see HTML report for interactive map)');
    else if(id==='iac-recs') h+=_docxIaCRecs(isExec);
  });
  // Footer
  h+=_docxP('');
  h+=_docxP('Generated by AWS Mapper — '+new Date().toLocaleString(),'Footer');
  return h;
}

function _docxExecSummary(isExec){
  var h=_docxP('Executive Summary','Heading1');
  var c=_rlCtx;
  if(!c) return h+_docxP('No infrastructure data loaded.');
  var counts=[['VPCs',(c.vpcs||[]).length],['Subnets',(c.subnets||[]).length],
    ['EC2 Instances',(c.instances||[]).length],['RDS Databases',(c.rdsInstances||[]).length],
    ['Load Balancers',(c.albs||[]).length],['Lambda Functions',(c.lambdaFns||[]).length],
    ['Security Groups',(c.sgs||[]).length],['ECS Services',(c.ecsServices||[]).length]];
  if(isExec){
    h+=_docxP('This report covers the AWS infrastructure assessment performed on '+(_rptState.date||'today')+'. The environment spans '+
      (c._regions?c._regions.size:1)+' region(s) with '+(c.vpcs||[]).length+' VPC(s) hosting '+
      ((c.instances||[]).length+(c.rdsInstances||[]).length+(c.lambdaFns||[]).length)+' compute/database resources.');
    h+=_docxP('');
    h+=_docxP('Infrastructure at a Glance','Heading2');
  }else{
    h+=_docxP('Infrastructure Overview','Heading2');
  }
  h+=_docxTable(['Resource Type','Count'],counts.map(function(x){return [x[0],String(x[1])]}));
  // Compliance summary
  var _dxFindings=_rptFilterByAccount(_complianceFindings||[], _rptGetAccountFilter());
  if(_dxFindings.length){
    h+=_docxP('');
    h+=_docxP('Security Posture','Heading2');
    var sevs={CRITICAL:0,HIGH:0,MEDIUM:0,LOW:0};
    _dxFindings.forEach(function(f){sevs[f.severity]=(sevs[f.severity]||0)+1});
    if(isExec){
      var total=_dxFindings.length;
      var critHigh=sevs.CRITICAL+sevs.HIGH;
      h+=_docxP(total+' compliance findings identified. '+critHigh+' are Critical or High severity and require immediate attention.');
    }
    h+=_docxTable(['Severity','Count'],
      [['CRITICAL',String(sevs.CRITICAL)],['HIGH',String(sevs.HIGH)],
       ['MEDIUM',String(sevs.MEDIUM)],['LOW',String(sevs.LOW)]]);
  }
  return h;
}

function _docxCompliance(isExec){
  var h=_docxP('Compliance Findings','Heading1');
  var f=_rptFilterByAccount(_complianceFindings||[], _rptGetAccountFilter());
  if(!f||!f.length) return h+_docxP('No compliance findings.');
  if(isExec){
    // Executive: only critical + high, summarized by framework
    h+=_docxP('The following summarizes compliance findings requiring management attention.');
    var fws={};
    f.forEach(function(x){
      var fw=_FW_LABELS[x.framework]||x.framework||'Other';
      if(!fws[fw]) fws[fw]={total:0,crit:0,high:0};
      fws[fw].total++;
      if(x.severity==='CRITICAL') fws[fw].crit++;
      if(x.severity==='HIGH') fws[fw].high++;
    });
    h+=_docxTable(['Framework','Total','Critical','High'],
      Object.keys(fws).map(function(k){return [k,String(fws[k].total),String(fws[k].crit),String(fws[k].high)]}));
    // Top critical findings
    var critFindings=f.filter(function(x){return x.severity==='CRITICAL'||x.severity==='HIGH'});
    if(critFindings.length){
      h+=_docxP('');h+=_docxP('Top Priority Findings','Heading2');
      var maxShow=Math.min(critFindings.length,15);
      h+=_docxTable(['Severity','Resource','Finding','Remediation'],
        critFindings.slice(0,maxShow).map(function(x){
          return [x.severity,x.resourceName||x.resource,x.message,x.remediation];
        }),maxShow);
      if(critFindings.length>maxShow) h+=_docxP('... and '+(critFindings.length-maxShow)+' more. See XLSX for full details.');
    }
  }else{
    // Technical: full table (capped at 500 for DOCX; use XLSX for complete data)
    h+=_docxP(f.length+' findings across all frameworks and severity levels.');
    var sorted=f.slice().sort(function(a,b){return (_SEV_ORDER[a.severity]||9)-(_SEV_ORDER[b.severity]||9)});
    var maxDocx=500;
    h+=_docxTable(['Severity','Framework','Control','Resource','Finding','Remediation'],
      sorted.slice(0,maxDocx).map(function(x){
        return [x.severity,_FW_LABELS[x.framework]||x.framework||'',x.control,
          x.resourceName||x.resource,x.message,x.remediation];
      }));
    if(sorted.length>maxDocx) h+=_docxP('Showing '+maxDocx+' of '+sorted.length+' findings. Export XLSX for the complete dataset.');
  }
  return h;
}

function _docxBUDR(isExec){
  var h=_docxP('Backup & Disaster Recovery','Heading1');
  var filteredBudr=_rptFilterByAccount(_budrAssessments||[], _rptGetAccountFilter());
  if(!filteredBudr.length) return h+_docxP('No BUDR assessments.');
  var tc={protected:0,partial:0,at_risk:0};
  filteredBudr.forEach(function(a){if(a.profile&&tc[a.profile.tier]!==undefined)tc[a.profile.tier]++});
  if(isExec){
    var atRisk=tc.at_risk||0;
    h+=_docxP(filteredBudr.length+' resources assessed for disaster recovery readiness. '+
      atRisk+' resource(s) are at risk with insufficient backup coverage.');
    h+=_docxTable(['DR Tier','Count'],[['Protected',String(tc.protected||0)],
      ['Partial',String(tc.partial||0)],['At Risk',String(tc.at_risk||0)]]);
    var risky=filteredBudr.filter(function(a){return a.profile&&a.profile.tier==='at_risk'});
    if(risky.length){
      h+=_docxP('');h+=_docxP('At-Risk Resources','Heading2');
      h+=_docxTable(['Type','Name','RTO','RPO'],
        risky.slice(0,20).map(function(a){
          return [a.type,a.name||a.id,a.profile.rto,a.profile.rpo];
        }));
    }
  }else{
    h+=_docxTable(['Tier','Count'],[['Protected',String(tc.protected||0)],
      ['Partial',String(tc.partial||0)],['At Risk',String(tc.at_risk||0)]]);
    h+=_docxP('');
    h+=_docxTable(['Type','Resource','Name','DR Tier','RTO','RPO'],
      filteredBudr.map(function(a){
        var tier=a.profile?a.profile.tier:'unknown';
        return [a.type,a.id,a.name||'',tier,
          a.profile?a.profile.rto:'N/A',a.profile?a.profile.rpo:'N/A'];
      }));
  }
  return h;
}

function _docxIAMReview(isExec){
  var h=_docxP('IAM Review','Heading1');
  if(!_iamReviewData.length){
    var raw=safeParse(gv('in_iam'));
    if(raw){var p=parseIAMData(raw);if(p)prepareIAMReviewData(p)}
  }
  if(!_iamReviewData.length) return h+_docxP('No IAM data available.');
  var admins=_iamReviewData.filter(function(r){return r.isAdmin});
  var crossAcct=_iamReviewData.filter(function(r){return r.crossAccounts.length>0});
  if(isExec){
    h+=_docxP(_iamReviewData.length+' IAM entities reviewed. '+admins.length+
      ' have administrative access. '+crossAcct.length+' have cross-account trust relationships.');
    if(admins.length){
      h+=_docxP('');h+=_docxP('Admin Access Entities','Heading2');
      h+=_docxTable(['Name','Type','Last Used'],
        admins.map(function(r){return [r.name,r.type,r.lastUsed?r.lastUsed.toISOString().split('T')[0]:'Never']}));
    }
  }else{
    h+=_docxBoldP('Total Entities',String(_iamReviewData.length));
    h+=_docxBoldP('Admins',String(admins.length));
    h+=_docxBoldP('Cross-Account',String(crossAcct.length));
    h+=_docxP('');
    h+=_docxTable(['Name','Type','Admin','MFA','Policies','Findings'],
      _iamReviewData.map(function(r){
        return [r.name,r.type,r.isAdmin?'YES':'No',r.hasMFA?'Yes':'No',
          String(r.policies),String(r.findings.length)];
      }));
  }
  return h;
}

function _docxInventory(isExec){
  var h=_docxP('Resource Inventory','Heading1');
  if(!_rlCtx) return h+_docxP('No data loaded.');
  if(!_inventoryData.length) _buildInventoryData();
  var filteredInv=_rptFilterByAccount(_inventoryData, _rptGetAccountFilter());
  if(isExec){
    // Executive: type summary only
    h+=_docxP('The environment contains '+filteredInv.length+' tracked resources across the following categories:');
    var typeCounts={};
    filteredInv.forEach(function(r){typeCounts[r.type]=(typeCounts[r.type]||0)+1});
    h+=_docxTable(['Resource Type','Count'],
      Object.keys(typeCounts).sort(function(a,b){return typeCounts[b]-typeCounts[a]})
        .map(function(k){return [k,String(typeCounts[k])]}));
  }else{
    // Technical: full resource table (same as xlsx Inventory columns)
    var c=_rlCtx;
    var acctF=_rptGetAccountFilter();
    function _daf(arr){
      if(!acctF||acctF==='all') return arr||[];
      return (arr||[]).filter(function(r){return (r._accountId||'')===acctF});
    }
    var rows=[];
    _daf(c.vpcs).forEach(function(v){rows.push(['VPC',v.VpcId,_rptTagName(v),v.CidrBlock])});
    _daf(c.subnets).forEach(function(s){rows.push(['Subnet',s.SubnetId,_rptTagName(s),s.CidrBlock])});
    _daf(c.instances).forEach(function(i){rows.push(['EC2',i.InstanceId,_rptTagName(i),i.InstanceType])});
    _daf(c.rdsInstances).forEach(function(d){rows.push(['RDS',d.DBInstanceIdentifier,d.DBInstanceIdentifier,d.Engine])});
    _daf(c.albs).forEach(function(a){rows.push(['ALB',a.LoadBalancerName||'',a.LoadBalancerName,a.Type||'application'])});
    _daf(c.lambdaFns).forEach(function(fn){rows.push(['Lambda',fn.FunctionName||'',fn.FunctionName,fn.Runtime||''])});
    _daf(c.sgs).forEach(function(sg){rows.push(['SG',sg.GroupId,sg.GroupName||'',sg.VpcId||''])});
    h+=_docxP(rows.length+' resources:');
    h+=_docxTable(['Type','ID','Name','Config'],rows);
  }
  return h;
}

function _docxActionPlan(isExec){
  var h=_docxP('Action Plan','Heading1');
  var acctF=_rptGetAccountFilter();
  var all=_rptFilterByAccount((_complianceFindings||[]).concat(_budrFindings||[]), acctF);
  if(!all.length) return h+_docxP('No action items.');
  var tiers=_getTierGroups(all);
  if(isExec){
    h+=_docxP('Remediation priorities organized by business impact:');
    _PRIORITY_KEYS.forEach(function(t){
      var rgs=tiers[t];if(!rgs) return;
      var meta=_TIER_META[t];
      var count=rgs.reduce(function(s,rg){return s+rg.findings.length},0);
      h+=_docxP('');
      h+=_docxP(meta.name+' ('+count+' items)','Heading2');
      h+=_docxP(meta.label||'');
      // Show top 5 per tier
      var shown=0;
      rgs.forEach(function(rg){
        rg.findings.forEach(function(f){
          if(shown>=5) return;
          h+=_docxBoldP(f.severity,f.message);
          shown++;
        });
      });
      if(count>5) h+=_docxP('... and '+(count-5)+' more items');
    });
  }else{
    var maxPerTier=200;
    _PRIORITY_KEYS.forEach(function(t){
      var rgs=tiers[t];if(!rgs) return;
      var meta=_TIER_META[t];
      h+=_docxP('');h+=_docxP(meta.name,'Heading2');
      var rows=[];
      rgs.forEach(function(rg){
        rg.findings.forEach(function(f){
          rows.push([f.severity,f.control,f.resourceName||f.resource,f.message,f.remediation]);
        });
      });
      var total=rows.length;
      h+=_docxTable(['Severity','Control','Resource','Finding','Remediation'],rows.slice(0,maxPerTier));
      if(total>maxPerTier) h+=_docxP('Showing '+maxPerTier+' of '+total+'. See XLSX for complete list.');
    });
  }
  return h;
}

function _docxAppSummary(isExec){
  var h=_docxP('Application Summary','Heading1');
  if(!_appRegistry.length) return h+_docxP('No applications defined.');
  var tierPri={critical:1,high:2,medium:3,low:4};
  if(isExec){
    h+=_docxP(_appRegistry.length+' applications registered in the environment:');
    var rows=_appRegistry.map(function(app){
      var matched=_matchAppResources(app);
      var tier=app.tier||'low';
      return [app.name,app.type||'',(tier).toUpperCase(),String(matched.length)];
    }).sort(function(a,b){return(tierPri[a[2].toLowerCase()]||99)-(tierPri[b[2].toLowerCase()]||99)});
    h+=_docxTable(['Application','Type','Criticality','Resources'],rows);
  }else{
    _appRegistry.forEach(function(app){
      var matched=_matchAppResources(app);
      var tier=app.tier||'low';
      var meta=_TIER_RPO_RTO[tier]||_TIER_RPO_RTO.low;
      h+=_docxP('');h+=_docxP(app.name+' ('+tier.toUpperCase()+')','Heading2');
      h+=_docxBoldP('Type',app.type||'N/A');
      h+=_docxBoldP('RPO',meta.rpo);
      h+=_docxBoldP('RTO',meta.rto);
      h+=_docxBoldP('Resources',String(matched.length));
      if(matched.length){
        h+=_docxTable(['Resource','Type','Tier','ID'],
          matched.map(function(r){return [r.name,r.type,r.tier.toUpperCase(),r.id]}));
      }
    });
  }
  return h;
}

function _docxIaCRecs(isExec){
  var h=_docxP('IaC Recommendations','Heading1');
  if(isExec) return h+_docxP('Infrastructure as Code recommendations are available in the detailed technical report.');
  h+=_docxP('Terraform and CloudFormation snippets for remediation are available in the HTML report.');
  return h;
}

function _docxWrap(body){
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" '+
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '+
    'xmlns:o="urn:schemas-microsoft-com:office:office" '+
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '+
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '+
    'xmlns:v="urn:schemas-microsoft-com:vml" '+
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '+
    'xmlns:w10="urn:schemas-microsoft-com:office:word" '+
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '+
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '+
    'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" '+
    'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" '+
    'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" '+
    'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '+
    'mc:Ignorable="w14 wp14">'+
    '<w:body>'+body+
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'+
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>'+
    '</w:sectPr></w:body></w:document>';
}

function _docxStyles(){
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">'+
      '<w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>'+
      '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr>'+
    '</w:style>'+
    '<w:style w:type="paragraph" w:styleId="Title">'+
      '<w:name w:val="Title"/><w:basedOn w:val="Normal"/>'+
      '<w:pPr><w:spacing w:after="80"/></w:pPr>'+
      '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="52"/><w:color w:val="1B2A4A"/></w:rPr>'+
    '</w:style>'+
    '<w:style w:type="paragraph" w:styleId="Subtitle">'+
      '<w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/>'+
      '<w:pPr><w:spacing w:after="200"/></w:pPr>'+
      '<w:rPr><w:i/><w:sz w:val="24"/><w:color w:val="64748B"/></w:rPr>'+
    '</w:style>'+
    '<w:style w:type="paragraph" w:styleId="Heading1">'+
      '<w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>'+
      '<w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/></w:pPr>'+
      '<w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="1B2A4A"/></w:rPr>'+
    '</w:style>'+
    '<w:style w:type="paragraph" w:styleId="Heading2">'+
      '<w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>'+
      '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/></w:pPr>'+
      '<w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="334155"/></w:rPr>'+
    '</w:style>'+
    '<w:style w:type="paragraph" w:styleId="TOCEntry">'+
      '<w:name w:val="TOC Entry"/><w:basedOn w:val="Normal"/>'+
      '<w:pPr><w:spacing w:after="40"/><w:ind w:left="360"/></w:pPr>'+
      '<w:rPr><w:sz w:val="22"/><w:color w:val="2563EB"/></w:rPr>'+
    '</w:style>'+
    '<w:style w:type="paragraph" w:styleId="Footer">'+
      '<w:name w:val="Footer Text"/><w:basedOn w:val="Normal"/>'+
      '<w:pPr><w:jc w:val="center"/><w:pBdr><w:top w:val="single" w:sz="4" w:color="D1D5DB"/></w:pBdr><w:spacing w:before="240"/></w:pPr>'+
      '<w:rPr><w:sz w:val="18"/><w:color w:val="94A3B8"/></w:rPr>'+
    '</w:style>'+
    '<w:style w:type="table" w:styleId="TableGrid">'+
      '<w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>'+
      '<w:top w:val="single" w:sz="4" w:color="D1D5DB"/>'+
      '<w:left w:val="single" w:sz="4" w:color="D1D5DB"/>'+
      '<w:bottom w:val="single" w:sz="4" w:color="D1D5DB"/>'+
      '<w:right w:val="single" w:sz="4" w:color="D1D5DB"/>'+
      '<w:insideH w:val="single" w:sz="4" w:color="D1D5DB"/>'+
      '<w:insideV w:val="single" w:sz="4" w:color="D1D5DB"/>'+
      '</w:tblBorders></w:tblPr></w:style>'+
    '</w:styles>';
}
