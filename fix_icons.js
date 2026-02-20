const fs = require('fs');
const file = 'c:/Users/hongk/Desktop/nihplod.cn - master/src/app/(website)/guide/RitualContent.tsx';
let content = fs.readFileSync(file, 'utf8');

const startPhrase = 'export const PRODUCT_ICONS: Record<string, React.ReactNode> = {';
const startIndex = content.indexOf(startPhrase);
let endIndex = -1;
if (startIndex !== -1) {
    let openBraces = 0;
    for (let i = startIndex + startPhrase.length - 1; i < content.length; i++) {
        if (content[i] === '{') openBraces++;
        else if (content[i] === '}') {
            openBraces--;
            if (openBraces === 0) {
                endIndex = i + 1;
                break;
            }
        }
    }
}

if (startIndex === -1 || endIndex === -1) {
    console.log('Could not find block');
    process.exit(1);
}

const block = content.substring(startIndex, endIndex + 1);

let newBlock = block.replace(/id="([^"]+)"/g, 'id={`$1_${idSuffix}`}')
    .replace(/="url\(#([^)]+)\)"/g, '={`url(#$1_${idSuffix})`}');

newBlock = `// 动态获取产品图标，确保 SVG 内部 id 不重复以避免渐变失效问题
export const getProductIcon = (name: string, idSuffix: string = "") => {
  const icons: Record<string, React.ReactNode> = ${newBlock.replace('export const PRODUCT_ICONS: Record<string, React.ReactNode> = ', '')}
  return icons[name] || null;
};`

content = content.substring(0, startIndex) + newBlock + content.substring(endIndex + (content[endIndex] === ';' ? 1 : 0));

let occurrences = [];
let cursor = 0;
while (true) {
    let idx = content.indexOf('PRODUCT_ICONS[cleanName]', cursor);
    if (idx === -1) break;
    occurrences.push(idx);
    cursor = idx + 1;
}

if (occurrences.length === 2) {
    let part1 = content.substring(0, occurrences[0]);
    let part2 = content.substring(occurrences[0] + 24, occurrences[1]);
    let part3 = content.substring(occurrences[1] + 24);
    content = part1 + 'getProductIcon(cleanName, "mobile")' + part2 + 'getProductIcon(cleanName, "pc")' + part3;
} else if (occurrences.length === 0 && content.includes('getProductIcon')) {
    console.log("Already replaced usage.");
} else {
    console.log("Found " + occurrences.length + " occurrences. Manual check needed.");
}

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed SVGs and logic');
