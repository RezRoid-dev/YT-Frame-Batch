export function safeName(value){
  const name=value.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,100);
  if(!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw Error('Choose a valid folder name.');
  return name;
}
export function seconds(t){
  const m=/^(\d{2}):([0-5]\d):([0-5]\d)[.,](\d{3})$/.exec(t);
  if(!m) throw Error(`Invalid timestamp: ${t}`);
  return (+m[1]*3600 + +m[2]*60 + +m[3])*1000 + +m[4];
}
export function parse(text){
  const chunks=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim().split(/(?=^IMAGE\s+\d+\s*$)/m).filter(s=>s.trim()&&!/^[-\s]+$/.test(s));
  if(!chunks.length) throw Error('No IMAGE entries found. Upload the output TXT, not the master prompt.');
  const seen=new Set(); let end=null;
  return chunks.map(chunk=>{
    const m=/^IMAGE\s+(\d+)\s*\nTIME:\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*\n\s*PROMPT:\s*\n([\s\S]+?)\s*$/.exec(chunk);
    if(!m) throw Error('Malformed entry. Expected IMAGE, TIME and PROMPT lines.');
    const number=Number(m[1]),start=m[2].replace(',','.'),stop=m[3].replace(',','.');
    const prompt=m[4].replace(/\n\s*---\s*$/,'').trim();
    if(!number||seen.has(number)) throw Error(`Invalid or duplicate IMAGE ${number}`);
    if(seconds(stop)<=seconds(start)) throw Error(`IMAGE ${number}: end must follow start.`);
    if(end!==null&&seconds(start)!==end) throw Error(`IMAGE ${number}: timeline has a gap or overlap.`);
    if(!prompt) throw Error(`IMAGE ${number}: empty prompt.`);
    seen.add(number);end=seconds(stop);
    return {number,start,end:stop,prompt,status:'pending'};
  });
}
export function filename(frame){
  const clean=s=>s.replace(/[:.]/g,'-');
  return `FRAME_${String(frame.number).padStart(3,'0')}__${clean(frame.start)}__${clean(frame.end)}.png`;
}
