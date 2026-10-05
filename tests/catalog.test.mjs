import {test,after} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';import path from 'node:path';import ts from 'typescript';import {Miniflare} from 'miniflare';
// Isolated test bindings and mock identity; never changes app access or production data.
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],r2Buckets:['IMAGES']});
const env={DB:await mf.getD1Database('DB'),IMAGES:await mf.getR2Bucket('IMAGES'),ADMIN_EMAIL:'alina.shakhabova@yandex.ru'};
let identity=null;const context=vm.createContext({console,Response,Request,URL,File,FormData,Uint8Array,TextDecoder,crypto});const cache=new Map();
const envModule=new vm.SyntheticModule(['env'],function(){this.setExport('env',env)},{context});
const headersModule=new vm.SyntheticModule(['headers'],function(){this.setExport('headers',async()=>new Headers(identity?{'oai-authenticated-user-id':'isolated-test-user','oai-authenticated-user-email':identity}:{}))},{context});
const navigationModule=new vm.SyntheticModule(['redirect'],function(){this.setExport('redirect',()=>{throw Error('Unexpected redirect')})},{context});
async function load(filename){filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename);const source=await fs.readFile(filename,'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const mod=new vm.SourceTextModule(code,{context,identifier:filename});cache.set(filename,mod);await mod.link(async(spec,ref)=>{if(spec==='cloudflare:workers')return envModule;if(spec==='next/headers')return headersModule;if(spec==='next/navigation')return navigationModule;const file=spec.startsWith('@/')?path.resolve(spec.slice(2)):path.resolve(path.dirname(ref.identifier),spec);return load(file+'.ts')});return mod;}
const paths=['lib/products.ts','app/api/products/route.ts','app/api/products/[id]/route.ts','app/api/upload/route.ts','app/api/images/[key]/route.ts'];const mods=[];for(const p of paths){const m=await load(p);await m.evaluate();mods.push(m.namespace)}const [model,products,item,upload,images]=mods;
const base={name:'Test bag',category:'Сумки',material:'Экокожа',colors:['Чёрный'],price:0.29,oldPrice:null,description:'Test description',image:'https://example.com/bag.jpg',stock:'В наличии',badge:'',demo:false};
const request=(method,body,origin='https://test.example')=>new Request('https://test.example/api/products',{method,headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
after(async()=>{await mf.dispose()});
test('validates prices, categories, colors and photo URLs',()=>{assert.equal(model.validateProduct(base).price,0.29);for(const changes of [{price:-1},{price:NaN},{price:1.111},{category:'invalid'},{colors:null},{colors:'Чёрный'},{colors:['invalid']},{image:'javascript:alert(1)'},{image:'http://example.com/a.jpg'},{oldPrice:0.1}])assert.throws(()=>model.validateProduct({...base,...changes}));assert.equal(model.validateProduct({...base,image:'/api/images/abcd-1234.png'}).image,'/api/images/abcd-1234.png')});
test('rejects anonymous, unrelated accounts and cross-origin writes',async()=>{identity=null;assert.equal((await products.POST(request('POST',base))).status,403);identity='someone@example.com';assert.equal((await products.POST(request('POST',base))).status,403);identity=env.ADMIN_EMAIL;assert.equal((await products.POST(request('POST',base,'https://evil.example'))).status,403);const allowed=env.ADMIN_EMAIL;env.ADMIN_EMAIL='';assert.equal((await products.POST(request('POST',base))).status,403);env.ADMIN_EMAIL=allowed;identity=null;assert.equal((await products.GET(new Request('https://test.example/api/products?all=1'))).status,403)});
test('creates, reads, updates, archives and restores durable products',async()=>{identity=env.ADMIN_EMAIL;const response=await products.POST(request('POST',base));assert.equal(response.status,201);const created=await response.json();let records=await(await products.GET(new Request('https://test.example/api/products'))).json();assert.ok(records.some(p=>p.id===created.id));const ctx={params:Promise.resolve({id:created.id})};assert.equal((await item.PUT(request('PUT',{...base,name:'Updated bag',price:4900}),ctx)).status,200);records=await(await products.GET(new Request('https://test.example/api/products'))).json();assert.equal(records.find(p=>p.id===created.id).price,4900);assert.equal((await item.PATCH(request('PATCH',{archived:true}),ctx)).status,200);records=await(await products.GET(new Request('https://test.example/api/products'))).json();assert.ok(!records.some(p=>p.id===created.id));records=await(await products.GET(new Request('https://test.example/api/products?all=1'))).json();assert.equal(records.find(p=>p.id===created.id).archived,true);assert.equal((await item.PATCH(request('PATCH',{archived:false}),ctx)).status,200);records=await(await products.GET(new Request('https://test.example/api/products'))).json();assert.ok(records.some(p=>p.id===created.id));assert.equal((await item.PUT(request('PUT',{...base,price:-2}),ctx)).status,400);assert.equal((await item.PATCH(request('PATCH',{archived:'true'}),ctx)).status,400);assert.equal((await item.PUT(request('PUT',base),{params:Promise.resolve({id:'missing'})})).status,404)});
test('validates uploads and retrieves stored image bytes',async()=>{identity=env.ADMIN_EMAIL;const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR0sAAAAASUVORK5CYII=','base64'));const form=new FormData();form.append('file',new File([png],'photo.png',{type:'image/png'}));const res=await upload.POST(new Request('https://test.example/api/upload',{method:'POST',headers:{Origin:'https://test.example'},body:form}));assert.equal(res.status,200);const result=await res.json();const key=result.image.split('/').at(-1);const photo=await images.GET(new Request('https://test.example'+result.image),{params:Promise.resolve({key})});assert.equal(photo.status,200);assert.equal(photo.headers.get('content-type'),'image/png');assert.deepEqual(new Uint8Array(await photo.arrayBuffer()),png);const bad=new FormData();bad.append('file',new File(['<svg/>'],'x.png',{type:'image/png'}));assert.equal((await upload.POST(new Request('https://test.example/api/upload',{method:'POST',headers:{Origin:'https://test.example'},body:bad}))).status,400);assert.equal((await images.GET(new Request('https://test.example/api/images/x'),{params:Promise.resolve({key:'../bad'})})).status,404);identity=null;assert.equal((await upload.POST(new Request('https://test.example/api/upload',{method:'POST',headers:{Origin:'https://test.example'},body:form}))).status,403)});

test('saves and updates products with new colors or no color',async()=>{
 identity=env.ADMIN_EMAIL;
 for(const selectedColors of [[],['Серый'],['Голубой'],['Серый','Голубой']]){
  const response=await products.POST(request('POST',{...base,colors:selectedColors}));
  assert.equal(response.status,201);
  const created=await response.json();
  assert.deepEqual(created.colors,selectedColors);
  const records=await(await products.GET(new Request('https://test.example/api/products'))).json();
  assert.deepEqual(records.find(p=>p.id===created.id).colors,selectedColors);
  const ctx={params:Promise.resolve({id:created.id})};
  const updated=await item.PUT(request('PUT',{...base,colors:[]}),ctx);
  assert.equal(updated.status,200);
  assert.deepEqual((await updated.json()).colors,[]);
  const afterUpdate=await(await products.GET(new Request('https://test.example/api/products'))).json();
  assert.deepEqual(afterUpdate.find(p=>p.id===created.id).colors,[]);
 }
});

test('allows optional description and size while enforcing length limits',()=>{
 for(const description of ['',undefined,'   ']){
  const product=model.validateProduct({...base,description});
  assert.equal(product.description,'');
  assert.equal(product.size,'');
 }
 assert.equal(model.validateProduct({...base,size:' 30 × 20 × 12 см '}).size,'30 × 20 × 12 см');
 assert.throws(()=>model.validateProduct({...base,size:'x'.repeat(101)}));
 assert.throws(()=>model.validateProduct({...base,description:'x'.repeat(5001)}));
});
test('persists bag size with an empty description and can clear the size',async()=>{
 identity=env.ADMIN_EMAIL;
 const response=await products.POST(request('POST',{...base,description:'',size:'30 × 20 × 12 см'}));
 assert.equal(response.status,201);
 const created=await response.json();
 const records=await(await products.GET(new Request('https://test.example/api/products'))).json();
 const saved=records.find(p=>p.id===created.id);
 assert.equal(saved.size,'30 × 20 × 12 см');
 assert.equal(saved.description,'');
 assert.ok(records.filter(p=>p.id.startsWith('demo-')).every(p=>p.size===''));
 const ctx={params:Promise.resolve({id:created.id})};
 const updated=await item.PUT(request('PUT',{...base,description:'',size:'25 × 15 см'}),ctx);
 assert.equal(updated.status,200);
 const afterUpdate=await(await products.GET(new Request('https://test.example/api/products'))).json();
 assert.equal(afterUpdate.find(p=>p.id===created.id).size,'25 × 15 см');
 const cleared=await item.PUT(request('PUT',{...base,description:'',size:''}),ctx);
 assert.equal(cleared.status,200);
 const afterClear=await(await products.GET(new Request('https://test.example/api/products'))).json();
 assert.equal(afterClear.find(p=>p.id===created.id).size,'');
});
