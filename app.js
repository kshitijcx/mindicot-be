import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import MendicotGame from './gameLogic.js';

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
      const playerIndex = playerSockets.length - 1;

      socket.emit('joined', { playerIndex, playerCount: playerSockets.length });
      io.emit('player_count', { count: playerSockets.length });

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
        
        // Announce whose turn it is to start the game
        io.emit('current_turn', game.currentTurn);
      }
    } else {
      socket.emit('error', { message: 'Game already has 4 players.' });
    }
  });

  socket.on('get_current_turn', () => {
    if (!game) return socket.emit('error', { message: 'Game not started' });

    // Find the player index of the current turn
    const currentTurnIndex = game.currentTurn;

    // Emit to this socket only
    socket.emit('current_turn', currentTurnIndex);
  });

  socket.on('play_card', (card) => {
    if (!game) return socket.emit('error', { message: 'Game not started' });

    const result = game.playTurn(socket.id, card);

    if (result.error) {
      socket.emit('invalid_move', result.error);
    } else {
      io.emit('card_played', { 
        playerId: socket.id, 
        card,
        nextTurn: game.currentTurn // Include info about whose turn is next
      });

      // Let all clients know whose turn it is now
      io.emit('current_turn', game.currentTurn);

      if (game.currentTrick.length === 0) { // This means trick is complete
        const winningPlayerIndex = game.lastTrickWinner;
        
        io.emit('trick_complete', {
          tricksWon: game.tricksWon,
          tensCount: game.tensCount,
          nextTurn: winningPlayerIndex // Include who starts next trick
        });
        
        // Broadcast the new current turn again to make sure everyone is synced
        io.emit('current_turn', game.currentTurn);

        if (game.gameOver) {
          let result;
          
          if (game.isTie) {
            result = {
              outcome: 'tie',
              message: 'Game ended in a tie! Both teams collected 2 tens each.',
              finalStats: {
                tricksWon: game.tricksWon,
                tensCount: game.tensCount,
                trump: game.trumpSuit
              }
            };
          } else {
            const winningTeam = game.winningTeam !== null ? game.winningTeam : 
                               (game.tricksWon[0] > game.tricksWon[1] ? 0 : 1);
            
            result = {
              outcome: 'win',
              winner: `Team ${winningTeam}`,
              message:`Team ${winningTeam} wins by collecting ${game.tensCount[winningTeam]} tens!`,
              finalStats: {
                tricksWon: game.tricksWon,
                tensCount: game.tensCount,
                trump: game.trumpSuit
              }
            };
          }
          
          io.emit('game_over', result);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    playerSockets = playerSockets.filter(s => s.id !== socket.id);
    game = null;
    io.emit('game_reset');
    io.emit('player_count', { count: playerSockets.length });
  });
});

server.listen(3000, () => {
  console.log('Mendicot WebSocket server running on http://localhost:3000');
});