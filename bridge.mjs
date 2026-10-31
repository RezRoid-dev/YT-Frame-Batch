export const PROVIDERS = {
  chatgpt:{name:'ChatGPT',url:'https://chatgpt.com/',patterns:['https://chatgpt.com/*']},
  flow:{name:'Google Flow',url:'https://labs.google/fx/tools/flow',patterns:['https://labs.google/*','https://flow.google/*','https://flow.google.com/*']}
};
export async function connect(chrome,tabId,provider){
  const tab=await chrome.tabs.get(tabId);
  const url=new URL(tab.url||'about:blank');
  const allowed=provider==='chatgpt'?['chatgpt.com']:['labs.google','flow.google','flow.google.com'];
  if(!allowed.includes(url.hostname))throw Error(`Select a ${PROVIDERS[provider].name} tab.`);
  let reply;
  try{reply=await chrome.tabs.sendMessage(tabId,{type:'probe',provider});}catch{}
  if(!reply?.ok||reply.version!==6){
    try{await chrome.scripting.executeScript({target:{tabId},files:['content.js']});}
    catch(e){throw Error(`Chrome could not attach to this page: ${e.message}. Check extension Site access, allow this site, and reload the page.`);}
    reply=await chrome.tabs.sendMessage(tabId,{type:'probe',provider});
  }
  if(reply?.ok&&reply.version!==6)throw Error('An older page adapter is still active. Reload the website once, then Connect / Repair.');
  if(!reply?.ok)throw Error(reply?.error||'Page adapter did not respond. Reload this page once after upgrading.');
  return reply;
}
