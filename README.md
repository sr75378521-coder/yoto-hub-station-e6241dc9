# Yoto Hub

Prompt

You are an expert senior full-stack engineer. Build a production-quality web application called Yoto Control Center based on the existing GitHub repository:

https://github.com/earchibald/yoto-smart-stream

Use it as the starting point rather than rewriting the Yoto integration from scratch. Refactor and improve the code where appropriate while preserving existing functionality.

Goal

Create a modern web dashboard that allows me to manage my entire Yoto account from a browser.

The application should support:

 Viewing all Yoto players

 Controlling every player

 Viewing my family

 Viewing every playlist

 Editing MYO playlists

 Creating playlists

 Uploading audio

 Downloading backups where supported

 Managing MYO cards

 Real-time player updates

 Responsive mobile interface

 Dark mode

 Secure authentication

Tech Stack

Use:

 Next.js 15 (App Router)

 React

 TypeScript

 Tailwind CSS

 shadcn/ui

 TanStack Query

 Prisma

 PostgreSQL (SQLite for development is acceptable)

 Zod

 React Hook Form

 MQTT for live player updates

 Docker support

 Vercel deployment support

Do not use JavaScript. Everything should be TypeScript.

Authentication

Implement secure Yoto OAuth.

Never expose the Client Secret to the browser.

Use server-side environment variables.

Store access tokens securely.

Automatically refresh expired tokens.

Support multiple accounts in the future.

Dashboard

Create a homepage displaying:

All Yoto players

Each player card should show:

 name

 room

 online/offline

 battery percentage

 charging status

 Wi-Fi strength

 firmware version

 current volume

 currently playing

 elapsed time

 remaining time

 card inserted

 playlist artwork

Display recently played content.

Display quick actions.

Player Controls

Each player should support:

Play

Pause

Stop

Next

Previous

Seek

Volume slider

Mute

Sleep timer

Shuffle

Repeat

Play a selected playlist

Resume playback

Refresh status

Real-time MQTT updates

Family

Display every family member.

Show:

 profile

 assigned players

 favorite playlists

 recently played

 permissions

Playlist Manager

Show every MYO playlist.

Support:

Create playlist

Rename playlist

Delete playlist

Duplicate playlist

Search playlists

Filter playlists

Sort playlists

Drag-and-drop chapter ordering

Drag-and-drop track ordering

Edit chapter names

Edit artwork

Upload MP3

Upload M4A

Upload WAV

Replace tracks

Delete tracks

Reorder tracks

Preview tracks

Display duration

Display file size

Display artwork

Library

Display:

MYO cards

Purchased cards (where supported)

Favorites

Recently added

Downloaded items

Artwork gallery

Downloads

Implement backup functionality.

Where the Yoto API permits:

Export playlist metadata

Export artwork

Export playlist JSON

Restore playlist backups

Generate ZIP backups

Do not attempt to bypass licensing restrictions for commercial content.

Search

Implement global search across:

Players

Playlists

Tracks

Cards

Family members

Settings

Settings page including:

Theme

Notifications

API status

Connected account

Logout

Developer tools

Environment diagnostics

UI

Create a polished interface inspired by:

 Linear

 Vercel Dashboard

 Spotify Web Player

 Apple Music

 GitHub

Requirements:

Rounded cards

Smooth animations

Responsive layout

Dark mode

Light mode

Sidebar navigation

Command palette

Keyboard shortcuts

Toast notifications

Loading skeletons

Empty states

Error boundaries

Components

Create reusable components:

PlayerCard

PlaylistCard

VolumeSlider

TrackEditor

UploadDialog

SearchBar

Sidebar

Navbar

ThemeSwitcher

SettingsDialog

ConfirmationDialog

ArtworkUploader

BatteryIndicator

PlaybackControls

NowPlaying

FamilyCard

API

Create a clean API layer.

Separate:

Authentication

Players

Playlists

Family

Downloads

MQTT

Settings

Use server actions where appropriate.

Database

Use Prisma.

Create models for:

Users

Accounts

Tokens

Playlists

PlaylistBackups

Settings

Favorites

RecentItems

Error Handling

Handle:

Expired tokens

Offline players

Network failures

API failures

MQTT disconnects

File upload failures

Permission errors

Gracefully display user-friendly messages.

Performance

Implement:

Code splitting

Lazy loading

Image optimization

Caching

Optimistic UI updates

Streaming

Suspense

Server Components

Security

Never expose secrets.

Validate all inputs with Zod.

Protect API routes.

Use secure cookies.

Sanitize uploaded filenames.

Implement CSRF protection where appropriate.

Testing

Include:

Unit tests

Component tests

API tests

Type checking

ESLint

Prettier

Documentation

Generate:

README.md

Installation guide

Environment variable documentation

Deployment guide

Docker instructions

Architecture overview

API documentation

Deliverables

Produce a complete production-ready project with:

 Full source code

 No placeholders or "TODO" sections

 Fully typed TypeScript

 Clean folder structure

 Comments where helpful

 Docker support

 Vercel deployment support

 GitHub Actions for linting and type checking

 Example .env.example

If an API capability is unavailable or restricted by the official Yoto platform (for example, downloading commercial audio), implement the closest supported behavior and document the limitation rather than attempting to work around it.

Before adding any feature, review the existing yoto-smart-stream codebase and reuse or refactor existing functionality whenever possible instead of duplicating it. The goal is a maintainable, production-quality application.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://yoto-hub-station.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/65272925-719d-4f89-ab58-d897d4f056e0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
