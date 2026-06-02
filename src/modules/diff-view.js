// Pure diff-view helpers: value formatting, type labels, and the flat-row
// build + filter/sort pipeline for the compare dashboard. Extracted
// (logic-identical) from src/app-core.js #region DIFF MODE; the DOM rendering
// stays in app-core and calls these via window (Humify decomposition slice).
// Pinned by tests/unit/diff-view.test.mjs.

export function fmtDiffVal(v){
  if(v===undefined) return '∅';
  if(v===null) return 'null';
  if(typeof v==='boolean') return v?'true':'false';
  if(typeof v==='number') return String(v);
  if(typeof v==='string') return v.length>40?v.slice(0,37)+'...':v;
  if(Array.isArray(v)){
    if(!v.length) return '[]';
    var s=JSON.stringify(v);
    return s.length>50?'['+v.length+' items]':s;
  }
  var s=JSON.stringify(v);
  return s.length>50?'{...}':s;
}

export function fmtDiffValFull(v){
  if(v===undefined) return '∅';
  if(v===null) return 'null';
  if(typeof v==='boolean') return v?'true':'false';
  if(typeof v==='number') return String(v);
  if(typeof v==='string') return v;
  if(Array.isArray(v)) return JSON.stringify(v,null,1);
  return JSON.stringify(v,null,1);
}

export function diffTypeLabel(type){
  var labels={vpcs:'VPC',subnets:'Subnet',instances:'EC2 Instance',sgs:'Security Group',
    rts:'Route Table',nacls:'NACL',igws:'Internet Gateway',nats:'NAT Gateway',
    vpces:'VPC Endpoint',albs:'Load Balancer',rdsInstances:'RDS Instance',
    lambdaFns:'Lambda Function',ecsServices:'ECS Service',ecacheClusters:'ElastiCache Cluster',
    redshiftClusters:'Redshift Cluster',peerings:'VPC Peering'};
  return labels[type]||type;
}

const _CAT_ORDER={added:0,removed:1,modified:2,unchanged:3};

// Flattens computeDiff() output into table rows. `resolveVpc(item)` -> {id,name}
// is supplied by the caller (it reads live render context, which stays in app-core).
export function buildDiffFlatRows(diffResults, resolveVpc){
  if(!diffResults) return [];
  var rows=[];
  diffResults.added.forEach(function(item){
    var vpc=resolveVpc(item);
    rows.push({category:'added',type:item.type,key:item.key,name:item.name,vpcId:vpc.id,vpcName:vpc.name,fields:[],hasStructural:false,resource:item.resource,baseline:null});
  });
  diffResults.removed.forEach(function(item){
    var vpc=resolveVpc(item);
    rows.push({category:'removed',type:item.type,key:item.key,name:item.name,vpcId:vpc.id,vpcName:vpc.name,fields:[],hasStructural:false,resource:null,baseline:item.resource});
  });
  diffResults.modified.forEach(function(item){
    var vpc=resolveVpc(item);
    rows.push({category:'modified',type:item.type,key:item.key,name:item.name,vpcId:vpc.id,vpcName:vpc.name,fields:item.fields||[],hasStructural:item.hasStructural,resource:item.resource,baseline:item.baseline});
  });
  diffResults.unchanged.forEach(function(item){
    var vpc=resolveVpc(item);
    rows.push({category:'unchanged',type:item.type,key:item.key,name:item.name,vpcId:vpc.id,vpcName:vpc.name,fields:[],hasStructural:false,resource:null,baseline:null});
  });
  return rows;
}

// Applies the dashboard filter/search/sort state to flat rows. Pure.
export function filterSortDiffRows(rows, state){
  if(!rows) return [];
  var st=state;
  var filtered=rows.slice();
  if(st.catFilter!=='all') filtered=filtered.filter(function(r){return r.category===st.catFilter});
  if(st.typeFilter!=='all') filtered=filtered.filter(function(r){return r.type===st.typeFilter});
  if(st.vpcFilter!=='all') filtered=filtered.filter(function(r){return r.vpcId===st.vpcFilter});
  if(st.kindFilter!=='all'){
    filtered=filtered.filter(function(r){
      if(r.category!=='modified') return false;
      if(st.kindFilter==='structural') return r.fields.some(function(f){return f.kind==='structural'});
      if(st.kindFilter==='metadata') return r.fields.some(function(f){return f.kind==='metadata'});
      return true;
    });
  }
  if(st.search){
    var q=st.search.toLowerCase();
    filtered=filtered.filter(function(r){
      return r.name.toLowerCase().indexOf(q)!==-1||r.key.toLowerCase().indexOf(q)!==-1||r.type.toLowerCase().indexOf(q)!==-1||diffTypeLabel(r.type).toLowerCase().indexOf(q)!==-1||r.vpcName.toLowerCase().indexOf(q)!==-1||r.fields.some(function(f){return f.field.toLowerCase().indexOf(q)!==-1});
    });
  }
  if(st.sort!=='none'){
    filtered.sort(function(a,b){
      var cmp=0;
      if(st.sort==='status') cmp=(_CAT_ORDER[a.category]||9)-(_CAT_ORDER[b.category]||9);
      else if(st.sort==='type') cmp=diffTypeLabel(a.type).localeCompare(diffTypeLabel(b.type));
      else if(st.sort==='name') cmp=(a.name||'').localeCompare(b.name||'');
      else if(st.sort==='key') cmp=(a.key||'').localeCompare(b.key||'');
      else if(st.sort==='vpc') cmp=(a.vpcName||'').localeCompare(b.vpcName||'');
      else if(st.sort==='changes') cmp=(a.fields.length||0)-(b.fields.length||0);
      return st.sortDir==='desc'?-cmp:cmp;
    });
  }
  return filtered;
}
