// QR encoder for the certificate page.
//
// PROVENANCE: this is compiled output recovered from a stale dist/qr.js in the
// widget package. Its TypeScript source (src/qr.ts) was deleted and was never
// committed, and the sourcemap carries no sourcesContent, so the original is
// gone. It lives here because the demo certificate page is its only consumer —
// the widget itself never imported it, so it does not belong in a published SDK.
//
// It was only ever working by accident: tsc does not prune dist/, so the file
// survived locally after its source was removed. Any clean build drops it, which
// includes every Vercel deploy, so the certificate QR was already silently
// failing in production.
//
// Treat this as vendored third-party code: do not edit it. If the QR needs to
// change, write a fresh implementation with real source.

// Minimal, dependency-free QR Code encoder (byte mode, ECC level M, versions
// 1-10). Emits an SVG string suitable for embedding in the checkout widget so a
// buyer can scan the hosted-payment address with a phone wallet. No external
// libraries — the widget ships under a strict CSP that blocks CDN scripts.
//
// Implements the relevant parts of ISO/IEC 18004: byte-mode data encoding,
// Reed-Solomon error correction over GF(256), matrix construction (finder,
// timing, alignment, format/version info), all eight data masks with penalty
// scoring, and best-mask selection.
// ── Galois field GF(256) with QR primitive polynomial 0x11D ──────────────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        LOG[x] = i;
        x <<= 1;
        if (x & 0x100)
            x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++)
        EXP[i] = EXP[i - 255];
})();
function gfMul(a, b) {
    if (a === 0 || b === 0)
        return 0;
    return EXP[LOG[a] + LOG[b]];
}
// Polynomials are stored high-degree-first (coeff[0] is the leading term), the
// same convention as the reference implementation, so the division below is a
// direct polynomial long division.
function gfMulPoly(p1, p2) {
    const coeff = new Array(p1.length + p2.length - 1).fill(0);
    for (let i = 0; i < p1.length; i++)
        for (let j = 0; j < p2.length; j++)
            coeff[i + j] ^= gfMul(p1[i], p2[j]);
    return coeff;
}
function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++)
        poly = gfMulPoly(poly, [1, EXP[i]]);
    return poly;
}
function rsEncode(data, ecLen) {
    const gen = rsGeneratorPoly(ecLen);
    let result = data.concat(new Array(ecLen).fill(0));
    while (result.length - gen.length >= 0) {
        const lead = result[0];
        if (lead !== 0)
            for (let i = 0; i < gen.length; i++)
                result[i] ^= gfMul(gen[i], lead);
        let offset = 0;
        while (offset < result.length && result[offset] === 0)
            offset++;
        result = result.slice(offset);
    }
    // Left-pad the remainder to exactly ecLen coefficients.
    if (result.length < ecLen) {
        const buff = new Array(ecLen).fill(0);
        for (let i = 0; i < result.length; i++)
            buff[ecLen - result.length + i] = result[i];
        return buff;
    }
    return result;
}
const VERSIONS = {
    1: { ec: 10, blocks: [1, 16, 0, 0], totalData: 16 },
    2: { ec: 16, blocks: [1, 28, 0, 0], totalData: 28 },
    3: { ec: 26, blocks: [1, 44, 0, 0], totalData: 44 },
    4: { ec: 18, blocks: [2, 32, 0, 0], totalData: 64 },
    5: { ec: 24, blocks: [2, 43, 0, 0], totalData: 86 },
    6: { ec: 16, blocks: [4, 27, 0, 0], totalData: 108 },
    7: { ec: 18, blocks: [4, 31, 0, 0], totalData: 124 },
    8: { ec: 22, blocks: [2, 38, 2, 39], totalData: 154 },
    9: { ec: 22, blocks: [3, 36, 2, 37], totalData: 182 },
    10: { ec: 26, blocks: [4, 43, 1, 44], totalData: 216 },
};
// Alignment pattern center coordinates per version (empty for version 1).
const ALIGN_POS = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};
function charCountBits(version) {
    return version <= 9 ? 8 : 16;
}
// ── Bit buffer ───────────────────────────────────────────────────────────────
class BitBuffer {
    bits = [];
    put(value, length) {
        for (let i = length - 1; i >= 0; i--)
            this.bits.push((value >>> i) & 1);
    }
}
function chooseVersion(byteLen) {
    for (let v = 1; v <= 10; v++) {
        const ccBits = charCountBits(v);
        const capacity = VERSIONS[v].totalData * 8;
        if (4 + ccBits + byteLen * 8 <= capacity)
            return v;
    }
    throw new Error("QR payload too large for supported versions (max 10).");
}
function buildDataCodewords(bytes, version) {
    const spec = VERSIONS[version];
    const buf = new BitBuffer();
    buf.put(0b0100, 4); // byte mode
    buf.put(bytes.length, charCountBits(version));
    for (const b of bytes)
        buf.put(b, 8);
    const capacityBits = spec.totalData * 8;
    // Terminator (up to 4 zero bits).
    for (let i = 0; i < 4 && buf.bits.length < capacityBits; i++)
        buf.bits.push(0);
    // Pad to byte boundary.
    while (buf.bits.length % 8 !== 0)
        buf.bits.push(0);
    // Pad bytes 0xEC / 0x11 alternating.
    const pads = [0xec, 0x11];
    let p = 0;
    const codewords = [];
    for (let i = 0; i < buf.bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++)
            byte = (byte << 1) | buf.bits[i + j];
        codewords.push(byte);
    }
    while (codewords.length < spec.totalData)
        codewords.push(pads[p++ % 2]);
    return codewords;
}
// Split into blocks, compute EC per block, then interleave data + EC.
function interleave(dataCodewords, version) {
    const spec = VERSIONS[version];
    const [n1, d1, n2, d2] = spec.blocks;
    const blocks = [];
    let offset = 0;
    const pushBlocks = (count, dataLen) => {
        for (let i = 0; i < count; i++) {
            const data = dataCodewords.slice(offset, offset + dataLen);
            offset += dataLen;
            blocks.push({ data, ec: rsEncode(data, spec.ec) });
        }
    };
    pushBlocks(n1, d1);
    if (n2)
        pushBlocks(n2, d2);
    const maxData = Math.max(d1, d2 || 0);
    const result = [];
    for (let i = 0; i < maxData; i++)
        for (const b of blocks)
            if (i < b.data.length)
                result.push(b.data[i]);
    for (let i = 0; i < spec.ec; i++)
        for (const b of blocks)
            result.push(b.ec[i]);
    return result;
}
function newMatrix(size) {
    const modules = [];
    for (let r = 0; r < size; r++)
        modules.push(new Array(size).fill(null));
    return { size, modules };
}
function placeFinder(m, row, col) {
    for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
            const rr = row + r;
            const cc = col + c;
            if (rr < 0 || rr >= m.size || cc < 0 || cc >= m.size)
                continue;
            const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
            const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
            m.modules[rr][cc] = inRing || inCore;
        }
    }
}
function placeAlignment(m, version) {
    const positions = ALIGN_POS[version];
    for (const r of positions) {
        for (const c of positions) {
            // Skip overlaps with finder patterns.
            if ((r === 6 && c === 6) || (r === 6 && c === positions[positions.length - 1]) || (r === positions[positions.length - 1] && c === 6))
                continue;
            if (m.modules[r][c] !== null)
                continue;
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const ring = Math.max(Math.abs(dr), Math.abs(dc));
                    m.modules[r + dr][c + dc] = ring !== 1;
                }
            }
        }
    }
}
function placeTiming(m) {
    for (let i = 8; i < m.size - 8; i++) {
        const val = i % 2 === 0;
        if (m.modules[6][i] === null)
            m.modules[6][i] = val;
        if (m.modules[i][6] === null)
            m.modules[i][6] = val;
    }
}
function reserveFormatAreas(m) {
    const reserved = [];
    for (let r = 0; r < m.size; r++)
        reserved.push(new Array(m.size).fill(false));
    const mark = (r, c) => { if (r >= 0 && r < m.size && c >= 0 && c < m.size)
        reserved[r][c] = true; };
    for (let i = 0; i < 9; i++) {
        mark(8, i);
        mark(i, 8);
    }
    for (let i = 0; i < 8; i++) {
        mark(8, m.size - 1 - i);
        mark(m.size - 1 - i, 8);
    }
    mark(m.size - 8, 8);
    return reserved;
}
const FORMAT_MASK = 0b101010000010010;
function formatBits(ecLevelBits, maskId) {
    const data = (ecLevelBits << 3) | maskId;
    let rem = data;
    for (let i = 0; i < 10; i++)
        rem = (rem << 1) ^ ((rem >>> 9) & 1 ? 0b10100110111 : 0);
    return ((data << 10) | rem) ^ FORMAT_MASK;
}
function placeFormat(m, maskId) {
    // ECC level M → indicator bits 00. Bit placement mirrors the reference
    // convention exactly (bit 0 nearest the far ends, bit 14 at (8,0)/(size-1,8)).
    const bits = formatBits(0b00, maskId);
    const size = m.size;
    for (let i = 0; i < 15; i++) {
        const mod = ((bits >>> i) & 1) === 1;
        // vertical strip (column 8)
        if (i < 6)
            m.modules[i][8] = mod;
        else if (i < 8)
            m.modules[i + 1][8] = mod;
        else
            m.modules[size - 15 + i][8] = mod;
        // horizontal strip (row 8)
        if (i < 8)
            m.modules[8][size - i - 1] = mod;
        else if (i < 9)
            m.modules[8][15 - i - 1 + 1] = mod;
        else
            m.modules[8][15 - i - 1] = mod;
    }
    m.modules[size - 8][8] = true; // fixed dark module
}
function placeVersionInfo(m, version) {
    if (version < 7)
        return;
    let rem = version;
    for (let i = 0; i < 12; i++)
        rem = (rem << 1) ^ ((rem >>> 11) & 1 ? 0b1111100100101 : 0);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
        const bit = ((bits >>> i) & 1) === 1;
        const a = Math.floor(i / 3);
        const b = i % 3;
        m.modules[a][m.size - 11 + b] = bit;
        m.modules[m.size - 11 + b][a] = bit;
    }
}
function maskFn(id, r, c) {
    switch (id) {
        case 0: return (r + c) % 2 === 0;
        case 1: return r % 2 === 0;
        case 2: return c % 3 === 0;
        case 3: return (r + c) % 3 === 0;
        case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
        case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
        case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
        default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
}
function placeData(m, reserved, codewords) {
    let bitIndex = 0;
    const totalBits = codewords.length * 8;
    const bitAt = (i) => (i < totalBits ? (codewords[i >> 3] >>> (7 - (i & 7))) & 1 : 0);
    let dirUp = true;
    for (let col = m.size - 1; col > 0; col -= 2) {
        if (col === 6)
            col = 5; // skip vertical timing column
        for (let i = 0; i < m.size; i++) {
            const row = dirUp ? m.size - 1 - i : i;
            for (let j = 0; j < 2; j++) {
                const c = col - j;
                if (m.modules[row][c] !== null || reserved[row][c])
                    continue;
                m.modules[row][c] = bitAt(bitIndex) === 1;
                bitIndex++;
            }
        }
        dirUp = !dirUp;
    }
}
function applyMask(m, reserved, maskId) {
    for (let r = 0; r < m.size; r++) {
        for (let c = 0; c < m.size; c++) {
            if (reserved[r][c])
                continue;
            if (isFunctionModule(m, r, c))
                continue;
            if (maskFn(maskId, r, c))
                m.modules[r][c] = !m.modules[r][c];
        }
    }
}
// Function modules (finder, timing, alignment, dark) must not be masked. We
// detect them via a parallel "function" map built during construction.
let FUNC_MAP = [];
function isFunctionModule(_m, r, c) {
    return FUNC_MAP[r]?.[c] ?? false;
}
function penalty(m) {
    const n = m.size;
    const at = (r, c) => (m.modules[r][c] ? 1 : 0);
    let score = 0;
    // Rule 1: runs of 5+ same-color in row/col.
    for (let r = 0; r < n; r++) {
        let runColor = -1, runLen = 0;
        for (let c = 0; c < n; c++) {
            const v = at(r, c);
            if (v === runColor) {
                runLen++;
                if (runLen === 5)
                    score += 3;
                else if (runLen > 5)
                    score += 1;
            }
            else {
                runColor = v;
                runLen = 1;
            }
        }
    }
    for (let c = 0; c < n; c++) {
        let runColor = -1, runLen = 0;
        for (let r = 0; r < n; r++) {
            const v = at(r, c);
            if (v === runColor) {
                runLen++;
                if (runLen === 5)
                    score += 3;
                else if (runLen > 5)
                    score += 1;
            }
            else {
                runColor = v;
                runLen = 1;
            }
        }
    }
    // Rule 2: 2x2 blocks.
    for (let r = 0; r < n - 1; r++)
        for (let c = 0; c < n - 1; c++) {
            const v = at(r, c);
            if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1))
                score += 3;
        }
    // Rule 3: finder-like 1:1:3:1:1 patterns.
    const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const match = (arr, seq) => seq.every((v, i) => arr[i] === v);
    for (let r = 0; r < n; r++)
        for (let c = 0; c <= n - 11; c++) {
            const row = [];
            for (let k = 0; k < 11; k++)
                row.push(at(r, c + k));
            if (match(row, pat1) || match(row, pat2))
                score += 40;
        }
    for (let c = 0; c < n; c++)
        for (let r = 0; r <= n - 11; r++) {
            const col = [];
            for (let k = 0; k < 11; k++)
                col.push(at(r + k, c));
            if (match(col, pat1) || match(col, pat2))
                score += 40;
        }
    // Rule 4: dark/light balance.
    let dark = 0;
    for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
            dark += at(r, c);
    const percent = (dark * 100) / (n * n);
    const prev = Math.floor(percent / 5) * 5;
    score += Math.min(Math.abs(prev - 50), Math.abs(prev + 5 - 50)) / 5 * 10;
    return score;
}
export function encodeQR(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    const version = chooseVersion(bytes.length);
    const dataCw = buildDataCodewords(bytes, version);
    const finalCw = interleave(dataCw, version);
    const size = 17 + version * 4;
    // Build function-module map + base matrix.
    const base = newMatrix(size);
    placeFinder(base, 0, 0);
    placeFinder(base, 0, size - 7);
    placeFinder(base, size - 7, 0);
    placeAlignment(base, version);
    placeTiming(base);
    // dark module
    base.modules[size - 8][8] = true;
    // Record function map (everything currently non-null + reserved format/version).
    const reserved = reserveFormatAreas(base);
    FUNC_MAP = [];
    for (let r = 0; r < size; r++) {
        FUNC_MAP.push(new Array(size).fill(false));
        for (let c = 0; c < size; c++)
            if (base.modules[r][c] !== null)
                FUNC_MAP[r][c] = true;
    }
    // Version info areas are also function modules.
    if (version >= 7) {
        for (let i = 0; i < 6; i++)
            for (let j = 0; j < 3; j++) {
                FUNC_MAP[i][size - 11 + j] = true;
                FUNC_MAP[size - 11 + j][i] = true;
            }
    }
    placeData(base, orMap(reserved, FUNC_MAP), finalCw);
    // Try all masks; pick lowest penalty.
    let best = null;
    let bestScore = Infinity;
    let bestMask = 0;
    for (let mask = 0; mask < 8; mask++) {
        const candidate = cloneMatrix(base);
        applyMask(candidate, reserved, mask);
        placeFormat(candidate, mask);
        placeVersionInfo(candidate, version);
        const score = penalty(candidate);
        if (score < bestScore) {
            bestScore = score;
            best = candidate;
            bestMask = mask;
        }
    }
    void bestMask;
    const out = [];
    const chosen = best;
    for (let r = 0; r < size; r++) {
        out.push([]);
        for (let c = 0; c < size; c++)
            out[r].push(chosen.modules[r][c] === true);
    }
    return { size, modules: out };
}
function orMap(a, b) {
    const out = [];
    for (let r = 0; r < a.length; r++) {
        out.push([]);
        for (let c = 0; c < a.length; c++)
            out[r].push(a[r][c] || b[r][c]);
    }
    return out;
}
function cloneMatrix(m) {
    return { size: m.size, modules: m.modules.map((row) => row.slice()) };
}
// ── SVG rendering ────────────────────────────────────────────────────────────
export function qrToSVG(text, options = {}) {
    const { size, modules } = encodeQR(text);
    const quiet = options.quiet ?? 4;
    const dim = size + quiet * 2;
    let path = "";
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (modules[r][c])
                path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="Payment QR code"><rect width="${dim}" height="${dim}" fill="var(--bify-qr-bg,#fff)"/><path d="${path}" fill="var(--bify-qr-fg,#000)"/></svg>`;
}
//# sourceMappingURL=qr.js.map