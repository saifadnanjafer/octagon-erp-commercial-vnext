/**
 * Custom API Integration Module for Octagon ERP
 * Uses API key from .env file
 */

// Load environment variables
const getCustomApiConfig = () => {
  return {
    apiKey: process.env.CUSTOM_API_KEY || '',
    endpoint: process.env.CUSTOM_API_ENDPOINT || '',
    provider: process.env.CUSTOM_API_PROVIDER || 'contactbox',
    model: process.env.CUSTOM_API_MODEL || 'gpt-4'
  };
};

// Browser-side: Get config from localStorage or window object
const getCustomApiConfigClient = () => {
  try {
    // Try to get from window object (set by server)
    if (window.__customApiConfig) {
      return window.__customApiConfig;
    }
    
    // Try localStorage fallback
    const stored = localStorage.getItem('customApiConfig');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to get custom API config:', e);
  }
  
  return {
    apiKey: '',
    endpoint: 'https://api.contactboxtools.me/v1',
    provider: 'contactbox',
    model: 'claude-sonnet-4-6'
  };
};

/**
 * Make a request to the custom API
 * Compatible with OpenAI-compatible endpoints
 */
const callCustomApi = async (messages, options = {}) => {
  const config = getCustomApiConfigClient();
  
  if (!config.apiKey) {
    throw new Error('Custom API key not configured. Please add CUSTOM_API_KEY to .env');
  }
  
  const {
    temperature = 0.7,
    maxTokens = 2048,
    system = 'You are a helpful AI assistant.'
  } = options;

  try {
    const response = await fetch(`${config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: system },
          ...messages
        ],
        temperature,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API Error (${response.status}): ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage,
      model: data.model
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      content: ''
    };
  }
};

/**
 * Validate API connectivity
 */
const validateCustomApiKey = async () => {
  const config = getCustomApiConfigClient();
  
  if (!config.apiKey) {
    return { valid: false, message: 'API key not configured' };
  }

  try {
    const result = await callCustomApi(
      [{ role: 'user', content: 'Say "API connection successful" in Arabic.' }],
      { maxTokens: 50 }
    );

    return {
      valid: result.success,
      message: result.success ? 'API connection successful ✓' : `Error: ${result.error}`
    };
  } catch (error) {
    return { valid: false, message: `Connection failed: ${error.message}` };
  }
};

// Export for use in Node.js (server-side)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getCustomApiConfig,
    callCustomApi,
    validateCustomApiKey
  };
}

// Register as window object for browser
if (typeof window !== 'undefined') {
  window.CustomApiModule = {
    getConfig: getCustomApiConfigClient,
    callApi: callCustomApi,
    validate: validateCustomApiKey
  };
}
