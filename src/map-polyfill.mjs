// PDF.js 6 uses Map/WeakMap getOrInsert, getOrInsertComputed and Math.sumPrecise, which only
// the newest browsers provide. Define them where missing (same behaviour as
// the standard methods) before PDF.js or its worker loads.
for(const Type of [Map,WeakMap]){
  const proto=Type.prototype;
  if(typeof proto.getOrInsert!=='function')Object.defineProperty(proto,'getOrInsert',{configurable:true,writable:true,value(key,value){if(!this.has(key))this.set(key,value);return this.get(key);}});
  if(typeof proto.getOrInsertComputed!=='function')Object.defineProperty(proto,'getOrInsertComputed',{configurable:true,writable:true,value(key,callback){if(!this.has(key))this.set(key,callback(key));return this.get(key);}});
}
// PDF.js 6 also uses Math.sumPrecise when measuring fonts.
if(typeof Math.sumPrecise!=='function')Object.defineProperty(Math,'sumPrecise',{configurable:true,writable:true,value(values){
  let sum=0,compensation=0,count=0;
  for(const value of values){if(typeof value!=='number')throw TypeError('Math.sumPrecise requires numbers');count++;const next=sum+value;compensation+=Math.abs(sum)>=Math.abs(value)?(sum-next)+value:(value-next)+sum;sum=next;}
  return count?sum+compensation:-0;
}});
