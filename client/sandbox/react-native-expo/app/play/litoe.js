import { useState, useEffect } from "react";
import { tx, id, init } from "@instantdb/react-native";
import { View, Text, Pressable } from "react-native";

import config from "../config";


let currentRoomId = null;

// Consts
// --------------------

const adjectives = [
  "happy",
  "sad",
  "angry",
  "funny",
  "serious",
  "colorful",
  "boring",
  "fast",
  "slow",
  "loud",
].map(capitalize);

const nouns = [
  "dog",
  "cat",
  "bird",
  "fish",
  "lion",
  "tiger",
  "bear",
  "elephant",
  "giraffe",
  "whale",
].map(capitalize);

const PLAYER_ID = generateRandomString();

// When enabled allows a player to move for their opponent
const _DEBUG_TURN = false;

// Instant
// --------------------
const { useQuery, transact } = init({
  appId: config.appId,
  websocketURI: "wss://api.instantdb.com/runtime/session",
});

// Game logic
// --------------------
/** Returns true if a row contains all of the same markers */
function checkRows(board, mark) {
  return board.some((row) => row.every((val) => val === mark));
}

/** Returns true if all entries of a board are full */
function isFull(board) {
  return board.every((row) => row.length && row.every((sq) => sq));
}

/** Returns true if there is a win condition (checks rows, columns, diagonals) */
function isGameWon(board, mark) {
  const inverted = board.map((_, col) => [
    board[0][col],
    board[1][col],
    board[2][col],
  ]);
  const diags = [
    [board[0][0], board[1][1], board[2][2]],
    [board[0][2], board[1][1], board[2][0]],
  ];

  return [board, inverted, diags].some((x) => checkRows(x, mark));
}

/** We consider a game started once there has been at least two moves */
function hasGameStarted(board) {
  return board.flat().filter((x) => x).length > 1;
}

/** Return a new array with value replaced at target index */
function updateInArr(arr, target, newVal) {
  return arr.map((val, i) => (i === target ? newVal : val));
}

/** Return a new 2D array with value replaced at target coordinates */
function updateInMatrix(m, [x, y], newVal) {
  return m.map((row, r) => (r === x ? updateInArr(row, y, newVal) : row));
}

function updateOutcome(newBoard, currentPlayer, mark) {
  if (isGameWon(newBoard, mark)) {
    return currentPlayer;
  }

  if (isFull(newBoard)) {
    return "draw";
  }
}

// State Management
// --------------------
const MARKER = { 0: "x", 1: "o" };
function getMarker(idx) {
  return MARKER[idx];
}

/** Returns empty board state */
function emptyBoard() {
  return [
    [undefined, undefined, undefined],
    [undefined, undefined, undefined],
    [undefined, undefined, undefined],
  ];
}

/** Returns initial game state */
function initialState() {
  return {
    board: emptyBoard(),
    turn: 0,
    outcome: null,
    players: [],
    clocks: [60, 60],
    rematchId: null,
  };
}

/** Returns an update to reset game state */
function resetGameState(game, opts = {}) {
  const { players } = game;
  const { reversePlayers } = opts;
  const newGame = initialState();
  return {
    ...newGame,
    players: reversePlayers ? players.slice().reverse() : players,
  };
}

/** Given a game and coordinates for a move, returns an update to alter game state */
function move(game, [r, c]) {
  const { board, turn, players } = game;
  const mark = getMarker(turn);
  const currentPlayer = players[turn];
  const newTurn = turn === 0 ? 1 : 0;
  const newBoard = updateInMatrix(board, [r, c], mark);
  const newOutcome = updateOutcome(newBoard, currentPlayer, mark);
  return { ...game, board: newBoard, turn: newTurn, outcome: newOutcome };
}

/** Returns an update to add a player to a game */
function addPlayer(game, id) {
  const { players } = game;
  const newPlayers = new Set([...players, id]);
  return { ...game, players: [...newPlayers] };
}

/** Returns an update to remove a player from a game */
function removePlayer(game, id) {
  const { players } = game;
  const newPlayers = players.filter((p) => p !== id);
  return { players: [...newPlayers] };
}

/** Returns game data for a ROOM_ID */
function findGame(games, roomId) {
  return roomId && games.find((g) => g.id === roomId);
}

/** Returns the opponent player id */
function getOpponentId(players, playerId) {
  if (isObserver(players, playerId)) {
    console.warn(
      "[getOpponent] should only called be called with a valid player",
    );
    return;
  }
  const idx = players.indexOf(playerId);
  return idx === 0 ? players[1] : players[0];
}

/** Return if a player is part of game */
function isPlayer(players, playerId) {
  return players.indexOf(playerId) > -1;
}

/** Return if a player is an observer of game */
function isObserver(players, playerId) {
  return !isPlayer(players, playerId);
}

/** Return if an outcome has been determined */
function isOutcome(game) {
  const { outcome } = game;
  return !!outcome;
}

/** Returns if a rematch has been offered */
function isRematch(game) {
  const { rematchId } = game;
  return !!rematchId;
}

/** Return if player was offered a rematch */
function isRematchPlayer(game, playerId) {
  const { rematchId } = game;
  return playerId === rematchId;
}

// Actions
// --------------------
/** Reset game state */
function resetGame(game, opts = {}) {
  const { id: roomId } = game;
  transact(tx.games[roomId].update(resetGameState(game, opts)));
}

/** Adds a player to the game if there is space */
function maybeJoin(game, playerId) {
  const { players, id: roomId } = game;
  if (players.length < 2 && !isPlayer(players, PLAYER_ID)) {
    transact(tx.games[roomId].update(addPlayer(game, playerId)));
  }
}

/** Offers rematch to player's opponent */
function offerRematch(game, playerId) {
  const { id: roomId, rematchId, players } = game;
  const newUpdate = rematchId
    ? resetGameState(game, { reversePlayers: true })
    : { rematchId: getOpponentId(players, playerId) };
  transact(tx.games[roomId].update(newUpdate));
}

// Navigation
// -----------------
const getLocationRoom = () => {
  return currentRoomId;
};

const setLocationRoom = (id) => {
  currentRoomId = id;
};

const clearLocationRoom = () => {
  currentRoomId = null;
};

// Components
// --------------------
function AdminButton({ onPress, children }) {
  return (
    <Pressable
      className="text-sm text-left outline p-2 my-2 hover:bg-slate-400"
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}

function Button({ onPress, children, disabled }) {
  return (
    <Pressable
      className={`p-4 border border-solid w-32 ${
        disabled
          ? "text-gray-300 border-gray-300"
          : "border-black hover:bg-slate-200"
      }`}
      onPress={onPress}
      disabled={disabled}
    >
      {children}
    </Pressable>
  );
}

function App() {
  const { isLoading, error, data } = useQuery({ games: {} });
  if (isLoading) return <Text>Loading ...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return <Main data={data} />;
}

// Screens
// --------------------
function _AdminBar({ setRoomId }) {
  const { isLoading, error, data } = useQuery({ games: {} });
  if (isLoading) return <Text>Loading ...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  const { games } = data;
  const roomId = getLocationRoom();
  const game = roomId && findGame(games, roomId);

  const deleteAll = () => transact(games.map((g) => tx.games[g.id].delete()));
  return (
    <Drawer defaultOpen={true}>
      <View className="pt-2 px-2">
        <Text className="text-center pb-1">Admin bar</Text>
        <View className="bg-slate-600 pb-1 mb-1"></View>
        <View className="flex flex-col">
          <Text className="text-xs py-1">** Logged in as: {PLAYER_ID} **</Text>
          {game && (
            <View className="text-xs py-1">
              <Text>Current room</Text>
              <Text className="mt-1">{roomId}</Text>
            </View>
          )}
          <Text>Live Rooms: {(games && games.length) || 0}</Text>
          <AdminButton
            onPress={() => {
              clearLocationRoom();
              setRoomId(null);
              deleteAll();
            }}
          >
            <Text>Delete All Games</Text>
          </AdminButton>
          {game && (
            <AdminButton onPress={() => resetGame(game)}>
              <Text>Reset Game</Text>
            </AdminButton>
          )}
        </View>
      </View>
    </Drawer>
  );
}

const Drawer = ({ defaultOpen, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen || false);

  const toggleDrawer = () => {
    setIsOpen(!isOpen);
  };

  return (
    <View className="z-40">
      <Pressable
        onPress={toggleDrawer}
        className="py-2 px-4 absolute top-0 right-0 z-50"
      >
        <Text>{isOpen ? "-" : "+"}</Text>
      </Pressable>
      <View className="drawer absolute top-0 right-0 h-screen w-32 overflow-auto bg-slate-200 bg-opacity-30">
        {children}
      </View>
    </View>
  );
};

function gameHeaderText({ players, outcome, turn }) {
  if (players.length < 2) {
    return <Text>"Waiting for opponent to join..."</Text>;
  }

  if (!outcome) {
    return <Text>`Turn: ${players[turn]}`</Text>;
  }

  return outcome === "draw" ? (
    <Text>"Draw!"</Text>
  ) : (
    <Text>`${outcome} wins!`</Text>
  );
}

function Main({ data }) {
  const { games } = data;
  const [roomId, setRoomId] = useState(getLocationRoom());
  const game = findGame(games, roomId);
  const deleteAll = () => transact(games.map((g) => tx.games[g.id].delete()));

  // Clock countdown
  useEffect(() => {
    if (game) {
      maybeJoin(game, PLAYER_ID);

      const { players, clocks, turn, outcome } = game;
      if (players.length >= 2 && players[turn] === PLAYER_ID && !outcome) {
        // New clock values
        const newClocks =
          turn === 0 ? [clocks[0] - 1, clocks[1]] : [clocks[0], clocks[1] - 1];

        // Account for time over
        let newUpdates;
        const timeOverIdx = newClocks.indexOf(0);
        if (timeOverIdx > -1) {
          const newOutcome = timeOverIdx === 0 ? players[1] : players[0];
          newUpdates = { clocks: newClocks, outcome: newOutcome };
        } else {
          newUpdates = { clocks: newClocks };
        }

        const timerId = setInterval(
          () => transact(tx.games[game.id].update({ ...newUpdates })),
          1000,
        );
        return () => clearInterval(timerId);
      }
    }
  }, [game]);

  // Lobby
  if (!game) {
    return (
      <View className="my-4 p-4">
        <Button
          onPress={() => {
            const roomId = id();
            const newGame = addPlayer(initialState(), PLAYER_ID);
            transact(tx.games[roomId].update(newGame));
            setLocationRoom(roomId);
            setRoomId(roomId);
          }}
        >
          <Text>Create Game!</Text>
        </Button>
        <View className="mt-8">
          <Text className="text-xl my-2 font-bold">Games</Text>
          {games.length > 0 && (
            <View>
              {games
                .filter((g) => !g.private)
                .map((g) => (
                  <View
                    key={g.id}
                    className="py-4 px-2 my-2 border border-black"
                  >
                    <Text
                      onPress={() => {
                        const roomId = g.id;
                        transact(
                          tx.games[roomId].update(addPlayer(g, PLAYER_ID)),
                        );
                        setLocationRoom(roomId);
                        setRoomId(roomId);
                      }}
                      key={g.id}
                    >
                      {g.players[0]}
                    </Text>
                  </View>
                ))}
            </View>
          )}
        </View>
        <View className="mt-8">
          <Button onPress={() => deleteAll()}>
            <Text>Delete Games!</Text>
          </Button>
        </View>
      </View>
    );
  }

  // Game
  const { board, turn, outcome, players, clocks } = game;
  return (
    <View className="flex-row my-16">
      {/* Player list + clocks */}
      <View className="flex-1 p-4">
        {/* Buttons */}
        <View className="flex-row mb-4">
          <View className="mr-1">
            <Button
              onPress={() => {
                players.length === 1
                  ? transact(tx.games[roomId].delete())
                  : transact(
                      tx.games[roomId].update(removePlayer(game, PLAYER_ID)),
                    );
                clearLocationRoom();
                setRoomId(null);
              }}
              disabled={
                isPlayer(players, PLAYER_ID) &&
                hasGameStarted(board) &&
                !isOutcome(game)
              }
            >
              <Text>Leave game</Text>
            </Button>
          </View>
          <View className="mr-1">
            <Button
              onPress={() => {
                const playerIdx = players.indexOf(PLAYER_ID);
                const winner = playerIdx === 0 ? players[1] : players[0];
                transact(tx.games[roomId].update({ outcome: winner }));
              }}
              disabled={
                isObserver(players, PLAYER_ID) ||
                (isPlayer(players, PLAYER_ID) && !hasGameStarted(board)) ||
                isOutcome(game)
              }
            >
              <Text>Forfeit game</Text>
            </Button>
          </View>
          <View>
            {isRematchPlayer(game, PLAYER_ID) ? (
              <Button onPress={() => resetGame(game, { reversePlayers: true })}>
                <Text>Accept rematch</Text>
              </Button>
            ) : (
              <Button
                onPress={() => offerRematch(game, PLAYER_ID)}
                disabled={
                  isObserver(players, PLAYER_ID) ||
                  (isPlayer(players, PLAYER_ID) && !isOutcome(game)) ||
                  isRematch(game)
                }
              >
                <Text>
                  {isRematch(game) ? "Rematch offered" : "Offer rematch"}
                </Text>
              </Button>
            )}
          </View>
        </View>

        {/* Player 1 and Clock Info */}
        <View className="mb-4">
          <Text className="text-2xl">
            {convertSecondsToMinutesAndSeconds(clocks[0])}
          </Text>
          <View
            className={`w-full border border-2 ${
              turn === 0 && !outcome && "border-green-600"
            }`}
          ></View>
          <Text className={players[0] === outcome ? "bg-slate-200 py-4" : ""}>
            {players[0] && `${players[0]} -- ${getMarker(0)}`}
          </Text>
        </View>

        {/* Board */}
        <View className="mb-4 items-center">
          {board.map((row, r) => (
            <View key={`row-${r}`} className="flex-row">
              {row.map((sq, c) => (
                <Button
                  key={`idx-${r}-${c}`}
                  onPress={() =>
                    players.length >= 2 &&
                    !outcome &&
                    !board[r][c] &&
                    (_DEBUG_TURN || players[turn] === PLAYER_ID) &&
                    transact(tx.games[roomId].update(move(game, [r, c])))
                  }
                >
                  <View className="items-center justify-center w-24 h-24 text-lg">
                    <Text className="text-7xl">{sq}</Text>
                  </View>
                </Button>
              ))}
            </View>
          ))}
        </View>

        {/* Player 2 and Clock Info */}
        <View>
          <Text className={players[1] === outcome ? "bg-slate-200 py-4" : ""}>
            {players[1] && `${players[1]} -- ${getMarker(1)}`}
          </Text>
          <View
            className={`w-full border border-2 ${
              turn === 1 && !outcome && "border-green-600"
            }`}
          ></View>
          <Text className="text-2xl">
            {convertSecondsToMinutesAndSeconds(clocks[1])}
          </Text>
        </View>
      </View>
    </View>
  );
}

function capitalize(str) {
  if (!str || typeof str !== "string") {
    return "";
  }

  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Converts seconds into minutes and seconds
 * convertSecondsToMinutesAndSeconds(90) -> "1:30"
 */
function convertSecondsToMinutesAndSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" + seconds : seconds}`;
}

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function generateRandomString() {
  const randomNumber = Math.floor(Math.random() * 1000) + 1;

  const randomAdjective = getRandomElement(adjectives);
  const randomNoun = getRandomElement(nouns);

  return `${randomAdjective}${randomNoun}${randomNumber}`;
}

export default App;
