import * as THREE from 'three';
import { FIELD, FORMATION } from './constants.js';

const clamp = THREE.MathUtils.clamp;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function setTarget(p, x, z, sprint = false, stop = 0.45) {
  p.aiTarget.set(clamp(x, -FIELD.halfWidth + 1.2, FIELD.halfWidth - 1.2), clamp(z, -FIELD.halfLength + 1.2, FIELD.halfLength - 1.2));
  p.aiSprintWanted = sprint;
  p.aiStop = stop;
}

function applySeek(game, p) {
  const dx = p.aiTarget.x - p.pos.x;
  const dz = p.aiTarget.y - p.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < (p.aiStop ?? 0.45)) {
    p.intent.set(0, 0);
    p.aiSprint = false;
    p.aiSpeedMul = 0.4;
    return;
  }
  p.intent.set(dx / d, dz / d);
  p.aiSprint = !!p.aiSprintWanted && p.stamina > 4;
  p.aiSpeedMul = clamp(d / 2.4, 0.45, 1);
}

function nearestOpponent(game, p, includeKeeper = false) {
  let best = null;
  let bestD = Infinity;
  for (const o of game.players) {
    if (o.team.id === p.team.id) continue;
    if (o.isKeeper && !includeKeeper) continue;
    const d = dist(o.pos, p.pos);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return { player: best, d: bestD };
}

function interval(game, p) {
  if (p.team.id === 'away') return clamp(game.difficulty.reaction * (0.78 + Math.random() * 0.6), 0.07, 0.44);
  return 0.13 + Math.random() * 0.08;
}

function holdShape(game, p) {
  const base = FORMATION[p.team.id][p.role];
  setTarget(p, base[0], base[1], false, 0.7);
}

function decideAttack(game, p) {
  const goalZ = p.team.dir * FIELD.halfLength;
  const goalX = 0;
  const toGoal = Math.hypot(goalX - p.pos.x, goalZ - p.pos.z);
  const opp = nearestOpponent(game, p);
  const pressure = opp.d;
  const speed = Math.hypot(p.vel.x, p.vel.z);

  if (p.aiShootCd <= 0 && toGoal < 22) {
    const angle = Math.abs(p.pos.x) / Math.max(2, toGoal);
    if (angle < 0.62) {
      const closeness = 1 - clamp((toGoal - 5) / 18, 0, 1);
      const chance = 0.28 + closeness * 0.62 + (pressure < 2 ? 0.16 : 0);
      if (Math.random() < chance) {
        const aim = clamp((Math.random() * 2 - 1) * 0.8 + (Math.random() < 0.35 ? -Math.sign(p.pos.x) * 0.5 : 0), -0.9, 0.9);
        const ratio = clamp(0.42 + closeness * 0.45, 0.42, 0.94);
        game.shoot(p, ratio, false, true, null, {
          aimX: aim,
          skill: game.difficulty.shotSkill,
          liftY: Math.random() < 0.35 ? 0.7 : 0,
        });
        p.aiShootCd = 1.15 + Math.random() * 0.6;
        return;
      }
    }
  }

  if (p.aiPassCd <= 0 && pressure < 2.8 && Math.random() < 0.62) {
    const target = game.findPassTarget(p, null, false);
    if (target) {
      const lofted = toGoal > 24 && Math.random() < 0.4;
      game.passBall(p, lofted, null);
      p.aiPassCd = 0.9 + Math.random() * 0.6;
      return;
    }
  }

  if (pressure < 1.75 && p.skillCooldown <= 0 && Math.random() < 0.42) {
    const away = new THREE.Vector2(p.pos.x - (opp.player?.pos.x ?? p.pos.x), p.pos.z - (opp.player?.pos.z ?? p.pos.z));
    if (away.length() < 0.1) away.set(Math.sin(p.facing), Math.cos(p.facing));
    game.skillMove(p, { x: away.x, y: away.y });
  }

  let targetX = goalX + Math.sin(game.now * 1.05 + p.number) * 3.1;
  let targetZ = goalZ - p.team.dir * 1.6;
  if (p.pos.x < -FIELD.halfWidth + 4) targetX = p.pos.x + 7;
  if (p.pos.x > FIELD.halfWidth - 4) targetX = p.pos.x - 7;
  if (opp.player && opp.d < 4.2) {
    const ox = p.pos.x - opp.player.pos.x;
    const oz = p.pos.z - opp.player.pos.z;
    const ol = Math.hypot(ox, oz) || 1;
    targetX += (ox / ol) * 5.5;
    targetZ += (oz / ol) * 3.5;
  }
  // stagger dribble speed so bots feel human
  const sprint = p.stamina > 28 && (toGoal > 13 || pressure < 2.6 || speed < 3);
  setTarget(p, targetX, targetZ, sprint, 0.8);
}

function decideSupport(game, p) {
  const ball = game.ball;
  const owner = game.owner;
  if (game.ball.passTarget === p && !game.owner) {
    const px = ball.pos.x + ball.vel.x * 0.28;
    const pz = ball.pos.z + ball.vel.z * 0.28;
    setTarget(p, px, pz, true, 0.2);
    return;
  }
  if (game.aiPassTarget === p && !game.owner) {
    setTarget(p, ball.pos.x + ball.vel.x * 0.25, ball.pos.z + ball.vel.z * 0.25, true, 0.2);
    return;
  }
  const dir = p.team.dir;
  const hl = FIELD.halfLength;
  const hw = FIELD.halfWidth;
  const ballZ = owner ? owner.pos.z : ball.pos.z;
  const ballX = owner ? owner.pos.x : ball.pos.x;
  let x;
  let z;
  if (p.role === 'striker') {
    x = ballX * 0.35 + Math.sin(game.now * 0.9 + 1.7) * 3.4;
    z = ballZ + dir * 8.2;
  } else if (p.role === 'left') {
    x = -hw * 0.64;
    z = ballZ + dir * 4.3;
  } else {
    x = hw * 0.64;
    z = ballZ + dir * 4.3;
  }
  if (owner && owner.team.id === p.team.id && Math.abs(ballZ - p.pos.z) < 2.2 && Math.abs(ballX - p.pos.x) < 2.2) {
    x += Math.sign(p.pos.x || 1) * 5;
  }
  z = clamp(z, -hl + 3.2, hl - 3.4);
  const sprint = dist(p.pos, { x, z }) > 3.5 && p.stamina > 25;
  setTarget(p, x, z, sprint, 0.7);
}

function decideDefend(game, p) {
  const owner = game.owner;
  if (!owner) return;
  const ownGoal = new THREE.Vector3(0, 0, -p.team.dir * FIELD.halfLength);
  const teammates = game.players.filter((q) => q.team.id === p.team.id && !q.isKeeper && q !== game.controlled);
  const sorted = [...teammates].sort((a, b) => dist(a.pos, owner.pos) - dist(b.pos, owner.pos));
  const isPresser = sorted[0] === p;
  const toGoal = new THREE.Vector3(ownGoal.x - owner.pos.x, 0, ownGoal.z - owner.pos.z);
  const gl = toGoal.length() || 1;
  toGoal.multiplyScalar(1 / gl);

  if (isPresser) {
    const d = dist(p.pos, owner.pos);
    if (d < 2.0 && p.tackleCooldown <= 0 && game.kickoffTimer <= 0 && Math.random() < 0.14 + game.difficulty.tackle * 0.09) {
      const dx = owner.pos.x - p.pos.x;
      const dz = owner.pos.z - p.pos.z;
      game.slideTackle(p, { x: dx, y: dz });
    }
    const px = owner.pos.x + owner.vel.x * 0.24 + toGoal.x * 1.05;
    const pz = owner.pos.z + owner.vel.z * 0.24 + toGoal.z * 1.05;
    setTarget(p, px, pz, true, 0.25);
    p.defendRole = 'press';
    return;
  }

  const threats = game.players
    .filter((q) => q.team.id !== p.team.id && !q.isKeeper)
    .sort((a, b) => dist(a.pos, ownGoal) - dist(b.pos, ownGoal));
  const mark = threats.find((q) => q !== owner) || owner;
  if (mark) {
    const mx = mark.pos.x + toGoal.x * 2.6;
    const mz = mark.pos.z + toGoal.z * 2.6;
    setTarget(p, mx, mz, dist(p.pos, mark.pos) > 5, 0.6);
  } else {
    setTarget(p, owner.pos.x * 0.3, (owner.pos.z + ownGoal.z) * 0.5, true, 0.8);
  }
  p.defendRole = 'mark';
}

function decideLoose(game, p) {
  const teammates = game.players.filter((q) => q.team.id === p.team.id && !q.isKeeper && q !== game.controlled);
  const sorted = [...teammates].sort((a, b) => dist(a.pos, game.ball.pos) - dist(b.pos, game.ball.pos));
  if (sorted[0] === p) {
    const px = game.ball.pos.x + game.ball.vel.x * 0.32;
    const pz = game.ball.pos.z + game.ball.vel.z * 0.32;
    setTarget(p, px, pz, true, 0.2);
    return;
  }
  const ownGoal = new THREE.Vector3(0, 0, -p.team.dir * FIELD.halfLength);
  const midX = game.ball.pos.x * 0.42;
  const midZ = game.ball.pos.z * 0.58 + ownGoal.z * 0.42;
  setTarget(p, midX + (p.role === 'left' ? -4 : p.role === 'right' ? 4 : 0), midZ, dist(p.pos, game.ball.pos) > 8, 0.8);
}

function decide(game, p) {
  if (game.kickoffTimer > 0) {
    holdShape(game, p);
    return;
  }
  const owner = game.owner;
  if (owner === p) decideAttack(game, p);
  else if (owner && owner.team.id === p.team.id) decideSupport(game, p);
  else if (owner) decideDefend(game, p);
  else decideLoose(game, p);
}

export function updateAI(game, dt) {
  for (const p of game.players) {
    if (p.isKeeper || p === game.controlled) continue;
    p.aiShootCd = Math.max(0, p.aiShootCd - dt);
    p.aiPassCd = Math.max(0, p.aiPassCd - dt);
    p.aiTimer -= dt;
    if (p.aiTimer <= 0) {
      p.aiTimer = interval(game, p);
      decide(game, p);
    }
    applySeek(game, p);
  }
}

// ============================ GOALKEEPERS ============================
function predictX(game, goalZ) {
  const b = game.ball;
  const vz = b.vel.z;
  if (Math.abs(vz) < 0.8) return b.pos.x;
  const t = (goalZ - b.pos.z) / vz;
  if (t < 0 || t > 2.4) return b.pos.x;
  return b.pos.x + b.vel.x * t + b.spin * 0.008 * t * t;
}

export function updateKeepers(game, dt) {
  for (const keeper of [game.homeTeam.keeper, game.awayTeam.keeper]) {
    if (!keeper) continue;
    const goalZ = -keeper.team.dir * FIELD.halfLength;
    const b = game.ball;
    const ballToGoal = Math.hypot(b.pos.x, b.pos.z - goalZ);
    const towardGoal = b.vel.z * (-keeper.team.dir);
    if (game.owner === keeper) {
      keeper.intent.set(0, 0);
      keeper.aiSprint = false;
      keeper.aiSpeedMul = 0.4;
      keeper.vel.set(0, 0, 0);
      keeper.root.position.set(keeper.pos.x, 0, keeper.pos.z);
      continue;
    }

    let targetX = clamp(b.pos.x * 0.56, -FIELD.goalWidth / 2 + 0.7, FIELD.goalWidth / 2 - 0.7);
    let targetZ = goalZ + keeper.team.dir * 0.95;
    if (ballToGoal < 21) {
      targetX = clamp(b.pos.x * 0.8, -FIELD.goalWidth / 2 + 0.55, FIELD.goalWidth / 2 - 0.55);
    }
    if (towardGoal > 4 && ballToGoal < 24) {
      targetX = clamp(predictX(game, goalZ), -FIELD.goalWidth / 2 + 0.45, FIELD.goalWidth / 2 - 0.45);
    }
    if (!game.owner && ballToGoal < 9) {
      targetZ = goalZ + keeper.team.dir * clamp(1.2 + (9 - ballToGoal) * 0.45, 1.2, 4.2);
      targetX = clamp(b.pos.x * 0.82, -FIELD.goalWidth / 2 + 0.5, FIELD.goalWidth / 2 - 0.5);
    }

    const incoming = !game.owner && towardGoal > 11 && ballToGoal < 17;
    if (!incoming) {
      keeper.incoming = false;
      keeper.reactTimer = 0;
      keeper.divePlan = null;
    } else if (!keeper.dive.active) {
      if (!keeper.incoming) {
        keeper.incoming = true;
        keeper.reactTimer = game.difficulty.keeperReaction ?? 0.16;
        keeper.divePlan = null;
      }
      keeper.reactTimer = Math.max(0, keeper.reactTimer - dt);
      if (keeper.reactTimer <= 0 && keeper.divePlan == null) {
        const spread = game.difficulty.keeperError ?? 0.6;
        const err = (Math.random() * 2 - 1) * spread * clamp(ballToGoal / 16, 0.45, 1.25);
        keeper.divePlan = clamp(
          predictX(game, goalZ) + err,
          -FIELD.goalWidth / 2 + 0.2,
          FIELD.goalWidth / 2 - 0.2
        );
      }
      if (keeper.divePlan != null) {
        const delta = keeper.divePlan - keeper.pos.x;
        if (Math.abs(delta) > 0.3) {
          keeper.setDive(Math.sign(delta) || 1);
          keeper.diveTargetX = keeper.divePlan;
          keeper.diveSpeed = game.difficulty.keeperDiveSpeed ?? 8.5;
          keeper.aiSprint = false;
        }
      }
    }

    if (keeper.dive.active) {
      const side = Math.sign(keeper.diveTargetX - keeper.pos.x) || keeper.dive.side;
      keeper.pos.x += side * keeper.diveSpeed * dt;
      keeper.pos.x = clamp(keeper.pos.x, -FIELD.goalWidth / 2 + 0.2, FIELD.goalWidth / 2 - 0.2);
      keeper.pos.z = goalZ + keeper.team.dir * 0.42;
      keeper.intent.set(0, 0);
      keeper.vel.set(0, 0, 0);
      keeper.aiSprint = false;
      keeper.root.position.set(keeper.pos.x, 0, keeper.pos.z);
      keeper.faceBall = true;
    } else {
      setTarget(keeper, targetX, targetZ, true, 0.25);
      keeper.aiSpeedMul = (Math.abs(targetX - keeper.pos.x) > 0.5 || Math.abs(targetZ - keeper.pos.z) > 0.6 ? 1.22 : 0.55) * game.difficulty.keeperSpeed;
    }
    // keep keeper facing the ball
    keeper.targetFacing = Math.atan2(b.pos.x - keeper.pos.x, b.pos.z - keeper.pos.z);
  }
}

export function resolveKeeperBall(game, dt = 0.016) {
  for (const keeper of [game.homeTeam.keeper, game.awayTeam.keeper]) {
    if (!keeper) continue;
    if (game.owner === keeper) {
      game.keeperHold -= dt;
      if (game.keeperHold <= 0) {
        game.keeperHold = 0;
        const target = game.findPassTarget(keeper, null, false);
        game.owner = null;
        game.ball.owner = null;
        keeper.setOwner(false);
        if (target) {
          game.passBall(keeper, false, null);
          game.audio?.keeperThrow?.();
        } else {
          const dirZ = keeper.team.dir;
          game.ball.kick(new THREE.Vector3(0, 0, dirZ), 24, 5, 0);
          game.ball.lastKicker = keeper;
          game.lastTouch = keeper;
          game.audio?.kick?.(0.6);
        }
      }
      continue;
    }
    if (game.owner || game.state !== 'play') continue;

    const b = game.ball;
    const goalZ = -keeper.team.dir * FIELD.halfLength;
    const ballToGoal = Math.hypot(b.pos.x, b.pos.z - goalZ);
    const d = dist(keeper.pos, b.pos);
    const reach = (0.95 + (keeper.dive.active ? 0.22 : 0)) * game.difficulty.keeperReach;
    if (d > reach || b.pos.y > FIELD.goalHeight + 0.25) continue;
    if (ballToGoal > 14) continue;
    const towardGoal = b.vel.z * (-keeper.team.dir);
    const speed = b.vel.length();
    if (speed > 13 && towardGoal > 1.5) {
      const awaySign = Math.sign(b.pos.z - goalZ) || 1;
      const side = Math.sign(b.pos.x - keeper.pos.x) || (Math.random() > 0.5 ? 1 : -1);
      b.vel.set(side * (2.5 + speed * 0.12) + (Math.random() - 0.5) * 4, 3.2 + speed * 0.09, awaySign * (5.5 + speed * 0.28));
      b.spin = 0;
      b.pickupLock = 0.3;
      b.shotActive = false;
      b.lastKicker = keeper;
      game.lastTouch = keeper;
      game.effects.burst(new THREE.Vector3(b.pos.x, b.pos.y, b.pos.z), 20, [0xffffff, 0x9ff5ff, keeper.team.color], 6, { life: 0.5, gravity: 6 });
      game.effects.ring(new THREE.Vector3(b.pos.x, 0.1, b.pos.z), 0xffffff, 4);
      game.audio?.save?.();
      game.audio?.saveCheer?.();
      game.shake = Math.max(game.shake, 0.42);
      game.ui?.toast?.('SAVED!', 'bad');
      game.stats.saves = (game.stats.saves || 0) + 1;
      keeper.setDive(side);
      keeper.diveTargetX = keeper.pos.x;
      keeper.diveSpeed = 0;
    } else if (speed < 11) {
      game.giveBall(keeper);
      game.keeperHold = 0.75;
      game.effects.ring(new THREE.Vector3(b.pos.x, 0.1, b.pos.z), keeper.team.color, 2.4);
      game.audio?.catch?.();
    }
  }
}
