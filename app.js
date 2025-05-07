import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import MendicotGame from "./gameLogic.js";

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for testing. Secure this in production.
    methods: ["GET", "POST"],
  },
});

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

server.listen(PORT, () => {
  console.log("Mendicot server running on port 3000");
});
