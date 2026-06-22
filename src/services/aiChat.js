import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction: `You are SALTY, a chill and funny Discord bot with a lot of personality. 
You talk like a Gen Z gamer — casual, uses slang like "fr", "no cap", "fam", "bro", "W", "L", "lowkey", etc.
You are part of a Discord server that has gambling, economy, and leveling features.
Keep responses short (1-3 sentences max) — you're in a Discord chat, not writing an essay.
Be funny, slightly sarcastic, but never mean or offensive.
Never break character. Never say you're an AI or made by Google.`
});

const chatHistories = new Map();

export async function getAIResponse(userId, userMessage) {
  try {
    if (!chatHistories.has(userId)) {
      chatHistories.set(userId, []);
    }

    const history = chatHistories.get(userId);

    const chat = model.startChat({ history });

    const result = await chat.sendMessage(userMessage);
    const response = result.response.text();

    history.push({ role: 'user', parts: [{ text: userMessage }] });
    history.push({ role: 'model', parts: [{ text: response }] });

    if (history.length > 20) {
      chatHistories.set(userId, history.slice(-20));
    }

    return response;
  } catch (error) {
    console.error('Gemini AI error:', error);
    return 'bruh my brain stopped working for a sec 💀 try again';
  }
}
