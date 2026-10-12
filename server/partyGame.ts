import { randomBytes } from "crypto";
import { Router } from "express";

type GameId = "quickdraw" | "trivia" | "hot-take" | "word-duel" | "fib-finder" | "turbo-rally" | "arena-fighter";
type Player = {
  id: string; name: string; color: string; bot: boolean; score: number; joinedAt: number;
  answer?: string; taps?: number; characterId?: string;
  progress?: number; lane?: number; speed?: number; nitro?: number; botPace?: number;
  hp?: number; x?: number; jumpingUntil?: number; specialReadyAt?: number;
  lastActionAt?: number; lastBotActionAt?: number; attack?: string; attackUntil?: number;
};
type Room = {
  code: string; createdAt: number; hostId: string; game: GameId; phase: "lobby" | "playing" | "results";
  round: number; players: Player[]; prompt: string; options: string[]; correct: number;
  submissions: Record<string, string>; roundToken: number; raceEndsAt?: number; fightEndsAt?: number; winnerId?: string;
};
type Question = { prompt: string; options: string[]; correct: number };

export const FIGHTERS = [
  { id: "comet", name: "Comet", emoji: "☄️", color: "#ff806f", special: "Meteor Rush", damage: 25, speed: 1 },
  { id: "volt", name: "Volt", emoji: "⚡", color: "#ffd166", special: "Thunder Clap", damage: 21, speed: 1 },
  { id: "moss", name: "Moss", emoji: "🌿", color: "#80d8a4", special: "Vine Whip", damage: 19, speed: 0.9 },
  { id: "frost", name: "Frost", emoji: "❄️", color: "#91d5ff", special: "Ice Breaker", damage: 23, speed: 0.9 },
  { id: "nova", name: "Nova", emoji: "🌟", color: "#c7a8ff", special: "Starfall", damage: 22, speed: 1 },
  { id: "rook", name: "Rook", emoji: "🪨", color: "#b8b7c5", special: "Stonewall Smash", damage: 28, speed: 0.75 },
  { id: "echo", name: "Echo", emoji: "🎧", color: "#ff9bd4", special: "Bass Drop", damage: 20, speed: 1.15 },
  { id: "flare", name: "Flare", emoji: "🔥", color: "#ffad69", special: "Solar Kick", damage: 24, speed: 1.05 },
  { id: "shadow", name: "Shadow", emoji: "🌙", color: "#9f9bff", special: "Night Shift", damage: 20, speed: 1.2 },
  { id: "pixel", name: "Pixel", emoji: "👾", color: "#85e4ed", special: "Glitch Burst", damage: 22, speed: 1.1 },
] as const;
type FighterId = (typeof FIGHTERS)[number]["id"];
type FightAction = "left" | "right" | "punch" | "kick" | "jump" | "special";
type RaceAction = "accelerate" | "left" | "right" | "boost" | "brake";

const rooms = new Map<string, Room>();
const colors = ["#ffb6a6", "#ffe08a", "#9ee8d7", "#a8d6ff", "#cfb6ff", "#ffcb90"];
const botNames = ["Mochi", "Pixel", "Beans", "Turbo", "Noodle", "Waffle"];
const prompts: Record<GameId, Question[]> = {
  quickdraw: [{ prompt: "QUICKDRAW! Tap as fast as you can for 8 seconds.", options: [], correct: 0 }],
  trivia: [
    { prompt: "Which animal has three hearts?", options: ["Octopus", "Dolphin", "Turtle", "Penguin"], correct: 0 },
    { prompt: "What is the only planet that spins clockwise?", options: ["Mars", "Venus", "Jupiter", "Neptune"], correct: 1 },
    { prompt: "How many bones does a shark have?", options: ["About 200", "One", "Zero", "About 1,000"], correct: 2 },
  ],
  "hot-take": [
    { prompt: "Pick your forever snack", options: ["Pizza 🍕", "Tacos 🌮", "Fries 🍟", "Ice cream 🍦"], correct: 0 },
    { prompt: "Pick a superpower for just one day", options: ["Teleport", "Read minds", "Time travel", "Talk to cats"], correct: 0 },
    { prompt: "Choose your ideal Friday night", options: ["Big party", "Movie blanket fort", "Midnight food run", "Absolutely no plans"], correct: 0 },
  ],
  "word-duel": [
    { prompt: "Name a movie that starts with the letter S", options: [], correct: 0 },
    { prompt: "Name an animal with exactly 4 letters", options: [], correct: 0 },
    { prompt: "Name a food you can eat with your hands", options: [], correct: 0 },
  ],
  "fib-finder": [
    { prompt: "Which statement is the lie?", options: ["Honey never spoils", "A day on Venus is longer than its year", "Goldfish have a 3-second memory"], correct: 2 },
    { prompt: "Spot the fib about space", options: ["Saturn could float in water", "The Moon has moonquakes", "The Sun is blue"], correct: 2 },
    { prompt: "Which of these is made up?", options: ["Wombat poop is cube-shaped", "Bananas are berries", "A group of flamingos is called a parade"], correct: 2 },
  ],
  "turbo-rally": [{ prompt: "Hold the gas, dodge lanes, and hit nitro to take the checkered flag!", options: [], correct: 0 }],
  "arena-fighter": [{ prompt: "Pick a fighter. Punch, kick, jump, and unleash your special!", options: [], correct: 0 }],
};

export const partyRouter = Router();
const cleanName = (value: unknown) => String(value ?? "Player").trim().slice(0, 18) || "Player";
const randomId = () => randomBytes(8).toString("hex");
const fighterFor = (id?: string) => FIGHTERS.find((fighter) => fighter.id === id) || FIGHTERS[0];
const living = (room: Room) => room.players.filter((player) => (player.hp ?? 100) > 0);

function dealRound(room: Room) {
  room.roundToken++;
  const question = prompts[room.game][room.round % prompts[room.game].length];
  room.prompt = question.prompt;
  room.options = question.options;
  room.correct = question.correct;
  room.submissions = {};
  room.players.forEach((player) => { delete player.answer; delete player.taps; });
}
function applyFightAction(room: Room, player: Player, action: FightAction, now = Date.now()) {
  if (player.hp === 0) return;
  player.attack = action === "left" || action === "right" ? "" : action;
  player.attackUntil = now + 550;
  if (action === "left" || action === "right") {
    player.x = Math.max(0.05, Math.min(0.95, (player.x ?? 0.5) + (action === "left" ? -0.105 : 0.105) * fighterFor(player.characterId).speed));
    return;
  }
  if (action === "jump") { player.jumpingUntil = now + 900; return; }
  if (action === "special" && (player.specialReadyAt ?? 0) > now) return;
  if ((player.lastActionAt ?? 0) + (action === "special" ? 900 : 320) > now) return;
  player.lastActionAt = now;
  if (action === "special") player.specialReadyAt = now + 6000;
  const target = living(room).filter((other) => other.id !== player.id).sort((a, b) => Math.abs((a.x ?? 0.5) - (player.x ?? 0.5)) - Math.abs((b.x ?? 0.5) - (player.x ?? 0.5)))[0];
  if (!target) return;
  const distance = Math.abs((target.x ?? 0.5) - (player.x ?? 0.5));
  const range = action === "punch" ? 0.25 : action === "kick" ? 0.34 : 0.58;
  if (distance > range || (target.jumpingUntil ?? 0) > now) return;
  const damage = action === "punch" ? 9 : action === "kick" ? 13 : fighterFor(player.characterId).damage;
  target.hp = Math.max(0, (target.hp ?? 100) - damage);
  target.x = Math.max(0.05, Math.min(0.95, (target.x ?? 0.5) + Math.sign((target.x ?? 0.5) - (player.x ?? 0.5)) * 0.045));
  player.score += damage * 2;
  if (target.hp === 0) player.score += 200;
}
function finishRace(room: Room) {
  const ranking = [...room.players].sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0));
  ranking.forEach((player, index) => { player.score += Math.max(100, (ranking.length - index) * 100); });
  room.phase = "results";
  room.prompt = "Checkered flag! Here's how the pack finished.";
}
function tickRoom(room: Room) {
  const now = Date.now();
  if (room.phase !== "playing") return;
  if (room.game === "turbo-rally") {
    for (const player of room.players) {
      if (player.bot && (player.progress ?? 0) < 1) {
        player.progress = Math.min(1, (player.progress ?? 0) + (now - (player.lastBotActionAt ?? now)) / 1000 * (player.botPace ?? 0.032));
        player.lastBotActionAt = now;
        player.speed = 130 + Math.round((player.botPace ?? 0.032) * 750);
      }
    }
    if (room.players.length && room.players.every((player) => (player.progress ?? 0) >= 1) || (room.raceEndsAt ?? Infinity) <= now) finishRace(room);
  } else if (room.game === "arena-fighter") {
    for (const bot of room.players.filter((player) => player.bot && (player.hp ?? 100) > 0)) {
      if (now - (bot.lastBotActionAt ?? 0) < 700) continue;
      bot.lastBotActionAt = now;
      const target = living(room).filter((other) => other.id !== bot.id).sort((a, b) => Math.abs((a.x ?? 0.5) - (bot.x ?? 0.5)) - Math.abs((b.x ?? 0.5) - (bot.x ?? 0.5)))[0];
      if (!target) continue;
      const distance = Math.abs((target.x ?? 0.5) - (bot.x ?? 0.5));
      let action: FightAction;
      if (distance > 0.34) action = (target.x ?? 0.5) < (bot.x ?? 0.5) ? "left" : "right";
      else { const choices: FightAction[] = ["punch", "kick", "jump", "special"]; action = choices[Math.floor(Math.random() * choices.length)]; }
      applyFightAction(room, bot, action, now);
    }
    const survivors = living(room);
    if (survivors.length <= 1 || (room.fightEndsAt ?? Infinity) <= now) {
      survivors.sort((a, b) => (b.hp ?? 0) - (a.hp ?? 0));
      if (survivors[0]) { room.winnerId = survivors[0].id; survivors[0].score += 250; }
      room.phase = "results";
      room.prompt = room.winnerId ? `${room.players.find((player) => player.id === room.winnerId)?.name} wins the arena!` : "Time! The arena is a draw.";
    }
  }
}
function publicPlayer(player: Player) {
  return {
    id: player.id, name: player.name, color: player.color, bot: player.bot, score: player.score,
    answer: player.answer, taps: player.taps, characterId: player.characterId,
    progress: player.progress, lane: player.lane, speed: player.speed, nitro: player.nitro,
    hp: player.hp, x: player.x, jumping: (player.jumpingUntil ?? 0) > Date.now(),
    specialReadyAt: player.specialReadyAt,
    attack: (player.attackUntil ?? 0) > Date.now() ? player.attack : "",
  };
}
function snapshot(room: Room) {
  tickRoom(room);
  return {
    code: room.code, game: room.game, phase: room.phase, round: room.round + 1, prompt: room.prompt,
    options: room.options, players: room.players.map(publicPlayer), submitted: Object.keys(room.submissions).length,
    correct: room.phase === "results" ? room.correct : undefined, winnerId: room.winnerId,
    raceEndsAt: room.game === "turbo-rally" ? room.raceEndsAt : undefined,
    fightEndsAt: room.game === "arena-fighter" ? room.fightEndsAt : undefined,
    fighters: FIGHTERS,
  };
}
function getRoom(code: string, res: any): Room | undefined {
  const room = rooms.get(code.toUpperCase());
  if (!room || Date.now() - room.createdAt > 12 * 60 * 60 * 1000) {
    res.status(404).json({ error: "Room not found. Ask your host for a fresh QR code." });
    return undefined;
  }
  tickRoom(room);
  return room;
}
function requireHost(room: Room, hostId: unknown, res: any) {
  if (hostId !== room.hostId) { res.status(403).json({ error: "Only the room host can control the game." }); return false; }
  return true;
}
function playBots(room: Room) {
  const roundToken = room.roundToken;
  for (const bot of room.players.filter((player) => player.bot)) {
    const delay = 850 + Math.random() * 3800;
    setTimeout(() => {
      if (room.phase !== "playing" || room.roundToken !== roundToken || !room.players.includes(bot) || room.submissions[bot.id] !== undefined) return;
      let answer: string;
      if (room.game === "quickdraw") answer = String(20 + Math.floor(Math.random() * 43));
      else if (room.game === "trivia" || room.game === "fib-finder") answer = String(Math.random() < 0.72 ? room.correct : Math.floor(Math.random() * Math.max(1, room.options.length)));
      else if (room.game === "hot-take") answer = String(Math.floor(Math.random() * room.options.length));
      else answer = ["Moonlight", "Dragon", "Nachos", "Jazz", "Pizza"][Math.floor(Math.random() * 5)];
      recordAnswer(room, bot, answer);
    }, delay);
  }
}
function recordAnswer(room: Room, player: Player, raw: string) {
  if (room.submissions[player.id] !== undefined) return;
  const answer = String(raw).slice(0, 120);
  room.submissions[player.id] = answer;
  player.answer = answer;
  if (room.game === "quickdraw") { player.taps = Math.max(0, Math.min(99, Number(answer) || 0)); player.score += player.taps; }
  else if (room.game === "trivia" || room.game === "fib-finder") { if (Number(answer) === room.correct) player.score += 100; }
  else if (room.game === "word-duel") {
    const normalized = answer.trim().toLowerCase();
    const duplicate = Object.entries(room.submissions).some(([id, value]) => id !== player.id && value.trim().toLowerCase() === normalized);
    player.score += normalized.length > 1 ? (duplicate ? 25 : 80) : 0;
  }
}

partyRouter.post("/rooms", (req, res) => {
  const code = randomBytes(3).toString("hex").slice(0, 4).toUpperCase();
  const hostId = randomId();
  const room: Room = { code, createdAt: Date.now(), hostId, game: "trivia", phase: "lobby", round: 0, players: [], prompt: "Pick a game and gather your crew", options: [], correct: 0, submissions: {}, roundToken: 0 };
  rooms.set(code, room);
  res.json({ ...snapshot(room), hostId });
});
partyRouter.get("/rooms/:code", (req, res) => { const room = getRoom(req.params.code, res); if (room) res.json(snapshot(room)); });
partyRouter.post("/rooms/:code/join", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (room.phase !== "lobby") return res.status(409).json({ error: "This game has already started." });
  if (room.players.length >= 6) return res.status(409).json({ error: "This room is full (six phone controllers maximum)." });
  const player: Player = { id: randomId(), name: cleanName(req.body?.name), color: colors[room.players.length % colors.length], bot: false, score: 0, joinedAt: Date.now(), characterId: FIGHTERS[room.players.length % FIGHTERS.length].id };
  room.players.push(player);
  res.json({ playerId: player.id, ...snapshot(room) });
});
partyRouter.post("/rooms/:code/bots", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (!requireHost(room, req.body?.hostId, res)) return;
  if (room.phase !== "lobby") return res.status(409).json({ error: "Bots can only be added in the lobby." });
  const count = Math.min(6 - room.players.length, Math.max(0, Number(req.body?.count) || 1));
  for (let i = 0; i < count; i++) room.players.push({ id: `bot-${randomId()}`, name: botNames[Math.floor(Math.random() * botNames.length)], color: colors[room.players.length % colors.length], bot: true, score: 0, joinedAt: Date.now(), characterId: FIGHTERS[Math.floor(Math.random() * FIGHTERS.length)].id, botPace: 0.027 + Math.random() * 0.011 });
  res.json(snapshot(room));
});
partyRouter.post("/rooms/:code/game", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (!requireHost(room, req.body?.hostId, res)) return;
  if (room.phase !== "lobby") return res.status(409).json({ error: "Finish the current game first." });
  const game = String(req.body?.game) as GameId;
  if (!(game in prompts)) return res.status(400).json({ error: "Unknown game" });
  room.game = game; room.round = 0; room.phase = "lobby"; room.prompt = prompts[game][0].prompt; room.options = []; room.winnerId = undefined;
  room.players.forEach((player) => { player.score = 0; player.characterId ||= FIGHTERS[0].id; });
  res.json(snapshot(room));
});
partyRouter.post("/rooms/:code/character", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (room.game !== "arena-fighter" || room.phase !== "lobby") return res.status(409).json({ error: "Fighters can only be chosen before a match." });
  const player = room.players.find((candidate) => candidate.id === String(req.body?.playerId));
  if (!player || player.bot) return res.status(403).json({ error: "Player not found" });
  if (!FIGHTERS.some((fighter) => fighter.id === req.body?.characterId)) return res.status(400).json({ error: "Choose one of the ten available fighters." });
  player.characterId = req.body.characterId as FighterId;
  res.json(snapshot(room));
});
partyRouter.post("/rooms/:code/start", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (!requireHost(room, req.body?.hostId, res)) return;
  if (room.phase !== "lobby") return res.status(409).json({ error: "The round is already underway." });
  if (room.players.length === 0) return res.status(409).json({ error: "Scan a phone into the room or add a bot before starting." });
  if (room.game === "arena-fighter" && room.players.length < 2) return res.status(409).json({ error: "The arena needs two fighters. Add a friend or a bot first." });
  room.phase = "playing"; room.winnerId = undefined;
  if (room.game === "turbo-rally") {
    room.raceEndsAt = Date.now() + 35_000;
    room.players.forEach((player, index) => { player.progress = 0; player.lane = index % 3; player.speed = 0; player.nitro = 3; player.lastBotActionAt = Date.now(); player.botPace ||= 0.031; });
    room.prompt = "GO! Hold the gas, steer through the turns, and hit nitro.";
  } else if (room.game === "arena-fighter") {
    room.fightEndsAt = Date.now() + 45_000;
    room.players.forEach((player, index) => { player.hp = 100; player.x = room.players.length === 1 ? 0.5 : 0.08 + index * (0.84 / (room.players.length - 1)); player.specialReadyAt = 0; player.lastActionAt = 0; player.lastBotActionAt = 0; player.attack = ""; player.attackUntil = 0; player.jumpingUntil = 0; });
    room.prompt = "FIGHT! Last player standing wins.";
  } else { dealRound(room); playBots(room); }
  res.json(snapshot(room));
});
partyRouter.post("/rooms/:code/answer", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (room.phase !== "playing" || room.game === "turbo-rally" || room.game === "arena-fighter") return res.status(409).json({ error: "The round is not accepting answers." });
  const player = room.players.find((candidate) => candidate.id === String(req.body?.playerId));
  if (!player || player.bot) return res.status(403).json({ error: "Player not found" });
  recordAnswer(room, player, String(req.body?.answer ?? ""));
  res.json(snapshot(room));
});
partyRouter.post("/rooms/:code/action", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (room.phase !== "playing") return res.status(409).json({ error: "The game is not active." });
  const player = room.players.find((candidate) => candidate.id === String(req.body?.playerId));
  if (!player || player.bot) return res.status(403).json({ error: "Player not found" });
  const action = String(req.body?.action);
  if (room.game === "turbo-rally") {
    if (!["accelerate", "left", "right", "boost", "brake"].includes(action)) return res.status(400).json({ error: "Unknown driving control." });
    if (action === "left") player.lane = Math.max(0, (player.lane ?? 1) - 1);
    if (action === "right") player.lane = Math.min(2, (player.lane ?? 1) + 1);
    if (action === "accelerate") { player.speed = Math.min(220, (player.speed ?? 0) + 20); player.progress = Math.min(1, (player.progress ?? 0) + 0.008 + (player.speed ?? 0) / 20_000); }
    if (action === "brake") player.speed = Math.max(0, (player.speed ?? 0) - 26);
    if (action === "boost" && (player.nitro ?? 0) > 0) { player.nitro!--; player.speed = Math.min(260, (player.speed ?? 0) + 55); player.progress = Math.min(1, (player.progress ?? 0) + 0.045); }
  } else if (room.game === "arena-fighter") {
    if (!["left", "right", "punch", "kick", "jump", "special"].includes(action)) return res.status(400).json({ error: "Unknown fighter control." });
    applyFightAction(room, player, action as FightAction);
  } else return res.status(409).json({ error: "This game has no live action controls." });
  res.json(snapshot(room));
});
partyRouter.delete("/rooms/:code/players/:playerId", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  const index = room.players.findIndex((player) => player.id === req.params.playerId && !player.bot);
  if (index < 0) return res.status(404).json({ error: "Phone player not found." });
  room.players.splice(index, 1);
  res.json(snapshot(room));
});
partyRouter.post("/rooms/:code/advance", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (!requireHost(room, req.body?.hostId, res)) return;
  if (room.phase === "playing") {
    if (room.game === "turbo-rally" || room.game === "arena-fighter") return res.status(409).json({ error: "This match runs until the finish or knockout." });
    if (room.game === "hot-take") {
      const voteCounts = room.options.map((_, index) => Object.values(room.submissions).filter((value) => Number(value) === index).length);
      const submittedCounts = voteCounts.filter((count) => count > 0);
      const leastPopular = submittedCounts.length ? Math.min(...submittedCounts) : 0;
      room.players.forEach((player) => { const selected = room.submissions[player.id]; if (selected !== undefined && voteCounts[Number(selected)] === leastPopular) player.score += 80; });
    }
    room.phase = "results";
  } else {
    if (room.game === "turbo-rally" || room.game === "arena-fighter") {
      room.phase = "lobby"; room.round = 0; room.prompt = "Pick another game to keep the party going.";
      room.players.forEach((player) => { delete player.progress; delete player.lane; delete player.speed; delete player.nitro; delete player.hp; delete player.x; });
    } else {
      room.round++;
      if (room.round >= 3) { room.phase = "lobby"; room.round = 0; room.prompt = "Game over! Pick another game to keep the party going."; room.players.sort((a, b) => b.score - a.score); }
      else { room.phase = "playing"; dealRound(room); playBots(room); }
    }
  }
  res.json(snapshot(room));
});
setInterval(() => { rooms.forEach((room, code) => { if (Date.now() - room.createdAt > 12 * 60 * 60 * 1000) rooms.delete(code); }); }, 60 * 60 * 1000).unref();
