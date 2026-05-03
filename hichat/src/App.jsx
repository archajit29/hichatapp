import { useState, useEffect, useRef } from 'react'
import io from 'socket.io-client'
import { generateKeyPair, exportPublicKey, importPublicKey, encryptMessage, decryptMessage } from './cryptoUtils'
import './App.css'

const socket = io('http://localhost:3001')

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [username, setUsername] = useState('')
  const [isJoined, setIsJoined] = useState(false)
  const [keyPair, setKeyPair] = useState(null)
  const [otherUsers, setOtherUsers] = useState(new Map()) // socketId -> { username, publicKey }
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    // Listen for new messages
    socket.on('receive_message', async (data) => {
      try {
        // Find the payload intended for this user
        const myPayload = data.payloads[socket.id]
        if (myPayload && keyPair) {
          const decryptedText = await decryptMessage(myPayload, keyPair.privateKey)
          setMessages((prev) => [...prev, { ...data, message: decryptedText, isEncrypted: true }])
        } else if (data.author === username) {
          // Fallback for self-sent messages if needed, though we encrypt for ourselves too
        }
      } catch (err) {
        console.error("Failed to decrypt message:", err)
        setMessages((prev) => [...prev, { ...data, message: "[Decryption Failed]", isEncrypted: false }])
      }
    })

    // Listen for users joining
    socket.on('user_joined', async (data) => {
      const pubKey = await importPublicKey(data.publicKey)
      setOtherUsers(prev => new Map(prev).set(data.socketId, { username: data.username, publicKey: pubKey }))
      console.log(`User ${data.username} joined. Keys updated.`)
    })

    // Get list of existing users
    socket.on('existing_users', async (usersList) => {
      const newMap = new Map()
      for (const u of usersList) {
        const pubKey = await importPublicKey(u.publicKey)
        newMap.set(u.socketId, { username: u.username, publicKey: pubKey })
      }
      setOtherUsers(newMap)
    })

    // Listen for users leaving
    socket.on('user_left', (data) => {
      setOtherUsers(prev => {
        const next = new Map(prev)
        next.delete(data.socketId)
        return next
      })
    })

    return () => {
      socket.off('receive_message')
      socket.off('user_joined')
      socket.off('existing_users')
      socket.off('user_left')
    }
  }, [keyPair, username])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async (e) => {
    e.preventDefault()
    if (input.trim() && username && keyPair) {
      const payloads = {}
      
      // 1. Encrypt for ourselves (so we can see it)
      const myPublicKey = await importPublicKey(await exportPublicKey(keyPair.publicKey))
      payloads[socket.id] = await encryptMessage(input, myPublicKey)

      // 2. Encrypt for everyone else
      for (const [socketId, user] of otherUsers.entries()) {
        payloads[socketId] = await encryptMessage(input, user.publicKey)
      }

      const messageData = {
        author: username,
        payloads: payloads,
        time: new Date().toLocaleTimeString(),
      }

      socket.emit('send_message', messageData)
      setInput('')
    }
  }

  const joinChat = async (e) => {
    e.preventDefault()
    if (username.trim()) {
      const keys = await generateKeyPair()
      const pubKeyJWK = await exportPublicKey(keys.publicKey)
      setKeyPair(keys)
      setIsJoined(true)
      socket.emit('join', { username, publicKey: pubKeyJWK })
    }
  }

  if (!isJoined) {
    return (
      <div className="join-container">
        <h1>HiChat <span style={{fontSize: '0.8rem', color: '#4caf50'}}>E2EE</span></h1>
        <p>Your messages are encrypted before they leave your browser.</p>
        <form onSubmit={joinChat}>
          <input
            type="text"
            placeholder="Enter your name..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button type="submit">Generate Keys & Join</button>
        </form>
      </div>
    )
  }

  return (
    <div className="chat-app">
      <header>
        <div>
          <h2>HiChat <span className="encrypted-badge">E2EE ACTIVE</span></h2>
        </div>
        <p>Logged in as: <strong>{username}</strong></p>
      </header>
      
      <div className="messages-container">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.author === username ? 'sent' : 'received'}`}>
            <div className="message-content">
              <span className="author">{msg.author} {msg.isEncrypted && <span className="encrypted-badge">🔒</span>}</span>
              <p>{msg.message}</p>
              <span className="time">{msg.time}</span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="active-users" style={{fontSize: '0.7rem', padding: '5px', color: '#666'}}>
        Active: {otherUsers.size + 1} users (keys exchanged)
      </div>

      <form className="input-area" onSubmit={sendMessage}>
        <input
          type="text"
          placeholder="Type an encrypted message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}

export default App
