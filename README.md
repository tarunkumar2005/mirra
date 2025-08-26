# 🚀 Mirra CLI

> AI-powered website cloning agent that transforms any static website into a fully functional Next.js application

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/tarunkumar2005/mirra)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

## ✨ Features

- **🤖 AI-Powered Cloning**: Intelligent website analysis and recreation
- **⚡ One-Command Setup**: Clone any website with a single prompt
- **🎨 Next.js Generation**: Automatically creates modern React applications
- **🛠️ Smart Scraping**: Advanced web scraping with Playwright
- **💫 Interactive CLI**: Beautiful command-line interface with real-time feedback
- **🎯 Static Site Focus**: Optimized for static websites and landing pages

## Video Demo

![Video Demo](https://youtu.be/lWqLCaUfhtE?si=oWiMHgrzjPsfNNSy)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or Bun
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/tarunkumar2005/mirra.git
cd mirra

# Install dependencies
npm install
# or
bun install

# Set up environment variables
cp .env.example .env
# Add your OpenAI API key to .env
```

### Usage

Start the interactive CLI:

```bash
node cli.js start
```

Then enter your prompt:

```
can you clone this website: https://github.com/tarunkumar2005/custom-tokenizer
```

That's it! Mirra will:
1. ✅ Validate the URL
2. 🕷️ Scrape the website content
3. 🏗️ Generate a Next.js application
4. 🎨 Recreate the design and functionality

## 🛠️ How It Works

Mirra uses a sophisticated 3-phase workflow:

### Phase 1: URL Validation
- Checks website accessibility
- Validates URL format and response

### Phase 2: Website Scraping
- Extracts HTML structure
- Captures CSS styles
- Downloads assets and images
- Analyzes component hierarchy

### Phase 3: Next.js Generation
- Creates new Next.js project with Tailwind CSS
- Converts HTML to React components
- Applies responsive design patterns
- Generates working interactive elements

## 📁 Project Structure

```
mirra/
├── cli.js              # Main CLI interface
├── agent.js            # AI agent orchestration
├── openai.js           # OpenAI client configuration
├── prompts/
│   └── index.js        # System prompts and instructions
├── tools/
│   ├── urlValidator.js # URL validation tool
│   ├── scraper.js      # Web scraping tool
│   └── executeCommand.js # Command execution tool
└── package.json
```

## ⚙️ Configuration

Create a `.env` file with your OpenAI API key:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

## 🎯 Current Capabilities

### ✅ What Works Great
- Static websites and landing pages
- HTML/CSS/basic JavaScript sites
- Responsive design recreation
- Component-based architecture
- Tailwind CSS integration

### ⚠️ Current Limitations
- Single prompt operation (no iterative refinement)
- Static sites only (no dynamic JS-heavy applications)
- No server-side functionality cloning
- Limited to publicly accessible websites

## 🔧 Advanced Usage

### Custom Commands

You can also run the agent directly:

```bash
node agent.js
```

### Tool Integration

Mirra includes three core tools:
- **URL Validator**: Ensures target websites are accessible
- **Web Scraper**: Extracts complete website data using Playwright
- **Command Executor**: Builds and configures Next.js applications

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [OpenAI Agents](https://github.com/openai/agents)
- Powered by [Playwright](https://playwright.dev/) for web scraping
- CLI interface using [Clack](https://github.com/natemoo-re/clack)
- Styled with [Chalk](https://github.com/chalk/chalk) and [Gradient String](https://github.com/bokub/gradient-string)

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/tarunkumar2005/mirra/issues) page
2. Create a new issue with detailed information
3. Join our community discussions

---

<div align="center">
  <strong>Made with ❤️ by the Mirra team</strong>
</div>
