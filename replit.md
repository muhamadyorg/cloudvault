# CloudVault - Personal Cloud Storage

## Overview
A self-hosted personal cloud storage platform (like Nextcloud) with admin/user roles, file/folder management, upload approval system, and a clean Windows-like interface.

## Architecture
- **Frontend**: React + TypeScript with Vite, TanStack Query, wouter routing, shadcn/ui components
- **Backend**: Express.js with session-based auth (passport-local), multer for file uploads
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: bcryptjs password hashing, express-session with connect-pg-simple

## User Roles
- **Admin** (muhamadyorg / 1234): Full access - upload, create folders, rename, move, delete, manage privacy, approve/reject upload requests, view settings
- **User** (user / user123): Can browse and download files, can request uploads (admin approves/rejects)

## Key Features
- Dark mode with theme toggle (sun/moon icon in sidebar header)
- File upload with drag & drop and progress tracking (no size limits)
- Folder creation with nested navigation
- 3 view modes: list, grid, large grid (with image/video thumbnails in both grid modes)
- Fullscreen file preview with arrow navigation (< >) between files, F key for fullscreen toggle
- Right-click context menu on files/folders + long-press on mobile + 3-dot dropdown menu
- File preview: click image to close, X button to close, Escape key to close
- File info (name, size, date) shown at bottom of preview
- Images/videos constrained within preview container (object-contain)
- Copy/Cut/Paste for files and folders (admin)
- Private files/folders (admin only visibility)
- Upload request system for users
- Profile page with username and password management
- Settings page with storage usage info
- Breadcrumb navigation
- Alphabetical sorting

## Project Structure
```
shared/schema.ts          - Database schema (users, files, folders, uploadRequests)
server/db.ts              - PostgreSQL connection
server/auth.ts            - Passport auth setup, requireAuth/requireAdmin middleware
server/storage.ts         - DatabaseStorage class with all CRUD operations
server/routes.ts          - API endpoints
server/seed.ts            - Seeds admin and user accounts
client/src/App.tsx         - Main app with auth provider, theme provider, routing
client/src/lib/auth.tsx    - Auth context provider
client/src/components/theme-provider.tsx - Dark/light mode theme provider
client/src/components/app-sidebar.tsx - Navigation sidebar with theme toggle
client/src/components/file-browser.tsx - Main file browser with preview, context menu
client/src/components/file-icon.tsx - File type icons
client/src/components/upload-zone.tsx - Upload with drag & drop
client/src/pages/dashboard.tsx - Dashboard page
client/src/pages/login.tsx - Login page
client/src/pages/profile.tsx - Profile management (username + password change)
client/src/pages/upload-requests.tsx - Admin upload request management
client/src/pages/settings.tsx - Storage and system settings
```

## File Storage
- Files stored in `uploads/` directory
- Temp upload requests stored in `uploads/temp/`
- No file size limits

## API Routes
- POST /api/auth/login, /api/auth/logout, GET /api/auth/me, PUT /api/auth/profile
- GET /api/folders, /api/folders/:id, /api/folders/:id/stats, /api/folders/:id/breadcrumb
- POST /api/folders, PUT /api/folders/:id/rename, /api/folders/:id/move, /api/folders/:id/privacy
- DELETE /api/folders/:id
- GET /api/files, POST /api/files/upload, /api/files/request-upload
- GET /api/files/:id/download, /api/files/:id/preview
- PUT /api/files/:id/rename, /api/files/:id/move, /api/files/:id/privacy
- POST /api/files/:id/copy
- DELETE /api/files/:id
- GET /api/upload-requests, POST /api/upload-requests/:id/approve, /api/upload-requests/:id/reject
- GET /api/storage/usage
