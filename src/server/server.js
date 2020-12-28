require('dotenv').config();

const http = require('http');
const express = require('express');
const SocketIO = require('socket.io');
const Game = require('./game');

class Server {
  constructor() {
    this.host = process.env.HOST || '0.0.0.0';
    this.port = process.env.PORT || 5000;

    this.app = express();
    this.http = http.createServer(this.app);
    this.io = new SocketIO(this.http);

    this.games = {};
  }

  createHttp() {
    return this;
  }

  createSocketRoutes() {
    this.io.on('connection', (socket) => {
      socket.on('disconnect', () => {
        Object.values(socket.rooms).forEach((room) => {
          const game = this.game[room];

          if (game) {
            const hostRoom = `game-${socket.id}`;

            game.removePlayer(socket.id);

            if (room === hostRoom && !game.isActive) {
              delete this.games[room];
            }

            if (Object.values(game.players).length === 0) {
              delete this.games[room];
            }
          }
        });
      });

      socket.on('list-game', () => {
        socket.emit('list-game', {
          data: Object.values(this.games).map((game) => game.id),
        });
      });

      socket.on('new-game', () => {
        const id = `game-${socket.id}`;

        if (this.games[id]) {
          socket.emit('new-game', {
            id,
            message: 'Previous session not closed',
            status: 400,
          });
          return;
        }

        const game = new Game(id);

        this.games[id] = game;
        game.createPlayer(id);

        socket.join(id);
        socket.emit('new-game', {
          id,
          message: 'Game created successfully',
          status: 200,
        });
      });

      socket.on('join-game', (message) => {
        const { id } = message;
        const game = this.games[id];

        if (!game) {
          socket.emit('join-game', {
            id,
            message: 'No such game',
            status: 400,
          });
          return;
        }

        if (socket.rooms[id]) {
          socket.emit('join-game', {
            id,
            message: 'Already joined',
            status: 400,
          });
          return;
        }

        if (Object.values(game.players).length === game.playerLimit) {
          socket.emit('join-game', {
            id,
            message: 'Room full',
            status: 400,
          });
          return;
        }

        const playerId = `player-${socket.id}`;

        game.createPlayer(playerId);
        socket.join(id);

        this.io.to(id).emit('join game', {
          id,
          playerId,
          message: 'Joined game session successfully',
          status: 200,
        });
      });

      socket.on('start-game', () => {
        const id = `game-${socket.id}`;
        const game = this.games[id];

        if (!game) {
          socket.emit('start-game', {
            id,
            message: 'No such game',
            status: 400,
          });
          return;
        }

        if (game.isActive) {
          socket.emit('start-game', {
            id,
            message: 'Already started',
            status: 400,
          });
          return;
        }

        game.startGame();

        this.io.to(id).emit('start-game', {
          id,
          message: 'Game started',
          status: 200,
        });

        setInterval(() => {
          const data = this.games[id].updateState();
          this.io.broadcast.to(id).emit('new-state', data);
        }, 500);
      });

      socket.on('player-action', (message) => {
        /**
         * Концептуально тут будет приём из даты action и сувание его игроку
         * this.games[`game-${data.id}][socket.id].action('rotate');
         *
         * {
         *    id: <id>
         *    action: 'up' | 'down' | 'left' | 'right' | 'drop' | 'rotate',
         * }
         */
        const { id, action } = message;
        const game = this.games[id];
        const playerId = `player-${socket.id}`;

        if (!game) {
          socket.emit('player-action', {
            id,
            message: 'No such game',
            status: 400,
          });
          return;
        }

        if (!socket.rooms[id]) {
          socket.emit('player-action', {
            id,
            message: 'No permission to access this game ssession',
            status: 400,
          });
          return;
        }

        const data = game.action(action, id);

        socket.emit('player-action', data);
      });
    });
    return this;
  }

  listen() {
    this.http.listen(this.port, this.host, () => {
      process.stdout.write(`Listening on http://${this.host}:${this.port}\n`);
    });
    return this;
  }
}

module.exports = Server;
