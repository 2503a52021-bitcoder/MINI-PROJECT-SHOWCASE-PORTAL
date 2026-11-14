require('dotenv').config();
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'mini_project_showcase';

async function seed() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const existingCollections = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name)
    );

    for (const name of ['users', 'projects', 'categories']) {
      if (!existingCollections.has(name)) await db.createCollection(name);
    }

    const users = db.collection('users');
    const demoUsers = [
      { name: 'Rahul Student', email: 'rahul@student.edu', password: 'password123', role: 'student', batch: '2023-2027' },
      { name: 'Sharma Faculty', email: 'sharma@faculty.edu', password: 'faculty123', role: 'faculty', department: 'Computer Science' }
    ];

    for (const { password, ...user } of demoUsers) {
      if (!await users.findOne({ email: user.email })) {
        await users.insertOne({ ...user, password: await bcrypt.hash(password, 10), createdAt: new Date() });
        console.log(`Created demo user: ${user.email}`);
      }
    }

    const categories = db.collection('categories');
    const defaults = [
      { code: 'WEB', name: 'Web Development', description: 'Web applications and platforms', icon: '🌐' },
      { code: 'MOBILE', name: 'Mobile Apps', description: 'Mobile application projects', icon: '📱' },
      { code: 'AI', name: 'Artificial Intelligence', description: 'AI and machine learning projects', icon: '🤖' },
      { code: 'IOT', name: 'Internet of Things', description: 'Connected device projects', icon: '🔌' }
    ];

    for (const category of defaults) {
      const exists = await categories.findOne({
        $or: [{ code: category.code }, { name: category.name }]
      });
      if (!exists) await categories.insertOne({ ...category, createdAt: new Date() });
    }

    console.log(`Seed complete: ${DB_NAME}`);
  } finally {
    await client.close();
  }
}

seed().catch((error) => {
  console.error('Database seeding failed:', error);
  process.exitCode = 1;
});
