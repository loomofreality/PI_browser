import {test} from 'node:test';
import assert from 'node:assert/strict';
import {circleLabel,circularLayout,ringLayout} from '../src/subject-graph.mjs';

test('ring neighborhoods touch the focus where possible and never overlap',()=>{
  const sizes=[[],[40],[40,60],[50,50,50],[50,50,50,50,50,50],[50,50,50,50,50,50,50],[70,30,55,42,64,38,50,46,58],Array.from({length:40},(_,i)=>36+i*7%40)];
  for(const radii of sizes)for(const focus of [40,75]){
    const layout=ringLayout(focus,radii,2,24),circles=[[...layout.center,focus],...layout.neighbors.map((p,i)=>[...p,radii[i]])];
    const clearance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])-a[2]-b[2]-2;
    assert.equal(layout.neighbors.length,radii.length);
    for(let i=0;i<circles.length;i++)for(let j=i+1;j<circles.length;j++)assert.ok(clearance(circles[i],circles[j])>=-1e-6,`${radii} / ${i},${j}`);
    // Up to six neighbors no larger than the focus all rest against it.
    if(radii.length<=6&&radii.every(r=>r<=focus))for(const c of circles.slice(1))assert.ok(clearance(c,circles[0])<1e-6,String(radii));
    // Every neighbor rests against the focus or another neighbor.
    for(const c of circles.slice(1))assert.ok(circles.some(o=>o!==c&&clearance(c,o)<1e-3),String(radii));
    for(const [x,y,r] of circles){assert.ok(x-r>=24-1e-6&&x+r<=layout.width-24+1e-6);assert.ok(y-r>=24-1e-6&&y+r<=layout.height-24+1e-6);}
  }
  // Many neighbors form further rings instead of one wide, hollow ring.
  const many=ringLayout(50,Array(39).fill(50));assert.ok(many.width<900,String(many.width));
});

test('circle labels keep whole words and fit inside their circle',()=>{
  const measure=text=>text.length*7;
  for(const name of ['love','service to humanity','the oneness of the world of humanity and the unity of religions','extraordinarily']){
    const {lines,radius}=circleLabel(name,measure);
    assert.equal(lines.join(' '),name);
    lines.forEach((line,i)=>{const top=i*16-lines.length*8;assert.ok(Math.hypot(measure(line)/2,Math.max(Math.abs(top),Math.abs(top+16)))+8<=radius+1e-6);});
  }
  assert.ok(circleLabel('the oneness of the world of humanity and the unity of religions',measure).lines.length>2);
});

test('circular neighborhoods keep full labels separated and inside the canvas', () => {
  for (const width of [146, 206]) for (let count = 1; count <= 12; count++) for (const height of [40, 68, 116]) {
    const layout = circularLayout(count, width, height), points = [layout.center, ...layout.neighbors];
    const radii = layout.neighbors.map(([x, y]) => Math.hypot(x-layout.center[0], y-layout.center[1]));
    assert.ok(radii.every(r => Math.abs(r-radii[0]) < 1e-6));
    for (const [x, y] of points) assert.ok(x >= width/2 && x <= layout.width-width/2 && y >= height/2 && y <= layout.height-height/2);
    for (let i=0;i<points.length;i++) for(let j=i+1;j<points.length;j++) {
      assert.ok(Math.abs(points[i][0]-points[j][0]) >= width+24-1e-6 || Math.abs(points[i][1]-points[j][1]) >= height+24-1e-6);
    }
  }
});
