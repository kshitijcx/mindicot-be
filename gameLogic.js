class Card {
  constructor(suit, rank) {
    this.suit = suit; // '♠', '♥', '♦', '♣'
    this.rank = rank; // 2-10, 'J', 'Q', 'K', 'A'
  }

  getValue() {
    const order = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    return order.indexOf(String(this.rank));
  }

  isTen() {
    return String(this.rank) === '10';
  }
}

class Player {
  constructor(id) {
    this.id = id;
    this.hand = [];
  }

  playCard(card) {
    const index = this.hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (index > -1) return this.hand.splice(index, 1)[0];
    return null;
  }
}

class MendicotGame {
  constructor(playerIds) {
    if (playerIds.length !== 4) throw new Error("Game must have exactly 4 players.");
    this.players = playerIds.map(id => new Player(id));
    this.teams = [[this.players[0], this.players[2]], [this.players[1], this.players[3]]];
    this.deck = this.createShuffledDeck();
    this.trumpSuit = null;
    this.tricks = [];
    this.tensCount = [0, 0];
    this.tricksWon = [0, 0];
    this.currentTrick = [];
    this.currentTurn = 0;
    this.lastTrickWinner = null; // Store the index of who won the last trick
    this.gameOver = false;
    this.winningTeam = null; // Store the winning team index
    this.isTie = false; // Flag for tie game
    this.dealCards();
    this.selectTrump();
  }

  createShuffledDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A'];
    const deck = [];

    suits.forEach(suit => {
      ranks.forEach(rank => {
        deck.push(new Card(suit, rank));
      });
    });

    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }

  dealCards() {
    let i = 0;
    while (this.deck.length > 0) {
      this.players[i % 4].hand.push(this.deck.pop());
      i++;
    }
  }

  selectTrump() {
    const player = this.players[0];
    const trumpCard = player.hand[Math.floor(Math.random() * player.hand.length)];
    this.trumpSuit = trumpCard.suit;
  }

  getPlayerById(playerId) {
    return this.players.findIndex(p => p.id === playerId);
  }

  playTurn(playerId, card) {
    if (this.gameOver) return { error: "Game is over" };

    const playerIndex = this.getPlayerById(playerId);
    if (playerIndex === -1) return { error: "Player not found" };
    if (playerIndex !== this.currentTurn) return { error: "Not your turn" };

    const playedCard = this.players[playerIndex].playCard(card);
    if (!playedCard) return { error: "Invalid card" };

    this.currentTrick.push({ playerIndex, card: playedCard });
    this.currentTurn = (this.currentTurn + 1) % 4;

    if (this.currentTrick.length === 4) {
      this.evaluateTrick();
    }

    return { success: true };
  }

  evaluateTrick() {
    const leadSuit = this.currentTrick[0].card.suit;
    let winningCard = this.currentTrick[0];
    
    for (let play of this.currentTrick.slice(1)) {
      const { card } = play;
      if (
        (card.suit === this.trumpSuit && winningCard.card.suit !== this.trumpSuit) ||
        (card.suit === winningCard.card.suit && card.getValue() > winningCard.card.getValue())
      ) {
        winningCard = play;
      }
    }

    const winningTeam = winningCard.playerIndex % 2;
    this.tricksWon[winningTeam] += 1;

    // Count tens in the trick and assign to the winning team
    let tensInTrick = 0;
    this.currentTrick.forEach(play => {
      if (play.card.isTen()) {
        tensInTrick += 1;
      }
    });
    
    // Add any tens found to the winning team's count
    if (tensInTrick > 0) {
      this.tensCount[winningTeam] += tensInTrick;
    }

    this.tricks.push([...this.currentTrick]); // Save a copy of the trick
    this.currentTrick = []; // Clear for next trick
    
    // Set next turn to the winning player
    this.currentTurn = winningCard.playerIndex;
    this.lastTrickWinner = winningCard.playerIndex;

    this.checkGameEnd();
  }

  checkGameEnd() {
    // Check for ten-based victory conditions first
    if (this.tensCount[0] > 2) {
      this.gameOver = true;
      this.winningTeam = 0;
      return;
    }
    
    if (this.tensCount[1] > 2) {
      this.gameOver = true;
      this.winningTeam = 1;
      return;
    }
    
    // Check for a tie (both teams have exactly 2 tens)
    if (this.tensCount[0] === 2 && this.tensCount[1] === 2) {
      this.gameOver = true;
      this.isTie = true;
      return;
    }
    
    // Original end condition (all tricks played)
    if (this.tricks.length >= 13) {
      this.gameOver = true;
      // Determine winner based on tens count
      if (this.tensCount[0] > this.tensCount[1]) {
        this.winningTeam = 0;
      } else if (this.tensCount[1] > this.tensCount[0]) {
        this.winningTeam = 1;
      } else {
        this.isTie = true;
      }
    }
  }
}

export default MendicotGame;