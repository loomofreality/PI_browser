// Source text files are strictly UTF-8, with a Windows-1252 fallback for older
// translations. Some Node 22 releases decode the 'windows-1252' label as
// ISO-8859-1, which turns bytes 0x80-0x9F (for example the euro sign, curly
// quotes and dashes) into invisible control characters. Decoding the fallback
// explicitly keeps every build identical regardless of the Node patch version.
const HIGH=[0x20AC,0x81,0x201A,0x192,0x201E,0x2026,0x2020,0x2021,0x2C6,0x2030,0x160,0x2039,0x152,0x8D,0x17D,0x8F,
  0x90,0x2018,0x2019,0x201C,0x201D,0x2022,0x2013,0x2014,0x2DC,0x2122,0x161,0x203A,0x153,0x9D,0x17E,0x178];
const utf8=new TextDecoder('utf-8',{fatal:true});

export function decodeWindows1252(bytes){
  const codes=new Uint16Array(bytes.length);
  for(let i=0;i<bytes.length;i++){const b=bytes[i];codes[i]=b>=0x80&&b<0xA0?HIGH[b-0x80]:b;}
  let text='';
  for(let i=0;i<codes.length;i+=8192)text+=String.fromCharCode(...codes.subarray(i,i+8192));
  return text;
}

// Returns {text, fallback}; fallback is true when Windows-1252 was used.
export function decodeSource(bytes){
  try{return {text:utf8.decode(bytes),fallback:false};}
  catch{return {text:decodeWindows1252(bytes),fallback:true};}
}
