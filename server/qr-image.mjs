const signature=Buffer.from([137,80,78,71,13,10,26,10]);
export function readPng(input,maxBytes=8*1024*1024){
  if(typeof input!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input)||input.length>Math.ceil(maxBytes*4/3)+24)throw Error('二维码图片格式或大小无效');
  const buffer=Buffer.from(input.slice(22),'base64');
  if(buffer.length<33||buffer.length>maxBytes||!buffer.subarray(0,8).equals(signature)||buffer.toString('ascii',12,16)!=='IHDR')throw Error('二维码图片不是有效 PNG');
  const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);
  if(!width||!height||width>4096||height>4096||width*height>9_000_000)throw Error('二维码图片尺寸过大');
  return {buffer,width,height};
}
