const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');

const TOKEN_PATH = path.join(__dirname, '..', 'token.json');

/**
 * Gets a configured OAuth2 client.
 */
function getOAuth2Client() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error('Missing Google OAuth credentials in .env');
  }
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

/**
 * Starts a local HTTP server to capture the OAuth2 callback code automatically.
 * Opens the auth URL in the browser, waits for Google to redirect back.
 */
async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar'
    ],
  });

  console.log('\n========================================');
  console.log('Opening browser for Google authorization...');
  console.log('If browser does not open, visit this URL:');
  console.log(authUrl);
  console.log('========================================\n');

  // Try to open the browser automatically
  const { exec } = require('child_process');
  exec(`start "" "${authUrl}"`);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost:3000');
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h2>Authorization failed: ' + error + '</h2><p>You can close this tab.</p>');
          server.close();
          reject(new Error('OAuth authorization denied: ' + error));
          return;
        }

        if (!code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h2>Waiting for authorization...</h2>');
          return;
        }

        // Got the code — exchange for tokens
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('✅ Authorization successful! Token saved.');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family:sans-serif;text-align:center;padding:60px;background:#f0fdf4">
              <h1 style="color:#16a34a">✅ Authorization Successful!</h1>
              <p style="font-size:18px">The AI Meeting Agent is now connected to your Google account.</p>
              <p>You can close this tab and return to the terminal.</p>
            </body>
          </html>
        `);

        server.close();
        resolve(oAuth2Client);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h2>Error: ' + err.message + '</h2>');
        server.close();
        reject(err);
      }
    });

    server.listen(3000, () => {
      console.log('Waiting for Google authorization on http://localhost:3000 ...');
    });

    server.on('error', (err) => {
      reject(new Error('Could not start local server on port 3000: ' + err.message));
    });
  });
}

/**
 * Authenticates and returns the OAuth2 client.
 * Uses saved token if available, otherwise prompts for authorization.
 */
async function authenticate() {
  const oAuth2Client = getOAuth2Client();

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    oAuth2Client.setCredentials(token);

    // Auto-refresh token if expired
    oAuth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
        const updated = { ...existing, ...tokens };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated));
        console.log('🔄 Token refreshed and saved.');
      }
    });

    return oAuth2Client;
  } else {
    return await getNewToken(oAuth2Client);
  }
}

module.exports = { authenticate };
