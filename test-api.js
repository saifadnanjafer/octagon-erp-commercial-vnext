#!/usr/bin/env node
/**
 * Test the Custom API Connection
 */

const https = require('https');
const querystring = require('querystring');

// Security hardening 2026-07-05: key moved to .env (was hardcoded here).
require('dotenv').config();
const apiKey = process.env.CUSTOM_API_KEY || process.env.CONTACTBOX_API_KEY || '';
const endpoint = (process.env.CUSTOM_API_ENDPOINT || 'https://api.contactboxtools.me/v1') + '/chat/completions';
if (!apiKey) { console.error('❌ CUSTOM_API_KEY is not set in .env'); process.exit(1); }

async function testAPI() {
  console.log('🔍 Testing Custom API Connection...\n');
  console.log('Endpoint:', endpoint);
  console.log('API Key:', apiKey.substring(0, 10) + '...\n');

  try {
    console.log('📤 Sending request...');
    
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-6',
      messages: [{role: 'user', content: 'Say hello in one word'}],
      temperature: 0.7,
      max_tokens: 50
    });

    return new Promise((resolve, reject) => {
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = https.request(endpoint, options, (res) => {
        let data = '';
        
        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          console.log('Status:', res.statusCode, res.statusMessage, '\n');
          
          try {
            const response = JSON.parse(data);
            
            if (res.statusCode === 200) {
              console.log('✅ SUCCESS!\n');
              console.log('Response:', response.choices?.[0]?.message?.content || 'No content');
              console.log('\nUsage:', response.usage);
              console.log('Model:', response.model);
            } else {
              console.log('❌ API Error:\n');
              console.log(JSON.stringify(response, null, 2));
            }
            resolve();
          } catch (e) {
            console.log('Raw Response:', data);
            resolve();
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ Connection Error:');
        console.error('  Message:', error.message);
        console.error('  Code:', error.code);
        reject(error);
      });

      req.write(payload);
      req.end();
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAPI();
