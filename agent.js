import { Agent, run, setDefaultOpenAIClient, setOpenAIAPI, setTraceProcessors } from "@openai/agents";
import { createOpenAIClient } from "./openai.js";
import { SYSTEM_PROMPT } from "./prompts/index.js";
import { createUrlValidatorTool } from './tools/urlValidator.js';
import { createWebScraperTool } from './tools/scraper.js';
import { createAdvancedTerminalTool } from './tools/executeCommand.js';
import readline from 'readline';

// Configuration
setTraceProcessors([]);
setDefaultOpenAIClient(createOpenAIClient());
setOpenAIAPI("chat_completions");

// Initialize tools
const urlValidator = createUrlValidatorTool();
const websiteScraper = createWebScraperTool();
const commandExecutor = createAdvancedTerminalTool();

// Create agent
const agent = new Agent({
  name: "Agentic AI",
  instructions: SYSTEM_PROMPT,
  // model: "openai/gpt-4o",
  model: "command-a-03-2025",
  modelSettings: {
    max_completion_tokens: 16384,
  },
  tools: [urlValidator, websiteScraper, commandExecutor]
});

// Thread to maintain conversation history
let thread = [];

// EXPORT these for use in cli.js
export { agent, thread, run };

// Update thread function for external use
export function updateThread(newThread) {
  thread = newThread;
}

export function getThread() {
  return thread;
}

// Only start the direct CLI if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Create readline interface for better CLI interaction
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n> '
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nGoodbye!');
    rl.close();
    process.exit(0);
  });

  // Error handling
  process.on('unhandledRejection', (err) => {
    console.error('\nUnhandled error:', err.message);
    rl.prompt();
  });

  // Main chat loop
  console.log('🤖 Agentic AI CLI Started');
  console.log('Type your message and press Enter. Use Ctrl+C to exit.\n');

  rl.prompt();

  rl.on('line', async (input) => {
    const text = input.trim();
    
    if (!text) {
      rl.prompt();
      return;
    }

    try {
      console.log('\n⏳ Processing...');
      
      const result = await run(agent, [...thread, { role: 'user', content: text }], {
        maxTurns: 30,
      });
      
      thread = result.history;
      
      console.log('\n🤖:', result.finalOutput);
      
    } catch (error) {
      console.error('\n❌ Error:', error.message);
    } finally {
      rl.prompt();
    }
  });

  rl.on('close', () => {
    console.log('\nGoodbye!');
    process.exit(0);
  });
}