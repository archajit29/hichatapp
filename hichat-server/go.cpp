package main

import (
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	// Allow all origins – adjust for production as needed.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// hub maintains the set of active connections.
type hub struct {
	mu      sync.RWMutex
	clients map[*websocket.Conn]bool
}

// newHub creates a new hub.
func newHub() *hub {
	return &hub{
		clients: make(map[*websocket.Conn]bool),
	}
}

// addClient registers a new connection.
func (h *hub) addClient(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[conn] = true
}

// removeClient removes a connection.
func (h *hub) removeClient(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, conn)
}

// broadcast sends a message to all connected clients.
// It acquires a write lock to safely remove broken connections while iterating.
func (h *hub) broadcast(message []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for conn := range h.clients {
		if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
			log.Printf("write error: %v", err)
			// Close the broken connection and clean it up.
			_ = conn.Close()
			delete(h.clients, conn)
		}
	}
}

var hubInstance = newHub()

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}
	// Ensure the connection is closed when this handler exits.
	defer conn.Close()

	hubInstance.addClient(conn)

	// Read loop: receive messages and broadcast them.
	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				log.Println("read error:", err)
				break
			}
			hubInstance.broadcast(msg)
		}
		// Remove the client after the read loop ends.
		hubInstance.removeClient(conn)
	}()

	// No additional write loop needed; messages are sent via broadcast.
}

func main() {
	http.HandleFunc("/ws", handleWebSocket)
	log.Println("Server listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
