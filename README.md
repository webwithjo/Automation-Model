# AI Email & Meeting Scheduling Automation Agent

An autonomous AI agent that connects with **Gmail**, **Google Calendar**, and **Google Gemini AI** to automatically read, analyze, and reply to incoming emails, check real-time calendar availability, and manage meeting responses.

---

## 🚀 Features

- 🤖 **Smart Gemini AI Integration**: Classifies incoming emails into meeting requests, casual conversation, questions, or automated spam.
- 📅 **Google Calendar Integration**: Dynamically queries Google Calendar free/busy availability to prevent scheduling conflicts.
- ✉️ **Automated Gmail Actions**:
  - Automatically detects unread emails in the inbox.
  - Sends context-aware, customized replies.
  - Marks processed messages as read.
- 🛡️ **Self-Loop & Spam Protection**: Safely ignores self-sent emails and marketing newsletters/bots to prevent loops and conserve API quotas.
- ⚡ **Near Real-Time Polling**: Runs in the background polling every 15 seconds.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **LLM**: Google Gemini (`@google/genai`)
- **APIs**: Google Workspace APIs (`googleapis` - Gmail API v1, Google Calendar API v3)
- **Authentication**: OAuth 2.0 with local redirect server

---

## ⚙️ Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/webwithjo/Automation-Model.git
cd Automation-Model/backend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the `backend/` directory with:
```env
# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback

# Gemini API Key
GEMINI_API_KEY=your_gemini_api_key

# Settings
TIMEZONE=Asia/Kolkata
DEFAULT_MEETING_DURATION_MINUTES=30
```

### 4. Run the Agent
```bash
npm start
```
On first run, a browser window will prompt you to authorize access to your Google account (Gmail and Calendar).

---

## 👤 Author
- **Joyal** ([@webwithjo](https://github.com/webwithjo))
