# Form Builder

A drag-and-drop form builder: admins design forms on a free-form canvas, staff
fill them out, and responses export to Excel or sync live to Google Sheets.

## Stack

- **client**: React + Vite + TypeScript + Tailwind CSS
- **server**: Express + Prisma (SQLite) + TypeScript

## Getting started

```bash
npm install --prefix server
npm install --prefix client
cp server/.env.example server/.env
npx prisma db push --schema server/prisma/schema.prisma
npm run seed
npm run dev
```

Client runs on http://localhost:5174, API on http://localhost:4001 (proxied
through `/api`).

Demo accounts (password `password123` for both): `admin@forms.test` (builds
forms, views responses) and `staff@forms.test` (fills out published forms).

## Google Sheets sync (optional)

Excel export always works. Live Google Sheets sync additionally needs an
OAuth 2.0 Client ID from [Google Cloud Console](https://console.cloud.google.com/):

1. Create an OAuth 2.0 Client ID (type: Web application).
2. Enable the **Google Sheets API** for the project.
3. Add `http://localhost:4001/api/sheets/oauth/callback` as an authorized
   redirect URI (or your deployed server's equivalent).
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`
   in `server/.env`.

Until those are set, the responses page shows a "not configured" notice
instead of the connect button.
