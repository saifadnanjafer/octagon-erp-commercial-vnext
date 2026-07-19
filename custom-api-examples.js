/**
 * Example: Using Custom API in Octagon ERP
 * 
 * This file demonstrates how to use the CustomApiModule
 * to call your ContactBox API for various tasks.
 */

// Example 1: Simple AI Query
async function queryCustomAI(question) {
  try {
    const response = await CustomApiModule.callApi([
      { role: 'user', content: question }
    ], {
      temperature: 0.7,
      maxTokens: 2048,
      system: 'You are a helpful business assistant for an ERP system.'
    });

    if (response.success) {
      console.log('✓ Response:', response.content);
      return response.content;
    } else {
      console.error('✗ Error:', response.error);
      return null;
    }
  } catch (error) {
    console.error('Request failed:', error);
    return null;
  }
}

// Example 2: Analyze Salary Data
async function analyzeSalaryData(employeeData) {
  const prompt = `
Please analyze this employee salary data and provide recommendations:
${JSON.stringify(employeeData, null, 2)}

Provide:
1. Total payroll summary
2. Any anomalies or concerns
3. Recommendations for optimization
  `;

  return await queryCustomAI(prompt);
}

// Example 3: Generate Report Summary
async function generateReportSummary(reportData) {
  const prompt = `
Summarize this workshop report in Arabic, focusing on key metrics:
${JSON.stringify(reportData, null, 2)}

Format the response as:
- ملخص تنفيذي (Executive Summary)
- المؤشرات الرئيسية (Key Metrics)
- الملاحظات المهمة (Important Notes)
  `;

  return await queryCustomAI(prompt);
}

// Example 4: Validate Data Quality
async function validateDataQuality(data, dataType) {
  const prompt = `
Review this ${dataType} data for quality issues:
${JSON.stringify(data, null, 2)}

Identify:
1. Missing or invalid fields
2. Data inconsistencies
3. Recommended corrections
  `;

  return await queryCustomAI(prompt);
}

// Example 5: Test API Connection
async function testCustomAPIConnection() {
  const result = await CustomApiModule.validate();
  console.log('API Test Result:', result);
  return result;
}

// Example 6: Integration with Existing Functions
// This shows how to add custom API support to existing ERP functions

// Hook into calculator verification (if exists)
if (typeof window.verifyCalculatorWithAI === 'function') {
  const originalVerify = window.verifyCalculatorWithAI;
  window.verifyCalculatorWithAI = async function(calcResult) {
    // Try custom API first if configured
    if (window.__customApiConfig && window.__customApiConfig.apiKey) {
      try {
        const aiResponse = await queryCustomAI(
          `Verify this calculation result: ${JSON.stringify(calcResult)}`
        );
        console.log('AI Verification:', aiResponse);
        return aiResponse;
      } catch (error) {
        console.warn('Custom API failed, falling back:', error);
      }
    }
    
    // Fall back to original implementation
    return originalVerify.call(this, calcResult);
  };
}

// Example 7: Batch Processing with Custom API
async function processBatchWithAI(items, instruction) {
  const results = [];
  
  for (const item of items) {
    try {
      const response = await queryCustomAI(
        `${instruction}\n\nData: ${JSON.stringify(item)}`
      );
      results.push({
        item,
        result: response,
        status: 'success'
      });
    } catch (error) {
      results.push({
        item,
        error: error.message,
        status: 'failed'
      });
    }
  }
  
  return results;
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.CustomAIExamples = {
    queryAI: queryCustomAI,
    analyzeSalary: analyzeSalaryData,
    generateSummary: generateReportSummary,
    validateData: validateDataQuality,
    testConnection: testCustomAPIConnection,
    processBatch: processBatchWithAI
  };
}

// NOTE: this used to auto-run a live API call on every page load for every
// visitor (burning a billed request each time and requiring the key to be
// shipped to the browser). Removed — call window.CustomAIExamples.testConnection()
// manually from the console when you actually want to check connectivity.
