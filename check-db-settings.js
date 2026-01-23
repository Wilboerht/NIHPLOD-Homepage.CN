const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();
    try {
        const setting = await prisma.setting.findUnique({
            where: { key: 'advisor_ai_settings' }
        });

        if (setting) {
            console.log('=== 数据库中的 AI 设置 ===');
            const value = setting.value;
            console.log('Provider:', value.provider || '未设置');
            console.log('Vision Provider:', value.visionProvider || '未设置');
            console.log('Model:', value.model || '未设置');
            console.log('Vision Model:', value.visionModel || '未设置');
            console.log('\n=== API Keys 配置状态 ===');
            const apiKeys = value.apiKeys || {};
            console.log('OpenAI Key:', apiKeys.openai ? `已配置 (长度: ${apiKeys.openai.length})` : '❌ 未配置');
            console.log('DeepSeek Key:', apiKeys.deepseek ? `已配置 (长度: ${apiKeys.deepseek.length})` : '❌ 未配置');
            console.log('Qwen Key:', apiKeys.qwen ? `已配置 (长度: ${apiKeys.qwen.length})` : '❌ 未配置');
            console.log('Anthropic Key:', apiKeys.anthropic ? `已配置 (长度: ${apiKeys.anthropic.length})` : '❌ 未配置');
        } else {
            console.log('❌ 数据库中没有找到 advisor_ai_settings 记录');
            console.log('请先在管理后台配置 AI 设置');
        }
    } catch (error) {
        console.error('查询失败:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
