const {test}=require('node:test');
const assert=require('node:assert/strict');
const {payment}=require('./payments.cjs');
function state(){return {players:[0,1,2].map(id=>({id,cash:6000,wallet:{10:50,50:10,100:10,1000:4},out:false})),accounts:{},giftBalances:{},bankExchanges:{},notices:[]};}
function pay(s,h,seat,from,to,d,extra={}){return payment(s,h,seat,{from,to,d,...extra});}
test('reject nonexistent notes, unauthorized bank withdrawals and taking another wallet',()=>{
 const s=state();s.players[0].wallet[10]=0;
 assert.throws(()=>pay(s,{},0,0,1,10));
 assert.throws(()=>pay(state(),{},0,-1,0,10));
 assert.throws(()=>pay(state(),{},0,1,0,10));
 assert.throws(()=>pay(state(),{},0,1,2,10));
 assert.throws(()=>pay(state(),{},0,0,1,20));
 assert.deepEqual(s.accounts,{});
});
test('server ignores forged delta and record, and stores its own undo ledger',()=>{
 const r=pay(state(),{},0,0,1,10,{delta:{bank:90000,gifts:{'0:2':9999}},record:{id:'quick-undo',from:-1,to:0,d:5000,onlineDelta:{bank:5000}}});
 assert.equal(r.state.players[0].cash,5990);assert.equal(r.state.players[1].cash,6010);
 assert.deepEqual(r.state.giftBalances,{'0:1':10});assert.deepEqual(r.state.bankExchanges,{});
 assert.equal(r.history[0][0].id,'quick-undo');assert.equal(r.history[0][0].from,0);
 const u=pay(r.state,r.history,0,1,0,10,{undo:true,undoRecordId:'quick-undo'});
 assert.equal(u.state.players[0].cash,6000);assert.equal(u.state.giftBalances['0:1'],0);assert.equal(u.history[0].length,0);
 assert.throws(()=>pay(r.state,r.history,0,1,0,50,{undo:true,undoRecordId:'quick-undo'}));
});
test('official overpayment and bank change use authoritative balance',()=>{
 const s=state();s.accounts['-1:0']={a:-1,b:0,target:-50,net:0};
 const r=pay(s,{},0,0,-1,100);assert.equal(r.state.accounts['-1:0'].net,-100);
 const c=pay(r.state,r.history,0,-1,0,50);assert.equal(c.state.accounts['-1:0'].net,-50);
 assert.throws(()=>pay(c.state,c.history,0,-1,0,10));
});
test('player change does not permit collecting another player payment',()=>{
 const s=state();s.accounts['0:1']={a:0,b:1,target:50,net:0};
 assert.throws(()=>pay(s,{},1,0,1,10));
 const r=pay(s,{},0,0,1,100);const c=pay(r.state,r.history,0,1,0,50);
 assert.equal(c.state.accounts['0:1'].net,50);assert.throws(()=>pay(c.state,c.history,0,1,0,10));
});
test('exchange rejects excess bank change and undo restores the exchange',()=>{
 let r=pay(state(),{},0,0,-1,1000);assert.equal(r.state.bankExchanges[0].net,1000);
 r=pay(r.state,r.history,0,-1,0,100);assert.equal(r.state.bankExchanges[0].net,900);
 assert.throws(()=>pay(r.state,r.history,0,-1,0,1000));
 r=pay(r.state,r.history,0,0,-1,100,{undo:true,undoRecordId:r.record.id});assert.equal(r.state.bankExchanges[0].net,1000);
});
test('undo applies inverse entries and preserves another player concurrent payment',()=>{
 let r=pay(state(),{},0,0,1,10);const first=r.record.id;
 r=pay(r.state,r.history,1,1,2,50);r=pay(r.state,r.history,0,1,0,10,{undo:true,undoRecordId:first});
 assert.equal(r.state.players[0].cash,6000);assert.equal(r.state.players[1].cash,5950);assert.equal(r.state.players[2].cash,6050);
 assert.equal(r.state.giftBalances['1:2'],50);assert.equal(r.history[1].length,1);
});
test('purchase and cancelled purchase refunds retain their paid ledger',()=>{
 const s=state();s.accounts['-1:0']={a:-1,b:0,target:-1000,net:0};s.purchase={who:0,tile:6,paid:0,amount:1000};
 let r=pay(s,{},0,0,-1,1000);assert.equal(r.state.purchase.paid,1000);
 r.state.accounts['-1:0'].target=0;r.state.purchase.canceling=true;
 r=pay(r.state,r.history,0,-1,0,1000);assert.equal(r.state.purchase.paid,0);
});
