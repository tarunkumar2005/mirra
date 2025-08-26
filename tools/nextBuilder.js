// nextJSBuilderTool.js - Interactive Version with Real-Time Updates
import { tool } from "@openai/agents";
import { z } from 'zod';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { interactiveProjectBuilderAgent } from '../next-builder.js';

export const createInteractiveNextJSBuilderTool = () => {
  return tool({
    name: "interactive_nextjs_project_builder",
    description: "Interactive Next.js project builder with real-time progress updates, live command execution, and comprehensive logging. Works like Cursor IDE with step-by-step feedback.",
    parameters: z.object({
      projectName: z.string().describe("Name for the Next.js project (kebab-case recommended)"),
      scrapedDataPath: z.string().describe("Path to the scraped website data directory"),
      outputDirectory: z.string().nullable().default(process.cwd()).describe("Directory where to create the project"),
      useOriginalStyling: z.boolean().nullable().default(true).describe("Extract and convert original CSS to Tailwind"),
      responsiveDesign: z.boolean().nullable().default(true).describe("Implement responsive design patterns"),
      includeScreenshots: z.boolean().nullable().default(true).describe("Use screenshots as reference for layout"),
      tailwindVersion: z.string().nullable().default("4.0").describe("Tailwind CSS version to use"),
      interactive: z.boolean().nullable().default(true).describe("Enable interactive mode with live updates")
    }),
    async execute(params) {
      const startTime = Date.now();
      const buildLog = [];
      
      const log = (message, type = 'info') => {
        const logEntry = {
          timestamp: new Date().toISOString(),
          type,
          message
        };
        buildLog.push(logEntry);
        
        const emoji = {
          info: 'ℹ️',
          success: '✅',
          warning: '⚠️',
          error: '❌',
          progress: '🔄'
        };
        
        console.log(`${emoji[type] || 'ℹ️'} [${type.toUpperCase()}] ${message}`);
      };

      try {
        log(`Starting interactive Next.js project build: ${params.projectName}`, 'progress');
        log(`Scraped data path: ${params.scrapedDataPath}`, 'info');
        
        // Phase 1: Load and validate scraped data
        log('Phase 1: Loading scraped data...', 'progress');
        const scrapedContext = await loadScrapedDataInteractive(params.scrapedDataPath, log);
        
        if (!scrapedContext.html) {
          throw new Error('No HTML content found in scraped data');
        }
        
        log(`Scraped context loaded successfully:`, 'success');
        log(`  - HTML: ${scrapedContext.html.length} characters`, 'info');
        log(`  - Assets: ${scrapedContext.assets.total} total`, 'info');
        log(`  - Screenshots: ${scrapedContext.screenshots.desktop ? 'Available' : 'Missing'}`, 'info');
        
        // Phase 2: Build project with interactive agent
        log('Phase 2: Starting interactive project build...', 'progress');
        
        const buildResult = await interactiveProjectBuilderAgent({
          projectName: params.projectName,
          scrapedContext,
          outputDirectory: params.outputDirectory,
          options: {
            useOriginalStyling: params.useOriginalStyling,
            responsiveDesign: params.responsiveDesign,
            includeScreenshots: params.includeScreenshots,
            tailwindVersion: params.tailwindVersion
          },
          interactive: params.interactive,
          logger: log
        });

        const totalTime = Date.now() - startTime;
        
        if (buildResult.success) {
          log(`Project built successfully in ${totalTime}ms!`, 'success');
          log(`Project location: ${buildResult.projectPath}`, 'info');
          log(`Files generated: ${buildResult.filesGenerated?.length || 0}`, 'info');
          log(`Components created: ${buildResult.componentsGenerated?.length || 0}`, 'info');
          
          return {
            success: true,
            projectName: params.projectName,
            projectPath: buildResult.projectPath,
            buildTime: totalTime,
            filesGenerated: buildResult.filesGenerated || [],
            componentsGenerated: buildResult.componentsGenerated || [],
            assetsIntegrated: scrapedContext.assets.total,
            buildStatus: "success",
            developmentUrl: `http://localhost:3000`,
            buildLog,
            detailedLogs: buildResult.detailedLogs || [],
            commandHistory: buildResult.commandHistory || [],
            message: `✅ Next.js project '${params.projectName}' built successfully!\n\n🚀 To start development:\n  cd ${params.projectName}\n  npm run dev\n\n🌐 Then open http://localhost:3000`,
            instructions: [
              `cd ${params.projectName}`,
              `npm run dev`,
              `Open http://localhost:3000 in your browser`
            ]
          };
        } else {
          log(`Project build failed: ${buildResult.error}`, 'error');
          
          return {
            success: false,
            projectName: params.projectName,
            error: buildResult.error || 'Unknown build error',
            buildTime: totalTime,
            buildLog,
            detailedLogs: buildResult.detailedLogs || [],
            commandHistory: buildResult.commandHistory || [],
            diagnostics: buildResult.diagnostics || {},
            message: `❌ Failed to build Next.js project: ${buildResult.error || 'Unknown error'}\n\nCheck the detailed logs above for more information.`
          };
        }
        
      } catch (error) {
        const totalTime = Date.now() - startTime;
        log(`Critical error: ${error.message}`, 'error');
        
        return {
          success: false,
          projectName: params.projectName || 'unknown',
          error: error.message,
          buildTime: totalTime,
          buildLog,
          message: `❌ Critical error during build: ${error.message}`
        };
      }
    }
  });
};

async function loadScrapedDataInteractive(scrapedDataPath, log) {
  log('Loading scraped data structure...', 'progress');
  
  if (!existsSync(scrapedDataPath)) {
    throw new Error(`Scraped data directory not found: ${scrapedDataPath}`);
  }

  const context = {
    html: null,
    metadata: {},
    assets: { images: [], stylesheets: [], scripts: [], fonts: [], total: 0 },
    screenshots: { desktop: null, mobile: null },
    analysis: { colors: [], fonts: [], layout: {}, components: [] }
  };

  // Load HTML content
  const htmlPath = join(scrapedDataPath, 'index.html');
  if (existsSync(htmlPath)) {
    context.html = readFileSync(htmlPath, 'utf-8');
    log(`HTML loaded: ${context.html.length} characters`, 'success');
  } else {
    log('HTML file not found', 'warning');
  }

  // Load metadata
  const metadataPath = join(scrapedDataPath, 'metadata.json');
  if (existsSync(metadataPath)) {
    try {
      context.metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
      log(`Metadata loaded: ${Object.keys(context.metadata).length} properties`, 'success');
    } catch (error) {
      log(`Failed to parse metadata: ${error.message}`, 'warning');
    }
  } else {
    log('Metadata file not found', 'warning');
  }

  // Load assets
  const assetsPath = join(scrapedDataPath, 'assets');
  if (existsSync(assetsPath)) {
    context.assets = await loadAssetsInfoInteractive(assetsPath, log);
    log(`Assets loaded: ${context.assets.total} total files`, 'success');
  } else {
    log('Assets directory not found', 'warning');
  }

  // Load screenshots
  const screenshotsPath = join(scrapedDataPath, 'screenshots');
  if (existsSync(screenshotsPath)) {
    context.screenshots = loadScreenshotsInteractive(screenshotsPath, log);
    log(`Screenshots loaded: ${context.screenshots.desktop ? 'Desktop' : ''} ${context.screenshots.mobile ? 'Mobile' : ''}`, 'success');
  } else {
    log('Screenshots directory not found', 'warning');
  }

  // Analyze content
  if (context.html) {
    context.analysis = analyzeContentInteractive(context.html, context.metadata, log);
    log(`Content analysis completed: ${context.analysis.components.length} components detected`, 'success');
  }

  return context;
}

async function loadAssetsInfoInteractive(assetsPath, log) {
  const assets = { images: [], stylesheets: [], scripts: [], fonts: [], total: 0 };
  const assetTypes = ['images', 'stylesheets', 'scripts', 'fonts'];

  for (const type of assetTypes) {
    const typePath = join(assetsPath, type);
    if (existsSync(typePath)) {
      const files = readdirSync(typePath);
      assets[type] = files.map(file => ({
        filename: file,
        path: join('assets', type, file),
        size: getFileSize(join(typePath, file)),
        extension: extname(file)
      }));
      assets.total += files.length;
      log(`  ${type}: ${files.length} files`, 'info');
    }
  }

  return assets;
}

function loadScreenshotsInteractive(screenshotsPath, log) {
  const screenshots = { desktop: null, mobile: null };
  
  try {
    const files = readdirSync(screenshotsPath);
    
    files.forEach(file => {
      const filePath = join(screenshotsPath, file);
      if (file.includes('desktop')) {
        screenshots.desktop = filePath;
        log(`  Desktop screenshot: ${file}`, 'info');
      } else if (file.includes('mobile')) {
        screenshots.mobile = filePath;
        log(`  Mobile screenshot: ${file}`, 'info');
      }
    });
  } catch (error) {
    log(`Failed to load screenshots: ${error.message}`, 'warning');
  }

  return screenshots;
}

function analyzeContentInteractive(html, metadata, log) {
  log('Analyzing HTML content...', 'progress');
  
  const analysis = {
    colors: [],
    fonts: [],
    layout: {},
    components: []
  };

  try {
    // Extract colors
    const colorMatches = html.match(/#[0-9a-fA-F]{3,6}|rgb\([^)]+\)|rgba\([^)]+\)/g);
    if (colorMatches) {
      analysis.colors = [...new Set(colorMatches)].slice(0, 10);
      log(`  Colors extracted: ${analysis.colors.length}`, 'info');
    }

    // Extract fonts
    const fontMatches = html.match(/font-family:\s*([^;]+)/g);
    if (fontMatches) {
      analysis.fonts = [...new Set(fontMatches.map(match => 
        match.replace('font-family:', '').trim()
      ))].slice(0, 5);
      log(`  Fonts extracted: ${analysis.fonts.length}`, 'info');
    }

    // Analyze layout
    analysis.layout = {
      hasHeader: html.includes('<header') || html.includes('class="header"'),
      hasNav: html.includes('<nav') || html.includes('navigation'),
      hasFooter: html.includes('<footer') || html.includes('class="footer"'),
      hasSidebar: html.includes('sidebar') || html.includes('aside'),
      sections: (html.match(/<section/g) || []).length,
      divs: (html.match(/<div/g) || []).length
    };
    log(`  Layout: ${analysis.layout.sections} sections, ${analysis.layout.divs} divs`, 'info');

    // Identify components
    const componentPatterns = [
      'navbar', 'navigation', 'header', 'footer', 'sidebar', 'hero', 
      'banner', 'card', 'button', 'modal', 'carousel', 'gallery'
    ];
    
    componentPatterns.forEach(pattern => {
      if (html.toLowerCase().includes(pattern)) {
        analysis.components.push(pattern);
      }
    });
    log(`  Components detected: ${analysis.components.join(', ')}`, 'info');

  } catch (error) {
    log(`Content analysis failed: ${error.message}`, 'warning');
  }

  return analysis;
}

function getFileSize(filePath) {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}