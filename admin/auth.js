import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
const url='https://qoensghjemruqafrbmjd.supabase.co';
const publishable='sb_publishable_Qeom38G18vSgrrE5MxoXEw_LhJM1f6S';
const sb=createClient(url,publishable,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,flowType:'pkce'}});
const login=document.querySelector('#login-panel'),workspace=document.querySelector('#workspace'),email=document.querySelector('#email'),loginForm=document.querySelector('#login-form'),loginStatus=document.querySelector('#login-status'),logout=document.querySelector('#logout'),identity=document.querySelector('#identity');
window.WEB_KIT_WHATSAPP_ENDPOINT=url+'/functions/v1/web-kit-whatsapp-send';
window.WEB_KIT_GET_ACCESS_TOKEN=async()=>{const {data:{session}}=await sb.auth.getSession();return session?.access_token??null};
async function refresh(){const {data:{user},error}=await sb.auth.getUser();const admin=!error&&user?.app_metadata?.web_kit_admin===true;login.hidden=!!admin;workspace.hidden=!admin;identity.textContent=admin?user.email??'Administrator':'';if(user&&!admin)loginStatus.textContent='Angemeldet, aber keine Admin-Berechtigung. Bitte die Administration kontaktieren.';else if(!user)loginStatus.textContent='';}
loginForm.addEventListener('submit',async e=>{e.preventDefault();const button=loginForm.querySelector('button');button.disabled=true;loginStatus.textContent='Anmeldelink wird angefordert …';try{const {error}=await sb.auth.signInWithOtp({email:email.value.trim(),options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname}});if(error)throw error;loginStatus.textContent='Falls dieses Konto existiert, wurde ein Anmeldelink versendet.';}catch(err){loginStatus.textContent='Anmeldung derzeit nicht möglich. Bitte später erneut versuchen.';}finally{button.disabled=false;}});
logout.addEventListener('click',async()=>{await sb.auth.signOut();await refresh();});
sb.auth.onAuthStateChange(()=>{queueMicrotask(refresh)});await refresh();
