import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

server.listen(3000, () => {
  console.log("Mendicot server running on port 3000");
});
