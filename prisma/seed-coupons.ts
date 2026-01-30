
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

async function main() {
    console.log('Start seeding coupons...')

    // 1. 新客立减券 (50元)
    const c1 = await prisma.coupon.upsert({
        where: { code: 'WELCOME2026' },
        update: {},
        create: {
            code: 'WELCOME2026',
            name: '新客立减券',
            type: 'DISCOUNT_AMOUNT',
            value: 50.00,
            minAmount: 200.00, // 满200可用
            daysValid: 30,     // 30天有效
            totalLimit: 1000,
            userLimit: 1,
            startDate: new Date(),
            endDate: new Date('2026-12-31'),
        }
    });
    console.log('Upserted WELCOME2026:', c1.name);

    // 2. VIP 9折卡
    const c2 = await prisma.coupon.upsert({
        where: { code: 'VIP9' },
        update: {},
        create: {
            code: 'VIP9',
            name: 'VIP 9折卡',
            type: 'DISCOUNT_PERCENT',
            value: 0.9, // 9折 = 0.9。 计算方式：total * (1 - 0.9) = 优惠 10%
            minAmount: 0,      // 无门槛
            daysValid: 365,
            userLimit: 1,
        }
    });
    console.log('Upserted VIP9:', c2.name);

    // 3. 通用10元券 (无码，用户列表点击领取)
    // 因为没有 unique code，我们只能 create or findFirst
    const c3Name = '无门槛10元福利';
    let c3 = await prisma.coupon.findFirst({ where: { name: c3Name } });
    if (!c3) {
        c3 = await prisma.coupon.create({
            data: {
                name: c3Name,
                type: 'DISCOUNT_AMOUNT',
                value: 10.00,
                minAmount: 0,
                daysValid: 7,
                userLimit: 1,
                code: null // 点击领取
            }
        });
        console.log('Created:', c3.name);
    } else {
        console.log('Exists:', c3.name);
    }

    console.log('Seeding finished.')
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
