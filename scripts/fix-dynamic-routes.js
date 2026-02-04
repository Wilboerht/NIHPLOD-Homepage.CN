// 批量为 API 路由添加 dynamic = 'force-dynamic' 配置
// 解决 Vercel 构建时静态预渲染失败的问题

const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, '..', 'src', 'app', 'api');

function findRouteFiles(dir, files = []) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            findRouteFiles(fullPath, files);
        } else if (item === 'route.ts') {
            files.push(fullPath);
        }
    }
    return files;
}

const routeFiles = findRouteFiles(apiDir);
let updated = 0;
let skipped = 0;

for (const file of routeFiles) {
    const content = fs.readFileSync(file, 'utf8');

    // 检查是否已经包含 dynamic 导出
    if (/export\s+(const|var|let)\s+dynamic\s*=/.test(content)) {
        console.log(`Skipped (exists): ${file}`);
        skipped++;
        continue;
    }

    // 找到第一个 export function 或 export async function 的位置
    const exportMatch = content.match(/(export\s+(async\s+)?function)/);
    if (exportMatch) {
        const insertPos = content.indexOf(exportMatch[0]);
        const dynamicConfig = `// 强制动态渲染，禁止静态预渲染\nexport const dynamic = 'force-dynamic';\n\n`;
        const newContent = content.slice(0, insertPos) + dynamicConfig + content.slice(insertPos);

        fs.writeFileSync(file, newContent, 'utf8');
        console.log(`Updated: ${file}`);
        updated++;
    } else {
        console.log(`Cannot process: ${file}`);
    }
}

console.log(`\nDone! Updated ${updated} files, skipped ${skipped} files`);
