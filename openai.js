import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

function getRandomToken() {
  const tokens = process.env.GITHUB_TOKEN?.split(",").map((t) => t.trim()) || [];
  if (tokens.length === 0) {
    throw new Error("No GitHub tokens found in environment variables");
  }
  return tokens[Math.floor(Math.random() * tokens.length)];
}

// export function createOpenAIClient() {
//   return new OpenAI({
//     baseURL: "https://models.github.ai/inference",
//     apiKey: getRandomToken(),
//     defaultHeaders: {
//       "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
//       "X-Title": "Smart Conversations App",
//     },
//   });
// }

export function createOpenAIClient() {
  return new OpenAI({
    baseURL: "https://api.cohere.ai/compatibility/v1",
    apiKey: process.env.COHERE_API_KEY,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
      "X-Title": "Smart Conversations App",
    },
  })
}