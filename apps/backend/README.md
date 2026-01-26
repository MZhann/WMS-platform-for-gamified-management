# WMS Backend API

Express.js backend with MongoDB and JWT authentication.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Update the values:
     ```
     PORT=3001
     MONGODB_URI=mongodb://localhost:27017/wms-platform
     JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
     NODE_ENV=development
     ```

3. Make sure MongoDB is running:
   - Install MongoDB locally, or
   - Use MongoDB Atlas (cloud) and update `MONGODB_URI`

4. Run the development server:
```bash
npm run dev
```

The server will start on `http://localhost:3001`

## API Endpoints

### Authentication

#### POST `/api/auth/register`
Register a new user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### POST `/api/auth/login`
Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### GET `/api/auth/me`
Get current user information (requires authentication).

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### Health Check

#### GET `/health`
Check if the server is running.

**Response:**
```json
{
  "status": "ok",
  "message": "Server is running"
}
```

## Features

- ✅ User registration with email, password, and name
- ✅ User login with JWT token generation
- ✅ Password hashing with bcrypt
- ✅ MongoDB integration with Mongoose
- ✅ JWT authentication middleware
- ✅ TypeScript support
- ✅ Error handling
- ✅ CORS enabled

## Project Structure

```
src/
  ├── config/
  │   └── database.ts      # MongoDB connection
  ├── models/
  │   └── User.ts          # User model with Mongoose
  ├── middleware/
  │   └── auth.ts          # JWT authentication middleware
  ├── routes/
  │   └── auth.ts          # Authentication routes
  └── index.ts             # Main server file
```
