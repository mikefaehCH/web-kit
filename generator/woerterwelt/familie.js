import {createClient} from './supabase.js';
const url='https://qoensghjemruqafrbmjd.supabase.co';
const key='sb_publishable_Qeom38G18vSgrrE5MxoXEw_LhJM1f6S';
const parentMode=location.pathname.endsWith('/eltern.html');
export const client=createClient(url,key,{auth:{storageKey:parentMode?'insel.parent.v2':'insel.child.v2',storage:parentMode?sessionStorage:localStorage,persistSession:true,detectSessionInUrl:true,flowType:'pkce'}});
export async function request(action,payload={}) {
 const {data,error}=await client.rpc('woerterinsel',{action,payload});
 if(error)throw new Error(error.code==='PGRST202'?'Familien-Datenbank noch nicht freigeschaltet.':error.message);
 return data;
}
export async function childLogin(username,password){
 const {error}=await client.auth.signInWithPassword({email:username.trim().toLowerCase()+'@kind.invalid',password});if(error)throw error;
}
export async function linkGoogle(){
 const {error}=await client.auth.linkIdentity({provider:'google',options:{redirectTo:new URL('./',location.href).href}});if(error)throw error;
}
export async function google(){
 const res=await fetch(url+'/auth/v1/settings',{headers:{apikey:key}});if(!res.ok)throw Error('Anmeldedienst nicht erreichbar.');
 if(!(await res.json()).external.google)throw Error('Google-Anmeldung ist für diese App noch nicht freigeschaltet.');
 const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL('eltern.html',location.href).href,queryParams:{prompt:'select_account'}}});if(error)throw error;
}
export async function manageChild(username,password,mode){
 const {data,error}=await client.functions.invoke('woerterinsel-kind',{body:{username,password,mode}});
 if(error||data?.error)throw Error('Kinderkonto konnte nicht gespeichert werden.');return data;
}
