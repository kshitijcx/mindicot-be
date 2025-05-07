import express from "express";
import http from "http";
import { Server } from "socket.io";
import MendicotGame from "./gameLogic.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const game = new MendicotGame();

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  const success = game.addPlayer(socket);
  if (!success) {
    socket.emit("roomFull");
    socket.disconnect();
    return;
  }

  socket.on("playCard", (card) => {
    game.playCard(socket.id, card);
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    game.removePlayer(socket.id);
  });
});

server.listen(3000, () => {
  console.log("Mendicot server running at http://localhost:3000");
});
