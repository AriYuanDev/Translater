
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

const cjkText = "Hello 世界";
console.log("CJK Text:", cjkText);
console.log("New check CJK result (should be false):", isAllEnglishNew(cjkText));
