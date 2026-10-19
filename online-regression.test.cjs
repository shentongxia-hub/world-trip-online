const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const net=require('node:net');
test('HTTP payments reject invalid transactions, deduplicate retries and preserve undo',async()=>{
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const child=spawn(process.execPath,['server.cjs'],{cwd:__dirname,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 const streams=[];
 try{
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('server exited '+code)));});
  const base='http://127.0.0.1:'+port;
  async function post(path,data){const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:response.status,...await response.json()};}
  const a=await post('/api/create',{name:'A'}),b=await post('/api/join?room='+a.code,{name:'B'}),auth=m=>'?room='+a.code+'&id='+m.id;
  for(const [i,m]of [a,b].entries()){const abort=new AbortController();streams.push(abort);await fetch(base+'/api/events'+auth(m),{signal:abort.signal});assert.equal((await post('/api/profile'+auth(m),{name:i?'B':'A',color:i?'#d84b48':'#3478ce',ready:true})).status,200);}
  assert.equal((await post('/api/start'+auth(a),{})).status,200);
  const state={turn:0,phase:'roll',players:[0,1].map(id=>({id,pos:0,cash:10,wallet:{10:1},out:false})),props:{},accounts:{},bankExchanges:{},notices:[],giftBalances:{}};
  assert.equal((await post('/api/snapshot'+auth(a),{epoch:2,snapshot:{state,busy:false,actor:0,financeVersion:0}})).status,200);
  const action=data=>post('/api/action'+auth(a),{kind:'local-money',operationId:randomUUID(),...data});
  const invalid=await action({from:-1,to:0,d:10});assert.equal(invalid.status,400);assert.equal(invalid.snapshot.state.players[0].cash,10);
  assert.equal((await action({from:1,to:0,d:10})).status,400);
  const operationId=randomUUID(),first=await action({operationId,from:0,to:1,d:10,record:{id:'fast-undo'},delta:{bank:90000}});
  assert.equal(first.status,200);assert.equal(first.snapshot.state.players[0].cash,0);assert.equal(first.snapshot.state.giftBalances['0:1'],10);
  const repeat=await action({operationId,from:0,to:1,d:10});assert.equal(repeat.financeVersion,first.financeVersion);
  const empty=await action({from:0,to:1,d:10});assert.equal(empty.status,400);assert.equal(empty.snapshot.state.players[0].wallet[10],0);
  const restored=await action({from:1,to:0,d:10,undo:true,undoRecordId:'fast-undo'});assert.equal(restored.status,200);assert.equal(restored.snapshot.state.players[0].cash,10);assert.equal(restored.snapshot.state.onlineUndo[0].length,0);
  const sync=await post('/api/action'+auth(a),{kind:'sync'});assert.equal(sync.financeVersion,2);
  const spin=await post('/api/action'+auth(a),{kind:'spin'});assert.equal(spin.status,200);assert.ok(spin.value>=1&&spin.value<=12);
 }finally{streams.forEach(s=>s.abort());child.kill();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));}
});
