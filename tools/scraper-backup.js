// webScraperTool.js - Completely Fixed Version
import { tool } from '@openai/agents';
import { z } from 'zod';
import { chromium } from 'playwright';
import { RobotsFile } from 'crawlee';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { URL } from 'url';

export const createWebScraperTool = () => {
  return tool({
    name: "web_scraper",
    description: "Scrapes a single web page, downloads all assets (images, fonts, CSS, JS), maps URLs to local paths, and takes desktop/mobile screenshots. Creates a complete offline copy of the page.",
    parameters: z.object({
      url: z.string().describe("A valid URL to scrape (must include http or https)"),
      outputDir: z.string().optional().default("./scraped_data").describe("Directory to save scraped data and assets"),
      userAgent: z.string().optional().default("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
      respectRobots: z.boolean().optional().default(true),
      timeout: z.number().optional().default(30000).describe("Timeout in milliseconds"),
      downloadAssets: z.boolean().optional().default(true).describe("Whether to download images, fonts, CSS, JS files"),
      takeScreenshots: z.boolean().optional().default(true).describe("Whether to take desktop and mobile screenshots"),
      desktopViewport: z.object({
        width: z.number().default(1920),
        height: z.number().default(1080)
      }).optional().default({ width: 1920, height: 1080 }),
      mobileViewport: z.object({
        width: z.number().default(375),
        height: z.number().default(667)
      }).optional().default({ width: 375, height: 667 })
    }),
    async execute({ 
      url, 
      outputDir, 
      userAgent, 
      respectRobots, 
      timeout, 
      downloadAssets, 
      takeScreenshots, 
      desktopViewport, 
      mobileViewport 
    }) {
      let browser = null;
      let context = null;
      let page = null;

      try {
        const result = {
          success: false,
          url,
          accessible: false,
          scrapingAllowed: false,
          outputDir,
          scrapedData: {
            html: null,
            title: null,
            metadata: {},
            assets: {
              images: [],
              stylesheets: [],
              scripts: [],
              fonts: []
            }
          },
          screenshots: {
            desktop: null,
            mobile: null
          },
          assetMapping: {},
          statistics: {
            totalAssets: 0,
            downloadedAssets: 0,
            failedAssets: 0,
            processingTime: 0
          },
          message: ''
        };

        const startTime = Date.now();
        console.log(`Starting scrape process for: ${url}`);

        // Step 1: Basic URL validation
        const urlObj = new URL(url);
        
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
          throw new Error('Only HTTP and HTTPS URLs are supported');
        }

        // Step 2: Create output directories
        await createDirectories(outputDir);
        console.log('Output directories created');

        // Step 3: Check robots.txt if required
        if (respectRobots) {
          try {
            const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
            const robotsFile = new RobotsFile({ userAgent });
            await robotsFile.load(robotsUrl);
            const robotsAllowed = robotsFile.isAllowed(url);
            
            if (!robotsAllowed) {
              result.scrapingAllowed = false;
              result.message = "Access blocked by robots.txt";
              return result;
            }
          } catch (robotsError) {
            console.log("robots.txt not accessible - proceeding");
          }
        }

        // Step 4: Launch browser and create context
        console.log('Launching browser...');
        browser = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
          ]
        });

        context = await browser.newContext({
          userAgent,
          viewport: desktopViewport,
          ignoreHTTPSErrors: true,
          bypassCSP: true
        });

        // Enable request/response logging for debugging
        context.on('request', request => {
          console.log(`Request: ${request.method()} ${request.url()}`);
        });

        context.on('response', response => {
          console.log(`Response: ${response.status()} ${response.url()}`);
        });

        page = await context.newPage();
        
        // Set longer timeouts
        page.setDefaultTimeout(timeout);
        page.setDefaultNavigationTimeout(timeout);

        console.log('Navigating to page...');

        // Step 5: Navigate to the page
        const response = await page.goto(url, {
          waitUntil: 'networkidle',
          timeout
        });

        if (!response || !response.ok()) {
          throw new Error(`HTTP ${response?.status() || 'unknown'}: ${response?.statusText() || 'Navigation failed'}`);
        }

        console.log(`Page loaded successfully with status ${response.status()}`);

        // Wait for additional content to load
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000); // Additional wait for dynamic content

        // Step 6: Extract page data
        console.log('Extracting page data...');
        const title = await page.title();
        const html = await page.content();
        const metadata = await extractMetadata(page);
        const assets = await extractAssets(page);
        
        console.log(`Extracted: Title="${title}", HTML=${html.length} chars, ${assets.images.length} images, ${assets.stylesheets.length} CSS, ${assets.scripts.length} JS, ${assets.fonts.length} fonts`);

        // Step 7: Take screenshots if requested
        let screenshots = { desktop: null, mobile: null };
        if (takeScreenshots) {
          console.log('Taking screenshots...');
          screenshots = await takePageScreenshots(
            page, 
            outputDir, 
            desktopViewport, 
            mobileViewport,
            urlObj.hostname
          );
          console.log('Screenshots completed');
        }

        // Step 8: Download assets and create mappings
        let assetMapping = {};
        let downloadStats = { total: 0, downloaded: 0, failed: 0 };

        if (downloadAssets) {
          console.log('Starting asset downloads...');
          const downloadResult = await downloadAndMapAssets(
            assets,
            urlObj,
            outputDir,
            userAgent
          );
          assetMapping = downloadResult.mapping;
          downloadStats = downloadResult.stats;
          console.log(`Assets downloaded: ${downloadStats.downloaded}/${downloadStats.total} successful`);
        }

        // Step 9: Create modified HTML with local asset paths
        const modifiedHtml = replaceAssetUrls(html, assetMapping);

        // Step 10: Save HTML file
        const htmlPath = path.join(outputDir, 'index.html');
        await fs.writeFile(htmlPath, modifiedHtml, 'utf8');

        // Step 11: Save metadata
        const metadataPath = path.join(outputDir, 'metadata.json');
        await fs.writeFile(metadataPath, JSON.stringify({
          url: page.url(),
          originalUrl: url,
          title,
          metadata,
          scrapedAt: new Date().toISOString(),
          assets,
          assetMapping,
          statistics: downloadStats
        }, null, 2));

        console.log('Scraping completed successfully');

        // Final result
        result.success = true;
        result.accessible = true;
        result.scrapingAllowed = true;
        result.scrapedData = {
          html: modifiedHtml,
          title,
          metadata,
          assets
        };
        result.screenshots = screenshots;
        result.assetMapping = assetMapping;
        result.statistics = {
          totalAssets: downloadStats.total,
          downloadedAssets: downloadStats.downloaded,
          failedAssets: downloadStats.failed,
          processingTime: Date.now() - startTime
        };
        result.message = `Successfully scraped page and downloaded ${downloadStats.downloaded}/${downloadStats.total} assets in ${result.statistics.processingTime}ms`;

        return result;

      } catch (error) {
        console.error('Scraping error:', error.message);
        return {
          success: false,
          url,
          accessible: false,
          scrapingAllowed: false,
          outputDir,
          message: `Scraping error: ${error.message}`,
          statistics: {
            totalAssets: 0,
            downloadedAssets: 0,
            failedAssets: 0,
            processingTime: Date.now() - (Date.now())
          }
        };
      } finally {
        // Cleanup
        try {
          if (page) await page.close();
          if (context) await context.close();
          if (browser) await browser.close();
          console.log('Browser cleanup completed');
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError.message);
        }
      }
    }
  });
};

// Helper Functions with improved error handling

async function createDirectories(outputDir) {
  const dirs = [
    outputDir,
    path.join(outputDir, 'assets'),
    path.join(outputDir, 'assets', 'images'),
    path.join(outputDir, 'assets', 'stylesheets'),
    path.join(outputDir, 'assets', 'scripts'),
    path.join(outputDir, 'assets', 'fonts'),
    path.join(outputDir, 'screenshots')
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function extractMetadata(page) {
  return await page.evaluate(() => {
    try {
      const metadata = {};
      
      // Basic meta tags
      const metaTags = document.querySelectorAll('meta');
      metaTags.forEach(meta => {
        const name = meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('http-equiv');
        const content = meta.getAttribute('content');
        if (name && content) {
          metadata[name] = content;
        }
      });

      // Additional page info
      metadata.lang = document.documentElement.lang || 'en';
      metadata.charset = document.characterSet || 'UTF-8';
      metadata.url = window.location.href;
      metadata.domain = window.location.hostname;
      
      return metadata;
    } catch (e) {
      console.error('Error extracting metadata:', e);
      return {};
    }
  });
}

async function extractAssets(page) {
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
          } catch (e) {
            console.error('Error processing image URL:', src, e);
          }
        }
      });

      // Extract CSS background images
      document.querySelectorAll('*').forEach(el => {
        try {
          const computedStyle = window.getComputedStyle(el);
          const bgImage = computedStyle.backgroundImage;
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
                  } catch (e) {
                    console.error('Error processing background image URL:', url, e);
                  }
                }
              });
            }
          }
        } catch (e) {
          // Ignore elements that can't be styled
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
          } catch (e) {
            console.error('Error processing stylesheet URL:', href, e);
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
          } catch (e) {
            console.error('Error processing script URL:', src, e);
          }
        }
      });

      // Extract fonts from link tags and @font-face rules
      document.querySelectorAll('link[href*="font"]').forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
          try {
            assets.fonts.push({
              url: new URL(href, window.location.href).href,
              originalHref: href
            });
          } catch (e) {
            console.error('Error processing font URL:', href, e);
          }
        }
      });

      return assets;
    } catch (e) {
      console.error('Error in extractAssets:', e);
      return {
        images: [],
        stylesheets: [],
        scripts: [],
        fonts: []
      };
    }
  });
}

async function takePageScreenshots(page, outputDir, desktopViewport, mobileViewport, hostname) {
  const screenshots = { desktop: null, mobile: null };
  const screenshotDir = path.join(outputDir, 'screenshots');

  try {
    // Desktop screenshot
    await page.setViewportSize(desktopViewport);
    await page.waitForTimeout(2000);
    const desktopPath = path.join(screenshotDir, `${hostname}_desktop_${Date.now()}.png`);
    await page.screenshot({ 
      path: desktopPath, 
      fullPage: true,
      type: 'png'
    });
    screenshots.desktop = desktopPath;
    console.log(`Desktop screenshot saved: ${desktopPath}`);

    // Mobile screenshot
    await page.setViewportSize(mobileViewport);
    await page.waitForTimeout(2000);
    const mobilePath = path.join(screenshotDir, `${hostname}_mobile_${Date.now()}.png`);
    await page.screenshot({ 
      path: mobilePath, 
      fullPage: true,
      type: 'png'
    });
    screenshots.mobile = mobilePath;
    console.log(`Mobile screenshot saved: ${mobilePath}`);

  } catch (error) {
    console.error('Screenshot error:', error.message);
  }

  return screenshots;
}

async function downloadAndMapAssets(assets, baseUrlObj, outputDir, userAgent) {
  const mapping = {};
  const stats = { total: 0, downloaded: 0, failed: 0 };

  const allAssets = [
    ...assets.images.map(img => ({ ...img, type: 'images' })),
    ...assets.stylesheets.map(css => ({ ...css, type: 'stylesheets' })),
    ...assets.scripts.map(js => ({ ...js, type: 'scripts' })),
    ...assets.fonts.map(font => ({ ...font, type: 'fonts' }))
  ];

  // Remove duplicates
  const uniqueAssets = allAssets.filter((asset, index, self) => 
    index === self.findIndex(a => a.url === asset.url)
  );

  stats.total = uniqueAssets.length;
  console.log(`Downloading ${stats.total} unique assets...`);

  for (const asset of uniqueAssets) {
    try {
      const assetUrl = new URL(asset.url);
      const filename = generateAssetFilename(assetUrl.pathname, asset.type);
      const localPath = path.join(outputDir, 'assets', asset.type, filename);
      const relativePath = path.join('assets', asset.type, filename);

      // Check if file already exists
      try {
        await fs.access(localPath);
        console.log(`Asset already exists: ${filename}`);
        // Create mapping even if file exists
        mapping[asset.url] = relativePath;
        if (asset.originalSrc) mapping[asset.originalSrc] = relativePath;
        if (asset.originalHref) mapping[asset.originalHref] = relativePath;
        stats.downloaded++;
        continue;
      } catch {
        // File doesn't exist, proceed with download
      }

      // Download the asset
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

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
      await fs.writeFile(localPath, Buffer.from(buffer));

      // Create mapping
      mapping[asset.url] = relativePath;
      if (asset.originalSrc) mapping[asset.originalSrc] = relativePath;
      if (asset.originalHref) mapping[asset.originalHref] = relativePath;

      stats.downloaded++;
      console.log(`Downloaded: ${filename} (${buffer.byteLength} bytes)`);

    } catch (error) {
      console.error(`Failed to download ${asset.url}:`, error.message);
      stats.failed++;
    }
  }

  return { mapping, stats };
}

function generateAssetFilename(pathname, assetType) {
  const ext = path.extname(pathname) || getDefaultExtension(assetType);
  let basename = path.basename(pathname, ext) || 'asset';
  
  // Clean filename
  basename = basename.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  const hash = crypto.createHash('md5').update(pathname + Date.now()).digest('hex').substring(0, 8);
  
  return `${basename}_${hash}${ext}`;
}

function getDefaultExtension(assetType) {
  const extensions = {
    images: '.jpg',
    stylesheets: '.css',
    scripts: '.js',
    fonts: '.woff2'
  };
  return extensions[assetType] || '.bin';
}

function replaceAssetUrls(html, assetMapping) {
  let modifiedHtml = html;

  for (const [originalUrl, localPath] of Object.entries(assetMapping)) {
    // Replace various URL formats more carefully
    const escapedUrl = escapeRegExp(originalUrl);
    
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

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}