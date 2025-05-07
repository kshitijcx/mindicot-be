class MendicotGame {
  constructor() {
    this.players = []; // { id, socket }
    this.deck = [];
    this.hands = {};
    this.turn = 0;
    this.trick = [];
    this.currentSuit = null;
    this.trumpSuit = null;
  }

  addPlayer(socket) {
    if (this.players.length >= 4) return false;
    this.players.push({ id: socket.id, socket });

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
      });
    });
  }

  playCard(socketId, card) {
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
    return highestLead.playerId;
  }

  broadcastGameState() {
    this.players.forEach((player) => {
      player.socket.emit("gameState", {
        handsRemaining: this.hands[player.id].length,
        currentTrick: this.trick,
        turn: this.players[this.turn].id,
      });
    });
  }
}

export default MendicotGame;
