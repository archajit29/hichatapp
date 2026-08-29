import io, { Socket } from 'socket.io-client';

export const SERVER_URL = 'http://localhost:3001';
export const socket: Socket = io(SERVER_URL, { autoConnect: false });
