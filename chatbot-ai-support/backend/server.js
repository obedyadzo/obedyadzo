const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const cheerio = require('cheerio');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Store conversation history
const conversationHistory = new Map();

// Initialize OpenAI API
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const API_BASE = process.env.API_BASE || 'https://api.openai.com/v1';

// Web scraping utility
class WebDataCollector {
  // Fetch data from search engines
  static async searchWeb(query) {
    try {
      // Using DuckDuckGo (no API key required, more privacy-friendly)
      const response = await axios.get(`https://api.duckduckgo.com/`, {
        params: {
          q: query,
          format: 'json',
          no_html: 1,
          skip_disambig: 1,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error) {
      console.error('DuckDuckGo search error:', error.message);
      return null;
    }
  }

  // Fetch real-time news data
  static async getNewsData(topic) {
    try {
      // Using RSS feed from various news sources
      const newsEndpoints = [
        `https://feeds.bloomberg.com/markets/news.rss?${topic}`,
        `https://feeds.reuters.com/reuters/${topic}`,
      ];

      // For demo, using a simple approach
      const response = await axios.get(
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&sortBy=publishedAt&language=en&pageSize=5`,
        {
          headers: {
            'X-API-Key': process.env.NEWS_API_KEY || 'demo',
          },
          timeout: 10000,
        }
      ).catch(() => ({ data: { articles: [] } }));

      return response.data?.articles || [];
    } catch (error) {
      console.error('News fetch error:', error.message);
      return [];
    }
  }

  // Fetch data from Wikipedia
  static async getWikipediaData(query) {
    try {
      const response = await axios.get('https://en.wikipedia.org/w/api.php', {
        params: {
          action: 'query',
          list: 'search',
          srsearch: query,
          format: 'json',
          srlimit: 3,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000,
      });

      return response.data?.query?.search || [];
    } catch (error) {
      console.error('Wikipedia fetch error:', error.message);
      return [];
    }
  }

  // Fetch data from web pages
  static async scrapeWebpage(url) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      
      // Extract main content
      const title = $('title').text() || $('h1').first().text();
      const description = $('meta[name="description"]').attr('content') || '';
      const paragraphs = [];
      
      $('p').each((i, elem) => {
        if (i < 3) { // Get first 3 paragraphs
          paragraphs.push($(elem).text());
        }
      });

      return {
        title,
        description,
        content: paragraphs.join('\n'),
        url,
      };
    } catch (error) {
      console.error('Web scraping error:', error.message);
      return null;
    }
  }

  // Get real-time weather data
  static async getWeatherData(location) {
    try {
      // Using Open-Meteo API (free, no API key needed)
      const geoResponse = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
        params: {
          name: location,
          count: 1,
          language: 'en',
          format: 'json',
        },
        timeout: 10000,
      });

      if (geoResponse.data.results && geoResponse.data.results.length > 0) {
        const { latitude, longitude, name, country } = geoResponse.data.results[0];

        const weatherResponse = await axios.get('https://api.open-meteo.com/v1/forecast', {
          params: {
            latitude,
            longitude,
            current: 'temperature_2m,weather_code,wind_speed_10m',
            temperature_unit: 'celsius',
            timezone: 'auto',
          },
          timeout: 10000,
        });

        return {
          location: `${name}, ${country}`,
          ...weatherResponse.data.current,
          timestamp: new Date().toISOString(),
        };
      }

      return null;
    } catch (error) {
      console.error('Weather fetch error:', error.message);
      return null;
    }
  }

  // Get stock/cryptocurrency data
  static async getCryptoData(symbol = 'bitcoin') {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids: symbol.toLowerCase(),
          vs_currencies: 'usd',
          include_market_cap: true,
          include_24hr_vol: true,
          include_24hr_change: true,
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error) {
      console.error('Crypto fetch error:', error.message);
      return null;
    }
  }

  // Get trending topics
  static async getTrendingTopics() {
    try {
      const response = await axios.get('https://www.google.com/trending/api/realtime/overview', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000,
      }).catch(() => ({ data: [] }));

      return response.data;
    } catch (error) {
      console.error('Trending topics error:', error.message);
      return [];
    }
  }
}

// System prompt with web data context
const SYSTEM_PROMPT = `You are an intelligent AI support chatbot with access to real-time web data and information from the cyberspace. Your role is to:
1. Answer customer questions using both knowledge base and current web data
2. Provide up-to-date information about trends, news, weather, and market data
3. Search the web for relevant information when needed
4. Provide technical support with current documentation
5. Help with account-related inquiries
6. Direct users to appropriate resources
7. Be friendly, professional, and concise

When answering questions, try to incorporate relevant web data when available.
Keep responses under 300 words.`;

// Initialize conversation history
function getConversationHistory(sessionId) {
  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, []);
  }
  return conversationHistory.get(sessionId);
}

// Send message to AI with web context
async function sendToAI(messages, webContext = '') {
  try {
    let enhancedMessages = messages;
    
    // Add web context if available
    if (webContext) {
      const lastMessage = messages[messages.length - 1];
      enhancedMessages = [
        ...messages.slice(0, -1),
        {
          role: 'user',
          content: `${lastMessage.content}\n\n[Web Context Data]:\n${webContext}`,
        },
      ];
    }

    const response = await axios.post(`${API_BASE}/chat/completions`, {
      model: process.env.MODEL || 'gpt-3.5-turbo',
      messages: enhancedMessages,
      temperature: 0.7,
      max_tokens: 500,
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('AI API Error:', error.message);
    throw new Error('Failed to get response from AI service');
  }
}

// Main chat endpoint with web data collection
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: 'Message and sessionId are required' });
    }

    // Get conversation history
    const history = getConversationHistory(sessionId);

    // Detect intent and collect relevant web data
    let webContext = '';
    const lowerMessage = message.toLowerCase();

    try {
      // Weather query
      if (lowerMessage.includes('weather') || lowerMessage.includes('temperature')) {
        const match = message.match(/weather[^?]*(in|for|at)\s+(\w+)/i);
        if (match) {
          const location = match[2];
          const weatherData = await WebDataCollector.getWeatherData(location);
          if (weatherData) {
            webContext += `Weather Data: ${JSON.stringify(weatherData, null, 2)}\n`;
          }
        }
      }

      // Crypto/Stock query
      if (lowerMessage.includes('bitcoin') || lowerMessage.includes('crypto') || lowerMessage.includes('ethereum')) {
        const match = message.match(/(bitcoin|ethereum|cardano|solana)/i);
        if (match) {
          const cryptoData = await WebDataCollector.getCryptoData(match[1]);
          if (cryptoData) {
            webContext += `Cryptocurrency Data: ${JSON.stringify(cryptoData, null, 2)}\n`;
          }
        }
      }

      // News query
      if (lowerMessage.includes('news') || lowerMessage.includes('latest') || lowerMessage.includes('trending')) {
        const newsData = await WebDataCollector.getNewsData(
          message.replace(/news|latest|trending/gi, '').trim().slice(0, 50)
        );
        if (newsData.length > 0) {
          webContext += `Latest News:\n${newsData.slice(0, 3).map(
            (article, i) => `${i + 1}. ${article.title} - ${article.description}`
          ).join('\n')}\n`;
        }
      }

      // Wikipedia query
      if (lowerMessage.includes('what is') || lowerMessage.includes('who is') || lowerMessage.includes('explain')) {
        const query = message.replace(/what is|who is|explain/gi, '').trim().slice(0, 50);
        const wikiData = await WebDataCollector.getWikipediaData(query);
        if (wikiData.length > 0) {
          webContext += `Wikipedia Information:\n${wikiData.map(
            (result, i) => `${i + 1}. ${result.title}: ${result.snippet}`
          ).join('\n')}\n`;
        }
      }

      // General web search
      if (!webContext && message.length > 5) {
        const searchData = await WebDataCollector.searchWeb(message.slice(0, 100));
        if (searchData && searchData.AbstractText) {
          webContext += `Web Search Result: ${searchData.AbstractText}\n`;
        }
      }
    } catch (error) {
      console.error('Web data collection error:', error);
    }

    // Build messages array
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message },
    ];

    // Get AI response with web context
    const aiResponse = await sendToAI(messages, webContext);

    // Update conversation history
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: aiResponse });

    // Keep history manageable
    if (history.length > 40) {
      history.splice(0, 2);
    }

    res.json({
      message: aiResponse,
      sessionId: sessionId,
      dataCollected: webContext ? true : false,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Web search endpoint
app.post('/api/search', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const results = await WebDataCollector.searchWeb(query);
    res.json({ results, query });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// News endpoint
app.get('/api/news', async (req, res) => {
  try {
    const { topic = 'technology' } = req.query;
    const news = await WebDataCollector.getNewsData(topic);
    res.json({ news, topic });
  } catch (error) {
    console.error('News error:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Weather endpoint
app.get('/api/weather', async (req, res) => {
  try {
    const { location } = req.query;

    if (!location) {
      return res.status(400).json({ error: 'Location is required' });
    }

    const weather = await WebDataCollector.getWeatherData(location);
    res.json({ weather, location });
  } catch (error) {
    console.error('Weather error:', error);
    res.status(500).json({ error: 'Failed to fetch weather' });
  }
});

// Crypto data endpoint
app.get('/api/crypto', async (req, res) => {
  try {
    const { symbol = 'bitcoin' } = req.query;
    const data = await WebDataCollector.getCryptoData(symbol);
    res.json({ data, symbol });
  } catch (error) {
    console.error('Crypto error:', error);
    res.status(500).json({ error: 'Failed to fetch crypto data' });
  }
});

// Clear conversation
app.post('/api/chat/clear', (req, res) => {
  const { sessionId } = req.body;
  
  if (sessionId) {
    conversationHistory.delete(sessionId);
  }
  
  res.json({ message: 'Conversation cleared' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Chatbot server is running with web data collection enabled',
    features: ['web-search', 'news', 'weather', 'crypto', 'wikipedia']
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🤖 Chatbot server running on port ${PORT}`);
  console.log(`✨ Features enabled: Web Search, News, Weather, Crypto, Wikipedia`);
});
