import React, { useState, useRef, useEffect } from 'react';
import './ChatBot.css';

const ChatBot = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: 'Hi! I\'m your AI support assistant with access to real-time web data. I can help you with:\n\n🌍 Web searches\n📰 Latest news\n🌤️ Weather updates\n💰 Crypto prices\n📚 Wikipedia info\n\nWhat would you like to know?',
      sender: 'bot',
      timestamp: new Date(),
      hasData: false,
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId] = useState(generateSessionId());
  const [dataCollected, setDataCollected] = useState(false);
  const messagesEndRef = useRef(null);

  const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5000';

  function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    const userMessage = {
      id: messages.length + 1,
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
      hasData: false,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setDataCollected(false);

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputValue,
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      const botMessage = {
        id: messages.length + 2,
        text: data.message,
        sender: 'bot',
        timestamp: new Date(),
        hasData: data.dataCollected || false,
      };

      setMessages((prev) => [...prev, botMessage]);
      setDataCollected(data.dataCollected || false);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = {
        id: messages.length + 2,
        text: 'Sorry, I encountered an error. Please try again later.',
        sender: 'bot',
        timestamp: new Date(),
        hasData: false,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    try {
      await fetch(`${API_BASE}/api/chat/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      });

      setMessages([
        {
          id: 1,
          text: 'Hi! I\'m your AI support assistant with access to real-time web data. I can help you with:\n\n🌍 Web searches\n📰 Latest news\n🌤️ Weather updates\n💰 Crypto prices\n📚 Wikipedia info\n\nWhat would you like to know?',
          sender: 'bot',
          timestamp: new Date(),
          hasData: false,
        },
      ]);
      setDataCollected(false);
    } catch (error) {
      console.error('Error clearing chat:', error);
    }
  };

  const suggestedQuestions = [
    '🌤️ What\'s the weather in London?',
    '💰 What\'s Bitcoin\'s price?',
    '📰 Latest tech news',
    '🌍 What is artificial intelligence?',
  ];

  return (
    <div className="chatbot-container">
      {!isOpen && (
        <button
          className="chatbot-button"
          onClick={() => setIsOpen(true)}
          title="Open Chat"
        >
          <span className="chatbot-icon">💬</span>
          <span className="notification-badge">🌐</span>
        </button>
      )}

      {isOpen && (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <div className="header-title">
              <h3>Support Assistant</h3>
              <span className="live-indicator">🔴 Live Web Data</span>
            </div>
            <div className="header-actions">
              <button
                className="icon-button"
                onClick={handleClearChat}
                title="Clear conversation"
              >
                🔄
              </button>
              <button
                className="icon-button"
                onClick={() => setIsOpen(false)}
                title="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="chatbot-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`message message-${msg.sender}`}>
                <div className="message-content">
                  <p>{msg.text}</p>
                  <div className="message-footer">
                    <span className="message-time">
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {msg.hasData && (
                      <span className="data-indicator" title="Web data collected">
                        🌐
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message message-bot">
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <p className="loading-text">Searching the web...</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {!isLoading && messages.length <= 1 && (
            <div className="suggested-questions">
              <p>Try asking:</p>
              {suggestedQuestions.map((question, idx) => (
                <button
                  key={idx}
                  className="suggestion-btn"
                  onClick={() => {
                    setInputValue(question);
                  }}
                >
                  {question}
                </button>
              ))}
            </div>
          )}

          <form className="chatbot-input-form" onSubmit={handleSendMessage}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask anything... (web data enabled 🌐)"
              disabled={isLoading}
              className="chatbot-input"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="chatbot-send-button"
            >
              📤
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default ChatBot;
