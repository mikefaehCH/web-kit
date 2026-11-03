const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function read(page, dir) {
  await page.goto(pathToFileURL(path.resolve(dir, 'index.html')).href, {waitUntil:'load'});
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => ({text:document.body.innerText.replace(/\s+/g,' ').trim(), links:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href'))}));
}
(async()=>{
 for (const [name, browserType] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await browserType.launch({headless:true});
  for (const width of [375,390,430,1440]) {
   const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});
   await context.route(/^https?:/, route=>route.abort());
   const page=await context.newPage();
   for (const site of ['edinburgh','valencia']) {
    const base=await read(page,site+'-base');
    const baseImage=site==='valencia'?await page.screenshot({fullPage:true,animations:'disabled'}):null;
    const head=await read(page,site+'-head');
    assert.deepEqual(head,base,site+' text/links changed '+name+' '+width);
    const geometry=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,behavior:getComputedStyle(document.documentElement).scrollBehavior}));
    assert.ok(geometry.scroll<=geometry.client,site+' horizontal overflow '+name+' '+width+' '+JSON.stringify(geometry));
    if(site==='edinburgh')assert.equal(geometry.behavior,'auto','reduced motion '+name+' '+width);
    if(site==='valencia')assert.ok(baseImage.equals(await page.screenshot({fullPage:true,animations:'disabled'})),'visual difference '+name+' '+width);
    console.log('PASS',site,name,width,JSON.stringify(geometry));
   }
   await context.close();
  }
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});
