import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.page.delete({
      where: { slug: 'lottery' }
    });
    console.log('Successfully deleted lottery page:', result.id);
  } catch (error) {
    if (error.code === 'P2025') {
      console.log('Lottery page does not exist in database');
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();

