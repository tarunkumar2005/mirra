// urlValidator.js - Fixed Tool Version
import { tool } from '@openai/agents';
import { z } from 'zod';
import { PlaywrightCrawler } from 'crawlee';
import { RobotsFile } from 'crawlee';

export const createUrlValidatorTool = () => {
  return tool({
    name: "url_validator",
    description: "Validates if a URL is accessible and safe to scrape. Performs basic checks for URL format, accessibility, and robots.txt permissions.",
    parameters: z.object({
      url: z.string().describe("A valid URL to check (must include http or https)"),
      userAgent: z.string().optional().default("Mozilla/5.0 (compatible; WebScraper/1.0)"),
      respectRobots: z.boolean().optional().default(true),
      timeout: z.number().optional().default(15000)
    }),
    async execute({ url, userAgent, respectRobots, timeout }) {
      try {
        const result = {
          success: false,
          url,
          accessible: false,
          scrapingAllowed: false,
          statusCode: null,
          title: null,
          redirectUrl: null,
          recommendations: [],
          message: ''
        };

        // Step 1: Basic URL validation
        const urlObj = new URL(url);
        
        // Only allow http and https
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
          throw new Error('Only HTTP and HTTPS URLs are supported');
        }

        // Step 2: Check robots.txt if required
        let robotsAllowed = true;
        if (respectRobots) {
          try {
            const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
            const robotsFile = new RobotsFile({ userAgent });
            await robotsFile.load(robotsUrl);
            robotsAllowed = robotsFile.isAllowed(url);
            
            if (!robotsAllowed) {
              result.scrapingAllowed = false;
              result.recommendations.push("URL blocked by robots.txt");
              result.message = "Access blocked by robots.txt";
              return result;
            }
          } catch (robotsError) {
            // robots.txt not found - assume allowed
            result.recommendations.push("robots.txt not accessible - proceeding");
          }
        }

        // Step 3: Basic accessibility check with proper error handling
        let crawlerResult = {
          accessible: false,
          error: 'Request not processed'
        };

        const crawler = new PlaywrightCrawler({
          maxRequestsPerCrawl: 1,
          requestHandlerTimeoutSecs: Math.floor(timeout / 1000),
          headless: true,
          launchContext: {
            userAgent
          },
          requestHandler: async ({ page, request }) => {
            try {
              const response = await page.goto(request.loadedUrl, { 
                waitUntil: 'domcontentloaded',
                timeout 
              });
              
              const title = await page.title().catch(() => 'No title');
              const statusCode = response?.status() || null;
              const redirectUrl = page.url() !== url ? page.url() : null;
              
              // Basic malicious content check
              const content = await page.content();
              const isMalicious = checkForMaliciousContent(content);
              
              crawlerResult = {
                accessible: true,
                title,
                statusCode,
                redirectUrl,
                isMalicious
              };
              
            } catch (error) {
              crawlerResult = {
                accessible: false,
                error: error.message
              };
            }
          },
          failedRequestHandler: async ({ error, request }) => {
            crawlerResult = {
              accessible: false,
              error: error.message
            };
          }
        });

        try {
          await crawler.run([url]);
          await crawler.teardown();
          
          // If crawlerResult is still the default, it means no requests were processed
          if (!crawlerResult.accessible && crawlerResult.error === 'Request not processed') {
            crawlerResult.error = 'URL could not be reached or processed';
          }
          
        } catch (crawlerError) {
          await crawler.teardown().catch(() => {}); // Ensure cleanup
          crawlerResult = {
            accessible: false,
            error: `Crawler error: ${crawlerError.message}`
          };
        }

        // Step 4: Process results with proper null checking
        if (crawlerResult && crawlerResult.accessible) {
          result.accessible = true;
          result.statusCode = crawlerResult.statusCode;
          result.title = crawlerResult.title;
          result.redirectUrl = crawlerResult.redirectUrl;
          result.success = true;
          
          if (crawlerResult.isMalicious) {
            result.scrapingAllowed = false;
            result.recommendations.push("Potential malicious content detected");
            result.message = "URL accessible but may contain suspicious content";
          } else {
            result.scrapingAllowed = robotsAllowed;
            result.message = `URL is accessible and safe (Status: ${result.statusCode})`;
            result.recommendations.push("URL appears safe for scraping");
          }
          
        } else {
          result.accessible = false;
          result.scrapingAllowed = false;
          result.message = `URL not accessible: ${crawlerResult?.error || 'Unknown error'}`;
          result.recommendations.push("Check URL validity and network connectivity");
        }

        return result;
      } catch (error) {
        return {
          success: false,
          url,
          accessible: false,
          scrapingAllowed: false,
          statusCode: null,
          recommendations: ["Validation failed - check URL format"],
          message: `Validation error: ${error.message}`
        };
      }
    }
  });
};

function checkForMaliciousContent(content) {
  const maliciousIndicators = [
    'phishing',
    'malware',
    'suspicious activity',
    'account suspended',
    'domain parked',
    'this site may harm your computer',
    'deceptive site ahead'
  ];
  
  const lowerContent = content.toLowerCase();
  return maliciousIndicators.some(indicator => lowerContent.includes(indicator));
}