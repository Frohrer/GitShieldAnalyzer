import OpenAI from 'openai';
import type { SecurityRule } from '@/lib/types';

interface LLMAnalysis {
  description: string;
  recommendation: string;
  lineNumber: number;
  codeSnippet: string;
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required for security analysis');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function extractRelevantLines(content: string, startLine: number): { snippet: string, lineNumber: number } {
  const lines = content.split('\n');
  const windowSize = 5; // Show 5 lines of context
  const start = Math.max(0, startLine - Math.floor(windowSize / 2));
  const end = Math.min(lines.length, start + windowSize);

  return {
    snippet: lines.slice(start, end).join('\n'),
    lineNumber: startLine + 1, // Convert to 1-based line numbers
  };
}

// Check if code contains patterns relevant to the security rule
function containsRelevantPatterns(code: string, rule: SecurityRule): boolean {
  const patterns: Record<string, RegExp[]> = {
    'CORS': [
      /cors/i,
      /Access-Control-Allow/i,
      /app\.use\(.*cors.*\)/i,
      /fetch\(|axios\.|http\.request/i
    ],
    'MFA': [
      /authentication|auth[^o]|login|signin/i,
      /passport\.|authenticat|verify[^a-z]/i,
      /session|token|jwt|bearer/i
    ],
    'CSRF Tokens': [
      /csrf|xsrf/i,
      /form.*submit|submit.*form/i,
      /post.*request|request.*post/i
    ],
    'Password Policy': [
      /password|passwd/i,
      /hash|encrypt|bcrypt|argon2/i,
      /register|signup|create.*user/i
    ],
    'Session Management': [
      /session|cookie|token|jwt/i,
      /login|auth|signin/i,
      /express-session|localStorage|sessionStorage/i
    ],
    'XSS Protection': [
      /innerHTML|outerHTML/i,
      /dangerouslySetInnerHTML/i,
      /eval\(|setTimeout\(.*\)|setInterval\(.*\)/i,
      /document\.write|\.html\(/i
    ],
    'SQL Injection': [
      /SELECT|INSERT|UPDATE|DELETE.*FROM/i,
      /execute.*sql|query.*sql/i,
      /database\.query|db\.query/i
    ],
    'Hardcoded Credentials': [
      /password\s*=|apiKey\s*=|secret\s*=|key\s*=/i,
      /const.*password|let.*password|var.*password/i,
      /config.*password|config.*secret|config.*key/i
    ],
    'TLS Version': [
      /https|tls|ssl/i,
      /certificates?/i,
      /createServer|listen/i
    ]
  };

  // If no specific patterns for the rule category, default to basic code check
  const relevantPatterns = patterns[rule.category] || [/./];
  return relevantPatterns.some(pattern => pattern.test(code));
}

export async function analyzeCode(
  content: string,
  rule: SecurityRule
): Promise<LLMAnalysis | null> {
  try {
    // Skip analysis if code doesn't contain relevant patterns
    if (!containsRelevantPatterns(content, rule)) {
      console.log(`No ${rule.category}-related patterns found in code, skipping analysis`);
      return null;
    }

    console.log(`Analyzing code with rule: ${rule.name}`);

    const systemPrompt = `You are a security code analyzer focusing on ${rule.category} vulnerabilities.
IMPORTANT: Only report a vulnerability if the code ACTUALLY IMPLEMENTS functionality related to ${rule.category}.
Do not report issues for:
- Code that only contains data structures, type definitions, or utility functions
- Imported modules or library declarations
- Code that doesn't directly handle ${rule.category}-related operations

Your response must be in JSON format with these fields:
{
  "vulnerable": boolean,  // true ONLY if the code contains actual ${rule.category} functionality AND has vulnerabilities
  "description": string, // Brief description of the actual vulnerability found
  "recommendation": string, // Specific recommendation to fix the issue
  "lineNumber": number // The exact line number where the vulnerable code exists
}

For ${rule.category}, a vulnerability means:
${rule.llmPrompt}

Example of vulnerable code for ${rule.category}:
${rule.example || "No specific example provided"}`;

    const userPrompt = `Analyze this code for ${rule.category} vulnerabilities:

${content}`;

    console.log('Sending request to OpenAI...');
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    if (!completion.choices[0]?.message?.content) {
      console.error('No response content from OpenAI');
      return null;
    }

    console.log('Received response from OpenAI:', completion.choices[0].message.content);
    const analysis = JSON.parse(completion.choices[0].message.content);

    if (!analysis.vulnerable) {
      console.log('No vulnerability found');
      return null;
    }

    console.log('Vulnerability found:', analysis);
    const { snippet, lineNumber } = extractRelevantLines(content, analysis.lineNumber - 1);

    return {
      description: analysis.description,
      recommendation: analysis.recommendation,
      lineNumber,
      codeSnippet: snippet,
    };
  } catch (error) {
    console.error('LLM analysis error:', error);
    throw error;
  }
}