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

if (!process.env.OPENAI_API_VERSION) {
  throw new Error('OPENAI_API_VERSION is required for security analysis');
}

if (!process.env.OPENAI_API_BASE) {
  throw new Error('OPENAI_API_BASE is required for security analysis');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  apiVersion: process.env.OPENAI_API_VERSION,
  baseURL: process.env.OPENAI_API_BASE,
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

export async function analyzeCode(
  content: string,
  rule: SecurityRule
): Promise<LLMAnalysis | null> {
  try {
    console.log(`Analyzing code with rule: ${rule.name}`);

    const systemPrompt = `You are a security code analyzer. Analyze the following code for ${rule.category} vulnerabilities, focusing on ${rule.name}.

    Before analyzing, determine the code's context:
    1. Is this a web application? (Look for HTTP servers, API endpoints, etc.)
    2. Is this a database-connected application? (Look for database queries, ORM usage)
    3. Is this a file system operation? (Look for file read/write operations)
    4. Is this handling user input? (Look for input parameters, form data)

    Only report vulnerabilities that are relevant to the code's actual context and functionality.
    For example:
    - Only report CORS vulnerabilities if this is web application code
    - Only report SQL injection if there are database operations
    - Only report path traversal if there are file system operations
    - Only report XSS if the code handles user input that gets rendered to users

    Your response must be in JSON format with these fields:
    {
      "vulnerable": boolean,
      "description": "Brief description of the vulnerability if found",
      "recommendation": "Specific recommendation to fix the issue",
      "lineNumber": number (the most relevant line number where the issue occurs),
      "context": "String describing the type of application/code analyzed"
    }`;

    const userPrompt = `${rule.llmPrompt}\n\nCode to analyze:\n${content}`;

    console.log('Sending request to OpenAI...');
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
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
    // Re-throw the error to prevent silent failures
    throw error;
  }
}