/** Test the shipped offline bundle, its lazy engines, and native bridge in Chromium. */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
const exec = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(join(tmpdir(), 'genui-mobile-'))
let server
try {
  await exec(process.execPath, [join(root, 'scripts/install-mobile.mjs'), temporary])
  const fixture = `
const events = [];
window.GenuiNative = { postMessage: text => { const event=JSON.parse(text); events.push(event); if(event.type==='clipboard') queueMicrotask(()=>window.__GenuiMobile__.reply({...event,ok:true})); } };
window.mobileErrors = [];
window.addEventListener('error', e => mobileErrors.push(e.message));
window.addEventListener('unhandledrejection', e => mobileErrors.push(String(e.reason)));
const checks = [];
const check = (name, pass) => { checks.push({name, pass: !!pass}); if (!pass) throw Error(name); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async test => { for (let i=0;i<100;i++){ if(test()) return; await wait(100); } throw Error('timeout'); };
window.addEventListener('load', async () => {
try {
const api = window.__GenuiMobile__;
const base = {version:1,id:'session-a/card',token:'0123456789abcdef0123456789abcdef',theme:'light',locale:'en',canAct:true,canOpenFiles:true};
const spec = {items:[{type:'input',id:'name',label:'Name'},{type:'input',id:'secret',inputType:'password',label:'Secret',value:'do-not-persist'},{type:'button',label:'Send',action:'submit'},{type:'mermaid',code:'graph TD; A[Start]-->B[Finish]'},{type:'echart',preset:'bar',data:[{label:'A',value:10},{label:'B',value:5}]},{type:'scene3d',meshes:[{shape:'box',color:'#4488ff'}]}]};
api.render({...base,spec});
await until(()=>document.querySelectorAll('canvas').length>=1 && document.querySelector('svg[id^="genui-mermaid"]'));
check('ready handshake',events.some(e=>e.type==='ready'&&e.id===base.id));
check('mermaid SVG',!!document.querySelector('svg[id^="genui-mermaid"]'));
check('echarts lazy engine',!!window.__GenuiAssets__?.echartsCore);
check('three lazy engine',!!window.__GenuiAssets__?.three);
check('height bridge',events.some(e=>e.type==='height'&&e.height>0));
check('clipboard acknowledgement',await window.__GenuiNativeClipboard__('copied text'));
const input=document.querySelector('input:not([type=password])');
Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'saved draft');
input.dispatchEvent(new Event('input',{bubbles:true}));
await until(()=>events.some(e=>e.type==='state'&&e.state.fields?.name==='saved draft'));
const state=events.filter(e=>e.type==='state').at(-1).state;
check('password excluded',!JSON.stringify(state).includes('do-not-persist')&&!('secret' in (state.fields??{})));
const send=[...document.querySelectorAll('button')].find(b=>b.textContent==='Send');send.click();
await until(()=>events.some(e=>e.type==='action'));
check('action ownership',events.filter(e=>e.type==='action').every(e=>e.id===base.id&&e.token===base.token));
const before=events.filter(e=>e.type==='action').length;
api.render({...base,spec,canAct:false,theme:'dark'});await wait(100);
[...document.querySelectorAll('button')].find(b=>b.textContent==='Send')?.click();await wait(100);
check('disabled action gate',events.filter(e=>e.type==='action').length===before);
check('theme update',document.body.hasAttribute('data-ds-dark-theme'));
api.dispose();api.render({...base,spec,state});await until(()=>document.querySelector('input:not([type=password])')?.value==='saved draft');
check('restored native state',document.querySelector('input:not([type=password])').value==='saved draft');
api.render({...base,id:'session-b/card',spec});await wait(100);
check('session isolation',document.querySelector('input:not([type=password])').value==='');
api.render({...base,id:'session-file',spec:{items:[{type:'link',label:'Source file',href:'src/app.ts#L4'}]}});await wait(100);
document.querySelector('button[title="src/app.ts"]').click();await wait(20);
check('session file bridge',events.some(e=>e.type==='file'&&e.id==='session-file'&&e.path==='src/app.ts'&&e.line===4));
api.render({...base,version:99});await wait(50);
api.dispose();
check('teardown',document.querySelector('#genui-root').children.length===0);
check('no renderer exceptions',mobileErrors.length===0);
}catch(error){checks.push({name:String(error),pass:false});}
document.getElementById('results').textContent=JSON.stringify({checks,errors:mobileErrors});
});`
  await writeFile(join(temporary, 'fixture.js'), fixture)
  const html = (await readFile(join(temporary, 'index.html'), 'utf8')).replace('<script src="mobile-runtime.js">', '<pre id="results">pending</pre><script src="fixture.js"></script><script src="mobile-runtime.js">')
  await writeFile(join(temporary, 'index.html'), html)
  server = createServer(async (req, res) => {
    const name = req.url === '/' ? 'index.html' : req.url.slice(1)
    if (!/^[\w.-]+$/.test(name)) { res.writeHead(404).end(); return }
    try { res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(await readFile(join(temporary, name))) }
    catch { res.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const {stdout, stderr} = await exec(process.env.BROWSER_BIN ?? 'google-chrome', [
    '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--no-first-run', '--disable-background-networking', `--user-data-dir=${join(temporary, 'profile')}`,
    '--virtual-time-budget=20000', '--window-size=400,900', '--dump-dom', process.env.GENUI_BROWSER_TRANSPORT === 'file' ? pathToFileURL(join(temporary, 'index.html')).href : `http://127.0.0.1:${server.address().port}/`,
  ], {timeout: 60000, maxBuffer: 4*1024*1024})
  const raw = stdout.match(/<pre id="results">([^<]*)<\/pre>/)?.[1]
  if (!raw || raw === 'pending') throw Error(`Mobile fixture did not complete: ${stderr.slice(-1000)}`)
  const result = JSON.parse(raw.replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'))
  console.log(JSON.stringify(result, null, 2))
  if (result.checks.some(check => !check.pass)) throw Error('Mobile browser acceptance failed')
} finally { await new Promise(resolve => server ? server.close(resolve) : resolve()); await rm(temporary, {recursive:true,force:true}) }
