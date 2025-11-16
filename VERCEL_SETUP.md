# Vercel Setup Instructions

## Environment Variables

To deploy this project on Vercel, you need to set the `GITHUB_TOKEN` environment variable:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add a new environment variable:
   - **Name**: `GITHUB_TOKEN`
   - **Value**: Your GitHub Personal Access Token (with `repo` scope)
   - **Environment**: Production, Preview, Development (select all)

## GitHub Token Setup

1. Go to https://github.com/settings/tokens
2. Click **Generate new token** → **Generate new token (classic)**
3. Give it a name (e.g., "GeoCesko Rekordy Admin")
4. Select scope: **repo** (Full control of private repositories)
5. Click **Generate token**
6. Copy the token and paste it into Vercel's Environment Variables

## Build Process

The build process (`npm run inject-token`) automatically injects the token from environment variables into `index.html` during deployment.

## Local Development

For local development, create a `.env` file in the project root:

```
GITHUB_TOKEN=your_token_here
```

The `.env` file is already in `.gitignore`, so it won't be committed to the repository.

