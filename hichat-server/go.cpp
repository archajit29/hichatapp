package main

import (
    "log"
    "net/http"
    "sync"

    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
    CheckOrigin: func(r *http.Request) bool { return true },
}

// hub maintains the set of active connections.
type hub struct {
    mu    sync.RWMutex
    clients map[*websocket.Conn]bool
}

func newHub() *hub {
    return &hub{
        clients: make(map[*websocket.Conn]bool),
    }
}

func (h *hub) addClient(conn *websocket.Conn) {
    h.mu.Lock()
    defer h.mu.Unlock()
    h.clients[conn] = true
}

func (h *hub) removeClient(conn *websocket.Conn) {
    h.mu.Lock()
    defer h.mu.Unlock()
    delete(h.clients, conn)
}

func (h *hub) broadcast(message []byte) {
    h.mu.RLock()
    for conn := range h.clients {
        err := conn.WriteMessage(websocket.TextMessage, message)
        if err != nil {
            log.Printf("write error: %v", err)
        }
    }
    h.mu.RUnlock()
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Println("WebSocket upgrade error:", err)
        return
    }
    defer conn.Close()

    h := newHub()
    h.addClient(conn)

    // Read loop: receive messages and broadcast them.
    go func() {
        for {
            _, msg, err := conn.ReadMessage()
            if err != nil {
                log.Println("read error:", err)
                break
            }
            h.broadcast(msg)
        }
        h.removeClient(conn)
    }()

    // Write loop: keep the connection alive (optional).
    for {
        select {
        case message, ok := <-h.broadcast:
            if !ok {
                return
            }
            err := conn.WriteMessage(websocket.TextMessage, message)
            if err != nil {
                log.Println("write error:", err)
                return
            }
        default:
            // could send ping/pong here
        }
    }
}

func main() {
    http.HandleFunc("/ws", handleWebSocket)
    log.Println("Server listening on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
