class MendicotGame {
  constructor() {
    this.players = []; // { id, socket, team }
    this.deck = [];
    this.hands = {};
    this.turn = 0;
    this.trick = [];
    this.currentSuit = null;
    this.trumpSuit = null;
    this.teamScores = { 1: 0, 2: 0 }; // Track scores for both teams
    this.tensWon = { 1: 0, 2: 0 }; // Track number of 10s won by each team
    this.gameOver = false;
    this.tricksWon = { 1: 0, 2: 0 }; // Track number of tricks won by each team
  }

  addPlayer(socket) {
    if (this.players.length >= 4) return false;
    
    // Assign team based on player position (0,2 = team 1, 1,3 = team 2)
    const team = this.players.length % 2 === 0 ? 1 : 2;
    this.players.push({ id: socket.id, socket, team });

    if (this.players.length === 4) {
      setTimeout(() => this.startGame(), 1000);
    } else {
      this.broadcastWaitingStatus();
    }
    return true;
  }

  removePlayer(socketId) {
    this.players = this.players.filter((p) => p.id !== socketId);
    this.broadcastWaitingStatus();
  }

  broadcastWaitingStatus() {
    const connected = this.players.length;
    this.players.forEach((p) => {
      p.socket.emit("waitingForPlayers", {
        playersConnected: connected,
        playersNeeded: 4 - connected,
      });
    });
  }

  startGame() {
    this.deck = this.generateDeck();
    this.shuffle(this.deck);
    this.trumpSuit = this.chooseTrump();
    this.dealCards();
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
    this.players.forEach((player, idx) => {
      player.socket.emit("gameStart", {
        hand: this.hands[player.id],
        yourIndex: idx,
        turn: this.players[this.turn].id,
        trumpSuit: this.trumpSuit,
        team: player.team,
        teamScores: this.teamScores
      });
    });
  }

  playCard(socketId, card) {
    if (this.gameOver) return; // Don't allow plays if game is over
    
    const currentPlayerId = this.players[this.turn].id;
    if (socketId !== currentPlayerId) return;

    const hand = this.hands[socketId];
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
      this.turn = this.players.findIndex((p) => p.id === winnerId);
      this.trick = [];
      this.currentSuit = null;

      // Check if all cards have been played (13 tricks completed)
      if (this.hands[this.players[0].id].length === 0) {
        this.determineGameWinner();
      }
    }

    this.broadcastGameState();
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
      this.checkForTens(highestTrump.playerId);
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
    this.checkForTens(highestLead.playerId);
    this.updateTricksWon(highestLead.playerId);
    return highestLead.playerId;
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
        this.broadcastGameOver(winningPlayer.team);
      }
    }
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

    // First check for team with more than 2 tens
    if (this.tensWon[1] > 2) {
      winningTeam = 1;
      winReason = 'captured more than 2 tens';
    } else if (this.tensWon[2] > 2) {
      winningTeam = 2;
      winReason = 'captured more than 2 tens';
    } else {
      // If no team has more than 2 tens, check tricks won
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
        turn: this.players[this.turn].id,
        teamScores: this.teamScores,
        tensWon: this.tensWon,
        tricksWon: this.tricksWon,
        gameOver: this.gameOver
      });
    });
  }
}

export default MendicotGame;
