class MendicotGame {
  constructor() {
    this.reset();
  }

  reset() {
    // Clear all game state
    this.players = [];
    this.deck = [];
    this.hands = {};
    this.turn = 0;
    this.trick = [];
    this.currentSuit = null;
    this.trumpSuit = null;
    this.teamScores = { 1: 0, 2: 0 };
    this.tensWon = { 1: 0, 2: 0 };
    this.tricksWon = { 1: 0, 2: 0 };
    this.gameOver = false;
  }

  addPlayer(socket) {
    // If this is the first player after a reset, ensure clean state
    if (this.players.length === 0) {
      this.reset();
    }

    // Check if player is already in the game
    if (this.players.some(p => p.id === socket.id)) {
      return true;
    }

    if (this.players.length >= 4) {
      console.log("Room is full, rejecting connection");
      return false;
    }
    
    // Assign team based on player position (0,2 = team 1, 1,3 = team 2)
    const team = this.players.length % 2 === 0 ? 1 : 2;
    this.players.push({ id: socket.id, socket, team });
    console.log(`Player ${socket.id} connected. Total players: ${this.players.length}`);

    // Always broadcast current state to all players
    this.broadcastWaitingStatus();

    if (this.players.length === 4) {
      console.log("All players connected, preparing to start game");
      // Reset turn to 0 when starting a new game
      this.turn = 0;
      // Give a small delay to ensure all clients receive the final state
      setTimeout(() => {
        console.log("Starting game with players:", this.players.map(p => p.id));
        this.startGame();
      }, 1000);
    }
    return true;
  }

  removePlayer(socketId) {
    console.log(`Removing player ${socketId}`);
    // Remove the player
    this.players = this.players.filter((p) => p.id !== socketId);
    console.log(`Remaining players: ${this.players.length}`);
    
    // If all players have disconnected, reset the game
    if (this.players.length === 0) {
      console.log("All players disconnected, resetting game state");
      this.reset();
      return;
    }
    
    this.broadcastWaitingStatus();
  }

  broadcastWaitingStatus() {
    const connected = this.players.length;
    console.log(`Broadcasting waiting status: ${connected}/4 players to all players`);
    
    // Create the state object once
    const state = {
      playersConnected: connected,
      playersNeeded: 4 - connected,
      players: this.players.map(player => ({ id: player.id, team: player.team }))
    };

    // Send to each player with their specific ID
    this.players.forEach((p) => {
      p.socket.emit("waitingForPlayers", {
        ...state,
        yourId: p.id
      });
    });
  }

  startGame() {
    console.log("Starting game with", this.players.length, "players");
    
    // Save current players
    const currentPlayers = [...this.players];
    
    // Reset game state but preserve players
    this.deck = [];
    this.hands = {};
    this.turn = 0;
    this.trick = [];
    this.currentSuit = null;
    this.trumpSuit = null;
    this.teamScores = { 1: 0, 2: 0 };
    this.tensWon = { 1: 0, 2: 0 };
    this.tricksWon = { 1: 0, 2: 0 };
    this.gameOver = false;
    
    // Restore players
    this.players = currentPlayers;
    
    // Initialize game
    this.deck = this.generateDeck();
    this.shuffle(this.deck);
    this.trumpSuit = this.chooseTrump();
    this.dealCards();
    
    console.log("Game initialized, broadcasting start to players:", this.players.map(p => p.id));
    // Broadcast game start to all players
    this.broadcastGameStart();
  }

  generateDeck() {
    const suits = ["♠", "♥", "♦", "♣"];
    const values = [
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K",
      "A",
    ];
    return suits.flatMap((suit) => values.map((value) => ({ suit, value })));
  }

  shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  chooseTrump() {
    const suits = ["♠", "♥", "♦", "♣"];
    return suits[Math.floor(Math.random() * suits.length)];
  }

  dealCards() {
    this.players.forEach((player, i) => {
      this.hands[player.id] = this.deck.slice(i * 13, (i + 1) * 13);
    });
  }

  broadcastGameStart() {
    console.log("Broadcasting game start to all players");
    this.players.forEach((player, idx) => {
      const gameState = {
        hand: this.hands[player.id],
        yourIndex: idx,
        yourId: player.id,
        players: this.players.map(p => ({ id: p.id, team: p.team })),
        turn: this.players[this.turn]?.id || null,
        trumpSuit: this.trumpSuit,
        team: player.team,
        teamScores: this.teamScores
      };
      console.log(`Sending game start to player ${player.id}:`, gameState);
      player.socket.emit("gameStart", gameState);
    });
  }

  playCard(socketId, card) {
    if (this.gameOver) return;
    
    // Verify the current player's turn
    const currentPlayer = this.players[this.turn];
    if (!currentPlayer || socketId !== currentPlayer.id) return;

    const hand = this.hands[socketId];
    if (!hand) return;

    const cardIndex = hand.findIndex(
      (c) => c.suit === card.suit && c.value === card.value
    );
    if (cardIndex === -1) return;

    hand.splice(cardIndex, 1);

    if (this.trick.length === 0) {
      this.currentSuit = card.suit;
    }

    this.trick.push({ playerId: socketId, card });
    this.turn = (this.turn + 1) % 4;

    if (this.trick.length === 4) {
      const winnerId = this.evaluateTrickWinner();
      const winnerIndex = this.players.findIndex((p) => p.id === winnerId);
      if (winnerIndex !== -1) {
        this.turn = winnerIndex;
      }
      this.trick = [];
      this.currentSuit = null;

      // Check if all cards have been played (13 tricks completed)
      if (this.hands[this.players[0].id].length === 0) {
        this.determineGameWinner();
      }
    }

    this.broadcastGameState();
  }

  checkForTens(winningPlayerId) {
    const winningPlayer = this.players.find(p => p.id === winningPlayerId);
    if (!winningPlayer) return;

    // Check if the winning card is a 10
    const winningCard = this.trick.find(t => t.playerId === winningPlayerId)?.card;
    if (winningCard && winningCard.value === "10") {
      this.tensWon[winningPlayer.team]++;
      
      // Check if a team has won more than 2 tens
      if (this.tensWon[winningPlayer.team] > 2) {
        this.gameOver = true;
        this.broadcastGameOver(winningPlayer.team, 'captured more than 2 tens');
        return true; // Indicate that game is over
      }
    }
    return false;
  }

  evaluateTrickWinner() {
    const order = [
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K",
      "A",
    ];

    const trumpTrick = this.trick.filter((t) => t.card.suit === this.trumpSuit);
    if (trumpTrick.length > 0) {
      const highestTrump = trumpTrick.reduce((max, curr) =>
        order.indexOf(curr.card.value) > order.indexOf(max.card.value)
          ? curr
          : max
      );
      this.updateTeamScore(highestTrump.playerId);
      if (this.checkForTens(highestTrump.playerId)) return highestTrump.playerId; // Game is over
      this.updateTricksWon(highestTrump.playerId);
      return highestTrump.playerId;
    }

    const leadTrick = this.trick.filter(
      (t) => t.card.suit === this.currentSuit
    );
    const highestLead = leadTrick.reduce((max, curr) =>
      order.indexOf(curr.card.value) > order.indexOf(max.card.value)
        ? curr
        : max
    );
    this.updateTeamScore(highestLead.playerId);
    if (this.checkForTens(highestLead.playerId)) return highestLead.playerId; // Game is over
    this.updateTricksWon(highestLead.playerId);
    return highestLead.playerId;
  }

  updateTeamScore(winningPlayerId) {
    const winningPlayer = this.players.find(p => p.id === winningPlayerId);
    if (winningPlayer) {
      this.teamScores[winningPlayer.team]++;
    }
  }

  updateTricksWon(winningPlayerId) {
    const winningPlayer = this.players.find(p => p.id === winningPlayerId);
    if (winningPlayer) {
      this.tricksWon[winningPlayer.team]++;
    }
  }

  determineGameWinner() {
    this.gameOver = true;
    let winningTeam = null;
    let winReason = '';

    // Check tricks won
    if (this.tricksWon[1] > this.tricksWon[2]) {
      winningTeam = 1;
      winReason = 'won more tricks';
    } else if (this.tricksWon[2] > this.tricksWon[1]) {
      winningTeam = 2;
      winReason = 'won more tricks';
    } else {
      // If tricks are equal, check tens won
      if (this.tensWon[1] > this.tensWon[2]) {
        winningTeam = 1;
        winReason = 'captured more tens';
      } else if (this.tensWon[2] > this.tensWon[1]) {
        winningTeam = 2;
        winReason = 'captured more tens';
      } else {
        // If everything is equal, it's a tie
        winningTeam = 0;
        winReason = 'tie';
      }
    }

    this.broadcastGameOver(winningTeam, winReason);
  }

  broadcastGameOver(winningTeam, winReason) {
    this.players.forEach((player) => {
      player.socket.emit("gameOver", {
        winningTeam: winningTeam,
        winReason: winReason,
        tensWon: this.tensWon,
        tricksWon: this.tricksWon,
        teamScores: this.teamScores
      });
    });
  }

  broadcastGameState() {
    this.players.forEach((player) => {
      player.socket.emit("gameState", {
        handsRemaining: this.hands[player.id].length,
        currentTrick: this.trick,
        turn: this.players[this.turn]?.id || null,
        yourId: player.id,
        players: this.players.map(p => ({ id: p.id, team: p.team })),
        teamScores: this.teamScores,
        tensWon: this.tensWon,
        tricksWon: this.tricksWon,
        gameOver: this.gameOver
      });
    });
  }
}

export default MendicotGame;
