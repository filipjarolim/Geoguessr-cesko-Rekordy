#!/usr/bin/env node
/**
 * Script to inject GITHUB_TOKEN from .env file into index.html
 * Run this before serving the site: node inject-token.js
 */

const fs = require('fs');
const path = require('path');

// Load .env file or use environment variables (for Vercel)
function loadEnv() {
    // First, check if GITHUB_TOKEN is already in process.env (Vercel/deployment)
    if (process.env.GITHUB_TOKEN) {
        console.log('✅ Using GITHUB_TOKEN from environment variables');
        return { GITHUB_TOKEN: process.env.GITHUB_TOKEN };
    }
    
    // Otherwise, try to load from .env file (local development)
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        console.warn('⚠️  .env file not found and GITHUB_TOKEN not in environment. Token will not be injected.');
        return null;
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const env = {};
    
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
                env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
            }
        }
    });
    
    return env;
}

// Inject token into HTML
function injectToken() {
    const env = loadEnv();
    if (!env || !env.GITHUB_TOKEN) {
        console.warn('⚠️  GITHUB_TOKEN not found in .env file.');
        return;
    }
    
    const htmlPath = path.join(__dirname, 'index.html');
    if (!fs.existsSync(htmlPath)) {
        console.error('❌ index.html not found!');
        process.exit(1);
    }
    
    let html = fs.readFileSync(htmlPath, 'utf8');
    const token = env.GITHUB_TOKEN;
    
    // Remove existing token injection if present
    html = html.replace(/<script>window\.GITHUB_TOKEN\s*=\s*['"][^'"]*['"];?\s*<\/script>\s*\n?/gi, '');
    
    // Find the comment and inject token script before admin.js
    const injectionScript = `    <script>window.GITHUB_TOKEN = '${token}';</script>\n`;
    
    // Inject before admin.js script tag
    if (html.includes('<script src="admin.js"></script>')) {
        html = html.replace(
            /(<script src="admin\.js"><\/script>)/,
            injectionScript + '$1'
        );
        fs.writeFileSync(htmlPath, html, 'utf8');
        console.log('✅ GitHub token injected into index.html');
    } else {
        console.error('❌ Could not find admin.js script tag in index.html');
        process.exit(1);
    }
}

injectToken();

