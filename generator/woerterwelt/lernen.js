export const places = [
 {id:'wald',name:'Lauschwald',icon:'♧',colour:'#e1ead4',subtitle:'Anfänge hören'},
 {id:'atelier',name:'Buchstabenatelier',icon:'✎',colour:'#f6ddc7',subtitle:'Zeichen entdecken'},
 {id:'bach',name:'Silbenbach',icon:'≈',colour:'#cce5eb',subtitle:'Laute verbinden'},
 {id:'post',name:'Wörterpost',icon:'✉',colour:'#f6e4a9',subtitle:'Botschaften legen'}
];
export const pets={eule:'Eule',maus:'Maus',drache:'Drache'};
export const words={Maus:'maus',Apfel:'apfel',Biene:'biene',Drache:'drache'};
const letters=['m','a','i','l','o','p'];
const syllables=['ma','mi','la','li','mo','lo'];
const mail=['Mama','Mami','Oma','Omi','Lama','Papi'];
export function curriculum(place,history,school='') {
 const past=history.filter(e=>e.place===place);
 const independent=past.filter(e=>!e.helped);
 const width=Math.min(6,2+Math.floor(independent.length/3));
 const index=past.length;
 function pick(items,n){return items[n%items.length];}
 const learnt=letters.slice(0,width);
 if(letters.includes(school)&&!learnt.includes(school))learnt.push(school);
 const recent=past.slice(-2);
 const revisit=recent.length===2&&recent.every(e=>e.helped);
 return Array.from({length:3},(_,j)=>{
  const n=index+j;
  const today=new Date().toDateString();
  const old=past.find(e=>e.kind==='atelier'&&new Date(e.at).toDateString()!==today&&!past.some(x=>x.target===e.target&&new Date(x.at).toDateString()===today));
  const char=old&&j===0?old.target:revisit&&j===0?recent[0].target:pick(learnt,n);
  if(place==='wald'){
   const vocabulary=Object.keys(words),word=pick(vocabulary,n);
   return {kind:'forest',target:word,options:[word,pick(vocabulary,n+1)],sound:word[0].toLowerCase()};
  }
  if(place==='bach'){
   const target=pick(syllables.slice(0,width),n);
   return {kind:'brook',target,options:[target,pick(syllables,syllables.indexOf(target)+1)],sound:target};
  }
  if(place==='post'){
   const target=pick(mail,n),slot=n%target.length;
   return {kind:'post',target:target[slot],word:target,slot,options:[target[slot],target[slot]==='m'?'l':target[slot]==='M'?'P':slot===0?'M':'m'],sound:target};
  }
  const target=letters.includes(char)?char:'m';
  return {kind:n%3===2?'reverse':'atelier',target,options:[target,pick(letters,letters.indexOf(target)+1)],sound:target};
 }).map((q,i)=>({...q,options:(index+i)%2?[...q.options].reverse():q.options}));
}
export function wallet(events){const earned=new Set(events.map(e=>e.id)).size;return {earned,level:1+Math.floor(earned/10),next:10-earned%10};}
