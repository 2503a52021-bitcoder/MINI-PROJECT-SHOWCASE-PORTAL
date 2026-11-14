# MINI-PROJECT-SHOWCASE-PORTAL

## Deploy to Vercel

1. Create a MongoDB Atlas database named `mini_project_showcase`. Vercel cannot connect to the MongoDB service on your computer.
2. Before deploying, seed the hosted database from PowerShell:

   ```powershell
   cd backend
   $env:MONGODB_URI = "mongodb+srv://<user>:<password>@<cluster>/<database>?retryWrites=true&w=majority"
   npm run seed
   ```

   The seed command adds missing demo users, collections, and categories; it does not delete or overwrite existing records.
3. Import the repository into Vercel with the repository root as the project root. `vercel.json` builds the frontend and routes `/api/*` to the Express serverless function.
4. Add these Vercel environment variables for Production (and Preview if needed):
   - `MONGODB_URI`: the Atlas connection URI (never the local `127.0.0.1` URI)
   - `JWT_SECRET`: a unique, long random secret
   - `DB_NAME` (optional): defaults to `mini_project_showcase`
5. Deploy. Vercel displays the public `https://<deployment>.vercel.app` URL. The frontend calls the API on that same domain.

Demo accounts after seeding:

- Student: `rahul@student.edu` / `password123`
- Faculty: `sharma@faculty.edu` / `faculty123`

Uploaded screenshots use Vercel's temporary `/tmp` storage and are not durable across serverless instances. Use persistent object storage for production uploads.