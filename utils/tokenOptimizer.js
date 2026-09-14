const crypto = require('crypto');

class TokenOptimizer {
  constructor() {
    this.cache = new Map(); // Hash -> { result, timestamp }
    this.stats = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalSavedTokens: 0,
      estimatedCostUsd: 0,
      cacheHits: 0
    };

    // 1M 토큰당 가격 (USD) - OpenAI, Gemini, Anthropic Claude 지원
    this.pricing = {
      // 1. Google Gemini
      'gemini-1.5-flash': { input: 0.075, output: 0.30 },
      'gemini-1.5-pro': { input: 1.25, output: 5.00 },

      // 2. OpenAI
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'gpt-4o': { input: 2.50, output: 10.00 },

      // 3. Anthropic Claude
      'claude-3-haiku': { input: 0.25, output: 1.25 },
      'claude-3-5-sonnet': { input: 3.00, output: 15.00 },

      'none': { input: 0, output: 0 }
    };
  }

  /**
   * 1. 텍스트 압축 및 사전 정제 (Context Compression)
   */
  compressContext(text) {
    if (!text || typeof text !== 'string') return { cleanedText: '', savedTokens: 0 };
    
    const originalLen = text.length;
    let cleaned = text
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ') // HTML 태그 제거
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ') // 연속된 공백 축소
      .trim();

    const newLen = cleaned.length;
    const estimatedSavedTokens = Math.max(0, Math.floor((originalLen - newLen) / 3));

    return {
      cleanedText: cleaned,
      originalLength: originalLen,
      compressedLength: newLen,
      savedTokens: estimatedSavedTokens,
      compressionRatio: originalLen > 0 ? Math.round(((originalLen - newLen) / originalLen) * 100) : 0
    };
  }

  /**
   * 2. Hash 기반 결과 캐싱 확인 (Cache Lookup)
   */
  checkCache(prompt) {
    const hash = crypto.createHash('sha256').update(prompt).digest('hex');
    if (this.cache.has(hash)) {
      this.stats.cacheHits++;
      const cached = this.cache.get(hash);
      const savedTokens = this.estimateTokenCount(prompt);
      this.stats.totalSavedTokens += savedTokens;
      return { hit: true, result: cached.result, savedTokens };
    }
    return { hit: false, hash };
  }

  saveCache(hash, result) {
    this.cache.set(hash, { result, timestamp: Date.now() });
  }

  /**
   * 3. 토큰 수 추정 및 비용 산정
   */
  estimateTokenCount(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 3.5);
  }

  recordUsage(model, promptText, responseText, savedTokensFromCompression = 0) {
    const pTokens = this.estimateTokenCount(promptText);
    const cTokens = this.estimateTokenCount(responseText);

    const modelPrices = this.pricing[model] || this.pricing['gemini-1.5-flash'];
    const cost = (pTokens * (modelPrices.input / 1000000)) + (cTokens * (modelPrices.output / 1000000));

    this.stats.totalPromptTokens += pTokens;
    this.stats.totalCompletionTokens += cTokens;
    this.stats.totalSavedTokens += savedTokensFromCompression;
    this.stats.estimatedCostUsd += cost;

    return {
      promptTokens: pTokens,
      completionTokens: cTokens,
      totalTokens: pTokens + cTokens,
      savedTokens: savedTokensFromCompression,
      costUsd: Number(cost.toFixed(6))
    };
  }

  getStats() {
    const totalTokens = this.stats.totalPromptTokens + this.stats.totalCompletionTokens;
    const totalUsedAndSaved = totalTokens + this.stats.totalSavedTokens;
    const savingsRatio = totalUsedAndSaved > 0 ? Math.round((this.stats.totalSavedTokens / totalUsedAndSaved) * 100) : 0;

    return {
      ...this.stats,
      totalTokens,
      savingsRatio,
      estimatedCostUsdFormatted: `$${this.stats.estimatedCostUsd.toFixed(4)}`
    };
  }
}

module.exports = new TokenOptimizer();
