import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';
import { giveBallToPlayer, moveSelection } from '../js/board-interactions.js';
import { settlePlayers } from '../js/board-actions.js';
import { spacingDistance } from '../js/geometry.js';

test('a selected unit moves rigidly and shares a boundary limit rather than distorting its shape', () => {
 const state=createInitialState(); const players=state.players.filter(p=>['home-2','home-3'].includes(p.id));
 const original=players.map(p=>({x:p.x,y:p.y}));
 assert.equal(moveSelection(state,players.map(p=>p.id),-.5,.1),true);
 assert.ok(Math.abs(players[0].x-players[1].x-(original[0].x-original[1].x))<1e-9);
 assert.ok(Math.abs(players[0].y-players[1].y-(original[0].y-original[1].y))<1e-9);
 assert.equal(Math.min(...players.map(p=>p.x)),0);
 assert.ok(players.every(p=>p.anchorX===p.x&&p.anchorY===p.y));
});
test('group movement releases stale possession and ignores benched or unknown members', () => {
 const state=createInitialState();state.players[2].benched=true;const oldX=state.players[2].x;
 state.simulation.carrierId='home-2';state.simulation.restart={type:'throw-in',team:'home'};
 moveSelection(state,['home-2','home-3','missing'],.1,0);
 assert.equal(state.players[2].x,oldX);assert.equal(state.simulation.carrierId,null);assert.equal(state.simulation.restart,null);
 assert.equal(moveSelection(state,[],1,1),false);
});
test('other players yield when a whole selected unit is settled', () => {
 const state=createInitialState();const ids=['home-2','home-3'];moveSelection(state,ids,.37,0);
 const before=state.players.filter(p=>ids.includes(p.id)).map(p=>[p.x,p.y]);settlePlayers(state,ids);
 assert.deepEqual(state.players.filter(p=>ids.includes(p.id)).map(p=>[p.x,p.y]),before);
 for(let i=0;i<state.players.length;i++)for(let j=i+1;j<state.players.length;j++)assert.ok(spacingDistance(state.players[i],state.players[j])>=.05-1e-8);
});
test('Give ball is a paused setup action at either player and clears flight/restart state', () => {
 const state=createInitialState();state.simulation.running=true;state.simulation.ballTarget={x:1,y:.6};state.simulation.restart={type:'corner',team:'away'};
 for(const id of ['home-7','away-7']) {
  assert.equal(giveBallToPlayer(state,id),true); const p=state.players.find(p=>p.id===id);
  assert.equal(state.balls[0].x,p.x);assert.equal(state.balls[0].y,p.y);
  assert.equal(state.simulation.carrierId,id);assert.equal(state.simulation.running,false);assert.equal(state.simulation.restart,null);assert.equal(state.simulation.ballTarget,null);
 }
 state.players[0].benched=true;assert.equal(giveBallToPlayer(state,'home-1'),false);
});

test('an unselected carrier pushed aside by a coaching unit keeps the ball', () => {
 const state=createInitialState();
 const carrier=state.players.find(p=>p.id==='away-7');
 giveBallToPlayer(state,carrier.id);
 const mover=state.players.find(p=>p.id==='home-2');
 mover.x=carrier.x; mover.y=carrier.y;
 const before=[carrier.x,carrier.y];
 settlePlayers(state,[mover.id]);
 assert.notDeepEqual([carrier.x,carrier.y],before);
 assert.equal(state.simulation.carrierId,carrier.id);
 assert.deepEqual([state.balls[0].x,state.balls[0].y],[carrier.x,carrier.y]);
});
