export class OcrTokenNormalizer {
    static MAX_BASELINE_DIFF_PX = 12;
    static MAX_HORIZONTAL_GAP_PX = 45;
    /**
     * Scans raw word-level OCR tokens and groups spatially adjacent tokens into normalized line-level text regions.
     */
    normalizeTokens(rawTokens) {
        if (!rawTokens || rawTokens.length === 0)
            return [];
        const normalizedRegions = [];
        const usedIndices = new Set();
        let regionIdCounter = 1;
        for (let i = 0; i < rawTokens.length; i++) {
            if (usedIndices.has(i))
                continue;
            const currentToken = rawTokens[i];
            const groupTokens = [currentToken];
            usedIndices.add(i);
            let lastToken = currentToken;
            // Scan subsequent tokens for horizontal alignment on the same line
            for (let j = i + 1; j < rawTokens.length; j++) {
                if (usedIndices.has(j))
                    continue;
                const candidateToken = rawTokens[j];
                // 1. Baseline vertical alignment check
                const dy = Math.abs(candidateToken.bbox.y - lastToken.bbox.y);
                if (dy > OcrTokenNormalizer.MAX_BASELINE_DIFF_PX)
                    continue;
                // 2. Horizontal gap check
                const dx = candidateToken.bbox.x - (lastToken.bbox.x + lastToken.bbox.width);
                if (dx >= -5 && dx <= OcrTokenNormalizer.MAX_HORIZONTAL_GAP_PX) {
                    groupTokens.push(candidateToken);
                    usedIndices.add(j);
                    lastToken = candidateToken;
                }
            }
            // Compute combined bounding box and text
            const groupedText = groupTokens.map(t => t.text.trim()).join(' ');
            const combinedBBox = this.computeCombinedBBox(groupTokens);
            const avgConfidence = Math.round((groupTokens.reduce((sum, t) => sum + t.confidence, 0) / groupTokens.length) * 100) / 100;
            normalizedRegions.push({
                id: `norm_ocr_${Date.now()}_${regionIdCounter++}`,
                groupedText,
                combinedBBox,
                avgConfidence,
                sourceTokens: groupTokens
            });
        }
        return normalizedRegions;
    }
    /**
     * Computes the bounding box covering all tokens in a group.
     * x = min(token.x), y = min(token.y), width = max(x + width) - x, height = max(y + height) - y
     */
    computeCombinedBBox(tokens) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const t of tokens) {
            if (t.bbox.x < minX)
                minX = t.bbox.x;
            if (t.bbox.y < minY)
                minY = t.bbox.y;
            if (t.bbox.x + t.bbox.width > maxX)
                maxX = t.bbox.x + t.bbox.width;
            if (t.bbox.y + t.bbox.height > maxY)
                maxY = t.bbox.y + t.bbox.height;
        }
        return {
            x: Math.max(0, minX),
            y: Math.max(0, minY),
            width: Math.max(0, maxX - minX),
            height: Math.max(0, maxY - minY)
        };
    }
}
