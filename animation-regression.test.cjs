const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
function observer(initial){
 const source=readFileSync(__dirname+'/bridge.js','utf8');
 const jobs=new Map(),frames=[];let next=0;
 const context={S:initial,lastRemoteMotion:null,renderOccupants(){frames.push(context.S.players.map(p=>p.pos));},document:{querySelectorAll:()=>[]},setTimeout(fn){jobs.set(++next,fn);return next;},clearTimeout(id){jobs.delete(id);}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('const visualPositions='),source.indexOf('function apply(')),context);
 return {context,frames,apply(value){context.prepareMovement(value);context.S=structuredClone(value.state);context.renderOccupants();},tick(){const [id,fn]=jobs.entries().next().value||[];if(fn){jobs.delete(id);fn();}return !!fn;}};
}
test('observer follows a supplied wrapping route without changing authoritative positions',()=>{
 const view=observer({players:[{id:0,pos:39},{id:1,pos:8}]});
 view.apply({state:{players:[{id:0,pos:2},{id:1,pos:8}]},movement:{id:'walk',who:0,positions:[0,1,2]}});
 assert.equal(view.frames.at(-1)[0],39);
 for(const expected of [0,1,2]){assert.ok(view.tick());assert.equal(view.frames.at(-1)[0],expected);assert.equal(view.context.S.players[0].pos,2);}
 assert.equal(view.tick(),false);
 view.apply({state:structuredClone(view.context.S),movement:{id:'walk',who:0,positions:[0,1,2]}});
 assert.equal(view.tick(),false);
});
test('refresh does not replay historical movement and a new move cancels the old timer',()=>{
 const fresh=observer(null),value={state:{players:[{id:0,pos:4}]},movement:{id:'old',who:0,positions:[1,2,3,4]}};
 fresh.apply(value);assert.equal(fresh.tick(),false);assert.equal(fresh.frames.at(-1)[0],4);
 fresh.apply({state:{players:[{id:0,pos:7}]},movement:{id:'next',who:0,positions:[5,6,7]}});fresh.tick();
 fresh.apply({state:{players:[{id:0,pos:3}]},movement:{id:'replace',who:0,positions:[4,3]}});
 assert.equal(fresh.frames.at(-1)[0],5);fresh.tick();assert.equal(fresh.frames.at(-1)[0],4);fresh.tick();assert.equal(fresh.frames.at(-1)[0],3);assert.equal(fresh.tick(),false);
});
