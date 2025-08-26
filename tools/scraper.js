// webScraperTool.js - Professional & Organized Version
import { tool } from '@openai/agents';
import { z } from 'zod';
import { chromium } from 'playwright';
import { RobotsFile } from 'crawlee';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { URL } from 'url';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const CONFIG = {
  // Naming Convention: kebab-case for consistency
  DEFAULT_OUTPUT_DIR: './scraped-data',
  DEFAULT_USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  DEFAULT_TIMEOUT: 30000,
  ASSET_DOWNLOAD_TIMEOUT: 15000,
  
  // Directory Structure
  DIRECTORIES: {
    ASSETS: 'assets',
    IMAGES: 'images',
    STYLESHEETS: 'stylesheets',
    SCRIPTS: 'scripts',
    FONTS: 'fonts',
    SCREENSHOTS: 'screenshots'
  },
  
  // File Extensions
  DEFAULT_EXTENSIONS: {
    images: '.jpg',
    stylesheets: '.css',
    scripts: '.js',
    fonts: '.woff2'
  },
  
  // Browser Launch Arguments
  BROWSER_ARGS: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
  ],
  
  // Default Viewports
  VIEWPORTS: {
    DESKTOP: { width: 1920, height: 1080 },
    MOBILE: { width: 375, height: 667 }
  }
};

// ============================================================================
// MAIN TOOL DEFINITION
// ============================================================================

export const createWebScraperTool = () => {
  return tool({
    name: "web_scraper",
    description: "Professional web scraper that downloads complete pages with all assets, creates local mappings, and captures responsive screenshots. Maintains consistent file organization and naming conventions.",
    parameters: z.object({
      url: z.string().describe("Valid URL to scrape (must include http/https)"),
      outputDir: z.string().optional().default(CONFIG.DEFAULT_OUTPUT_DIR).describe("Output directory (uses kebab-case naming)"),
      userAgent: z.string().optional().default(CONFIG.DEFAULT_USER_AGENT).describe("Browser user agent string"),
      respectRobots: z.boolean().optional().default(true).describe("Check robots.txt before scraping"),
      timeout: z.number().optional().default(CONFIG.DEFAULT_TIMEOUT).describe("Page load timeout (milliseconds)"),
      downloadAssets: z.boolean().optional().default(true).describe("Download and localize all page assets"),
      takeScreenshots: z.boolean().optional().default(true).describe("Capture desktop and mobile screenshots"),
      desktopViewport: z.object({
        width: z.number().default(CONFIG.VIEWPORTS.DESKTOP.width),
        height: z.number().default(CONFIG.VIEWPORTS.DESKTOP.height)
      }).optional().default(CONFIG.VIEWPORTS.DESKTOP),
      mobileViewport: z.object({
        width: z.number().default(CONFIG.VIEWPORTS.MOBILE.width),
        height: z.number().default(CONFIG.VIEWPORTS.MOBILE.height)
      }).optional().default(CONFIG.VIEWPORTS.MOBILE)
    }),
    
    async execute(params) {
      const scraper = new WebScraper(params);
      return await scraper.scrape();
    }
  });
};

// ============================================================================
// WEB SCRAPER CLASS - Main Logic Organization
// ============================================================================

class WebScraper {
  constructor(params) {
    this.params = params;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.logger = new ScrapingLogger();
    this.fileManager = new FileManager(params.outputDir, this.logger);
    this.assetManager = new AssetManager(this.fileManager, this.logger);
    this.screenshotManager = new ScreenshotManager(this.fileManager, this.logger);
    
    this.result = {
      success: false,
      url: params.url,
      accessible: false,
      scrapingAllowed: false,
      outputDir: params.outputDir,
      scrapedData: {
        html: null,
        title: null,
        metadata: {},
        assets: { images: [], stylesheets: [], scripts: [], fonts: [] }
      },
      screenshots: { desktop: null, mobile: null },
      assetMapping: {},
      statistics: {
        totalAssets: 0,
        downloadedAssets: 0,
        failedAssets: 0,
        processingTime: 0
      },
      message: ''
    };
  }

  async scrape() {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Starting scrape process for: ${this.params.url}`);
      
      // Step 1: Validate URL
      await this.validateUrl();
      
      // Step 2: Setup file system
      await this.fileManager.createDirectoryStructure();
      
      // Step 3: Check robots.txt
      await this.checkRobotsTxt();
      
      // Step 4: Launch browser and scrape
      await this.launchBrowser();
      await this.scrapePage();
      
      // Step 5: Process assets
      if (this.params.downloadAssets) {
        await this.processAssets();
      }
      
      // Step 6: Take screenshots
      if (this.params.takeScreenshots) {
        await this.captureScreenshots();
      }
      
      // Step 7: Save results
      await this.saveResults();
      
      this.result.success = true;
      this.result.accessible = true;
      this.result.scrapingAllowed = true;
      this.result.statistics.processingTime = Date.now() - startTime;
      this.result.message = `Successfully scraped page and processed ${this.result.statistics.downloadedAssets}/${this.result.statistics.totalAssets} assets in ${this.result.statistics.processingTime}ms`;
      
      this.logger.success(this.result.message);
      
    } catch (error) {
      this.logger.error(`Scraping failed: ${error.message}`);
      this.result.message = `Scraping error: ${error.message}`;
      this.result.statistics.processingTime = Date.now() - startTime;
    } finally {
      await this.cleanup();
    }
    
    return this.result;
  }

  async validateUrl() {
    const urlObj = new URL(this.params.url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are supported');
    }
  }

  async checkRobotsTxt() {
    if (!this.params.respectRobots) return;
    
    try {
      const urlObj = new URL(this.params.url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
      const robotsFile = new RobotsFile({ userAgent: this.params.userAgent });
      await robotsFile.load(robotsUrl);
      
      if (!robotsFile.isAllowed(this.params.url)) {
        throw new Error('Access blocked by robots.txt');
      }
    } catch (error) {
      if (error.message.includes('blocked')) {
        throw error;
      }
      this.logger.warn('robots.txt not accessible - proceeding');
    }
  }

  async launchBrowser() {
    this.logger.info('Launching browser...');
    
    this.browser = await chromium.launch({
      headless: true,
      args: CONFIG.BROWSER_ARGS
    });

    this.context = await this.browser.newContext({
      userAgent: this.params.userAgent,
      viewport: this.params.desktopViewport,
      ignoreHTTPSErrors: true,
      bypassCSP: true
    });

    // Add request/response monitoring
    this.context.on('request', request => {
      this.logger.debug(`Request: ${request.method()} ${request.url()}`);
    });

    this.context.on('response', response => {
      this.logger.debug(`Response: ${response.status()} ${response.url()}`);
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.params.timeout);
    this.page.setDefaultNavigationTimeout(this.params.timeout);
  }

  async scrapePage() {
    this.logger.info('Navigating to page...');
    
    const response = await this.page.goto(this.params.url, {
      waitUntil: 'networkidle',
      timeout: this.params.timeout
    });

    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response?.status() || 'unknown'}: ${response?.statusText() || 'Navigation failed'}`);
    }

    this.logger.success(`Page loaded successfully with status ${response.status()}`);

    // Wait for content to fully load
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(2000);

    // Extract page data
    this.logger.info('Extracting page data...');
    this.result.scrapedData.title = await this.page.title();
    this.result.scrapedData.html = await this.page.content();
    this.result.scrapedData.metadata = await PageExtractor.extractMetadata(this.page);
    this.result.scrapedData.assets = await PageExtractor.extractAssets(this.page);
    
    this.logger.info(`Extracted: Title="${this.result.scrapedData.title}", HTML=${this.result.scrapedData.html.length} chars`);
    this.logger.info(`Assets found: ${this.result.scrapedData.assets.images.length} images, ${this.result.scrapedData.assets.stylesheets.length} CSS, ${this.result.scrapedData.assets.scripts.length} JS, ${this.result.scrapedData.assets.fonts.length} fonts`);
  }

  async processAssets() {
    this.logger.info('Processing assets...');
    
    const urlObj = new URL(this.params.url);
    const downloadResult = await this.assetManager.downloadAndMapAssets(
      this.result.scrapedData.assets,
      urlObj,
      this.params.userAgent
    );
    
    this.result.assetMapping = downloadResult.mapping;
    this.result.statistics = { ...this.result.statistics, ...downloadResult.stats };
    
    this.logger.success(`Assets processed: ${downloadResult.stats.downloaded}/${downloadResult.stats.total} successful`);
  }

  async captureScreenshots() {
    this.logger.info('Capturing screenshots...');
    
    const urlObj = new URL(this.params.url);
    this.result.screenshots = await this.screenshotManager.captureScreenshots(
      this.page,
      this.params.desktopViewport,
      this.params.mobileViewport,
      urlObj.hostname
    );
    
    this.logger.success('Screenshots captured successfully');
  }

  async saveResults() {
    this.logger.info('Saving results...');
    
    // Create modified HTML with local asset paths
    const modifiedHtml = AssetMapper.replaceAssetUrls(this.result.scrapedData.html, this.result.assetMapping);

    // Save HTML file
    await this.fileManager.saveFile('index.html', modifiedHtml);

    // Save metadata
    const metadata = {
      url: this.page.url(),
      originalUrl: this.params.url,
      title: this.result.scrapedData.title,
      metadata: this.result.scrapedData.metadata,
      scrapedAt: new Date().toISOString(),
      assets: this.result.scrapedData.assets,
      assetMapping: this.result.assetMapping,
      statistics: this.result.statistics
    };
    
    await this.fileManager.saveFile('metadata.json', JSON.stringify(metadata, null, 2));
    
    // Update result with modified HTML
    this.result.scrapedData.html = modifiedHtml;
    
    this.logger.success('Results saved successfully');
  }

  async cleanup() {
    try {
      if (this.page) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
      this.logger.info('Browser cleanup completed');
    } catch (error) {
      this.logger.error(`Cleanup error: ${error.message}`);
    }
  }
}

// ============================================================================
// UTILITY CLASSES - Organized by Responsibility
// ============================================================================

class ScrapingLogger {
  info(message) {
    console.log(`[INFO] ${message}`);
  }
  
  success(message) {
    console.log(`[SUCCESS] ${message}`);
  }
  
  warn(message) {
    console.warn(`[WARN] ${message}`);
  }
  
  error(message) {
    console.error(`[ERROR] ${message}`);
  }
  
  debug(message) {
    // Uncomment for detailed debugging
    // console.log(`[DEBUG] ${message}`);
  }
}

class FileManager {
  constructor(outputDir, logger) {
    this.outputDir = outputDir;
    this.logger = logger;
  }

  async createDirectoryStructure() {
    const directories = [
      this.outputDir,
      this.getAssetPath(),
      this.getAssetPath(CONFIG.DIRECTORIES.IMAGES),
      this.getAssetPath(CONFIG.DIRECTORIES.STYLESHEETS),
      this.getAssetPath(CONFIG.DIRECTORIES.SCRIPTS),
      this.getAssetPath(CONFIG.DIRECTORIES.FONTS),
      this.getScreenshotPath()
    ];

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    this.logger.success('Directory structure created');
  }

  getAssetPath(subdir = '') {
    return subdir 
      ? path.join(this.outputDir, CONFIG.DIRECTORIES.ASSETS, subdir)
      : path.join(this.outputDir, CONFIG.DIRECTORIES.ASSETS);
  }

  getScreenshotPath() {
    return path.join(this.outputDir, CONFIG.DIRECTORIES.SCREENSHOTS);
  }

  async saveFile(filename, content) {
    const filePath = path.join(this.outputDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
  }

  async saveAsset(assetType, filename, buffer) {
    const filePath = path.join(this.getAssetPath(assetType), filename);
    await fs.writeFile(filePath, buffer);
    return path.join(CONFIG.DIRECTORIES.ASSETS, assetType, filename);
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

class AssetManager {
  constructor(fileManager, logger) {
    this.fileManager = fileManager;
    this.logger = logger;
  }

  async downloadAndMapAssets(assets, baseUrlObj, userAgent) {
    const mapping = {};
    const stats = { total: 0, downloaded: 0, failed: 0 };

    const allAssets = this.flattenAssets(assets);
    const uniqueAssets = this.removeDuplicates(allAssets);

    stats.total = uniqueAssets.length;
    this.logger.info(`Downloading ${stats.total} unique assets...`);

    for (const asset of uniqueAssets) {
      try {
        const result = await this.downloadSingleAsset(asset, userAgent);
        if (result.success) {
          // Create all possible mappings
          mapping[asset.url] = result.relativePath;
          if (asset.originalSrc) mapping[asset.originalSrc] = result.relativePath;
          if (asset.originalHref) mapping[asset.originalHref] = result.relativePath;
          
          stats.downloaded++;
          this.logger.debug(`Downloaded: ${result.filename} (${result.size} bytes)`);
        } else {
          stats.failed++;
        }
      } catch (error) {
        this.logger.error(`Failed to download ${asset.url}: ${error.message}`);
        stats.failed++;
      }
    }

    return { mapping, stats };
  }

  flattenAssets(assets) {
    return [
      ...assets.images.map(asset => ({ ...asset, type: CONFIG.DIRECTORIES.IMAGES })),
      ...assets.stylesheets.map(asset => ({ ...asset, type: CONFIG.DIRECTORIES.STYLESHEETS })),
      ...assets.scripts.map(asset => ({ ...asset, type: CONFIG.DIRECTORIES.SCRIPTS })),
      ...assets.fonts.map(asset => ({ ...asset, type: CONFIG.DIRECTORIES.FONTS }))
    ];
  }

  removeDuplicates(assets) {
    return assets.filter((asset, index, self) => 
      index === self.findIndex(a => a.url === asset.url)
    );
  }

  async downloadSingleAsset(asset, userAgent) {
    const assetUrl = new URL(asset.url);
    const filename = AssetNamer.generateFilename(assetUrl.pathname, asset.type);
    const localPath = path.join(this.fileManager.getAssetPath(asset.type), filename);

    // Check if file already exists
    if (await this.fileManager.fileExists(localPath)) {
      return {
        success: true,
        filename,
        relativePath: path.join(CONFIG.DIRECTORIES.ASSETS, asset.type, filename),
        size: 0
      };
    }

    // Download asset
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.ASSET_DOWNLOAD_TIMEOUT);

    const response = await fetch(asset.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const relativePath = await this.fileManager.saveAsset(asset.type, filename, Buffer.from(buffer));

    return {
      success: true,
      filename,
      relativePath,
      size: buffer.byteLength
    };
  }
}

class ScreenshotManager {
  constructor(fileManager, logger) {
    this.fileManager = fileManager;
    this.logger = logger;
  }

  async captureScreenshots(page, desktopViewport, mobileViewport, hostname) {
    const screenshots = { desktop: null, mobile: null };
    const timestamp = Date.now();

    try {
      // Desktop screenshot
      await page.setViewportSize(desktopViewport);
      await page.waitForTimeout(2000);
      
      const desktopFilename = `${hostname}-desktop-${timestamp}.png`;
      const desktopPath = path.join(this.fileManager.getScreenshotPath(), desktopFilename);
      
      await page.screenshot({
        path: desktopPath,
        fullPage: true,
        type: 'png'
      });
      
      screenshots.desktop = desktopPath;
      this.logger.debug(`Desktop screenshot saved: ${desktopFilename}`);

      // Mobile screenshot
      await page.setViewportSize(mobileViewport);
      await page.waitForTimeout(2000);
      
      const mobileFilename = `${hostname}-mobile-${timestamp}.png`;
      const mobilePath = path.join(this.fileManager.getScreenshotPath(), mobileFilename);
      
      await page.screenshot({
        path: mobilePath,
        fullPage: true,
        type: 'png'
      });
      
      screenshots.mobile = mobilePath;
      this.logger.debug(`Mobile screenshot saved: ${mobileFilename}`);

    } catch (error) {
      this.logger.error(`Screenshot error: ${error.message}`);
    }

    return screenshots;
  }
}

// ============================================================================
// STATIC UTILITY CLASSES
// ============================================================================

class PageExtractor {
  static async extractMetadata(page) {
    return await page.evaluate(() => {
      try {
        const metadata = {};
        
        // Extract meta tags
        document.querySelectorAll('meta').forEach(meta => {
          const name = meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('http-equiv');
          const content = meta.getAttribute('content');
          if (name && content) {
            metadata[name] = content;
          }
        });

        // Add page info
        metadata.lang = document.documentElement.lang || 'en';
        metadata.charset = document.characterSet || 'UTF-8';
        metadata.url = window.location.href;
        metadata.domain = window.location.hostname;
        
        return metadata;
      } catch (error) {
        console.error('Metadata extraction error:', error);
        return {};
      }
    });
  }

  static async extractAssets(page) {
    return await page.evaluate(() => {
      try {
        const assets = {
          images: [],
          stylesheets: [],
          scripts: [],
          fonts: []
        };

        // Extract images
        document.querySelectorAll('img[src]').forEach(img => {
          const src = img.getAttribute('src');
          if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
            try {
              assets.images.push({
                url: new URL(src, window.location.href).href,
                alt: img.getAttribute('alt') || '',
                originalSrc: src
              });
            } catch (error) {
              console.error('Image URL error:', src, error);
            }
          }
        });

        // Extract CSS background images
        document.querySelectorAll('*').forEach(el => {
          try {
            const style = window.getComputedStyle(el);
            const bgImage = style.backgroundImage;
            
            if (bgImage && bgImage !== 'none' && !bgImage.includes('data:')) {
              const matches = bgImage.match(/url\(['"]?([^'")]+)['"]?\)/g);
              if (matches) {
                matches.forEach(match => {
                  const url = match.replace(/url\(['"]?([^'")]+)['"]?\)/, '$1');
                  if (url && !url.startsWith('data:') && !url.startsWith('blob:')) {
                    try {
                      assets.images.push({
                        url: new URL(url, window.location.href).href,
                        alt: 'Background image',
                        originalSrc: url
                      });
                    } catch (error) {
                      console.error('Background image URL error:', url, error);
                    }
                  }
                });
              }
            }
          } catch (error) {
            // Ignore styling errors
          }
        });

        // Extract stylesheets
        document.querySelectorAll('link[rel="stylesheet"][href]').forEach(link => {
          const href = link.getAttribute('href');
          if (href) {
            try {
              assets.stylesheets.push({
                url: new URL(href, window.location.href).href,
                originalHref: href
              });
            } catch (error) {
              console.error('Stylesheet URL error:', href, error);
            }
          }
        });

        // Extract scripts
        document.querySelectorAll('script[src]').forEach(script => {
          const src = script.getAttribute('src');
          if (src) {
            try {
              assets.scripts.push({
                url: new URL(src, window.location.href).href,
                originalSrc: src
              });
            } catch (error) {
              console.error('Script URL error:', src, error);
            }
          }
        });

        // Extract fonts
        document.querySelectorAll('link[href*="font"]').forEach(link => {
          const href = link.getAttribute('href');
          if (href) {
            try {
              assets.fonts.push({
                url: new URL(href, window.location.href).href,
                originalHref: href
              });
            } catch (error) {
              console.error('Font URL error:', href, error);
            }
          }
        });

        return assets;
      } catch (error) {
        console.error('Asset extraction error:', error);
        return { images: [], stylesheets: [], scripts: [], fonts: [] };
      }
    });
  }
}

class AssetNamer {
  static generateFilename(pathname, assetType) {
    const ext = path.extname(pathname) || CONFIG.DEFAULT_EXTENSIONS[assetType] || '.bin';
    let basename = path.basename(pathname, ext) || 'asset';
    
    // Sanitize filename
    basename = basename.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    // Add hash for uniqueness
    const hash = crypto.createHash('md5')
      .update(pathname + Date.now().toString())
      .digest('hex')
      .substring(0, 8);
    
    return `${basename}-${hash}${ext}`;
  }
}

class AssetMapper {
  static replaceAssetUrls(html, assetMapping) {
    let modifiedHtml = html;

    for (const [originalUrl, localPath] of Object.entries(assetMapping)) {
      const escapedUrl = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Replace src attributes
      modifiedHtml = modifiedHtml.replace(
        new RegExp(`src=['"]${escapedUrl}['"]`, 'g'),
        `src="${localPath}"`
      );
      
      // Replace href attributes  
      modifiedHtml = modifiedHtml.replace(
        new RegExp(`href=['"]${escapedUrl}['"]`, 'g'),
        `href="${localPath}"`
      );
      
      // Replace CSS url() functions
      modifiedHtml = modifiedHtml.replace(
        new RegExp(`url\\(['"]?${escapedUrl}['"]?\\)`, 'g'),
        `url("${localPath}")`
      );
    }

    return modifiedHtml;
  }
}