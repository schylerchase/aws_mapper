// Pure search helpers: build the resource search index from a context, and
// filter it by query. Extracted (logic-identical) from app-core.js #region
// PROJECT IO & SEARCH; the overlay/results DOM stays in app-core and calls
// these via window. Pinned by tests/unit/search-index.test.mjs.

export function buildSearchIndex(ctx){
  var idx=[];
  var getName=function(obj,fallback){var t=(obj.Tags||[]).find(function(x){return x.Key==='Name'});return t?t.Value:fallback};
  (ctx.vpcs||[]).forEach(function(v){var n=getName(v,v.VpcId);idx.push({type:'VPC',name:n,id:v.VpcId,extra:v.CidrBlock||'',acct:v._accountLabel||v._accountId||'',searchStr:('vpc '+n+' '+v.VpcId+' '+(v.CidrBlock||'')).toLowerCase()})});
  (ctx.subnets||[]).forEach(function(s){var n=getName(s,s.SubnetId);idx.push({type:'Subnet',name:n,id:s.SubnetId,extra:s.CidrBlock||'',acct:s._accountLabel||s._accountId||'',searchStr:('subnet '+n+' '+s.SubnetId+' '+(s.CidrBlock||'')+' '+(s.AvailabilityZone||'')).toLowerCase()})});
  (ctx.instances||[]).forEach(function(i){var n=getName(i,i.InstanceId);idx.push({type:'EC2',name:n,id:i.InstanceId,extra:i.InstanceType||'',acct:i._accountLabel||i._accountId||'',searchStr:('ec2 '+n+' '+i.InstanceId+' '+(i.InstanceType||'')).toLowerCase()})});
  (ctx.igws||[]).forEach(function(g){var n=getName(g,g.InternetGatewayId);idx.push({type:'IGW',name:n,id:g.InternetGatewayId,extra:'',acct:g._accountLabel||g._accountId||'',searchStr:('igw '+n+' '+g.InternetGatewayId).toLowerCase()})});
  (ctx.nats||[]).forEach(function(g){var n=getName(g,g.NatGatewayId);idx.push({type:'NAT',name:n,id:g.NatGatewayId,extra:'',acct:g._accountLabel||g._accountId||'',searchStr:('nat '+n+' '+g.NatGatewayId).toLowerCase()})});
  (ctx.rdsInstances||[]).forEach(function(d){idx.push({type:'RDS',name:d.DBInstanceIdentifier,id:d.DBInstanceIdentifier,extra:d.Engine||'',acct:d._accountLabel||d._accountId||'',searchStr:('rds '+d.DBInstanceIdentifier).toLowerCase()})});
  (ctx.lambdaFns||[]).forEach(function(f){idx.push({type:'Lambda',name:f.FunctionName,id:f.FunctionName,extra:f.Runtime||'',acct:f._accountLabel||f._accountId||'',searchStr:('lambda '+f.FunctionName).toLowerCase()})});
  (ctx.sgs||[]).forEach(function(s){var n=s.GroupName||s.GroupId;idx.push({type:'SG',name:n,id:s.GroupId,extra:s.VpcId||'',acct:s._accountLabel||s._accountId||'',searchStr:('sg security group '+n+' '+s.GroupId).toLowerCase()})});
  return idx;
}

export function matchSearchIndex(index, query, limit){
  var matches=[];
  for(var i=0;i<index.length&&matches.length<limit;i++){
    if(index[i].searchStr.includes(query)) matches.push(index[i]);
  }
  return matches;
}
