import { tool } from "@openai/agents";
import { z } from "zod";
import { spawn } from 'child_process';
import path from 'path';

export const createAdvancedTerminalTool = () => {
  return tool({
    name: "execute_command",
    description: "Execute any command, write files, read files, and manage the entire project using shell commands",
    parameters: z.object({
      command: z.string().describe("The command to execute (can be any shell command, including file operations)"),
      workingDirectory: z.string().nullable().describe("Working directory to execute the command in"),
      timeout: z.number().nullable().default(60000).describe("Timeout in milliseconds"),
      description: z.string().nullable().describe("What this command is supposed to do (for logging)")
    }),
    async execute({ command, workingDirectory, timeout, description }) {
      return new Promise((resolve) => {
        try {
          const targetDir = workingDirectory || process.cwd();
          const absolutePath = path.resolve(targetDir);
          let stdout = '';
          let stderr = '';

          if (description) {
            console.log(`[EXECUTING] ${description}: ${command}`);
          } else {
            console.log(`[EXECUTING] ${command}`);
          }

          const child = spawn('bash', ['-c', command], {
            cwd: absolutePath,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env }
          });

          child.stdout.on('data', (data) => {
            stdout += data.toString();
          });

          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          child.on('close', (code) => {
            resolve({
              success: code === 0,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              command,
              workingDirectory: absolutePath,
              exitCode: code,
              description
            });
          });

          child.on('error', (error) => {
            resolve({
              success: false,
              error: error.message,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              command,
              workingDirectory: absolutePath,
              exitCode: 1,
              description
            });
          });

          const timeoutId = setTimeout(() => {
            child.kill('SIGTERM');
            resolve({
              success: false,
              error: 'Command timed out',
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              command,
              workingDirectory: absolutePath,
              exitCode: 124,
              description
            });
          }, timeout);

          child.on('close', () => {
            clearTimeout(timeoutId);
          });

        } catch (error) {
          resolve({
            success: false,
            error: error.message,
            stdout: '',
            stderr: '',
            command,
            workingDirectory: workingDirectory || process.cwd(),
            exitCode: 1,
            description
          });
        }
      });
    }
  });
};