
const text = "Wide-Angle Perception: Equipped with 170° wide-angle cameras, it detects obstacles (including low-hanging branches and drop-offs) up to 10-15 meters away.";

function isAllEnglishOld(text) {
    return /^[a-zA-Z0-9\s.,!?;:'"\-()\[\]{}@#$%^&*+=<>/\\|`~]+$/.test(text);
}

function isAllEnglishNew(text) {
    const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;
    return !cjkRegex.test(text);
}

console.log("Text:", text);
console.log("Old check result:", isAllEnglishOld(text));
console.log("New check result:", isAllEnglishNew(text));


function isProbablyWord(text) {
    if (!text) return false;
    const trimmed = text.trim();
    if (/\s/.test(trimmed)) return false;
    return /^[a-zA-Z0-9\-\']+$/.test(trimmed);
}

console.log("--- Word Detection Heuristic Tests ---");
const testCases = [
    { text: "Information", expected: true },
    { text: "high-quality", expected: true },
    { text: "don't", expected: true },
    { text: "hello world", expected: false },
    { text: "This is a sentence.", expected: false },
    { text: "   trimmed-word   ", expected: true },
    { text: "12345", expected: true }
];

testCases.forEach(tc => {
    const result = isProbablyWord(tc.text);
    console.log(`Text: "${tc.text}" -> Result: ${result} (Expected: ${tc.expected}) ${result === tc.expected ? '✅' : '❌'}`);
});
