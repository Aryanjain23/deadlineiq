import { randomBytes } from "crypto";
import { Router } from "express";

type GameId = "quickdraw" | "trivia" | "hot-take" | "word-duel" | "fib-finder";
type Player = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  score: number;
  answer?: string;
  taps?: number;
  joinedAt: number;
};
type Room = {
  code: string;
  createdAt: number;
  hostId: string;
  game: GameId;
  phase: "lobby" | "playing" | "results";
  round: number;
  players: Player[];
  prompt: string;
  options: string[];
  correct: number;
  submissions: Record<string, string>;
  roundToken: number;
};
type Question = { prompt: string; options: string[]; correct: number };

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
};

export const partyRouter = Router();
const cleanName = (value: unknown) => String(value ?? "Player").trim().slice(0, 18) || "Player";
const randomId = () => randomBytes(8).toString("hex");

function getRoom(code: string, res: any): Room | undefined {
  const room = rooms.get(code.toUpperCase());
  if (!room || Date.now() - room.createdAt > 12 * 60 * 60 * 1000) {
    res.status(404).json({ error: "Room not found. Ask your host for a fresh QR code." });
    return undefined;
  }
  return room;
}
function requireHost(room: Room, hostId: unknown, res: any) {
  if (hostId !== room.hostId) {
    res.status(403).json({ error: "Only the room host can control the game." });
    return false;
  }
  return true;
}
function snapshot(room: Room) {
  return {
    code: room.code,
    game: room.game,
    phase: room.phase,
    round: room.round + 1,
    prompt: room.prompt,
    options: room.options,
    players: room.players.map(({ id, name, color, bot, score, answer, taps }) => ({ id, name, color, bot, score, answer, taps })),
    submitted: Object.keys(room.submissions).length,
    correct: room.phase === "results" ? room.correct : undefined,
  };
}
function dealRound(room: Room) {
  room.roundToken++;
  const question = prompts[room.game][room.round % prompts[room.game].length];
  room.prompt = question.prompt;
  room.options = question.options;
  room.correct = question.correct;
  room.submissions = {};
  room.players.forEach((player) => {
    delete player.answer;
    delete player.taps;
  });
}
function recordAnswer(room: Room, player: Player, raw: string) {
  if (room.submissions[player.id] !== undefined) return;
  const answer = String(raw).slice(0, 120);
  room.submissions[player.id] = answer;
  player.answer = answer;
  if (room.game === "quickdraw") {
    player.taps = Math.max(0, Math.min(99, Number(answer) || 0));
    player.score += player.taps;
  } else if (room.game === "trivia" || room.game === "fib-finder") {
    if (Number(answer) === room.correct) player.score += 100;
  } else if (room.game === "word-duel") {
    const normalized = answer.trim().toLowerCase();
    const duplicate = Object.entries(room.submissions).some(([id, value]) => id !== player.id && value.trim().toLowerCase() === normalized);
    player.score += normalized.length > 1 ? (duplicate ? 25 : 80) : 0;
  }
}
function playBots(room: Room) {
  const roundToken = room.roundToken;
  for (const bot of room.players.filter((player) => player.bot)) {
    const delay = 850 + Math.random() * 3800;
    setTimeout(() => {
      if (room.phase !== "playing" || room.roundToken !== roundToken || !room.players.includes(bot) || room.submissions[bot.id] !== undefined) return;
      let answer: string;
      if (room.game === "quickdraw") answer = String(20 + Math.floor(Math.random() * 43));
      else if (room.game === "trivia" || room.game === "fib-finder") {
        answer = String(Math.random() < 0.72 ? room.correct : Math.floor(Math.random() * Math.max(1, room.options.length)));
      } else if (room.game === "hot-take") answer = String(Math.floor(Math.random() * room.options.length));
      else answer = ["Moonlight", "Dragon", "Nachos", "Jazz", "Pizza"][Math.floor(Math.random() * 5)];
      recordAnswer(room, bot, answer);
    }, delay);
  }
}

partyRouter.post("/rooms", (req, res) => {
  const code = randomBytes(3).toString("hex").slice(0, 4).toUpperCase();
  const hostId = randomId();
  const room: Room = {
    code,
    createdAt: Date.now(),
    hostId,
    game: "trivia",
    phase: "lobby",
    round: 0,
    prompt: "Pick a game and gather your crew",
    options: [],
    correct: 0,
    submissions: {},
    roundToken: 0,
    players: [],
  };
  rooms.set(code, room);
  res.json({ ...snapshot(room), hostId });
});

partyRouter.get("/rooms/:code", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (room) res.json(snapshot(room));
});
partyRouter.post("/rooms/:code/join", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (room.phase !== "lobby") return res.status(409).json({ error: "This game has already started." });
  if (room.players.length >= 6) return res.status(409).json({ error: "This room is full (6 players maximum)." });
  const player: Player = {
    id: randomId(),
    name: cleanName(req.body?.name),
    color: colors[room.players.length % colors.length],
    bot: false,
    score: 0,
    joinedAt: Date.now(),
  };
  room.players.push(player);
  res.json({ playerId: player.id, ...snapshot(room) });
});
partyRouter.post("/rooms/:code/bots", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (!requireHost(room, req.body?.hostId, res)) return;
  if (room.phase !== "lobby") return res.status(409).json({ error: "Bots can only be added in the lobby." });
  const count = Math.min(6 - room.players.length, Math.max(0, Number(req.body?.count) || 1));
  for (let i = 0; i < count; i++) {
    room.players.push({ id: `bot-${randomId()}`, name: botNames[Math.floor(Math.random() * botNames.length)], color: colors[room.players.length % colors.length], bot: true, score: 0, joinedAt: Date.now() });
  }
  res.json(snapshot(room));
});
partyRouter.post("/rooms/:code/game", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (!requireHost(room, req.body?.hostId, res)) return;
  if (room.phase !== "lobby") return res.status(409).json({ error: "Finish the current game first." });
  const game = String(req.body?.game) as GameId;
  if (!prompts[game]) return res.status(400).json({ error: "Unknown game" });
  room.game = game;
  room.round = 0;
  room.phase = "lobby";
  room.prompt = "Ready? Start the game when everyone's in!";
  room.options = [];
  room.players.forEach((player) => (player.score = 0));
  res.json(snapshot(room));
});
partyRouter.post("/rooms/:code/start", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (!requireHost(room, req.body?.hostId, res)) return;
  if (room.phase !== "lobby") return res.status(409).json({ error: "The round is already underway." });
  room.phase = "playing";
  dealRound(room);
  playBots(room);
  res.json(snapshot(room));
});
partyRouter.post("/rooms/:code/answer", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (room.phase !== "playing") return res.status(409).json({ error: "The round is not accepting answers." });
  const player = room.players.find((candidate) => candidate.id === String(req.body?.playerId));
  if (!player || player.bot) return res.status(403).json({ error: "Player not found" });
  recordAnswer(room, player, String(req.body?.answer ?? ""));
  res.json(snapshot(room));
});
partyRouter.post("/rooms/:code/advance", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  if (!requireHost(room, req.body?.hostId, res)) return;
  if (room.phase === "playing") {
    if (room.game === "hot-take") {
      const voteCounts = room.options.map((_, index) => Object.values(room.submissions).filter((value) => Number(value) === index).length);
      const submittedCounts = voteCounts.filter((count) => count > 0);
      const leastPopular = submittedCounts.length ? Math.min(...submittedCounts) : 0;
      room.players.forEach((player) => {
        const selected = room.submissions[player.id];
        if (selected !== undefined && voteCounts[Number(selected)] === leastPopular) player.score += 80;
      });
    }
    room.phase = "results";
  } else {
    room.round++;
    if (room.round >= 3) {
      room.phase = "lobby";
      room.round = 0;
      room.prompt = "Game over! Pick another game to keep the party going.";
      room.players.sort((a, b) => b.score - a.score);
    } else {
      room.phase = "playing";
      dealRound(room);
      playBots(room);
    }
  }
  res.json(snapshot(room));
});

partyRouter.delete("/rooms/:code/players/:playerId", (req, res) => {
  const room = getRoom(req.params.code, res);
  if (!room) return;
  room.players = room.players.filter((player) => player.id !== req.params.playerId);
  delete room.submissions[req.params.playerId];
  res.json(snapshot(room));
});

setInterval(() => {
  rooms.forEach((room, code) => {
    if (Date.now() - room.createdAt > 12 * 60 * 60 * 1000) rooms.delete(code);
  });
}, 60 * 60 * 1000).unref();
