(()=>{
  if(globalThis.__drcompAdapterV6)return;
  globalThis.__drcompAdapterV6=true;
  const visible=el=>!!el&&el.getClientRects().length>0;
  const query=selector=>{try{return selector?document.querySelector(selector):null;}catch{return null;}};
  // ChatGPT is always automatic; ignore legacy manual mappings, including voice buttons.
  const getConfig=async provider=>provider==='chatgpt'?{}:(await chrome.storage.local.get('bindings')).bindings?.[provider]||{};
  const editorFor=(provider,c)=>query(c.editor)||[...document.querySelectorAll(provider==='chatgpt'?'#prompt-textarea,textarea[placeholder],div[contenteditable="true"][role="textbox"]':'textarea,div[contenteditable="true"][role="textbox"],div[contenteditable="true"]')].find(visible);
  const buttonFor=(provider,c,editor)=>{
    if(provider==='chatgpt'){
      const candidate=query('[data-testid="send-button"],[data-testid="composer-send-button"],button[aria-label="Send prompt"],button[aria-label="Send message"],button[aria-label="Send"],button[aria-label="ارسال پیام"]');
      const label=[candidate?.getAttribute('aria-label'),candidate?.getAttribute('title')].filter(Boolean).join(' ');
      // Never use Chat mode, voice, dictation or a generic submit button as a fallback.
      return visible(candidate)&&!/voice|dictat|microphone|chat mode|صوت|میکروفون/i.test(label)?candidate:null;
    }
    const mapped=query(c.button);if(mapped)return mapped;
    const scope=editor?.closest('form')||document;
    const buttons=[...scope.querySelectorAll('button')].filter(visible);
    return buttons.find(b=>/^(generate|create|send)( image)?$/i.test(b.getAttribute('aria-label')||b.innerText?.trim()||''))||buttons.find(b=>b.innerText?.trim()==='arrow_forward');
  };
  const imageKey=value=>{
    try{const u=new URL(value,location.href);for(const k of [...u.searchParams.keys()])if(/^(x-goog-|x-amz-|signature$|expires$|sig$|se$|sp$|sv$)/i.test(k))u.searchParams.delete(k);return u.href;}catch{return value;}
  };
  const imgs=root=>[...root.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth>=256&&i.naturalHeight>=256).map(i=>({url:i.currentSrc||i.src,width:i.naturalWidth,height:i.naturalHeight}));
  const normalize=text=>(text||'').replace(/\s+/g,' ').trim();
  function chatTurns(){
    const seen=new Set(),turns=[];
    for(const node of document.querySelectorAll('[data-testid^="conversation-turn"],[data-turn="user"],[data-turn="assistant"],[data-message-author-role]')){
      const root=node.closest('[data-testid^="conversation-turn"],article[data-turn]')||node;
      if(seen.has(root))continue;
      const message=root.matches?.('[data-message-author-role]')?root:root.querySelector?.('[data-message-author-role]');
      const role=root.getAttribute?.('data-turn')||message?.getAttribute?.('data-message-author-role')||node.dataset?.messageAuthorRole;
      if(!['user','assistant'].includes(role))continue;
      seen.add(root);
      const id=message?.getAttribute?.('data-message-id')||root.getAttribute?.('data-message-id')||root.id||root.getAttribute?.('data-testid')||null;
      turns.push({root,role,id,text:normalize(root.textContent)});
    }
    return turns;
  }
  function workAnchor(marker,prompt){
    // ChatGPT Work does not always expose classic message-role/turn attributes.
    // Locate the actual request text, never the last image on the page.
    if(!document.createTreeWalker)return null;
    const scope=document.querySelector('main')||document.body;
    if(!scope)return null;
    const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT),matches=new Set(),headers=new Set();
    const needle=normalize(prompt),prefix=needle.slice(0,120);let node,visited=0;
    while((node=walker.nextNode())&&visited++<30000){
      const text=normalize(node.nodeValue);
      if(!text.includes(marker)&&!(prefix.length>=30&&text.includes(prefix)))continue;
      let el=node.parentElement;
      if(!el||!visible(el)||el.closest('#prompt-textarea,[contenteditable="true"],textarea,nav,aside,[role="complementary"],header'))continue;
      for(let depth=0;el&&depth<6;depth++,el=el.parentElement){
        if(el===scope||el===document.body)break;
        const value=normalize(el.innerText||el.textContent);
        if(value.includes(marker)||(needle&&value.includes(needle))){matches.add(el);if(text.includes('[DrComp frame '+marker+']'))headers.add(el);break;}
      }
    }
    if(headers.size===1)return [...headers][0];
    if(matches.size===1)return [...matches][0];
    // A token can be repeated across separate paragraphs of the same user bubble.
    const parts=[...matches];let common=parts[0];
    while(common&&parts.some(el=>!common.contains?.(el)))common=common.parentElement;
    if(common&&common!==scope&&common!==document.body&&!imgs(common).length)return common;
    return null;
  }
  function inspectWork(marker,prompt,context){
    const anchor=workAnchor(marker,prompt);if(!anchor)return {found:false,context};
    // Stop before the next batch request, so a later frame can never be saved as this one.
    const scope=document.querySelector('main')||document.body;
    const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);let node,next=null;
    while((node=walker.nextNode())){
      if(!/\[DrComp frame (?:DRCOMP|REZA)_/.test(node.nodeValue||'')||(node.nodeValue||'').includes(marker))continue;
      const el=node.parentElement;
      if(!el||!visible(el)||el.closest('#prompt-textarea,[contenteditable="true"],textarea,nav,aside,[role="complementary"],header'))continue;
      if(anchor.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING){next=el;break;}
    }
    const before=new Set(context.beforeImages||[]);
    const images=[...scope.querySelectorAll('img')].filter(img=>{
      if(!visible(img)||!img.complete||img.naturalWidth<256||img.naturalHeight<256)return false;
      const rect=img.getBoundingClientRect?.();if(rect&&(rect.width<128||rect.height<72))return false;
      if(img.closest('nav,aside,[role="complementary"],header,[contenteditable="true"]'))return false;
      if(!(anchor.compareDocumentPosition(img)&Node.DOCUMENT_POSITION_FOLLOWING))return false;
      if(next&&!(img.compareDocumentPosition(next)&Node.DOCUMENT_POSITION_FOLLOWING))return false;
      return !before.has(imageKey(img.currentSrc||img.src));
    }).map(img=>({url:img.currentSrc||img.src,width:img.naturalWidth,height:img.naturalHeight}));
    return {found:true,context:{...context,layout:'work'},busy:!!query('[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="Stop response"]'),images,text:''};
  }
  function inspectChat(marker,prompt='',context={}){
    context=context||{};
    const page=location.href.split('#')[0];
    if(context.chatPage&&context.chatPage!==page)throw Error('Return to the conversation used for this frame before resuming.');
    const turns=chatTurns();
    let index=turns.findLastIndex(t=>t.role==='user'&&t.text.includes(marker));
    if(index<0&&context.userId)index=turns.findIndex(t=>t.role==='user'&&t.id===context.userId);
    if(index<0&&prompt){
      const needle=normalize(prompt);
      const candidates=turns.map((t,i)=>({t,i})).filter(({t})=>t.role==='user'&&t.text.includes(needle)&&!(context.beforeIds||[]).includes(t.id));
      if(candidates.length===1)index=candidates[0].i;
    }
    let replies=[];
    if(index>=0){
      for(const turn of turns.slice(index+1)){if(turn.role==='user')break;if(turn.role==='assistant')replies.push(turn);}
      context={...context,userId:turns[index].id||context.userId,chatPage:/\/c\//.test(page)?page:undefined};
    }else if(context.assistantId&&context.chatPage===page){
      // A previously observed assistant turn can survive when ChatGPT unmounts its user turn.
      const reply=turns.find(t=>t.role==='assistant'&&t.id===context.assistantId);
      if(reply)replies=[reply];
    }
    if(index<0&&!replies.length)return inspectWork(marker,prompt,context);
    const last=replies.at(-1);if(last?.id)context.assistantId=last.id;
    return {found:true,context,busy:!!query('[data-testid="stop-button"],button[aria-label="Stop generating"]'),images:replies.flatMap(t=>imgs(t.root)),text:replies.map(t=>t.text).join('\n').slice(-2000)};
  }
  function resultRoot(c){const root=query(c.results);if(!root)throw Error('Flow results area is not mapped or has changed. Click Map controls.');return root;}
  function inspectFlow(m,c){
    if(!m.context?.before)throw Error('Missing Flow recovery record. Review Flow before regenerating this frame.');
    if(location.href.split('#')[0]!==m.context.page)throw Error('Return to the original Flow project before resuming.');
    const root=resultRoot(c),before=new Set(m.context.before);
    return {found:true,busy:!!root.querySelector('[role="progressbar"],[aria-busy="true"]'),images:imgs(root).filter(i=>!before.has(imageKey(i.url))),text:''};
  }
  const editorText=editor=>editor?(typeof editor.value==='string'?editor.value:editor.innerText||editor.textContent||''):'';
  const sameDraft=(editor,text)=>normalize(editorText(editor))===normalize(text);
  async function fill(editor,text,provider,c){
    if(sameDraft(editor,text))return;
    if(editorText(editor).trim())throw Error('The prompt box contains a different unsent draft. It was left unchanged.');
    editor.focus();
    if(editor.tagName==='TEXTAREA'||editor.tagName==='INPUT'){
      const proto=editor.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(editor,text);
      editor.dispatchEvent(new Event('input',{bubbles:true}));
      editor.dispatchEvent(new Event('change',{bubbles:true}));
    }else{
      const range=document.createRange();range.selectNodeContents(editor);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
      document.execCommand('insertText',false,text);
      editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
    }
    await new Promise(r=>setTimeout(r,700));
    // Rich editors turn line breaks into paragraphs and may replace the original DOM node.
    // Compare the entire normalized draft on the current live editor, not a raw 80-character prefix.
    const deadline=Date.now()+5000;
    do{
      if(sameDraft(editorFor(provider,c),text))return;
      await new Promise(r=>setTimeout(r,200));
    }while(Date.now()<deadline);
    throw Error('Could not verify the full prompt in the current composer. Nothing was sent. Resume retries a matching draft without appending text.');
  }
  const submitted=new Set();
  async function send(m,c){
    if(m.provider==='chatgpt'){const prior=inspectChat(m.marker,m.prompt,m.context);if(prior.found)return {alreadySent:true,context:prior.context};}
    if(submitted.has(m.marker)&&m.existingOnly)return {unconfirmed:true,context:m.context};
    if(submitted.has(m.marker))throw Error('This request was already clicked but is not yet visible. Wait and resume; it will not be submitted twice.');
    if(m.provider==='chatgpt'&&query('[data-testid="stop-button"]'))throw Error('ChatGPT is still responding. Wait before continuing.');
    if(m.provider==='flow')inspectFlow(m,c);
    const editor=editorFor(m.provider,c);
    if(!visible(editor))throw Error(m.provider==='chatgpt'?'ChatGPT prompt box is not ready. Open a normal chat, let the page load, then Resume.':'Flow prompt box not found. Open a project or map its controls.');
    const text=m.provider==='flow'?m.prompt:`[DrComp frame ${m.marker}]\nGenerate exactly ONE image now using the following prompt. Use image generation, not a written description. This is an independent image. Request tracking ID: ${m.marker}. Never render the tracking ID or any text inside the image.\n\n${m.prompt}`;
    if(m.existingOnly&&!sameDraft(editor,text))return {pending:true};
    await fill(editor,text,m.provider,c);
    let button=null;
    const readyUntil=Date.now()+15000;
    do{
      // React may replace the composer controls only after the input event renders.
      const candidate=buttonFor(m.provider,c,editorFor(m.provider,c));
      if(visible(candidate)&&!candidate.disabled&&candidate.getAttribute('aria-disabled')!=='true'){button=candidate;break;}
      await new Promise(r=>setTimeout(r,250));
    }while(Date.now()<readyUntil);
    if(!button)throw Error(m.provider==='chatgpt'?'Prompt filled, but ChatGPT has not enabled Send. The prompt remains in the box: send it once manually, then Resume.':'Flow Generate button unavailable. Check the project or map its controls again.');
    button.click();submitted.add(m.marker);
    if(m.provider==='chatgpt'){
      const until=Date.now()+60000;
      while(Date.now()<until){
        const acknowledged=inspectChat(m.marker,m.prompt,m.context);
        if(acknowledged.found)return {sent:true,context:acknowledged.context};
        await new Promise(r=>setTimeout(r,500));
      }
      return {sent:true,unconfirmed:true,context:m.context};
    }
    return {sent:true,context:m.context};
  }
  function selector(el){
    if(el.id)return '#'+CSS.escape(el.id);
    const path=[];
    while(el&&el!==document.documentElement){
      let part=el.tagName.toLowerCase();
      const siblings=el.parentElement?[...el.parentElement.children].filter(x=>x.tagName===el.tagName):[];
      part+=`:nth-of-type(${siblings.indexOf(el)+1})`;path.unshift(part);el=el.parentElement;
      if(el?.id){path.unshift('#'+CSS.escape(el.id));break;}
    }
    return path.join(' > ');
  }
  let picking=false;
  async function calibrate(provider){
    if(picking)throw Error('Mapping is already open. Press Escape on the page to cancel.');
    picking=true;
    const steps=provider==='flow'?['editor','button','results']:['editor','button'];
    const config={};let current=null,index=0;
    const overlay=document.createElement('div'),label=document.createElement('div');
    Object.assign(overlay.style,{position:'fixed',pointerEvents:'none',border:'3px solid #41dfab',zIndex:'2147483646',background:'rgba(65,223,171,.12)'});
    Object.assign(label.style,{position:'fixed',top:'10px',left:'10px',maxWidth:'540px',padding:'16px',borderRadius:'10px',background:'#102522',color:'#fff',font:'16px system-ui',zIndex:'2147483647',pointerEvents:'none'});
    document.documentElement.append(overlay,label);
    const describe=()=>{label.textContent=steps[index]==='editor'?'DrComp: click the empty prompt box. Esc cancels.':steps[index]==='button'?'DrComp: click the Generate / Send button. This mapping click will NOT submit.':'DrComp: hover over the generated-image grid. Press ↑ to expand selection to its container, then Enter to select. Choose the persistent results grid, not one image. Esc cancels.';};
    const highlight=()=>{if(!current)return;const r=current.getBoundingClientRect();Object.assign(overlay.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});};
    const move=e=>{current=e.target;if(steps[index]==='editor')current=current.closest('textarea,input,[contenteditable="true"]')||current;if(steps[index]==='button')current=current.closest('button,[role="button"]')||current;highlight();};
    return await new Promise((resolve,reject)=>{
      const finish=()=>{picking=false;overlay.remove();label.remove();document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerdown',pick,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);clearTimeout(timer);};
      const choose=async()=>{
        if(!current)return;
        const step=steps[index];
        if(step==='editor'&&!current.matches('textarea,input,[contenteditable="true"]')){label.textContent='Select the editable prompt box itself.';return;}
        if(step==='button'&&!current.matches('button,[role="button"]')){label.textContent='Select the Generate / Send button.';return;}
        if(step==='results'&&(current.matches('img,body,html')||!current.querySelector('img'))){label.textContent='Select the grid containing generated images. Hover an existing result, press ↑ to expand to its grid, then Enter.';return;}
        config[step]=selector(current);index++;current=null;
        if(index===steps.length){finish();try{const bindings=(await chrome.storage.local.get('bindings')).bindings||{};bindings[provider]=config;await chrome.storage.local.set({bindings});resolve({mapped:true});}catch(e){reject(e);}return;}
        describe();
      };
      const pick=e=>{e.preventDefault();e.stopImmediatePropagation();choose();};
      const click=e=>{e.preventDefault();e.stopImmediatePropagation();};
      const key=e=>{if(['Escape','ArrowUp','Enter'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();}if(e.key==='Escape'){finish();reject(Error('Mapping cancelled.'));}if(e.key==='ArrowUp'&&current?.parentElement){current=current.parentElement;highlight();}if(e.key==='Enter')choose();};
      const timer=setTimeout(()=>{finish();reject(Error('Mapping timed out. Click Map controls to try again.'));},180000);
      document.addEventListener('pointermove',move,true);document.addEventListener('pointerdown',pick,true);document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);describe();
    });
  }
  chrome.runtime.onMessage.addListener((m,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||!['probe','prepare','send','recover','inspect','pixels','calibrate'].includes(m.type))return;
    Promise.resolve().then(async()=>{
      m.provider=m.provider||'chatgpt';const c=await getConfig(m.provider);
      if(m.type==='probe'){const editor=editorFor(m.provider,c);return {version:6,busy:!!query('[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="Stop response"]'),hasDraft:!!editorText(editor).trim(),composer:visible(editor),button:!!buttonFor(m.provider,c,editor),results:m.provider!=='flow'||!!query(c.results)};}
      if(m.type==='calibrate'){if(m.provider==='chatgpt')return {automatic:true};return calibrate(m.provider);}
      if(m.type==='prepare')return m.provider==='flow'?{context:{page:location.href.split('#')[0],before:[...resultRoot(c).querySelectorAll('img')].map(i=>imageKey(i.currentSrc||i.src))}}:{context:{beforeIds:chatTurns().map(t=>t.id).filter(Boolean),beforeImages:[...document.querySelectorAll('img')].map(i=>imageKey(i.currentSrc||i.src))}};
      if(m.type==='send'||m.type==='recover')return send({...m,existingOnly:m.type==='recover'},c);
      if(m.type==='inspect')return m.provider==='flow'?inspectFlow(m,c):inspectChat(m.marker,m.prompt,m.context);
      const img=[...document.images].find(el=>(el.currentSrc||el.src)===m.url);
      if(!img)throw Error('Generated image is no longer visible.');
      const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);
      return {data:canvas.toDataURL('image/png')};
    }).then(result=>respond({ok:true,...result})).catch(e=>respond({ok:false,error:e.message}));return true;
  });
})();
