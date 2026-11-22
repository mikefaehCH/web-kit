import {createClient} from 'npm:@supabase/supabase-js@2.86.0';
const origin='https://mikefaehch.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Content-Type':'application/json'};
Deno.serve(async(req)=>{
 const reply=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers});
 if(req.headers.get('Origin')!==origin)return reply(403,{error:'origin'});
 if(req.method==='OPTIONS')return reply(200,{});
 if(req.method!=='POST')return reply(405,{error:'method'});
 const url=Deno.env.get('SUPABASE_URL')!,token=req.headers.get('Authorization')||'';
 const user=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:token}}});
 const {data:{user:parent}}=await user.auth.getUser(token.replace(/^Bearer /,''));
 if(!parent)return reply(401,{error:'login'});
 const {data:access,error}=await user.rpc('woerterinsel',{action:'child_access',payload:{}});
 if(error)return reply(403,{error:'family'});
 const {username,password,mode}=await req.json();
 if(!/^[a-z0-9_-]{4,30}$/.test(username)||typeof password!=='string'||password.length<10||password.length>128)return reply(400,{error:'input'});
 const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const email=username+'@kind.invalid';
 if(mode==='reset'){
  for(const id of access.children){const {data}=await admin.auth.admin.getUserById(id);if(data.user?.email===email){const {error}=await admin.auth.admin.updateUserById(id,{password});return reply(error?400:200,{ok:!error});}}
  return reply(404,{error:'child'});
 }
 if(mode!=='create')return reply(400,{error:'mode'});
 const {data,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{woerterinsel_parent:parent.id}});
 if(createError||!data.user)return reply(409,{error:'username'});
 const {error:bindError}=await admin.rpc('woerterinsel_bind_child',{parent_uid:parent.id,child_uid:data.user.id});
 if(bindError){return reply(409,{error:'family'});}
 return reply(200,{ok:true});
});
