const allowed=new Set(['chatgpt.com','labs.google','flow.google','flow.google.com']);
export function siteOrigin(url){
 const u=new URL(url);if(u.protocol!=='https:'||!allowed.has(u.hostname))throw Error('Select a ChatGPT or Flow tab first.');return u.origin;
}
export async function applyAutomaticDownloads(chrome,url,enabled){
 const origin=siteOrigin(url),api=chrome.contentSettings?.automaticDownloads;
 if(!api)throw Error('Chrome did not grant the content settings permission.');
 const previous=(await chrome.storage.local.get('downloadRules')).downloadRules||{};
 const next={...previous};if(enabled)next[origin]=true;else delete next[origin];
 // Clear only this extension's automatic-download rules, never the user's rules.
 const apply=async rules=>{await api.clear({scope:'regular'});for(const site of Object.keys(rules))await api.set({primaryPattern:site+'/*',setting:'allow',scope:'regular'});};
 try{
  await apply(next);
  const actual=await api.get({primaryUrl:origin+'/'});
  if(enabled&&actual.setting!=='allow')throw Error('Chrome policy or another extension prevents allowing automatic downloads.');
  await chrome.storage.local.set({downloadRules:next});return actual.setting;
 }catch(e){await apply(previous);throw e;}
}
