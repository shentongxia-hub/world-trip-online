const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const bridge=readFileSync(__dirname+'/bridge.js','utf8');
function setup(to,folded=false){
 const note={isConnected:true},record={id:'payment',from:0,to,d:100};let calls=[],renders=0;
 const c={cashUI:{from:0,to},paymentUncertain:false,busy:false,noteTransferRunning:false,localNotes:[record],S:{undoNotes:[record]},unfolded:new Set(folded?[]:[to]),canUndoNote:t=>t.from===0&&t.to===to,renderWallets(){renders++},walletArea(){return {querySelector(selector){assert.match(selector,/data-value="100"/);return to===-1||c.unfolded.has(to)?note:null}}},revealWalletNote(el){assert.equal(el,note)},refreshUndoControls(){},notify(msg){throw Error(msg)},animateNoteTransfer(args){calls.push(args);assert.equal(c.undoingRecord,record);return Promise.resolve()},undoingRecord:null};
 vm.createContext(c);vm.runInContext(bridge.slice(bridge.indexOf('undoVoluntary=function()'),bridge.indexOf('const turnActions=')),c);
 return {c,calls,get renders(){return renders},record};
}
for(const [label,to,folded] of [['folded player',1,true],['expanded player',1,false],['bank',-1,false]])test('undo resolves a real note from '+label,async()=>{const view=setup(to,folded);await view.c.undoVoluntary();assert.equal(view.calls.length,1);const args=view.calls[0];assert.equal(args.from,to);assert.equal(args.to,0);assert.equal(args.undoRecord,view.record);assert.equal(args.undo,true);assert.equal(view.c.localNotes.length,0);assert.equal(view.c.undoingRecord,null);assert.equal(view.renders,folded?1:0)});
test('uncertain payments preserve undo history',()=>{const view=setup(1);view.c.paymentUncertain=true;view.c.undoVoluntary();assert.equal(view.calls.length,0);assert.equal(view.c.localNotes.length,1)});
