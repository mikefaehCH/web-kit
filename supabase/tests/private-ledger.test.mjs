import assert from 'node:assert/strict';
import fs from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_PATH || '@electric-sql/pglite');
const db=new PGlite();const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',trip='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
try {
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values ('${a}'),('${b}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;`);
let sql=fs.readFileSync(new URL('../migrations/20261103144722_private_travel_ledgers.sql',import.meta.url),'utf8').replaceAll('829dfa95-6722-4b08-aa1b-843e38a06ba7',a);await db.exec(sql);await db.exec('set role authenticated');
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
await db.query(`insert into public.web_kit_private_trips(id,title,people) values ($1,'Fixture',array['A'])`,[trip]);
await db.query(`insert into public.web_kit_private_entries(trip_id,entry_id,payload) values ($1,'x','{"id":"x"}')`,[trip]);
await assert.rejects(db.query(`insert into public.web_kit_private_entries(trip_id,entry_id,payload) values ($1,'bad','{}')`,[trip]));
await assert.rejects(db.query(`insert into public.web_kit_private_entries(trip_id,entry_id,payload) values ($1,'bad','{"id":"bad"}')`,[b]));
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
for(const t of ['web_kit_private_trips','web_kit_private_entries']) {assert.equal((await db.query(`select * from public.${t}`)).rows.length,0);assert.equal((await db.query(`delete from public.${t} returning *`)).rows.length,0);}
await assert.rejects(db.exec(`insert into public.web_kit_private_trips(title,people) values ('No',array['B'])`));
await assert.rejects(db.query(`insert into public.web_kit_private_entries(trip_id,owner_id,entry_id,payload) values ($1,$2,'fake','{"id":"fake"}')`,[trip,a]));
await db.exec('reset role;set role anon');await assert.rejects(db.exec('select * from public.web_kit_private_trips'));
console.log('PASS: owner, non-owner, anonymous, malformed payload and trip isolation');
}finally{await db.close()}
