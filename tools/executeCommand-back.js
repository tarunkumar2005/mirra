import { tool } from "@openai/agents";
import { z } from 'zod';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export const createTerminalTool = () => {
  return tool({
    name: "terminal_executor",
    description: "Execute terminal commands in a specified directory on Ubuntu-based systems",
    parameters: z.object({
      command: z.string().describe("The command to execute"),
      workingDirectory: z.string().nullable().describe("Working directory to execute the command in (nullable, defaults to current process directory)"),
      timeout: z.number().nullable().default(30000).describe("Timeout in milliseconds (default: 30 seconds)")
    }),
    async execute({ command, workingDirectory, timeout }) {
      try {
        // Get current working directory if not specified
        const targetDir = workingDirectory || process.cwd();
        
        // Validate directory exists
        if (!fs.existsSync(targetDir)) {
          return {
            success: false,
            error: `Directory does not exist: ${targetDir}`,
            stdout: '',
            stderr: '',
            command,
            workingDirectory: targetDir
          };
        }

        // Resolve absolute path
        const absolutePath = path.resolve(targetDir);

        console.log(`Executing command: "${command}" in directory: ${absolutePath}`);

        // Execute command with specified working directory
        const { stdout, stderr } = await execAsync(command, {
          cwd: absolutePath,
          timeout: timeout,
          maxBuffer: 1024 * 1024 // 1MB buffer
        });

        return {
          success: true,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          command,
          workingDirectory: absolutePath,
          exitCode: 0
        };

      } catch (error) {
        return {
          success: false,
          error: error.message,
          stdout: error.stdout?.trim() || '',
          stderr: error.stderr?.trim() || '',
          command,
          workingDirectory: workingDirectory || process.cwd(),
          exitCode: error.code || 1
        };
      }
    }
  });
};

// Alternative implementation with more control using spawn
export const createAdvancedTerminalTool = () => {
  return tool({
    name: "advanced_terminal_executor",
    description: "Execute terminal commands with real-time output and better control",
    parameters: z.object({
      command: z.string().describe("The command to execute"),
      args: z.array(z.string()).nullable().default([]).describe("Command arguments as array"),
      workingDirectory: z.string().nullable().describe("Working directory to execute the command in"),
      timeout: z.number().nullable().default(30000).describe("Timeout in milliseconds"),
      shell: z.boolean().nullable().default(true).describe("Execute in shell context")
    }),
    async execute({ command, args, workingDirectory, timeout, shell }) {
      return new Promise((resolve) => {
        try {
          const targetDir = workingDirectory || process.cwd();
          
          if (!fs.existsSync(targetDir)) {
            resolve({
              success: false,
              error: `Directory does not exist: ${targetDir}`,
              stdout: '',
              stderr: '',
              command: `${command} ${args.join(' ')}`,
              workingDirectory: targetDir
            });
            return;
          }

          const absolutePath = path.resolve(targetDir);
          let stdout = '';
          let stderr = '';

          console.log(`Executing: "${command} ${args.join(' ')}" in ${absolutePath}`);

          const child = spawn(command, args, {
            cwd: absolutePath,
            shell: shell,
            stdio: ['pipe', 'pipe', 'pipe']
          });

          // Collect stdout
          child.stdout.on('data', (data) => {
            stdout += data.toString();
          });

          // Collect stderr
          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          // Handle process completion
          child.on('close', (code) => {
            resolve({
              success: code === 0,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              command: `${command} ${args.join(' ')}`,
              workingDirectory: absolutePath,
              exitCode: code
            });
          });

          // Handle errors
          child.on('error', (error) => {
            resolve({
              success: false,
              error: error.message,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              command: `${command} ${args.join(' ')}`,
              workingDirectory: absolutePath,
              exitCode: 1
            });
          });

          // Set timeout
          const timeoutId = setTimeout(() => {
            child.kill('SIGTERM');
            resolve({
              success: false,
              error: 'Command timed out',
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              command: `${command} ${args.join(' ')}`,
              workingDirectory: absolutePath,
              exitCode: 124
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
            command: `${command} ${args.join(' ')}`,
            workingDirectory: workingDirectory || process.cwd(),
            exitCode: 1
          });
        }
      });
    }
  });
};

// Utility function to create a session-aware terminal tool
export const createSessionTerminalTool = () => {
  let sessionDirectory = process.cwd();

  return tool({
    name: "session_terminal",
    description: "Execute commands while maintaining directory session state",
    parameters: z.object({
      command: z.string().describe("The command to execute"),
      changeDirectory: z.string().nullable().describe("Change to this directory before executing (updates session state)"),
      resetSession: z.boolean().nullable().default(false).describe("Reset session to initial directory")
    }),
    async execute({ command, changeDirectory, resetSession }) {
      try {
        // Reset session if requested
        if (resetSession) {
          sessionDirectory = process.cwd();
        }

        // Change directory if specified
        if (changeDirectory) {
          const newDir = path.resolve(sessionDirectory, changeDirectory);
          if (fs.existsSync(newDir)) {
            sessionDirectory = newDir;
          } else {
            return {
              success: false,
              error: `Directory does not exist: ${newDir}`,
              stdout: '',
              stderr: '',
              command,
              workingDirectory: sessionDirectory
            };
          }
        }

        console.log(`Session directory: ${sessionDirectory}`);
        console.log(`Executing: ${command}`);

        // Execute command in session directory
        const { stdout, stderr } = await execAsync(command, {
          cwd: sessionDirectory,
          timeout: 30000,
          maxBuffer: 1024 * 1024
        });

        return {
          success: true,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          command,
          workingDirectory: sessionDirectory,
          sessionDirectory: sessionDirectory,
          exitCode: 0
        };

      } catch (error) {
        return {
          success: false,
          error: error.message,
          stdout: error.stdout?.trim() || '',
          stderr: error.stderr?.trim() || '',
          command,
          workingDirectory: sessionDirectory,
          sessionDirectory: sessionDirectory,
          exitCode: error.code || 1
        };
      }
    }
  });
};