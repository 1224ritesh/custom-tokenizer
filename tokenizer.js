/**
 * Custom BPE (Byte Pair Encoding) Tokenizer
 * Works in both Node.js and Browser environments
 */
class BPETokenizer {
    constructor() {
        this.vocab = new Map();
        this.merges = [];
        this.specialTokens = new Map();
        this.vocabSize = 0;
        
        // Add special tokens
        this.addSpecialToken('<PAD>', 0);
        this.addSpecialToken('<UNK>', 1);
        this.addSpecialToken('<BOS>', 2);
        this.addSpecialToken('<EOS>', 3);
    }

    addSpecialToken(token, id = null) {
        if (id === null) {
            id = this.vocabSize;
        }
        this.specialTokens.set(token, id);
        this.vocab.set(token, id);
        this.vocabSize = Math.max(this.vocabSize, id + 1);
    }

    getCharFrequency(text) {
        const freq = new Map();
        for (const char of text) {
            freq.set(char, (freq.get(char) || 0) + 1);
        }
        return freq;
    }

    getWordFrequency(text) {
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 0);
        
        const freq = new Map();
        for (const word of words) {
            const wordWithEnd = word + '</w>';
            freq.set(wordWithEnd, (freq.get(wordWithEnd) || 0) + 1);
        }
        return freq;
    }

    getPairs(word) {
        const pairs = new Set();
        const chars = word.split(' ');
        
        for (let i = 0; i < chars.length - 1; i++) {
            pairs.add([chars[i], chars[i + 1]]);
        }
        return pairs;
    }

    /**
     * Train the tokenizer on text corpus
     * @param {string} corpus - Training text
     * @param {number} vocabSize - Target vocabulary size
     * @param {boolean} verbose - Show training progress
     */
    train(corpus, vocabSize = 1000, verbose = false) {
        if (verbose) console.log('🔧 Training BPE tokenizer...');
        
        // Initialize with characters
        const charFreq = this.getCharFrequency(corpus);
        for (const [char, freq] of charFreq) {
            if (!this.vocab.has(char)) {
                this.vocab.set(char, this.vocabSize++);
            }
        }

        // Get word frequencies
        const wordFreq = this.getWordFrequency(corpus);
        
        // Convert to character sequences
        const wordTokens = new Map();
        for (const [word, freq] of wordFreq) {
            wordTokens.set(word.split('').join(' '), freq);
        }

        // BPE training loop
        while (this.vocabSize < vocabSize) {
            const pairs = new Map();
            
            // Count all pairs
            for (const [word, freq] of wordTokens) {
                const wordPairs = this.getPairs(word);
                for (const pair of wordPairs) {
                    const pairStr = pair.join('');
                    pairs.set(pairStr, (pairs.get(pairStr) || 0) + freq);
                }
            }

            if (pairs.size === 0) break;

            // Find most frequent pair
            let bestPair = null;
            let maxCount = 0;
            for (const [pair, count] of pairs) {
                if (count > maxCount) {
                    maxCount = count;
                    bestPair = pair;
                }
            }

            if (!bestPair) break;

            // Add merge rule
            const [first, second] = [bestPair.slice(0, bestPair.length/2), bestPair.slice(bestPair.length/2)];
            this.merges.push([first, second]);
            
            // Add to vocabulary
            this.vocab.set(bestPair, this.vocabSize++);

            // Update word tokens
            const newWordTokens = new Map();
            for (const [word, freq] of wordTokens) {
                const newWord = word.replace(new RegExp(`${first} ${second}`, 'g'), bestPair);
                newWordTokens.set(newWord, freq);
            }
            wordTokens.clear();
            for (const [word, freq] of newWordTokens) {
                wordTokens.set(word, freq);
            }

            if (verbose && this.vocabSize % 100 === 0) {
                console.log(`  Vocab size: ${this.vocabSize}, Latest: ${first} + ${second} = ${bestPair}`);
            }
        }

        if (verbose) {
            console.log(`✅ Training complete! Vocabulary: ${this.vocabSize} tokens, ${this.merges.length} merges`);
        }
    }

    applyBPE(word) {
        if (word.length <= 1) return [word];
        
        let tokens = word.split('');
        
        for (const [first, second] of this.merges) {
            const newTokens = [];
            let i = 0;
            
            while (i < tokens.length) {
                if (i < tokens.length - 1 && tokens[i] === first && tokens[i + 1] === second) {
                    newTokens.push(first + second);
                    i += 2;
                } else {
                    newTokens.push(tokens[i]);
                    i += 1;
                }
            }
            tokens = newTokens;
        }
        
        return tokens;
    }

    /**
     * Encode text to token IDs
     * @param {string} text - Input text
     * @param {boolean} addSpecialTokens - Add BOS/EOS tokens
     * @returns {number[]} Array of token IDs
     */
    encode(text, addSpecialTokens = true) {
        const tokens = [];
        
        if (addSpecialTokens) {
            tokens.push(this.specialTokens.get('<BOS>'));
        }

        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 0);

        for (const word of words) {
            const wordWithEnd = word + '</w>';
            const bpeTokens = this.applyBPE(wordWithEnd);
            
            for (const token of bpeTokens) {
                const tokenId = this.vocab.get(token);
                if (tokenId !== undefined) {
                    tokens.push(tokenId);
                } else {
                    tokens.push(this.specialTokens.get('<UNK>'));
                }
            }
        }

        if (addSpecialTokens) {
            tokens.push(this.specialTokens.get('<EOS>'));
        }

        return tokens;
    }

    /**
     * Decode token IDs to text
     * @param {number[]} tokenIds - Array of token IDs
     * @param {boolean} skipSpecialTokens - Skip special tokens in output
     * @returns {string} Decoded text
     */
    decode(tokenIds, skipSpecialTokens = true) {
        const reverseVocab = new Map();
        for (const [token, id] of this.vocab) {
            reverseVocab.set(id, token);
        }

        const tokens = [];
        for (const id of tokenIds) {
            const token = reverseVocab.get(id);
            if (token) {
                if (skipSpecialTokens && this.specialTokens.has(token)) {
                    continue;
                }
                tokens.push(token);
            }
        }

        return tokens.join('').replace(/<\/w>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    getVocabStats() {
        return {
            totalVocabSize: this.vocabSize,
            specialTokens: this.specialTokens.size,
            regularTokens: this.vocabSize - this.specialTokens.size,
            mergeRules: this.merges.length
        };
    }

    toJSON() {
        return {
            vocab: Object.fromEntries(this.vocab),
            merges: this.merges,
            specialTokens: Object.fromEntries(this.specialTokens),
            vocabSize: this.vocabSize
        };
    }

    fromJSON(data) {
        this.vocab = new Map(Object.entries(data.vocab).map(([k, v]) => [k, parseInt(v)]));
        this.merges = data.merges;
        this.specialTokens = new Map(Object.entries(data.specialTokens).map(([k, v]) => [k, parseInt(v)]));
        this.vocabSize = data.vocabSize;
    }
}

// Universal export - works in Node.js and browsers
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BPETokenizer;
} else if (typeof window !== 'undefined') {
    window.BPETokenizer = BPETokenizer;
}