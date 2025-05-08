// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const MendicotGame = require('./mendicotGame');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let playerSockets = [];
let game = null;

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('join_game', () => {
    if (playerSockets.length < 4) {
      playerSockets.push(socket);
      socket.emit('joined', { playerIndex: playerSockets.length - 1 });

      if (playerSockets.length === 4) {
        const playerIds = playerSockets.map(s => s.id);
        game = new MendicotGame(playerIds);

        playerSockets.forEach((s, i) => {
          s.emit('game_start', {
            playerIndex: i,
            hand: game.players[i].hand,
            trump: game.trumpSuit
          });
        });
      }
    } else {
      socket.emit('error', { message: 'Game already has 4 players.' });
    }
  });

  socket.on('play_card', (card) => {
    if (!game) return socket.emit('error', { message: 'Game not started' });

    const result = game.playTurn(socket.id, card);

    if (result.error) {
      socket.emit('invalid_move', result.error);
    } else {
      io.emit('card_played', { playerId: socket.id, card });

      if (game.currentTrick.length === 0) {
        io.emit('trick_complete', {
          tricksWon: game.tricksWon,
          tensCount: game.tensCount
        });

        if (game.gameOver) {
          io.emit('game_over', {
            winner: game.tricksWon[0] > game.tricksWon[1] ? 'Team 0' : 'Team 1',
            finalStats: {
              tricksWon: game.tricksWon,
              tensCount: game.tensCount,
              trump: game.trumpSuit
            }
          });
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    playerSockets = playerSockets.filter(s => s.id !== socket.id);
    game = null;
    io.emit('game_reset');
  });
});

server.listen(PORT, () => {
  console.log('Mendicot WebSocket server running on http://localhost:3000');
});
