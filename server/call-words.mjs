export function callWords(template,viewer,language='zh-CN') {
  const fallback=language==='en-US'?"It is {name}'s turn. Please get ready.":'轮到 {name} 了，请做好准备。';
  return (template?.trim()||fallback).replace(/\{(name|uid)\}/g,(_,key)=>String(key==='name'?viewer.username:viewer.uid)).slice(0,500);
}
