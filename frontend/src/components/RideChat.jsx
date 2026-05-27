import React, { useEffect, useMemo, useRef, useState } from "react";

function RideChat({ socket, ride, participantId, participantType, participantName }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);
  const rideId = ride?._id || ride?.rideId;

  const canChat = useMemo(() => {
    return Boolean(
      socket &&
      rideId &&
      participantId &&
      ["ACCEPTED", "ARRIVING", "STARTED"].includes(ride?.status)
    );
  }, [socket, rideId, participantId, ride?.status]);

  useEffect(() => {
    if (!canChat) return;

    const handleHistory = (payload) => {
      if (String(payload.rideId) !== String(rideId)) return;
      setMessages(payload.messages || []);
    };

    const handleMessage = (payload) => {
      if (String(payload.rideId) !== String(rideId)) return;
      setMessages((prev) => {
        const incomingId = String(payload.message?._id || "");
        if (incomingId && prev.some((message) => String(message._id) === incomingId)) {
          return prev;
        }
        return [...prev, payload.message];
      });
    };

    const handleError = (payload) => {
      setError(payload.error || "Chat is not available right now");
    };

    socket.emit("join-ride-chat", {
      rideId,
      participantId,
      participantType
    });

    socket.on("ride-chat-history", handleHistory);
    socket.on("ride-message", handleMessage);
    socket.on("ride-chat-error", handleError);

    return () => {
      socket.off("ride-chat-history", handleHistory);
      socket.off("ride-message", handleMessage);
      socket.off("ride-chat-error", handleError);
    };
  }, [canChat, socket, rideId, participantId, participantType]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !canChat) return;

    socket.emit("send-ride-message", {
      rideId,
      senderId: participantId,
      senderType: participantType,
      senderName: participantName,
      message: text
    });
    setDraft("");
    setError("");
  };

  if (!canChat) return null;

  return (
    <div style={styles.chatCard}>
      <div style={styles.header}>
        <strong>Ride chat</strong>
        <span style={styles.status}>Live</span>
      </div>

      <div style={styles.messages}>
        {messages.length === 0 ? (
          <p style={styles.empty}>No messages yet.</p>
        ) : (
          messages.map((message) => {
            const isMine = String(message.senderId) === String(participantId);
            return (
              <div
                key={message._id || `${message.senderId}-${message.createdAt}`}
                style={{
                  ...styles.messageRow,
                  justifyContent: isMine ? "flex-end" : "flex-start"
                }}
              >
                <div style={{ ...styles.bubble, ...(isMine ? styles.myBubble : styles.theirBubble) }}>
                  {!isMine && <span style={styles.sender}>{message.senderName || message.senderType}</span>}
                  <span>{message.message}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={sendMessage} style={styles.form}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a message"
          maxLength={500}
          style={styles.input}
        />
        <button type="submit" style={styles.sendButton} disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

const styles = {
  chatCard: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "12px",
    marginTop: "14px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)"
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "10px",
    color: "#111827"
  },
  status: {
    fontSize: "12px",
    color: "#047857",
    background: "#d1fae5",
    borderRadius: "999px",
    padding: "3px 8px"
  },
  messages: {
    height: "180px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "8px",
    background: "#f9fafb",
    borderRadius: "10px"
  },
  empty: {
    color: "#6b7280",
    textAlign: "center",
    margin: "auto 0",
    fontSize: "14px"
  },
  messageRow: {
    display: "flex"
  },
  bubble: {
    maxWidth: "78%",
    padding: "8px 10px",
    borderRadius: "12px",
    fontSize: "14px",
    lineHeight: 1.35,
    overflowWrap: "anywhere"
  },
  myBubble: {
    background: "#111827",
    color: "#ffffff",
    borderBottomRightRadius: "4px"
  },
  theirBubble: {
    background: "#ffffff",
    color: "#111827",
    border: "1px solid #e5e7eb",
    borderBottomLeftRadius: "4px"
  },
  sender: {
    display: "block",
    fontSize: "11px",
    color: "#6b7280",
    marginBottom: "3px",
    fontWeight: 700
  },
  error: {
    color: "#b91c1c",
    background: "#fee2e2",
    padding: "8px",
    borderRadius: "8px",
    fontSize: "13px",
    marginTop: "8px"
  },
  form: {
    display: "flex",
    gap: "8px",
    marginTop: "10px"
  },
  input: {
    flex: 1,
    minWidth: 0,
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    padding: "10px",
    fontSize: "14px",
    boxSizing: "border-box"
  },
  sendButton: {
    border: "none",
    borderRadius: "10px",
    background: "#111827",
    color: "#ffffff",
    padding: "0 14px",
    fontWeight: 700,
    cursor: "pointer"
  }
};

export default RideChat;
