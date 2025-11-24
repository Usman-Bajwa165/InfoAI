import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class AIService {
  private logger = new Logger(AIService.name);

  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  private apiKey = process.env.GEMINI_API_KEY;

  private userInstructions: Map<string, string> = new Map();

  private getUrl() {
    return `${this.baseUrl}/models/${this.model}:generateContent`;
  }

  setUserInstructions(userId: string, instructions: string | null) {
    if (!instructions) this.userInstructions.delete(userId);
    else this.userInstructions.set(userId, instructions);
  }

  private extractText(resp: any): string {
    try {
      const cands = resp?.data?.candidates;
      if (Array.isArray(cands) && cands.length > 0) {
        const cand = cands[0];
        if (typeof cand.content === 'string' && cand.content.trim()) return cand.content;
        if (typeof cand.output === 'string' && cand.output.trim()) return cand.output;

        const msg = cand?.message;
        if (msg?.content && Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (typeof item?.text === 'string' && item.text.trim()) return item.text;
          }
        }

        if (Array.isArray(cand.content?.parts)) {
          for (const p of cand.content.parts) {
            if (typeof p?.text === 'string' && p.text.trim()) return p.text;
          }
        }
      }
      if (typeof resp?.data?.text === 'string' && resp.data.text.trim()) return resp.data.text;
    } catch (e) {
      this.logger.warn('Failed to extract generated text', e);
    }
    return '';
  }

  private async callGemini(body: any) {
    const url = `${this.getUrl()}?key=${this.apiKey}`;
    this.logger.debug(`Calling Gemini model ${this.model} at ${url}`);
    return axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      timeout: 20000,
    });
  }

  /**
   * Get response with automatic retry on MAX_TOKENS (truncation).
   * Returns a string (may start with metadata when mode is used).
   */
  async getResponse(prompt: string, userId: string, mode?: string): Promise<string> {
    if (!this.apiKey) {
      const msg = 'Error: GEMINI_API_KEY is not set in environment';
      this.logger.error(msg);
      return msg;
    }

    const isMode = !!mode;

    // sensible defaults — mode gets more tokens/creativity
    const temperature = isMode ? 1.2 : 0.7;
    const initialMax = isMode ? 1200 : 700; // increased mode default to reduce truncation
    const retryCap = 3600; // safe upper limit for retry

    const persisted = this.userInstructions.get(userId);

    let fullPrompt = isMode
      ? `Mode: ${mode}\nPlease answer in a straightforward, simple, and clear way appropriate to this mode.\nUser: ${prompt}`
      : `Answer simply and clearly:\nUser: ${prompt}`;

    if (persisted) fullPrompt += `\nUser instructions: ${persisted}`;

    // metadata header (helps client and debugging)
    const metaHeader = isMode
      ? `Answer constrained to mode: ${mode} (temperature: ${temperature}, maxOutputTokens: ${initialMax})\n\n`
      : '';

    // prepare body
    const makeBody = (maxOutputTokens: number) => ({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature, maxOutputTokens },
    });

    // try primary call
    try {
      const resp = await this.callGemini(makeBody(initialMax));
      const text = this.extractText(resp);

      // check finishReason — if it hit MAX_TOKENS or returned empty, attempt one retry with bigger budget
      const finishReason = resp?.data?.candidates?.[0]?.finishReason;
      if ((!text || text.trim() === '') || finishReason === 'MAX_TOKENS') {
        this.logger.warn(
          'AI returned no visible text or hit MAX_TOKENS. finishReason=' +
            String(finishReason) +
            ' — attempting one retry with higher maxOutputTokens'
        );

        // compute new target (attempt), but keep within retryCap
        const increased = Math.min(initialMax * 3, retryCap);
        if (increased > initialMax) {
          const resp2 = await this.callGemini(makeBody(increased));
          const text2 = this.extractText(resp2);
          const finish2 = resp2?.data?.candidates?.[0]?.finishReason;

          if (text2 && text2.trim()) {
            // include updated meta that we retried with larger max
            const retryMeta = isMode
              ? `Answer constrained to mode: ${mode} (temperature: ${temperature}, maxOutputTokens: ${increased})\n\n`
              : '';
            return retryMeta + text2;
          } else {
            // still empty after retry — log snippet and return friendly error
            const snippet = JSON.stringify(resp2?.data).slice(0, 1000);
            this.logger.warn('Retry also returned no text. Response (snippet): ' + snippet);
            return 'Error: AI returned empty content (truncated). Try again or increase token budget.';
          }
        } else {
          return 'Error: AI likely truncated output; no larger budget available.';
        }
      }

      // success: return with meta header for mode or just text for general
      return metaHeader + text;
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      const message = err?.message || 'Unknown error';
      this.logger.error('AI API call failed', { status, data, message });

      if (status && data) {
        const serverMsg = typeof data === 'string' ? data : JSON.stringify(data).slice(0, 500);
        return `Error: AI API failed (${status}) - ${serverMsg}`;
      }
      return `Error: AI API call failed - ${message}`;
    }
  }

  async listModels(): Promise<any> {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY is not set');
    const url = `${this.baseUrl}/models?key=${this.apiKey}`;
    const resp = await axios.get(url, { headers: { 'x-goog-api-key': this.apiKey } });
    return resp.data;
  }
}
