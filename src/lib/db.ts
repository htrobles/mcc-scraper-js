import { Db, MongoClient } from 'mongodb';

let db: Db;

async function connectToDatabase() {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri);
  await client.connect();
  db = client.db('mcc-scraper');
}

export { connectToDatabase, db };
