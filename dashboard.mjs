import {parse,safeName,filename} from './parser.mjs';
import {PROVIDERS,connect} from './bridge.mjs';
import {applyAutomaticDownloads,siteOrigin} from './download-settings.mjs';
const $=id=>document.getElementById(id);
let job=(await chrome.storage.local.get('job')).job||null, running=false, paused=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const status=text=>{$('status').textContent=text;};
async function persist(){await chrome.storage.local.set({job});render();}
function render(){
  const frames=job?.frames||[],done=frames.filter(f=>f.status==='done').length;
  $('source').textContent=job?`${job.source} · ${frames.length} frames`:'No file loaded';
  $('progress').max=frames.length||1;$('progress').value=done;
  $('detail').textContent=`${done} / ${frames.length} saved · ${frames.filter(f=>f.status==='failed').length} failed${job?' · Downloads / '+job.folder:''}`;
  $('queue').replaceChildren(...frames.map(f=>{
    const row=document.createElement('div');row.className='row '+(f.status==='done'?'done':f.status==='failed'?'failed':f.marker?'active':'');
    for(const text of [`Frame ${String(f.number).padStart(3,'0')}`,`${f.start} → ${f.end}`,f.status]){const span=document.createElement('span');span.textContent=text;row.append(span);}
    if(f.status==='failed'){
      const error=document.createElement('small');error.className='frame-error';error.textContent=f.error||'Frame failed';row.append(error);
      const retry=document.createElement('button');retry.textContent='Retry frame';retry.disabled=running;retry.onclick=()=>retryFailed([f.number]);row.append(retry);
    }
    return row;
  }));
  for(const id of ['file','folder','delay','tabs','refresh','start','retry','provider','connect','map','flow-ready','open','auto-downloads'])$(id).disabled=running;
  $('pause').disabled=!running;
  $('retry-failed').disabled=running||!frames.some(f=>f.status==='failed');
}
const provider=()=>$('provider').value;
async function refresh(){
  const tabs=await chrome.tabs.query({url:PROVIDERS[provider()].patterns,currentWindow:true});
  $('tabs').replaceChildren(...tabs.map(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=t.title||PROVIDERS[provider()].name;return o;}));
  const preferred=tabs.find(t=>t.active)||tabs.find(t=>t.id===job?.tabId)||tabs[0];
  if(preferred)$('tabs').value=preferred.id;
  $('flow-options').hidden=provider()!=='flow';
  $('map').hidden=provider()==='chatgpt';
  await refreshDownloadSetting();
}
async function attach(){
  const id=Number($('tabs').value);if(!id)throw Error(`Open ${PROVIDERS[provider()].name}, then refresh tabs.`);
  const r=await connect(chrome,id,provider());
  $('connection').textContent=r.composer?(provider()==='chatgpt'?'Connected · automatic setup ready':'Connected · prompt box found'):'Page connected · open a chat/project';
  if(!r.composer)throw Error(provider()==='chatgpt'?'Open a normal ChatGPT chat and let the page load. Controls are detected automatically.':'Open a Flow project or map its prompt box.');
  // An empty ChatGPT chat normally has no Send button. Detect it only after filling.
  if(provider()==='flow'&&!r.button)throw Error('Flow Generate was not detected. Map its controls.');
  if(provider()==='flow'&&!r.results)throw Error('Flow connected. Click Map controls once to select its prompt, Generate button, and results grid.');
  return r;
}
async function message(type,extra={}){
  let result;
  try{result=await chrome.tabs.sendMessage(job.tabId,{type,provider:job.provider||'chatgpt',...extra});}catch{throw Error('Page connection was lost. Click Connect / Repair, then resume. If you upgraded, reload the site once.');}
  if(!result?.ok)throw Error(result?.error||'Page adapter failed.');return result;
}
function check(){if(paused)throw Error('Paused. Resume to continue the current frame.');}
async function waitImage(frame){
  const deadline=Date.now()+15*60*1000;let stable='',since=0,missing=0;
  while(Date.now()<deadline){
    check();const r=await message('inspect',{marker:frame.marker,prompt:frame.prompt,context:frame.context});
    if(r.context&&JSON.stringify(r.context)!==JSON.stringify(frame.context)){frame.context=r.context;await persist();}
    if(!r.found){
      if(++missing>60)throw Error('Could not confirm this frame in the conversation after two minutes. If the prompt remains in the composer, send it once manually, then Resume. If it was sent, scroll to that turn and Resume. Nothing will be automatically resent.');
      status(`Frame ${frame.number}: waiting for ChatGPT to display the submitted turn…`);
    }
    else{
      missing=0;const images=[...new Map((r.images||[]).map(x=>[x.url,x])).values()];
      if(images.length>1)throw Error('Multiple images found for this frame. Review the provider, then regenerate a single image.');
      if(images.length===1&&!r.busy){
        const key=JSON.stringify(images[0]);if(stable!==key){stable=key;since=Date.now();}
        if(Date.now()-since>=12000)return images[0];
      }else{stable='';since=0;}
      if(!images.length&&!r.busy&&/you.ve reached|usage limit|try again later|unable to generate|cannot generate|couldn.t generate/i.test(r.text||''))throw Error('The provider reported a limit or generation problem. Review its reply; regenerate after resolving it.');
    }
    await sleep(2000);
  }
  throw Error('No completed image detected in 15 minutes. Review the provider, then resume or regenerate.');
}
async function pngBlob(image){
  try{
    const {data}=await message('pixels',{url:image.url});return await (await fetch(data)).blob();
  }catch{
    const url=new URL(image.url);
    if(url.protocol!=='https:'||!(/(^|\.)(chatgpt\.com|oaiusercontent\.com|blob\.core\.windows\.net|openai\.com|googleusercontent\.com|storage\.googleapis\.com|labs\.google|flow\.google|flow\.google\.com)$/.test(url.hostname)))throw Error('Unsupported image host. Image remains in the provider; no frame was marked saved.');
    const response=await fetch(url.href,{credentials:'include',signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw Error(`Image download failed (${response.status}). Resume to retry.`);
    const blob=await response.blob();if(!blob.type.startsWith('image/'))throw Error('Download response was not an image.');
    const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
    return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG conversion failed.')),'image/png'));
  }
}
async function downloadFinished(id){
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    const [item]=await chrome.downloads.search({id});
    if(!item)throw Error('Download no longer exists in Chrome history.');
    if(item.state==='complete')return;
    if(item.state==='interrupted')throw Error(`Download interrupted: ${item.error||'unknown'}. Resume to retry.`);
    await sleep(500);
  }
  throw Error('Download has not completed. Resolve it in Chrome Downloads, then resume.');
}
async function saveFrame(frame,image){
  const blob=await pngBlob(image),url=URL.createObjectURL(blob);
  try{
    frame.downloadId=await chrome.downloads.download({url,filename:`${job.folder}/${filename(frame)}`,saveAs:false,conflictAction:'uniquify'});
    frame.status='downloading';await persist();await downloadFinished(frame.downloadId);
    frame.status='done';frame.dimensions=`${image.width} × ${image.height}`;await persist();
  }finally{URL.revokeObjectURL(url);}
}
function resetFrame(frame){
  for(const key of ['marker','context','provider','downloadId','submission','error'])delete frame[key];
  frame.status='pending';
}
async function processFrame(frame,retrying=false){
  if(frame.downloadId){
    const [existing]=await chrome.downloads.search({id:frame.downloadId});
    if(existing?.state==='complete'&&existing.exists){frame.status='done';delete frame.error;await persist();return;}
  }
  if(retrying&&frame.marker){
    // Recover an already-created image before spending another generation.
    const prior=await message('inspect',{marker:frame.marker,prompt:frame.prompt,context:frame.context});
    if(prior.context)frame.context=prior.context;
    if(prior.found&&prior.images?.length===1){
      const image=await waitImage(frame);await saveFrame(frame,image);delete frame.error;return;
    }
    const ready=await message('probe');
    if(ready.busy||ready.hasDraft)throw Error('The website is still generating or contains an unsent draft. Resolve it before retrying this frame.');
    resetFrame(frame);await persist();
  }
        if(frame.downloadId){
          const [old]=await chrome.downloads.search({id:frame.downloadId});
          if(old?.state==='complete'&&old.exists){frame.status='done';await persist();return;}
          if(old?.state==='in_progress'){await downloadFinished(frame.downloadId);frame.status='done';await persist();return;}
          delete frame.downloadId;
        }
        if(!frame.marker){
          const prepared=await message('prepare');frame.context=prepared.context;frame.provider=job.provider;
          frame.marker=`DRCOMP_${job.id}_${frame.number}_${crypto.randomUUID().slice(0,8)}`;
          frame.status='waiting';await persist();
          const sent=await message('send',{marker:frame.marker,prompt:frame.prompt,context:frame.context});
          if(sent.context)frame.context=sent.context;frame.submission=sent.unconfirmed?'unconfirmed':'acknowledged';await persist();
        }
        if(job.provider==='chatgpt'&&!frame.submission){
          // Migrate a waiting frame whose older adapter filled text but threw before clicking Send.
          const recovered=await message('recover',{marker:frame.marker,prompt:frame.prompt,context:frame.context});
          if(recovered.context)frame.context=recovered.context;
          if(recovered.sent||recovered.alreadySent)frame.submission='acknowledged';
          else if(recovered.unconfirmed)frame.submission='unconfirmed';
          await persist();
        }
        const image=await waitImage(frame);check();frame.status='saving';await persist();await saveFrame(frame,image);

  delete frame.error;
}
async function retryFailed(numbers){
  if(running||!job)return;
  const selected=job.frames.filter(f=>f.status==='failed'&&(!numbers||numbers.includes(f.number))).map(f=>f.number);
  if(!selected.length)return;
  await run(selected,true);
}
async function run(numbers=null,retrying=false){
  if(running||!job)return;
  await navigator.locks.request('reza-frame-batch',{ifAvailable:true},async lock=>{
    if(!lock){status('Another panel is running this batch.');return;}
    let stopped=false;
    try{
      job.folder=safeName($('folder').value);job.delay=Math.min(3600,Math.max(10,Number($('delay').value)||20));
      const tabId=Number($('tabs').value);if(!tabId)throw Error('Open the selected provider and refresh tabs.');
      const frames=job.frames.filter(f=>numbers?numbers.includes(f.number)&&f.status!=='done':f.status!=='done'&&f.status!=='failed');
      if(!frames.length){status('No pending frames. Use Generate failed items to retry failures.');return;}
      const pending=frames.find(f=>f.marker&&(f.provider||job.provider||'chatgpt')!==provider());
      if(pending)throw Error('Select the original provider for these frames before resuming or retrying.');
      if(provider()==='flow'&&!$('flow-ready').checked)throw Error('In Flow, select Image, Nano Banana and one output, then check the setup box.');
      await attach();job.tabId=tabId;job.provider=provider();running=true;paused=false;await persist();
      for(const frame of frames){
        check();status(`Working on frame ${frame.number}…`);
        try{
          await processFrame(frame,retrying);await persist();
        }catch(e){
          if(paused)throw e;
          frame.status='failed';frame.error=e.message;frame.failedAt=new Date().toISOString();await persist();
          let ready;try{ready=await message('probe');}catch{}
          // Do not queue into an active generation, an unsent draft, a disconnected page or an account limit.
          if(!ready?.composer||ready.busy||ready.hasDraft||/limit|quota|sign.in|original.*project|original.*provider|conversation used/i.test(e.message)){
            stopped=true;status(`Frame ${frame.number} failed: ${e.message} Queue paused; remaining items are pending.`);break;
          }
        }
        if(frame!==frames.at(-1))for(let n=0;n<job.delay;n++){check();await sleep(1000);}
      }
      if(!stopped){const failed=job.frames.filter(f=>f.status==='failed').length;status(failed?`Batch finished · ${failed} failed. Retry individual rows or Generate failed items.`:'Complete — every selected frame has been downloaded.');}
    }catch(e){status(e.message);}finally{running=false;await persist();}
  });
}
$('file').onchange=async()=>{
  try{
    const file=$('file').files[0];if(!file)return;
    const frames=parse(await file.text());
    if(job&&!confirm('Replace the current queue? Existing downloaded images stay on your computer.'))return;
    job={id:crypto.randomUUID().slice(0,8),source:file.name,folder:safeName(file.name.replace(/\.txt$/i,'')),delay:20,provider:provider(),frames};
    $('folder').value=job.folder;await persist();status(`Loaded ${frames.length} frames. Ready.`);
  }catch(e){status(e.message);}
};
async function refreshDownloadSetting(){
  $('auto-downloads').checked=false;
  $('download-setting').textContent='Click to enable Chrome’s per-site automatic downloads setting.';
  try{
    const id=Number($('tabs').value);if(!id)return;
    if(!await chrome.permissions.contains({permissions:['contentSettings']}))return;
    const tab=await chrome.tabs.get(id),origin=siteOrigin(tab.url);
    const r=await chrome.contentSettings.automaticDownloads.get({primaryUrl:origin+'/'});
    const rules=(await chrome.storage.local.get('downloadRules')).downloadRules||{};
    $('auto-downloads').checked=!!rules[origin]&&r.setting==='allow';
    $('download-setting').textContent=r.setting==='allow'?`Chrome allows multiple downloads for ${origin}.`:`Chrome automatic downloads: ${r.setting}.`;
  }catch(e){$('download-setting').textContent=e.message;}
}
$('auto-downloads').onchange=async()=>{
  const enabled=$('auto-downloads').checked;
  $('auto-downloads').disabled=true;
  try{
    // Request immediately in the click gesture, before other asynchronous calls.
    if(enabled&&!await chrome.permissions.request({permissions:['contentSettings']}))throw Error('Permission was not granted. No download setting was changed.');
    const id=Number($('tabs').value);if(!id)throw Error('Select the website tab first.');
    const tab=await chrome.tabs.get(id);
    await applyAutomaticDownloads(chrome,tab.url,enabled);
    await refreshDownloadSetting();
  }catch(e){$('auto-downloads').checked=false;$('download-setting').textContent=e.message;}finally{$('auto-downloads').disabled=running;}
};
$('download-settings').onclick=()=>chrome.tabs.create({url:'chrome://settings/content/automaticDownloads'});
$('start').onclick=()=>run();
$('retry-failed').onclick=()=>retryFailed();$('pause').onclick=()=>{paused=true;status('Pausing after the current operation…');};
$('retry').onclick=async()=>{
  const frame=job?.frames.find(f=>f.status!=='done');if(!frame)return;
  if(!confirm(`Send a NEW generation for frame ${frame.number}? This may consume another generation. Review the provider first.`))return;
  resetFrame(frame);await persist();status('Frame reset. Click Start / Resume.');
};
$('open').onclick=async()=>{await chrome.tabs.create({url:PROVIDERS[provider()].url});await refresh();};
$('provider').onchange=async()=>{$('connection').textContent='Not connected';await refresh();};
$('tabs').onchange=async()=>{$('connection').textContent='Not connected';await refreshDownloadSetting();};
$('connect').onclick=async()=>{try{await attach();status('Connection ready.');}catch(e){status(e.message);}};
$('map').onclick=async()=>{
  if(provider()==='chatgpt'){status('ChatGPT controls are detected automatically. Click Start / Resume.');return;}
  try{
    const id=Number($('tabs').value);if(!id)throw Error('Open the provider and refresh tabs first.');
    await connect(chrome,id,provider());await chrome.tabs.update(id,{active:true});
    status('Follow the green instructions on the webpage. Escape cancels mapping.');
    $('map').disabled=true;
    const r=await chrome.tabs.sendMessage(id,{type:'calibrate',provider:provider()});
    if(!r?.ok)throw Error(r?.error||'Mapping failed.');await attach();status('Controls mapped. Ready to start.');
  }catch(e){status(e.message);}finally{$('map').disabled=false;}
};
$('refresh').onclick=refresh;$('show').onclick=()=>chrome.downloads.showDefaultFolder();
$('export').onclick=async()=>{
  if(!job)return;const url=URL.createObjectURL(new Blob([JSON.stringify(job,null,2)],{type:'application/json'}));
  try{const id=await chrome.downloads.download({url,filename:`${job.folder}/progress.json`,saveAs:false,conflictAction:'uniquify'});await downloadFinished(id);}catch(e){status(e.message);}finally{URL.revokeObjectURL(url);}
};
window.addEventListener('beforeunload',event=>{if(running){event.preventDefault();event.returnValue='';}});
if(job){$('provider').value=job.provider||'chatgpt';$('folder').value=job.folder;$('delay').value=job.delay;status('Saved queue restored. Select its provider tab and resume.');}
render();await refresh();
