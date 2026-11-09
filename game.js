import * as THREE from './vendor/three.module.js';

const $ = (id) => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#10251c');
scene.fog = new THREE.Fog('#10251c', 35, 85);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 150);
const renderer = new THREE.WebGLRenderer({ canvas: $('pitch'), antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
scene.add(new THREE.HemisphereLight(0xc9f0d7, 0x1b2b20, 2.0));
const keyLight = new THREE.DirectionalLight(0xfff2d5, 3.2);
keyLight.position.set(-8, 24, 13); keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024); keyLight.shadow.camera.left = -27; keyLight.shadow.camera.right = 27; keyLight.shadow.camera.top = 24; keyLight.shadow.camera.bottom = -24;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x82bcff, 1.1); fillLight.position.set(12, 12, -15); scene.add(fillLight);

const FIELD_X = 17, FIELD_Z = 10.5, GOAL_HALF = 2.2;
const mat = (color, roughness=.8, metalness=0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const grass = mat('#245c38'), stripeA = mat('#286640'), stripeB = mat('#225734'), lineMat = new THREE.MeshBasicMaterial({ color: '#d9e8c9', transparent: true, opacity: .7 });
const darkMat = mat('#101d18'), whiteMat = mat('#f4f3e8'), ballMat = mat('#f5f2e7', .48), blueMat = mat('#52a5ff', .45), blueDark = mat('#225bba'), orangeMat = mat('#ff754f', .45), orangeDark = mat('#bc432e'), skinMat = mat('#dca77c'), shoeMat = mat('#101511', .38), limeMat = mat('#c8fa59', .45, .05);
const plane = (w,h,material,x,y,z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w,h),material); m.rotation.x=-Math.PI/2; m.position.set(x,y,z); m.receiveShadow=true; scene.add(m); return m; };
plane(180, 130, mat('#0b1915'), 0, -.38, 0);
plane(FIELD_X*2+8, FIELD_Z*2+8, mat('#183d2a'), 0, -.22, 0);
plane(FIELD_X*2, FIELD_Z*2, grass, 0, -.08, 0);
for(let i=0;i<8;i++){const w=FIELD_X*2/8; plane(w,FIELD_Z*2,i%2?stripeA:stripeB,-FIELD_X+w*(i+.5),-.065,0);}
// Painted pitch markings
const mark=(w,h,x,z,material=lineMat)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);m.rotation.x=-Math.PI/2;m.position.set(x,-.045,z);scene.add(m);return m;};
mark(FIELD_X*2-.5,.065,0,0); mark(.065,FIELD_Z*2-.5,0,0);
mark(.06,FIELD_Z*2-.3,-FIELD_X+.14,0);mark(.06,FIELD_Z*2-.3,FIELD_X-.14,0);
mark(FIELD_X*2-.3,.06,0,-FIELD_Z+.14);mark(FIELD_X*2-.3,.06,0,FIELD_Z-.14);
const circle=new THREE.Mesh(new THREE.RingGeometry(2.35,2.42,72),lineMat);circle.rotation.x=-Math.PI/2;circle.position.y=-.035;scene.add(circle);
const centerSpot=new THREE.Mesh(new THREE.CircleGeometry(.12,24),lineMat);centerSpot.rotation.x=-Math.PI/2;centerSpot.position.y=-.03;scene.add(centerSpot);
for(const side of [-1,1]){
  const boxX=side*(FIELD_X-4.1); mark(8.2,.055,boxX,-3.35);mark(8.2,.055,boxX,3.35);mark(.055,6.7,side*(FIELD_X-8.2),0);
  const goal=new THREE.Group(); const frame=mat('#e8eee5',.34,.4); const postGeo=new THREE.CylinderGeometry(.075,.075,.92,10);
  for(const z of [-GOAL_HALF,GOAL_HALF]){const p=new THREE.Mesh(postGeo,frame);p.position.set(side*(FIELD_X+.22),.46,z);p.castShadow=true;goal.add(p);}
  const cross=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,GOAL_HALF*2+.14,10),frame);cross.rotation.x=Math.PI/2;cross.position.set(side*(FIELD_X+.22),.91,0);cross.castShadow=true;goal.add(cross);
  const net=new THREE.Mesh(new THREE.BoxGeometry(1.35,.86,GOAL_HALF*2),new THREE.MeshBasicMaterial({color:side===1?0x92cbff:0xff9a73,wireframe:true,transparent:true,opacity:.24}));net.position.set(side*(FIELD_X+.82),.45,0);goal.add(net);scene.add(goal);
}
// Stadium edge lights and distant silhouettes
for(let i=0;i<12;i++){const angle=i/12*Math.PI*2;const x=Math.cos(angle)*25,z=Math.sin(angle)*19;const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,4,8),darkMat);pole.position.set(x,1.8,z);scene.add(pole);const lamp=new THREE.PointLight(i%2?0x87aaff:0xc8fa59,2,12,2);lamp.position.set(x,4,z);scene.add(lamp);const bulb=new THREE.Mesh(new THREE.SphereGeometry(.18,8,8),mat(i%2?'#a6c5ff':'#c8fa59',.3));bulb.position.set(x,4,z);scene.add(bulb);}

const ball = new THREE.Group();
const ballMesh=new THREE.Mesh(new THREE.SphereGeometry(.27,24,16),ballMat);ballMesh.castShadow=true;ball.add(ballMesh);
const ballMark=new THREE.Mesh(new THREE.IcosahedronGeometry(.272,1),mat('#18221b',.72));ballMark.scale.set(.98,1.005,.98);ball.add(ballMark);
const ballShadow=new THREE.Mesh(new THREE.CircleGeometry(.38,20),new THREE.MeshBasicMaterial({color:0x06100b,transparent:true,opacity:.35}));ballShadow.rotation.x=-Math.PI/2;ballShadow.position.y=-.17;ball.add(ballShadow);scene.add(ball);
ball.position.set(0,.27,0);

const teams=[[],[]];let user=null, selectedStyle='trickster';let matchStarted=false,paused=false,gameOver=false;
const styles={trickster:{label:'TRICKSTER',speed:1.16,shot:1,pass:1,skill:1.3},finisher:{label:'FINISHER',speed:.96,shot:1.35,pass:1,skill:.9},playmaker:{label:'PLAYMAKER',speed:1,shot:.95,pass:1.35,skill:1.05}};
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function limb(parent,x,z,color){const pivot=new THREE.Group();pivot.position.set(x,.72,z);parent.add(pivot);const geo=new THREE.CapsuleGeometry(.105,.43,4,8);const mesh=new THREE.Mesh(geo,color);mesh.position.y=-.27;mesh.castShadow=true;pivot.add(mesh);const shoe=new THREE.Mesh(new THREE.BoxGeometry(.2,.13,.32),shoeMat);shoe.position.set(0,-.52,.07);shoe.castShadow=true;pivot.add(shoe);return pivot;}
function makePlayer(team,index,isUser=false){
  const group=new THREE.Group();const body=new THREE.Group();group.add(body);
  const shirt=team===0?blueMat:orangeMat, shorts=team===0?blueDark:orangeDark;
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.29,.48,5,12),shirt);torso.position.y=1.12;torso.castShadow=true;body.add(torso);
  const lower=new THREE.Mesh(new THREE.CylinderGeometry(.25,.3,.28,12),shorts);lower.position.y=.69;lower.castShadow=true;body.add(lower);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.22,16,12),skinMat);head.position.y=1.65;head.castShadow=true;body.add(head);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.225,14,9,0,Math.PI*2,0,Math.PI*.48),mat(team===0?'#17232b':'#34201c'));hair.position.y=1.72;body.add(hair);
  const legs=[limb(body,-.14,0,shorts),limb(body,.14,0,shorts)];
  const aura=new THREE.Mesh(new THREE.RingGeometry(.38,.47,28),new THREE.MeshBasicMaterial({color:isUser?0xc8fa59:team===0?0x4ca3ff:0xff7050,transparent:true,opacity:isUser?.82:.35,side:THREE.DoubleSide}));aura.rotation.x=-Math.PI/2;aura.position.y=.035;group.add(aura);
  const indicator=new THREE.Mesh(new THREE.ConeGeometry(.12,.22,3),new THREE.MeshBasicMaterial({color:0xc8fa59}));indicator.position.set(0,2.2,0);indicator.rotation.x=Math.PI;indicator.visible=isUser;group.add(indicator);
  const number=makeNumber(team===0?index+1:index+4,team===0?'#eef8ff':'#fff1e9');number.position.set(0,1.12,.298);number.scale.set(.22,.22,.22);body.add(number);
  scene.add(group);
  const p={group,body,legs,aura,team,index,isUser,pos:v(),vel:v(),facing:v(team===0?1:-1,0,0),speed:isUser?5.3:4.15,hasBall:false,think:Math.random(),kick:0,skill:0,stamina:1};
  return p;
}
function makeNumber(num,color){const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.font='900 48px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(num),32,34);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}));return s;}
function placePlayers(){
  const spots=[[[-8,0],[-11,-6],[-11,6]],[[8,0],[11,-6],[11,6]]];
  for(let t=0;t<2;t++)for(let i=0;i<3;i++){const p=teams[t][i];const [x,z]=spots[t][i];p.pos.set(x,0,z);p.vel.set(0,0,0);p.group.position.set(x,0,z);p.facing.set(t===0?1:-1,0,0);p.group.rotation.y=t===0?Math.PI/2:-Math.PI/2;p.hasBall=false;}
  ball.position.set(0,.27,0);ball.userData.vel=v();ball.userData.owner=null;
}
for(let t=0;t<2;t++)for(let i=0;i<3;i++)teams[t].push(makePlayer(t,i,t===0&&i===0));
user=teams[0][0];placePlayers();

const keys=new Set();let joystick=v(),shootHeld=false,shotCharge=0,skillCooldown=0,toastTimer=0,goalTimer=0,matchSeconds=150,homeScore=0,awayScore=0,soundOn=false;
const ballVelocity=()=>ball.userData.vel;
function portrait(){return innerWidth<700&&innerHeight>innerWidth;}
let cameraTarget=v();
function resize(){
  const w=innerWidth,h=innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
  if(portrait()){
    const d=56;camera.position.set(-d*.69,d*.73,0);camera.fov=39;
  }else{camera.position.set(0,29,30);camera.fov=48;}
  camera.lookAt(0,0,0);camera.updateProjectionMatrix();
}
addEventListener('resize',resize);resize();
const styleTag=$('playstyle-tag');
function updateStyle(){styleTag.querySelector('b').textContent=styles[selectedStyle].label;document.querySelectorAll('.style-card').forEach(c=>c.classList.toggle('selected',c.dataset.style===selectedStyle));}
document.querySelectorAll('.style-card').forEach(c=>c.addEventListener('click',()=>{selectedStyle=c.dataset.style;updateStyle();}));
$('play-button').addEventListener('click',()=>{matchStarted=true;paused=false;gameOver=false;matchSeconds=150;homeScore=0;awayScore=0;$('home-goals').textContent='0';$('away-goals').textContent='0';placePlayers();$('start-screen').classList.add('closed');$('pause-screen').classList.add('hidden');$('status-label').textContent='LIVE';});
function togglePause(){if(!matchStarted||gameOver)return;paused=!paused;$('pause-screen').classList.toggle('hidden',!paused);}
$('resume-button').addEventListener('click',togglePause);
$('restart-button').addEventListener('click',()=>{$('pause-screen').classList.add('hidden');matchStarted=true;paused=false;gameOver=false;matchSeconds=150;homeScore=0;awayScore=0;$('home-goals').textContent='0';$('away-goals').textContent='0';placePlayers();$('status-label').textContent='LIVE';});
addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='Escape')togglePause();if(e.code==='KeyE'&&!e.repeat)skillMove();if(e.code==='KeyQ'&&!e.repeat)passBall();if(e.code==='Space'&&!e.repeat)beginShot();});
addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space')releaseShot();});
const zone=$('stick-zone'),knob=$('stick-knob');let stickPointer=null;
zone.addEventListener('pointerdown',e=>{stickPointer=e.pointerId;zone.setPointerCapture(e.pointerId);moveStick(e);});
zone.addEventListener('pointermove',e=>{if(stickPointer===e.pointerId)moveStick(e);});
function moveStick(e){const r=zone.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=37,d=Math.hypot(dx,dy);if(d>max){dx=dx/d*max;dy=dy/d*max;}knob.style.transform=`translate(${dx}px,${dy}px)`;joystick.set(dx/max,-dy/max);if(joystick.length()>1)joystick.normalize();}
function releaseStick(e){if(stickPointer===e.pointerId){stickPointer=null;joystick.set(0,0);knob.style.transform='';}}
zone.addEventListener('pointerup',releaseStick);zone.addEventListener('pointercancel',releaseStick);
$('skill-button').addEventListener('pointerdown',e=>{e.preventDefault();skillMove();});$('pass-button').addEventListener('pointerdown',e=>{e.preventDefault();passBall();});
$('shoot-button').addEventListener('pointerdown',e=>{e.preventDefault();shootHeld=true;beginShot();});$('shoot-button').addEventListener('pointerup',e=>{e.preventDefault();shootHeld=false;releaseShot();});$('shoot-button').addEventListener('pointercancel',()=>{shootHeld=false;releaseShot();});
$('sound-toggle').addEventListener('click',()=>{$('sound-toggle').textContent=soundOn?'♫':'♪';soundOn=!soundOn;});
function movementInput(){let x=0,z=0;if(keys.has('KeyA')||keys.has('ArrowLeft'))x--;if(keys.has('KeyD')||keys.has('ArrowRight'))x++;if(keys.has('KeyW')||keys.has('ArrowUp'))z--;if(keys.has('KeyS')||keys.has('ArrowDown'))z++;x+=joystick.x;z-=joystick.y;if(portrait()){const a=x;x=-z;z=-a;}const out=v(x,0,z);if(out.length()>1)out.normalize();return out;}
function skillMove(){if(!matchStarted||paused||!user||skillCooldown>0)return;const d=movementInput();if(d.lengthSq()<.05)d.copy(user.facing);d.normalize();user.vel.addScaledVector(d,selectedStyle==='trickster'?7.8:6.4);user.skill=.55;skillCooldown=2.2/styles[selectedStyle].skill;toast('SKILL MOVE!','+25 XP');if(user.hasBall){ball.userData.owner=user;ballVelocity().addScaledVector(d,3.8);}}
function toast(title,sub=''){const el=$('toast');el.innerHTML=`${title}<small>${sub}</small>`;el.classList.add('show');toastTimer=1.15;}
function beginShot(){if(!matchStarted||paused||!user)return;shootHeld=true;shotCharge=0;$('shot-meter').classList.add('active');}
function releaseShot(){if(!shootHeld)return;shootHeld=false;$('shot-meter').classList.remove('active');if(!matchStarted||paused)return;if(user.hasBall||ball.position.distanceTo(user.pos)<1.15)shootBall(user,Math.max(.22,shotCharge));shotCharge=0;}
function shootBall(player,power){const goalX=player.team===0?FIELD_X+1:-FIELD_X-1;let aim=v(goalX-player.pos.x,0,(Math.random()-.5)*Math.max(1,3.3-power*1.3));if(player.isUser){const input=movementInput();if(input.lengthSq()>.15){aim.x+=input.x*3.1;aim.z+=input.z*3.1;}}aim.normalize();const style=player.isUser?styles[selectedStyle]:{shot:1};const speed=(8.5+power*9.5)*style.shot;ball.userData.owner=null;player.hasBall=false;ballVelocity().set(aim.x*speed,2.1+power*2.7,aim.z*speed);if(player.isUser)toast(power>.72?'POWER SHOT!':'SHOT!','');}
function passBall(){if(!matchStarted||paused)return;const mate=teams[0].filter(p=>p!==user).sort((a,b)=>a.pos.distanceTo(user.pos)-b.pos.distanceTo(user.pos))[0];if(!user.hasBall&&ball.position.distanceTo(user.pos)>1.25)return;const aim=mate.pos.clone().sub(user.pos);aim.y=0;aim.normalize();const style=styles[selectedStyle];ball.userData.owner=null;user.hasBall=false;ballVelocity().set(aim.x*(10*style.pass),1.2,aim.z*(10*style.pass));toast('THREADING IT','');}
function movePlayer(p,dir,dt,sprinting=false){const max=p.speed*(p.isUser?styles[selectedStyle].speed:1)*(sprinting&&p.isUser?1.32:1);const target=dir.clone().multiplyScalar(max);p.vel.x=THREE.MathUtils.damp(p.vel.x,target.x,dir.lengthSq()?9:5,dt);p.vel.z=THREE.MathUtils.damp(p.vel.z,target.z,dir.lengthSq()?9:5,dt);p.pos.addScaledVector(p.vel,dt);p.pos.x=THREE.MathUtils.clamp(p.pos.x,-FIELD_X+1.1,FIELD_X-1.1);p.pos.z=THREE.MathUtils.clamp(p.pos.z,-FIELD_Z+1,FIELD_Z-1);if(p.vel.lengthSq()>.1){p.facing.copy(p.vel).normalize();p.group.rotation.y=Math.atan2(p.facing.x,p.facing.z);}p.group.position.set(p.pos.x,0,p.pos.z);const run=Math.sin(performance.now()*.012+p.index*2)*Math.min(1,p.vel.length()/3);p.legs[0].rotation.x=run*.65;p.legs[1].rotation.x=-run*.65;p.body.rotation.z=THREE.MathUtils.damp(p.body.rotation.z,-p.vel.x*.018,5,dt);}
function aiMove(p,dt){const own=teams[p.team],opp=teams[1-p.team],owner=ball.userData.owner;let target=v();
  if(owner===p){p.think-=dt;if(p.think<=0){p.think=.5+Math.random()*.6;const goalX=p.team===0?FIELD_X:-FIELD_X;const dist=Math.abs(goalX-p.pos.x);if(dist<10||Math.random()<.12){const dir=v(goalX-p.pos.x,0,(Math.random()-.5)*2).normalize();ball.userData.owner=null;p.hasBall=false;ballVelocity().set(dir.x*(10+Math.random()*4),2,dir.z*(10+Math.random()*3));}else{const mate=own.find(q=>q!==p&&q.pos.distanceTo(p.pos)<7);if(mate&&Math.random()<.28){const d=mate.pos.clone().sub(p.pos).normalize();ball.userData.owner=null;p.hasBall=false;ballVelocity().set(d.x*9,1.2,d.z*9);}else target.set(p.team===0?1:-1,0,0);}}
    if(owner===p)target.set(p.team===0?1:-1,0,0);
  }else if(owner&&owner.team===p.team){const attack=p.team===0?1:-1;target.set(owner.pos.x-p.pos.x+attack*2,0,owner.pos.z+(p.index===1?-3:3)-p.pos.z);if(target.length()>4)target.setLength(4);
  }else if(owner){const d=owner.pos.distanceTo(p.pos);if(d<7||p.index===0)target.copy(owner.pos).sub(p.pos);else target.set(p.team===0?-1:1,0,(p.index===1?-2.5:2.5));}
  else{const chaser=own.reduce((a,b)=>a.pos.distanceTo(ball.position)<b.pos.distanceTo(ball.position)?a:b);if(chaser===p)target.copy(ball.position).sub(p.pos);else{target.set(ball.position.x*.48-p.pos.x+(p.index===1?-4:4),0,ball.position.z*.52-p.pos.z+(p.index===1?-3:3));}}
  target.y=0;if(target.length()>1)target.normalize();movePlayer(p,target,dt,false);
  if(p.hasBall&&p.kick<=0){p.kick=1.2+Math.random()*1.8;if(Math.abs(p.pos.x)>10||Math.random()<.32){const direction=v(p.team===0?1:-1,0,(Math.random()-.5)*.8).normalize();ball.userData.owner=null;p.hasBall=false;ballVelocity().set(direction.x*(10+Math.random()*5),2+Math.random()*1.5,direction.z*(9+Math.random()*4));}}
}
function giveBall(p){const old=ball.userData.owner;if(old)old.hasBall=false;ball.userData.owner=p;p.hasBall=true;ballVelocity().set(0,0,0);}
function scoreGoal(team){if(goalTimer>0)return;if(team===0){homeScore++;$('home-goals').textContent=homeScore;}else{awayScore++;$('away-goals').textContent=awayScore;}$('goal-flash').classList.add('show');$('status-label').textContent=team===0?'GOAL!':'THEY SCORE';goalTimer=2.1;ball.userData.owner=null;teams.flat().forEach(p=>p.hasBall=false);}
function updateGame(dt){
  if(!matchStarted||paused)return;
  if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('show');}
  skillCooldown=Math.max(0,skillCooldown-dt);teams.flat().forEach(p=>p.kick-=dt);
  if(goalTimer>0){goalTimer-=dt;if(goalTimer<=0){$('goal-flash').classList.remove('show');$('status-label').textContent='LIVE';placePlayers();}return;}
  matchSeconds=Math.max(0,matchSeconds-dt);const mins=Math.floor(matchSeconds/60),secs=Math.floor(matchSeconds%60);$('clock').textContent=`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  if(matchSeconds<=0){gameOver=true;$('status-label').textContent=homeScore===awayScore?'FULL TIME':'FULL TIME';$('goal-flash').querySelector('b').textContent=homeScore===awayScore?'DRAW':homeScore>awayScore?'YOU WIN':'FULL TIME';$('goal-flash').querySelector('small').textContent=`FINAL SCORE  ${homeScore} — ${awayScore}`;$('goal-flash').classList.add('show');return;}
  const input=movementInput();const sprint=keys.has('ShiftLeft')||keys.has('ShiftRight');movePlayer(user,input,dt,sprint);for(const team of teams)for(const p of team)if(p!==user)aiMove(p,dt);
  if(shootHeld){shotCharge=Math.min(1,shotCharge+dt*.72);$('power-label').textContent=`${Math.round(shotCharge*100)}%`;$('power-fill').style.width=`${shotCharge*100}%`;}
  const owner=ball.userData.owner;
  if(owner){const dir=owner.facing.lengthSq()>.1?owner.facing:v(owner.team===0?1:-1,0,0);ball.position.set(owner.pos.x+dir.x*.62,.28,owner.pos.z+dir.z*.62);ball.rotation.x+=dt*3;ball.rotation.z+=dt*4;}
  else{
    const vel=ballVelocity();ball.position.x+=vel.x*dt;ball.position.z+=vel.z*dt;ball.position.y+=vel.y*dt;vel.y-=13*dt;
    if(ball.position.y<.27){ball.position.y=.27;if(vel.y<-.9)vel.y*=-.34;else vel.y=0;vel.x*=Math.pow(.985,dt*60);vel.z*=Math.pow(.985,dt*60);}
    ball.position.x=THREE.MathUtils.clamp(ball.position.x,-FIELD_X-1,FIELD_X+1);ball.position.z=THREE.MathUtils.clamp(ball.position.z,-FIELD_Z+1,FIELD_Z-1);ball.rotation.x+=vel.z*dt*2;ball.rotation.z-=vel.x*dt*2;
    if(Math.abs(ball.position.x)>FIELD_X&&Math.abs(ball.position.z)<GOAL_HALF){scoreGoal(ball.position.x>0?0:1);return;}
    if(Math.abs(ball.position.x)>FIELD_X-.7&&Math.abs(ball.position.z)>=GOAL_HALF)vel.x*=-.65;
    let nearest=null,dist=.92;for(const p of teams.flat()){const d=p.pos.distanceTo(ball.position);if(d<dist){dist=d;nearest=p;}}
    if(nearest&&ball.position.y<.8&&vel.length()<12)giveBall(nearest);
  }
  // Small defensive pressure and automatic loose-ball challenges keep the match moving.
  const holder=ball.userData.owner;if(holder){for(const rival of teams[1-holder.team]){if(rival.pos.distanceTo(holder.pos)<.72&&Math.random()<dt*.55){giveBall(rival);if(holder.isUser)toast('TACKLED','');break;}}}
  $('power-fill').style.background=shotCharge>.75?'#ff7454':'#c8fa59';
}
let previous=performance.now();
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.04,(now-previous)/1000);previous=now;updateGame(dt);const portraitMode=portrait();const aim=user.pos.clone().multiplyScalar(.13);cameraTarget.lerp(aim,.025);if(portraitMode)camera.position.set(-38+cameraTarget.x,40,cameraTarget.z);else camera.position.set(cameraTarget.x,29,cameraTarget.z+30);camera.lookAt(cameraTarget.x,0,cameraTarget.z);renderer.render(scene,camera);}
requestAnimationFrame(frame);
