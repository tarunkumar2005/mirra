import { program } from 'commander';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import gradient from 'gradient-string';
import figlet from 'figlet';
import { agent, run, getThread, updateThread } from './agent.js';

// Gradient themes
const themes = {
    neon: gradient(['#ff6b6b', '#f94d6a', '#45b7d1']),
    cyberpunk: gradient(['#ff00ff', '#00ffff']),
    hacker: gradient(['#00ff00', '#006400']),
};

let currentTheme = themes.neon;

// ASCII Banner with figlet + gradient
function displayBanner() {
    console.clear();
    const banner = figlet.textSync('MIRRA', { font: 'Slant' });
    console.log(currentTheme.multiline(banner));
    console.log(chalk.magenta.bold('🚀 AI-Powered Website Cloning Agent 🚀\n'));
}

// Typing effect for AI responses
async function typeWriter(text, delay = 20) {
    for (const char of text) {
        process.stdout.write(char);
        await new Promise(res => setTimeout(res, delay));
    }
    process.stdout.write('\n');
}

// CLI Setup
program
    .name('mirra')
    .description('AI-powered CLI agent for website cloning and more')
    .version('1.1.0');

program
    .command('start')
    .description('Start the interactive Mirra agent')
    .action(async () => {
        await startAgent();
    });

async function startAgent() {
    displayBanner();
    clack.intro(currentTheme('🤖 Mirra Agent Initialized Successfully!'));
    
    console.log(chalk.green('✅ Agent loaded with tools ready\n'));

    while (true) {
        const userInput = await clack.text({
            message: chalk.bold.blue('You'),
            validate: v => (!v ? 'Please enter something' : undefined)
        });

        if (clack.isCancel(userInput)) {
            clack.cancel(chalk.red('👋 Session terminated. Goodbye!'));
            process.exit(0);
        }

        await handleAgentResponse(userInput);
    }
}

// Handle Agent response using the imported agent
async function handleAgentResponse(userInput) {
    const spinner = clack.spinner();
    spinner.start(chalk.cyan('⚡ Agent is working...'));

    try {
        // Get current thread and add user input
        const currentThread = getThread();
        const newThread = [...currentThread, { role: 'user', content: userInput }];
        
        // Run the agent
        const result = await run(agent, newThread, {
            maxTurns: 30,
        });
        
        // Update the thread
        updateThread(result.history);
        
        spinner.stop(currentTheme('◇ 🤖 Mirra Response:'));
        
        // Format and display the response
        const response = result.finalOutput || "I couldn't generate a response.";
        const alignedAnswer = response
            .split('\n')
            .map(line => chalk.cyan('│') + ' ' + chalk.white(line))
            .join('\n') + '\n';

        await typeWriter(alignedAnswer, 15);

    } catch (err) {
        spinner.stop(chalk.red('❌ Error occurred'));
        console.log(chalk.red(`🚨 ${err.message}`));
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log(chalk.red('\n👋 Session terminated. Goodbye!'));
    process.exit(0);
});

program.parse();