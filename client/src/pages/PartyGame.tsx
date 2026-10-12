import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./party-game.css";

type GameId = "quickdraw" | "trivia" | "hot-take" | "word-duel" | "fib-finder" | "turbo-rally" | "arena-fighter";
type Phase = "lobby" | "playing" | "results";
type Player = {
  id: string; name: string; color: string; bot: boolean; score: number; answer?: string; taps?: number;
  characterId?: string; progress?: number; lane?: number; speed?: number; nitro?: number;
  hp?: number; x?: number; jumping?: boolean; specialReadyAt?: number; attack?: string;
};
type Character = { id: string; name: string; emoji: string; color: string; special: string; damage: number; speed: number };
type Room = {
  code: string; game: GameId; phase: Phase; round: number; prompt: string; options: string[];
  players: Player[]; submitted: number; correct?: number; winnerId?: string; raceEndsAt?: number;
  fightEndsAt?: number; fighters: Character[];
};
const games: { id: GameId; name: string; emoji: string; tagline: string; color: string; type: "party" | "action" }[] = [
  { id: "quickdraw", name: "Quickdraw", emoji: "⚡", tagline: "Tap like your life depends on it", color: "#ffd166", type: "party" },
  { id: "trivia", name: "Brain Blast", emoji: "🧠", tagline: "Tiny facts. Huge bragging rights.", color: "#9cf6d2", type: "party" },
  { id: "hot-take", name: "Hot Take", emoji: "🌶️", tagline: "Pick a side. Own your taste.", color: "#ff8d73", type: "party" },
  { id: "word-duel", name: "Word Duel", emoji: "✍️", tagline: "One prompt. Best answer wins.", color: "#bbadff", type: "party" },
  { id: "fib-finder", name: "Two Truths-ish", emoji: "🕵️", tagline: "Spot the fake before your friends do", color: "#8de0ff", type: "party" },
  { id: "turbo-rally", name: "Turbo Rally", emoji: "🏎️", tagline: "Floor it. Drift it. Beat your crew.", color: "#ff916f", type: "action" },
  { id: "arena-fighter", name: "Neon Brawl", emoji: "🥊", tagline: "Punch, kick, jump & unleash your special", color: "#ca9cff", type: "action" },
];
const api = async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
  const response = await fetch(`/api/party${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
};

export default function PartyGame() {
  const [room, setRoom] = useState<Room | null>(null);
  const [joinCode, setJoinCode] = useState(() => location.pathname.match(/^\/join\/([A-Za-z0-9]+)/)?.[1] || new URLSearchParams(location.search).get("join") || "");
  const [hostId, setHostId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [answer, setAnswer] = useState("");
  const [tapCount, setTapCount] = useState(0);
  const [tapSeconds, setTapSeconds] = useState(8);
  const [tapActive, setTapActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const tapCountRef = useRef(0);
  const host = Boolean(hostId && playerId === hostId);
  const code = room?.code || "";
  const setFrom = (next: unknown) => setRoom(next as Room);
  const sync = useCallback(async (roomCode: string) => {
    try { setFrom(await api(`/rooms/${roomCode}`)); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    const savedHost = localStorage.getItem("party-session");
    const incomingCode = location.pathname.match(/^\/join\/([A-Za-z0-9]+)/)?.[1] || new URLSearchParams(location.search).get("join");
    if (incomingCode) {
      setJoinCode(incomingCode.toUpperCase());
      setName(new URLSearchParams(location.search).get("name") || "");
      const remembered = localStorage.getItem(`party-player-${incomingCode.toUpperCase()}`);
      if (remembered) { setPlayerId(remembered); sync(incomingCode); }
    } else if (savedHost) {
      try { const saved = JSON.parse(savedHost); setHostId(saved.hostId); setPlayerId(saved.hostId); sync(saved.code); } catch { /* Ignore outdated room markers. */ }
    }
  }, [sync]);
  useEffect(() => { if (!code) return; const timer = window.setInterval(() => sync(code), 700); return () => window.clearInterval(timer); }, [code, sync]);
  useEffect(() => {
    if (!tapActive) return;
    if (room?.phase !== "playing") { setTapActive(false); return; }
    const endsAt = Date.now() + 8000; let lastShown = 8;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (left !== lastShown) { lastShown = left; setTapSeconds(left); }
      if (left === 0) { window.clearInterval(timer); setTapActive(false); api(`/rooms/${code}/answer`, "POST", { playerId, answer: tapCountRef.current }).catch(() => {}); }
    }, 150);
    return () => window.clearInterval(timer);
  }, [tapActive, room?.phase, code, playerId]);
  const self = room?.players.find((player) => player.id === playerId);
  const selectedGame = useMemo(() => games.find((game) => game.id === room?.game) || games[1], [room?.game]);
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${code}` : "";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=3&color=111111&bgcolor=ffffff&data=${encodeURIComponent(joinUrl)}`;
  const roomPath = location.pathname.match(/^\/join\/([A-Za-z0-9]+)/)?.[1];

  async function createRoom() {
    setBusy(true); setError("");
    try { const result = await api<any>("/rooms", "POST", { name: name || "Host" }); setHostId(result.hostId); setPlayerId(result.hostId); setFrom(result); localStorage.setItem("party-session", JSON.stringify({ code: result.code, hostId: result.hostId })); history.pushState({}, "", "/"); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function joinRoom(event: React.FormEvent) {
    event.preventDefault(); if (!joinCode.trim()) { setError("Enter a room code first."); return; }
    setBusy(true); setError("");
    try { const result = await api<any>(`/rooms/${joinCode.toUpperCase()}/join`, "POST", { name: name || "Player" }); setPlayerId(result.playerId); localStorage.setItem(`party-player-${joinCode.toUpperCase()}`, result.playerId); setFrom(result); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function addBots(count: number) { try { setFrom(await api(`/rooms/${code}/bots`, "POST", { count, hostId })); } catch (e) { setError((e as Error).message); } }
  async function chooseGame(game: GameId) { try { setFrom(await api(`/rooms/${code}/game`, "POST", { game, hostId })); } catch (e) { setError((e as Error).message); } }
  async function chooseCharacter(characterId: string) { try { setFrom(await api(`/rooms/${code}/character`, "POST", { playerId, characterId })); } catch (e) { setError((e as Error).message); } }
  async function startGame() {
    if (!room?.players.length) { setError("Scan a phone into the room or add a bot before starting."); return; }
    if (room.game === "arena-fighter" && room.players.length < 2) { setError("Neon Brawl needs two fighters. Add a friend or a bot first."); return; }
    try { tapCountRef.current = 0; setFrom(await api(`/rooms/${code}/start`, "POST", { hostId })); setAnswer(""); setTapCount(0); setTapSeconds(8); }
    catch (e) { setError((e as Error).message); }
  }
  async function advance() { try { setFrom(await api(`/rooms/${code}/advance`, "POST", { hostId })); setAnswer(""); }
    catch (e) { setError((e as Error).message); }
  }
  async function submit(value: string) { if (!playerId || !code) return; try { setFrom(await api(`/rooms/${code}/answer`, "POST", { playerId, answer: value })); } catch (e) { setError((e as Error).message); } }
  async function action(actionName: string) { if (!playerId || !code) return; try { setFrom(await api(`/rooms/${code}/action`, "POST", { playerId, action: actionName })); } catch (e) { setError((e as Error).message); } }
  async function leaveRoom() {
    if (!host && room && playerId) { try { await api(`/rooms/${code}/players/${playerId}`, "DELETE"); } catch { /* A room may have ended while leaving. */ } }
    setRoom(null); setPlayerId(""); setHostId(""); setError(""); localStorage.removeItem("party-session"); if (code) localStorage.removeItem(`party-player-${code}`); history.pushState({}, "", "/");
  }
  const incrementTap = () => { tapCountRef.current += 1; setTapCount(tapCountRef.current); };
  const beginTap = () => { tapCountRef.current = 0; setTapCount(0); setTapSeconds(8); setTapActive(true); };

  if (!room || (!playerId && roomPath)) return <main className="party-shell">
    <Header />
    <section className="welcome-grid"><div className="welcome-copy"><span className="eyebrow"><span>✳</span> THE LIVING-ROOM ARCADE</span><h1>Pass the phone.<br/><em>Start the chaos.</em></h1><p>One screen for the big moment. Every phone becomes a controller. Seven games, bots included.</p><div className="welcome-buttons"><button className="primary-button" onClick={createRoom} disabled={busy}>Make a room <span>↗</span></button><span className="no-download">NO DOWNLOADS. JUST FRIENDS.</span></div><div className="game-preview-row">{games.map((game) => <span key={game.id} title={game.name}>{game.emoji}</span>)}<b>7 games · up to 6 phone controllers · bots welcome</b></div></div>
      <div className="arcade-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="poster"><span>INSERT<br/>FRIENDS</span><b>TO<br/>PLAY</b><small>PRESS START<br/>TO GET LOUD</small><i>✳</i></div><div className="sticker sticker-a">NO APP<br/>REQUIRED</div><div className="sticker sticker-b">PLAYER<br/>1–6</div></div></section>
    <section className="lobby-bottom"><div><span className="eyebrow">THE LINEUP</span><div className="game-strip">{games.map((game, i) => <div className="game-mini" key={game.id}><span>{String(i + 1).padStart(2, "0")}</span><b>{game.emoji} {game.name}</b></div>)}</div></div>
      <form className="join-box" onSubmit={joinRoom}><label>JOIN YOUR FRIENDS</label><div className="join-fields"><input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name"/><input className="code-input" placeholder="ROOM CODE" value={joinCode} onChange={(e) => { const next = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4); setJoinCode(next); if (!roomPath) history.replaceState({}, "", `/?join=${next}`); }} aria-label="Room code" readOnly={!!roomPath}/><button className="arrow-button" type="submit" disabled={busy}>→</button></div><small>Scan the host's QR or enter their room code</small></form></section>
    {error && <div className="toast-error">{error}</div>}<Footer />
  </main>;

  return <main className={`party-shell in-room ${room.phase === "playing" ? "is-playing" : ""}`}>
    <nav className="party-top"><a className="party-brand" href="/" onClick={(e) => { e.preventDefault(); void leaveRoom(); }}><span className="brand-glyph">p.</span> PLAYROOM</a><span className="room-label">ROOM <b>{code}</b></span><button className="leave-button" onClick={() => void leaveRoom()}>Leave ↗</button></nav>
    <div className="room-layout"><section className="stage-panel"><div className="stage-head"><div><span className="eyebrow">{room.phase === "lobby" ? "THE LOBBY" : `${selectedGame.emoji} ${selectedGame.name.toUpperCase()} · ${room.game === "arena-fighter" ? "FREE-FOR-ALL" : room.game === "turbo-rally" ? "RACE TO THE FINISH" : `ROUND ${room.round}/3`}`}</span><h1>{room.phase === "lobby" ? <>Room <em>{code}</em> is ready.</> : room.phase === "results" ? <>That was <em>something.</em></> : room.game === "turbo-rally" ? <>Ready,<br/><em>set, zoom.</em></> : room.game === "arena-fighter" ? <>Enter the<br/><em>neon arena.</em></> : <>Phones up.<br/><em>Let's go.</em></>}</h1></div><span className="live-pill"><i/> LIVE</span></div>
      {room.phase === "lobby" ? host ? <HostLobby room={room} chooseGame={chooseGame} addBots={addBots} start={startGame} error={error} /> : <PlayerLobby room={room} player={self} chooseCharacter={chooseCharacter} />
        : room.phase === "playing" ? room.game === "turbo-rally" ? host ? <RaceBoard room={room} /> : <RaceController room={room} player={self} action={action} />
        : room.game === "arena-fighter" ? host ? <FightArena room={room} /> : <FightController room={room} player={self} action={action} />
        : host ? <CasualHost room={room} advance={advance} /> : <Controller room={room} player={self} answer={answer} setAnswer={setAnswer} tapCount={tapCount} onTap={incrementTap} beginTap={beginTap} tapActive={tapActive} tapSeconds={tapSeconds} submit={submit} />
        : <Results room={room} host={host} advance={advance} />}</section>
      <aside className="room-rail"><div className="qr-card"><span className="section-label">SCAN TO JOIN <span>↘</span></span><img src={qrUrl} alt="QR code to join this playroom on your phone"/><b>point. scan. play.</b><div className="code-display">{code.split("").map((char, i) => <span key={i}>{char}</span>)}</div><small>or go to <b>{location.host}/join/{code}</b></small></div>
        <div className="players-card"><div className="section-label">{room.game === "arena-fighter" && room.phase === "playing" ? "IN THE ARENA" : "IN THE ROOM"}<span>{room.players.length}/6</span></div>{room.players.map((player) => <PlayerRow key={player.id} player={player} character={room.fighters.find((fighter) => fighter.id === player.characterId)} />)}{host && room.phase === "lobby" && room.players.length < 6 && <button className="add-player" onClick={() => void addBots(1)}>+ ADD A BOT PLAYER</button>}</div>
        <div className="how-card"><span>✳</span><p>{host ? "THE ROOM SCREEN RUNS THE SHOW. FRIENDS JOIN ON THEIR PHONES." : room.game === "arena-fighter" ? "PICK A FIGHTER. MOVE, DODGE, AND HIT BACK." : room.game === "turbo-rally" ? "HOLD GAS. STEER. SAVE NITRO FOR THE STRAIGHT." : "EVERY PHONE IS A CONTROLLER. THE ROOM SCREEN RUNS THE SHOW."}</p></div></aside></div>
    {error && <div className="toast-error">{error}</div>}<Footer inRoom />
  </main>;
}

function Header() { return <nav className="party-top"><a className="party-brand" href="/"><span className="brand-glyph">p.</span> PLAYROOM</a><span className="online-pill"><i/> READY WHEN YOU ARE</span></nav>; }
function Footer({ inRoom = false }: { inRoom?: boolean }) { return <footer className="party-footer"><span>{inRoom ? "ROOMS EXPIRE AFTER 12 HOURS" : "GOOD TIMES, NO SIGN-UPS."}</span><a href="/planner">DeadlineIQ</a><span>MADE FOR THE COUCH, BUILT FOR THE GROUP CHAT</span></footer>; }
function PlayerRow({ player, character }: { player: Player; character?: Character }) { return <div className="player-line"><span className="avatar" style={{ background: player.color }}>{player.name.slice(0, 1).toUpperCase()}</span><span><b>{player.name}{player.bot && <em> BOT</em>}</b><small>{character ? `${character.emoji} ${character.name}` : player.bot ? "BOT PLAYER" : "PHONE CONTROLLER"}</small></span><strong>{player.score}</strong></div>; }
function HostLobby({ room, chooseGame, addBots, start, error }: { room: Room; chooseGame: (id: GameId) => void; addBots: (count: number) => void; start: () => void; error: string }) {
  return <><div className="game-picker"><div className="section-label">PICK THE MAYHEM <span>01—07</span></div><div className="game-grid">{games.map((game) => <button key={game.id} className={`game-card ${room.game === game.id ? "chosen" : ""} ${game.type === "action" ? "action-game-card" : ""}`} onClick={() => chooseGame(game.id)} style={{ "--game-accent": game.color } as React.CSSProperties}><span className="game-emoji">{game.emoji}</span><b>{game.name}</b><small>{game.tagline}</small><span className="game-check">{room.game === game.id ? "✓" : "+"}</span>{game.type === "action" && <i>NEW</i>}</button>)}</div></div><div className="lobby-actions"><button className="primary-button" onClick={start}>Start the fun <span>↗</span></button><button className="ghost-button" onClick={() => addBots(1)}>+ Add a bot</button><button className="ghost-button" onClick={() => addBots(2)}>+ Add 2 bots</button></div>{error && <p className="lobby-note">{error}</p>}</>;
}
function PlayerLobby({ room, player, chooseCharacter }: { room: Room; player?: Player; chooseCharacter: (id: string) => void }) {
  return <div className="phone-wait-card"><div className="wait-spark">✳</div><span className="eyebrow">YOU'RE IN THE ROOM</span><h2>{room.game === "arena-fighter" ? "Choose your fighter." : "Your controller is ready."}</h2><p>{room.game === "arena-fighter" ? "Pick one of ten characters. Each brings a different special attack." : room.game === "turbo-rally" ? "Get your thumbs ready. The host is setting up the grid." : "Keep your phone handy. The host will kick things off."}</p>{room.game === "arena-fighter" && <CharacterPicker fighters={room.fighters} selected={player?.characterId || "comet"} onChoose={chooseCharacter} />}{room.game === "turbo-rally" && <div className="preview-controls"><span>◀ STEER</span><b>HOLD GAS</b><span>NITRO ▶</span></div>}<div className="waiting-for">{room.players.length} IN THE ROOM <i/><span>WAITING FOR THE HOST</span></div></div>;
}
function CharacterPicker({ fighters, selected, onChoose }: { fighters: Character[]; selected: string; onChoose: (id: string) => void }) {
  return <div className="character-picker"><div className="section-label">THE FIGHTERS <span>{fighters.length} SELECTABLE</span></div><div className="fighter-select-grid">{fighters.map((fighter) => <button key={fighter.id} onClick={() => onChoose(fighter.id)} className={`fighter-choice ${selected === fighter.id ? "selected" : ""}`} style={{ "--fighter-color": fighter.color } as React.CSSProperties}><span className="fighter-portrait">{fighter.emoji}</span><b>{fighter.name}</b><small>✦ {fighter.special}</small><span className="choice-tick">{selected === fighter.id ? "✓" : "+"}</span></button>)}</div><div className="selected-fighter-note">SELECTED: <b>{fighters.find((fighter) => fighter.id === selected)?.name || "Comet"}</b> <span>Special: {fighters.find((fighter) => fighter.id === selected)?.special || "Meteor Rush"}</span></div></div>;
}
function CasualHost({ room, advance }: { room: Room; advance: () => void }) { return <div className="round-card"><span className="eyebrow">{room.game === "quickdraw" ? "GET YOUR THUMBS READY" : "YOUR MOVE"}</span><h2>{room.prompt}</h2><div className="host-view"><div className="host-callout">Your screen runs the round. Friends answer from their phones.</div><div className="submission-count">{room.submitted}<span> / {room.players.length} answered</span></div><button className="primary-button" onClick={advance}>Reveal the results <span>↗</span></button></div></div>; }
function Results({ room, host, advance }: { room: Room; host: boolean; advance: () => void }) {
  const race = room.game === "turbo-rally";
  const fight = room.game === "arena-fighter";
  const ordered = [...room.players].sort((a, b) => fight ? (b.hp ?? 0) - (a.hp ?? 0) : race ? (b.progress ?? 0) - (a.progress ?? 0) : b.score - a.score);
  return <div className="results-card"><div className="results-banner">{fight ? "ARENA RESULTS" : race ? "FINISH LINE" : "ROUND COMPLETE"} <span>✳</span></div>{room.prompt && (race || fight) && <h2 className="special-result-heading">{room.prompt}</h2>}{room.game === "trivia" || room.game === "fib-finder" ? <div className="answer-reveal">THE ANSWER <b>{room.options[room.correct || 0]}</b></div> : null}<div className="score-list">{ordered.map((player, i) => { const fighter = room.fighters.find((entry) => entry.id === player.characterId); return <div className="score-row" key={player.id}><b className="rank">{String(i + 1).padStart(2, "0")}</b><span className="avatar" style={{ background: player.color }}>{player.name.slice(0, 1).toUpperCase()}</span><strong>{player.name}{player.bot && <small> BOT</small>}</strong><span className="player-answer">{fight ? `${fighter?.emoji || "🥊"} ${fighter?.name || "Fighter"} · ${player.hp || 0} HP` : race ? `${Math.round((player.progress || 0) * 100)}% · ${player.speed || 0} km/h` : player.answer ? room.game === "quickdraw" ? `${player.taps} taps` : room.game === "trivia" || room.game === "fib-finder" ? Number(player.answer) === room.correct ? "Nailed it ✓" : "Not quite" : room.game === "hot-take" ? room.options[Number(player.answer)] || "Voted" : player.answer : "…"}</span><b className="score">{fight ? player.hp || 0 : player.score}</b></div>; })}</div>{host ? <button className="primary-button" onClick={advance}>{race || fight || room.round >= 3 ? "Back to game picks" : "Next round"} <span>↗</span></button> : <p className="controller-hint">The host is setting up the next round.</p>}</div>;
}
function RaceBoard({ room }: { room: Room }) {
  const remaining = Math.max(0, Math.ceil(((room.raceEndsAt || Date.now()) - Date.now()) / 1000));
  return <div className="race-board"><div className="race-board-top"><div><span className="eyebrow">THE STARTING GRID</span><h2>{room.prompt}</h2></div><div className="race-clock">0:{String(remaining).padStart(2, "0")}<small>UNTIL CHECKERED FLAG</small></div></div><div className="track-road"><div className="finish-gate">FINISH</div>{[...room.players].sort((a, b) => (a.lane || 0) - (b.lane || 0)).map((player) => <div className="track-lane" key={player.id}><div className="track-lane-info"><span className="lane-avatar" style={{ background: player.color }}>{player.name.slice(0, 1).toUpperCase()}</span><b>{player.name}{player.bot && <small> BOT</small>}</b><span>{player.speed || 0} <small>KM/H</small></span></div><div className="track-strip"><div className="lane-dashes"/><div className="race-car" style={{ left: `${Math.min(90, (player.progress || 0) * 90)}%`, "--car-color": player.color } as React.CSSProperties}>{player.bot ? "🚙" : "🏎️"}</div></div><div className="nitro-dots">{[0, 1, 2].map((n) => <i className={n < (player.nitro || 0) ? "charged" : ""} key={n}/>)}</div></div>)}</div><div className="race-tip"><span>✦</span> Nitro charges are limited. Save yours for the final stretch.</div></div>;
}
function HoldButton({ label, icon, className, disabled, pulse }: { label: string; icon: string; className: string; disabled?: boolean; pulse: () => void }) {
  const interval = useRef<number | null>(null);
  const stop = () => { if (interval.current !== null) window.clearInterval(interval.current); interval.current = null; };
  return <button className={`drive-button ${className}`} disabled={disabled} onContextMenu={(e) => e.preventDefault()} onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pulse(); interval.current = window.setInterval(pulse, 240); }} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}><span>{icon}</span><b>{label}</b></button>;
}
function RaceController({ room, player, action }: { room: Room; player?: Player; action: (value: string) => void }) {
  return <div className="race-controller"><div className="race-controller-status"><span className="eyebrow">{player?.name || "DRIVER"} · {player?.speed || 0} KM/H</span><b>{Math.round((player?.progress || 0) * 100)}%</b></div><div className="mini-track"><span style={{ left: `${Math.min(96, (player?.progress || 0) * 96)}%` }}>🏎️</span><i/></div><div className="steering-row"><button className="steer-button" onClick={() => action("left")}>◀<small>LEFT</small></button><HoldButton label="HOLD TO RACE" icon="⌁" className="gas-button" pulse={() => action("accelerate")} /><button className="steer-button" onClick={() => action("right")}>▶<small>RIGHT</small></button></div><button className={`boost-button ${(player?.nitro || 0) === 0 ? "empty" : ""}`} disabled={(player?.nitro || 0) <= 0} onClick={() => action("boost")}><span>⚡</span> NITRO BOOST <b>{player?.nitro || 0} LEFT</b></button><p className="controller-hint">Hold the green pedal, steer around the track and fire nitro to surge ahead.</p></div>;
}
function FightArena({ room }: { room: Room }) {
  return <div className="fight-arena"><div className="arena-heading"><span className="eyebrow">FREE-FOR-ALL · LAST ONE STANDING</span><span className="arena-timer">⏱ {Math.max(0, Math.ceil(((room.fightEndsAt || Date.now()) - Date.now()) / 1000))}s</span></div><div className="arena-floor"><div className="arena-grid"/><div className="arena-spotlight left"/><div className="arena-spotlight right"/>{room.players.map((player, index) => { const fighter = room.fighters.find((entry) => entry.id === player.characterId); return <div className={`arena-fighter ${player.jumping ? "in-air" : ""} ${player.hp === 0 ? "knocked-out" : ""} ${player.attack ? "attacking" : ""}`} key={player.id} style={{ left: `${8 + (player.x ?? index / Math.max(1, room.players.length - 1)) * 84}%`, "--fighter-color": fighter?.color || player.color } as React.CSSProperties}><div className="arena-nameplate"><b>{player.name}</b><span>{fighter?.name || "Fighter"}{player.bot ? " · BOT" : ""}</span></div><div className="arena-avatar">{fighter?.emoji || "🥊"}</div>{player.attack && <span className="hit-flash">{player.attack === "special" ? "✦" : player.attack === "punch" ? "POW!" : player.attack === "kick" ? "KAPOW!" : ""}</span>}<div className="hp-track"><i style={{ width: `${player.hp ?? 100}%` }}/></div></div>; })}<div className="arena-stage-label">PLAYROOM · MAIN EVENT</div></div><div className="arena-roster">{room.players.map((player) => { const fighter = room.fighters.find((entry) => entry.id === player.characterId); return <div key={player.id}><span style={{ color: fighter?.color }}>{fighter?.emoji}</span><b>{fighter?.name || player.name}</b><small>{player.hp ?? 100} HP</small></div>; })}</div><p className="arena-coach">The computer-controlled fighters are in the arena too. Find an opening, then land your special.</p></div>;
}
function FightController({ room, player, action }: { room: Room; player?: Player; action: (value: string) => void }) {
  const fighter = room.fighters.find((entry) => entry.id === player?.characterId);
  const specialCooling = Boolean(player?.specialReadyAt && player.specialReadyAt > Date.now());
  if (player?.hp === 0) return <div className="fight-controller knocked-panel"><span>💫</span><h2>Knocked out!</h2><p>Stay ringside and watch who takes the crown.</p></div>;
  return <div className="fight-controller"><div className="fighter-hud"><span className="fighter-mini" style={{ background: fighter?.color }}>{fighter?.emoji}</span><div><b>{fighter?.name || "Comet"}</b><small>{fighter?.special || "Meteor Rush"}</small></div><div className="controller-hp"><i style={{ width: `${player?.hp ?? 100}%` }}/></div><strong>{player?.hp ?? 100}<small>HP</small></strong></div><div className="fighter-movement"><button onClick={() => action("left")}>◀<small>MOVE</small></button><button onClick={() => action("right")}>▶<small>MOVE</small></button></div><div className="fighter-action-grid"><button className="attack-punch" onClick={() => action("punch")}><span>✊</span><b>PUNCH</b><small>QUICK HIT</small></button><button className="attack-kick" onClick={() => action("kick")}><span>🦵</span><b>KICK</b><small>HEAVY HIT</small></button><button className="attack-jump" onClick={() => action("jump")}><span>⬆</span><b>JUMP</b><small>DODGE</small></button><button className="attack-special" disabled={specialCooling} onClick={() => action("special")}><span>✦</span><b>{specialCooling ? "RECHARGING" : "SPECIAL"}</b><small>{specialCooling ? "6 SEC COOLDOWN" : fighter?.special || "METEOR RUSH"}</small></button></div><div className="fight-tip">Tap fast, move toward rivals, jump to dodge and unleash your character's special when ready.</div></div>;
}
function Controller({ room, player, answer, setAnswer, tapCount, onTap, beginTap, tapActive, tapSeconds, submit }: { room: Room; player?: Player; answer: string; setAnswer: (value: string) => void; tapCount: number; onTap: () => void; beginTap: () => void; tapActive: boolean; tapSeconds: number; submit: (value: string) => void }) {
  const answered = player?.answer !== undefined;
  if (room.game === "quickdraw") return <div className="controller-area"><button className={`tap-pad ${tapActive ? "tapping" : answered ? "done" : ""}`} disabled={answered} onClick={tapActive ? onTap : beginTap}>{tapActive ? <>{tapCount}<span>{tapSeconds}s LEFT · KEEP TAPPING</span></> : answered ? <>{tapCount}<span>TAPS LOCKED IN</span></> : <>TAP<br/><span>TO BEGIN</span></>}</button><p className="controller-hint">{answered ? "Nice thumbs. Watch the main screen." : "Smash that button while the timer's up."}</p></div>;
  if (room.options.length) return <div className="controller-area choice-area">{room.options.map((option, i) => <button className={`choice-button ${answered ? "locked" : ""}`} disabled={answered} key={i} onClick={() => submit(String(i))}><span>{String.fromCharCode(65 + i)}</span>{option}{answered && Number(player?.answer) === i && <b>✓</b>}</button>)}<p className="controller-hint">{answered ? "Locked! Eyes on the big screen." : "Choose fast. No changing your mind."}</p></div>;
  return <div className="controller-area word-area"><form onSubmit={(event) => { event.preventDefault(); if (answer.trim()) submit(answer.trim()); }}><input maxLength={60} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Your answer…" disabled={answered}/><button disabled={answered || !answer.trim()}>{answered ? "SENT ✓" : "LOCK IT IN ↗"}</button></form><p className="controller-hint">{answered ? `You played: ${player?.answer}` : "Be quick. Be weird. Be unforgettable."}</p></div>;
}
