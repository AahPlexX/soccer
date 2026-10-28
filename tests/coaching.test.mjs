import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, normalizeState } from '../js/state.js';
import { addTeachingStep, captureBoard, clearProps, createDrillClock, duplicateProp, moveTeachingStep, normalizeCoaching, retainRoster, setPlayerBenched, teachingStepState } from '../js/coaching.js';
import { stepSimulation } from '../js/simulation.js';
import { availablePassOptions } from '../js/pass-options.js';
import { createHistory } from '../js/history.js';

test('benching the carrier or receiver releases play, and benched players never move or become options', () => {
  const state = createInitialState(); const player = state.players[6];
  state.simulation.carrierId = player.id; setPlayerBenched(state, player.id, true);
  assert.equal(state.simulation.carrierId, null);
  const before = { ...player }; state.simulation.running = true;
  for (let i=0; i<600; i++) stepSimulation(state, 1/60);
  assert.deepEqual(player, before); assert.equal(state.players.length,14);
  state.simulation.carrierId = 'home-5'; state.simulation.ballTarget = null;
  assert.ok(availablePassOptions(state).every(p=>p.id!==player.id));
  state.players.forEach(p=>setPlayerBenched(state,p.id,true));
  stepSimulation(state,1/60); assert.equal(state.simulation.running,false);
});
test('a benched goalkeeper cannot catch a shot or take a restart', () => {
  const state=createInitialState();setPlayerBenched(state,'away-1',true);
  Object.assign(state.balls[0],{x:0.999,y:0.5});
  Object.assign(state.simulation,{running:true,carrierId:null,receiverId:null,lastTouchTeam:'home',ballTarget:{x:1.05,y:0.5}});
  stepSimulation(state,1/60);
  assert.equal(state.simulation.restart?.type,'kickoff');
  assert.notEqual(state.simulation.carrierId,'away-1');
});
test('a sequence captures independent paused boards and briefs without recursively storing itself', () => {
  const state=createInitialState();state.simulation.running=true;state.coaching.title='Build out';
  addTeachingStep(state,'Split wide'); state.players[1].x=0.3;state.coaching.title='Receive';addTeachingStep(state,'Receive');
  assert.equal(state.coaching.steps[0].board.coaching,undefined);
  assert.equal(state.coaching.steps[0].board.simulation.running,false);
  assert.notEqual(state.coaching.steps[0].board.players[1].x,0.3);
  const next=normalizeState(teachingStepState(state,0));
  assert.equal(next.coaching.title,'Build out');assert.equal(next.coaching.steps.length,2);
  assert.equal(next.simulation.running,false);assert.equal(state.coaching.title,'Receive');
  moveTeachingStep(state,1,-1);assert.equal(state.coaching.steps[0].title,'Receive');
  for(let i=0;i<20;i++)addTeachingStep(state,'More');assert.equal(state.coaching.steps.length,12);
  assert.equal(addTeachingStep(state,'Too many'),false);
});
test('old saves gain a brief; imported steps strip nested coaching payloads and clamp metadata', () => {
  const state=createInitialState();delete state.coaching;
  assert.equal(normalizeState(state).coaching.minutes,5);
  const coaching=normalizeCoaching({minutes:999,title:'x'.repeat(100),steps:[{title:'Step',board:{...state,coaching:{steps:[{board:state}]}}}]});
  assert.equal(coaching.minutes,120);assert.equal(coaching.title.length,80);assert.equal(coaching.steps[0].board.coaching,undefined);
});
test('saved coaching content and bench flags survive normalize, JSON backup shape and undo', () => {
  const state=createInitialState();const history=createHistory();history.reset(state);
  state.coaching.cues='Scan before receiving';state.players[2].benched=true;addTeachingStep(state,'Start');
  history.record(state);const normalized=normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(normalized.coaching.cues,'Scan before receiving');assert.equal(normalized.players[2].benched,true);
  assert.equal(normalized.coaching.steps.length,1);
  history.undo(state);assert.equal(state.coaching.cues,'');assert.equal(state.players[2].benched,false);
  history.redo(state);assert.equal(state.coaching.cues,'Scan before receiving');
});
test('duplicate and clear equipment protect the match ball and roster', () => {
  const state=createInitialState();state.cones.push({id:'cone',x:0.99,y:0.4,color:'#ffffff'});state.selectedObjectId='cone';
  assert.equal(duplicateProp(state),true);assert.equal(state.cones[1].color,'#ffffff');assert.notEqual(state.cones[1].id,'cone');assert.ok(state.cones[1].x<1);
  state.selectedObjectId='ball-main';assert.equal(duplicateProp(state),false);
  clearProps(state);assert.equal(state.cones.length,0);assert.equal(state.balls[0].id,'ball-main');assert.equal(state.players.length,14);
});
test('drill clock uses elapsed real time, pauses, resets and never runs below zero', () => {
  let now=0;const clock=createDrillClock(()=>now);clock.reset(1);clock.start();now=10000;assert.equal(clock.remaining,50000);
  clock.pause();now=40000;assert.equal(clock.remaining,50000);clock.start();now=100000;assert.equal(clock.remaining,0);assert.equal(clock.running,false);
  clock.reset(5);assert.equal(clock.remaining,300000);assert.equal(clock.running,false);
});
test('roster retention is opt-in and preserves new shape roles and default role labels', () => {
  const current=createInitialState();const next=createInitialState();current.players[2].label='Alex';current.players[2].number=42;
  assert.equal(retainRoster(current,next).players[2].number,3);
  current.coaching.keepRoster=true;retainRoster(current,next);assert.equal(next.players[2].label,'Alex');assert.equal(next.players[2].number,42);
  assert.equal(captureBoard(current).coaching,undefined);
});

test('saved starting setups and teaching steps survive export/import with their briefing and benches', async () => {
  const values = new Map(); globalThis.localStorage = { getItem: k=>values.get(k)??null, setItem: (k,v)=>values.set(k,v), removeItem:k=>values.delete(k) };
  delete globalThis.indexedDB;
  const { exportBackup, importBackup, savePreset, listPresets } = await import('../js/storage.js');
  const state=createInitialState();state.coaching.title='Practice plan';state.coaching.startBoard=captureBoard(state);
  state.players[1].benched=true;addTeachingStep(state,'3v3 start');
  await savePreset({title:'Practice',category:'Drills',state});
  const next=await importBackup(await exportBackup(state));
  assert.equal(next.coaching.title,'Practice plan');assert.equal(next.coaching.startBoard.players.length,14);
  assert.equal(next.coaching.steps[0].board.players[1].benched,true);
  assert.equal((await listPresets())[0].state.coaching.title,'Practice plan');
});

test('a pass reaching an empty target becomes a loose ball the active players can chase', () => {
  const state=createInitialState();state.simulation.running=true;
  Object.assign(state.balls[0],{x:0.5,y:0.95});
  Object.assign(state.simulation,{ballTarget:{x:0.5,y:0.95},receiverId:'home-5'});
  stepSimulation(state,1/60); assert.equal(state.simulation.ballTarget,null);
  for(let i=0;i<600&&!state.simulation.carrierId;i++)stepSimulation(state,1/60);
  assert.ok(state.simulation.carrierId);
});

test('small-sided shortcuts retain the full roster while selecting exactly three or four field players per side', async () => {
  const { setSmallSided } = await import('../js/coaching.js');
  const state=createInitialState();
  for(const count of [3,4]) {
    assert.equal(setSmallSided(state,count),true);
    for(const team of ['home','away']) {
      assert.equal(state.players.filter(p=>p.team===team&&!p.benched).length,count);
      assert.equal(state.players.find(p=>p.team===team&&p.role==='GK').benched,true);
    }
  }
  assert.equal(state.players.length,14);assert.equal(setSmallSided(state,99),false);
});

test('eraser removes only the nearest drawing and protects equipment and roster', async () => {
  const { eraseDrawingNear } = await import('../js/coaching.js');
  const state=createInitialState();state.cones.push({id:'cone',x:0.4,y:0.4});
  state.drawings=[{type:'curve',points:[{x:0.2,y:0.2},{x:0.4,y:0.4},{x:0.5,y:0.3}]},{type:'arrow',points:[{x:0.7,y:0.7},{x:0.9,y:0.7}]}];
  assert.equal(eraseDrawingNear(state,{x:0.4,y:0.4}),true);assert.equal(state.drawings.length,1);
  assert.equal(state.drawings[0].type,'arrow');assert.equal(state.cones.length,1);assert.equal(state.players.length,14);
  assert.equal(eraseDrawingNear(state,{x:0.1,y:0.9}),false);
});
