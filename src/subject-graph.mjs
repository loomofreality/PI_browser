// Expand the circle just enough to keep full rectangular labels separated.
export function circularLayout(count, nodeWidth, nodeHeight) {
  const points = Array.from({length: count}, (_, i) => {
    const angle = -Math.PI / 2 + i * 2 * Math.PI / count;
    return [Math.cos(angle), Math.sin(angle)];
  });
  let radius = 230;
  const all = [[0, 0], ...points];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const dx = Math.abs(all[i][0] - all[j][0]), dy = Math.abs(all[i][1] - all[j][1]);
    radius = Math.max(radius, Math.min((nodeWidth + 24) / dx, (nodeHeight + 24) / dy));
  }
  radius = Math.ceil(radius);
  const width = 2 * radius + nodeWidth + 40, height = 2 * radius + nodeHeight + 40;
  const center = [width / 2, height / 2];
  return {width, height, center, neighbors: points.map(([x, y]) => [center[0] + radius * x, center[1] + radius * y])};
}

// Wrap a label to the line width whose text block fits the smallest circle.
// Lines are 16px apart; each line's outer corners set the radius.
export function circleLabel(name,measure,lineHeight=16,padding=8){
  const words=name.split(/\s+/).filter(Boolean),space=measure(' ');
  const widths=words.map(measure),longest=Math.max(0,...widths),total=widths.reduce((a,b)=>a+b,0)+space*Math.max(0,words.length-1);
  let best=null;
  for(let limit=longest;;limit=Math.min(total,limit+2)){
    const lines=[];let line=null,width=0;
    words.forEach((word,i)=>{if(line!==null&&width+space+widths[i]<=limit+1e-6){line+=' '+word;width+=space+widths[i];}else{if(line!==null)lines.push([line,width]);line=word;width=widths[i];}});
    if(line!==null)lines.push([line,width]);
    const half=lines.length*lineHeight/2,radius=Math.max(lineHeight/2,...lines.map(([,w],i)=>Math.hypot(w/2,Math.max(Math.abs(i*lineHeight-half),Math.abs((i+1)*lineHeight-half)))))+padding;
    if(!best||radius<best.radius-1e-6)best={lines:lines.map(([text])=>text),radius:Math.ceil(radius)};
    if(limit>=total)return best;
  }
}

// Ring neighbors around the focus so each touches it. A single ring is pushed
// out only as far as needed to keep neighbors from overlapping one another;
// when further rings packed outside a touching inner ring are more compact,
// those are used instead.
function placeRing(radii,inner,gap){
  const n=radii.length,angleBetween=(i,j,s)=>{
    const a=inner+radii[i]+gap+s,b=inner+radii[j]+gap+s,c=radii[i]+radii[j]+gap;
    return Math.acos(Math.max(-1,Math.min(1,(a*a+b*b-c*c)/(2*a*b))));
  };
  const turn=s=>n===2?2*angleBetween(0,1,s):radii.reduce((sum,_,i)=>sum+angleBetween(i,(i+1)%n,s),0);
  let push=0;
  if(n>2&&turn(0)>2*Math.PI+1e-9){
    let low=0,high=1;while(turn(high)>2*Math.PI)high*=2;
    for(let k=0;k<60;k++){const mid=(low+high)/2;if(turn(mid)>2*Math.PI)low=mid;else high=mid;}
    push=high;
  }
  const spare=n>1?(2*Math.PI-turn(push))/n:0,points=[];
  let angle=-Math.PI/2;
  for(let i=0;i<n;i++){
    const distance=inner+radii[i]+gap+push;points.push({x:distance*Math.cos(angle),y:distance*Math.sin(angle),r:radii[i]});
    angle+=angleBetween(i,(i+1)%n,push)+spare;
  }
  return {points,push,outer:Math.max(inner,...points.map(p=>Math.hypot(p.x,p.y)+p.r))};
}
export function ringLayout(focusRadius,radii,gap=2,margin=24){
  let points=placeRing(radii,focusRadius,gap).points;
  const extent=list=>Math.max(focusRadius,...list.map(p=>Math.hypot(p.x,p.y)+p.r));
  if(radii.length>6){
    const rings=[];let inner=focusRadius;
    for(let start=0;start<radii.length;){
      let count=1;while(start+count<radii.length&&placeRing(radii.slice(start,start+count+1),inner,gap).push===0)count++;
      const ring=placeRing(radii.slice(start,start+count),inner,gap);
      // Outer rings settle inward along their rays into the gaps of the ring inside.
      if(rings.length)for(const p of ring.points){
        const length=Math.hypot(p.x,p.y),ux=p.x/length,uy=p.y/length;
        const clear=d=>rings.every(q=>Math.hypot(ux*d-q.x,uy*d-q.y)>=p.r+q.r+gap-1e-9);
        let high=focusRadius+p.r+gap;while(!clear(high))high+=1;
        let low=high-1;
        if(low>=focusRadius+p.r+gap)for(let k=0;k<40;k++){const mid=(low+high)/2;if(clear(mid))high=mid;else low=mid;}
        p.x=ux*high;p.y=uy*high;rings.push(p);
      }
      else rings.push(...ring.points);
      inner=ring.outer;start+=count;
    }
    if(extent(rings)<extent(points))points=rings;
  }
  const xs=[-focusRadius,focusRadius,...points.flatMap(p=>[p.x-p.r,p.x+p.r])],ys=[-focusRadius,focusRadius,...points.flatMap(p=>[p.y-p.r,p.y+p.r])];
  const left=Math.min(...xs)-margin,top=Math.min(...ys)-margin;
  return {width:Math.max(...xs)+margin-left,height:Math.max(...ys)+margin-top,center:[-left,-top],neighbors:points.map(p=>[p.x-left,p.y-top])};
}
