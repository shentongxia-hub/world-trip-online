'use strict';
const {randomUUID}=require('node:crypto');
const NOTES=[10,50,100,200,500,1000,2000,5000];
const copy=x=>JSON.parse(JSON.stringify(x));
const pair=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);

// Build the ledger on the server. Client deltas are only optimistic previews.
function payment(state,history,seat,data){
 const st=copy(state),records=copy(history||{}),players=st.players;
 const {from,to,d}=data;
 const party=n=>Number.isInteger(n)&&n>=-1&&n<players.length;
 if(!Number.isInteger(seat)||seat<0||!players[seat]||players[seat].out||!party(from)||!party(to)||from===to||![from,to].includes(seat)||!NOTES.includes(d))throw Error('无效收付款');
 if(from!==-1&&(!Number.isSafeInteger(players[from].wallet?.[d])||players[from].wallet[d]<=0||players[from].cash<d||players[from].out)||to!==-1&&players[to].out)throw Error('没有这张纸币');
 st.accounts??={};st.giftBalances??={};st.bankExchanges??={};
 const list=records[seat]??=[],key=pair(from,to),book=st.accounts[key],ex=st.bankExchanges[seat];
 let index=-1,record,delta={accounts:{},gifts:{},bank:0,returnTo:ex?.returnTo??null,purchase:null};
 if(data.undo){
  index=list.findLastIndex(t=>t&&(!data.undoRecordId||t.id===data.undoRecordId)&&t.from===to&&t.to===from&&t.d===d);
  if(index<0)throw Error('找不到这笔付款的撤回记录');
  record=list[index];
  let original=record.onlineDelta;
  // Older exported games used these flags instead of onlineDelta.
  if(!original){
   original={accounts:{},gifts:{},bank:0,purchase:null};
   if(record.official){const b=st.accounts[record.key];if(!b)throw Error('撤回账目已失效');original.accounts[record.key]={net:(record.from===b.a?1:-1)*d};}
   else if(record.gift)original.gifts[record.giftKey]=(record.from===seat?1:-1)*d;
   else original.bank=(record.from===seat?1:-1)*d;
   if(record.purchase)original.purchase={tile:record.purchase.tile,who:seat,paid:(record.from===seat?1:-1)*d};
  }
  for(const [k,v]of Object.entries(original.accounts||{})){if(!st.accounts[k]||!Number.isSafeInteger(v.net)||Math.abs(v.net)!==d)throw Error('撤回账目已失效');delta.accounts[k]={...v,net:-v.net};}
  for(const [k,v]of Object.entries(original.gifts||{})){if(!Number.isSafeInteger(v)||Math.abs(v)!==d)throw Error('撤回赠与已失效');delta.gifts[k]=-v;}
  if(original.bank){if(!Number.isSafeInteger(original.bank)||Math.abs(original.bank)!==d)throw Error('撤回兑换已失效');delta.bank=-original.bank;}
  if(original.purchase)delta.purchase={...original.purchase,paid:-original.purchase.paid};
 }else{
  const official=!!book&&book.target!==book.net&&!ex?.net;
  if(from===-1){
   if(official){const due=book.target-book.net;if((due>0?book.a:book.b)!==-1||d>Math.abs(due))throw Error('银行只能支付应领取或找零的金额');}
   else if(!ex||ex.net<d)throw Error('银行找零不能超过兑换余额');
  }else if(from!==seat){
   if(official){if((book.target>0?book.a:book.b)===from||d>Math.abs(book.target-book.net))throw Error('需要由付款玩家自己交钱，找零不能超过多付金额');}
   else if((st.giftBalances[seat+':'+from]||0)<d)throw Error('退回的金额不能超过已收到的赠与');
  }
  if(ex&&[from,to].includes(-1)&&(!official||ex.net))delta.bank=(from===seat?1:-1)*d;
  else if(official)delta.accounts[key]={a:book.a,b:book.b,target:book.target,net:(from===book.a?1:-1)*d};
  else if(from!==-1&&to!==-1)delta.gifts[seat+':'+(from===seat?to:from)]=(from===seat?1:-1)*d;
  else delta.bank=(from===seat?1:-1)*d;
  if(st.purchase?.who===seat&&pair(st.purchase.who,-1)===key&&!delta.bank)delta.purchase={tile:st.purchase.tile,who:seat,paid:(from===seat?1:-1)*d};
  record={id:randomUUID(),from,to,d,official:!!Object.keys(delta.accounts).length,gift:!!Object.keys(delta.gifts).length,key,giftKey:seat+':'+(from===seat?to:from),purchase:delta.purchase?copy(st.purchase):null,onlineDelta:copy(delta)};
  // Keep the optimistic record ID so rapid undo can refer to an in-flight payment.
  if(typeof data.record?.id==='string'&&data.record.id.length<=100&&!list.some(t=>t.id===data.record.id))record.id=data.record.id;
 }
 if(from!==-1){players[from].wallet[d]--;players[from].cash-=d;}
 if(to!==-1){players[to].wallet[d]=(players[to].wallet[d]||0)+1;players[to].cash+=d;}
 for(const [k,v]of Object.entries(delta.accounts))st.accounts[k].net+=v.net;
 for(const [k,v]of Object.entries(delta.gifts))st.giftBalances[k]=(st.giftBalances[k]||0)+v;
 if(delta.bank){const bank=st.bankExchanges[seat]??={who:seat,net:0,returnTo:delta.returnTo};bank.net+=delta.bank;}
 if(delta.purchase&&st.purchase?.who===seat&&st.purchase.tile===delta.purchase.tile)st.purchase.paid+=delta.purchase.paid;
 if(data.undo)list.splice(index,1);else list.push(record);
 records[seat]=list;st.onlineUndo=records;
 for(const n of st.notices||[]){const v=st.accounts[pair(n.from,n.to)];if(v)n.paid=v.target===v.net?n.amount:Math.max(0,n.amount-Math.min(n.amount,Math.abs(v.target-v.net)));}
 return {state:st,history:records,record,official:!!Object.keys(delta.accounts).length,exchange:!!delta.bank};
}
module.exports={payment};
